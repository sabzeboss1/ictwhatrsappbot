import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { env } from './config/env.js';
import { connectPrisma, prisma } from './plugins/prisma.js';
import { initSocketIO } from './plugins/socketio.js';
import { registerProcessors } from './queues/message.queue.js';
import { whatsAppService } from './modules/whatsapp/whatsapp.service.js';
import { hubspotService } from './modules/hubspot/hubspot.service.js';
import { SYSTEM_PROMPT_LEAD_QUALIFICATION, PROMPT_VERSION } from './modules/agent/prompts/lead-qualification.js';

// Importation des routes
import { authRoutes } from './modules/auth/auth.controller.js';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.controller.js';
import { leadsRoutes } from './modules/leads/leads.controller.js';
import { conversationsRoutes } from './modules/conversations/conversations.controller.js';
import { statsRoutes } from './modules/stats/stats.controller.js';
import { settingsRoutes } from './modules/settings/settings.controller.js';
import { promptsRoutes } from './modules/settings/prompts.controller.js';

const fastify = Fastify({
  logger: {
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
});

async function bootstrap() {
  try {
    // 1. Plugins de base Fastify
    await fastify.register(sensible);
    await fastify.register(cors, {
      origin: true,
      credentials: true,
    });

    await fastify.register(rateLimit, {
      max: 200,
      timeWindow: '1 minute',
    });

    // 2. Connexion Base de données
    await connectPrisma();

    // 3. Initialisation Socket.IO attaché au serveur HTTP sous-jacent
    initSocketIO(fastify.server, env.CORS_ORIGIN);

    // 4. Enregistrement des processeurs de files de messages BullMQ / Mémoire
    registerProcessors(
      async (data) => {
        await whatsAppService.processLeadThroughAI(data);
      },
      async (data) => {
        await hubspotService.syncLeadToHubSpot(data.leadId);
      }
    );

    // 5. Enregistrement des modules d'API
    await fastify.register(authRoutes);
    await fastify.register(whatsappRoutes);
    await fastify.register(leadsRoutes);
    await fastify.register(conversationsRoutes);
    await fastify.register(statsRoutes);
    await fastify.register(settingsRoutes);
    await fastify.register(promptsRoutes);

    // Route racine de diagnostic rapide
    fastify.get('/', async () => {
      return {
        service: 'ICT WhatsApp AI Backend',
        status: 'online',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
      };
    });

    // 6. Démarrage du serveur HTTP
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`\n🚀 Serveur ICT WhatsApp AI actif sur http://localhost:${env.PORT}`);
    console.log(`📡 Webhook WhatsApp : http://localhost:${env.PORT}/webhooks/whatsapp`);
    console.log(`🔌 Socket.IO prêt pour les mises à jour temps réel\n`);

    // 7. Auto-configuration du webhook Evolution API au démarrage
    // Délai de 5s pour laisser Evolution API démarrer complètement
    setTimeout(async () => {
      try {
        console.log('[Startup] Configuration automatique du webhook Evolution API...');
        const ok = await whatsAppService.ensureWebhookConfigured();
        if (ok) {
          console.log('✓ [Startup] Webhook Evolution API configuré avec succès (http://backend:3001/webhooks/whatsapp)');
        } else {
          console.warn('⚠ [Startup] Le webhook n\'a pas pu être configuré (Evolution API peut ne pas être prêt)');
        }
      } catch (e: any) {
        console.warn('[Startup] Webhook auto-config ignoré:', e.message);
      }
    }, 5000);

    // 8. Seed du prompt par défaut en base s'il n'existe pas encore
    try {
      const existingDefault = await prisma.promptTemplate.findFirst({
        where: { isDefault: true },
      });

      if (!existingDefault) {
        console.log('[Startup] Création du prompt par défaut en base de données...');
        await prisma.promptTemplate.create({
          data: {
            name: 'ICT Tourisme — Prompt Principal',
            slug: 'ict-tourisme-principal',
            description: 'Prompt système original d\'ICT pour la qualification commerciale WhatsApp. Agent IA de vente touristique.',
            prompt: SYSTEM_PROMPT_LEAD_QUALIFICATION,
            isActive: true,
            isDefault: true,
            campaign: null,
            version: PROMPT_VERSION,
          },
        });
        console.log('✓ [Startup] Prompt par défaut créé et activé');
      } else {
        console.log(`✓ [Startup] Prompt par défaut existant: "${existingDefault.name}" (v${existingDefault.version})`);
      }
    } catch (err: any) {
      console.warn('[Startup] Seed prompt ignoré (table peut ne pas exister encore):', err.message);
    }

    // 9. Nettoyage des leads créés avec le numéro corrompu "+000..." issu de l'ancien bug LID
    try {
      const corrupted = await prisma.lead.deleteMany({
        where: { phone: { startsWith: '+000' } },
      });
      if (corrupted.count > 0) {
        console.log(`✓ [Startup] Nettoyage de ${corrupted.count} lead(s) avec numéro corrompu (+000...)`);
      }
    } catch {
      // Ignorer si la table n'est pas encore prête
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Gestion de l'arrêt propre
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\nArrêt du serveur (${signal})...`);
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  });
});

bootstrap();
