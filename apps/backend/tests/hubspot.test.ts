import { describe, it, expect } from 'vitest';
import {
  HubSpotService,
  extractRejectedProperties,
  isValidPhoneNumber,
  getEffectivePhoneNumber,
} from '../src/modules/hubspot/hubspot.service.js';

describe('HubSpot Service & Data Normalization', () => {
  const service = new HubSpotService();

  describe('mapToHubSpotLeadStatus', () => {
    it('should map internal French lead statuses to standard HubSpot options', () => {
      // Les options autorisées par HubSpot sont:
      // [NEW, OPEN, IN_PROGRESS, OPEN_DEAL, UNQUALIFIED, ATTEMPTED_TO_CONTACT, CONNECTED, BAD_TIMING]

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
