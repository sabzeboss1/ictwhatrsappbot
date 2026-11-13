import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../plugins/auth.js';
import { prisma } from '../../plugins/prisma.js';

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);

    // Métriques globales du Dashboard
    protectedRoutes.get('/api/stats/overview', async (request: FastifyRequest, reply: FastifyReply) => {
      const [
        totalLeads,
        coldLeads,
        warmLeads,
        qualifiedLeads,
        hotLeads,
        totalMessages,
        todayMessages,
        hotAlerts,
      ] = await Promise.all([
        prisma.lead.count(),
        prisma.lead.count({ where: { leadStatus: 'Prospect froid' } }),
        prisma.lead.count({ where: { leadStatus: 'Prospect tiede' } }),
        prisma.lead.count({ where: { leadStatus: 'Prospect qualifie' } }),
        prisma.lead.count({ where: { leadStatus: 'Opportunite chaude' } }),
        prisma.message.count(),
        prisma.message.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
        prisma.lead.findMany({
          where: {
            OR: [
              { leadStatus: 'Opportunite chaude' },
              { isB2B: true },
              { isVip: true },
            ],
          },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            company: true,
            leadStatus: true,
            qualificationScore: true,
            nextStep: true,
            customerType: true,
            recommendedOffer: true,
            quotedPrice: true,
            estimatedAmount: true,
            participantsCount: true,
            preferredDate: true,
            isB2B: true,
            isVip: true,
            updatedAt: true,
          },
        }),
      ]);

      // Pipeline estimé et répartition par offre
      const [pipelineAgg, byOfferRaw, pendingFollowUps] = await Promise.all([
        prisma.lead.aggregate({
          _sum: { estimatedAmount: true, participantsCount: true },
        }),
        prisma.lead.groupBy({
          by: ['recommendedOffer'],
          where: { recommendedOffer: { not: null } },
          _count: { _all: true },
          _sum: { estimatedAmount: true, participantsCount: true },
        }),
        prisma.followUp.count({ where: { status: 'pending' } }).catch(() => 0),
      ]);

      const byOffer = byOfferRaw
        .map((r) => ({
          offer: r.recommendedOffer || 'Non défini',
          count: r._count._all,
          amount: r._sum.estimatedAmount || 0,
          participants: r._sum.participantsCount || 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      // Calcul du taux de conversion (Clients ou Opportunités chaudes / Total)
      const convertedCount = await prisma.lead.count({
        where: {
          OR: [
            { conversationStage: 'CUSTOMER' },
            { conversationStage: 'CONVERSION' },
            { nextStep: 'Paiement' },
          ],
        },
      });

      const conversionRate = totalLeads > 0 ? ((convertedCount / totalLeads) * 100).toFixed(1) : '0.0';

      return reply.send({
        totalLeads,
        byStatus: {
          cold: coldLeads,
          warm: warmLeads,
          qualified: qualifiedLeads,
          hot: hotLeads,
        },
        totalMessages,
        todayMessages,
        conversionRate: parseFloat(conversionRate),
        recentAlerts: hotAlerts,
        estimatedPipelineFcfa: pipelineAgg._sum.estimatedAmount || 0,
        totalParticipants: pipelineAgg._sum.participantsCount || 0,
        pendingFollowUps,
        byOffer,
      });
    });

    // Données de l'entonnoir (Funnel)
    protectedRoutes.get('/api/stats/funnel', async (request: FastifyRequest, reply: FastifyReply) => {
      const stages = [
        'NEW_CONTACT',
        'DISCOVERY',
        'QUALIFICATION',
        'RECOMMENDATION',
        'OBJECTION_HANDLING',
        'CONVERSION',
        'CUSTOMER',
      ];

      const stageLabels: Record<string, string> = {
        NEW_CONTACT: 'Nouveau contact',
        DISCOVERY: 'Découverte',
        QUALIFICATION: 'Qualification',
        RECOMMENDATION: 'Recommandation',
        OBJECTION_HANDLING: 'Traitement objections',
        CONVERSION: 'Conversion',
        CUSTOMER: 'Client fidèle',
      };

      const counts = await Promise.all(
        stages.map(async (stage) => {
          const count = await prisma.lead.count({ where: { conversationStage: stage } });
          return {
            stage,
            label: stageLabels[stage] || stage,
            count,
          };
        })
      );

      return reply.send(counts);
    });
  });
}
