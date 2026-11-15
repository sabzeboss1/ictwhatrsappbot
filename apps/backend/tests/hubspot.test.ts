import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HubSpotService,
  extractRejectedProperties,
  isValidPhoneNumber,
  getEffectivePhoneNumber,
} from '../src/modules/hubspot/hubspot.service.js';
import {
  HubSpotPipelineService,
  PIPELINE_ID,
  ETAPES,
  creerOpportunite,
  changerEtape,
  evaluateReliableStage,
  validateStageTransitionPolicy,
  buildNonSensitiveReference,
  buildDealNameFromReference,
  parseRetryAfterMs,
} from '../src/modules/hubspot/hubspot.pipeline.js';
import { prisma } from '../src/plugins/prisma.js';
import { env } from '../src/config/env.js';

function createMockResponse(status: number, body: any, headers: Record<string, string> = {}): Response {
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => lowerHeaders[name.toLowerCase()] ?? null,
    } as any,
    json: async () => body,
  } as Response;
}

describe('HubSpot Service & Data Normalization', () => {
  const service = new HubSpotService();

  describe('mapToHubSpotLeadStatus', () => {
    it('should map internal French lead statuses to standard HubSpot options', () => {
      expect(service.mapToHubSpotLeadStatus('Nouveau')).toBe('NEW');
      expect(service.mapToHubSpotLeadStatus('Prospect tiede')).toBe('OPEN');
      expect(service.mapToHubSpotLeadStatus('Prospect tiède')).toBe('OPEN');
      expect(service.mapToHubSpotLeadStatus('Prospect qualifie')).toBe('IN_PROGRESS');
      expect(service.mapToHubSpotLeadStatus('Prospect qualifié')).toBe('IN_PROGRESS');
      expect(service.mapToHubSpotLeadStatus('Opportunite chaude')).toBe('OPEN_DEAL');
      expect(service.mapToHubSpotLeadStatus('Opportunité chaude')).toBe('OPEN_DEAL');
      expect(service.mapToHubSpotLeadStatus('Prospect froid')).toBe('UNQUALIFIED');
    });

    it('should preserve valid standard HubSpot uppercase options', () => {
      expect(service.mapToHubSpotLeadStatus('OPEN')).toBe('OPEN');
      expect(service.mapToHubSpotLeadStatus('IN_PROGRESS')).toBe('IN_PROGRESS');
      expect(service.mapToHubSpotLeadStatus('OPEN_DEAL')).toBe('OPEN_DEAL');
      expect(service.mapToHubSpotLeadStatus('CONNECTED')).toBe('CONNECTED');
    });

    it('should return undefined if status is empty or null', () => {
      expect(service.mapToHubSpotLeadStatus(null)).toBeUndefined();
      expect(service.mapToHubSpotLeadStatus(undefined)).toBeUndefined();
      expect(service.mapToHubSpotLeadStatus('')).toBeUndefined();
    });
  });

  describe('extractRejectedProperties', () => {
    it('should extract invalid property names from HubSpot 400 error payload', () => {
      const hubspotError = {
        message: 'HTTP-Code: 400 Message: An error occurred.',
        body: {
          status: 'error',
          message: 'Property values were not valid: [...]',
          category: 'VALIDATION_ERROR',
          errors: [
            {
              message: 'Property "description" does not exist',
              code: 'PROPERTY_DOESNT_EXIST',
              context: {
                propertyName: ['description'],
              },
            },
            {
              message: 'Prospect tiede was not one of the allowed options: [NEW, OPEN, ...]',
              code: 'INVALID_OPTION',
              context: {
                propertyName: ['hs_lead_status'],
              },
            },
          ],
        },
      };

      const rejected = extractRejectedProperties(hubspotError);
      expect(rejected).toContain('description');
      expect(rejected).toContain('hs_lead_status');
    });

    it('should extract property names from raw string error messages when body is not parsed', () => {
      const rawError = new Error(
        'HTTP-Code: 400 Message: An error occurred. Body: {"status":"error","message":"Property values were not valid: [{\\"name\\":\\"custom_unknown_field\\"}]","errors":[{"context":{"propertyName":["custom_unknown_field"]}}]}'
      );

      const rejected = extractRejectedProperties(rawError);
      expect(rejected).toContain('custom_unknown_field');
    });
  });

  describe('getLifecycleStage', () => {
    it('should return correct HubSpot lifecycle stages for conversation stages', () => {
      expect(service.getLifecycleStage('NEW_CONTACT')).toBe('lead');
      expect(service.getLifecycleStage('DISCOVERY')).toBe('lead');
      expect(service.getLifecycleStage('QUALIFICATION')).toBe('marketingqualifiedlead');
      expect(service.getLifecycleStage('RECOMMENDATION')).toBe('marketingqualifiedlead');
      expect(service.getLifecycleStage('OBJECTION_HANDLING')).toBe('salesqualifiedlead');
      expect(service.getLifecycleStage('CONVERSION')).toBe('salesqualifiedlead');
      expect(service.getLifecycleStage('CUSTOMER')).toBe('customer');
      expect(service.getLifecycleStage('UNKNOWN')).toBe('lead');
    });
  });

  describe('Phone sanitization', () => {
    it('should reject WhatsApp Privacy ID @lid as valid phone', () => {
      expect(isValidPhoneNumber('123456789@lid')).toBe(false);
      expect(isValidPhoneNumber('237699001122@s.whatsapp.net')).toBe(false);
      expect(isValidPhoneNumber('+237699001122')).toBe(true);
      expect(isValidPhoneNumber('00237699001122')).toBe(true);
    });

    it('should resolve effective phone number prioritizing realPhone over @lid', () => {
      const leadWithLidOnly = {
        phone: '123456789@lid',
        realPhone: null,
      };
      expect(getEffectivePhoneNumber(leadWithLidOnly)).toBeNull();

      const leadWithRealPhone = {
        phone: '123456789@lid',
        realPhone: '+237699001122',
      };
      expect(getEffectivePhoneNumber(leadWithRealPhone)).toBe('+237699001122');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite de tests complète pour le pipeline HubSpot "Suivi commercial WhatsApp" (4352514296)
// Sans aucun appel réseau réel (mock de fetch + store Prisma en mémoire)
// ═══════════════════════════════════════════════════════════════════════════
describe('HubSpot Pipeline "Suivi commercial WhatsApp" (4352514296) — Intégration & Résilience', () => {
  const store = new Map<string, any>();
  const leadStore = new Map<string, any>();
  let originalToken: string;
  let originalDryRun: string;
  let originalSyncEnabled: string;

  const validPipelinePayload = {
    id: PIPELINE_ID,
    label: 'Suivi commercial WhatsApp',
    stages: Object.entries(ETAPES).map(([label, id]) => ({ id, label })),
  };

  beforeEach(() => {
    store.clear();
    leadStore.clear();
    originalToken = env.HUBSPOT_ACCESS_TOKEN;
    originalDryRun = env.HUBSPOT_DRY_RUN;
    originalSyncEnabled = env.HUBSPOT_PIPELINE_SYNC_ENABLED;

    env.HUBSPOT_ACCESS_TOKEN = 'test_token_server_only_do_not_log';
    env.HUBSPOT_DRY_RUN = 'false';
    env.HUBSPOT_PIPELINE_SYNC_ENABLED = 'true';

    // Mock complet de prisma.commercialRequest et prisma.lead en mémoire
    vi.spyOn(prisma.commercialRequest, 'findUnique').mockImplementation((async ({ where }: any) => {
      if (where.id) return store.get(where.id) || null;
      if (where.requestKey) {
        for (const r of store.values()) {
          if (r.requestKey === where.requestKey) return { ...r };
        }
      }
      return null;
    }) as any);

    vi.spyOn(prisma.commercialRequest, 'findUniqueOrThrow').mockImplementation((async ({ where }: any) => {
      const found = await (prisma.commercialRequest.findUnique as any)({ where });
      if (!found) throw new Error('CommercialRequest not found');
      return found;
    }) as any);

    vi.spyOn(prisma.commercialRequest, 'findMany').mockImplementation((async ({ where }: any) => {
      const all = Array.from(store.values());
      return all
        .filter((r) => {
          if (where?.leadId && r.leadId !== where.leadId) return false;
          if (where?.syncStatus?.in && !where.syncStatus.in.includes(r.syncStatus)) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }) as any);

    vi.spyOn(prisma.commercialRequest, 'create').mockImplementation((async ({ data }: any) => {
      const now = new Date();
      const row = {
        id: `cr_${store.size + 1}`,
        requestKey: data.requestKey,
        reference: data.reference,
        leadId: data.leadId,
        hubspotContactId: data.hubspotContactId ?? null,
        hubspotDealId: data.hubspotDealId ?? null,
        pipelineId: data.pipelineId ?? PIPELINE_ID,
        requestedStage: data.requestedStage ?? 'NOUVELLE_DEMANDE',
        syncedStage: data.syncedStage ?? null,
        remoteStageId: data.remoteStageId ?? null,
        syncStatus: data.syncStatus ?? 'pending',
        attempts: data.attempts ?? 0,
        nextRetryAt: data.nextRetryAt ?? null,
        lastError: data.lastError ?? null,
        lastCorrelationId: data.lastCorrelationId ?? null,
        lockedBy: null,
        lockedUntil: null,
        paymentVerified: Boolean(data.paymentVerified),
        paymentVerifiedBy: data.paymentVerifiedBy ?? null,
        paymentVerifiedAt: data.paymentVerifiedAt ?? null,
        paymentReference: data.paymentReference ?? null,
        bookingConfirmed: Boolean(data.bookingConfirmed),
        offerSentAt: data.offerSentAt ?? null,
        isTest: Boolean(data.isTest),
        lastEventAt: data.lastEventAt ?? now,
        lastSyncedAt: data.lastSyncedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      store.set(row.id, row);
      return { ...row };
    }) as any);

    vi.spyOn(prisma.commercialRequest, 'update').mockImplementation((async ({ where, data }: any) => {
      const existing = store.get(where.id);
      if (!existing) throw new Error(`Row ${where.id} not found`);
      const updated = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      store.set(where.id, updated);
      return { ...updated };
    }) as any);

    vi.spyOn(prisma.commercialRequest, 'updateMany').mockImplementation((async ({ where, data }: any) => {
      let count = 0;
      for (const [id, row] of store.entries()) {
        if (where.requestKey && row.requestKey !== where.requestKey) continue;
        if (where.lockedBy && row.lockedBy !== where.lockedBy) continue;
        if (where.OR) {
          const now = new Date();
          const canLock =
            !row.lockedUntil ||
            row.lockedUntil < now ||
            (where.OR[2]?.lockedBy && row.lockedBy === where.OR[2].lockedBy);
          if (!canLock) continue;
        }
        store.set(id, { ...row, ...data, updatedAt: new Date() });
        count += 1;
      }
      return { count };
    }) as any);

    vi.spyOn(prisma.lead, 'update').mockImplementation((async ({ where, data }: any) => {
      const prev = leadStore.get(where.id) || { id: where.id };
      const next = { ...prev, ...data };
      leadStore.set(where.id, next);
      return next;
    }) as any);
  });

  afterEach(() => {
    env.HUBSPOT_ACCESS_TOKEN = originalToken;
    env.HUBSPOT_DRY_RUN = originalDryRun;
    env.HUBSPOT_PIPELINE_SYNC_ENABLED = originalSyncEnabled;
    vi.restoreAllMocks();
  });

  it('1. should create a deal in pipeline 4352514296 at stage 6443559115 (NOUVELLE_DEMANDE) associated with contact (typeId 3)', async () => {
    const calls: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = vi.fn(async (url: any, init: any) => {
      const body = init?.body ? JSON.parse(init.body) : undefined;
      calls.push({ method: init?.method || 'GET', url: String(url), body });

      if (String(url).includes(`/crm/v3/pipelines/deals/${PIPELINE_ID}`)) {
        return createMockResponse(200, validPipelinePayload);
      }
      if (init?.method === 'POST' && String(url).endsWith('/crm/v3/objects/deals')) {
        return createMockResponse(201, { id: '9876543210' });
      }
      return createMockResponse(200, {});
    });

    const pipelineSvc = new HubSpotPipelineService({ fetchImpl: mockFetch as any });
    const res = await pipelineSvc.ensureDealForRequest({
      leadId: 'lead_1',
      contactId: '123456',
    });

    expect(res.success).toBe(true);
    expect(res.dealId).toBe('9876543210');
    expect(res.stage).toBe('NOUVELLE_DEMANDE');
    expect(res.syncStatus).toBe('synced');

    const postCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/crm/v3/objects/deals'));
    expect(postCall).toBeDefined();
    expect(postCall!.body).toEqual({
      properties: {
        dealname: expect.stringMatching(/^Demande WhatsApp - WA-[A-F0-9]{8}$/),
        pipeline: '4352514296',
        dealstage: '6443559115',
      },
      associations: [
        {
          to: { id: '123456' },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 3,
            },
          ],
        },
      ],
    });
    // Aucun montant, devise, responsable ni date de clôture non établis
    expect(postCall!.body.properties.amount).toBeUndefined();
    expect(postCall!.body.properties.closedate).toBeUndefined();
    expect(postCall!.body.properties.hubspot_owner_id).toBeUndefined();
  });

  it('2. should persist the returned dealId and reuse it on subsequent messages without creating a duplicate deal', async () => {
    let postDealCount = 0;
    const mockFetch = vi.fn(async (url: any, init: any) => {
      if (String(url).includes(`/crm/v3/pipelines/deals/${PIPELINE_ID}`)) {
        return createMockResponse(200, validPipelinePayload);
      }
      if (init?.method === 'POST' && String(url).endsWith('/crm/v3/objects/deals')) {
        postDealCount += 1;
        return createMockResponse(201, { id: '555000111' });
      }
      return createMockResponse(200, {});
    });

    const pipelineSvc = new HubSpotPipelineService({ fetchImpl: mockFetch as any });
    const first = await pipelineSvc.ensureDealForRequest({ leadId: 'lead_reuse', contactId: '777888' });
    const second = await pipelineSvc.ensureDealForRequest({ leadId: 'lead_reuse', contactId: '777888' });
    const third = await pipelineSvc.ensureDealForRequest({ leadId: 'lead_reuse', contactId: '777888' });

    expect(first.dealId).toBe('555000111');
    expect(second.dealId).toBe('555000111');
    expect(third.dealId).toBe('555000111');
    expect(postDealCount).toBe(1);

    // Même contact mais second projet distinct après clôture ou forceNewProject
    const secondProject = await pipelineSvc.ensureDealForRequest({
      leadId: 'lead_reuse',
      contactId: '777888',
      forceNewProject: true,
    });
    expect(secondProject.requestKey).not.toBe(first.requestKey);
    expect(postDealCount).toBe(2);
  });

  it('3. should handle duplicate event receipt idempotently without sending redundant PATCH requests', async () => {
    let patchCount = 0;
    const mockFetch = vi.fn(async (url: any, init: any) => {
      if (String(url).includes(`/crm/v3/pipelines/deals/${PIPELINE_ID}`)) {
        return createMockResponse(200, validPipelinePayload);
      }
      if (init?.method === 'POST' && String(url).endsWith('/crm/v3/objects/deals')) {
        return createMockResponse(201, { id: '111222333' });
      }
      if (init?.method === 'GET' && String(url).includes('/crm/v3/objects/deals/111222333')) {
        return createMockResponse(200, {
          id: '111222333',
          properties: { pipeline: PIPELINE_ID, dealstage: ETAPES.NOUVELLE_DEMANDE },
        });
      }
      if (init?.method === 'PATCH' && String(url).includes('/crm/v3/objects/deals/111222333')) {
        patchCount += 1;
        return createMockResponse(200, { id: '111222333' });
      }
      return createMockResponse(200, {});
    });

    const pipelineSvc = new HubSpotPipelineService({ fetchImpl: mockFetch as any });
    const created = await pipelineSvc.ensureDealForRequest({ leadId: 'lead_dup', contactId: '999000' });

    // Premier événement QUALIFIEE -> envoie PATCH
    const tr1 = await pipelineSvc.transitionRequestStage({
      requestKey: created.requestKey,
      targetStage: 'QUALIFIEE',
    });
    expect(tr1.success).toBe(true);
    expect(tr1.status).toBe('synced');
    expect(patchCount).toBe(1);

    // Même événement QUALIFIEE reçu une 2ème fois -> noop, aucun PATCH supplémentaire
    const tr2 = await pipelineSvc.transitionRequestStage({
      requestKey: created.requestKey,
      targetStage: 'QUALIFIEE',
    });
    expect(tr2.success).toBe(true);
    expect(tr2.status).toBe('noop_already_at_stage');
    expect(patchCount).toBe(1);
  });

  it('4. should serialize concurrent processing on the same request and never create duplicate deals', async () => {
    let postCount = 0;
    const mockFetch = vi.fn(async (url: any, init: any) => {
      if (String(url).includes(`/crm/v3/pipelines/deals/${PIPELINE_ID}`)) {
        return createMockResponse(200, validPipelinePayload);
      }
      if (init?.method === 'POST' && String(url).endsWith('/crm/v3/objects/deals')) {
        postCount += 1;
        await new Promise((r) => setTimeout(r, 30));
        return createMockResponse(201, { id: '444555666' });
      }
      return createMockResponse(200, {});
    });

    const pipelineSvc = new HubSpotPipelineService({ fetchImpl: mockFetch as any });
    await pipelineSvc.getOrCreateCommercialRequest({
      leadId: 'lead_concurrent',
      hubspotContactId: '333444',
      requestKeyOverride: 'req_lead_concurrent_1',
    });

    const [resA, resB, resC] = await Promise.all([
      pipelineSvc.ensureDealForRequest({
        leadId: 'lead_concurrent',
        contactId: '333444',
        requestKey: 'req_lead_concurrent_1',
      }),
      pipelineSvc.ensureDealForRequest({
        leadId: 'lead_concurrent',
        contactId: '333444',
        requestKey: 'req_lead_concurrent_1',
      }),
      pipelineSvc.ensureDealForRequest({
        leadId: 'lead_concurrent',
        contactId: '333444',
        requestKey: 'req_lead_concurrent_1',
      }),
    ]);

    expect(postCount).toBe(1);
    expect(resA.dealId).toBe('444555666');
    expect(resB.dealId).toBe('444555666');
    expect(resC.dealId).toBe('444555666');
  });

  it('5. should mark uncertain_creation on network timeout or server crash during POST and reconcile without duplicating', async () => {
    let postCount = 0;
    const reqKey = 'req_lead_timeout_1';
    const expectedRef = buildNonSensitiveReference(reqKey, false);
    const expectedDealName = buildDealNameFromReference(expectedRef, false);

    // 1er appel POST : expire (timeout réseau), alors que HubSpot a bien créé le deal 888999000 en arrière-plan
    const mockFetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes(`/crm/v3/pipelines/deals/${PIPELINE_ID}`)) {
        return createMockResponse(200, validPipelinePayload);
      }
      if (init?.method === 'POST' && u.endsWith('/crm/v3/objects/deals')) {
        postCount += 1;
        throw new Error('AbortError: The operation was aborted due to timeout');
      }
      if (init?.method !== 'POST' && u.includes('/crm/v3/objects/contacts/121212/associations/deals')) {
        return createMockResponse(200, {
          results: [{ id: '888999000', type: 'contact_to_deal' }],
        });
      }
      if (init?.method !== 'POST' && u.includes('/crm/v3/objects/deals/888999000')) {
        return createMockResponse(200, {
          id: '888999000',
          properties: {
            dealname: expectedDealName,
            pipeline: PIPELINE_ID,
            dealstage: ETAPES.NOUVELLE_DEMANDE,
          },
        });
      }
      return createMockResponse(200, {});
    });

    const pipelineSvc = new HubSpotPipelineService({ fetchImpl: mockFetch as any });

    // Tentative 1 : timeout pendant le POST -> statut uncertain_creation
    const firstAttempt = await pipelineSvc.ensureDealForRequest({
      leadId: 'lead_timeout',
      contactId: '121212',
      requestKey: reqKey,
    });
    expect(firstAttempt.success).toBe(false);
    expect(firstAttempt.syncStatus).toBe('uncertain_creation');
    expect(postCount).toBe(1);

    // Tentative 2 (reprise après redémarrage ou retry) : réconcilie en lecture et rattache 888999000 SANS refaire de POST !
    const secondAttempt = await pipelineSvc.ensureDealForRequest({
      leadId: 'lead_timeout',
      contactId: '121212',
      requestKey: reqKey,
    });
    expect(secondAttempt.success).toBe(true);
    expect(secondAttempt.reconciled).toBe(true);
    expect(secondAttempt.dealId).toBe('888999000');
    expect(secondAttempt.syncStatus).toBe('synced');
    expect(postCount).toBe(1); // Toujours 1 seul POST !
  });

  it('6. should handle HTTP 429 (Retry-After), 5xx, 400 and 401/403 with appropriate retry vs permanent failure status', async () => {
    expect(parseRetryAfterMs('12')).toBe(12000);
    expect(parseRetryAfterMs('120')).toBe(60000); // Borné à 60s max

    let mode: '429' | '503' | '400' | '401' = '429';
    const mockFetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes(`/crm/v3/pipelines/deals/${PIPELINE_ID}`)) {
        return createMockResponse(200, validPipelinePayload);
      }
      if (init?.method === 'POST' && u.endsWith('/crm/v3/objects/deals')) {
        return createMockResponse(201, { id: '700800900' });
      }
      if (init?.method === 'GET' && u.includes('/crm/v3/objects/deals/700800900')) {
        return createMockResponse(200, {
          id: '700800900',
          properties: { pipeline: PIPELINE_ID, dealstage: ETAPES.NOUVELLE_DEMANDE },
        });
      }
      if (init?.method === 'PATCH') {
        if (mode === '429') {
          return createMockResponse(429, { correlationId: 'corr-429' }, { 'retry-after': '8' });
        }
        if (mode === '503') {
          return createMockResponse(503, { correlationId: 'corr-503' });
        }
        if (mode === '400') {
          return createMockResponse(400, { correlationId: 'corr-400', message: 'Invalid property' });
        }
        if (mode === '401') {
          return createMockResponse(401, { correlationId: 'corr-401', message: 'Unauthorized' });
        }
      }
      return createMockResponse(200, {});
    });

    const pipelineSvc = new HubSpotPipelineService({ fetchImpl: mockFetch as any });
    const created = await pipelineSvc.ensureDealForRequest({ leadId: 'lead_errors', contactId: '454545' });

    // Cas 429 -> retry_scheduled
    mode = '429';
    const res429 = await pipelineSvc.transitionRequestStage({
      requestKey: created.requestKey,
      targetStage: 'A_QUALIFIER',
    });
    expect(res429.success).toBe(false);
    expect(res429.status).toBe('retry_scheduled');

    // Cas 503 sur PATCH -> retry_scheduled
    mode = '503';
    const res503 = await pipelineSvc.transitionRequestStage({
      requestKey: created.requestKey,
      targetStage: 'A_QUALIFIER',
    });
    expect(res503.success).toBe(false);
    expect(res503.status).toBe('retry_scheduled');

    // Cas 400 validation error -> failed_permanent (pas de retry infini)
    mode = '400';
    const res400 = await pipelineSvc.transitionRequestStage({
      requestKey: created.requestKey,
      targetStage: 'A_QUALIFIER',
    });
    expect(res400.success).toBe(false);
    expect(res400.status).toBe('failed_permanent');

    // Cas 401 auth error -> failed_permanent
    mode = '401';
    const res401 = await pipelineSvc.transitionRequestStage({
      requestKey: created.requestKey,
      targetStage: 'A_QUALIFIER',
    });
    expect(res401.success).toBe(false);
    expect(res401.status).toBe('failed_permanent');
  });

  it('7. should block writing if read-only pipeline verification detects missing stage in HubSpot', async () => {
    let postCalled = false;
    const incompletePipelinePayload = {
      id: PIPELINE_ID,
      label: 'Suivi commercial WhatsApp',
      // Étape GAGNEE (6443559120) absente !
      stages: Object.entries(ETAPES)
        .filter(([k]) => k !== 'GAGNEE')
        .map(([label, id]) => ({ id, label })),
    };

    const mockFetch = vi.fn(async (url: any, init: any) => {
      if (String(url).includes(`/crm/v3/pipelines/deals/${PIPELINE_ID}`)) {
        return createMockResponse(200, incompletePipelinePayload);
      }
      if (init?.method === 'POST') {
        postCalled = true;
      }
      return createMockResponse(200, {});
    });

    const pipelineSvc = new HubSpotPipelineService({ fetchImpl: mockFetch as any });
    const res = await pipelineSvc.ensureDealForRequest({ leadId: 'lead_bad_pipe', contactId: '654321' });

    expect(res.success).toBe(false);
    expect(res.syncStatus).toBe('failed_permanent');
    expect(res.error).toContain('GAGNEE(6443559120)');
    expect(postCalled).toBe(false);
  });

  it('8. should reject unknown stages and prevent backward regressions from delayed events', () => {
    // Étape inconnue
    const unknown = validateStageTransitionPolicy({
      currentStage: 'NOUVELLE_DEMANDE',
      targetStage: 'ETAPE_INEXISTANTE',
    });
    expect(unknown.allowed).toBe(false);
    expect(unknown.reason).toContain('Étape inconnue');

    // Régression active (OFFRE_ENVOYEE -> A_QUALIFIER)
    const regression = validateStageTransitionPolicy({
      currentStage: 'OFFRE_ENVOYEE',
      targetStage: 'A_QUALIFIER',
    });
    expect(regression.allowed).toBe(false);
    expect(regression.reason).toContain('Régression');

    // Événement retardé (timestamp plus ancien que lastEventAt)
    const delayed = validateStageTransitionPolicy({
      currentStage: 'A_QUALIFIER',
      targetStage: 'QUALIFIEE',
      lastEventAt: new Date('2026-11-15T12:00:00Z'),
      eventTimestamp: new Date('2026-11-15T11:55:00Z'),
    });
    expect(delayed.allowed).toBe(false);
    expect(delayed.reason).toContain('Événement retardé');
  });

  it('9. should NEVER trigger GAGNEE on unverified client payment claims ("j\'ai payé") and require verified payment + booking', () => {
    // Le client écrit "J'ai payé par Orange Money" dans WhatsApp
    const stageFromClientClaim = evaluateReliableStage({
      conversationStage: 'CONVERSION',
      inboundText: "Bonjour, j'ai payé par Orange Money à l'instant !",
      paymentVerified: false,
      bookingConfirmed: false,
    });
    expect(stageFromClientClaim).toBe('ACCORD_PAIEMENT_ATTENDU');
    expect(stageFromClientClaim).not.toBe('GAGNEE');

    // Tentative directe de passer à GAGNEE sans paymentVerified ni bookingConfirmed
    const unverifiedTransition = validateStageTransitionPolicy({
      currentStage: 'ACCORD_PAIEMENT_ATTENDU',
      targetStage: 'GAGNEE',
      paymentVerified: false,
      bookingConfirmed: true,
    });
    expect(unverifiedTransition.allowed).toBe(false);

    // Transition vers GAGNEE autorisée uniquement avec paymentVerified: true ET bookingConfirmed: true
    const verifiedTransition = validateStageTransitionPolicy({
      currentStage: 'ACCORD_PAIEMENT_ATTENDU',
      targetStage: 'GAGNEE',
      paymentVerified: true,
      bookingConfirmed: true,
    });
    expect(verifiedTransition.allowed).toBe(true);
    expect(verifiedTransition.effectiveStage).toBe('GAGNEE');
  });

  it('10. should preserve terminal stages (GAGNEE / PERDUE) and manual changes made directly in HubSpot', async () => {
    // 1. Une vente GAGNEE ne peut pas être convertie automatiquement en PERDUE
    const gagneeToPerdueAuto = validateStageTransitionPolicy({
      currentStage: 'GAGNEE',
      targetStage: 'PERDUE',
      allowTerminalOverride: false,
    });
    expect(gagneeToPerdueAuto.allowed).toBe(false);

    // 2. Une demande PERDUE ne peut pas être réouverte automatiquement par un événement retardé
    const perdueToQualifieeAuto = validateStageTransitionPolicy({
      currentStage: 'PERDUE',
      targetStage: 'QUALIFIEE',
      allowReopen: false,
    });
    expect(perdueToQualifieeAuto.allowed).toBe(false);

    // 3. Si un commercial a avancé manuellement le deal vers OFFRE_ENVOYEE dans HubSpot,
    // un événement bot vers A_QUALIFIER ou QUALIFIEE ne doit pas écraser le changement manuel
    let patchCalled = false;
    const mockFetch = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes(`/crm/v3/pipelines/deals/${PIPELINE_ID}`)) {
        return createMockResponse(200, validPipelinePayload);
      }
      if (init?.method === 'POST' && u.endsWith('/crm/v3/objects/deals')) {
        return createMockResponse(201, { id: '300400500' });
      }
      if (init?.method === 'GET' && u.includes('/crm/v3/objects/deals/300400500')) {
        // Dans HubSpot, un commercial a déjà déplacé le deal sur OFFRE_ENVOYEE (6443559118)
        return createMockResponse(200, {
          id: '300400500',
          properties: {
            pipeline: PIPELINE_ID,
            dealstage: ETAPES.OFFRE_ENVOYEE,
          },
        });
      }
      if (init?.method === 'PATCH') {
        patchCalled = true;
        return createMockResponse(200, {});
      }
      return createMockResponse(200, {});
    });

    const pipelineSvc = new HubSpotPipelineService({ fetchImpl: mockFetch as any });
    const created = await pipelineSvc.ensureDealForRequest({ leadId: 'lead_manual', contactId: '222333' });

    const tr = await pipelineSvc.transitionRequestStage({
      requestKey: created.requestKey,
      targetStage: 'A_QUALIFIER',
      checkRemoteManualChanges: true,
    });

    expect(tr.success).toBe(true);
    expect(tr.status).toBe('manual_override_preserved');
    expect(tr.stage).toBe('OFFRE_ENVOYEE');
    expect(patchCalled).toBe(false);
  });

  it('11. should support dry-run simulation mode without making any HTTP request to HubSpot', async () => {
    env.HUBSPOT_DRY_RUN = 'true';
    const mockFetch = vi.fn();

    const pipelineSvc = new HubSpotPipelineService({ fetchImpl: mockFetch as any });
    const ensured = await pipelineSvc.ensureDealForRequest({
      leadId: 'lead_sim',
      contactId: '100200',
      isTest: true,
    });

    expect(ensured.success).toBe(true);
    expect(ensured.simulated).toBe(true);
    expect(ensured.syncStatus).toBe('simulated');

    const tr = await pipelineSvc.transitionRequestStage({
      requestKey: ensured.requestKey,
      targetStage: 'QUALIFIEE',
    });
    expect(tr.success).toBe(true);
    expect(tr.status).toBe('simulated');
    expect(tr.stage).toBe('QUALIFIEE');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
