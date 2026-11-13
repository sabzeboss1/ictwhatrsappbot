import { z } from 'zod';
import { prisma } from '../../plugins/prisma.js';

/**
 * Paramètres du module de relance.
 * Les valeurs par défaut sont volontairement PRUDENTES (anti-bannissement WhatsApp) :
 * relances auto désactivées par défaut, plafond journalier bas, envois espacés aléatoirement,
 * pas d'envoi la nuit, uniquement vers des prospects ayant déjà écrit.
 */
export const FollowUpStepSchema = z.object({
  delayHours: z.coerce.number().min(1).max(24 * 60),
  templates: z.array(z.string().min(5).max(1000)).min(1).max(10),
});

export const FollowUpSettingsSchema = z.object({
  autoEnabled: z.boolean().default(false),
  steps: z.array(FollowUpStepSchema).min(1).max(5),
  maxPerDay: z.coerce.number().int().min(1).max(500).default(40),
  minGapSeconds: z.coerce.number().int().min(20).max(3600).default(45),
  maxGapSeconds: z.coerce.number().int().min(30).max(7200).default(120),
  quietStartHour: z.coerce.number().int().min(0).max(23).default(20),
  quietEndHour: z.coerce.number().int().min(0).max(23).default(8),
  timezone: z.string().default('Africa/Douala'),
  minScore: z.coerce.number().int().min(0).max(100).default(30),
  excludeStages: z.array(z.string()).default(['CUSTOMER']),
  maxInactivityDays: z.coerce.number().int().min(1).max(90).default(21),
  skipIfHumanHandling: z.boolean().default(true),
  includeStopFooter: z.boolean().default(true),
  stopFooter: z.string().max(200).default('_Répondez STOP pour ne plus être relancé(e)._'),
});

export type FollowUpSettings = z.infer<typeof FollowUpSettingsSchema>;

export const DEFAULT_FOLLOWUP_SETTINGS: FollowUpSettings = {
  autoEnabled: false,
  steps: [
    {
      delayHours: 24,
      templates: [
        'Bonjour {prenom} 👋 Je reviens vers vous concernant {offre}. Avez-vous pu y réfléchir ? Je reste disponible pour toute question.',
        'Bonjour {prenom}, avez-vous eu le temps de consulter les informations sur {offre} ? Je peux vous aider à finaliser si vous le souhaitez 😊',
        'Bonjour {prenom} 👋 Petit message pour savoir si vous avez des questions sur votre projet de séjour. Je suis là pour vous aider !',
      ],
    },
    {
      delayHours: 48,
      templates: [
        'Bonjour {prenom}, souhaitez-vous que je vérifie les disponibilités pour le {date} ({participants} personnes) ?',
        "Bonjour {prenom} 😊 Souhaitez-vous qu'un conseiller ICT vous appelle pour finaliser votre projet {offre} ?",
        'Bonjour {prenom}, je me permets de revenir vers vous : souhaitez-vous recevoir un devis personnalisé pour votre séjour ?',
      ],
    },
    {
      delayHours: 96,
      templates: [
        "Bonjour {prenom}, je ne veux pas vous déranger 🙂 Si votre projet est toujours d'actualité, répondez simplement à ce message et je m'occupe de tout. Belle journée !",
        'Bonjour {prenom}, dernier petit message de ma part : si vous souhaitez toujours voyager avec Inside Cameroon Tourism, je reste à votre écoute. À bientôt 🇨🇲',
      ],
    },
  ],
  maxPerDay: 40,
  minGapSeconds: 45,
  maxGapSeconds: 120,
  quietStartHour: 20,
  quietEndHour: 8,
  timezone: 'Africa/Douala',
  minScore: 30,
  excludeStages: ['CUSTOMER'],
  maxInactivityDays: 21,
  skipIfHumanHandling: true,
  includeStopFooter: true,
  stopFooter: '_Répondez STOP pour ne plus être relancé(e)._',
};

const SETTINGS_KEY = 'followup.settings';
let cache: { value: FollowUpSettings; at: number } | null = null;

export async function getFollowUpSettings(): Promise<FollowUpSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    const parsed = row ? FollowUpSettingsSchema.safeParse({ ...DEFAULT_FOLLOWUP_SETTINGS, ...(row.value as any) }) : null;
    const value = parsed?.success ? parsed.data : DEFAULT_FOLLOWUP_SETTINGS;
    cache = { value, at: Date.now() };
    return value;
  } catch {
    return DEFAULT_FOLLOWUP_SETTINGS;
  }
}

export async function saveFollowUpSettings(input: unknown): Promise<FollowUpSettings> {
  const value = FollowUpSettingsSchema.parse(input);
  if (value.maxGapSeconds < value.minGapSeconds) value.maxGapSeconds = value.minGapSeconds;
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: value as any },
    update: { value: value as any },
  });
  cache = { value, at: Date.now() };
  return value;
}
