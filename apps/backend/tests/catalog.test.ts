import { describe, it, expect } from 'vitest';
import { catalogService } from '../src/modules/catalog/catalog.service.js';
import { LeadQualificationOutputSchema } from '../src/modules/agent/schemas/lead-qualification.schema.js';
import { agentService } from '../src/modules/agent/agent.service.js';

describe('CatalogService & PDF Generation', () => {
  it('should initialize and list all available catalogues', () => {
    catalogService.ensureDefaultCatalogsExist();
    const list = catalogService.listCatalogs();
    expect(list.length).toBeGreaterThanOrEqual(4);

    const general = list.find((c) => c.category === 'general');
    expect(general).toBeDefined();
    expect(general?.fileName).toBe('Catalogue_ICT_Tourisme_2026.pdf');
    expect(general?.fileSize).toBeGreaterThan(500);
  });

  it('should retrieve catalog by category or id', () => {
    const kribi = catalogService.getCatalog('kribi');
    expect(kribi.category).toBe('kribi');
    expect(kribi.fileName).toBe('Brochure_Kribi_Lobe_2026.pdf');

    const defaultCat = catalogService.getCatalog('unknown-id');
    expect(defaultCat.id).toBe('ict-general-2026');
  });

  it('should generate valid base64 data URI for WhatsApp document sending', () => {
    const { base64DataUri, item } = catalogService.getCatalogBase64('general');
    expect(base64DataUri).toMatch(/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/);
    expect(item.fileName).toBe('Catalogue_ICT_Tourisme_2026.pdf');
  });

  it('should accept uploaded catalogue with pdfBase64 and data URI prefix', async () => {
    // Faux PDF minimal valide contenant les magic bytes %PDF-1.4
    const fakePdfContent = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF';
    const fakeBase64 = `data:application/pdf;base64,${Buffer.from(fakePdfContent).toString('base64')}`;

    const uploaded = await catalogService.addUploadedCatalog({
      title: 'Brochure Test Randonnée 2026',
      fileName: 'Brochure_Test_Rando.pdf',
      pdfBase64: fakeBase64,
      category: 'randonnee',
      campaignSlug: 'campagne-rando-2026',
      triggerCondition: 'Proposer si le client aime marcher en montagne',
    });

    expect(uploaded).toBeDefined();
    expect(uploaded.id).toMatch(/^cat_/);
    expect(uploaded.title).toBe('Brochure Test Randonnée 2026');
    expect(uploaded.campaignSlug).toBe('campagne-rando-2026');
    expect(uploaded.publicUrl).toContain('/api/catalogues/download/');

    // Nettoyage après test
    catalogService.deleteCatalog(uploaded.id);
  });
});

describe('Lead Qualification with Catalog Detection', () => {
  it('should validate schema with send_catalog true', () => {
    const parsed = LeadQualificationOutputSchema.parse({
      whatsapp_message: 'Voici notre catalogue officiel ci-dessous !',
      conversation_stage: 'RECOMMENDATION',
      intent: 'Information',
      send_catalog: true,
      catalog_type: 'kribi',
    });

    expect(parsed.send_catalog).toBe(true);
    expect(parsed.catalog_type).toBe('kribi');
  });

  it('should detect catalogue request in mockQualifyMessage', () => {
    const result = agentService.mockQualifyMessage(
      'Bonjour, pouvez-vous m\'envoyer votre catalogue complet au format PDF s\'il vous plaît ?',
      []
    );

    expect(result.send_catalog).toBe(true);
    expect(result.whatsapp_message.toLowerCase()).toContain('catalogue officiel');
  });

  it('should detect agreement when previous assistant message offered catalogue', () => {
    const history = [
      {
        role: 'assistant' as const,
        content: 'Souhaitez-vous recevoir notre brochure détaillée et les disponibilités pour finaliser votre réservation ?',
      },
    ];

    const result = agentService.mockQualifyMessage(
      'Oui avec grand plaisir, envoyez-moi ça !',
      history,
      { recommendedOffer: 'Escapade Balnéaire Kribi & Chutes de la Lobé' }
    );

    expect(result.send_catalog).toBe(true);
    expect(result.catalog_type).toBe('kribi');
    expect(result.whatsapp_message).toContain('PDF');
  });
});
