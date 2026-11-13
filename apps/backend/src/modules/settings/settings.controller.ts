import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { agentService } from '../agent/agent.service.js';
import { env } from '../../config/env.js';
import { prisma } from '../../plugins/prisma.js';

function maskApiKey(key?: string | null): string {
  if (!key || key.trim().length < 8) return '';
  const clean = key.trim();
  return `${clean.slice(0, 6)}••••••••${clean.slice(-4)}`;
}

function tryUpdateDotEnvFile(updates: Record<string, string>): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const envPath of candidates) {
    try {
      if (!fs.existsSync(envPath)) continue;
      let content = fs.readFileSync(envPath, 'utf-8');
      for (const [k, v] of Object.entries(updates)) {
        const regex = new RegExp(`^${k}=.*$`, 'm');
        if (regex.test(content)) {
          content = content.replace(regex, `${k}=${v}`);
        } else {
          content = content.trimEnd() + `\n${k}=${v}\n`;
        }
      }
      fs.writeFileSync(envPath, content, 'utf-8');
    } catch {
      // Ignorer silencieusement en environnement Docker read-only
    }
  }
}

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.register(async (adminRoutes) => {
    adminRoutes.addHook('preHandler', authenticate);
    adminRoutes.addHook('preHandler', requireRole(['admin']));

    // Affichage du prompt système actif
    adminRoutes.get('/api/settings/prompt', async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(agentService.getPromptVersion());
    });

    // ═══════════════════════════════════════════════════════════
    // GET /api/settings/ai — Configuration actuelle du moteur IA (clé masquée)
    // ═══════════════════════════════════════════════════════════
    adminRoutes.get('/api/settings/ai', async (_request: FastifyRequest, reply: FastifyReply) => {
      const hasGeminiKey = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 5);
      const hasOpenaiKey = Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 5);
      const hasAnthropicKey = Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim().length > 5);

      return reply.send({
        aiProvider: env.AI_PROVIDER || 'gemini',
        geminiModel: env.GEMINI_MODEL || 'gemini-flash-latest',
        hasGeminiKey,
        maskedGeminiKey: maskApiKey(env.GEMINI_API_KEY),
        hasOpenaiKey,
        maskedOpenaiKey: maskApiKey(env.OPENAI_API_KEY),
        openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
        hasAnthropicKey,
        maskedAnthropicKey: maskApiKey(env.ANTHROPIC_API_KEY),
        anthropicModel: env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
      });
    });

    // ═══════════════════════════════════════════════════════════
    // PUT /api/settings/ai — Mettre à jour la clé Gemini / modèle IA depuis l'interface
    // ═══════════════════════════════════════════════════════════
    adminRoutes.put('/api/settings/ai', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body as {
        aiProvider?: 'gemini' | 'openai' | 'anthropic';
        geminiApiKey?: string;
        geminiModel?: string;
        openaiApiKey?: string;
        openaiModel?: string;
        anthropicApiKey?: string;
        anthropicModel?: string;
      }) || {};

      // Récupérer la config existante en DB pour ne pas écraser une clé non modifiée
      const existingRow = await prisma.appSetting.findUnique({ where: { key: 'ai_config' } }).catch(() => null);
      const currentVal = (existingRow?.value && typeof existingRow.value === 'object' ? existingRow.value : {}) as Record<string, any>;

      const isNewGeminiKey =
        typeof body.geminiApiKey === 'string' &&
        body.geminiApiKey.trim().length > 0 &&
        !body.geminiApiKey.includes('••••');

      const nextConfig = {
        aiProvider: body.aiProvider || currentVal.aiProvider || env.AI_PROVIDER || 'gemini',
        geminiApiKey: isNewGeminiKey ? body.geminiApiKey!.trim() : currentVal.geminiApiKey || env.GEMINI_API_KEY || '',
        geminiModel: (body.geminiModel || currentVal.geminiModel || env.GEMINI_MODEL || 'gemini-flash-latest').trim(),
        openaiApiKey:
          typeof body.openaiApiKey === 'string' && body.openaiApiKey.trim() && !body.openaiApiKey.includes('••••')
            ? body.openaiApiKey.trim()
            : currentVal.openaiApiKey || env.OPENAI_API_KEY || '',
        openaiModel: (body.openaiModel || currentVal.openaiModel || env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
        anthropicApiKey:
          typeof body.anthropicApiKey === 'string' && body.anthropicApiKey.trim() && !body.anthropicApiKey.includes('••••')
            ? body.anthropicApiKey.trim()
            : currentVal.anthropicApiKey || env.ANTHROPIC_API_KEY || '',
        anthropicModel: (body.anthropicModel || currentVal.anthropicModel || env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022').trim(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Sauvegarder en base de données PostgreSQL (persistant aux redémarrages Docker)
      await prisma.appSetting.upsert({
        where: { key: 'ai_config' },
        create: { key: 'ai_config', value: nextConfig as any },
        update: { value: nextConfig as any },
      });

      // 2. Appliquer immédiatement à chaud en mémoire dans AgentService
      agentService.updateAiConfig(nextConfig);

      // 3. Synchroniser également le fichier .env local s'il est accessible
      const envFileUpdates: Record<string, string> = {
        AI_PROVIDER: nextConfig.aiProvider,
        GEMINI_MODEL: nextConfig.geminiModel,
      };
      if (isNewGeminiKey) {
        envFileUpdates.GEMINI_API_KEY = nextConfig.geminiApiKey;
      }
      tryUpdateDotEnvFile(envFileUpdates);

      // 4. Journal d'audit
      await prisma.auditLog
        .create({
          data: {
            actorId: request.user?.userId || 'admin',
            action: 'settings.ai_updated',
            entityId: 'ai_config',
            metadata: {
              aiProvider: nextConfig.aiProvider,
              geminiModel: nextConfig.geminiModel,
              maskedGeminiKey: maskApiKey(nextConfig.geminiApiKey),
            },
          },
        })
        .catch(() => undefined);

      return reply.send({
        success: true,
        message: 'Configuration IA enregistrée et activée immédiatement.',
        aiProvider: nextConfig.aiProvider,
        geminiModel: nextConfig.geminiModel,
        hasGeminiKey: Boolean(nextConfig.geminiApiKey && nextConfig.geminiApiKey.length > 5),
        maskedGeminiKey: maskApiKey(nextConfig.geminiApiKey),
      });
    });

    // ═══════════════════════════════════════════════════════════
    // POST /api/settings/ai/test — Tester en direct la clé API Gemini
    // ═══════════════════════════════════════════════════════════
    adminRoutes.post('/api/settings/ai/test', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body as { geminiApiKey?: string; geminiModel?: string }) || {};
      const keyToTest =
        body.geminiApiKey && !body.geminiApiKey.includes('••••') ? body.geminiApiKey.trim() : undefined;
      const result = await agentService.testGeminiConnection(keyToTest, body.geminiModel);
      return reply.send(result);
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
