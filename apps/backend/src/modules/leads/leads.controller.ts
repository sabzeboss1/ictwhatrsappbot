import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../plugins/auth.js';
import { leadsService } from './leads.service.js';
import { buildCsv, buildXlsx } from './leads.export.js';
import { prisma } from '../../plugins/prisma.js';

export async function leadsRoutes(fastify: FastifyInstance) {
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);

    // Liste paginée et filtrable des leads
    protectedRoutes.get('/api/leads', async (request: FastifyRequest, reply: FastifyReply) => {
      const query: any = request.query;
      const result = await leadsService.getLeads({
        status: query.status,
        stage: query.stage,
        search: query.search,
        assignedAgentId: query.assignedAgentId,
        offer: query.offer,
        from: query.from,
        to: query.to,
        followUp: query.followUp,
        sort: query.sort,
        order: query.order,
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 20,
      });
      return reply.send(result);
    });

    // Extraction connectée des leads (CSV compatible Excel FR ou classeur Excel .xlsx enrichi)
    protectedRoutes.get('/api/leads/export', async (request: FastifyRequest, reply: FastifyReply) => {
      const query: any = request.query || {};
      const format = String(query.format || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
      const ids = query.ids
        ? String(query.ids)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        : undefined;

      const leads = await leadsService.getLeadsForExport({
        status: query.status,
        stage: query.stage,
        search: query.search,
        assignedAgentId: query.assignedAgentId,
        offer: query.offer,
        from: query.from,
        to: query.to,
        followUp: query.followUp,
        ids,
      });

      const dateTag = new Date().toISOString().slice(0, 10);
      await prisma.auditLog
        .create({
          data: {
            actorId: request.user?.userId || 'system',
            action: 'leads.exported',
            entityId: 'export',
            metadata: { format, count: leads.length },
          },
        })
        .catch(() => undefined);

      if (format === 'csv') {
        const buf = buildCsv(leads);
        reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="Leads_ICT_${dateTag}.csv"`);
        return reply.send(buf);
      }

      const filterDesc = [
        query.status && `Statut=${query.status}`,
        query.stage && `Étape=${query.stage}`,
        query.offer && `Offre=${query.offer}`,
        query.search && `Recherche="${query.search}"`,
        query.from && `Du ${query.from}`,
        query.to && `Au ${query.to}`,
        ids && `${ids.length} sélectionnés`,
      ]
        .filter(Boolean)
        .join(' • ');

      const buf = await buildXlsx(leads, {
        generatedBy: request.user?.name || request.user?.email,
        filters: filterDesc || 'Tous les prospects',
      });
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="Leads_ICT_${dateTag}.xlsx"`);
      return reply.send(buf);
    });

    // Détail d'un lead avec messages
    protectedRoutes.get('/api/leads/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const lead = await leadsService.getLeadById(request.params.id);
      if (!lead) {
        return reply.status(404).send({ error: 'Lead non trouvé' });
      }
      return reply.send(lead);
    });

    // Mise à jour d'un lead (statut, assignation, nextStep, bascule IA, coordonnées, critères de closing, notes)
    protectedRoutes.patch('/api/leads/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const {
        leadStatus,
        nextStep,
        assignedAgentId,
        conversationStage,
        aiDisabled,
        realPhone,
        firstName,
        lastName,
        email,
        company,
        recommendedOffer,
        quotedPrice,
        estimatedAmount,
        participantsCount,
        preferredDate,
        budget,
        closingNotes,
        followUpPaused,
        optOut,
      } = (request.body as any) || {};
      const updated = await leadsService.updateLead(
        request.params.id,
        {
          leadStatus,
          nextStep,
          assignedAgentId,
          conversationStage,
          aiDisabled,
          realPhone,
          firstName,
          lastName,
          email,
          company,
          recommendedOffer,
          quotedPrice,
          estimatedAmount,
          participantsCount,
          preferredDate,
          budget,
          closingNotes,
          followUpPaused,
          optOut,
        },
        request.user?.userId
      );
      return reply.send(updated);
    });

    // Prise de main humaine et envoi d'un message manuel
    protectedRoutes.post(
      '/api/leads/:id/messages',
      async (request: FastifyRequest<{ Params: { id: string }; Body: { content: string } }>, reply: FastifyReply) => {
        const { content } = request.body || {};
        if (!content || !content.trim()) {
          return reply.status(400).send({ error: 'Le contenu du message est requis' });
        }

        const agentId = request.user?.userId || 'agent-unknown';
        const result = await leadsService.sendManualMessage(request.params.id, content.trim(), agentId);
        return reply.send(result);
      }
    );

    // Forcer la synchronisation HubSpot
    protectedRoutes.post(
      '/api/leads/:id/resync-hubspot',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const result = await leadsService.resyncHubspot(request.params.id, request.user?.userId);
        return reply.send(result);
      }
    );

    // Réinitialiser la qualification d'un lead (utile pour recommencer un test)
    protectedRoutes.post(
      '/api/leads/:id/reset',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const result = await leadsService.resetLead(request.params.id, request.user?.userId);
        return reply.send(result);
      }
    );
  });
}
