import axios from 'axios';
import { prisma } from '../../plugins/prisma.js';
import { env } from '../../config/env.js';
import { agentService } from '../agent/agent.service.js';
import { computeScore } from '../scoring/scoring.service.js';
import { enqueueHubspotSync } from '../../queues/message.queue.js';
import { emitLeadAlert, emitLeadUpdated, emitNewMessage } from '../../plugins/socketio.js';

export class WhatsAppService {
  /**
   * Cache LID → Phone pour éviter des appels API répétés.
   * Les Linked IDs (format @lid) sont une particularité de WhatsApp Business / Baileys
   * où le numéro réel n'est pas directement dans le JID.
   */
  private lidCache = new Map<string, string>();

  /**
   * Nettoie et normalise le numéro de téléphone WhatsApp
   * ex: 237699112233@s.whatsapp.net -> +237699112233
   */
  public normalizePhone(jid: string): string {
    if (jid.includes('@lid')) {
      // Vérifier le cache LID
      const cached = this.lidCache.get(jid);
      if (cached) {
        return cached;
      }
      // Si pas en cache, on garde le JID brut pour routage (sera résolu async)
      return jid;
    }
    let digits = jid.split('@')[0].replace(/\D/g, '');
    // Si format local français (10 chiffres commençant par 06 ou 07) -> +336...
    if ((digits.startsWith('06') || digits.startsWith('07')) && digits.length === 10) {
      digits = '33' + digits.substring(1);
    }
    // Si format local camerounais (9 chiffres commençant par 6) -> +2376...
    if (digits.startsWith('6') && digits.length === 9) {
      digits = '237' + digits;
    }
    return `+${digits}`;
  }

  private isValidE164Digits(digits: string): boolean {
    // Un vrai numéro WhatsApp international a entre 9 et 15 chiffres et ne commence JAMAIS par 00 ou 0
    return /^\d{9,15}$/.test(digits) && !digits.startsWith('0');
  }

  /**
   * Résout un LID (Linked ID) vers un vrai numéro de téléphone via l'API Evolution.
   * Utilise un cache en mémoire pour éviter les appels répétés.
   * 
   * Si aucun vrai numéro international n'est trouvé, CONSERVE LE JID LID NATIF.
   * WhatsApp et Evolution API savent délivrer les messages directement sur un JID LID (@lid) !
   */
  public async resolveLidToPhone(lid: string, participantHint?: string): Promise<string> {
    // 1. Cache (invalider si c'était un ancien numéro corrompu commençant par +000)
    const cached = this.lidCache.get(lid);
    if (cached) {
      if (cached.includes('@lid')) {
        return cached;
      }
      const digits = cached.replace(/\D/g, '');
      if (this.isValidE164Digits(digits)) {
        console.log(`[LID Cache] Résolu depuis le cache: ${lid} → ${cached}`);
        return cached;
      } else {
        console.log(`[LID Cache] Entrée corrompue invalidée: ${lid} → ${cached}`);
        this.lidCache.delete(lid);
      }
    }

    // 2. Indice du webhook (participant ou sender avec @s.whatsapp.net)
    if (participantHint && participantHint.includes('@s.whatsapp.net')) {
      const hintDigits = participantHint.split('@')[0].replace(/\D/g, '');
      if (this.isValidE164Digits(hintDigits)) {
        const phone = this.normalizePhone(participantHint);
        this.lidCache.set(lid, phone);
        console.log(`[LID Résolution] Via participant hint: ${lid} → ${phone}`);
        return phone;
      }
    }

    // 3. Tenter via l'API Evolution findContacts
    try {
      const res = await axios.post(
        `${env.EVOLUTION_API_URL}/chat/findContacts/${env.EVOLUTION_INSTANCE_NAME}`,
        { where: { id: lid } },
        {
          headers: {
            apikey: env.EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );

      const contacts = res.data;
      if (Array.isArray(contacts) && contacts.length > 0) {
        const contact = contacts[0];
        // Ne JAMAIS utiliser contact.id s'il ne contient pas @s.whatsapp.net (sinon c'est un UUID/CUID de base)
        const candidateNumber = contact.number || (contact.id?.includes('@s.whatsapp.net') ? contact.id.split('@')[0] : null);
        if (candidateNumber) {
          const digits = candidateNumber.replace(/\D/g, '');
          if (this.isValidE164Digits(digits)) {
            const phone = this.normalizePhone(candidateNumber);
            this.lidCache.set(lid, phone);
            console.log(`[LID Résolution] Via API Evolution findContacts: ${lid} → ${phone}`);
            return phone;
          }
        }
      }
    } catch (err: any) {
      console.warn(`[LID Résolution] API Evolution findContacts non disponible: ${err.message}`);
    }

    // 4. Tenter via l'endpoint fetchProfile du contact
    try {
      const res = await axios.post(
        `${env.EVOLUTION_API_URL}/chat/fetchProfile/${env.EVOLUTION_INSTANCE_NAME}`,
        { number: lid },
        {
          headers: {
            apikey: env.EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );

      if (res.data?.number) {
        const digits = res.data.number.replace(/\D/g, '');
        if (this.isValidE164Digits(digits)) {
          const phone = this.normalizePhone(res.data.number);
          this.lidCache.set(lid, phone);
          console.log(`[LID Résolution] Via fetchProfile: ${lid} → ${phone}`);
          return phone;
        }
      }
    } catch (err: any) {
      console.warn(`[LID Résolution] fetchProfile non disponible: ${err.message}`);
    }

    // 5. Fallback CRUCIAL: GARDER LE JID LID TEL QUEL !
    // Evolution API route parfaitement les messages directement vers l'identifiant LID.
    console.log(`[LID Résolution] Numéro téléphonique non exposé, utilisation du JID LID natif : ${lid}`);
    this.lidCache.set(lid, lid);
    return lid;
  }

  /**
   * Envoie un message WhatsApp via l'API Evolution
   */
  public async sendWhatsAppMessage(phone: string, text: string): Promise<any> {
    // Si c'est un @lid, envoyer le JID complet. Sinon, envoyer le numéro nettoyé.
    let target = phone.includes('@lid')
      ? phone
      : phone.includes('@s.whatsapp.net')
      ? phone.split('@')[0].replace(/[^\d]/g, '')
      : phone.replace(/[^\d]/g, '');

    // Conversion automatique indicatif si nécessaire :
    // Si format français local (10 chiffres commençant par 06 ou 07) -> 336... / 337...
    if ((target.startsWith('06') || target.startsWith('07')) && target.length === 10) {
      target = '33' + target.substring(1);
    }
    // Si format camerounais local (9 chiffres commençant par 6) -> 2376...
    if (target.startsWith('6') && target.length === 9) {
      target = '237' + target;
    }

    // Validation minimale : un numéro WhatsApp doit comporter au moins 8 chiffres (sauf si JID LID)
    if (!target.includes('@lid') && target.length < 8) {
      console.warn(
        `⚠ [WhatsApp API] Numéro "${phone}" incomplet ou non valide (${target.length} chiffres). Envoi WhatsApp annulé (le message reste visible dans l'interface).`
      );
      return { simulated: true, message: `Numéro trop court (${target}), envoi WhatsApp annulé`, error: 'Invalid phone length' };
    }

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

    // 4. Commande de réinitialisation directe par l'utilisateur (utile pour les tests)
    const cleanLower = text.trim().toLowerCase();
    if (cleanLower === 'reset' || cleanLower === 'recommencer' || cleanLower === 'menu' || cleanLower === '/reset') {
      const resetReply = "🔄 *Conversation réinitialisée !*\n\nBonjour et bienvenue chez Inside Cameroon Tourism ! 🇨🇲\n\nQuel type d'expérience touristique souhaitez-vous vivre au Cameroun (séjour balnéaire à Kribi, écotourisme en pirogue à Ebogo, ou ascension du Mont Cameroun) ?";

      const updatedLead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          conversationStage: 'DISCOVERY',
          participantsCount: null,
          preferredDate: null,
          budget: null,
          customerType: 'Particulier',
          isB2B: false,
          isVip: false,
          recommendedOffer: null,
          productIdentified: false,
          purchaseIntent: 'information',
          qualificationScore: 10,
          leadStatus: 'Nouveau',
          nextStep: 'Qualification',
          aiDisabled: false,
        },
      });

      const outboundMessage = await prisma.message.create({
        data: {
          leadId: lead.id,
          direction: 'outbound',
          content: resetReply,
          messageType: 'text',
        },
      });

      await this.sendWhatsAppMessage(phone, resetReply);
      emitNewMessage(outboundMessage, updatedLead);
      emitLeadUpdated(updatedLead);
      return { duplicate: false, processedByAI: true };
    }

    // 5. Si l'humain a pris la main, ne pas faire répondre l'IA
    if (lead.aiDisabled) {
      console.log(`[WhatsApp] Lead ${lead.phone} en prise de main humaine: réponse IA suspendue.`);
      return { duplicate: false, processedByAI: false };
    }

    // 6. Exécution du workflow IA
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

    // Nettoyage de sécurité: si le nombre de participants en base était anormal (ex: 600 issu du bug budget), le corriger
    const cleanParticipants =
      aiOutput.participants_count !== undefined && aiOutput.participants_count !== null
        ? aiOutput.participants_count
        : lead.participantsCount && lead.participantsCount < 150
        ? lead.participantsCount
        : null;

    // Mise à jour du Lead
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        conversationStage: aiOutput.conversation_stage,
        intent: aiOutput.intent,
        customerType: aiOutput.customer_type,
        need: aiOutput.need || lead.need,
        participantsCount: cleanParticipants,
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
   * Configure le webhook Evolution API pour pointer vers le backend Docker interne.
   * TOUJOURS utiliser l'URL Docker interne, jamais l'URL externe.
   * Appelé au démarrage du serveur ET lors de la connexion d'instance.
   */
  public async ensureWebhookConfigured(): Promise<boolean> {
    // CRUCIAL: Toujours utiliser l'URL Docker interne pour le webhook.
    // L'URL externe (ex: https://bot.bossseo.net) ne fonctionne PAS car
    // Evolution API est dans le même réseau Docker et doit joindre le backend directement.
    const targetWebhookUrl = `http://backend:3001/webhooks/whatsapp`;

    try {
      console.log(`[Evolution API] Configuration du webhook → ${targetWebhookUrl}`);
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
            webhookByEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
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
      console.log(`✓ [Evolution API] Webhook configuré avec succès → ${targetWebhookUrl}`);
      return true;
    } catch (e: any) {
      console.warn('[Evolution API] Échec configuration webhook:', e?.response?.data || e.message);
      return false;
    }
  }

  /**
   * Gère les événements CONNECTION_UPDATE reçus par le webhook.
   * Reconfigure automatiquement le webhook après une reconnexion réussie.
   */
  public async handleConnectionUpdate(data: any): Promise<void> {
    const state = data?.state || data?.instance?.state;
    const statusReason = data?.statusReason;

    console.log(`[Connection Update] État: ${state}, Raison: ${statusReason || 'N/A'}`);

    if (state === 'open') {
      console.log('[Connection Update] WhatsApp connecté ! Reconfiguration du webhook...');
      // Petit délai pour laisser l'instance se stabiliser
      setTimeout(async () => {
        try {
          const ok = await this.ensureWebhookConfigured();
          if (ok) {
            console.log('✓ [Connection Update] Webhook reconfiguré avec succès après reconnexion');
          } else {
            console.warn('⚠ [Connection Update] Échec reconfiguration webhook post-connexion');
          }
        } catch (e: any) {
          console.error('[Connection Update] Erreur reconfiguration webhook:', e.message);
        }
      }, 2000);
    } else if (state === 'close') {
      console.log('[Connection Update] WhatsApp déconnecté.');
    }
  }

  /**
   * Connecte l'instance WhatsApp : crée l'instance si besoin, configure le webhook, et renvoie le QR Code
   */
  public async connectInstance(_webhookBaseUrl?: string): Promise<{
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

    // 2. Configurer le Webhook automatiquement (toujours Docker interne)
    await this.ensureWebhookConfigured();

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
