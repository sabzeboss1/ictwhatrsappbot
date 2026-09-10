import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../plugins/auth.js';
import { leadsService } from './leads.service.js';

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
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 20,
      });
      return reply.send(result);
    });

    // Détail d'un lead avec messages
    protectedRoutes.get('/api/leads/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const lead = await leadsService.getLeadById(request.params.id);
      if (!lead) {
        return reply.status(404).send({ error: 'Lead non trouvé' });
      }
      return reply.send(lead);
    });

    // Mise à jour d'un lead (statut, assignation, nextStep, bascule IA)
    protectedRoutes.patch('/api/leads/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { leadStatus, nextStep, assignedAgentId, conversationStage, aiDisabled } = (request.body as any) || {};
      const updated = await leadsService.updateLead(
        request.params.id,
        { leadStatus, nextStep, assignedAgentId, conversationStage, aiDisabled },
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
  });
}
