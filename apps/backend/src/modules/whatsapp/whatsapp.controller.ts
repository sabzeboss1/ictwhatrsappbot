import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env.js';
import { whatsAppService } from './whatsapp.service.js';

export async function whatsappRoutes(fastify: FastifyInstance) {
  // Webhook Evolution API
  fastify.post('/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = request.headers['x-webhook-secret'];
    const remoteIp = request.ip || '';

    // Vérification de sécurité : accepter si le header secret correspond OU si la requête vient du réseau Docker interne
    const isDockerInternal = remoteIp.startsWith('172.') || remoteIp.startsWith('10.') || remoteIp === '127.0.0.1' || remoteIp === '::1';
    const secretValid = secret && secret === env.EVOLUTION_WEBHOOK_SECRET;

    if (!secretValid && !isDockerInternal) {
      console.warn(`[Webhook] Requête rejetée de ${remoteIp} - secret invalide et hors réseau Docker`);
      return reply.status(401).send({ error: 'Secret de webhook invalide' });
    }

    console.log(`[Webhook] Requête acceptée de ${remoteIp} (Docker: ${isDockerInternal}, Secret: ${!!secretValid})`);

    const body: any = request.body || {};

    // 1. Réponse 200 immédiate exigée par Evolution API
    reply.status(200).send({ received: true, status: 'queued' });

    // 2. Extraction du message en tâche de fond (ne bloque pas le webhook)
    setImmediate(async () => {
      try {
        const rawEventType = body.event || '';
        const normalizedEvent = rawEventType.toLowerCase().replace(/_/g, '.');

        // ═══════════════════════════════════════════════════════════════
        // LOG DIAGNOSTIC : afficher chaque événement reçu
        // ═══════════════════════════════════════════════════════════════
        console.log(`[Webhook] Événement reçu: type="${rawEventType || 'N/A'}", clés: ${JSON.stringify(Object.keys(body))}`);

        // GESTION des événements CONNECTION_UPDATE
        if (normalizedEvent === 'connection.update') {
          console.log(`[Webhook] CONNECTION_UPDATE:`, JSON.stringify(body.data || body));
          await whatsAppService.handleConnectionUpdate(body.data || body);
          return;
        }

        // Ignorer les événements qui ne sont pas des messages entrants
        const ignoredEvents = [
          'qrcode.updated', 'messages.update', 'messages.delete',
          'presence.update', 'chats.update', 'chats.upsert', 'chats.delete',
          'contacts.update', 'contacts.upsert', 'groups.update', 'groups.upsert',
          'call', 'status.instance', 'labels.edit', 'labels.association',
          'typebot.start', 'typebot.change', 'send.message',
        ];
        if (normalizedEvent && ignoredEvents.includes(normalizedEvent)) {
          console.log(`[Webhook] Événement "${rawEventType}" ignoré (non pertinent)`);
          return;
        }

        let rawPhone = '';
        let text = '';
        let whatsappMessageId: string | undefined = undefined;
        let pushName: string | undefined = undefined;
        let fromMe = false;
        let source = 'whatsapp';
        let campaign: string | undefined = undefined;

        // Structure standard Evolution API v2 (messages.upsert)
        if (body.data) {
          const data = Array.isArray(body.data) ? body.data[0] : body.data;
          if (!data) {
            console.log('[Webhook] body.data est vide');
            return;
          }
          const key = data.key || {};
          fromMe = Boolean(key.fromMe);
          whatsappMessageId = key.id;
          rawPhone = key.remoteJid || '';

          // LOG : données clés extraites
          console.log(`[Webhook] Extraction: remoteJid="${rawPhone}", fromMe=${fromMe}, msgId="${whatsappMessageId}", pushName="${data.pushName || 'N/A'}"`);

          // RÉSOLUTION LID améliorée
          if (rawPhone.includes('@lid')) {
            console.log(`[Webhook] LID détecté: ${rawPhone}`);
            const participantHint = key.participant || data.participant || data.sender;
            if (participantHint && participantHint.includes('@s.whatsapp.net')) {
              rawPhone = participantHint;
              console.log(`[Webhook] LID résolu via participant hint: ${rawPhone}`);
            } else {
              const resolvedPhone = await whatsAppService.resolveLidToPhone(rawPhone, participantHint);
              rawPhone = resolvedPhone;
              console.log(`[Webhook] LID résolu: ${rawPhone}`);
            }
          }

          pushName = data.pushName;

          const rawMsg = data.message || {};
          const msg = rawMsg.ephemeralMessage?.message || rawMsg.viewOnceMessage?.message || rawMsg;
          text =
            msg.conversation ||
            msg.extendedTextMessage?.text ||
            msg.imageMessage?.caption ||
            msg.videoMessage?.caption ||
            msg.documentMessage?.caption ||
            msg.buttonsResponseMessage?.selectedDisplayText ||
            msg.listResponseMessage?.title ||
            msg.templateButtonReplyMessage?.selectedDisplayText ||
            '';

          // LOG : contenu du message extrait
          console.log(`[Webhook] Message extrait: text="${text ? text.substring(0, 80) : '(vide)'}", messageKeys=${JSON.stringify(Object.keys(msg))}`);

          // Détection Facebook Ads / Instagram Ads (Click-to-WhatsApp)
          const contextInfo = msg.extendedTextMessage?.contextInfo || msg.contextInfo;
          if (contextInfo) {
            const externalAd = contextInfo.externalAdReply;
            const app = contextInfo.entryPointConversionApp; // 'FB' ou 'IG'
            if (app === 'FB' || externalAd?.sourceUrl?.includes('facebook.com') || externalAd?.advertiserName) {
              source = 'facebook_ads';
              campaign = externalAd?.title || externalAd?.body || 'campagne_facebook_ads';
            } else if (app === 'IG' || externalAd?.sourceUrl?.includes('instagram.com')) {
              source = 'instagram_ads';
              campaign = externalAd?.title || 'campagne_instagram_ads';
            } else if (externalAd) {
              source = 'paid_ads';
              campaign = externalAd.title;
            }
          }
        } else if (body.phone && body.message) {
          // Format direct pratique pour tests / simulateur
          rawPhone = body.phone;
          text = body.message;
          whatsappMessageId = body.messageId || `sim_${Date.now()}_${Math.random()}`;
          pushName = body.pushName || 'Prospect Test';
          source = body.source || 'facebook_ads';
          campaign = body.campaign || 'Campagne Facebook Ads Test';
        } else {
          // LOG : structure inattendue
          console.log(`[Webhook] Structure non reconnue, body.data=${!!body.data}, body.phone=${!!body.phone}. Corps complet:`, JSON.stringify(body).substring(0, 500));
          return;
        }

        // Ignorer les messages que nous avons nous-mêmes envoyés
        if (fromMe) {
          console.log(`[Webhook] Message fromMe=true ignoré (message sortant)`);
          return;
        }

        if (!rawPhone || !text) {
          console.log(`[Webhook] Message ignoré: rawPhone="${rawPhone || '(vide)'}", text="${text ? text.substring(0, 50) : '(vide)'}"`);
          return;
        }

        console.log(`[Webhook] ✓ Traitement du message de ${rawPhone}: "${text.substring(0, 80)}"`);

        await whatsAppService.handleInboundMessage({
          rawPhone,
          text,
          whatsappMessageId,
          pushName,
          source,
          campaign,
        });
      } catch (err) {
        console.error('[Webhook WhatsApp] Erreur lors du traitement asynchrone:', err);
      }
    });
  });

  // Routes d'administration de l'instance WhatsApp
  fastify.register(async (protectedRoutes) => {
    // État de l'instance WhatsApp
    protectedRoutes.get('/api/whatsapp/status', async (request: FastifyRequest, reply: FastifyReply) => {
      const status = await whatsAppService.getInstanceStatus();
      return reply.send(status);
    });

    // Demande de connexion (génération du QR Code et configuration webhook)
    protectedRoutes.post('/api/whatsapp/connect', async (request: FastifyRequest, reply: FastifyReply) => {
      const host = request.headers.origin || request.headers.host;
      const baseUrl = host ? (host.startsWith('http') ? host : `https://${host}`) : undefined;
      const result = await whatsAppService.connectInstance(baseUrl);
      return reply.send(result);
    });

    // Déconnexion de l'instance
    protectedRoutes.post('/api/whatsapp/disconnect', async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await whatsAppService.disconnectInstance();
      return reply.send(result);
    });

    // Forcer la reconfiguration du webhook (Docker interne)
    protectedRoutes.post('/api/whatsapp/fix-webhook', async (request: FastifyRequest, reply: FastifyReply) => {
      const ok = await whatsAppService.ensureWebhookConfigured();
      return reply.send({
        success: ok,
        webhookUrl: 'http://backend:3001/webhooks/whatsapp',
        message: ok
          ? 'Webhook reconfiguré avec succès vers le backend Docker interne.'
          : 'Échec de la reconfiguration du webhook. Vérifiez les logs.',
      });
    });

    // Diagnostic du webhook actuel
    protectedRoutes.get('/api/whatsapp/debug-webhook', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const axios = (await import('axios')).default;
        const res = await axios.get(
          `${env.EVOLUTION_API_URL}/webhook/find/${env.EVOLUTION_INSTANCE_NAME}`,
          {
            headers: { apikey: env.EVOLUTION_API_KEY },
            timeout: 5000,
          }
        );
        return reply.send({ webhook: res.data });
      } catch (err: any) {
        return reply.send({ error: err?.response?.data || err.message });
      }
    });
  });
}
