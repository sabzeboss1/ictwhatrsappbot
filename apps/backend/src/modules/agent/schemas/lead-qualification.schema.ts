import { z } from 'zod';

export const LeadQualificationOutputSchema = z.object({
  whatsapp_message: z.string().min(1).catch('Bonjour ! Comment puis-je vous aider chez Inside Cameroon Tourism ?'),
  conversation_stage: z.enum([
    'NEW_CONTACT',
    'DISCOVERY',
    'QUALIFICATION',
    'RECOMMENDATION',
    'OBJECTION_HANDLING',
    'CONVERSION',
    'CUSTOMER',
  ]).catch('QUALIFICATION'),
  intent: z.enum(['Decouverte', 'Information', 'Reservation', 'SAV', 'Autre']).catch('Information'),
  customer_type: z.enum([
    'Particulier',
    'Couple',
    'Famille',
    'Groupe',
    'Entreprise',
    'Ecole',
    'ONG',
    'Administration',
    'Inconnu',
  ]).catch('Particulier'),
  need: z.string().nullable().optional(),
  participants_count: z.preprocess((val) => {
    if (typeof val === 'string') {
      const num = parseInt(val.replace(/\D/g, ''), 10);
      return isNaN(num) ? null : num;
    }
    return val;
  }, z.number().int().nullable().optional()),
  preferred_date: z.string().nullable().optional(),
  budget: z.preprocess((val) => {
    if (typeof val === 'number') return `${val.toLocaleString('fr-FR')} FCFA`;
    return val;
  }, z.string().nullable().optional()),
  recommended_offer: z.string().nullable().optional(),
  product_identified: z.boolean().default(false),
  purchase_intent: z.enum(['information', 'interesse', 'demande_prix', 'veut_reserver']).catch('information'),
  availability_confirmed: z.boolean().default(false),
  product_standard: z.boolean().default(false),
  custom_request: z.boolean().default(false),
  is_b2b: z.boolean().default(false),
  is_vip: z.boolean().default(false),
  interaction_level: z.enum(['repond_peu', 'dialogue_actif', 'fournit_toutes_infos']).catch('dialogue_actif'),
  objections: z.preprocess((val) => {
    if (typeof val === 'string') return [val];
    if (Array.isArray(val)) return val;
    return [];
  }, z.array(z.string()).default([])),
  email: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  send_catalog: z.boolean().default(false),
  catalog_type: z.string().nullable().optional(),
  catalog_id: z.string().nullable().optional(),
});

export type LeadQualificationOutput = z.infer<typeof LeadQualificationOutputSchema>;

