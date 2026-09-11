import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { prisma } from '../../plugins/prisma.js';
import { agentService } from '../agent/agent.service.js';
import { SYSTEM_PROMPT_LEAD_QUALIFICATION, PROMPT_VERSION } from '../agent/prompts/lead-qualification.js';

export async function promptsRoutes(fastify: FastifyInstance) {
  fastify.register(async (adminRoutes) => {
    adminRoutes.addHook('preHandler', authenticate);
    adminRoutes.addHook('preHandler', requireRole(['admin']));

    // ═══════════════════════════════════════════════════════════
    // GET /api/prompts — Liste tous les templates de prompt
    // ═══════════════════════════════════════════════════════════
    adminRoutes.get('/api/prompts', async (request: FastifyRequest, reply: FastifyReply) => {
      const templates = await prisma.promptTemplate.findMany({
        orderBy: [
          { isActive: 'desc' },
          { isDefault: 'desc' },
          { updatedAt: 'desc' },
        ],
      });
      return reply.send(templates);
    });

    // ═══════════════════════════════════════════════════════════
    // GET /api/prompts/active — Retourne le template actif
    // ═══════════════════════════════════════════════════════════
    adminRoutes.get('/api/prompts/active', async (request: FastifyRequest, reply: FastifyReply) => {
      const active = await prisma.promptTemplate.findFirst({
        where: { isActive: true },
      });

      if (!active) {
        // Retourner le prompt par défaut hardcodé
        return reply.send({
          id: null,
          name: 'Prompt par défaut (hardcodé)',
          slug: 'default-hardcoded',
          prompt: SYSTEM_PROMPT_LEAD_QUALIFICATION,
          version: PROMPT_VERSION,
          isActive: true,
          isDefault: true,
          campaign: null,
          description: 'Prompt système original stocké dans le code source.',
        });
      }

      return reply.send(active);
    });

    // ═══════════════════════════════════════════════════════════
    // POST /api/prompts — Créer un nouveau template
    // ═══════════════════════════════════════════════════════════
    adminRoutes.post('/api/prompts', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        name: string;
        description?: string;
        prompt: string;
        campaign?: string;
        isActive?: boolean;
      };

      if (!body.name || !body.prompt) {
        return reply.status(400).send({ error: 'Le nom et le prompt sont requis.' });
      }

      // Générer un slug unique depuis le nom
      const baseSlug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const existingSlug = await prisma.promptTemplate.findUnique({ where: { slug: baseSlug } });
      const slug = existingSlug ? `${baseSlug}-${Date.now()}` : baseSlug;

      // Si ce template doit être actif, désactiver tous les autres
      if (body.isActive) {
        await prisma.promptTemplate.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
      }

      const template = await prisma.promptTemplate.create({
        data: {
          name: body.name,
          slug,
          description: body.description || null,
          prompt: body.prompt,
          campaign: body.campaign || null,
          isActive: body.isActive || false,
          isDefault: false,
        },
      });

      // Invalider le cache prompt de l'agent
      agentService.invalidatePromptCache();

      // Audit log
      await prisma.auditLog.create({
        data: {
          actorId: request.user?.userId,
          action: 'prompt.created',
          entityId: template.id,
          metadata: JSON.stringify({ name: template.name, slug: template.slug }),
        },
      });

      return reply.status(201).send(template);
    });

    // ═══════════════════════════════════════════════════════════
    // PUT /api/prompts/:id — Modifier un template existant
    // ═══════════════════════════════════════════════════════════
    adminRoutes.put('/api/prompts/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const body = request.body as {
        name?: string;
        description?: string;
        prompt?: string;
        campaign?: string;
        version?: string;
      };

      const existing = await prisma.promptTemplate.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Template introuvable.' });
      }

      const updated = await prisma.promptTemplate.update({
        where: { id },
        data: {
          name: body.name ?? existing.name,
          description: body.description !== undefined ? body.description : existing.description,
          prompt: body.prompt ?? existing.prompt,
          campaign: body.campaign !== undefined ? body.campaign : existing.campaign,
          version: body.version || incrementVersion(existing.version),
        },
      });

      // Invalider le cache si c'est le template actif
      if (updated.isActive) {
        agentService.invalidatePromptCache();
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          actorId: request.user?.userId,
          action: 'prompt.updated',
          entityId: id,
          metadata: JSON.stringify({ name: updated.name, version: updated.version }),
        },
      });

      return reply.send(updated);
    });

    // ═══════════════════════════════════════════════════════════
    // PUT /api/prompts/:id/activate — Activer un template
    // ═══════════════════════════════════════════════════════════
    adminRoutes.put('/api/prompts/:id/activate', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const existing = await prisma.promptTemplate.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Template introuvable.' });
      }

      // Désactiver tous les autres templates
      await prisma.promptTemplate.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      // Activer celui-ci
      const activated = await prisma.promptTemplate.update({
        where: { id },
        data: { isActive: true },
      });

      // Invalider le cache prompt de l'agent
      agentService.invalidatePromptCache();

      // Audit log
      await prisma.auditLog.create({
        data: {
          actorId: request.user?.userId,
          action: 'prompt.activated',
          entityId: id,
          metadata: JSON.stringify({ name: activated.name }),
        },
      });

      return reply.send({ success: true, template: activated });
    });

    // ═══════════════════════════════════════════════════════════
    // DELETE /api/prompts/:id — Supprimer un template
    // ═══════════════════════════════════════════════════════════
    adminRoutes.delete('/api/prompts/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const existing = await prisma.promptTemplate.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Template introuvable.' });
      }

      if (existing.isDefault) {
        return reply.status(403).send({ error: 'Le template par défaut ne peut pas être supprimé.' });
      }

      if (existing.isActive) {
        // Si on supprime le template actif, activer le default
        const defaultTemplate = await prisma.promptTemplate.findFirst({
          where: { isDefault: true },
        });
        if (defaultTemplate) {
          await prisma.promptTemplate.update({
            where: { id: defaultTemplate.id },
            data: { isActive: true },
          });
        }
      }

      await prisma.promptTemplate.delete({ where: { id } });

      // Invalider le cache
      agentService.invalidatePromptCache();

      // Audit log
      await prisma.auditLog.create({
        data: {
          actorId: request.user?.userId,
          action: 'prompt.deleted',
          entityId: id,
          metadata: JSON.stringify({ name: existing.name }),
        },
      });

      return reply.send({ success: true, message: `Template "${existing.name}" supprimé.` });
    });

    // ═══════════════════════════════════════════════════════════
    // POST /api/prompts/:id/duplicate — Dupliquer un template
    // ═══════════════════════════════════════════════════════════
    adminRoutes.post('/api/prompts/:id/duplicate', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const existing = await prisma.promptTemplate.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Template introuvable.' });
      }

      const newName = `${existing.name} (copie)`;
      const baseSlug = `${existing.slug}-copie-${Date.now()}`;

      const duplicate = await prisma.promptTemplate.create({
        data: {
          name: newName,
          slug: baseSlug,
          description: existing.description,
          prompt: existing.prompt,
          campaign: existing.campaign,
          isActive: false,
          isDefault: false,
          version: '1.0.0',
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          actorId: request.user?.userId,
          action: 'prompt.duplicated',
          entityId: duplicate.id,
          metadata: JSON.stringify({ sourceId: id, sourceName: existing.name }),
        },
      });

      return reply.status(201).send(duplicate);
    });
  });
}

/**
 * Incrémente la version mineure du prompt (ex: 1.0.0 → 1.1.0)
 */
function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3) return '1.1.0';
  parts[1] += 1;
  return parts.join('.');
}

// Ajouter la méthode incrementVersion au scope du module
(promptsRoutes as any).incrementVersion = incrementVersion;
