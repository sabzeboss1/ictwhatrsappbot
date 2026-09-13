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
  private cachedPrompt: { prompt: string; version: string; name: string } | null = null;
  private promptCacheTimestamp: number = 0;
  private static PROMPT_CACHE_TTL_MS = 60_000; // 60 secondes

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
    if (env.ANTHROPIC_API_KEY) {
      this.anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    }
  }

  /**
   * Invalide le cache du prompt actif.
   * Appelé après chaque modification de template depuis l'admin.
   */
  public invalidatePromptCache(): void {
    this.cachedPrompt = null;
    this.promptCacheTimestamp = 0;
    console.log('[AgentService] Cache prompt invalidé');
  }

  /**
   * Charge le prompt système actif depuis la base de données.
   * Utilise un cache avec TTL de 60s et invalidation manuelle.
   * Fallback: prompt hardcodé dans lead-qualification.ts
   */
  public async getActivePrompt(): Promise<{ prompt: string; version: string; name: string }> {
    // Vérifier le cache
    const now = Date.now();
    if (this.cachedPrompt && (now - this.promptCacheTimestamp) < AgentService.PROMPT_CACHE_TTL_MS) {
      return this.cachedPrompt;
    }

    try {
      const activeTemplate = await prisma.promptTemplate.findFirst({
        where: { isActive: true },
      });

      if (activeTemplate) {
        this.cachedPrompt = {
          prompt: activeTemplate.prompt,
          version: activeTemplate.version,
          name: activeTemplate.name,
        };
        this.promptCacheTimestamp = now;
        return this.cachedPrompt;
      }
    } catch (err: any) {
      console.warn('[AgentService] Erreur chargement prompt depuis DB, utilisation du fallback:', err.message);
    }

    // Fallback: prompt hardcodé
    const fallback = {
      prompt: SYSTEM_PROMPT_LEAD_QUALIFICATION,
      version: PROMPT_VERSION,
      name: 'Prompt par défaut (hardcodé)',
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

    // 1. Tenter via OpenAI si configuré (soit explicitement, soit si configuré par défaut)
    if (this.openaiClient && (env.AI_PROVIDER === 'openai' || !this.anthropicClient)) {
      try {
        console.log(`[AgentService] Appel du modèle OpenAI (${env.OPENAI_MODEL || 'gpt-4o-mini'})...`);
        return await this.callOpenAI(inboundText, conversationHistory, existingLeadData);
      } catch (err: any) {
        console.error('[AgentService] Erreur OpenAI:', err?.message || err);
      }
    }

    // 2. Tenter via Anthropic Claude si configuré (soit en provider actif, soit en secours si OpenAI a échoué)
    if (this.anthropicClient) {
      try {
        console.log('[AgentService] Appel du modèle Anthropic Claude...');
        return await this.callAnthropic(inboundText, conversationHistory, existingLeadData);
      } catch (err: any) {
        console.error('[AgentService] Erreur Anthropic Claude:', err?.status || '', err?.message || err);
      }
    }

    // 3. Secours OpenAI si Anthropic était le mode par défaut mais a échoué
    if (this.openaiClient && env.AI_PROVIDER !== 'openai') {
      try {
        console.log(`[AgentService] Appel de secours OpenAI (${env.OPENAI_MODEL || 'gpt-4o-mini'})...`);
        return await this.callOpenAI(inboundText, conversationHistory, existingLeadData);
      } catch (err: any) {
        console.error('[AgentService] Erreur OpenAI secours:', err?.message || err);
      }
    }

    // 4. Moteur heuristique intelligent de secours (garantit une réponse de haute qualité sans blocage)
    console.warn('[AgentService] Utilisation du moteur heuristique conversationnel ICT (APIs externes injoignables)');
    return this.mockQualifyMessage(inboundText, conversationHistory, existingLeadData);
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
        content: this.buildSystemPromptWithSchema(activePrompt.prompt, existingLeadData, existingLeadData?.campaign),
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
    campaignSlug?: string | null
  ): string {
    // Injection dynamique en temps réel de tous les catalogues disponibles et de leurs règles
    const dynamicCatalogContext = catalogService.generatePromptContext(campaignSlug);

    return `${basePrompt}

══════════════════════════════════════════════════════════════
${dynamicCatalogContext}
══════════════════════════════════════════════════════════════

Données actuelles connues sur ce prospect:
${JSON.stringify(existingLeadData || {}, null, 2)}

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
          system: this.buildSystemPromptWithSchema(activePrompt.prompt, existingLeadData, existingLeadData?.campaign),
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

    // 6. Détection Destination / Offre
    if (textLower.match(/kribi|chutes de la lobé|chutes de la lobe|lobé|lobe|plage/)) {
      recommended_offer = 'Escapade Balnéaire Kribi & Chutes de la Lobé';
      product_identified = true;
    } else if (textLower.match(/ebogo|pirogue|fleuve nyong|nyong|écotourisme|ecotourisme/)) {
      recommended_offer = 'Excursion Écotourisme Ebogo & Pirogue';
      product_identified = true;
    } else if (textLower.match(/mont cameroun|char des dieux|buea|randonnée|randonnee|trek|ascension/)) {
      recommended_offer = 'Ascension Mont Cameroun (Buea)';
      product_identified = true;
    } else if (textLower.match(/limbé|limbe|sémé|seme/)) {
      recommended_offer = 'Découverte Côtière Limbé & Sémé Beach';
      product_identified = true;
    } else if (textLower.match(/sur-mesure|personnalisé|circuit spécial|3 semaines/)) {
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

    // 10. Génération du message WhatsApp dynamique et contextuel
    let whatsapp_message = '';

    if (is_b2b) {
      // Flow Entreprise / Team Building
      if (!askedAboutObjective && !textLower.match(/team\s*building|teams\s*building|cohésion|séminaire/)) {
        whatsapp_message = `Bonjour et merci d'avoir contacté Inside Cameroon Tourism ! 🇨🇲\n\nNous concevons des événements d'entreprise sur-mesure (Team Building, séminaires, retraites au vert). Quel est l'objectif principal de cette sortie ?`;
      } else if (!participants_count) {
        whatsapp_message = `C'est parfaitement noté pour votre Team Building ! Pour vous concevoir une proposition adaptée (activités de cohésion, transport et hébergement), pour combien de collaborateurs prévoyez-vous cet événement ?`;
      } else if (!preferred_date) {
        whatsapp_message = `Très bien pour votre groupe de ${participants_count} collaborateurs ! À quelle période ou date idéale souhaiteriez-vous organiser cette sortie ?`;
      } else if (!product_identified) {
        whatsapp_message = `Super projet ! Préférez-vous une formule détente en bord de mer à Kribi (plage, olympiades et fruits de mer) ou une expérience nature à Ebogo (pirogue et cohésion d'équipe) ?`;
      } else {
        whatsapp_message = `Parfait ! Toutes les informations sont réunies pour votre Team Building de ${participants_count} personnes à ${recommended_offer || 'Kribi'}. À quelle adresse email ou auprès de quel responsable pouvons-nous vous transmettre le devis proforma et le programme détaillé ?`;
      }
    } else if (budgetExtractedInThisTurn || (budget && askedAboutBudget && !lastAssistantMsg.includes('brochure') && !lastAssistantMsg.includes('modalités'))) {
      // Le prospect vient de préciser son budget
      const offerName = recommended_offer || 'Escapade Balnéaire Kribi & Chutes de la Lobé';
      whatsapp_message = `C'est un excellent budget ! Avec ${budget} pour ${participants_count ? participants_count + ' personnes' : 'votre séjour'} en ${preferred_date || 'décembre'}, notre expérience "${offerName}" correspond parfaitement (hébergement de qualité, transport et visites guidées inclus).\n\nSouhaitez-vous recevoir la brochure détaillée et les disponibilités pour finaliser votre réservation ?`;
    } else if (purchase_intent === 'veut_reserver') {
      whatsapp_message = `Excellente nouvelle ! L'offre "${recommended_offer || 'choisie'}" est disponible. Souhaitez-vous bloquer votre réservation dès maintenant avec un acompte sécurisé ou échanger directement avec un conseiller ICT ?`;
    } else if (purchase_intent === 'demande_prix' && !participants_count) {
      whatsapp_message = `Nos formules pour ${recommended_offer || 'Kribi'} démarrent à partir de 75 000 FCFA / personne en formule week-end tout compris (transport climatisé, hôtel partenaire, visite des Chutes de la Lobé et repas). Pour combien de personnes prévoyez-vous ce séjour ?`;
    } else if (!product_identified) {
      whatsapp_message = `Bonjour et bienvenue chez Inside Cameroon Tourism ! 🇨🇲\n\nC'est un plaisir de vous accompagner. Quelle destination vous ferait plaisir pour ce séjour (détente balnéaire à Kribi, écotourisme en pirogue à Ebogo, ou randonnée au Mont Cameroun) ?`;
    } else if (!preferred_date) {
      whatsapp_message = `C'est une magnifique destination ! L'expérience "${recommended_offer}" est l'un de nos plus beaux programmes. À quelle date ou période souhaiteriez-vous planifier ce voyage ?`;
    } else if (!participants_count) {
      whatsapp_message = `C'est bien noté pour ${preferred_date} ! Pour combien de participants (adultes et enfants) prévoyez-vous cette expérience ?`;
    } else if (!budget) {
      whatsapp_message = `Parfait, nous réservons le créneau pour ${participants_count} personnes en ${preferred_date}. Avez-vous une estimation de votre budget global pour ce séjour ?`;
    } else {
      whatsapp_message = `Toutes vos informations sont bien enregistrées pour votre séjour à ${recommended_offer || 'Kribi'} (${participants_count} personnes en ${preferred_date}). Souhaitez-vous qu'un conseiller ICT vous appelle pour finaliser les détails ou préférez-vous recevoir le programme par WhatsApp ?`;
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
      send_catalog,
      catalog_type,
      catalog_id,
    };
  }
}

export const agentService = new AgentService();
