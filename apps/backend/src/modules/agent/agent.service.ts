import axios from 'axios';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { SYSTEM_PROMPT_LEAD_QUALIFICATION, PROMPT_VERSION } from './prompts/lead-qualification.js';
import {
  LeadQualificationOutput,
  LeadQualificationOutputSchema,
} from './schemas/lead-qualification.schema.js';
import { prisma } from '../../plugins/prisma.js';
import { catalogService } from '../catalog/catalog.service.js';

export class AgentService {
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;

  /**
   * Cache du prompt actif pour éviter de requêter la DB à chaque message.
   * Invalidé manuellement via invalidatePromptCache() ou automatiquement toutes les 60s.
   */
  private cachedPrompt: {
    id?: string | null;
    prompt: string;
    version: string;
    name: string;
    slug?: string | null;
    campaign?: string | null;
    updatedAt?: Date | null;
  } | null = null;
  private promptCacheTimestamp: number = 0;
  private promptSwitchCutoffMs: number = 0;
  private static PROMPT_CACHE_TTL_MS = 10_000; // 10 secondes

  constructor() {
    this.reinitClients();
  }

  private reinitClients(): void {
    this.openaiClient = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
    this.anthropicClient = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  }

  /**
   * Met à jour à chaud la configuration IA (clé Gemini, modèle, fournisseur) sans redémarrer le serveur.
   */
  public updateAiConfig(config: {
    aiProvider?: 'gemini' | 'openai' | 'anthropic';
    geminiApiKey?: string;
    geminiModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    anthropicApiKey?: string;
    anthropicModel?: string;
  }): void {
    if (config.aiProvider) env.AI_PROVIDER = config.aiProvider;
    if (config.geminiApiKey !== undefined) env.GEMINI_API_KEY = config.geminiApiKey.trim();
    if (config.geminiModel) env.GEMINI_MODEL = config.geminiModel.trim();
    if (config.openaiApiKey !== undefined) env.OPENAI_API_KEY = config.openaiApiKey.trim();
    if (config.openaiModel) env.OPENAI_MODEL = config.openaiModel.trim();
    if (config.anthropicApiKey !== undefined) env.ANTHROPIC_API_KEY = config.anthropicApiKey.trim();
    if (config.anthropicModel) env.ANTHROPIC_MODEL = config.anthropicModel.trim();
    this.reinitClients();
  }

  /**
   * Charge au démarrage la configuration IA sauvegardée en base de données (table AppSetting).
   */
  public async loadPersistedAiConfig(): Promise<void> {
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: 'ai_config' } });
      if (row && row.value && typeof row.value === 'object') {
        const val = row.value as Record<string, any>;
        this.updateAiConfig({
          aiProvider: val.aiProvider || undefined,
          geminiApiKey: typeof val.geminiApiKey === 'string' && val.geminiApiKey.trim() ? val.geminiApiKey : undefined,
          geminiModel: typeof val.geminiModel === 'string' && val.geminiModel.trim() ? val.geminiModel : undefined,
          openaiApiKey: typeof val.openaiApiKey === 'string' && val.openaiApiKey.trim() ? val.openaiApiKey : undefined,
          openaiModel: typeof val.openaiModel === 'string' && val.openaiModel.trim() ? val.openaiModel : undefined,
          anthropicApiKey: typeof val.anthropicApiKey === 'string' && val.anthropicApiKey.trim() ? val.anthropicApiKey : undefined,
          anthropicModel: typeof val.anthropicModel === 'string' && val.anthropicModel.trim() ? val.anthropicModel : undefined,
        });
        console.log(`✓ [AgentService] Configuration IA chargée depuis la base de données (provider: ${env.AI_PROVIDER}, modèle Gemini: ${env.GEMINI_MODEL})`);
      }
    } catch (err: any) {
      console.warn('[AgentService] Impossible de charger ai_config depuis la base:', err?.message || err);
    }
  }

  /**
   * Teste en direct une clé API Google Gemini avec bascule de modèles si nécessaire.
   */
  public async testGeminiConnection(apiKeyOverride?: string, modelOverride?: string): Promise<{
    ok: boolean;
    model?: string;
    latencyMs: number;
    reply?: string;
    error?: string;
  }> {
    const start = Date.now();
    const apiKey = (apiKeyOverride && apiKeyOverride.trim() ? apiKeyOverride.trim() : env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'Aucune clé API Gemini fournie.' };
    }

    const modelsToTry = Array.from(
      new Set(
        [
          modelOverride?.trim(),
          env.GEMINI_MODEL,
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-flash-latest',
          'gemini-2.5-flash-lite',
        ].filter(Boolean) as string[]
      )
    );

    let lastErr = 'Erreur inconnue';
    for (const model of modelsToTry) {
      try {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            contents: [{ role: 'user', parts: [{ text: 'Réponds uniquement : Connexion Gemini OK 🇨🇲' }] }],
            generationConfig: { maxOutputTokens: 30, temperature: 0.1 },
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 12000 }
        );
        const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          return {
            ok: true,
            model,
            latencyMs: Date.now() - start,
            reply: text,
          };
        }
      } catch (err: any) {
        const status = err.response?.status;
        const apiMessage = err.response?.data?.error?.message || err.message;
        lastErr = status ? `HTTP ${status} — ${apiMessage}` : apiMessage;
        // Si la clé est invalide (400 API_KEY_INVALID ou 403), inutile d'essayer d'autres modèles
        if (status === 400 || status === 401 || status === 403) {
          break;
        }
      }
    }

    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: lastErr,
    };
  }

  /**
   * Invalide le cache du prompt actif et enregistre l'horodatage de bascule
   * pour empêcher les réponses générées par un ancien prompt désactivé de polluer le contexte.
   */
  public invalidatePromptCache(markSwitch = true): void {
    this.cachedPrompt = null;
    this.promptCacheTimestamp = 0;
    if (markSwitch) {
      this.promptSwitchCutoffMs = Date.now();
    }
    console.log('[AgentService] Cache prompt invalidé');
  }

  public getPromptSwitchCutoffMs(): number {
    return this.promptSwitchCutoffMs;
  }

  /**
   * Charge le prompt système actif depuis la base de données.
   * Utilise un cache court (10s) et invalidation immédiate lors d'une modification admin.
   * Fallback: prompt hardcodé dans lead-qualification.ts
   */
  public async getActivePrompt(): Promise<{
    id?: string | null;
    prompt: string;
    version: string;
    name: string;
    slug?: string | null;
    campaign?: string | null;
    updatedAt?: Date | null;
  }> {
    const now = Date.now();
    if (this.cachedPrompt && now - this.promptCacheTimestamp < AgentService.PROMPT_CACHE_TTL_MS) {
      return this.cachedPrompt;
    }

    try {
      const activeTemplate = await prisma.promptTemplate.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (activeTemplate) {
        if (this.cachedPrompt?.id && this.cachedPrompt.id !== activeTemplate.id) {
          this.promptSwitchCutoffMs = Math.max(this.promptSwitchCutoffMs, activeTemplate.updatedAt.getTime());
        }
        this.cachedPrompt = {
          id: activeTemplate.id,
          prompt: activeTemplate.prompt,
          version: activeTemplate.version,
          name: activeTemplate.name,
          slug: activeTemplate.slug,
          campaign: activeTemplate.campaign,
          updatedAt: activeTemplate.updatedAt,
        };
        this.promptCacheTimestamp = now;
        return this.cachedPrompt;
      }
    } catch (err: any) {
      console.warn('[AgentService] Erreur chargement prompt depuis DB, utilisation du fallback:', err.message);
    }

    // Fallback: prompt hardcodé
    const fallback = {
      id: null,
      prompt: SYSTEM_PROMPT_LEAD_QUALIFICATION,
      version: PROMPT_VERSION,
      name: 'Prompt par défaut (hardcodé)',
      slug: 'default-hardcoded',
      campaign: null,
      updatedAt: null,
    };
    this.cachedPrompt = fallback;
    this.promptCacheTimestamp = now;
    return fallback;
  }

  public getPromptVersion() {
    // Version synchrone pour la compatibilité existante, retourne le cache ou le hardcodé
    if (this.cachedPrompt) {
      return {
        version: this.cachedPrompt.version,
        prompt: this.cachedPrompt.prompt,
        name: this.cachedPrompt.name,
      };
    }
    return {
      version: PROMPT_VERSION,
      prompt: SYSTEM_PROMPT_LEAD_QUALIFICATION,
      name: 'Prompt par défaut (hardcodé)',
    };
  }

  public async qualifyMessage(params: {
    inboundText: string;
    senderPhone: string;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    existingLeadData?: any;
  }): Promise<LeadQualificationOutput> {
    const { inboundText, conversationHistory, existingLeadData } = params;

    // Précharger systématiquement le prompt actif depuis la DB pour que même le secours l'utilise
    await this.getActivePrompt().catch(() => undefined);

    // 1. Tenter via Google Gemini si configuré (soit explicitement, soit si aucun client OpenAI/Anthropic)
    if (env.GEMINI_API_KEY && (env.AI_PROVIDER === 'gemini' || (!this.openaiClient && !this.anthropicClient))) {
      try {
        console.log(`[AgentService] Appel du moteur Google Gemini (${env.GEMINI_MODEL || 'gemini-flash-latest'})...`);
        return await this.callGemini(inboundText, conversationHistory, existingLeadData);
      } catch (err: any) {
        console.error('[AgentService] Erreur Google Gemini:', err?.message || err);
      }
    }

    // 2. Tenter via OpenAI si configuré
    if (this.openaiClient && (env.AI_PROVIDER === 'openai' || (!this.anthropicClient && !env.GEMINI_API_KEY) || env.AI_PROVIDER === 'gemini')) {
      try {
        console.log(`[AgentService] Appel du modèle OpenAI (${env.OPENAI_MODEL || 'gpt-4o-mini'})...`);
        return await this.callOpenAI(inboundText, conversationHistory, existingLeadData);
      } catch (err: any) {
        console.error('[AgentService] Erreur OpenAI:', err?.message || err);
      }
    }

    // 3. Tenter via Anthropic Claude si configuré
    if (this.anthropicClient) {
      try {
        console.log('[AgentService] Appel du modèle Anthropic Claude...');
        return await this.callAnthropic(inboundText, conversationHistory, existingLeadData);
      } catch (err: any) {
        console.error('[AgentService] Erreur Anthropic Claude:', err?.status || '', err?.message || err);
      }
    }

    // 4. Secours Gemini si OpenAI ou Anthropic était configuré par défaut mais a échoué
    if (env.GEMINI_API_KEY && env.AI_PROVIDER !== 'gemini') {
      try {
        console.log(`[AgentService] Appel de secours Google Gemini (${env.GEMINI_MODEL || 'gemini-flash-latest'})...`);
        return await this.callGemini(inboundText, conversationHistory, existingLeadData);
      } catch (err: any) {
        console.error('[AgentService] Erreur Google Gemini secours:', err?.message || err);
      }
    }

    // 5. Secours OpenAI si Anthropic était le mode par défaut mais a échoué
    if (this.openaiClient && env.AI_PROVIDER !== 'openai') {
      try {
        console.log(`[AgentService] Appel de secours OpenAI (${env.OPENAI_MODEL || 'gpt-4o-mini'})...`);
        return await this.callOpenAI(inboundText, conversationHistory, existingLeadData);
      } catch (err: any) {
        console.error('[AgentService] Erreur OpenAI secours:', err?.message || err);
      }
    }

    // 6. Moteur heuristique intelligent de secours (garantit une réponse de haute qualité sans blocage)
    console.warn('[AgentService] Utilisation du moteur heuristique conversationnel ICT (APIs externes injoignables)');
    return this.mockQualifyMessage(inboundText, conversationHistory, existingLeadData);
  }

  /**
   * Intégration officielle de Google Gemini avec bascule multi-modèles dynamique en cas de pic de charge 503.
   */
  public async callGemini(
    inboundText: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    existingLeadData?: any
  ): Promise<LeadQualificationOutput> {
    if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY non configurée');

    // Charger le prompt actif depuis la DB (avec cache)
    const activePrompt = await this.getActivePrompt();
    const systemPrompt = this.buildSystemPromptWithSchema(
      activePrompt.prompt,
      existingLeadData,
      activePrompt.campaign || existingLeadData?.campaign,
      activePrompt.slug,
      activePrompt.name
    );

    // Filtrer l'historique pour éviter les doublons avec le message entrant
    const filteredHistory = [...history];
    if (
      filteredHistory.length > 0 &&
      filteredHistory[filteredHistory.length - 1].role === 'user' &&
      filteredHistory[filteredHistory.length - 1].content.trim() === inboundText.trim()
    ) {
      filteredHistory.pop();
    }

    // Formater l'historique pour l'API Gemini ('user' et 'model') avec alternance stricte
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const h of filteredHistory) {
      if (!h.content || !h.content.trim()) continue;
      const role = h.role === 'user' ? 'user' : 'model';
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += '\n' + h.content;
      } else {
        contents.push({ role, parts: [{ text: h.content }] });
      }
    }

    // Ajouter le message entrant
    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents[contents.length - 1].parts[0].text += '\n' + inboundText;
    } else {
      contents.push({ role: 'user', parts: [{ text: inboundText }] });
    }

    // Gemini exige impérativement que le premier message soit 'user'
    if (contents.length > 0 && contents[0].role !== 'user') {
      contents.shift();
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: inboundText }] });
    }

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    };

    // Modèles candidats ordonnés avec bascule automatique
    const candidateModels = Array.from(
      new Set(
        [
          env.GEMINI_MODEL,
          'gemini-flash-latest',
          'gemini-flash-lite-latest',
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-2.0-flash',
          'gemini-2.0-flash-lite',
        ].filter(Boolean) as string[]
      )
    );

    let rawText: string | null = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        console.log(`[AgentService] Tentative Gemini avec modèle: ${model}...`);
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
          payload,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000,
          }
        );

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          console.log(`✓ [AgentService] Réponse Gemini générée avec succès via ${model} !`);
          rawText = text;
          break;
        }
      } catch (err: any) {
        lastError = err;
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.message;
        console.warn(`[AgentService] Modèle Gemini ${model} indisponible (HTTP ${status || 'ERR'}: ${msg?.slice(0, 80)}...). Essai modèle suivant...`);
      }
    }

    if (!rawText) {
      console.error('[AgentService] Tous les modèles Gemini ont échoué:', lastError?.response?.data || lastError?.message);
      throw lastError || new Error('Tous les modèles Gemini ont échoué');
    }

    return this.parseModelOutput(rawText);
  }

  /**
   * Parse résilient de la sortie JSON d'un LLM (Gemini / Claude / OpenAI).
   * Évite qu'un retour JSON mal échappé ou en texte brut ne déclenche par erreur le fallback heuristique.
   */
  private parseModelOutput(rawText: string): LeadQualificationOutput {
    let jsonStr = rawText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1] || jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);
      this.normalizeOutputKeys(parsed);
      return LeadQualificationOutputSchema.parse(parsed);
    } catch {
      // Tentative 2 : extraction directe du champ whatsapp_message si des retours à la ligne non échappés ont cassé JSON.parse
      const msgMatch = jsonStr.match(/"whatsapp_message"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
      if (msgMatch?.[1]) {
        const cleanMsg = msgMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        return LeadQualificationOutputSchema.parse({ whatsapp_message: cleanMsg });
      }
      // Tentative 3 : le modèle a répondu directement en texte brut (sans JSON)
      const plainText = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      if (plainText && !plainText.startsWith('{')) {
        return LeadQualificationOutputSchema.parse({ whatsapp_message: plainText });
      }
      throw new Error('Impossible de parser la réponse du modèle IA');
    }
  }

  private async callOpenAI(
    inboundText: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    existingLeadData?: any
  ): Promise<LeadQualificationOutput> {
    if (!this.openaiClient) throw new Error('OpenAI non configuré');

    // Charger le prompt actif depuis la DB (avec cache)
    const activePrompt = await this.getActivePrompt();

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.buildSystemPromptWithSchema(
          activePrompt.prompt,
          existingLeadData,
          activePrompt.campaign || existingLeadData?.campaign,
          activePrompt.slug,
          activePrompt.name
        ),
      },
      ...history.map((h) => ({
        role: h.role,
        content: h.content,
      })),
      {
        role: 'user',
        content: inboundText,
      },
    ];

    const response = await this.openaiClient.chat.completions.create({
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Réponse OpenAI vide');

    const parsed = JSON.parse(content);
    this.normalizeOutputKeys(parsed);
    return LeadQualificationOutputSchema.parse(parsed);
  }

  private buildSystemPromptWithSchema(
    basePrompt: string,
    existingLeadData?: any,
    campaignSlug?: string | null,
    promptSlug?: string | null,
    promptName?: string | null
  ): string {
    // Injection dynamique uniquement des catalogues compatibles avec le prompt actif
    const dynamicCatalogContext = catalogService.generatePromptContext(
      campaignSlug,
      promptSlug,
      basePrompt
    );

    // Extraction épurée des données pertinentes du lead (sans métadonnées internes)
    const isLidAccount = existingLeadData?.phone?.includes('@lid') && !existingLeadData?.realPhone;
    const sanitizedLeadData = existingLeadData
      ? {
          firstName: existingLeadData.firstName || undefined,
          lastName: existingLeadData.lastName || undefined,
          customerType: existingLeadData.customerType || undefined,
          conversationStage: existingLeadData.conversationStage || undefined,
          intent: existingLeadData.intent || undefined,
          need: existingLeadData.need || undefined,
          recommendedOffer: existingLeadData.recommendedOffer || undefined,
          quotedPrice: existingLeadData.quotedPrice || undefined,
          estimatedAmount: existingLeadData.estimatedAmount || undefined,
          preferredDate: existingLeadData.preferredDate || undefined,
          participantsCount: existingLeadData.participantsCount || undefined,
          budget: existingLeadData.budget || undefined,
          isLidAccount: isLidAccount || undefined,
          realPhone: existingLeadData.realPhone || undefined,
        }
      : {};

    return `══════════════════════════════════════════════════════════════
PROMPT SYSTÈME ACTIF : "${promptName || 'Prompt Principal'}"
RÈGLE D'ISOLATION STRICTE DES PROMPTS :
- Tu dois obéir EXCLUSIVEMENT aux consignes, tarifs et offres définis dans CE prompt actif ci-dessous.
- Si l'historique des messages précédents ou les données antérieures du prospect mentionnent d'anciennes offres, d'anciens tarifs ou un ancien comportement provenant d'un prompt désormais DÉSACTIVÉ, tu dois les IGNORER totalement et appliquer uniquement les instructions du présent prompt actif.
══════════════════════════════════════════════════════════════

${basePrompt}

══════════════════════════════════════════════════════════════
${dynamicCatalogContext}
══════════════════════════════════════════════════════════════

══════════════════════════════════════════════════════════════
RÈGLE ABSOLUE ANTI-BLOCAGE ET CHANGEMENT DE SUJET (TOPIC SWITCH) :
- Le dernier message envoyé par le prospect prévaut TOUJOURS sur les messages antérieurs ou les offres précédentes.
- Si le prospect mentionne une nouvelle destination, un nouveau lieu ou exprime un souhait différent :
  1. Bascule IMMÉDIATEMENT sur la nouvelle demande sans hésitation.
  2. Abandonne et oublie immédiatement l'ancienne destination (écrase impérativement "recommended_offer" avec la nouvelle offre).
  3. Ne fais JAMAIS référence à l'ancien sujet et ne mélange jamais deux offres divergentes dans ta réponse, sauf si le client le redemande explicitement.
══════════════════════════════════════════════════════════════

Données actuelles connues sur ce prospect (session en cours) :
${JSON.stringify(sanitizedLeadData, null, 2)}

RÈGLES D'EXTRACTION DES CRITÈRES COMMERCIAUX (utilisées par l'équipe de closing) :
- "recommended_offer" : nom exact de l'offre / formule choisie ou recommandée.
- "quoted_price" : UNIQUEMENT le prix que tu as effectivement communiqué au prospect (ou qu'il a cité comme tarif de l'offre), avec unité (ex: "75 000 FCFA / pers"). null si aucun prix n'a été annoncé. N'invente JAMAIS de prix.
- "estimated_amount" : montant total estimé en FCFA (nombre entier, sans texte) = prix unitaire × participants si les deux sont connus avec certitude, sinon null.
- "participants_count" et "preferred_date" : conserver les valeurs déjà connues tant que le prospect ne les modifie pas.
- "first_name" / "last_name" : NE JAMAIS inventer. Ne remplir que si le prospect donne son nom.

INSTRUCTION CRUCIALE DE FORMAT DE SORTIE :
Tu dois impérativement renvoyer UNIQUEMENT un objet JSON valide (sans aucun texte d'introduction ni de conclusion).
Le champ contenant le message WhatsApp destiné au client DOIT OBLIGATOIREMENT s'appeler "whatsapp_message".

Structure JSON exacte requise :
{
  "whatsapp_message": "Texte exact du message WhatsApp à envoyer au client (chaleureux, courtois, 1 question max)",
  "conversation_stage": "NEW_CONTACT",
  "intent": "Decouverte",
  "customer_type": "Particulier",
  "need": null,
  "participants_count": null,
  "preferred_date": null,
  "budget": null,
  "recommended_offer": null,
  "quoted_price": null,
  "estimated_amount": null,
  "product_identified": false,
  "purchase_intent": "information",
  "availability_confirmed": false,
  "product_standard": false,
  "custom_request": false,
  "is_b2b": false,
  "is_vip": false,
  "interaction_level": "dialogue_actif",
  "objections": [],
  "first_name": null,
  "last_name": null,
  "email": null,
  "phone": null,
  "send_catalog": false,
  "catalog_id": "ict-general-2026",
  "catalog_type": "general"
}`;
  }

  private normalizeOutputKeys(parsed: any): void {
    if (!parsed || typeof parsed !== 'object') return;
    if (!parsed.whatsapp_message) {
      parsed.whatsapp_message =
        parsed.message ||
        parsed.reply ||
        parsed.text ||
        parsed.response ||
        parsed.whatsappMessage ||
        parsed.output_message ||
        parsed.content ||
        'Bonjour ! Comment puis-je vous renseigner chez Inside Cameroon Tourism ?';
    }
  }

  private async callAnthropic(
    inboundText: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    existingLeadData?: any
  ): Promise<LeadQualificationOutput> {
    if (!this.anthropicClient) throw new Error('Anthropic non configuré');

    // Charger le prompt actif depuis la DB (avec cache)
    const activePrompt = await this.getActivePrompt();

    // Nettoyer et alterner strictement les rôles pour l'API Anthropic
    const rawMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Filtrer l'historique pour éviter les doublons avec le message entrant
    const filteredHistory = [...history];
    if (
      filteredHistory.length > 0 &&
      filteredHistory[filteredHistory.length - 1].role === 'user' &&
      filteredHistory[filteredHistory.length - 1].content.trim() === inboundText.trim()
    ) {
      filteredHistory.pop();
    }

    for (const h of filteredHistory) {
      if (!h.content || !h.content.trim()) continue;
      const role = h.role === 'user' ? 'user' : 'assistant';
      if (rawMessages.length > 0 && rawMessages[rawMessages.length - 1].role === role) {
        rawMessages[rawMessages.length - 1].content += '\n' + h.content;
      } else {
        rawMessages.push({ role, content: h.content });
      }
    }

    // Ajouter le message entrant
    if (rawMessages.length > 0 && rawMessages[rawMessages.length - 1].role === 'user') {
      rawMessages[rawMessages.length - 1].content += '\n' + inboundText;
    } else {
      rawMessages.push({ role: 'user', content: inboundText });
    }

    // Anthropic exige impérativement que le premier message soit de rôle 'user'
    if (rawMessages.length > 0 && rawMessages[0].role !== 'user') {
      rawMessages.shift();
    }

    // Modèles Anthropic valides et disponibles
    const candidateModels = Array.from(
      new Set(
        [
          env.ANTHROPIC_MODEL,
          'claude-3-5-haiku-20241022',
          'claude-3-haiku-20240307',
          'claude-3-5-sonnet-20241022',
          'claude-3-7-sonnet-20250219',
        ].filter(Boolean)
      )
    );

    let response: any = null;
    let lastError: any = null;

    for (const m of candidateModels) {
      try {
        console.log(`[AgentService] Tentative Claude avec modèle: ${m}...`);
        response = await this.anthropicClient.messages.create({
          model: m,
          max_tokens: 1024,
          system: this.buildSystemPromptWithSchema(
            activePrompt.prompt,
            existingLeadData,
            activePrompt.campaign || existingLeadData?.campaign,
            activePrompt.slug,
            activePrompt.name
          ),
          messages: rawMessages,
        });
        if (response && response.content?.[0]) {
          console.log(`✓ [AgentService] Réponse Claude générée avec succès via ${m} !`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[AgentService] Modèle ${m} non disponible (${err?.status || ''} ${err?.message}), tentative modèle suivant...`);
      }
    }

    if (!response) {
      console.error('[AgentService] Tous les modèles Claude ont échoué:', lastError?.status || '', lastError?.error?.message || lastError?.message || lastError);
      throw lastError || new Error('Tous les modèles Claude ont échoué');
    }

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Réponse Anthropic non textuelle');

    // Extraire le JSON même s'il y a du markdown
    const text = block.text.trim();
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1] || jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);
    this.normalizeOutputKeys(parsed);
    return LeadQualificationOutputSchema.parse(parsed);
  }

  /**
   * Moteur heuristique conversationnel intelligent d'ICT.
   * Analyse sémantiquement les intentions, extrait budget/participants sans confusion,
   * gère l'historique sans répétition et progresse naturellement vers la conversion.
   */
  public mockQualifyMessage(
    inboundText: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    existingLeadData?: any
  ): LeadQualificationOutput {
    const textTrimmed = inboundText.trim();
    const textLower = textTrimmed.toLowerCase();

    // 1. Sanitisation / récupération des données existantes
    // Si participantsCount était corrompu à 600 ou valeur aberrante sans contexte, le réinitialiser
    let participants_count: number | null =
      existingLeadData?.participantsCount && existingLeadData.participantsCount < 150
        ? existingLeadData.participantsCount
        : null;

    let preferred_date: string | null = existingLeadData?.preferredDate || null;
    let budget: string | null = existingLeadData?.budget || null;
    let customer_type: LeadQualificationOutput['customer_type'] = existingLeadData?.customerType || 'Particulier';
    let is_b2b = Boolean(existingLeadData?.isB2B);
    let is_vip = Boolean(existingLeadData?.isVip);
    let recommended_offer: string | null = existingLeadData?.recommendedOffer || null;
    let product_identified = Boolean(existingLeadData?.productIdentified);
    let product_standard = true;
    let custom_request = false;
    let purchase_intent: LeadQualificationOutput['purchase_intent'] = existingLeadData?.purchaseIntent || 'information';

    // 2. Détection Budget
    // Exemples: "600 000 fcfa", "600000 cfa", "600k", "budget de 500 000", "800 000", "1500 euros", "1500 €"
    let budgetExtractedInThisTurn = false;
    const budgetMatch =
      textLower.match(/(?:budget\s*(?:de|d'environ|environ)?\s*)?(\d{1,3}(?:[\s.,]\d{3})+|\d{4,9})\s*(?:k|fcfa|cfa|frs|f\s*cfa|f|euros?|€|\$)?/i) ||
      textLower.match(/(\d+)\s*(?:k|fcfa|cfa|frs|f\s*cfa|euros?|€|\$)/i);

    if (budgetMatch) {
      const rawNum = budgetMatch[1].replace(/[\s.,]/g, '');
      const parsedNum = parseInt(rawNum, 10);
      if (!isNaN(parsedNum) && parsedNum >= 5000) {
        budget = `${parsedNum.toLocaleString('fr-FR')} FCFA`;
        budgetExtractedInThisTurn = true;
        // Si participants_count avait été faussement défini sur les premiers chiffres de ce budget (ex: 600), le purger
        if (participants_count && rawNum.startsWith(participants_count.toString())) {
          participants_count = null;
        }
      }
    }

    // 3. Détection Nombre de Participants (uniquement si ce n'est PAS un montant de budget)
    if (!budgetExtractedInThisTurn) {
      // Cas A: Mention explicite d'un nombre de personnes (ex: "10 personnes", "5 pax", "groupe de 8")
      const explicitParticipantsMatch = textLower.match(
        /(\d+)\s*(?:personnes|pers|pax|gens|collaborateurs|participants|adultes|enfants|membres)/
      );
      if (explicitParticipantsMatch) {
        const p = parseInt(explicitParticipantsMatch[1], 10);
        if (p > 0 && p < 150) {
          participants_count = p;
        }
      } else {
        // Cas B: Réponse courte avec un chiffre seul (ex: "10", "4", "2")
        const standaloneNumberMatch = textLower.match(/^\s*(\d{1,2})\s*$/);
        if (standaloneNumberMatch) {
          const p = parseInt(standaloneNumberMatch[1], 10);
          if (p >= 1 && p <= 50) {
            participants_count = p;
          }
        }
      }
    }

    // Cas solo / couple
    if (textLower.match(/\b(seul|solo|moi-même|moi meme)\b/)) {
      participants_count = 1;
    } else if (textLower.match(/\b(couple|avec ma femme|avec mon mari)\b/) && !participants_count) {
      participants_count = 2;
      customer_type = 'Couple';
    }

    // 4. Détection Date / Période
    const dateMatch = textLower.match(
      /(décembre|decembre|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|noël|noel|nouvel an|fin d'année|vacances|le mois prochain|ce week-end|week-end prochain|\d{1,2}\/\d{1,2})/
    );
    if (dateMatch) {
      preferred_date = dateMatch[0];
    }

    // 5. Détection Type de Client et B2B
    if (textLower.match(/team\s*building|teams\s*building|séminaire|seminaire|entreprise|société|societe|collègues|collegues|cse|collaborateurs/)) {
      customer_type = 'Entreprise';
      is_b2b = true;
    } else if (textLower.match(/famille|enfants|bébé|bebe|parents/)) {
      customer_type = 'Famille';
      is_b2b = false;
    } else if (textLower.match(/couple|mari|femme|amoureux|lune de miel/)) {
      customer_type = 'Couple';
      is_b2b = false;
    } else if (textLower.match(/groupe|amis|association/) && !is_b2b) {
      customer_type = 'Groupe';
    }

    // 6. Détection Destination / Offre (compatible avec toutes les campagnes ICT + prompt actif)
    const activePromptText = (this.cachedPrompt?.prompt || '').toLowerCase();
    if (textLower.match(/îl[e]?\s*eding|ile\s*eding|\beding\b|day\s*pass/)) {
      recommended_offer = 'Île Eding';
      product_identified = true;
    } else if (textLower.match(/\bavip\b|assistance\s*voyage|accueil.*aéroport|accueil.*aeroport/)) {
      recommended_offer = 'Assistance Voyage (AVIP)';
      product_identified = true;
    } else if (textLower.match(/sourcing|turquie|black\s*friday|voyage\s*d'affaires/)) {
      recommended_offer = 'Sourcing Turquie';
      product_identified = true;
    } else if (textLower.match(/inside\s*school|école|ecole|scolaire/)) {
      recommended_offer = 'Inside School';
      product_identified = true;
    } else if (textLower.match(/inside\s*team\s*building/)) {
      recommended_offer = 'Inside Team Building';
      product_identified = true;
      is_b2b = true;
      customer_type = 'Entreprise';
    } else if (textLower.match(/découvrir le cameroun|decouvrir le cameroun|inside\s*day/)) {
      recommended_offer = 'Découvrir le Cameroun';
      product_identified = true;
    } else if (textLower.match(/kribi|chutes de la lobé|chutes de la lobe|lobé|lobe/)) {
      recommended_offer = 'Escapade Balnéaire Kribi & Chutes de la Lobé';
      product_identified = true;
    } else if (textLower.match(/ebogo|pirogue|fleuve nyong|nyong/)) {
      recommended_offer = 'Excursion Écotourisme Ebogo & Pirogue';
      product_identified = true;
    } else if (textLower.match(/mont cameroun|char des dieux|buea|ascension/)) {
      recommended_offer = 'Ascension Mont Cameroun (Buea)';
      product_identified = true;
    } else if (textLower.match(/limbé|limbe|sémé|seme/)) {
      recommended_offer = 'Découverte Côtière Limbé & Sémé Beach';
      product_identified = true;
    } else if (textLower.match(/sur-mesure|sur mesure|personnalisé|circuit spécial|3 semaines/)) {
      custom_request = true;
      product_standard = false;
    }

    // 7. Détection Intention d'achat
    if (textLower.match(/réserver|reserver|payer|virement|je prends|confirmer ma place|bloquer/)) {
      purchase_intent = 'veut_reserver';
    } else if (textLower.match(/prix|tarif|combien|devis|coût|cout/)) {
      purchase_intent = 'demande_prix';
    } else if (textLower.match(/intéressé|interesse|programme|détail|detail|activités|activites|info/)) {
      purchase_intent = 'interesse';
    }

    // 8. Étape de conversation
    let conversation_stage: LeadQualificationOutput['conversation_stage'] = 'DISCOVERY';
    if (purchase_intent === 'veut_reserver') {
      conversation_stage = 'CONVERSION';
    } else if (product_identified && (budget || purchase_intent === 'demande_prix')) {
      conversation_stage = 'RECOMMENDATION';
    } else if (participants_count || preferred_date) {
      conversation_stage = 'QUALIFICATION';
    }

    // 9. Analyse de l'historique pour éviter les répétitions de questions
    const assistantHistory = history
      .filter((h) => h.role === 'assistant')
      .map((h) => h.content.toLowerCase());
    const lastAssistantMsg = assistantHistory.length > 0 ? assistantHistory[assistantHistory.length - 1] : '';

    const askedAboutBudget = assistantHistory.some((m) => m.includes('budget'));
    const askedAboutObjective = assistantHistory.some((m) => m.includes('objectif principal'));

    // Extraction éventuelle des puces d'offres définies dans le prompt actif en base
    const activeBullets = (this.cachedPrompt?.prompt || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('•') && l.length > 4 && l.length < 140)
      .slice(0, 6);

    // 10. Génération du message WhatsApp dynamique et fidèle au prompt actif (sans jamais imposer Kribi/Ebogo par défaut)
    let whatsapp_message = '';

    if (is_b2b) {
      // Flow Entreprise / Team Building
      if (!askedAboutObjective && !textLower.match(/team\s*building|teams\s*building|cohésion|séminaire/)) {
        whatsapp_message = `Bonjour et merci d'avoir contacté Inside Cameroon Tourism ! 🇨🇲\n\nNous concevons des événements d'entreprise sur-mesure (Team Building, séminaires, retraites au vert). Quel est l'objectif principal de cette sortie ?`;
      } else if (!participants_count) {
        whatsapp_message = `C'est parfaitement noté pour votre Team Building ! Pour vous concevoir une proposition adaptée, pour combien de collaborateurs prévoyez-vous cet événement ?`;
      } else if (!preferred_date) {
        whatsapp_message = `Très bien pour votre groupe de ${participants_count} collaborateurs ! À quelle période ou date idéale souhaiteriez-vous organiser cette sortie ?`;
      } else {
        whatsapp_message = `Parfait ! Toutes les informations sont réunies pour votre Team Building de ${participants_count} personnes${recommended_offer ? ` (${recommended_offer})` : ''}. À quelle adresse email ou auprès de quel responsable pouvons-nous vous transmettre le devis proforma et le programme détaillé ?`;
      }
    } else if (budgetExtractedInThisTurn || (budget && askedAboutBudget && !lastAssistantMsg.includes('brochure') && !lastAssistantMsg.includes('modalités'))) {
      const offerName = recommended_offer || 'notre formule sur-mesure';
      whatsapp_message = `C'est bien noté pour votre budget de ${budget}${participants_count ? ` pour ${participants_count} personnes` : ''}${preferred_date ? ` (${preferred_date})` : ''} sur ${offerName}.\n\nSouhaitez-vous recevoir les détails complets et les disponibilités pour finaliser votre réservation ?`;
    } else if (purchase_intent === 'veut_reserver') {
      whatsapp_message = `Excellente nouvelle ! L'offre "${recommended_offer || 'choisie'}" est disponible. Souhaitez-vous bloquer votre réservation dès maintenant ou échanger directement avec un conseiller ICT ?`;
    } else if (purchase_intent === 'demande_prix' && !participants_count) {
      whatsapp_message = `Avec plaisir pour vous communiquer le tarif exact${recommended_offer ? ` pour ${recommended_offer}` : ''} ! Pour combien de participants et pour quelle date envisagez-vous ce projet ?`;
    } else if (!product_identified) {
      if (assistantHistory.length > 0) {
        // Ne jamais répéter le message de bienvenue si la conversation est déjà engagée
        whatsapp_message = `Merci pour votre message ! 😊 Quelle offre d'Inside Cameroon Tourism vous intéresse en particulier ?`;
      } else if (activeBullets.length > 0) {
        whatsapp_message = `Bonjour et bienvenue chez Inside Cameroon Tourism ! 🇨🇲\n\nQuelle offre ICT vous intéresse ?\n\n${activeBullets.join('\n')}\n\nRépondez simplement par le nom de l'offre. 😊`;
      } else if (activePromptText.includes('eding') && !activePromptText.includes('découvrir le cameroun')) {
        whatsapp_message = `Bonjour et bienvenue chez Inside Cameroon Tourism ! 🇨🇲\n\nSouhaitez-vous des informations sur l'Île Eding (Day Pass, séjour, privatisation ou Team Building) ?`;
      } else {
        whatsapp_message = `Bonjour et bienvenue chez Inside Cameroon Tourism ! 🇨🇲\n\nQuelle offre ou expérience souhaiteriez-vous découvrir aujourd'hui ?`;
      }
    } else if (!preferred_date) {
      whatsapp_message = `Excellent choix pour "${recommended_offer}" ! À quelle date ou période souhaiteriez-vous planifier cela ?`;
    } else if (!participants_count) {
      whatsapp_message = `C'est bien noté pour ${preferred_date} ! Pour combien de participants prévoyez-vous cette expérience ?`;
    } else if (!budget) {
      whatsapp_message = `Parfait, nous notons ${participants_count} participant(s) pour ${preferred_date} (${recommended_offer}). Souhaitez-vous qu'un conseiller vous transmette la proposition détaillée ?`;
    } else {
      whatsapp_message = `Toutes vos informations sont bien enregistrées pour ${recommended_offer} (${participants_count} personnes, ${preferred_date}). Souhaitez-vous qu'un conseiller ICT vous contacte pour finaliser votre réservation ?`;
    }

    // 11. Détection dynamique de Demande ou Acceptation de Catalogue PDF
    let send_catalog = false;
    let catalog_type: string = 'general';
    let catalog_id: string | null = null;

    const wantsCatalogDirectly = Boolean(
      textLower.match(/\b(catalogue|brochure|plaquette|pdf|programme complet|toutes vos offres|tous vos circuits|vos tarifs complets|votre catalogue|envoyez.*catalogue)\b/)
    );

    const assistantOfferedCatalog =
      lastAssistantMsg &&
      (lastAssistantMsg.includes('catalogue') ||
        lastAssistantMsg.includes('brochure') ||
        lastAssistantMsg.includes('programme par whatsapp'));

    const userAgreed = Boolean(
      textLower.match(/\b(oui|d'accord|daccord|ok|volontiers|avec plaisir|je veux bien|envoie|envoyer|partage|transmets|transmettre|pourquoi pas|s'il vous plait|svp)\b/)
    );

    if (wantsCatalogDirectly || (assistantOfferedCatalog && userAgreed)) {
      send_catalog = true;

      // Recherche dynamique parmi tous les catalogues enregistrés dans le système
      const allCatalogs = catalogService.listCatalogs();
      let matched = allCatalogs.find((c) => {
        const cTitle = c.title.toLowerCase();
        const cCat = c.category.toLowerCase();
        const cTrig = (c.triggerCondition || '').toLowerCase();

        // 1. Mots de la consigne ou du titre trouvés dans le message client
        if (textLower.includes(cCat) || (c.fileName && textLower.includes(c.fileName.toLowerCase()))) return true;
        if (cTitle.includes('kribi') && textLower.includes('kribi')) return true;
        if (cTitle.includes('ebogo') && textLower.includes('ebogo')) return true;
        if (cTitle.includes('mont cameroun') && (textLower.includes('mont cameroun') || textLower.includes('buea'))) return true;

        // 2. Offre recommandée correspondante
        if (recommended_offer) {
          const recLower = recommended_offer.toLowerCase();
          if (cCat !== 'general' && recLower.includes(cCat)) return true;
          if (cTitle.includes(recLower) || recLower.includes(cCat) || cTrig.includes(recLower)) return true;
        }

        return false;
      });

      if (!matched) {
        matched = catalogService.getDefaultCatalog();
      }

      catalog_id = matched.id;
      catalog_type = matched.category;

      whatsapp_message = `Avec grand plaisir ! 📄 Je vous transmets immédiatement ${matched.title} au format PDF ci-dessous avec toutes les formules et tarifs détaillés.\n\nPrenez le temps de le consulter et dites-moi quelle expérience vous attire le plus ! 🇨🇲✨`;
    }

    // 12. Garde-fou Anti-Répétition Stricte
    if (!send_catalog && lastAssistantMsg && (whatsapp_message.trim() === lastAssistantMsg.trim() || (whatsapp_message.length > 25 && lastAssistantMsg.includes(whatsapp_message.slice(0, 25))))) {
      whatsapp_message = `C'est bien noté ! Nous finalisons la proposition idéale pour votre projet de séjour. Souhaitez-vous qu'un conseiller Inside Cameroon Tourism prenne contact avec vous directement par appel pour affiner votre devis ?`;
    }

    return {
      whatsapp_message,
      conversation_stage,
      intent: purchase_intent === 'veut_reserver' ? 'Reservation' : 'Information',
      customer_type,
      need: `Séjour ou événement ${customer_type} (${recommended_offer || 'Tourisme Cameroun'})`,
      participants_count,
      preferred_date,
      budget,
      recommended_offer,
      quoted_price: whatsapp_message.includes('75 000 FCFA') ? '75 000 FCFA / pers' : existingLeadData?.quotedPrice || null,
      estimated_amount:
        whatsapp_message.includes('75 000 FCFA') && participants_count ? 75000 * participants_count : existingLeadData?.estimatedAmount || null,
      product_identified,
      purchase_intent,
      availability_confirmed: purchase_intent === 'veut_reserver',
      product_standard,
      custom_request,
      is_b2b,
      is_vip,
      interaction_level: textTrimmed.length > 30 ? 'dialogue_actif' : 'repond_peu',
      objections: [],
      first_name: null,
      last_name: null,
      email: null,
      phone: null,
      send_catalog,
      catalog_type,
      catalog_id,
    };
  }
}

export const agentService = new AgentService();
