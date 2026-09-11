import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env.js';
import { whatsAppService } from './whatsapp.service.js';

export async function whatsappRoutes(fastify: FastifyInstance) {
  // Webhook Evolution API
  fastify.post('/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = request.headers['x-webhook-secret'];

    // Vérification de sécurité stricte
    if (!secret || secret !== env.EVOLUTION_WEBHOOK_SECRET) {
      return reply.status(401).send({ error: 'Secret de webhook invalide' });
    }

    const body: any = request.body || {};

    // 1. Réponse 200 immédiate exigée par Evolution API
    reply.status(200).send({ received: true, status: 'queued' });

    // 2. Extraction du message en tâche de fond (ne bloque pas le webhook)
    setImmediate(async () => {
      try {
        let rawPhone = '';
        let text = '';
        let whatsappMessageId: string | undefined = undefined;
        let pushName: string | undefined = undefined;
        let fromMe = false;
        let source = 'whatsapp';
        let campaign: string | undefined = undefined;

        // Structure standard Evolution API v2 (messages.upsert)
        if (body.data) {
          const data = body.data;
          const key = data.key || {};
          fromMe = Boolean(key.fromMe);
          whatsappMessageId = key.id;
          rawPhone = key.remoteJid || '';
          if (rawPhone.includes('@lid')) {
            const realJid = key.participant || data.participant || data.sender;
            if (realJid && realJid.includes('@s.whatsapp.net')) {
              rawPhone = realJid;
            }
          }
          pushName = data.pushName;

          const msg = data.message || {};
          text =
            msg.conversation ||
            msg.extendedTextMessage?.text ||
            msg.imageMessage?.caption ||
            '';

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
        }

        // Ignorer les messages que nous avons nous-mêmes envoyés depuis le WhatsApp émetteur
        if (fromMe) {
          return;
        }

        if (!rawPhone || !text) {
          return;
        }

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
