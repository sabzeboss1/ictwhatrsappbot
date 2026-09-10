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

// Tentative d'initialisation Redis / BullMQ de manière non bloquante
try {
  const redisConnection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 1000,
    retryStrategy: (times: number) => {
      if (times > 1) {
        return null; // Pas de retry infini si Redis n'est pas lancé
      }
      return 500;
    },
  });

  redisConnection.on('connect', () => {
    redisAvailable = true;
    console.log('✓ Connecté à Redis pour BullMQ');
    try {
      messageQueue = new Queue('whatsapp-messages', { connection: redisConnection as any });
      hubspotQueue = new Queue('hubspot-sync', { connection: redisConnection as any });
    } catch (err) {
      console.log('ℹ Erreur init BullMQ Queue, utilisation mode asynchrone mémoire');
    }
  });

  redisConnection.on('error', () => {
    redisAvailable = false;
  });
} catch (e) {
  console.log('ℹ Mode mémoire asynchrone actif pour les messages');
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
