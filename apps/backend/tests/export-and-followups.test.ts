import { describe, it, expect } from 'vitest';
import { buildCsv, buildXlsx, leadToExportRow } from '../src/modules/leads/leads.export.js';
import {
  renderTemplate,
  isWithinSendingHours,
  pickTemplate,
  followUpsService,
} from '../src/modules/followups/followups.service.js';
import { DEFAULT_FOLLOWUP_SETTINGS } from '../src/modules/followups/followup.settings.js';
import { whatsAppService } from '../src/modules/whatsapp/whatsapp.service.js';

describe('Lead Export (CSV & Excel .xlsx)', () => {
  const sampleLeads = [
    {
      id: 'lead-1',
      firstName: 'Jean',
      lastName: 'Mbarga',
      phone: '+237699112233',
      realPhone: '+237699112233',
      email: 'jean@example.com',
      company: 'Total Cameroun',
      customerType: 'Entreprise',
      isB2B: true,
      isVip: false,
      recommendedOffer: 'Escapade Balnéaire Kribi & Chutes de la Lobé',
      quotedPrice: '75 000 FCFA / pers',
      estimatedAmount: 750000,
      participantsCount: 10,
      preferredDate: '15-17 décembre',
      budget: '800 000 FCFA',
      need: 'Team building fin d’année',
      purchaseIntent: 'veut_reserver',
      conversationStage: 'CONVERSION',
      qualificationScore: 90,
      leadStatus: 'Opportunite chaude',
      nextStep: 'Conseiller humain',
      objections: ['delai_validation'],
      closingNotes: 'Appeler mardi matin',
      hubspotSyncStatus: 'synced',
      createdAt: new Date('2026-11-10T10:00:00Z'),
    },
  ];

  it('maps lead fields including offer, price, participants and date', () => {
    const row = leadToExportRow(sampleLeads[0]);
    expect(row.recommendedOffer).toContain('Kribi');
    expect(row.quotedPrice).toBe('75 000 FCFA / pers');
    expect(row.participantsCount).toBe(10);
    expect(row.preferredDate).toBe('15-17 décembre');
    expect(row.isB2B).toBe('Oui');
  });

  it('builds a UTF-8 BOM semicolon CSV for French Excel', () => {
    const buf = buildCsv(sampleLeads);
    const text = buf.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('Offre sélectionnée;Prix communiqué;Montant estimé (FCFA);Participants;Date souhaitée');
    expect(text).toContain('Escapade Balnéaire Kribi & Chutes de la Lobé;75 000 FCFA / pers;750000;10;15-17 décembre');
  });

  it('builds a valid .xlsx workbook buffer (PK zip header)', async () => {
    const buf = await buildXlsx(sampleLeads, { generatedBy: 'Admin', filters: 'Test' });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});

describe('Follow-Up & Anti-Ban Safeguards', () => {
  it('renders templates cleanly even when firstName is missing or generic "Prospect"', () => {
    const msg = renderTemplate('Bonjour {prenom}, intéressé par {offre} ?', {
      firstName: 'Prospect',
      recommendedOffer: 'Kribi',
    });
    expect(msg).toBe('Bonjour, intéressé par Kribi ?');
  });

  it('picks a fallback template when lead lacks specific variables', () => {
    const templates = [
      'Dispo le {date} pour {participants} personnes ?',
      'Bonjour {prenom}, comment avancer sur votre projet ?',
    ];
    const picked = pickTemplate(templates, { firstName: 'Alice', preferredDate: null, participantsCount: null });
    expect(picked).toContain('comment avancer');
  });

  it('enforces quiet hours (no night messages)', () => {
    const settings = { quietStartHour: 20, quietEndHour: 8, timezone: 'UTC' };
    expect(isWithinSendingHours(new Date('2026-11-13T10:00:00Z'), settings)).toBe(true);
    expect(isWithinSendingHours(new Date('2026-11-13T22:00:00Z'), settings)).toBe(false);
    expect(isWithinSendingHours(new Date('2026-11-13T05:00:00Z'), settings)).toBe(false);
  });

  it('detects STOP / START opt-out commands without false positives on normal sentences', () => {
    expect(whatsAppService.detectOptCommand('STOP')).toBe('stop');
    expect(whatsAppService.detectOptCommand('stop !')).toBe('stop');
    expect(whatsAppService.detectOptCommand('Se désabonner')).toBe('stop');
    expect(whatsAppService.detectOptCommand('START')).toBe('start');
    expect(whatsAppService.detectOptCommand('Je veux faire un stop à Kribi')).toBeNull();
  });

  it('never schedules auto follow-up for cold leads, opted-out leads, or leads without inbound messages', () => {
    const enabled = { ...DEFAULT_FOLLOWUP_SETTINGS, autoEnabled: true };
    const now = Date.now();
    const validLead = {
      optOut: false,
      followUpPaused: false,
      aiDisabled: false,
      conversationStage: 'QUALIFICATION',
      qualificationScore: 65,
      followUpCount: 0,
      lastInboundAt: new Date(now - 30 * 3600 * 1000),
      lastOutboundAt: new Date(now - 25 * 3600 * 1000),
    };
    expect(followUpsService.computeNextAutoFollowUp(validLead, enabled)).not.toBeNull();
    expect(followUpsService.computeNextAutoFollowUp({ ...validLead, optOut: true }, enabled)).toBeNull();
    expect(followUpsService.computeNextAutoFollowUp({ ...validLead, qualificationScore: 10 }, enabled)).toBeNull();
    expect(followUpsService.computeNextAutoFollowUp({ ...validLead, lastInboundAt: null }, enabled)).toBeNull();
  });
});
