import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../plugins/auth.js';
import { prisma } from '../../plugins/prisma.js';

export async function conversationsRoutes(fastify: FastifyInstance) {
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);

    // Liste des conversations avec dernier message et état
    protectedRoutes.get('/api/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
      const leadsWithLastMessage = await prisma.lead.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          assignedAgent: {
            select: { id: true, name: true },
          },
        },
      });

      return reply.send(leadsWithLastMessage);
    });

    // Historique complet des messages d'un lead
    protectedRoutes.get(
      '/api/conversations/:leadId/messages',
      async (request: FastifyRequest<{ Params: { leadId: string }; Querystring: { limit?: string; before?: string } }>, reply: FastifyReply) => {
        const { leadId } = request.params;
        const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 100);

        const messages = await prisma.message.findMany({
          where: { leadId },
          take: limit,
          orderBy: { createdAt: 'asc' },
        });

        return reply.send({ data: messages });
      }
    );
  });
}
