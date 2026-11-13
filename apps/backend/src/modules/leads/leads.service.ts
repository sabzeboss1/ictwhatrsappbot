import { prisma } from '../../plugins/prisma.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { hubspotService } from '../hubspot/hubspot.service.js';
import { emitLeadUpdated } from '../../plugins/socketio.js';
import { followUpsService } from '../followups/followups.service.js';
import { getFollowUpSettings } from '../followups/followup.settings.js';

export interface LeadFilters {
  status?: string;
  stage?: string;
  search?: string;
  assignedAgentId?: string;
  offer?: string;
  from?: string;
  to?: string;
  followUp?: string; // 'waiting' (en attente de réponse) | 'optout' | 'paused'
  ids?: string[];
}

const SORTABLE_FIELDS = ['updatedAt', 'createdAt', 'qualificationScore', 'estimatedAmount', 'participantsCount', 'lastInboundAt'];

export class LeadsService {
  public buildWhere(params: LeadFilters) {
    const where: any = {};
    const and: any[] = [];

    if (params.ids && params.ids.length) where.id = { in: params.ids };
    if (params.status) where.leadStatus = params.status;
    if (params.stage) where.conversationStage = params.stage;
    if (params.assignedAgentId) where.assignedAgentId = params.assignedAgentId;
    if (params.offer) where.recommendedOffer = { contains: params.offer, mode: 'insensitive' };

    if (params.from || params.to) {
      const range: any = {};
      if (params.from) {
        const d = new Date(params.from);
        if (!isNaN(d.getTime())) range.gte = d;
      }
      if (params.to) {
        const d = new Date(params.to);
        if (!isNaN(d.getTime())) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(params.to)) d.setHours(23, 59, 59, 999);
          range.lte = d;
        }
      }
      if (Object.keys(range).length) where.createdAt = range;
    }

    if (params.followUp === 'optout') where.optOut = true;
    if (params.followUp === 'paused') where.followUpPaused = true;
    if (params.followUp === 'waiting') {
      where.optOut = false;
      where.lastOutboundAt = { not: null };
      where.lastInboundAt = { not: null };
    }

    if (params.search) {
      const s = params.search.trim();
      const ci = (field: string) => ({ [field]: { contains: s, mode: 'insensitive' } });
      and.push({
        OR: [
          { phone: { contains: s } },
          { realPhone: { contains: s } },
          ci('firstName'),
          ci('lastName'),
          ci('email'),
          ci('company'),
          ci('recommendedOffer'),
          ci('preferredDate'),
        ],
      });
    }

    if (and.length) where.AND = and;
    return where;
  }

  public async getLeads(params: LeadFilters & { page?: number; limit?: number; sort?: string; order?: string }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where = this.buildWhere(params);
    const sortField = params.sort && SORTABLE_FIELDS.includes(params.sort) ? params.sort : 'updatedAt';
    const sortOrder = params.order === 'asc' ? 'asc' : 'desc';
    const orderBy: any = ['estimatedAmount', 'participantsCount', 'lastInboundAt'].includes(sortField)
      ? [{ [sortField]: { sort: sortOrder, nulls: 'last' } }, { updatedAt: 'desc' }]
      : { [sortField]: sortOrder };

    const [total, rows, settings] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          assignedAgent: {
            select: { id: true, name: true, email: true },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          followUps: {
            where: { status: 'pending' },
            orderBy: { scheduledAt: 'asc' },
            take: 1,
          },
          _count: { select: { messages: true } },
        },
      }),
      getFollowUpSettings(),
    ]);

    let data = rows.map((l: any) => {
      const pending = l.followUps?.[0];
      const autoNext = followUpsService.computeNextAutoFollowUp(l, settings);
      const nextFollowUpAt = pending?.scheduledAt || autoNext || null;
      return {
        ...l,
        nextFollowUpAt,
        nextFollowUpType: pending ? 'manual' : autoNext ? 'auto' : null,
        awaitingReply: Boolean(l.lastOutboundAt && (!l.lastInboundAt || l.lastOutboundAt > l.lastInboundAt)),
      };
    });

    if (params.followUp === 'waiting') {
      data = data.filter((l: any) => l.awaitingReply);
    }

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Données complètes pour l'export (max 10 000 lignes). */
  public async getLeadsForExport(params: LeadFilters) {
    const where = this.buildWhere(params);
    const [rows, settings] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10000,
        include: {
          assignedAgent: { select: { name: true } },
          followUps: { where: { status: 'pending' }, orderBy: { scheduledAt: 'asc' }, take: 1 },
          _count: { select: { messages: true } },
        },
      }),
      getFollowUpSettings(),
    ]);
    let data = rows.map((l: any) => ({
      ...l,
      nextFollowUpAt: l.followUps?.[0]?.scheduledAt || followUpsService.computeNextAutoFollowUp(l, settings),
    }));
    if (params.followUp === 'waiting') {
      data = data.filter((l: any) => l.lastOutboundAt && (!l.lastInboundAt || l.lastOutboundAt > l.lastInboundAt));
    }
    return data;
  }

  public async getLeadById(id: string) {
    const [lead, settings] = await Promise.all([
      prisma.lead.findUnique({
        where: { id },
        include: {
          assignedAgent: {
            select: { id: true, name: true, email: true },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
          },
          followUps: {
            orderBy: { createdAt: 'desc' },
            take: 15,
          },
        },
      }),
      getFollowUpSettings(),
    ]);

    if (!lead) return null;

    // Gérer le champ objections (Array natif PostgreSQL ou JSON stringifié SQLite)
    let parsedObjections: string[] = [];
    if (Array.isArray(lead.objections)) {
      parsedObjections = lead.objections;
    } else if (typeof (lead as any).objections === 'string') {
      try {
        parsedObjections = JSON.parse((lead as any).objections || '[]');
      } catch {
        parsedObjections = [];
      }
    }

    const pendingFollowUp = lead.followUps?.find((f: any) => f.status === 'pending');
    const autoNext = followUpsService.computeNextAutoFollowUp(lead, settings);

    return {
      ...lead,
      objectionsList: parsedObjections,
      nextFollowUpAt: pendingFollowUp?.scheduledAt || autoNext || null,
      nextFollowUpType: pendingFollowUp ? 'manual' : autoNext ? 'auto' : null,
      awaitingReply: Boolean(lead.lastOutboundAt && (!lead.lastInboundAt || lead.lastOutboundAt > lead.lastInboundAt)),
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
      realPhone?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      company?: string | null;
      recommendedOffer?: string | null;
      quotedPrice?: string | null;
      estimatedAmount?: number | null;
      participantsCount?: number | null;
      preferredDate?: string | null;
      budget?: string | null;
      closingNotes?: string | null;
      followUpPaused?: boolean;
      optOut?: boolean;
    },
    actorId?: string
  ) {
    const cleanData: any = { ...data };
    if (cleanData.estimatedAmount !== undefined && cleanData.estimatedAmount !== null) {
      cleanData.estimatedAmount = Number(cleanData.estimatedAmount) || null;
    }
    if (cleanData.participantsCount !== undefined && cleanData.participantsCount !== null) {
      cleanData.participantsCount = Number(cleanData.participantsCount) || null;
    }
    if (cleanData.optOut === true) cleanData.optOutAt = new Date();
    if (cleanData.optOut === false) cleanData.optOutAt = null;

    const updated = await prisma.lead.update({
      where: { id },
      data: cleanData,
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

    // Synchronisation automatique HubSpot si les coordonnées ou le statut changent
    if (
      data.realPhone !== undefined ||
      data.email !== undefined ||
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.leadStatus !== undefined
    ) {
      this.resyncHubspot(id, actorId).catch((err) =>
        console.warn(`[LeadsService] Échec synchronisation HubSpot asynchrone pour ${id}:`, err.message)
      );
    }

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

  public async resetLead(id: string, actorId?: string) {
    const updated = await prisma.lead.update({
      where: { id },
      data: {
        conversationStage: 'DISCOVERY',
        participantsCount: null,
        preferredDate: null,
        budget: null,
        customerType: 'Particulier',
        isB2B: false,
        isVip: false,
        recommendedOffer: null,
        productIdentified: false,
        purchaseIntent: 'information',
        qualificationScore: 10,
        leadStatus: 'Nouveau',
        nextStep: 'Qualification',
        aiDisabled: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actorId || 'system',
        action: 'lead.reset',
        entityId: id,
        metadata: JSON.stringify({ reset: true }),
      },
    });

    emitLeadUpdated(updated);
    return updated;
  }
}

export const leadsService = new LeadsService();
