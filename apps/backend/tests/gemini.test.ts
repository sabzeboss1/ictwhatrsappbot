import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { AgentService } from '../src/modules/agent/agent.service.js';
import { env } from '../src/config/env.js';
import { LeadQualificationOutputSchema } from '../src/modules/agent/schemas/lead-qualification.schema.js';

describe('Google Gemini Integration & Multi-Model Resilience', () => {
  let agentService: AgentService;

  beforeEach(() => {
    agentService = new AgentService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse valid Gemini JSON output into LeadQualificationOutputSchema', async () => {
    const mockGeminiResponse = {
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    whatsapp_message: "Bonjour ! Nous serions ravis de vous accueillir pour votre séjour au Cameroun. Êtes-vous intéressé par nos circuits balnéaires ou safari ?",
                    conversation_stage: "NEW_CONTACT",
                    intent: "Decouverte",
                    customer_type: "Particulier",
                    need: "Découverte Cameroun",
                    participants_count: 2,
                    preferred_date: "Novembre 2026",
                    budget: "1000000 FCFA",
                    recommended_offer: "Circuit Kribi Plage & Chutes de la Lobé",
                    product_identified: true,
                    purchase_intent: "information",
                    availability_confirmed: false,
                    product_standard: true,
                    custom_request: false,
                    is_b2b: false,
                    is_vip: false,
                    interaction_level: "dialogue_actif",
                    objections: [],
                    first_name: "Samuel",
                    last_name: null,
                    email: null,
                    send_catalog: false,
                    catalog_id: null,
                    catalog_type: null,
                  }),
                },
              ],
            },
          },
        ],
      },
    };

    vi.spyOn(axios, 'post').mockResolvedValueOnce(mockGeminiResponse as any);

    const result = await agentService.callGemini(
      'Bonjour, je souhaite venir en vacances au Cameroun avec ma femme en novembre.',
      []
    );

    expect(result).toBeDefined();
    expect(result.whatsapp_message).toContain('Bonjour !');
    expect(result.participants_count).toBe(2);
    expect(result.customer_type).toBe('Particulier');
    expect(result.intent).toBe('Decouverte');
  });

  it('should automatically strip markdown ```json code blocks from Gemini responses', async () => {
    const rawJson = JSON.stringify({
      whatsapp_message: "Absolument ! Voici les détails de notre offre safari.",
      conversation_stage: "OFFER_PROPOSED",
      intent: "Decouverte",
      customer_type: "Particulier",
      need: "Safari Waza",
      participants_count: 4,
      preferred_date: null,
      budget: null,
      recommended_offer: "Safari Faune & Savane",
      product_identified: true,
      purchase_intent: "information",
      availability_confirmed: false,
      product_standard: true,
      custom_request: false,
      is_b2b: false,
      is_vip: false,
      interaction_level: "dialogue_actif",
      objections: [],
      first_name: null,
      last_name: null,
      email: null,
      send_catalog: true,
      catalog_id: "ict-general-2026",
      catalog_type: "general",
    });

    const mockMarkdownResponse = {
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "```json\n" + rawJson + "\n```",
                },
              ],
            },
          },
        ],
      },
    };

    vi.spyOn(axios, 'post').mockResolvedValueOnce(mockMarkdownResponse as any);

    const result = await agentService.callGemini(
      'Avez-vous une brochure pour les safaris ?',
      []
    );

    expect(result.send_catalog).toBe(true);
    expect(result.catalog_type).toBe('general');
    expect(result.recommended_offer).toBe('Safari Faune & Savane');
  });

  it('should fallback to secondary model when primary model returns 503 high demand', async () => {
    // 1ère tentative (ex: gemini-flash-latest) échoue avec 503
    const error503 = {
      response: {
        status: 503,
        data: {
          error: {
            message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary.',
          },
        },
      },
    };

    // 2ème tentative (gemini-flash-lite-latest) réussit
    const successResponse = {
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    whatsapp_message: "Bienvenue ! En quoi pouvons-nous vous aider aujourd'hui ?",
                    conversation_stage: "NEW_CONTACT",
                    intent: "Decouverte",
                    customer_type: "Particulier",
                    need: null,
                    participants_count: null,
                    preferred_date: null,
                    budget: null,
                    recommended_offer: null,
                    product_identified: false,
                    purchase_intent: "information",
                    availability_confirmed: false,
                    product_standard: false,
                    custom_request: false,
                    is_b2b: false,
                    is_vip: false,
                    interaction_level: "dialogue_actif",
                    objections: [],
                    first_name: null,
                    last_name: null,
                    email: null,
                    send_catalog: false,
                    catalog_id: null,
                    catalog_type: null,
                  }),
                },
              ],
            },
          },
        ],
      },
    };

    const postSpy = vi
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(error503)
      .mockResolvedValueOnce(successResponse as any);

    const result = await agentService.callGemini('Salut', []);

    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(result.whatsapp_message).toContain('Bienvenue !');
  });

  it('should gracefully fallback to heuristic simulator if all external AI engines fail', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network offline'));

    const result = await agentService.qualifyMessage({
      inboundText: 'Bonjour, je cherche des infos pour un voyage à Kribi pour 2 personnes',
      senderPhone: '237699001122',
      conversationHistory: [],
    });

    expect(result).toBeDefined();
    expect(result.whatsapp_message).toBeDefined();
    expect(result.participants_count).toBe(2);
    expect(result.customer_type).toBe('Particulier');
    expect(result.recommended_offer).toContain('Kribi');
  });
});
