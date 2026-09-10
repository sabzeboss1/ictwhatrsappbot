import { describe, it, expect } from 'vitest';
import { computeScore } from '../src/modules/scoring/scoring.service.js';
describe('Scoring and Routing Engine (n8n Port)', () => {
    it('Cas 1: Particulier froid - information simple', () => {
        const input = {
            whatsapp_message: 'Bonjour !',
            conversation_stage: 'DISCOVERY',
            intent: 'Information',
            customer_type: 'Particulier', // 5
            participants_count: 1, // 5
            preferred_date: null,
            purchase_intent: 'information', // 5
            interaction_level: 'repond_peu', // 5
            product_identified: false,
            availability_confirmed: false,
            product_standard: false,
            custom_request: false,
            is_b2b: false,
            is_vip: false,
            objections: [],
        };
        // Score = 5 + 5 + 0 + 5 + 5 = 20
        const result = computeScore(input);
        expect(result.score).toBe(20);
        expect(result.leadStatus).toBe('Prospect froid');
        expect(result.nextStep).toBe('Nurturing');
    });
    it('Cas 2: Famille tiede avec date sans chiffres', () => {
        const input = {
            whatsapp_message: 'Pour les vacances scolaires',
            conversation_stage: 'QUALIFICATION',
            intent: 'Information',
            customer_type: 'Famille', // 10
            participants_count: 4, // 10
            preferred_date: 'vacances de paques', // 10 (sans chiffres)
            purchase_intent: 'interesse', // 10
            interaction_level: 'dialogue_actif', // 10
            product_identified: false,
            availability_confirmed: false,
            product_standard: false,
            custom_request: false,
            is_b2b: false,
            is_vip: false,
            objections: [],
        };
        // Score = 10 + 10 + 10 + 10 + 10 = 50
        const result = computeScore(input);
        expect(result.score).toBe(50);
        expect(result.leadStatus).toBe('Prospect tiede');
        expect(result.nextStep).toBe('Continuer qualification');
    });
    it('Cas 3: Couple qualifie avec date precise et demande de prix', () => {
        const input = {
            whatsapp_message: 'Quel est le prix pour le 15 decembre ?',
            conversation_stage: 'RECOMMENDATION',
            intent: 'Reservation',
            customer_type: 'Couple', // 10
            participants_count: 2, // 5
            preferred_date: '15 decembre 2026', // 15 (contient chiffres)
            purchase_intent: 'demande_prix', // 15
            interaction_level: 'fournit_toutes_infos', // 20
            product_identified: true,
            availability_confirmed: false,
            product_standard: false,
            custom_request: false,
            is_b2b: false,
            is_vip: false,
            objections: [],
        };
        // Score = 10 + 5 + 15 + 15 + 20 = 65
        const result = computeScore(input);
        expect(result.score).toBe(65);
        expect(result.leadStatus).toBe('Prospect qualifie');
        expect(result.nextStep).toBe('Landing Page');
    });
    it('Cas 4: Entreprise B2B - Route vers Conseiller humain directement', () => {
        const input = {
            whatsapp_message: 'Team building pour MTN',
            conversation_stage: 'QUALIFICATION',
            intent: 'Reservation',
            customer_type: 'Entreprise', // 20
            participants_count: 15, // 15
            preferred_date: '20 octobre', // 15
            purchase_intent: 'demande_prix', // 15
            interaction_level: 'dialogue_actif', // 10
            product_identified: false,
            availability_confirmed: false,
            product_standard: false,
            custom_request: false,
            is_b2b: true,
            is_vip: false,
            objections: [],
        };
        // Score = 20 + 15 + 15 + 15 + 10 = 75
        const result = computeScore(input);
        expect(result.score).toBe(75);
        expect(result.leadStatus).toBe('Prospect qualifie');
        expect(result.nextStep).toBe('Conseiller humain');
    });
    it('Cas 5: Client VIP - Route vers Conseiller humain', () => {
        const input = {
            whatsapp_message: 'Sejour exclusif VIP',
            conversation_stage: 'QUALIFICATION',
            intent: 'Reservation',
            customer_type: 'Particulier', // 5
            participants_count: 2, // 5
            preferred_date: null,
            purchase_intent: 'interesse', // 10
            interaction_level: 'dialogue_actif', // 10
            product_identified: false,
            availability_confirmed: false,
            product_standard: false,
            custom_request: false,
            is_b2b: false,
            is_vip: true,
            objections: [],
        };
        // Score = 5 + 5 + 0 + 10 + 10 = 30
        const result = computeScore(input);
        expect(result.score).toBe(30);
        expect(result.leadStatus).toBe('Prospect froid');
        expect(result.nextStep).toBe('Conseiller humain'); // VIP flag triggers human
    });
    it('Cas 6: Demande sur-mesure (custom_request) - Route vers Conseiller humain', () => {
        const input = {
            whatsapp_message: 'Circuit personnalise 3 semaines',
            conversation_stage: 'DISCOVERY',
            intent: 'Reservation',
            customer_type: 'Groupe', // 15
            participants_count: 5, // 10
            preferred_date: 'aout', // 10
            purchase_intent: 'demande_prix', // 15
            interaction_level: 'dialogue_actif', // 10
            product_identified: false,
            availability_confirmed: false,
            product_standard: false,
            custom_request: true,
            is_b2b: false,
            is_vip: false,
            objections: [],
        };
        // Score = 15 + 10 + 10 + 15 + 10 = 60
        const result = computeScore(input);
        expect(result.score).toBe(60);
        expect(result.nextStep).toBe('Conseiller humain');
    });
    it('Cas 7: Produit standard confirme avec volonte de reserver - Route vers Paiement', () => {
        const input = {
            whatsapp_message: 'Je veux payer maintenant pour le tour Kribi',
            conversation_stage: 'CONVERSION',
            intent: 'Reservation',
            customer_type: 'Couple', // 10
            participants_count: 2, // 5
            preferred_date: '12 novembre', // 15
            purchase_intent: 'veut_reserver', // 25
            interaction_level: 'fournit_toutes_infos', // 20
            product_identified: true,
            availability_confirmed: true,
            product_standard: true,
            custom_request: false,
            is_b2b: false,
            is_vip: false,
            objections: [],
        };
        // Score = 10 + 5 + 15 + 25 + 20 = 75
        const result = computeScore(input);
        expect(result.score).toBe(75);
        expect(result.leadStatus).toBe('Prospect qualifie');
        expect(result.nextStep).toBe('Paiement');
    });
    it('Cas 8: Grand groupe (> 30 participants) et score >= 80 - Opportunite chaude', () => {
        const input = {
            whatsapp_message: 'Excursion pour 45 eleves',
            conversation_stage: 'RECOMMENDATION',
            intent: 'Reservation',
            customer_type: 'Ecole', // 18
            participants_count: 45, // 20 (>= 31)
            preferred_date: '14 decembre 2026', // 15
            purchase_intent: 'veut_reserver', // 25
            interaction_level: 'fournit_toutes_infos', // 20
            product_identified: true,
            availability_confirmed: false,
            product_standard: true,
            custom_request: false,
            is_b2b: false,
            is_vip: false,
            objections: [],
        };
        // Score = 18 + 20 + 15 + 25 + 20 = 98 (cap 100)
        const result = computeScore(input);
        expect(result.score).toBe(98);
        expect(result.leadStatus).toBe('Opportunite chaude');
        expect(result.nextStep).toBe('Conseiller humain'); // Score >= 80
    });
    it('Cas 9: Plafonnement strict du score a 100 max', () => {
        const input = {
            whatsapp_message: 'Projet ONG 50 participants tout confirme',
            conversation_stage: 'CONVERSION',
            intent: 'Reservation',
            customer_type: 'ONG', // 18
            participants_count: 50, // 20
            preferred_date: '05 mars 2027', // 15
            purchase_intent: 'veut_reserver', // 25
            interaction_level: 'fournit_toutes_infos', // 20
            product_identified: true,
            availability_confirmed: true,
            product_standard: true,
            custom_request: false,
            is_b2b: true, // 20
            is_vip: true,
            objections: [],
        };
        // Somme brute = 18 + 20 + 15 + 25 + 20 = 98 (ou 100+)
        const result = computeScore(input);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.leadStatus).toBe('Opportunite chaude');
    });
    it('Cas 10: Score de 31 a 60 sans critere special - Continuer qualification', () => {
        const input = {
            whatsapp_message: 'Je me renseigne pour un groupe d amis',
            conversation_stage: 'DISCOVERY',
            intent: 'Information',
            customer_type: 'Groupe', // 15
            participants_count: 4, // 10
            preferred_date: null,
            purchase_intent: 'demande_prix', // 15
            interaction_level: 'repond_peu', // 5
            product_identified: false,
            availability_confirmed: false,
            product_standard: false,
            custom_request: false,
            is_b2b: false,
            is_vip: false,
            objections: [],
        };
        // Score = 15 + 10 + 0 + 15 + 5 = 45
        const result = computeScore(input);
        expect(result.score).toBe(45);
        expect(result.leadStatus).toBe('Prospect tiede');
        expect(result.nextStep).toBe('Continuer qualification');
    });
});
