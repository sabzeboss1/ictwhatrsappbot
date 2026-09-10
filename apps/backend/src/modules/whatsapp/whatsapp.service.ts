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
    if (jid.includes('@lid')) {
      // Si c'est un Linked ID, conserver l'identifiant pour garantir le routage
      return jid;
    }
    const rawNumber = jid.split('@')[0].replace(/[^\d+]/g, '');
    return rawNumber.startsWith('+') ? rawNumber : `+${rawNumber}`;
  }

  /**
   * Envoie un message WhatsApp via l'API Evolution
   */
  public async sendWhatsAppMessage(phone: string, text: string): Promise<any> {
    // Si c'est un @lid, envoyer le JID complet. Sinon, envoyer le numéro nettoyé.
    const target = phone.includes('@lid')
      ? phone
      : phone.includes('@s.whatsapp.net')
      ? phone.split('@')[0].replace(/[^\d]/g, '')
      : phone.replace(/[^\d]/g, '');

    const url = `${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE_NAME}`;

    try {
      console.log(`[WhatsApp API] Envoi message sortant à ${target}...`);
      const response = await axios.post(
        url,
        {
          number: target,
          text: text,
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
      console.log(`✓ [WhatsApp API] Réponse délivrée à ${target}:`, JSON.stringify(response.data));
      return response.data;
    } catch (err: any) {
      console.error(
        `✗ [WhatsApp API] Échec envoi à ${phone}:`,
        JSON.stringify(err.response?.data || err.message)
      );
      return { simulated: true, message: 'Message enregistré localement', error: err.message };
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
        objections: (aiOutput.objections || []) as any,
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

  /**
   * Vérifie l'état de connexion de l'instance WhatsApp sur Evolution API
   */
  public async getInstanceStatus(): Promise<{
    configured: boolean;
    instanceName: string;
    state: 'open' | 'close' | 'connecting' | 'unreachable';
    connected: boolean;
    phone?: string;
    profileName?: string;
    profilePictureUrl?: string;
  }> {
    const url = `${env.EVOLUTION_API_URL}/instance/connectionState/${env.EVOLUTION_INSTANCE_NAME}`;
    try {
      const res = await axios.get(url, {
        headers: { apikey: env.EVOLUTION_API_KEY },
        timeout: 4000,
      });

      const state = res.data?.instance?.state || 'close';
      const connected = state === 'open';

      // Récupérer le numéro si connecté
      let phone: string | undefined = undefined;
      let profileName: string | undefined = undefined;
      let profilePictureUrl: string | undefined = undefined;

      if (connected) {
        try {
          const profileRes = await axios.get(
            `${env.EVOLUTION_API_URL}/chat/fetchProfile/${env.EVOLUTION_INSTANCE_NAME}`,
            {
              headers: { apikey: env.EVOLUTION_API_KEY },
              timeout: 3000,
            }
          );
          phone = profileRes.data?.number;
          profileName = profileRes.data?.name;
          profilePictureUrl = profileRes.data?.pictureUrl;
        } catch {
          // Ignorer si fetchProfile non supporté
        }
      }

      return {
        configured: true,
        instanceName: env.EVOLUTION_INSTANCE_NAME,
        state,
        connected,
        phone,
        profileName,
        profilePictureUrl,
      };
    } catch (err: any) {
      return {
        configured: false,
        instanceName: env.EVOLUTION_INSTANCE_NAME,
        state: 'unreachable',
        connected: false,
      };
    }
  }

  /**
   * Connecte l'instance WhatsApp : crée l'instance si besoin, configure le webhook, et renvoie le QR Code
   */
  public async connectInstance(webhookBaseUrl?: string): Promise<{
    success: boolean;
    state: string;
    qrcode?: string;
    base64?: string;
    pairingCode?: string;
    message?: string;
  }> {
    // 1. Tenter de créer l'instance si elle n'existe pas
    try {
      await axios.post(
        `${env.EVOLUTION_API_URL}/instance/create`,
        {
          instanceName: env.EVOLUTION_INSTANCE_NAME,
          token: 'ict_instance_token_2026',
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        },
        {
          headers: {
            apikey: env.EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 6000,
        }
      );
    } catch {
      // Si l'instance existe déjà, ignorer l'erreur
    }

    // 2. Configurer le Webhook automatiquement
    const targetWebhookUrl = webhookBaseUrl
      ? `${webhookBaseUrl.replace(/\/+$/, '')}/webhooks/whatsapp`
      : `http://backend:3001/webhooks/whatsapp`;

    try {
      await axios.post(
        `${env.EVOLUTION_API_URL}/webhook/set/${env.EVOLUTION_INSTANCE_NAME}`,
        {
          webhook: {
            enabled: true,
            url: targetWebhookUrl,
            headers: {
              'X-Webhook-Secret': env.EVOLUTION_WEBHOOK_SECRET,
            },
            byEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT'],
          },
        },
        {
          headers: {
            apikey: env.EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );
    } catch (e: any) {
      console.warn('[Evolution API] Avertissement config webhook:', e.message);
    }

    // 3. Obtenir le QR Code pour l'utilisateur
    try {
      const qrRes = await axios.get(
        `${env.EVOLUTION_API_URL}/instance/connect/${env.EVOLUTION_INSTANCE_NAME}`,
        {
          headers: { apikey: env.EVOLUTION_API_KEY },
          timeout: 8000,
        }
      );

      const data = qrRes.data || {};
      return {
        success: true,
        state: data.state || 'connecting',
        qrcode: data.code || data.qrcode,
        base64: data.base64,
        pairingCode: data.pairingCode,
        message: 'QR Code généré avec succès. Scannez-le avec WhatsApp.',
      };
    } catch (err: any) {
      return {
        success: false,
        state: 'error',
        message: `Erreur lors de la récupération du QR Code: ${err.message}`,
      };
    }
  }

  /**
   * Déconnecte l'instance WhatsApp
   */
  public async disconnectInstance(): Promise<{ success: boolean; message: string }> {
    try {
      await axios.delete(
        `${env.EVOLUTION_API_URL}/instance/logout/${env.EVOLUTION_INSTANCE_NAME}`,
        {
          headers: { apikey: env.EVOLUTION_API_KEY },
          timeout: 6000,
        }
      );
      return { success: true, message: 'Instance WhatsApp déconnectée.' };
    } catch (err: any) {
      return { success: false, message: `Erreur déconnexion: ${err.message}` };
    }
  }
}

export const whatsAppService = new WhatsAppService();

