import { prisma } from '../../plugins/prisma.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { emitLeadUpdated, emitNewMessage } from '../../plugins/socketio.js';
import { FollowUpSettings, getFollowUpSettings } from './followup.settings.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));

/** Heure locale (0-23) dans le fuseau configuré (Africa/Douala par défaut). */
export function localHour(date: Date, timezone: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: timezone }).format(date);
    return parseInt(h, 10) % 24;
  } catch {
    return date.getUTCHours();
  }
}

/** Vrai si l'heure courante est dans la plage autorisée d'envoi (hors heures calmes). */
export function isWithinSendingHours(date: Date, s: Pick<FollowUpSettings, 'quietStartHour' | 'quietEndHour' | 'timezone'>): boolean {
  const h = localHour(date, s.timezone);
  const start = s.quietEndHour; // début de la plage autorisée (ex: 8h)
  const end = s.quietStartHour; // fin de la plage autorisée (ex: 20h)
  if (start === end) return true;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

type LeadLike = {
  firstName?: string | null;
  recommendedOffer?: string | null;
  preferredDate?: string | null;
  participantsCount?: number | null;
  quotedPrice?: string | null;
};

const REQUIRED_VARS: Record<string, (l: LeadLike) => string | null> = {
  offre: (l) => l.recommendedOffer || null,
  date: (l) => l.preferredDate || null,
  participants: (l) => (l.participantsCount ? String(l.participantsCount) : null),
  prix: (l) => l.quotedPrice || null,
};

function cleanFirstName(l: LeadLike): string {
  const fn = (l.firstName || '').trim();
  if (!fn || /^prospect$/i.test(fn) || fn.includes('@') || /^\+?\d+$/.test(fn)) return '';
  return fn;
}

/** Remplace les variables {prenom} {offre} {date} {participants} {prix}. */
export function renderTemplate(template: string, lead: LeadLike): string {
  let out = template.replace(/\{prenom\}/gi, cleanFirstName(lead));
  for (const [k, fn] of Object.entries(REQUIRED_VARS)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'gi'), fn(lead) || '');
  }
  // Nettoyage des espaces orphelins devant virgule/point ("Bonjour , ..." -> "Bonjour, ...") tout en conservant l'espace français devant ? et !
  return out.replace(/[ \t]+([,.])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Indique si toutes les variables "métier" d'un modèle sont disponibles pour ce lead. */
export function templateIsApplicable(template: string, lead: LeadLike): boolean {
  const vars = Array.from(template.matchAll(/\{(\w+)\}/g)).map((m) => m[1].toLowerCase());
  return vars.every((v) => v === 'prenom' || (REQUIRED_VARS[v] ? Boolean(REQUIRED_VARS[v](lead)) : true));
}

/** Choisit aléatoirement une variante applicable (rotation = messages non identiques, anti-spam). */
export function pickTemplate(templates: string[], lead: LeadLike, avoid?: string | null): string {
  const applicable = templates.filter((t) => templateIsApplicable(t, lead));
  const pool = applicable.length > 0 ? applicable : templates.filter((t) => !/\{(offre|date|participants|prix)\}/i.test(t));
  const finalPool = pool.length > 0 ? pool : templates;
  const withoutLast = finalPool.length > 1 && avoid ? finalPool.filter((t) => renderTemplate(t, lead) !== avoid) : finalPool;
  return withoutLast[Math.floor(Math.random() * withoutLast.length)];
}

export class FollowUpsService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public start(intervalMs = 60_000) {
    if (this.timer) return;
    console.log('✓ [Relances] Planificateur de relances démarré (tick 60s)');
    this.backfillActivityDates().catch((e) => console.warn('[Relances] Backfill ignoré:', e.message));
    this.timer = setInterval(() => {
      this.tick().catch((e) => console.error('[Relances] Erreur tick:', e?.message || e));
    }, intervalMs);
  }

  public stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Renseigne lastInboundAt / lastOutboundAt pour les leads existants (avant ce module). */
  public async backfillActivityDates() {
    const leads = await prisma.lead.findMany({
      where: { lastInboundAt: null, lastOutboundAt: null },
      select: { id: true },
      take: 5000,
    });
    for (const l of leads) {
      const [lastIn, lastOut] = await Promise.all([
        prisma.message.findFirst({ where: { leadId: l.id, direction: 'inbound' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        prisma.message.findFirst({ where: { leadId: l.id, direction: 'outbound' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      ]);
      if (lastIn || lastOut) {
        await prisma.lead.update({
          where: { id: l.id },
          data: { lastInboundAt: lastIn?.createdAt || null, lastOutboundAt: lastOut?.createdAt || null },
        });
      }
    }
    if (leads.length) console.log(`[Relances] Backfill dates d'activité: ${leads.length} lead(s) analysé(s)`);
  }

  /** Date de la prochaine relance automatique prévue pour un lead (null si non éligible). */
  public computeNextAutoFollowUp(lead: any, s: FollowUpSettings): Date | null {
    if (!s.autoEnabled) return null;
    if (lead.optOut || lead.followUpPaused) return null;
    if (s.skipIfHumanHandling && lead.aiDisabled) return null;
    if (s.excludeStages.includes(lead.conversationStage)) return null;
    if ((lead.qualificationScore || 0) < s.minScore) return null;
    if (!lead.lastInboundAt || !lead.lastOutboundAt) return null;
    const lastIn = new Date(lead.lastInboundAt).getTime();
    const lastOut = new Date(lead.lastOutboundAt).getTime();
    if (lastOut < lastIn) return null; // c'est à nous de répondre, pas une relance
    if (Date.now() - lastIn > s.maxInactivityDays * 86_400_000) return null;
    const step = s.steps[lead.followUpCount || 0];
    if (!step) return null;
    return new Date(lastOut + step.delayHours * 3_600_000);
  }

  private async countSentLast24h(): Promise<number> {
    return prisma.followUp.count({
      where: { status: 'sent', sentAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
  }

  /**
   * Boucle principale : traite les relances manuelles échues puis les relances automatiques,
   * une par une, avec un intervalle aléatoire, dans la limite du plafond journalier.
   */
  public async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const s = await getFollowUpSettings();
      const now = new Date();
      if (!isWithinSendingHours(now, s)) return;

      let remaining = s.maxPerDay - (await this.countSentLast24h());
      if (remaining <= 0) return;

      const status = await whatsAppService.getInstanceStatus();
      if (!status.connected) return; // ne pas épuiser la file si WhatsApp est déconnecté

      // 1. Relances manuelles / programmées échues
      const manual = await prisma.followUp.findMany({
        where: { status: 'pending', scheduledAt: { lte: now } },
        orderBy: { scheduledAt: 'asc' },
        take: Math.min(remaining, 10),
      });

      let sentThisTick = 0;
      for (const fu of manual) {
        if (sentThisTick > 0) await sleep(randInt(s.minGapSeconds, s.maxGapSeconds) * 1000);
        if (!isWithinSendingHours(new Date(), s)) return;
        const ok = await this.deliver(fu.id, s);
        if (ok) {
          sentThisTick++;
          remaining--;
        }
        if (remaining <= 0) return;
      }

      // 2. Relances automatiques
      if (!s.autoEnabled || sentThisTick >= 10) return;
      const candidates = await prisma.lead.findMany({
        where: {
          optOut: false,
          followUpPaused: false,
          conversationStage: { notIn: s.excludeStages },
          qualificationScore: { gte: s.minScore },
          followUpCount: { lt: s.steps.length },
          lastInboundAt: { not: null, gte: new Date(Date.now() - s.maxInactivityDays * 86_400_000) },
          lastOutboundAt: { not: null },
          ...(s.skipIfHumanHandling ? { aiDisabled: false } : {}),
          followUps: { none: { status: 'pending' } },
        },
        orderBy: { qualificationScore: 'desc' },
        take: 100,
      });

      const due = candidates.filter((l) => {
        const next = this.computeNextAutoFollowUp(l, s);
        return next && next.getTime() <= Date.now();
      });

      for (const lead of due) {
        if (remaining <= 0 || sentThisTick >= 10) return;
        if (sentThisTick > 0) await sleep(randInt(s.minGapSeconds, s.maxGapSeconds) * 1000);
        if (!isWithinSendingHours(new Date(), s)) return;

        const stepIndex = lead.followUpCount || 0;
        const step = s.steps[stepIndex];
        const lastFu = await prisma.followUp.findFirst({
          where: { leadId: lead.id, status: 'sent' },
          orderBy: { sentAt: 'desc' },
          select: { message: true },
        });
        let text = renderTemplate(pickTemplate(step.templates, lead, lastFu?.message), lead);
        if (s.includeStopFooter && s.stopFooter) text = `${text}\n\n${s.stopFooter}`;

        const fu = await prisma.followUp.create({
          data: { leadId: lead.id, type: 'auto', step: stepIndex + 1, status: 'pending', scheduledAt: new Date(), message: text },
        });
        const ok = await this.deliver(fu.id, s);
        if (ok) {
          sentThisTick++;
          remaining--;
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Envoie effectivement une relance (avec vérifications de sécurité de dernière minute). */
  public async deliver(followUpId: string, s?: FollowUpSettings): Promise<boolean> {
    const settings = s || (await getFollowUpSettings());
    const fu = await prisma.followUp.findUnique({ where: { id: followUpId }, include: { lead: true } });
    if (!fu || fu.status !== 'pending') return false;
    const lead = fu.lead;

    const skip = async (reason: string) => {
      await prisma.followUp.update({ where: { id: fu.id }, data: { status: 'skipped', error: reason } });
      return false;
    };

    if (lead.optOut) return skip('Prospect désinscrit (STOP)');
    if (!lead.lastInboundAt) return skip("Le prospect n'a jamais écrit : relance à froid interdite (risque de bannissement)");
    if (fu.type === 'auto' && lead.lastInboundAt && lead.lastOutboundAt && lead.lastInboundAt > lead.lastOutboundAt) {
      return skip('Le prospect a répondu entre-temps');
    }

    const typingDelayMs = Math.min(Math.max(fu.message.length * 35, 1500), 6000);
    const result = await whatsAppService.sendWhatsAppMessage(lead.phone, fu.message, { typingDelayMs });

    if (result?.simulated) {
      await prisma.followUp.update({
        where: { id: fu.id },
        data: { status: 'failed', error: String(result.error || result.message || 'Échec envoi') },
      });
      return false;
    }

    const now = new Date();
    const message = await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: 'outbound',
        content: fu.message,
        messageType: 'followup',
        sentByAgentId: fu.createdById || null,
      },
    });
    await prisma.followUp.update({ where: { id: fu.id }, data: { status: 'sent', sentAt: now, error: null } });
    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastOutboundAt: now,
        lastFollowUpAt: now,
        ...(fu.type === 'auto' ? { followUpCount: { increment: 1 } } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: fu.createdById || 'system',
        action: fu.type === 'auto' ? 'followup.auto_sent' : 'followup.sent',
        entityId: lead.id,
        metadata: { followUpId: fu.id, step: fu.step },
      },
    });

    emitNewMessage(message, updatedLead);
    emitLeadUpdated(updatedLead);
    console.log(`✓ [Relances] Relance ${fu.type} envoyée à ${lead.phone} (étape ${fu.step || '-'}) [quota: ${settings.maxPerDay}/24h]`);
    return true;
  }

  /** Programme une relance manuelle (ou immédiate) pour un lead. */
  public async schedule(params: { leadId: string; message: string; scheduledAt?: Date; createdById?: string }) {
    const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
    if (!lead) throw new Error('Lead introuvable');
    if (lead.optOut) throw new Error('Ce prospect a demandé à ne plus être relancé (STOP).');
    if (!lead.lastInboundAt) {
      const hasInbound = await prisma.message.count({ where: { leadId: lead.id, direction: 'inbound' } });
      if (!hasInbound) throw new Error("Ce prospect ne vous a jamais écrit : relance impossible (protection anti-bannissement).");
    }
    const text = renderTemplate(params.message, lead);
    if (!text) throw new Error('Message de relance vide');
    return prisma.followUp.create({
      data: {
        leadId: lead.id,
        type: 'manual',
        status: 'pending',
        scheduledAt: params.scheduledAt || new Date(),
        message: text,
        createdById: params.createdById || null,
      },
    });
  }

  /** Programmation en masse : étalement automatique dans le temps (jamais d'envoi groupé instantané). */
  public async scheduleBulk(params: { leadIds: string[]; message: string; scheduledAt?: Date; createdById?: string }) {
    const s = await getFollowUpSettings();
    const base = params.scheduledAt ? params.scheduledAt.getTime() : Date.now();
    const created: string[] = [];
    const rejected: Array<{ leadId: string; reason: string }> = [];
    let offset = 0;
    for (const leadId of params.leadIds.slice(0, 200)) {
      try {
        const fu = await this.schedule({
          leadId,
          message: params.message,
          scheduledAt: new Date(base + offset * 1000),
          createdById: params.createdById,
        });
        created.push(fu.id);
        offset += randInt(s.minGapSeconds, s.maxGapSeconds);
      } catch (e: any) {
        rejected.push({ leadId, reason: e.message });
      }
    }
    return { created: created.length, rejected };
  }

  public async cancel(id: string) {
    return prisma.followUp.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled', error: 'Annulée manuellement' } });
  }

  public async list(params: { status?: string; leadId?: string; page?: number; limit?: number }) {
    const page = Math.max(params.page || 1, 1);
    const limit = Math.min(Math.max(params.limit || 25, 1), 100);
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.leadId) where.leadId = params.leadId;
    const [total, data] = await Promise.all([
      prisma.followUp.count({ where }),
      prisma.followUp.findMany({
        where,
        orderBy: params.status === 'pending' ? { scheduledAt: 'asc' } : { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          lead: {
            select: {
              id: true, phone: true, realPhone: true, firstName: true, lastName: true,
              recommendedOffer: true, leadStatus: true, qualificationScore: true, lastInboundAt: true, optOut: true,
            },
          },
        },
      }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Leads qui seront relancés automatiquement prochainement (aperçu de la file). */
  public async upcomingAuto(limit = 50) {
    const s = await getFollowUpSettings();
    if (!s.autoEnabled) return [];
    const leads = await prisma.lead.findMany({
      where: {
        optOut: false,
        followUpPaused: false,
        followUpCount: { lt: s.steps.length },
        qualificationScore: { gte: s.minScore },
        lastInboundAt: { not: null },
        lastOutboundAt: { not: null },
      },
      orderBy: { lastOutboundAt: 'asc' },
      take: 500,
    });
    return leads
      .map((l) => ({ lead: l, nextAt: this.computeNextAutoFollowUp(l, s), step: (l.followUpCount || 0) + 1 }))
      .filter((x) => x.nextAt)
      .sort((a, b) => a.nextAt!.getTime() - b.nextAt!.getTime())
      .slice(0, limit)
      .map((x) => ({
        nextAt: x.nextAt,
        step: x.step,
        lead: {
          id: x.lead.id, phone: x.lead.phone, realPhone: x.lead.realPhone, firstName: x.lead.firstName, lastName: x.lead.lastName,
          recommendedOffer: x.lead.recommendedOffer, qualificationScore: x.lead.qualificationScore, leadStatus: x.lead.leadStatus,
        },
      }));
  }

  public async stats() {
    const since24h = new Date(Date.now() - 86_400_000);
    const since30d = new Date(Date.now() - 30 * 86_400_000);
    const s = await getFollowUpSettings();
    const [pending, sent24h, failed24h, optOuts, sent30d] = await Promise.all([
      prisma.followUp.count({ where: { status: 'pending' } }),
      prisma.followUp.count({ where: { status: 'sent', sentAt: { gte: since24h } } }),
      prisma.followUp.count({ where: { status: 'failed', updatedAt: { gte: since24h } } }),
      prisma.lead.count({ where: { optOut: true } }),
      prisma.followUp.findMany({
        where: { status: 'sent', sentAt: { gte: since30d } },
        select: { sentAt: true, lead: { select: { lastInboundAt: true } } },
      }),
    ]);
    const replied = sent30d.filter((f) => f.lead.lastInboundAt && f.sentAt && f.lead.lastInboundAt > f.sentAt).length;
    return {
      pending,
      sent24h,
      failed24h,
      optOuts,
      dailyQuota: s.maxPerDay,
      autoEnabled: s.autoEnabled,
      sendingWindowOpen: isWithinSendingHours(new Date(), s),
      sent30d: sent30d.length,
      replyRate30d: sent30d.length ? Math.round((replied / sent30d.length) * 100) : 0,
    };
  }
}

export const followUpsService = new FollowUpsService();
