import { LeadQualificationOutput } from '../agent/schemas/lead-qualification.schema.js';

export interface ScoreResult {
  score: number;
  leadStatus: string;
  nextStep: string;
}

export function computeScore(item: LeadQualificationOutput): ScoreResult {
  let score = 0;

  const typeScores: Record<string, number> = {
    Entreprise: 20,
    ONG: 18,
    Ecole: 18,
    Groupe: 15,
    Couple: 10,
    Famille: 10,
    Particulier: 5,
  };
  score += typeScores[item.customer_type] ?? 0;

  const n = item.participants_count ?? 0;
  if (n >= 31) score += 20;
  else if (n >= 11) score += 15;
  else if (n >= 3) score += 10;
  else if (n >= 1) score += 5;

  if (item.preferred_date) {
    score += /\d{1,2}/.test(item.preferred_date) ? 15 : 10;
  }

  const intentScores: Record<string, number> = {
    information: 5,
    interesse: 10,
    demande_prix: 15,
    veut_reserver: 25,
  };
  score += intentScores[item.purchase_intent] ?? 0;

  const interactionScores: Record<string, number> = {
    repond_peu: 5,
    dialogue_actif: 10,
    fournit_toutes_infos: 20,
  };
  score += interactionScores[item.interaction_level] ?? 0;

  score = Math.min(score, 100);

  let leadStatus: string;
  if (score <= 30) leadStatus = 'Prospect froid';
  else if (score <= 60) leadStatus = 'Prospect tiede';
  else if (score <= 80) leadStatus = 'Prospect qualifie';
  else leadStatus = 'Opportunite chaude';

  let nextStep = 'Nurturing';
  if (item.is_b2b || item.is_vip || item.custom_request || score >= 80) {
    nextStep = 'Conseiller humain';
  } else if (item.purchase_intent === 'veut_reserver' && item.availability_confirmed && item.product_standard) {
    nextStep = 'Paiement';
  } else if (item.product_identified && score >= 61) {
    nextStep = 'Landing Page';
  } else if (score >= 31) {
    nextStep = 'Continuer qualification';
  }

  return { score, leadStatus, nextStep };
}
