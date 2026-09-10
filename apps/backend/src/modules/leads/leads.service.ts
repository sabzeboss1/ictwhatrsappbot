import { prisma } from '../../plugins/prisma.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { hubspotService } from '../hubspot/hubspot.service.js';
import { emitLeadUpdated } from '../../plugins/socketio.js';

export class LeadsService {
  public async getLeads(params: {
    status?: string;
    stage?: string;
    search?: string;
    assignedAgentId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.status) {
      where.leadStatus = params.status;
    }

    if (params.stage) {
      where.conversationStage = params.stage;
    }

    if (params.assignedAgentId) {
      where.assignedAgentId = params.assignedAgentId;
    }

    if (params.search) {
      const s = params.search.trim();
      where.OR = [
        { phone: { contains: s } },
        { firstName: { contains: s } },
        { lastName: { contains: s } },
        { email: { contains: s } },
        { company: { contains: s } },
        { recommendedOffer: { contains: s } },
      ];
    }

    const [total, data] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          assignedAgent: {
            select: { id: true, name: true, email: true },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async getLeadById(id: string) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        assignedAgent: {
          select: { id: true, name: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!lead) return null;

    // Parser le champ objections JSON si stocké sous forme de string
    let parsedObjections: string[] = [];
    try {
      parsedObjections = JSON.parse(lead.objections || '[]');
    } catch {
      parsedObjections = [];
    }

    return {
      ...lead,
      objectionsList: parsedObjections,
    };
  }

  public async updateLead(
    id: string,
    data: {
      leadStatus?: string;
      nextStep?: string;
      assignedAgentId?: string | null;
      conversationStage?: string;
      aiDisabled?: boolean;
    },
    actorId?: string
  ) {
    const updated = await prisma.lead.update({
      where: { id },
      data,
      include: {
        assignedAgent: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Journal d'audit
    await prisma.auditLog.create({
      data: {
        actorId: actorId || 'system',
        action: 'lead.updated',
        entityId: id,
        metadata: JSON.stringify(data),
      },
    });

    emitLeadUpdated(updated);
    return updated;
  }

  public async sendManualMessage(leadId: string, content: string, agentUserId: string) {
    return await whatsAppService.sendManualMessage(leadId, content, agentUserId);
  }

  public async resyncHubspot(leadId: string, actorId?: string) {
    const result = await hubspotService.syncLeadToHubSpot(leadId);

    await prisma.auditLog.create({
      data: {
        actorId: actorId || 'system',
        action: 'hubspot.resync_forced',
        entityId: leadId,
        metadata: JSON.stringify(result),
      },
    });

    const lead = await this.getLeadById(leadId);
    if (lead) emitLeadUpdated(lead);

    return result;
  }
}

export const leadsService = new LeadsService();
