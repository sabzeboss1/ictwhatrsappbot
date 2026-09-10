import { Client } from '@hubspot/api-client';
import { env } from '../../config/env.js';
import { prisma } from '../../plugins/prisma.js';

export class HubSpotService {
  private hubspotClient: Client | null = null;

  constructor() {
    if (env.HUBSPOT_ACCESS_TOKEN) {
      this.hubspotClient = new Client({ accessToken: env.HUBSPOT_ACCESS_TOKEN });
    }
  }

  public getLifecycleStage(conversationStage: string): string {
    switch (conversationStage) {
      case 'NEW_CONTACT':
      case 'DISCOVERY':
        return 'lead';
      case 'QUALIFICATION':
      case 'RECOMMENDATION':
        return 'marketingqualifiedlead';
      case 'OBJECTION_HANDLING':
      case 'CONVERSION':
        return 'salesqualifiedlead';
      case 'CUSTOMER':
        return 'customer';
      default:
        return 'lead';
    }
  }

  public async syncLeadToHubSpot(leadId: string): Promise<{ success: boolean; contactId?: string; dealId?: string; error?: string }> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error(`Lead non trouvé: ${leadId}`);
    }

    // Si aucun token HubSpot n'est configuré, simulation gracieuse
    if (!this.hubspotClient || !env.HUBSPOT_ACCESS_TOKEN) {
      console.log(`[HubSpotService] Simulation sync pour le lead ${lead.phone} (Score: ${lead.qualificationScore})`);
      const mockContactId = lead.hubspotContactId || `hs_contact_${Date.now()}`;
      let mockDealId = lead.hubspotDealId;

      if ((lead.qualificationScore >= 61 || lead.nextStep === 'Paiement' || lead.nextStep === 'Conseiller humain') && !mockDealId) {
        mockDealId = `hs_deal_${Date.now()}`;
      }

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          hubspotContactId: mockContactId,
          hubspotDealId: mockDealId,
          hubspotSyncStatus: 'synced',
          hubspotLastError: null,
        },
      });

      return { success: true, contactId: mockContactId, dealId: mockDealId || undefined };
    }

    try {
      // 1. Rechercher contact existant par téléphone
      const searchResponse = await this.hubspotClient.crm.contacts.searchApi.doSearch({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'phone',
                operator: 'EQ' as any,
                value: lead.phone,
              },
            ],
          },
        ],
        properties: ['phone', 'email', 'firstname', 'lastname'],
        limit: 1,
        after: undefined,
        sorts: ['id'],
      });

      const contactProperties: Record<string, string> = {
        phone: lead.phone,
        lifecyclestage: this.getLifecycleStage(lead.conversationStage),
        ict_qualification_score: String(lead.qualificationScore),
      };

      if (lead.firstName) contactProperties.firstname = lead.firstName;
      if (lead.lastName) contactProperties.lastname = lead.lastName;
      if (lead.email) contactProperties.email = lead.email;
      if (lead.company) contactProperties.company = lead.company;
      if (lead.customerType) contactProperties.ict_customer_type = lead.customerType;
      if (lead.leadStatus) contactProperties.ict_lead_status = lead.leadStatus;
      if (lead.campaign) contactProperties.ict_source_campaign = lead.campaign;
      if (lead.source) contactProperties.hs_lead_source = lead.source;

      let contactId = lead.hubspotContactId;

      if (searchResponse.results.length > 0) {
        contactId = searchResponse.results[0].id;
        await this.hubspotClient.crm.contacts.basicApi.update(contactId, {
          properties: contactProperties,
        });
        console.log(`[HubSpot] Contact ${contactId} mis à jour.`);
      } else {
        const createdContact = await this.hubspotClient.crm.contacts.basicApi.create({
          properties: contactProperties,
          associations: [],
        });
        contactId = createdContact.id;
        console.log(`[HubSpot] Nouveau contact ${contactId} créé.`);
      }

      // 2. Gestion de l'Objet Deal (si score >= 61 ou paiement/conseiller humain)
      let dealId = lead.hubspotDealId;
      const shouldCreateDeal = lead.qualificationScore >= 61 || lead.nextStep === 'Paiement' || lead.nextStep === 'Conseiller humain';

      if (shouldCreateDeal && !dealId && contactId) {
        const dealName = `Prospect ${lead.firstName || ''} ${lead.lastName || lead.phone} - ${lead.recommendedOffer || 'Tour ICT'}`.trim();
        const dealStage = lead.nextStep === 'Paiement' ? 'qualifiedtobuy' : 'appointmentscheduled';

        const createdDeal = await this.hubspotClient.crm.deals.basicApi.create({
          properties: {
            dealname: dealName,
            dealstage: dealStage,
            pipeline: env.HUBSPOT_PIPELINE_ID,
          },
          associations: [
            {
              to: { id: contactId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED' as any,
                  associationTypeId: 3, // Deal to Contact
                },
              ],
            },
          ],
        });
        dealId = createdDeal.id;
        console.log(`[HubSpot] Deal créé : ${dealId} associé au contact ${contactId}`);
      }

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          hubspotContactId: contactId,
          hubspotDealId: dealId,
          hubspotSyncStatus: 'synced',
          hubspotLastError: null,
        },
      });

      return { success: true, contactId, dealId: dealId || undefined };
    } catch (err: any) {
      const errorMsg = err.message || 'Erreur HubSpot inconnue';
      console.error(`[HubSpot] Échec de synchronisation pour le lead ${lead.id}:`, errorMsg);

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          hubspotSyncStatus: 'failed',
          hubspotLastError: errorMsg,
        },
      });

      return { success: false, error: errorMsg };
    }
  }
}

export const hubspotService = new HubSpotService();
