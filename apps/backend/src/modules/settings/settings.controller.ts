import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { agentService } from '../agent/agent.service.js';
import { env } from '../../config/env.js';
import { prisma } from '../../plugins/prisma.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.register(async (adminRoutes) => {
    adminRoutes.addHook('preHandler', authenticate);
    adminRoutes.addHook('preHandler', requireRole(['admin']));

    // Affichage du prompt système actif
    adminRoutes.get('/api/settings/prompt', async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(agentService.getPromptVersion());
    });

    // Bilan de santé des connexions (Evolution API, HubSpot, Base de données, IA)
    adminRoutes.get('/api/settings/health', async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Base de données
      let dbStatus = 'healthy';
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (err: any) {
        dbStatus = 'unreachable';
      }

      // 2. Evolution API
      let evolutionStatus = 'unreachable';
      let evolutionDetails = '';
      try {
        const res = await axios.get(`${env.EVOLUTION_API_URL}`, {
          timeout: 2500,
          headers: { apikey: env.EVOLUTION_API_KEY },
        });
        evolutionStatus = res.status === 200 ? 'connected' : 'warning';
        evolutionDetails = `Instance: ${env.EVOLUTION_INSTANCE_NAME}`;
      } catch (err: any) {
        evolutionDetails = err.code || err.message;
      }

      // 3. HubSpot
      const hubspotConfigured = Boolean(env.HUBSPOT_ACCESS_TOKEN && env.HUBSPOT_ACCESS_TOKEN.length > 5);
      const hubspotStatus = hubspotConfigured ? 'connected' : 'not_configured';

      // 4. Moteur IA
      let aiConfigured = false;
      let activeProvider = 'Simulateur heuristique démo';
      const anthropicModelDisplay = env.ANTHROPIC_MODEL.includes('4-5')
        ? 'Claude Haiku 4.5'
        : env.ANTHROPIC_MODEL.includes('sonnet')
        ? 'Claude Sonnet'
        : env.ANTHROPIC_MODEL;

      if (env.AI_PROVIDER === 'gemini' && env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5) {
        aiConfigured = true;
        activeProvider = `Google Gemini (${env.GEMINI_MODEL || 'gemini-flash-latest'})`;
      } else if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 5) {
        aiConfigured = true;
        activeProvider = `OpenAI (${env.OPENAI_MODEL || 'gpt-4o-mini'})`;
      } else if (env.AI_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 5) {
        aiConfigured = true;
        activeProvider = `Anthropic (${anthropicModelDisplay})`;
      } else if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 5) {
        aiConfigured = true;
        activeProvider = `Google Gemini (${env.GEMINI_MODEL || 'gemini-flash-latest'})`;
      } else if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 5) {
        aiConfigured = true;
        activeProvider = `OpenAI (${env.OPENAI_MODEL || 'gpt-4o-mini'})`;
      } else if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 5) {
        aiConfigured = true;
        activeProvider = `Anthropic (${anthropicModelDisplay})`;
      }

      return reply.send({
        database: {
          status: dbStatus,
          type: env.DATABASE_URL.startsWith('file:') ? 'SQLite (Développement local)' : 'PostgreSQL (Production/Docker)',
        },
        evolutionApi: {
          status: evolutionStatus,
          url: env.EVOLUTION_API_URL,
          instance: env.EVOLUTION_INSTANCE_NAME,
          details: evolutionDetails,
        },
        hubspot: {
          status: hubspotStatus,
          pipelineId: env.HUBSPOT_PIPELINE_ID,
          configured: hubspotConfigured,
        },
        ai: {
          status: aiConfigured ? 'configured' : 'fallback_simulator',
          provider: activeProvider,
          configured: aiConfigured,
        },
      });
    });
  });
}
