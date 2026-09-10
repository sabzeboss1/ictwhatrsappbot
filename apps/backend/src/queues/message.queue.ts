import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export interface ProcessMessageJobData {
  leadId: string;
  inboundText: string;
  whatsappMessageId?: string;
  phone: string;
}

export interface HubspotSyncJobData {
  leadId: string;
}

type MessageProcessorFn = (data: ProcessMessageJobData) => Promise<void>;
type HubspotSyncProcessorFn = (data: HubspotSyncJobData) => Promise<void>;

let messageProcessor: MessageProcessorFn | null = null;
let hubspotSyncProcessor: HubspotSyncProcessorFn | null = null;

let messageQueue: Queue | null = null;
let hubspotQueue: Queue | null = null;
let redisAvailable = false;

// Tentative d'initialisation Redis / BullMQ
try {
  const redisConnection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 3) {
        return null; // Arrêt des tentatives si Redis non présent
      }
      return Math.min(times * 100, 1000);
    },
  });

  redisConnection.on('connect', () => {
    redisAvailable = true;
    console.log('✓ Connecté à Redis pour BullMQ');
  });

  redisConnection.on('error', (err: any) => {
    if (!redisAvailable) {
      // Éviter le spam de logs si Redis est absent en dev
      console.log('ℹ Redis non disponible en local, bascule en mode file asynchrone mémoire');
    }
    redisAvailable = false;
  });

  messageQueue = new Queue('whatsapp-messages', { connection: redisConnection as any });
  hubspotQueue = new Queue('hubspot-sync', { connection: redisConnection as any });
} catch (e) {
  console.log('ℹ BullMQ en attente: mode mémoire actif');
}

export function registerProcessors(
  onProcessMessage: MessageProcessorFn,
  onHubspotSync: HubspotSyncProcessorFn
) {
  messageProcessor = onProcessMessage;
  hubspotSyncProcessor = onHubspotSync;

  // Si Redis est connecté, on configure les workers BullMQ
  if (redisAvailable && messageQueue && hubspotQueue) {
    try {
      const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
      new Worker(
        'whatsapp-messages',
        async (job: Job<ProcessMessageJobData>) => {
          if (messageProcessor) await messageProcessor(job.data);
        },
        { connection: connection as any }
      );

      new Worker(
        'hubspot-sync',
        async (job: Job<HubspotSyncJobData>) => {
          if (hubspotSyncProcessor) await hubspotSyncProcessor(job.data);
        },
        { connection }
      );
    } catch (e) {
      console.error('Erreur worker BullMQ:', e);
    }
  }
}

export async function enqueueMessageProcessing(data: ProcessMessageJobData) {
  if (redisAvailable && messageQueue) {
    await messageQueue.add('process-message', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });
  } else {
    // Mode asynchrone mémoire immédiat
    setImmediate(async () => {
      try {
        if (messageProcessor) {
          await messageProcessor(data);
        }
      } catch (err) {
        console.error('[Queue Mem] Erreur traitement message:', err);
      }
    });
  }
}

export async function enqueueHubspotSync(data: HubspotSyncJobData) {
  if (redisAvailable && hubspotQueue) {
    await hubspotQueue.add('sync-lead', data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
    });
  } else {
    // Mode asynchrone mémoire
    setImmediate(async () => {
      try {
        if (hubspotSyncProcessor) {
          await hubspotSyncProcessor(data);
        }
      } catch (err) {
        console.error('[Queue Mem] Erreur synchronisation HubSpot:', err);
      }
    });
  }
}
