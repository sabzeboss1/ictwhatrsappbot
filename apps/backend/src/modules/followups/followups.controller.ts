import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../../plugins/auth.js';
import { followUpsService, renderTemplate } from './followups.service.js';
import { getFollowUpSettings, saveFollowUpSettings, DEFAULT_FOLLOWUP_SETTINGS } from './followup.settings.js';
import { prisma } from '../../plugins/prisma.js';

function parseDate(value: any): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function followUpsRoutes(fastify: FastifyInstance) {
  fastify.register(async (r) => {
    r.addHook('preHandler', authenticate);

    r.get('/api/followups', async (request: FastifyRequest) => {
      const q: any = request.query || {};
      return followUpsService.list({
        status: q.status || undefined,
        leadId: q.leadId || undefined,
        page: q.page ? parseInt(q.page) : 1,
        limit: q.limit ? parseInt(q.limit) : 25,
      });
    });

    r.get('/api/followups/stats', async () => followUpsService.stats());

    r.get('/api/followups/upcoming', async () => followUpsService.upcomingAuto(50));

    // Les conseillers peuvent lire les modèles (pour la relance manuelle), seuls les admins modifient
    r.get('/api/followups/settings', async () => getFollowUpSettings());

    r.put(
      '/api/followups/settings',
      { preHandler: requireRole(['admin']) },
      async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const saved = await saveFollowUpSettings(request.body);
          await prisma.auditLog.create({
            data: { actorId: request.user?.userId || 'system', action: 'followup.settings_updated', entityId: 'followup.settings' },
          });
          return reply.send(saved);
        } catch (e: any) {
          return reply.status(400).send({ error: 'Paramètres invalides', details: e.errors || e.message });
        }
      }
    );

    r.post(
      '/api/followups/settings/reset',
      { preHandler: requireRole(['admin']) },
      async () => saveFollowUpSettings(DEFAULT_FOLLOWUP_SETTINGS)
    );

    // Aperçu du rendu d'un message pour un lead
    r.post('/api/followups/preview', async (request: FastifyRequest, reply: FastifyReply) => {
      const { leadId, message } = (request.body as any) || {};
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return reply.status(404).send({ error: 'Lead introuvable' });
      return { text: renderTemplate(String(message || ''), lead) };
    });

    // Programmer une relance pour un lead (immédiate si scheduledAt absent)
    r.post('/api/leads/:id/followups', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { message, scheduledAt } = (request.body as any) || {};
      if (!message || !String(message).trim()) return reply.status(400).send({ error: 'Le message est requis' });
      try {
        const fu = await followUpsService.schedule({
          leadId: request.params.id,
          message: String(message).trim(),
          scheduledAt: parseDate(scheduledAt),
          createdById: request.user?.userId,
        });
        return reply.send(fu);
      } catch (e: any) {
        return reply.status(400).send({ error: e.message });
      }
    });

    // Relance groupée (étalée automatiquement dans le temps)
    r.post('/api/followups/bulk', async (request: FastifyRequest, reply: FastifyReply) => {
      const { leadIds, message, scheduledAt } = (request.body as any) || {};
      if (!Array.isArray(leadIds) || leadIds.length === 0) return reply.status(400).send({ error: 'Aucun prospect sélectionné' });
      if (!message || !String(message).trim()) return reply.status(400).send({ error: 'Le message est requis' });
      const result = await followUpsService.scheduleBulk({
        leadIds,
        message: String(message).trim(),
        scheduledAt: parseDate(scheduledAt),
        createdById: request.user?.userId,
      });
      return reply.send(result);
    });

    r.delete('/api/followups/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const res = await followUpsService.cancel(request.params.id);
      return { cancelled: res.count };
    });
  });
}
