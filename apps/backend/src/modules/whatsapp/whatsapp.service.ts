import axios from 'axios';
import { prisma } from '../../plugins/prisma.js';
import { env } from '../../config/env.js';
import { agentService } from '../agent/agent.service.js';
import { computeScore } from '../scoring/scoring.service.js';
import { enqueueHubspotSync } from '../../queues/message.queue.js';
import { emitLeadAlert, emitLeadUpdated, emitNewMessage } from '../../plugins/socketio.js';

export class WhatsAppService {
  /**
   * Nettoie et normalise le numéro de téléphone WhatsApp
   * ex: 237699112233@s.whatsapp.net -> +237699112233
   */
  public normalizePhone(jid: string): string {
    const rawNumber = jid.split('@')[0].replace(/[^\d+]/g, '');
    return rawNumber.startsWith('+') ? rawNumber : `+${rawNumber}`;
  }

  /**
   * Envoie un message WhatsApp via l'API Evolution
   */
  public async sendWhatsAppMessage(phone: string, text: string): Promise<any> {
    const cleanNumber = phone.replace(/[^\d]/g, '');
    const url = `${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE_NAME}`;

    try {
      const response = await axios.post(
        url,
        {
          number: cleanNumber,
          options: {
            delay: 1200,
            presence: 'composing',
            linkPreview: false,
          },
          textMessage: {
            text,
          },
        },
        {
          headers: {
            apikey: env.EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );
      return response.data;
    } catch (err: any) {
      console.warn(`[WhatsApp API] Envoi à ${phone} simulé (Evolution API non joignable: ${err.message})`);
      return { simulated: true, message: 'Message enregistré localement' };
    }
  }

  /**
   * Traitement d'un message entrant reçu par Webhook
   */
  public async handleInboundMessage(params: {
    rawPhone: string;
    text: string;
    whatsappMessageId?: string;
    pushName?: string;
    messageType?: string;
    source?: string;
    campaign?: string;
  }) {
    const { rawPhone, text, whatsappMessageId, pushName, messageType = 'text', source = 'whatsapp', campaign } = params;
    const phone = this.normalizePhone(rawPhone);

    // 1. Anti-doublon strict (Critère d'acceptation #1)
    if (whatsappMessageId) {
      const existingMessage = await prisma.message.findUnique({
        where: { whatsappMessageId },
      });
      if (existingMessage) {
        console.log(`[Anti-doublon] Message ${whatsappMessageId} déjà traité, ignoré.`);
        return { duplicate: true };
      }
    }

    // 2. Récupérer ou créer le lead
    let lead = await prisma.lead.findUnique({
      where: { phone },
    });

    if (!lead) {
      // Décomposition sommaire du nom si fourni par WhatsApp
      let firstName = pushName || 'Prospect';
      let lastName = '';
      if (pushName && pushName.includes(' ')) {
        const parts = pushName.split(' ');
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      }

      lead = await prisma.lead.create({
        data: {
          phone,
          firstName,
          lastName,
          source,
          campaign,
          conversationStage: 'NEW_CONTACT',
          customerType: 'Inconnu',
          purchaseIntent: 'information',
          interactionLevel: 'dialogue_actif',
        },
      });
    } else if (source !== 'whatsapp' && lead.source === 'whatsapp') {
      // Mettre à jour la source si le prospect provient d'une campagne spécifique
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          source,
          campaign: campaign || lead.campaign,
        },
      });
    }

    // 3. Enregistrer le message entrant
    const inboundMessage = await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: 'inbound',
        content: text,
        messageType,
        whatsappMessageId: whatsappMessageId || undefined,
      },
    });

    emitNewMessage(inboundMessage, lead);

    // 4. Si l'humain a pris la main, ne pas faire répondre l'IA
    if (lead.aiDisabled) {
      console.log(`[WhatsApp] Lead ${lead.phone} en prise de main humaine: réponse IA suspendue.`);
      return { duplicate: false, processedByAI: false };
    }

    // 5. Exécution du workflow IA
    await this.processLeadThroughAI({
      leadId: lead.id,
      inboundText: text,
      phone,
    });

    return { duplicate: false, processedByAI: true };
  }

  /**
   * Traitement du message par l'agent IA, scoring et synchronisations
   */
  public async processLeadThroughAI(data: { leadId: string; inboundText: string; phone: string }) {
    const { leadId, inboundText, phone } = data;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 20,
        },
      },
    });

    if (!lead) return;

    // Historique formaté
    const history = lead.messages.map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

    // Appel Agent IA
    const aiOutput = await agentService.qualifyMessage({
      inboundText,
      senderPhone: phone,
      conversationHistory: history,
      existingLeadData: lead,
    });

    // Calcul du score et du routage selon la logique n8n d'origine
    const scoreResult = computeScore(aiOutput);

    // Mise à jour du Lead
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        conversationStage: aiOutput.conversation_stage,
        intent: aiOutput.intent,
        customerType: aiOutput.customer_type,
        need: aiOutput.need || lead.need,
        participantsCount: aiOutput.participants_count ?? lead.participantsCount,
        preferredDate: aiOutput.preferred_date || lead.preferredDate,
        budget: aiOutput.budget || lead.budget,
        recommendedOffer: aiOutput.recommended_offer || lead.recommendedOffer,
        productIdentified: aiOutput.product_identified,
        purchaseIntent: aiOutput.purchase_intent,
        availabilityConfirmed: aiOutput.availability_confirmed,
        productStandard: aiOutput.product_standard,
        customRequest: aiOutput.custom_request,
        isB2B: aiOutput.is_b2b,
        isVip: aiOutput.is_vip,
        interactionLevel: aiOutput.interaction_level,
        objections: JSON.stringify(aiOutput.objections || []),
        qualificationScore: scoreResult.score,
        leadStatus: scoreResult.leadStatus,
        nextStep: scoreResult.nextStep,
        firstName: aiOutput.first_name || lead.firstName,
        lastName: aiOutput.last_name || lead.lastName,
        email: aiOutput.email || lead.email,
      },
    });

    // Sauvegarde du message de réponse sortant
    const outboundMessage = await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: 'outbound',
        content: aiOutput.whatsapp_message,
        messageType: 'text',
      },
    });

    // Envoi effectif sur WhatsApp
    await this.sendWhatsAppMessage(phone, aiOutput.whatsapp_message);

    // Événements temps réel
    emitNewMessage(outboundMessage, updatedLead);
    emitLeadUpdated(updatedLead);

    // Alerte si opportunité chaude, B2B ou VIP
    if (scoreResult.leadStatus === 'Opportunite chaude' || aiOutput.is_b2b || aiOutput.is_vip) {
      emitLeadAlert({
        leadId: updatedLead.id,
        reason: aiOutput.is_b2b
          ? 'Demande Entreprise (B2B)'
          : aiOutput.is_vip
          ? 'Client VIP'
          : 'Opportunité chaude (Score ≥ 80)',
        lead: updatedLead,
      });
    }

    // Déclenchement asynchrone de la synchronisation HubSpot
    await enqueueHubspotSync({ leadId: updatedLead.id });
  }

  /**
   * Envoi d'un message manuel par un agent humain
   */
  public async sendManualMessage(leadId: string, content: string, agentUserId: string) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) throw new Error('Lead introuvable');

    // Enregistrement message sortant avec id de l'agent
    const message = await prisma.message.create({
      data: {
        leadId,
        direction: 'outbound',
        content,
        sentByAgentId: agentUserId,
      },
    });

    // Désactivation automatique de l'IA lors d'une intervention humaine directe
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        aiDisabled: true,
        assignedAgentId: agentUserId,
      },
    });

    // Enregistrement dans le journal d'audit
    await prisma.auditLog.create({
      data: {
        actorId: agentUserId,
        action: 'message.sent_manually',
        entityId: leadId,
        metadata: JSON.stringify({ contentPreview: content.substring(0, 100) }),
      },
    });

    // Envoi via Evolution API
    await this.sendWhatsAppMessage(lead.phone, content);

    emitNewMessage(message, updatedLead);
    emitLeadUpdated(updatedLead);

    return { message, lead: updatedLead };
  }
}

export const whatsAppService = new WhatsAppService();
