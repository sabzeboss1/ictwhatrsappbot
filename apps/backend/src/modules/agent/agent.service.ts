import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { SYSTEM_PROMPT_LEAD_QUALIFICATION, PROMPT_VERSION } from './prompts/lead-qualification.js';
import {
  LeadQualificationOutput,
  LeadQualificationOutputSchema,
} from './schemas/lead-qualification.schema.js';

export class AgentService {
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
    if (env.ANTHROPIC_API_KEY) {
      this.anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    }
  }

  public getPromptVersion() {
    return {
      version: PROMPT_VERSION,
      prompt: SYSTEM_PROMPT_LEAD_QUALIFICATION,
    };
  }

  public async qualifyMessage(params: {
    inboundText: string;
    senderPhone: string;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    existingLeadData?: any;
  }): Promise<LeadQualificationOutput> {
    const { inboundText, conversationHistory, existingLeadData } = params;

    // 1. Tenter via Anthropic si configuré
    if (env.AI_PROVIDER === 'anthropic' && this.anthropicClient) {
      try {
        return await this.callAnthropic(inboundText, conversationHistory, existingLeadData);
      } catch (err) {
        console.error('[AgentService] Erreur Anthropic, tentative de secours...', err);
      }
    }

    // 2. Tenter via OpenAI si configuré
    if (this.openaiClient && (env.AI_PROVIDER === 'openai' || !this.anthropicClient)) {
      try {
        return await this.callOpenAI(inboundText, conversationHistory, existingLeadData);
      } catch (err) {
        console.error('[AgentService] Erreur OpenAI, tentative de secours...', err);
      }
    }

    // 3. Fallback Heuristique / Simulateur si aucune clé n'est fournie ou si les APIs sont inaccessibles
    console.log('[AgentService] Utilisation du moteur de qualification heuristique intégré (Mode Démo/Dev)');
    return this.mockQualifyMessage(inboundText, conversationHistory, existingLeadData);
  }

  private async callOpenAI(
    inboundText: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    existingLeadData?: any
  ): Promise<LeadQualificationOutput> {
    if (!this.openaiClient) throw new Error('OpenAI non configuré');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT_LEAD_QUALIFICATION}\n\nDonnées actuelles connues sur ce lead:\n${JSON.stringify(
          existingLeadData || {},
          null,
          2
        )}\nTu dois impérativement répondre au format JSON strict conforme au schéma demandé.`,
      },
      ...history.map((h) => ({
        role: (h.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: h.content,
      })),
      {
        role: 'user',
        content: inboundText,
      },
    ];

    const response = await this.openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Réponse OpenAI vide');

    const parsed = JSON.parse(content);
    return LeadQualificationOutputSchema.parse(parsed);
  }

  private async callAnthropic(
    inboundText: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    existingLeadData?: any
  ): Promise<LeadQualificationOutput> {
    if (!this.anthropicClient) throw new Error('Anthropic non configuré');

    const formattedMessages = [
      ...history.map((h) => ({
        role: (h.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: h.content,
      })),
      {
        role: 'user' as const,
        content: inboundText,
      },
    ];

    const model = env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
    const response = await this.anthropicClient.messages.create({
      model,
      max_tokens: 1024,
      system: `${SYSTEM_PROMPT_LEAD_QUALIFICATION}\n\nDonnées actuelles connues:\n${JSON.stringify(
        existingLeadData || {},
        null,
        2
      )}\nTu dois impérativement renvoyer UNIQUEMENT un objet JSON valide correspondant au schéma LeadQualificationOutputSchema.`,
      messages: formattedMessages,
    });

    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Réponse Anthropic non textuelle');

    // Extraire le JSON même s'il y a des balises ```json
    const text = block.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Impossible de trouver un JSON dans la réponse Anthropic');

    const parsed = JSON.parse(jsonMatch[0]);
    return LeadQualificationOutputSchema.parse(parsed);
  }

  /**
   * Moteur heuristique réaliste de secours pour tester l'application
   * même sans clé API payante configurée.
   */
  public mockQualifyMessage(
    inboundText: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    existingLeadData?: any
  ): LeadQualificationOutput {
    const textLower = inboundText.toLowerCase();

    // Détection type prospect
    let customer_type: LeadQualificationOutput['customer_type'] = existingLeadData?.customerType || 'Particulier';
    let is_b2b = existingLeadData?.isB2B || false;
    let is_vip = existingLeadData?.isVip || false;

    if (textLower.match(/entreprise|société|collaborateur|team building|séminaire|b2b|direction|mtn|orange|total/)) {
      customer_type = 'Entreprise';
      is_b2b = true;
    } else if (textLower.match(/ong|association|humanitaire|mission/)) {
      customer_type = 'ONG';
    } else if (textLower.match(/école|ecole|université|élèves|étudiants/)) {
      customer_type = 'Ecole';
    } else if (textLower.match(/groupe|amis|famille|enfants/)) {
      customer_type = textLower.includes('famille') ? 'Famille' : 'Groupe';
    } else if (textLower.match(/couple|mari|femme|conjoint|lune de miel/)) {
      customer_type = 'Couple';
    }

    if (textLower.match(/vip|exclusif|luxe|privatisation/)) {
      is_vip = true;
    }

    // Détection participants
    let participants_count = existingLeadData?.participantsCount || null;
    const countMatch = textLower.match(/(\d{1,3})\s*(personnes|pers|participants|collaborateurs|élèves|adultes)?/);
    if (countMatch && parseInt(countMatch[1]) > 0) {
      participants_count = parseInt(countMatch[1]);
    }

    // Détection dates
    let preferred_date = existingLeadData?.preferredDate || null;
    const dateMatch = textLower.match(/(le\s+\d{1,2}\s+[a-z]+|\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?|vacances|décembre|novembre|octobre|août|juillet|janvier|février|mars|avril|mai|juin|septembre)/);
    if (dateMatch) {
      preferred_date = dateMatch[0];
    }

    // Détection intention d'achat
    let purchase_intent: LeadQualificationOutput['purchase_intent'] = 'information';
    if (textLower.match(/réserver|reserver|payer|virement|je prends|confirmer ma place/)) {
      purchase_intent = 'veut_reserver';
    } else if (textLower.match(/prix|tarif|combien|devis|coût|cout/)) {
      purchase_intent = 'demande_prix';
    } else if (textLower.match(/intéressé|interesse|programme|détail/)) {
      purchase_intent = 'interesse';
    }

    // Détection produit / offre
    let recommended_offer = existingLeadData?.recommendedOffer || null;
    let product_identified = existingLeadData?.productIdentified || false;
    let product_standard = true;
    let custom_request = false;

    if (textLower.match(/kribi|chutes de la lobé|plage/)) {
      recommended_offer = 'Escapade Balnéaire Kribi & Chutes de la Lobé';
      product_identified = true;
    } else if (textLower.match(/ebogo|pirogue|fleuve nyong/)) {
      recommended_offer = 'Excursion Écotourisme Ebogo & Pirogue';
      product_identified = true;
    } else if (textLower.match(/mont cameroun|char des dieux|buea/)) {
      recommended_offer = 'Ascension Mont Cameroun (Buea)';
      product_identified = true;
    } else if (textLower.match(/sur-mesure|personnalisé|circuit spécial|3 semaines/)) {
      custom_request = true;
      product_standard = false;
    }

    // Étape de conversation
    let conversation_stage: LeadQualificationOutput['conversation_stage'] = 'DISCOVERY';
    if (purchase_intent === 'veut_reserver') {
      conversation_stage = 'CONVERSION';
    } else if (product_identified && purchase_intent === 'demande_prix') {
      conversation_stage = 'RECOMMENDATION';
    } else if (participants_count || preferred_date) {
      conversation_stage = 'QUALIFICATION';
    }

    // Génération du message WhatsApp
    let whatsapp_message = '';
    if (is_b2b || (participants_count && participants_count > 20)) {
      whatsapp_message = `Bonjour et merci d'avoir contacté Inside Cameroon Tourism ! 🇨🇲\n\nNous serions ravis d'organiser cet événement pour votre groupe de ${participants_count || 'collaborateurs'}. Pour vous concevoir une offre d'entreprise sur-mesure, quel est l'objectif principal de cette sortie ?`;
    } else if (purchase_intent === 'veut_reserver') {
      whatsapp_message = `Excellente nouvelle ! L'offre ${recommended_offer || 'choisie'} est disponible à la date souhaitée. Souhaitez-vous finaliser votre réservation par paiement sécurisé ou recevoir votre récapitulatif ?`;
    } else if (product_identified) {
      whatsapp_message = `C'est une magnifique destination ! L'expérience "${recommended_offer}" comprend le transport, l'hébergement de charme et les guides locaux certifiés. Pour combien de personnes prévoyez-vous cette aventure ?`;
    } else {
      whatsapp_message = `Bonjour et bienvenue chez Inside Cameroon Tourism ! 🌍\n\nC'est un plaisir de vous accueillir. Quel type d'expérience touristique souhaitez-vous vivre au Cameroun (détente balnéaire à Kribi, randonnée au Mont Cameroun, ou découverte culturelle) ?`;
    }

    return {
      whatsapp_message,
      conversation_stage,
      intent: 'Reservation',
      customer_type,
      need: `Séjour ou excursion touristique ${customer_type}`,
      participants_count,
      preferred_date,
      budget: null,
      recommended_offer,
      product_identified,
      purchase_intent,
      availability_confirmed: purchase_intent === 'veut_reserver',
      product_standard,
      custom_request,
      is_b2b,
      is_vip,
      interaction_level: textLower.length > 50 ? 'fournit_toutes_infos' : 'dialogue_actif',
      objections: [],
      first_name: null,
      last_name: null,
      email: null,
    };
  }
}

export const agentService = new AgentService();
