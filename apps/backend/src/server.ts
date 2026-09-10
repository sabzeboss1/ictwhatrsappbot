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

// Importation des routes
import { authRoutes } from './modules/auth/auth.controller.js';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.controller.js';
import { leadsRoutes } from './modules/leads/leads.controller.js';
import { conversationsRoutes } from './modules/conversations/conversations.controller.js';
import { statsRoutes } from './modules/stats/stats.controller.js';
import { settingsRoutes } from './modules/settings/settings.controller.js';

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

    // Route racine de diagnostic rapide
    fastify.get('/', async () => {
      return {
        service: 'ICT WhatsApp AI Backend',
        status: 'online',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
      };
    });

    // 6. Démarrage du serveur HTTP
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`\n🚀 Serveur ICT WhatsApp AI actif sur http://localhost:${env.PORT}`);
    console.log(`📡 Webhook WhatsApp : http://localhost:${env.PORT}/webhooks/whatsapp`);
    console.log(`🔌 Socket.IO prêt pour les mises à jour temps réel\n`);
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
