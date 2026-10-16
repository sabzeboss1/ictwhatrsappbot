import { Client } from '@hubspot/api-client';
import { env } from '../../config/env.js';
import { prisma } from '../../plugins/prisma.js';

export function isValidPhoneNumber(phone?: string | null): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  if (trimmed.includes('@lid') || trimmed.includes('@s.whatsapp.net')) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('000');
}

export function getEffectivePhoneNumber(lead: { realPhone?: string | null; phone?: string | null }): string | null {
  if (lead.realPhone && isValidPhoneNumber(lead.realPhone)) {
    return lead.realPhone;
  }
  if (lead.phone && isValidPhoneNumber(lead.phone)) {
    return lead.phone;
  }
  return null;
}

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

  /**
   * Synthèse textuelle claire de la qualification IA pour HubSpot (champ description & deals).
   * Répond précisément aux attentes de visibilité de l'équipe commerciale.
   */
  public buildAiSummaryText(lead: any): string {
    const lines: string[] = [
      "Données collectées par l'agent IA",
      `Type de client\n${lead.customerType || 'Particulier'}`,
      `Nombre de participants\n${lead.participantsCount ? `${lead.participantsCount} participants` : 'Non précisé'}`,
      `Date souhaitée\n${lead.preferredDate || 'Non précisée'}`,
      `Budget estimé\n${lead.budget || 'Non précisé'}`,
      `Besoin exprimé\n${lead.need || 'Non précisé'}`,
      `Offre recommandée\n${lead.recommendedOffer || 'Non précisée'}`,
      `Score de qualification\n${lead.qualificationScore}/100 (${lead.leadStatus || 'En cours'})`,
      `Étape suivante recommandée\n${lead.nextStep || 'Qualification'}`,
    ];

    if (lead.intent) {
      lines.push(`Intention détectée\n${lead.intent}`);
    }

    if (lead.phone && lead.phone.includes('@lid')) {
      lines.push(`Statut numéro WhatsApp\nNuméro masqué par la confidentialité WhatsApp (ID: ${lead.phone})`);
    }

    if (lead.campaign) {
      lines.push(`Campagne source\n${lead.campaign}`);
    }

    return lines.join('\n\n');
  }

  /**
   * Synthèse HTML pour les Notes d'activité de HubSpot CRM.
   */
  public buildAiSummaryHtml(lead: any): string {
    return `
<h3>📋 Données collectées par l'agent IA</h3>
<ul>
  <li><strong>Type de client :</strong> ${lead.customerType || 'Particulier'}</li>
  <li><strong>Nombre de participants :</strong> ${lead.participantsCount ? `${lead.participantsCount} participants` : 'Non précisé'}</li>
  <li><strong>Date souhaitée :</strong> ${lead.preferredDate || 'Non précisée'}</li>
  <li><strong>Budget estimé :</strong> ${lead.budget || 'Non précisé'}</li>
  <li><strong>Besoin exprimé :</strong> ${lead.need || 'Non précisé'}</li>
  <li><strong>Offre recommandée :</strong> ${lead.recommendedOffer || 'Non précisée'}</li>
  <li><strong>Score de qualification :</strong> ${lead.qualificationScore}/100 (<em>${lead.leadStatus || 'En cours'}</em>)</li>
  <li><strong>Étape suivante :</strong> ${lead.nextStep || 'Qualification'}</li>
  ${lead.intent ? `<li><strong>Intention :</strong> ${lead.intent}</li>` : ''}
  ${lead.phone && lead.phone.includes('@lid') ? `<li><strong>ID WhatsApp :</strong> <code>${lead.phone}</code> (Numéro masqué par WhatsApp)</li>` : ''}
  ${lead.campaign ? `<li><strong>Campagne source :</strong> ${lead.campaign}</li>` : ''}
</ul>
<p><em>Synchronisé automatiquement par l'Agent IA Inside Cameroon Tourism</em></p>
    `.trim();
  }

  /**
   * Crée ou ajoute une Note d'engagement sur la fiche Contact HubSpot
   */
  public async createHubSpotNote(contactId: string, lead: any): Promise<void> {
    if (!this.hubspotClient) return;

    try {
      await this.hubspotClient.apiRequest({
        method: 'POST',
        path: '/crm/v3/objects/notes',
        body: {
          properties: {
            hs_timestamp: new Date().toISOString(),
            hs_note_body: this.buildAiSummaryHtml(lead),
          },
          associations: [
            {
              to: { id: contactId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: 202, // Note to Contact
                },
              ],
            },
          ],
        },
      });
      console.log(`[HubSpot] Note d'activité IA créée pour le contact ${contactId}`);
    } catch (noteErr: any) {
      console.warn(`[HubSpot] Note non créée (le champ description reste à jour): ${noteErr?.message || noteErr}`);
    }
  }

  public async syncLeadToHubSpot(leadId: string): Promise<{ success: boolean; contactId?: string; dealId?: string; error?: string }> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error(`Lead non trouvé: ${leadId}`);
    }

    // Seuil minimum de qualification pour synchroniser vers HubSpot.
    // Les contacts avec un score < 30 ne sont PAS envoyés à HubSpot (sauf s'ils y sont déjà).
    // Cela évite d'encombrer le CRM avec des contacts non qualifiés (ex: juste "bonjour").
    const HUBSPOT_MIN_SCORE = 30;
    const alreadySynced = Boolean(lead.hubspotContactId);
    if (lead.qualificationScore < HUBSPOT_MIN_SCORE && !alreadySynced) {
      console.log(`[HubSpot] Lead ${lead.id} ignoré (score ${lead.qualificationScore} < ${HUBSPOT_MIN_SCORE}, pas encore dans HubSpot)`);
      return { success: true }; // Pas d'erreur, juste pas encore qualifié
    }

    const effectivePhone = getEffectivePhoneNumber(lead);
    const aiSummary = this.buildAiSummaryText(lead);

    // Si aucun token HubSpot n'est configuré, simulation gracieuse
    if (!this.hubspotClient || !env.HUBSPOT_ACCESS_TOKEN) {
      console.log(`[HubSpotService] Simulation sync pour le lead ${effectivePhone || lead.phone} (Score: ${lead.qualificationScore})`);
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
      // 1. Rechercher contact existant par téléphone réel OU email
      const filterGroups: any[] = [];
      if (effectivePhone) {
        filterGroups.push({
          filters: [
            {
              propertyName: 'phone',
              operator: 'EQ' as any,
              value: effectivePhone,
            },
          ],
        });
      }
      if (lead.email) {
        filterGroups.push({
          filters: [
            {
              propertyName: 'email',
              operator: 'EQ' as any,
              value: lead.email,
            },
          ],
        });
      }

      let searchResponse = { results: [] as any[] };
      if (filterGroups.length > 0) {
        searchResponse = await this.hubspotClient.crm.contacts.searchApi.doSearch({
          filterGroups,
          properties: ['phone', 'email', 'firstname', 'lastname'],
          limit: 1,
          after: undefined,
          sorts: ['id'],
        });
      }

      // Propriétés standard HubSpot (toujours acceptées par HubSpot)
      const standardProperties: Record<string, string> = {
        lifecyclestage: this.getLifecycleStage(lead.conversationStage),
        description: aiSummary,
        message: aiSummary,
      };

      // Règle stricte anti faux numéro @lid :
      // Si un vrai numéro existe, on l'envoie.
      // Si c'est un @lid (ou null), on NE met PAS le @lid dans le champ phone.
      // Si le contact avait un faux numéro @lid précédemment enregistré, envoyer une chaîne vide le nettoie.
      if (effectivePhone) {
        standardProperties.phone = effectivePhone;
      } else if (lead.phone && lead.phone.includes('@lid')) {
        standardProperties.phone = '';
      }

      if (lead.firstName) standardProperties.firstname = lead.firstName;
      if (lead.lastName) standardProperties.lastname = lead.lastName;
      if (lead.email) standardProperties.email = lead.email;
      if (lead.company) standardProperties.company = lead.company;
      if (lead.leadStatus) standardProperties.hs_lead_status = lead.leadStatus;

      // Propriétés personnalisées optionnelles (si créées dans le portail HubSpot)
      const contactProperties: Record<string, string> = {
        ...standardProperties,
        ict_qualification_score: String(lead.qualificationScore),
      };

      if (lead.customerType) contactProperties.ict_customer_type = lead.customerType;
      if (lead.leadStatus) contactProperties.ict_lead_status = lead.leadStatus;
      if (lead.campaign) contactProperties.ict_source_campaign = lead.campaign;
      if (lead.source) contactProperties.hs_lead_source = lead.source;
      if (lead.preferredDate) contactProperties.ict_preferred_date = lead.preferredDate;
      if (lead.budget) contactProperties.ict_budget = lead.budget;
      if (lead.recommendedOffer) contactProperties.ict_recommended_offer = lead.recommendedOffer;
      if (lead.need) contactProperties.ict_need = lead.need;

      let contactId = lead.hubspotContactId;
      let targetContactId = contactId || (searchResponse.results.length > 0 ? searchResponse.results[0].id : null);

      const persistContact = async (props: Record<string, string>) => {
        if (targetContactId) {
          await this.hubspotClient!.crm.contacts.basicApi.update(targetContactId, {
            properties: props,
          });
          return targetContactId;
        } else {
          try {
            const createdContact = await this.hubspotClient!.crm.contacts.basicApi.create({
              properties: props,
              associations: [],
            });
            targetContactId = createdContact.id;
            return createdContact.id;
          } catch (createErr: any) {
            // Gestion du conflit 409 : si le contact existe déjà (par email/doublon), récupérer l'ID existant et mettre à jour
            const conflictMatch =
              createErr?.body?.message?.match(/Existing ID:\s*(\d+)/i) ||
              createErr?.message?.match(/Existing ID:\s*(\d+)/i);

            if (conflictMatch && conflictMatch[1]) {
              targetContactId = conflictMatch[1];
              console.log(`[HubSpot] Contact existant détecté via conflit 409 (ID: ${targetContactId}). Mise à jour en cours...`);
              await this.hubspotClient!.crm.contacts.basicApi.update(targetContactId, {
                properties: props,
              });
              return targetContactId;
            }
            throw createErr;
          }
        }
      };

      try {
        contactId = await persistContact(contactProperties);
        console.log(`[HubSpot] Contact ${contactId} synchronisé avec propriétés complètes.`);
      } catch (propErr: any) {
        const isMissingProperty =
          propErr?.message?.includes('does not exist') ||
          propErr?.body?.message?.includes('does not exist') ||
          propErr?.body?.category === 'VALIDATION_ERROR';

        if (isMissingProperty) {
          console.warn('[HubSpot] Propriétés custom (ict_*) non trouvées dans HubSpot, synchronisation avec les propriétés standards...');
          contactId = await persistContact(standardProperties);
          console.log(`[HubSpot] Contact ${contactId} synchronisé (propriétés standards avec suivi IA complet).`);
        } else {
          throw propErr;
        }
      }

      // Création de la Note d'activité timeline
      if (contactId) {
        await this.createHubSpotNote(contactId, lead);
      }

      // 2. Gestion de l'Objet Deal (si score >= 61 ou paiement/conseiller humain)
      let dealId = lead.hubspotDealId;
      const shouldCreateDeal = lead.qualificationScore >= 61 || lead.nextStep === 'Paiement' || lead.nextStep === 'Conseiller humain';

      if (shouldCreateDeal && !dealId && contactId) {
        const contactLabel = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || effectivePhone || 'Prospect';
        const dealName = `Prospect ${contactLabel} - ${lead.recommendedOffer || 'Tour ICT'}`.trim();
        const dealStage = lead.nextStep === 'Paiement' ? 'qualifiedtobuy' : 'appointmentscheduled';

        const dealProperties: Record<string, string> = {
          dealname: dealName,
          dealstage: dealStage,
          pipeline: env.HUBSPOT_PIPELINE_ID,
          description: aiSummary,
        };

        if (lead.budget) {
          const numericAmount = lead.budget.replace(/[^\d]/g, '');
          if (numericAmount && Number(numericAmount) > 0) {
            dealProperties.amount = numericAmount;
          }
        }

        const createdDeal = await this.hubspotClient.crm.deals.basicApi.create({
          properties: dealProperties,
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

      return { success: true, contactId: contactId || undefined, dealId: dealId || undefined };
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
