import crypto from 'crypto';
import { env } from '../../config/env.js';
import { prisma } from '../../plugins/prisma.js';

export const PIPELINE_ID = '4352514296';

export const ETAPES = Object.freeze({
  NOUVELLE_DEMANDE: '6443559115',
  A_QUALIFIER: '6443559116',
  QUALIFIEE: '6443559117',
  OFFRE_ENVOYEE: '6443559118',
  ACCORD_PAIEMENT_ATTENDU: '6443559119',
  GAGNEE: '6443559120',
  PERDUE: '6443559121',
} as const);

export type EtapeKey = keyof typeof ETAPES;
export type EtapeId = (typeof ETAPES)[EtapeKey];

export const STAGE_ID_TO_KEY: Readonly<Record<string, EtapeKey>> = Object.freeze(
  Object.entries(ETAPES).reduce((acc, [k, v]) => {
    acc[v] = k as EtapeKey;
    return acc;
  }, {} as Record<string, EtapeKey>)
);

export const ACTIVE_STAGE_RANK: Readonly<Record<EtapeKey, number>> = Object.freeze({
  NOUVELLE_DEMANDE: 1,
  A_QUALIFIER: 2,
  QUALIFIEE: 3,
  OFFRE_ENVOYEE: 4,
  ACCORD_PAIEMENT_ATTENDU: 5,
  GAGNEE: 100,
  PERDUE: 100,
});

export const TERMINAL_STAGES: ReadonlySet<EtapeKey> = new Set<EtapeKey>(['GAGNEE', 'PERDUE']);

export interface HubSpotApiError extends Error {
  status?: number;
  correlationId?: string;
  retryAfterMs?: number;
  creationPeutAvoirReussi?: boolean;
  isPermanentError?: boolean;
}

export type FetchLike = typeof fetch;

/**
 * Parse l'en-tête Retry-After (secondes ou date HTTP) avec borne maximale.
 */
export function parseRetryAfterMs(retryAfterHeader?: string | null, defaultMs = 5000, maxMs = 60000): number {
  if (!retryAfterHeader) return defaultMs;
  const trimmed = retryAfterHeader.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric >= 0) {
    // HubSpot peut renvoyer des secondes (ex: "10")
    const ms = numeric > 1000 ? numeric : numeric * 1000;
    return Math.min(Math.max(ms, 500), maxMs);
  }
  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    const diff = parsedDate - Date.now();
    return Math.min(Math.max(diff, 500), maxMs);
  }
  return defaultMs;
}

/**
 * Calcule un délai de backoff exponentiel borné.
 */
export function computeBoundedBackoffMs(attempts: number, retryAfterMs?: number): number {
  const maxBackoffMs = 60_000;
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs, maxBackoffMs);
  }
  const base = 2000 * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(base, maxBackoffMs);
}

/**
 * Requête HTTP bas niveau vers l'API HubSpot v3.
 * Ne journalise jamais le jeton ni le contenu brut contenant des données personnelles.
 */
export async function requeteHubSpot(
  method: 'GET' | 'POST' | 'PATCH',
  chemin: string,
  donnees?: Record<string, any>,
  options?: { token?: string; fetchImpl?: FetchLike; timeoutMs?: number }
): Promise<any> {
  const token = options?.token ?? env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    const err: HubSpotApiError = new Error('Variable HUBSPOT_ACCESS_TOKEN manquante.');
    err.isPermanentError = true;
    throw err;
  }

  const fetchFn = options?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('Environnement sans fetch global disponible.');
  }

  let reponse: Response;
  try {
    reponse = await fetchFn(`https://api.hubapi.com${chemin}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: method === 'GET' || donnees === undefined ? undefined : JSON.stringify(donnees),
      signal: AbortSignal.timeout(options?.timeoutMs ?? 20000),
    });
  } catch {
    const erreur: HubSpotApiError = new Error(
      'Réponse HubSpot non reçue. Vérifier le résultat avant de répéter une création.'
    );
    erreur.creationPeutAvoirReussi = method === 'POST';
    erreur.isPermanentError = false;
    throw erreur;
  }

  const resultat: any = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    const status = reponse.status;
    const correlationId = resultat?.correlationId ? String(resultat.correlationId) : undefined;
    const retryAfterRaw = reponse.headers?.get ? reponse.headers.get('retry-after') : null;
    const erreur: HubSpotApiError = new Error(`Appel HubSpot refusé : HTTP ${status}.`);
    erreur.status = status;
    erreur.correlationId = correlationId;
    if (status === 429) {
      erreur.retryAfterMs = parseRetryAfterMs(retryAfterRaw, 5000, 60000);
    }
    erreur.creationPeutAvoirReussi = method === 'POST' && status >= 500;
    erreur.isPermanentError = status === 400 || status === 401 || status === 403 || status === 404 || status === 422;
    console.warn(
      `[HubSpotPipeline] HTTP ${status} sur ${method} ${chemin} (correlationId=${correlationId || 'n/a'})`
    );
    throw erreur;
  }

  return resultat;
}

/**
 * Crée une transaction (Deal) dans le pipeline "Suivi commercial WhatsApp" (4352514296)
 * à l'étape NOUVELLE_DEMANDE (6443559115) et l'associe au contact HubSpot existant (associationTypeId: 3).
 * N'invente ni montant, ni devise, ni responsable, ni date de clôture.
 */
export async function creerOpportunite(
  params: {
    contactId: string | number;
    nomDemande: string;
    montant?: number | null;
  },
  options?: { token?: string; fetchImpl?: FetchLike }
): Promise<string> {
  const { contactId, nomDemande, montant } = params;
  if (!/^\d+$/.test(String(contactId))) {
    const err: HubSpotApiError = new Error('Un ID de contact HubSpot valide est requis.');
    err.isPermanentError = true;
    throw err;
  }
  if (typeof nomDemande !== 'string' || !nomDemande.trim()) {
    const err: HubSpotApiError = new Error('Un nom de demande est requis.');
    err.isPermanentError = true;
    throw err;
  }

  const properties: Record<string, string> = {
    dealname: nomDemande.trim(),
    pipeline: PIPELINE_ID,
    dealstage: ETAPES.NOUVELLE_DEMANDE,
  };

  if (montant !== undefined && montant !== null) {
    if (typeof montant !== 'number' || !Number.isFinite(montant) || montant < 0) {
      const err: HubSpotApiError = new Error('Le montant doit être un nombre positif ou nul.');
      err.isPermanentError = true;
      throw err;
    }
    properties.amount = String(montant);
  }

  const resultat = await requeteHubSpot(
    'POST',
    '/crm/v3/objects/deals',
    {
      properties,
      associations: [
        {
          to: { id: String(contactId) },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 3, // Sens transaction -> contact
            },
          ],
        },
      ],
    },
    options
  );

  if (!resultat?.id) {
    const err: HubSpotApiError = new Error(
      'Création peut-être réussie, mais ID absent : vérifier avant de répéter.'
    );
    err.creationPeutAvoirReussi = true;
    throw err;
  }

  return String(resultat.id);
}

/**
 * Met à jour l'étape d'une transaction HubSpot existante via PATCH /crm/v3/objects/deals/<dealId>.
 */
export async function changerEtape(
  dealId: string | number,
  cleEtape: string,
  options?: { token?: string; fetchImpl?: FetchLike }
): Promise<any> {
  if (!/^\d+$/.test(String(dealId))) {
    const err: HubSpotApiError = new Error('Un ID de transaction HubSpot valide est requis.');
    err.isPermanentError = true;
    throw err;
  }
  if (!Object.prototype.hasOwnProperty.call(ETAPES, cleEtape)) {
    const err: HubSpotApiError = new Error(`Étape inconnue: "${cleEtape}". Utiliser une clé de ETAPES.`);
    err.isPermanentError = true;
    throw err;
  }

  const stageId = ETAPES[cleEtape as EtapeKey];
  return requeteHubSpot(
    'PATCH',
    `/crm/v3/objects/deals/${dealId}`,
    {
      properties: { dealstage: stageId },
    },
    options
  );
}

/**
 * Génère une référence interne courte et non sensible (sans numéro de téléphone ni nom client).
 */
export function buildNonSensitiveReference(requestKey: string, isTest = false): string {
  const hash = crypto.createHash('sha256').update(requestKey).digest('hex').slice(0, 8).toUpperCase();
  const prefix = isTest ? 'TEST-WA' : 'WA';
  return `${prefix}-${hash}`;
}

export function buildDealNameFromReference(reference: string, isTest = false): string {
  if (isTest && !reference.startsWith('TEST')) {
    return `Demande WhatsApp - TEST-${reference}`;
  }
  return `Demande WhatsApp - ${reference}`;
}

/**
 * Détecte si le message du prospect correspond à un refus explicite ou une annulation avant conclusion.
 */
export function isExplicitCancellationOrRefusal(text?: string | null): boolean {
  if (!text) return false;
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\b(j'annule|je veux annuler|annuler ma demande|annulation|je ne suis plus interesse|plus interesse|je laisse tomber|non merci plus besoin|j'abandonne)\b/.test(
    normalized
  );
}

/**
 * Détecte si le client affirme simplement avoir payé dans la conversation ("j'ai payé").
 * RÈGLE CRITIQUE : Cette phrase seule ne doit JAMAIS déclencher l'étape GAGNEE sans vérification.
 */
export function isUnverifiedClientPaymentClaim(text?: string | null): boolean {
  if (!text) return false;
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\b(j'ai paye|jai paye|je viens de payer|paiement effectue|c'est paye|virement fait|depot fait|orange money envoye|momo envoye)\b/.test(
    normalized
  );
}

/**
 * Détermine l'étape métier cible à partir de données vérifiées (sans jamais retourner GAGNEE sur une simple déclaration client).
 */
export function evaluateReliableStage(params: {
  conversationStage?: string | null;
  intent?: string | null;
  need?: string | null;
  recommendedOffer?: string | null;
  participantsCount?: number | null;
  preferredDate?: string | null;
  productIdentified?: boolean;
  purchaseIntent?: string | null;
  offerActuallySent?: boolean;
  inboundText?: string | null;
  paymentVerified?: boolean;
  bookingConfirmed?: boolean;
  explicitCancelled?: boolean;
}): EtapeKey | null {
  // 1. Vente confirmée : exige OBLIGATOIREMENT réservation confirmée + paiement vérifié
  if (params.paymentVerified === true && params.bookingConfirmed === true) {
    return 'GAGNEE';
  }

  // 2. Refus explicite ou annulation avant conclusion
  if (params.explicitCancelled === true || isExplicitCancellationOrRefusal(params.inboundText)) {
    return 'PERDUE';
  }

  // 3. Accord explicite du client (ou déclaration de paiement non encore vérifiée) -> ACCORD_PAIEMENT_ATTENDU
  if (
    params.purchaseIntent === 'veut_reserver' ||
    params.conversationStage === 'CONVERSION' ||
    isUnverifiedClientPaymentClaim(params.inboundText)
  ) {
    return 'ACCORD_PAIEMENT_ATTENDU';
  }

  // 4. Offre ou brochure réellement envoyée au prospect -> OFFRE_ENVOYEE
  if (params.offerActuallySent === true) {
    return 'OFFRE_ENVOYEE';
  }

  // 5. Informations nécessaires effectivement recueillies (offre/besoin + participants + date) -> QUALIFIEE
  const hasNeedOrOffer = Boolean(params.recommendedOffer || params.need || params.productIdentified);
  const hasParticipants = Boolean(params.participantsCount && params.participantsCount > 0);
  const hasDate = Boolean(params.preferredDate && params.preferredDate.trim().length > 0);
  if (hasNeedOrOffer && hasParticipants && hasDate) {
    return 'QUALIFIEE';
  }

  // 6. Collecte des besoins commencée -> A_QUALIFIER
  if (
    hasNeedOrOffer ||
    hasParticipants ||
    hasDate ||
    params.conversationStage === 'DISCOVERY' ||
    params.conversationStage === 'QUALIFICATION' ||
    params.conversationStage === 'RECOMMENDATION'
  ) {
    return 'A_QUALIFIER';
  }

  // 7. Nouvelle demande identifiée -> NOUVELLE_DEMANDE
  if (params.intent && params.intent !== 'Autre') {
    return 'NOUVELLE_DEMANDE';
  }

  return null;
}

/**
 * Décide si une transition de `currentStage` vers `targetStage` est autorisée
 * selon les règles anti-régression, la protection des étapes terminales et la validation de paiement.
 */
export function validateStageTransitionPolicy(params: {
  currentStage: EtapeKey | null;
  targetStage: string;
  paymentVerified?: boolean;
  bookingConfirmed?: boolean;
  allowReopen?: boolean;
  allowTerminalOverride?: boolean;
  eventTimestamp?: Date;
  lastEventAt?: Date | null;
}): {
  allowed: boolean;
  reason?: string;
  effectiveStage?: EtapeKey;
} {
  const {
    currentStage,
    targetStage,
    paymentVerified = false,
    bookingConfirmed = false,
    allowReopen = false,
    allowTerminalOverride = false,
    eventTimestamp,
    lastEventAt,
  } = params;

  // 1. Vérifier que l'étape demandée existe dans ETAPES
  if (!Object.prototype.hasOwnProperty.call(ETAPES, targetStage)) {
    return {
      allowed: false,
      reason: `Étape inconnue: "${targetStage}".`,
    };
  }
  const validTarget = targetStage as EtapeKey;

  // 2. Règle absolue : GAGNEE exige un paiement vérifié et une réservation confirmée
  if (validTarget === 'GAGNEE' && (!paymentVerified || !bookingConfirmed)) {
    return {
      allowed: false,
      reason: 'Transition vers GAGNEE refusée : la réservation et le paiement doivent être vérifiés.',
    };
  }

  // 3. Rejet des événements retardés (horodatage antérieur au dernier événement appliqué)
  if (eventTimestamp && lastEventAt && eventTimestamp.getTime() < lastEventAt.getTime()) {
    return {
      allowed: false,
      reason: 'Événement retardé ignoré (horodatage antérieur au dernier état).',
    };
  }

  if (!currentStage) {
    return { allowed: true, effectiveStage: validTarget };
  }

  if (currentStage === validTarget) {
    return { allowed: true, effectiveStage: validTarget, reason: 'Déjà à cette étape.' };
  }

  // 4. Protection des étapes terminales (GAGNEE / PERDUE)
  if (currentStage === 'GAGNEE') {
    if (!allowTerminalOverride) {
      return {
        allowed: false,
        reason: 'Demande déjà GAGNEE : aucune transition automatique (même vers PERDUE) n’est autorisée sans validation humaine explicite.',
      };
    }
    return { allowed: true, effectiveStage: validTarget };
  }

  if (currentStage === 'PERDUE') {
    if (!allowReopen && !allowTerminalOverride) {
      return {
        allowed: false,
        reason: 'Demande déjà PERDUE : réouverture automatique interdite (utiliser allowReopen ou créer une nouvelle demande).',
      };
    }
    return { allowed: true, effectiveStage: validTarget };
  }

  // 5. Depuis une étape active non terminale, GAGNEE (si vérifiée) et PERDUE sont autorisées
  if (validTarget === 'GAGNEE' || validTarget === 'PERDUE') {
    return { allowed: true, effectiveStage: validTarget };
  }

  // 6. Anti-régression entre étapes actives (1..5)
  const currentRank = ACTIVE_STAGE_RANK[currentStage];
  const targetRank = ACTIVE_STAGE_RANK[validTarget];
  if (targetRank < currentRank) {
    return {
      allowed: false,
      reason: `Régression d’étape refusée (${currentStage} -> ${validTarget}).`,
    };
  }

  return { allowed: true, effectiveStage: validTarget };
}

export class HubSpotPipelineService {
  private inMemoryLocks = new Map<string, Promise<any>>();
  private fetchImpl?: FetchLike;
  private pipelineVerifiedCache: { valid: boolean; checkedAt: number; details?: any } | null = null;

  constructor(opts?: { fetchImpl?: FetchLike }) {
    this.fetchImpl = opts?.fetchImpl;
  }

  public setFetchImplementation(fetchImpl?: FetchLike): void {
    this.fetchImpl = fetchImpl;
  }

  public isDryRunMode(): boolean {
    return (
      env.HUBSPOT_DRY_RUN === 'true' ||
      !env.HUBSPOT_ACCESS_TOKEN ||
      env.HUBSPOT_ACCESS_TOKEN.trim().length === 0
    );
  }

  public isPipelineSyncEnabled(): boolean {
    return env.HUBSPOT_PIPELINE_SYNC_ENABLED === 'true';
  }

  /**
   * Exécute une fonction de manière sérialisée par clé de demande (verrou mémoire + verrou persistant en base).
   */
  public async withRequestLock<T>(requestKey: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.inMemoryLocks.get(requestKey) ?? Promise.resolve();
    let releaseMemory!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseMemory = resolve;
    });
    this.inMemoryLocks.set(requestKey, previous.then(() => current));

    await previous;
    const workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

    try {
      // Verrou persistant en base si la ligne existe déjà
      const now = new Date();
      const lockUntil = new Date(now.getTime() + 30_000);
      const existing = await prisma.commercialRequest
        .findUnique({ where: { requestKey } })
        .catch(() => null);

      if (existing) {
        const acquired = await prisma.commercialRequest.updateMany({
          where: {
            requestKey,
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }, { lockedBy: workerId }],
          },
          data: {
            lockedBy: workerId,
            lockedUntil: lockUntil,
          },
        });
        if (acquired.count === 0) {
          throw new Error(`Demande ${requestKey} actuellement verrouillée par un autre processus.`);
        }
      }

      return await fn();
    } finally {
      await prisma.commercialRequest
        .updateMany({
          where: { requestKey, lockedBy: workerId },
          data: { lockedBy: null, lockedUntil: null },
        })
        .catch(() => undefined);
      releaseMemory();
      if (this.inMemoryLocks.get(requestKey) === current) {
        this.inMemoryLocks.delete(requestKey);
      }
    }
  }

  /**
   * Vérifie en LECTURE SEULE que le pipeline 4352514296 ("Suivi commercial WhatsApp")
   * et ses 7 étapes existent toujours dans HubSpot avant toute écriture réelle.
   * Ne recrée jamais le pipeline ni ses étapes en cas d'écart.
   */
  public async verifyPipelineConfiguration(forceRefresh = false): Promise<{
    valid: boolean;
    pipelineId: string;
    label?: string;
    missingStages: Array<{ key: EtapeKey; id: string }>;
    error?: string;
    simulated?: boolean;
  }> {
    if (this.isDryRunMode()) {
      return {
        valid: true,
        pipelineId: PIPELINE_ID,
        label: 'Suivi commercial WhatsApp (Simulation)',
        missingStages: [],
        simulated: true,
      };
    }

    if (
      !forceRefresh &&
      this.pipelineVerifiedCache &&
      Date.now() - this.pipelineVerifiedCache.checkedAt < 10 * 60 * 1000
    ) {
      return this.pipelineVerifiedCache.details;
    }

    try {
      const data = await requeteHubSpot('GET', `/crm/v3/pipelines/deals/${PIPELINE_ID}`, undefined, {
        fetchImpl: this.fetchImpl,
      });

      const remoteStages = new Set<string>(
        Array.isArray(data?.stages) ? data.stages.map((s: any) => String(s.id)) : []
      );

      const missingStages: Array<{ key: EtapeKey; id: string }> = [];
      for (const [key, id] of Object.entries(ETAPES) as Array<[EtapeKey, string]>) {
        if (!remoteStages.has(id)) {
          missingStages.push({ key, id });
        }
      }

      const valid = String(data?.id || PIPELINE_ID) === PIPELINE_ID && missingStages.length === 0;
      const result = {
        valid,
        pipelineId: PIPELINE_ID,
        label: data?.label,
        missingStages,
        error: valid
          ? undefined
          : `Écart de configuration HubSpot détecté sur le pipeline ${PIPELINE_ID} : étapes manquantes = ${missingStages
              .map((m) => `${m.key}(${m.id})`)
              .join(', ')}`,
      };

      this.pipelineVerifiedCache = { valid, checkedAt: Date.now(), details: result };
      return result;
    } catch (err: any) {
      return {
        valid: false,
        pipelineId: PIPELINE_ID,
        missingStages: [],
        error: err?.message || 'Impossible de vérifier le pipeline HubSpot en lecture.',
      };
    }
  }

  /**
   * Résout ou initialise la demande commerciale active d'un prospect.
   * Règle explicite de séparation des demandes :
   * - Tant qu'une demande est active (ni GAGNEE ni PERDUE) pour ce prospect, elle est réutilisée.
   * - Si toutes les demandes précédentes du prospect sont terminées (GAGNEE / PERDUE) ou si `forceNewProject` est vrai,
   *   une nouvelle demande commerciale avec une clé `requestKey` distincte (`req_<leadId>_<seq>`) est créée.
   */
  public async getOrCreateCommercialRequest(params: {
    leadId: string;
    hubspotContactId?: string | null;
    requestKeyOverride?: string;
    forceNewProject?: boolean;
    isTest?: boolean;
  }) {
    const { leadId, hubspotContactId, requestKeyOverride, forceNewProject = false, isTest = false } = params;

    if (requestKeyOverride) {
      const existingByKey = await prisma.commercialRequest.findUnique({
        where: { requestKey: requestKeyOverride },
      });
      if (existingByKey) {
        if (hubspotContactId && !existingByKey.hubspotContactId) {
          return prisma.commercialRequest.update({
            where: { id: existingByKey.id },
            data: { hubspotContactId },
          });
        }
        return existingByKey;
      }

      const reference = buildNonSensitiveReference(requestKeyOverride, isTest);
      return prisma.commercialRequest.create({
        data: {
          requestKey: requestKeyOverride,
          reference,
          leadId,
          hubspotContactId: hubspotContactId || null,
          pipelineId: PIPELINE_ID,
          requestedStage: 'NOUVELLE_DEMANDE',
          syncStatus: 'pending',
          isTest,
        },
      });
    }

    const existingRequests = await prisma.commercialRequest.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });

    if (!forceNewProject && existingRequests.length > 0) {
      const activeRequest = existingRequests.find(
        (r) => !TERMINAL_STAGES.has(r.requestedStage as EtapeKey) && !TERMINAL_STAGES.has((r.syncedStage || '') as EtapeKey)
      );
      if (activeRequest) {
        if (hubspotContactId && !activeRequest.hubspotContactId) {
          return prisma.commercialRequest.update({
            where: { id: activeRequest.id },
            data: { hubspotContactId },
          });
        }
        return activeRequest;
      }
    }

    const seq = existingRequests.length + 1;
    const requestKey = `req_${leadId}_${seq}`;
    const reference = buildNonSensitiveReference(requestKey, isTest);

    return prisma.commercialRequest.create({
      data: {
        requestKey,
        reference,
        leadId,
        hubspotContactId: hubspotContactId || null,
        pipelineId: PIPELINE_ID,
        requestedStage: 'NOUVELLE_DEMANDE',
        syncStatus: 'pending',
        isTest,
      },
    });
  }

  /**
   * Réconcilie une demande dont la création précédente a eu un résultat incertain (timeout réseau, 5xx ou crash serveur pendant POST).
   * Recherche les transactions associées au contact dans le pipeline 4352514296 portant la référence de la demande
   * avant toute tentative de nouvelle création.
   */
  public async reconcileUncertainDeal(request: {
    id: string;
    requestKey: string;
    reference: string;
    hubspotContactId?: string | null;
    isTest?: boolean;
  }): Promise<{ foundDealId: string | null; remoteStageKey?: EtapeKey }> {
    if (!request.hubspotContactId || this.isDryRunMode()) {
      return { foundDealId: null };
    }

    const expectedDealName = buildDealNameFromReference(request.reference, Boolean(request.isTest));

    // Lire les associations Contact -> Deals
    const assocRes = await requeteHubSpot(
      'GET',
      `/crm/v3/objects/contacts/${request.hubspotContactId}/associations/deals`,
      undefined,
      { fetchImpl: this.fetchImpl }
    );

    const dealIds: string[] = Array.isArray(assocRes?.results)
      ? assocRes.results.map((r: any) => String(r.id || r.toObjectId)).filter(Boolean)
      : [];

    for (const candidateDealId of dealIds) {
      const deal = await requeteHubSpot(
        'GET',
        `/crm/v3/objects/deals/${candidateDealId}?properties=dealname,pipeline,dealstage`,
        undefined,
        { fetchImpl: this.fetchImpl }
      );
      const props = deal?.properties || {};
      if (
        String(props.pipeline) === PIPELINE_ID &&
        typeof props.dealname === 'string' &&
        props.dealname.trim() === expectedDealName
      ) {
        const remoteStageKey = STAGE_ID_TO_KEY[String(props.dealstage)] || 'NOUVELLE_DEMANDE';
        return { foundDealId: String(deal.id), remoteStageKey };
      }
    }

    return { foundDealId: null };
  }

  /**
   * Inspecte l'étape actuelle de la transaction dans HubSpot afin de détecter
   * si un commercial a modifié manuellement la transaction (ex: vers GAGNEE, PERDUE ou une étape plus avancée).
   */
  public async inspectRemoteDealStage(dealId: string): Promise<{
    pipelineId?: string;
    remoteStageId?: string;
    remoteStageKey?: EtapeKey;
  }> {
    const deal = await requeteHubSpot(
      'GET',
      `/crm/v3/objects/deals/${dealId}?properties=dealname,pipeline,dealstage`,
      undefined,
      { fetchImpl: this.fetchImpl }
    );
    const pipelineId = deal?.properties?.pipeline ? String(deal.properties.pipeline) : undefined;
    const remoteStageId = deal?.properties?.dealstage ? String(deal.properties.dealstage) : undefined;
    const remoteStageKey = remoteStageId ? STAGE_ID_TO_KEY[remoteStageId] : undefined;
    return { pipelineId, remoteStageId, remoteStageKey };
  }

  /**
   * Crée ou réconcilie la transaction HubSpot pour une demande commerciale identifiée.
   * - Sérialisé par demande via withRequestLock.
   * - En cas de statut `uncertain_creation` ou `creating` interrompu, réconcilie d'abord en lecture.
   * - Vérifie en lecture que le pipeline 4352514296 et ses étapes existent avant le premier POST.
   */
  public async ensureDealForRequest(params: {
    leadId: string;
    contactId: string;
    requestKey?: string;
    forceNewProject?: boolean;
    isTest?: boolean;
  }): Promise<{
    success: boolean;
    requestId: string;
    requestKey: string;
    dealId?: string;
    syncStatus: string;
    stage: EtapeKey;
    reconciled?: boolean;
    simulated?: boolean;
    error?: string;
  }> {
    const initialReq = await this.getOrCreateCommercialRequest({
      leadId: params.leadId,
      hubspotContactId: params.contactId,
      requestKeyOverride: params.requestKey,
      forceNewProject: params.forceNewProject,
      isTest: params.isTest,
    });

    return this.withRequestLock(initialReq.requestKey, async () => {
      let req = await prisma.commercialRequest.findUniqueOrThrow({
        where: { id: initialReq.id },
      });

      if (params.contactId && req.hubspotContactId !== String(params.contactId)) {
        req = await prisma.commercialRequest.update({
          where: { id: req.id },
          data: { hubspotContactId: String(params.contactId) },
        });
      }

      // 1. Si le dealId est déjà enregistré en base, le réutiliser immédiatement (aucun doublon)
      if (req.hubspotDealId) {
        return {
          success: true,
          requestId: req.id,
          requestKey: req.requestKey,
          dealId: req.hubspotDealId,
          syncStatus: req.syncStatus,
          stage: (req.syncedStage || req.requestedStage) as EtapeKey,
        };
      }

      // 2. Mode simulation (Dry-Run ou sans token) : aucun appel réseau HubSpot
      if (this.isDryRunMode()) {
        const simDealId = `sim_deal_${req.reference}`;
        const updated = await prisma.commercialRequest.update({
          where: { id: req.id },
          data: {
            hubspotDealId: simDealId,
            syncedStage: req.requestedStage,
            remoteStageId: ETAPES[req.requestedStage as EtapeKey] || ETAPES.NOUVELLE_DEMANDE,
            syncStatus: 'simulated',
            lastSyncedAt: new Date(),
            lastError: null,
          },
        });
        return {
          success: true,
          requestId: updated.id,
          requestKey: updated.requestKey,
          dealId: simDealId,
          syncStatus: 'simulated',
          stage: updated.syncedStage as EtapeKey,
          simulated: true,
        };
      }

      // 3. Vérification préalable en lecture du pipeline 4352514296 et de ses 7 étapes
      const pipelineCheck = await this.verifyPipelineConfiguration();
      if (!pipelineCheck.valid) {
        await prisma.commercialRequest.update({
          where: { id: req.id },
          data: {
            syncStatus: 'failed_permanent',
            lastError: pipelineCheck.error || 'Configuration du pipeline HubSpot invalide.',
          },
        });
        return {
          success: false,
          requestId: req.id,
          requestKey: req.requestKey,
          syncStatus: 'failed_permanent',
          stage: req.requestedStage as EtapeKey,
          error: pipelineCheck.error,
        };
      }

      // 4. Si une tentative précédente était incertaine (`uncertain_creation` ou `creating` interrompu par crash),
      // réconcilier impérativement avant de tenter un nouveau POST !
      if (req.syncStatus === 'uncertain_creation' || req.syncStatus === 'creating') {
        try {
          const reconciled = await this.reconcileUncertainDeal(req);
          if (reconciled.foundDealId) {
            const stageKey = reconciled.remoteStageKey || 'NOUVELLE_DEMANDE';
            const updated = await prisma.commercialRequest.update({
              where: { id: req.id },
              data: {
                hubspotDealId: reconciled.foundDealId,
                syncedStage: stageKey,
                remoteStageId: ETAPES[stageKey],
                syncStatus: 'synced',
                lastSyncedAt: new Date(),
                lastError: null,
                nextRetryAt: null,
              },
            });
            await prisma.lead
              .update({
                where: { id: req.leadId },
                data: { hubspotDealId: reconciled.foundDealId, hubspotSyncStatus: 'synced', hubspotLastError: null },
              })
              .catch(() => undefined);

            return {
              success: true,
              requestId: updated.id,
              requestKey: updated.requestKey,
              dealId: reconciled.foundDealId,
              syncStatus: 'synced',
              stage: stageKey,
              reconciled: true,
            };
          }
        } catch (reconcileErr: any) {
          // Si la lecture de réconciliation échoue (ex: 5xx/429/timeout), NE PAS recréer en aveugle !
          const attempts = req.attempts + 1;
          const delayMs = computeBoundedBackoffMs(attempts, reconcileErr?.retryAfterMs);
          await prisma.commercialRequest.update({
            where: { id: req.id },
            data: {
              syncStatus: 'uncertain_creation',
              attempts,
              nextRetryAt: new Date(Date.now() + delayMs),
              lastError: `Réconciliation en attente: ${reconcileErr?.message || 'Erreur lecture HubSpot'}`,
              lastCorrelationId: reconcileErr?.correlationId || req.lastCorrelationId,
            },
          });
          return {
            success: false,
            requestId: req.id,
            requestKey: req.requestKey,
            syncStatus: 'uncertain_creation',
            stage: req.requestedStage as EtapeKey,
            error: reconcileErr?.message,
          };
        }
      }

      // 5. Marquer `creating` en base AVANT l'appel POST (pour détecter un arrêt brutal du serveur pendant l'appel)
      const attempts = req.attempts + 1;
      await prisma.commercialRequest.update({
        where: { id: req.id },
        data: {
          syncStatus: 'creating',
          attempts,
        },
      });

      const dealName = buildDealNameFromReference(req.reference, req.isTest);

      try {
        const createdDealId = await creerOpportunite(
          {
            contactId: String(params.contactId),
            nomDemande: dealName,
          },
          { fetchImpl: this.fetchImpl }
        );

        const updated = await prisma.commercialRequest.update({
          where: { id: req.id },
          data: {
            hubspotDealId: createdDealId,
            syncedStage: 'NOUVELLE_DEMANDE',
            remoteStageId: ETAPES.NOUVELLE_DEMANDE,
            syncStatus: 'synced',
            lastSyncedAt: new Date(),
            lastError: null,
            nextRetryAt: null,
          },
        });

        await prisma.lead
          .update({
            where: { id: req.leadId },
            data: { hubspotDealId: createdDealId, hubspotSyncStatus: 'synced', hubspotLastError: null },
          })
          .catch(() => undefined);

        // Si l'étape demandée a déjà évolué au-delà de NOUVELLE_DEMANDE, appliquer la transition
        if (updated.requestedStage !== 'NOUVELLE_DEMANDE') {
          await this.applyStagePatchLocked(updated.id, updated.requestedStage as EtapeKey);
        }

        return {
          success: true,
          requestId: updated.id,
          requestKey: updated.requestKey,
          dealId: createdDealId,
          syncStatus: 'synced',
          stage: (updated.requestedStage || 'NOUVELLE_DEMANDE') as EtapeKey,
        };
      } catch (err: any) {
        const hubErr = err as HubSpotApiError;
        if (hubErr.creationPeutAvoirReussi) {
          const delayMs = computeBoundedBackoffMs(attempts, hubErr.retryAfterMs);
          await prisma.commercialRequest.update({
            where: { id: req.id },
            data: {
              syncStatus: 'uncertain_creation',
              nextRetryAt: new Date(Date.now() + delayMs),
              lastError: hubErr.message,
              lastCorrelationId: hubErr.correlationId || null,
            },
          });
          return {
            success: false,
            requestId: req.id,
            requestKey: req.requestKey,
            syncStatus: 'uncertain_creation',
            stage: req.requestedStage as EtapeKey,
            error: hubErr.message,
          };
        }

        if (hubErr.isPermanentError) {
          await prisma.commercialRequest.update({
            where: { id: req.id },
            data: {
              syncStatus: 'failed_permanent',
              nextRetryAt: null,
              lastError: hubErr.message,
              lastCorrelationId: hubErr.correlationId || null,
            },
          });
          return {
            success: false,
            requestId: req.id,
            requestKey: req.requestKey,
            syncStatus: 'failed_permanent',
            stage: req.requestedStage as EtapeKey,
            error: hubErr.message,
          };
        }

        const delayMs = computeBoundedBackoffMs(attempts, hubErr.retryAfterMs);
        await prisma.commercialRequest.update({
          where: { id: req.id },
          data: {
            syncStatus: 'retry_scheduled',
            nextRetryAt: new Date(Date.now() + delayMs),
            lastError: hubErr.message,
            lastCorrelationId: hubErr.correlationId || null,
          },
        });
        return {
          success: false,
          requestId: req.id,
          requestKey: req.requestKey,
          syncStatus: 'retry_scheduled',
          stage: req.requestedStage as EtapeKey,
          error: hubErr.message,
        };
      }
    });
  }

  /**
   * Fonction centralisée de transition d'étape sur une demande commerciale.
   * - Valide l'étape cible et la politique anti-régression / étapes terminales / paiement vérifié.
   * - Vérifie les modifications manuelles dans HubSpot pour ne pas les écraser aveuglément.
   * - Gère les erreurs 429, 5xx, 400/401/403 avec backoff borné.
   */
  public async transitionRequestStage(params: {
    requestKey: string;
    targetStage: string;
    paymentVerified?: boolean;
    paymentVerifiedBy?: string;
    paymentReference?: string;
    bookingConfirmed?: boolean;
    offerSent?: boolean;
    allowReopen?: boolean;
    allowTerminalOverride?: boolean;
    checkRemoteManualChanges?: boolean;
    eventTimestamp?: Date;
  }): Promise<{
    success: boolean;
    status: string;
    previousStage: EtapeKey | null;
    stage: EtapeKey;
    reason?: string;
    error?: string;
  }> {
    return this.withRequestLock(params.requestKey, async () => {
      const req = await prisma.commercialRequest.findUnique({
        where: { requestKey: params.requestKey },
      });
      if (!req) {
        throw new Error(`Demande commerciale introuvable: ${params.requestKey}`);
      }

      const effectivePaymentVerified = params.paymentVerified ?? req.paymentVerified;
      const effectiveBookingConfirmed = params.bookingConfirmed ?? req.bookingConfirmed;
      const currentEffectiveStage = (req.syncedStage || req.requestedStage) as EtapeKey | null;

      // 1. Validation de la politique de transition
      const policy = validateStageTransitionPolicy({
        currentStage: currentEffectiveStage,
        targetStage: params.targetStage,
        paymentVerified: effectivePaymentVerified,
        bookingConfirmed: effectiveBookingConfirmed,
        allowReopen: params.allowReopen,
        allowTerminalOverride: params.allowTerminalOverride,
        eventTimestamp: params.eventTimestamp,
        lastEventAt: req.lastEventAt,
      });

      if (!policy.allowed || !policy.effectiveStage) {
        return {
          success: false,
          status: 'rejected_by_policy',
          previousStage: currentEffectiveStage,
          stage: currentEffectiveStage || 'NOUVELLE_DEMANDE',
          reason: policy.reason,
        };
      }

      const targetKey = policy.effectiveStage;

      // Si déjà synchronisé exactement sur cette étape, rien à envoyer à HubSpot
      if (req.syncedStage === targetKey && req.syncStatus === 'synced') {
        return {
          success: true,
          status: 'noop_already_at_stage',
          previousStage: currentEffectiveStage,
          stage: targetKey,
          reason: policy.reason,
        };
      }

      // 2. Enregistrer l'état demandé et les preuves métier en base
      const updatedReq = await prisma.commercialRequest.update({
        where: { id: req.id },
        data: {
          requestedStage: targetKey,
          paymentVerified: effectivePaymentVerified,
          paymentVerifiedBy: params.paymentVerifiedBy ?? req.paymentVerifiedBy,
          paymentVerifiedAt:
            params.paymentVerified && !req.paymentVerified ? new Date() : req.paymentVerifiedAt,
          paymentReference: params.paymentReference ?? req.paymentReference,
          bookingConfirmed: effectiveBookingConfirmed,
          offerSentAt: params.offerSent && !req.offerSentAt ? new Date() : req.offerSentAt,
          lastEventAt: params.eventTimestamp || new Date(),
        },
      });

      // Si la transaction n'est pas encore créée dans HubSpot, l'étape demandée sera appliquée dès sa création
      if (!updatedReq.hubspotDealId) {
        return {
          success: true,
          status: 'queued_until_deal_created',
          previousStage: currentEffectiveStage,
          stage: targetKey,
        };
      }

      return this.applyStagePatchLocked(updatedReq.id, targetKey, {
        checkRemoteManualChanges: params.checkRemoteManualChanges ?? true,
        allowTerminalOverride: params.allowTerminalOverride,
      });
    });
  }

  private async applyStagePatchLocked(
    requestId: string,
    targetKey: EtapeKey,
    opts?: { checkRemoteManualChanges?: boolean; allowTerminalOverride?: boolean }
  ): Promise<{
    success: boolean;
    status: string;
    previousStage: EtapeKey | null;
    stage: EtapeKey;
    reason?: string;
    error?: string;
  }> {
    const req = await prisma.commercialRequest.findUniqueOrThrow({ where: { id: requestId } });
    const previousStage = (req.syncedStage || req.requestedStage) as EtapeKey | null;

    if (this.isDryRunMode() || String(req.hubspotDealId).startsWith('sim_deal_')) {
      await prisma.commercialRequest.update({
        where: { id: req.id },
        data: {
          syncedStage: targetKey,
          remoteStageId: ETAPES[targetKey],
          syncStatus: 'simulated',
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
      return {
        success: true,
        status: 'simulated',
        previousStage,
        stage: targetKey,
      };
    }

    // Vérification optionnelle des modifications manuelles faites directement dans HubSpot
    if (opts?.checkRemoteManualChanges && req.hubspotDealId && !opts?.allowTerminalOverride) {
      try {
        const remote = await this.inspectRemoteDealStage(req.hubspotDealId);
        if (remote.pipelineId && remote.pipelineId !== PIPELINE_ID) {
          await prisma.commercialRequest.update({
            where: { id: req.id },
            data: {
              syncStatus: 'manual_override',
              lastError: `Transaction déplacée manuellement dans un autre pipeline (${remote.pipelineId}).`,
            },
          });
          return {
            success: false,
            status: 'manual_override_preserved',
            previousStage,
            stage: previousStage || targetKey,
            reason: 'Transaction déplacée dans un autre pipeline côté HubSpot.',
          };
        }

        if (remote.remoteStageKey && req.syncedStage && remote.remoteStageKey !== req.syncedStage) {
          // Un humain a modifié l'étape directement dans HubSpot depuis notre dernière synchro
          const remoteIsTerminal = TERMINAL_STAGES.has(remote.remoteStageKey);
          const remoteRank = ACTIVE_STAGE_RANK[remote.remoteStageKey];
          const targetRank = ACTIVE_STAGE_RANK[targetKey];

          if (remoteIsTerminal || remoteRank > targetRank) {
            await prisma.commercialRequest.update({
              where: { id: req.id },
              data: {
                syncedStage: remote.remoteStageKey,
                requestedStage: remote.remoteStageKey,
                remoteStageId: remote.remoteStageId,
                syncStatus: 'manual_override',
                lastSyncedAt: new Date(),
              },
            });
            return {
              success: true,
              status: 'manual_override_preserved',
              previousStage,
              stage: remote.remoteStageKey,
              reason: `Modification manuelle HubSpot préservée (${remote.remoteStageKey}).`,
            };
          }
        }
      } catch {
        // Si la lecture préalable échoue, on tente tout de même le PATCH qui a sa propre gestion d'erreur
      }
    }

    const attempts = req.attempts + 1;
    try {
      await changerEtape(req.hubspotDealId!, targetKey, { fetchImpl: this.fetchImpl });

      await prisma.commercialRequest.update({
        where: { id: req.id },
        data: {
          syncedStage: targetKey,
          remoteStageId: ETAPES[targetKey],
          syncStatus: 'synced',
          attempts,
          nextRetryAt: null,
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });

      return {
        success: true,
        status: 'synced',
        previousStage,
        stage: targetKey,
      };
    } catch (err: any) {
      const hubErr = err as HubSpotApiError;
      if (hubErr.isPermanentError) {
        await prisma.commercialRequest.update({
          where: { id: req.id },
          data: {
            syncStatus: 'failed_permanent',
            attempts,
            nextRetryAt: null,
            lastError: hubErr.message,
            lastCorrelationId: hubErr.correlationId || null,
          },
        });
        return {
          success: false,
          status: 'failed_permanent',
          previousStage,
          stage: previousStage || targetKey,
          error: hubErr.message,
        };
      }

      const delayMs = computeBoundedBackoffMs(attempts, hubErr.retryAfterMs);
      await prisma.commercialRequest.update({
        where: { id: req.id },
        data: {
          syncStatus: 'retry_scheduled',
          attempts,
          nextRetryAt: new Date(Date.now() + delayMs),
          lastError: hubErr.message,
          lastCorrelationId: hubErr.correlationId || null,
        },
      });

      return {
        success: false,
        status: 'retry_scheduled',
        previousStage,
        stage: previousStage || targetKey,
        error: hubErr.message,
      };
    }
  }

  /**
   * Rejoue les demandes en attente de reprise (`uncertain_creation` ou `retry_scheduled` dont `nextRetryAt <= now`).
   */
  public async processPendingRetries(maxBatch = 10): Promise<{ processed: number }> {
    const now = new Date();
    const dueRequests = await prisma.commercialRequest.findMany({
      where: {
        syncStatus: { in: ['uncertain_creation', 'retry_scheduled'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { updatedAt: 'asc' },
      take: maxBatch,
    });

    let processed = 0;
    for (const req of dueRequests) {
      if (!req.hubspotContactId) continue;
      processed += 1;
      if (!req.hubspotDealId) {
        await this.ensureDealForRequest({
          leadId: req.leadId,
          contactId: req.hubspotContactId,
          requestKey: req.requestKey,
          isTest: req.isTest,
        });
      } else if (req.requestedStage !== req.syncedStage) {
        await this.transitionRequestStage({
          requestKey: req.requestKey,
          targetStage: req.requestedStage,
        });
      }
    }

    return { processed };
  }
}

export const hubspotPipelineService = new HubSpotPipelineService();
