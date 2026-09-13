import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CatalogItem {
  id: string;
  title: string;
  fileName: string;
  category: string;
  description: string;
  triggerCondition: string; // Règle en français expliquant à l'IA quand proposer ce document
  caption: string;          // Message WhatsApp accompagnant l'envoi du document
  filePath: string;
  fileSize?: number;
  publicUrl: string;
  isDefault?: boolean;
  isCustom?: boolean;
  campaign?: string | null; // Slug de la campagne ou du prompt associé (optionnel)
  createdAt?: string;
  updatedAt?: string;
}

export class CatalogService {
  private cataloguesDir: string;
  private registryFile: string;
  private catalogues: Map<string, CatalogItem> = new Map();

  constructor() {
    // Répertoire de stockage public persistant des catalogues PDF
    this.cataloguesDir = path.resolve(__dirname, '../../../public/catalogues');
    this.registryFile = path.join(this.cataloguesDir, 'catalogs-registry.json');
    this.initCatalogRegistry();
  }

  public getCataloguesDir(): string {
    return this.cataloguesDir;
  }

  /**
   * Initialise le registre en mémoire.
   * Charge depuis catalogs-registry.json si présent, sinon crée les catalogues par défaut.
   */
  private initCatalogRegistry() {
    if (!fs.existsSync(this.cataloguesDir)) {
      fs.mkdirSync(this.cataloguesDir, { recursive: true });
    }

    if (fs.existsSync(this.registryFile)) {
      try {
        const raw = fs.readFileSync(this.registryFile, 'utf-8');
        const items: CatalogItem[] = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          this.catalogues.clear();
          for (const item of items) {
            item.filePath = path.join(this.cataloguesDir, item.fileName);
            item.publicUrl = `/api/catalogues/download/${item.fileName}`;
            this.catalogues.set(item.id, item);
          }
          return;
        }
      } catch (err: any) {
        console.warn('[CatalogService] Erreur lecture registre existant, réinitialisation des valeurs par défaut:', err.message);
      }
    }

    // Catalogues par défaut pré-configurés
    const generalCatalog: CatalogItem = {
      id: 'ict-general-2026',
      title: 'Catalogue Officiel — Inside Cameroon Tourism 2026',
      fileName: 'Catalogue_ICT_Tourisme_2026.pdf',
      category: 'general',
      description: 'Catalogue complet des séjours, excursions et circuits touristiques au Cameroun.',
      triggerCondition: 'Proposer si le client souhaite découvrir toutes les offres, compare plusieurs circuits ou n\'a pas encore de destination précise.',
      caption: '📄 *Catalogue Officiel Inside Cameroon Tourism 2026*\n\nVoici notre sélection d\'expériences touristiques au Cameroun (Kribi, Ebogo, Mont Cameroun, Team Building) avec l\'ensemble des formules et tarifs. Bonne lecture ! ✨🇨🇲',
      filePath: path.join(this.cataloguesDir, 'Catalogue_ICT_Tourisme_2026.pdf'),
      publicUrl: '/api/catalogues/download/Catalogue_ICT_Tourisme_2026.pdf',
      isDefault: true,
      isCustom: false,
      campaign: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const kribiBrochure: CatalogItem = {
      id: 'brochure-kribi',
      title: 'Brochure Balnéaire — Escapade Kribi & Chutes de la Lobé',
      fileName: 'Brochure_Kribi_Lobe_2026.pdf',
      category: 'kribi',
      description: 'Programme détaillé du séjour balnéaire à Kribi avec visite des Chutes de la Lobé.',
      triggerCondition: 'Proposer dès que le prospect parle de Kribi, de plage, de détente en bord de mer, ou demande les prix et options pour Kribi.',
      caption: '🌊 *Brochure Escapade Kribi & Chutes de la Lobé*\n\nDécouvrez le programme complet de notre formule week-end et séjour à Kribi (hébergements, visites, pirogue et tarifs). 🏖️',
      filePath: path.join(this.cataloguesDir, 'Brochure_Kribi_Lobe_2026.pdf'),
      publicUrl: '/api/catalogues/download/Brochure_Kribi_Lobe_2026.pdf',
      isDefault: false,
      isCustom: false,
      campaign: 'campagne-facebook-kribi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ebogoBrochure: CatalogItem = {
      id: 'brochure-ebogo',
      title: 'Brochure Écotourisme — Pirogue & Forêt d\'Ebogo',
      fileName: 'Brochure_Ebogo_Ecotourisme_2026.pdf',
      category: 'ebogo',
      description: 'Excursion nature sur le fleuve Nyong et visite de l\'arbre tricentenaire à Ebogo.',
      triggerCondition: 'Proposer dès que le prospect recherche une escapade nature, une excursion pirogue, de l\'écotourisme ou une sortie proche de Yaoundé.',
      caption: '🛶 *Brochure Écotourisme Ebogo & Fleuve Nyong*\n\nVoici le programme de l\'excursion nature en pirogue à Ebogo avec menu terroir et activités incluses. 🌿',
      filePath: path.join(this.cataloguesDir, 'Brochure_Ebogo_Ecotourisme_2026.pdf'),
      publicUrl: '/api/catalogues/download/Brochure_Ebogo_Ecotourisme_2026.pdf',
      isDefault: false,
      isCustom: false,
      campaign: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const montCamerounBrochure: CatalogItem = {
      id: 'brochure-mont-cameroun',
      title: 'Brochure Randonnée — Ascension du Mont Cameroun',
      fileName: 'Brochure_Ascension_Mont_Cameroun_2026.pdf',
      category: 'mont_cameroun',
      description: 'Guide complet pour l\'ascension du Char des Dieux (Buea, 4100m).',
      triggerCondition: 'Proposer dès que le prospect parle de randonnée, trek, ascension, sommet ou aventure sportive au Mont Cameroun.',
      caption: '⛰️ *Brochure Ascension Mont Cameroun (4100m)*\n\nRetrouvez le circuit étape par étape, la liste du matériel recommandé, l\'encadrement des guides et les tarifs. 🥾',
      filePath: path.join(this.cataloguesDir, 'Brochure_Ascension_Mont_Cameroun_2026.pdf'),
      publicUrl: '/api/catalogues/download/Brochure_Ascension_Mont_Cameroun_2026.pdf',
      isDefault: false,
      isCustom: false,
      campaign: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.catalogues.set(generalCatalog.id, generalCatalog);
    this.catalogues.set(kribiBrochure.id, kribiBrochure);
    this.catalogues.set(ebogoBrochure.id, ebogoBrochure);
    this.catalogues.set(montCamerounBrochure.id, montCamerounBrochure);

    this.saveRegistry();
  }

  /**
   * Sauvegarde l'état actuel des catalogues dans le fichier JSON persistant
   */
  private saveRegistry(): void {
    try {
      if (!fs.existsSync(this.cataloguesDir)) {
        fs.mkdirSync(this.cataloguesDir, { recursive: true });
      }
      const list = Array.from(this.catalogues.values()).map((item) => ({
        ...item,
        // On évite d'enregistrer des chemins absolus variables
        filePath: undefined,
      }));
      fs.writeFileSync(this.registryFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[CatalogService] Erreur lors de la sauvegarde du registre:', err.message);
    }
  }

  /**
   * Assure la présence des répertoires et génère les fichiers PDF officiels par défaut s'ils n'existent pas encore.
   */
  public ensureDefaultCatalogsExist(): void {
    if (!fs.existsSync(this.cataloguesDir)) {
      fs.mkdirSync(this.cataloguesDir, { recursive: true });
    }

    for (const item of this.catalogues.values()) {
      if (!fs.existsSync(item.filePath) && !item.isCustom) {
        console.log(`[CatalogService] Génération du PDF officiel : ${item.fileName}...`);
        const pdfBuffer = this.generatePdfDocument(item);
        fs.writeFileSync(item.filePath, pdfBuffer);
        console.log(`✓ [CatalogService] PDF créé avec succès : ${item.fileName} (${pdfBuffer.length} octets)`);
      }

      try {
        if (fs.existsSync(item.filePath)) {
          const stats = fs.statSync(item.filePath);
          item.fileSize = stats.size;
        }
      } catch {
        // Ignorer
      }
    }

    this.saveRegistry();
  }

  /**
   * Liste l'ensemble des catalogues disponibles
   */
  public listCatalogs(): CatalogItem[] {
    const list: CatalogItem[] = [];
    for (const item of this.catalogues.values()) {
      let size = item.fileSize || 0;
      if (fs.existsSync(item.filePath)) {
        try {
          size = fs.statSync(item.filePath).size;
        } catch {
          // Ignorer
        }
      }
      list.push({ ...item, fileSize: size });
    }

    // Trier : catalogue par défaut en premier, puis date décroissante
    return list.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }

  /**
   * Récupère le catalogue principal par défaut
   */
  public getDefaultCatalog(): CatalogItem {
    for (const item of this.catalogues.values()) {
      if (item.isDefault) return item;
    }
    const first = this.catalogues.get('ict-general-2026') || this.catalogues.values().next().value;
    if (!first) {
      throw new Error('Aucun catalogue configuré dans le système');
    }
    return first;
  }

  /**
   * Récupère un catalogue par identifiant, nom ou catégorie
   */
  public getCatalog(idOrKey?: string | null): CatalogItem {
    if (!idOrKey) {
      return this.getDefaultCatalog();
    }

    // 1. Recherche par ID exact
    if (this.catalogues.has(idOrKey)) {
      return this.catalogues.get(idOrKey)!;
    }

    // 2. Recherche par nom de fichier
    for (const item of this.catalogues.values()) {
      if (item.fileName === idOrKey || item.fileName.toLowerCase() === idOrKey.toLowerCase()) {
        return item;
      }
    }

    // 3. Recherche par catégorie
    const lowerKey = idOrKey.toLowerCase();
    for (const item of this.catalogues.values()) {
      if (item.category.toLowerCase() === lowerKey || item.id.toLowerCase().includes(lowerKey)) {
        return item;
      }
    }

    return this.getDefaultCatalog();
  }

  /**
   * Importation d'un nouveau catalogue ou brochure PDF par l'administrateur
   */
  public async addUploadedCatalog(params: {
    title: string;
    fileName: string;
    fileBase64: string;
    description?: string;
    triggerCondition?: string;
    caption?: string;
    category?: string;
    campaign?: string | null;
    isDefault?: boolean;
  }): Promise<CatalogItem> {
    const { title, fileName, fileBase64, description, triggerCondition, caption, category, campaign, isDefault } = params;

    if (!title || !title.trim()) {
      throw new Error('Le titre du catalogue est obligatoire.');
    }
    if (!fileBase64) {
      throw new Error('Aucun fichier PDF fourni.');
    }

    // Extraction du contenu binaire
    const cleanBase64 = fileBase64.replace(/^data:application\/pdf;base64,/, '').replace(/\s/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length < 50) {
      throw new Error('Le fichier transmis est vide ou corrompu.');
    }

    // Validation du format PDF (magic bytes %PDF)
    const header = buffer.subarray(0, 10).toString('latin1');
    if (!header.includes('%PDF')) {
      throw new Error('Le fichier sélectionné n\'est pas un document PDF valide.');
    }

    // Nettoyage sécurisé du nom de fichier
    let safeName = (fileName || `${title}.pdf`)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');

    if (!safeName.toLowerCase().endsWith('.pdf')) {
      safeName += '.pdf';
    }

    // Préfixe unique si le nom existe déjà pour éviter d'écraser un autre catalogue
    let targetPath = path.join(this.cataloguesDir, safeName);
    if (fs.existsSync(targetPath)) {
      safeName = `${Date.now()}_${safeName}`;
      targetPath = path.join(this.cataloguesDir, safeName);
    }

    // Écriture physique sur le disque
    fs.writeFileSync(targetPath, buffer);

    // ID machine propre
    const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Si défini par défaut, désactiver les autres
    if (isDefault) {
      for (const item of this.catalogues.values()) {
        item.isDefault = false;
      }
    }

    const newItem: CatalogItem = {
      id,
      title: title.trim(),
      fileName: safeName,
      category: (category || 'general').toLowerCase().trim(),
      description: (description || `Catalogue touristique : ${title}`).trim(),
      triggerCondition: (triggerCondition || `Proposer ce catalogue quand le client demande "${title}" ou les tarifs associés.`).trim(),
      caption: (caption || `📄 *${title}*\n\nVoici notre catalogue officiel au format PDF. Bonne lecture ! ✨🇨🇲`).trim(),
      filePath: targetPath,
      fileSize: buffer.length,
      publicUrl: `/api/catalogues/download/${safeName}`,
      isDefault: Boolean(isDefault),
      isCustom: true,
      campaign: campaign || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.catalogues.set(id, newItem);
    this.saveRegistry();

    console.log(`✓ [CatalogService] Nouveau catalogue importé : "${newItem.title}" (${newItem.fileName})`);
    return newItem;
  }

  /**
   * Met à jour les métadonnées d'un catalogue (titre, consignes IA, légende...)
   */
  public updateCatalog(
    id: string,
    updates: {
      title?: string;
      description?: string;
      triggerCondition?: string;
      caption?: string;
      category?: string;
      campaign?: string | null;
      isDefault?: boolean;
    }
  ): CatalogItem {
    const item = this.catalogues.get(id);
    if (!item) {
      throw new Error(`Catalogue avec l'identifiant "${id}" introuvable.`);
    }

    if (updates.title) item.title = updates.title.trim();
    if (updates.description !== undefined) item.description = updates.description.trim();
    if (updates.triggerCondition !== undefined) item.triggerCondition = updates.triggerCondition.trim();
    if (updates.caption !== undefined) item.caption = updates.caption.trim();
    if (updates.category !== undefined) item.category = updates.category.toLowerCase().trim();
    if (updates.campaign !== undefined) item.campaign = updates.campaign || null;

    if (updates.isDefault) {
      for (const other of this.catalogues.values()) {
        other.isDefault = false;
      }
      item.isDefault = true;
    }

    item.updatedAt = new Date().toISOString();
    this.saveRegistry();
    return item;
  }

  /**
   * Définit un catalogue comme étant celui envoyé par défaut
   */
  public setDefaultCatalog(id: string): CatalogItem {
    return this.updateCatalog(id, { isDefault: true });
  }

  /**
   * Supprime un catalogue (fichier sur disque et entrée de registre)
   */
  public deleteCatalog(id: string): boolean {
    const item = this.catalogues.get(id);
    if (!item) {
      throw new Error(`Catalogue avec l'identifiant "${id}" introuvable.`);
    }

    if (this.catalogues.size <= 1) {
      throw new Error('Impossible de supprimer le dernier catalogue disponible.');
    }

    // Suppression physique du fichier
    try {
      if (fs.existsSync(item.filePath)) {
        fs.unlinkSync(item.filePath);
      }
    } catch (err: any) {
      console.warn(`[CatalogService] Avertissement suppression fichier ${item.filePath}:`, err.message);
    }

    const wasDefault = item.isDefault;
    this.catalogues.delete(id);

    // Si le catalogue supprimé était par défaut, assigner un autre
    if (wasDefault) {
      const fallback = this.catalogues.values().next().value;
      if (fallback) fallback.isDefault = true;
    }

    this.saveRegistry();
    console.log(`✓ [CatalogService] Catalogue supprimé : "${item.title}" (${id})`);
    return true;
  }

  /**
   * Obtient le buffer binaire d'un catalogue
   */
  public getCatalogBuffer(idOrKey?: string | null): { buffer: Buffer; item: CatalogItem } {
    const item = this.getCatalog(idOrKey);
    if (!fs.existsSync(item.filePath)) {
      this.ensureDefaultCatalogsExist();
    }
    const buffer = fs.readFileSync(item.filePath);
    return { buffer, item };
  }

  /**
   * Récupère la Data URI en base64 pour l'envoi via Evolution API
   */
  public getCatalogBase64(idOrKey?: string | null): { base64DataUri: string; item: CatalogItem } {
    const { buffer, item } = this.getCatalogBuffer(idOrKey);
    const base64 = buffer.toString('base64');
    const base64DataUri = `data:application/pdf;base64,${base64}`;
    return { base64DataUri, item };
  }

  /**
   * ══════════════════════════════════════════════════════════════════════
   * LIAISON DYNAMIQUE PROMPT ↔ CATALOGUES :
   * Génère le bloc textuel injecté dynamiquement dans le System Prompt de l'IA.
   * L'IA connaît ainsi tous les catalogues créés par l'admin et leurs règles.
   * ══════════════════════════════════════════════════════════════════════
   */
  public generatePromptContext(campaignFilter?: string | null): string {
    const all = this.listCatalogs();
    if (all.length === 0) return '';

    // Si une campagne est spécifiée, prioriser les catalogues liés à cette campagne
    const relevant = all.filter((c) => {
      if (!campaignFilter) return true;
      return !c.campaign || c.campaign === campaignFilter || c.isDefault;
    });

    const lines: string[] = [
      'CATALOGUES ET BROCHURES PDF DISPONIBLES :',
      'Tu as à ta disposition les documents PDF suivants que tu peux proposer ou envoyer aux prospects.',
      'Choisis le document le plus adapté selon la demande du client et les règles de déclenchement fournies par l\'administrateur :',
      '',
    ];

    relevant.forEach((cat, index) => {
      lines.push(`${index + 1}. [ID: "${cat.id}"] "${cat.title}"`);
      lines.push(`   - Fichier : ${cat.fileName}`);
      lines.push(`   - Description : ${cat.description}`);
      lines.push(`   - RÈGLE D'ENVOI : ${cat.triggerCondition || 'Proposer quand le prospect demande ce catalogue.'}`);
      if (cat.isDefault) {
        lines.push('   - (Ce catalogue est le document GÉNÉRAL par défaut de l\'agence)');
      }
      lines.push('');
    });

    lines.push('INSTRUCTION STRICTE D\'ENVOI POUR L\'IA :');
    lines.push('1. Pendant l\'échange, n\'hésite pas à PROPOSER le catalogue adapté dès que le besoin se précise (ex: "Souhaitez-vous que je vous transmette notre catalogue PDF complet ?").');
    lines.push('2. Dès que le prospect DEMANDE un catalogue/brochure/tarifs, OU s\'il répond OUI à ta proposition :');
    lines.push('   - Renseigne impérativement dans ton objet JSON de sortie : "send_catalog": true');
    lines.push('   - Indique l\'identifiant ID exact du catalogue choisi dans le champ "catalog_id" (ex: "ict-general-2026", "brochure-kribi", etc.).');
    lines.push('   - Ton message WhatsApp ("whatsapp_message") doit confirmer chaleureusement l\'envoi du document qui arrive immédiatement ci-dessous.');

    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════
  // Générateur PDF Universel pour les catalogues par défaut
  // ═══════════════════════════════════════════════════════════
  private generatePdfDocument(item: CatalogItem): Buffer {
    const isGeneral = item.category === 'general';

    const page1Streams: string[] = [];
    const page2Streams: string[] = [];

    // --- PAGE 1: EN-TÊTE & PRÉSENTATION ---
    page1Streams.push('q');
    page1Streams.push('0.02 0.40 0.32 rg');
    page1Streams.push('0 720 595 122 re f');
    page1Streams.push('0.95 0.77 0.06 rg');
    page1Streams.push('0 716 595 4 re f');
    page1Streams.push('Q');

    page1Streams.push('BT');
    page1Streams.push('/F2 22 Tf');
    page1Streams.push('1 1 1 rg');
    page1Streams.push('40 790 Td');
    page1Streams.push('(INSIDE CAMEROON TOURISM) Tj');
    page1Streams.push('ET');

    page1Streams.push('BT');
    page1Streams.push('/F1 12 Tf');
    page1Streams.push('0.85 0.95 0.90 rg');
    page1Streams.push('40 765 Td');
    page1Streams.push('(Agence Receptive & Tourisme d\'Exception au Cameroun) Tj');
    page1Streams.push('ET');

    page1Streams.push('BT');
    page1Streams.push('/F2 13 Tf');
    page1Streams.push('0.98 0.85 0.20 rg');
    page1Streams.push('40 735 Td');
    const subtitle = isGeneral
      ? 'CATALOGUE OFFICIEL DES SEJOURS & CIRCUITS 2026'
      : item.title.toUpperCase();
    page1Streams.push(`(${this.escapePdfText(subtitle)}) Tj`);
    page1Streams.push('ET');

    // Section Introduction
    page1Streams.push('BT');
    page1Streams.push('/F2 14 Tf');
    page1Streams.push('0.05 0.15 0.20 rg');
    page1Streams.push('40 680 Td');
    page1Streams.push('(BIENVENUE AU CAMEROUN - L\'AFRIQUE EN MINIATURE) Tj');
    page1Streams.push('ET');

    page1Streams.push('BT');
    page1Streams.push('/F1 10 Tf');
    page1Streams.push('0.20 0.25 0.30 rg');
    page1Streams.push('40 660 Td');
    page1Streams.push('(Inside Cameroon Tourism vous fait vivre des experiences inoubliables en toute securite.) Tj');
    page1Streams.push('0 -15 Td');
    page1Streams.push('(Nos circuits sont encadres par des guides certifiees, avec transport climatise et prise en charge complete.) Tj');
    page1Streams.push('ET');

    // Boîte Offre 1: Kribi
    page1Streams.push('q');
    page1Streams.push('0.95 0.97 0.98 rg');
    page1Streams.push('40 490 515 145 re f');
    page1Streams.push('0.80 0.85 0.90 RG 1 w');
    page1Streams.push('40 490 515 145 re s');
    page1Streams.push('0.02 0.50 0.40 rg');
    page1Streams.push('40 615 515 20 re f');
    page1Streams.push('Q');

    page1Streams.push('BT');
    page1Streams.push('/F2 11 Tf');
    page1Streams.push('1 1 1 rg');
    page1Streams.push('50 622 Td');
    page1Streams.push('(1. ESCAPADE BALNEAIRE A KRIBI & CHUTES DE LA LOBE) Tj');
    page1Streams.push('ET');

    page1Streams.push('BT');
    page1Streams.push('/F1 9.5 Tf');
    page1Streams.push('0.15 0.20 0.25 rg');
    page1Streams.push('50 595 Td');
    page1Streams.push('(Duree : Week-end 2J/1N ou Sejour 3J/2N | Destination : Kribi, Ocean Atlantique) Tj');
    page1Streams.push('0 -15 Td');
    page1Streams.push('(- Hebergement en hotel partenaire vue sur mer avec petit-dejeuner inclus) Tj');
    page1Streams.push('0 -13 Td');
    page1Streams.push('(- Visite guidee des Chutes de la Lobe : seules chutes au monde se jetant dans l\'ocean) Tj');
    page1Streams.push('0 -13 Td');
    page1Streams.push('(- Balade en pirogue traditionnelle sur le fleuve Lobe et rencontre pygmee) Tj');
    page1Streams.push('0 -13 Td');
    page1Streams.push('(- Degustation des fameuses crevettes geantes de Kribi au bord de l\'eau) Tj');
    page1Streams.push('0 -15 Td');
    page1Streams.push('/F2 10.5 Tf');
    page1Streams.push('0.05 0.45 0.35 rg');
    page1Streams.push('(TARIF : A partir de 75 000 FCFA / personne (Formule tout compris)) Tj');
    page1Streams.push('ET');

    // Boîte Offre 2: Ebogo
    page1Streams.push('q');
    page1Streams.push('0.95 0.97 0.98 rg');
    page1Streams.push('40 320 515 145 re f');
    page1Streams.push('0.80 0.85 0.90 RG 1 w');
    page1Streams.push('40 320 515 145 re s');
    page1Streams.push('0.02 0.50 0.40 rg');
    page1Streams.push('40 445 515 20 re f');
    page1Streams.push('Q');

    page1Streams.push('BT');
    page1Streams.push('/F2 11 Tf');
    page1Streams.push('1 1 1 rg');
    page1Streams.push('50 452 Td');
    page1Streams.push('(2. EXCURSION ECOTOURISME EBOGO & FLEUVE NYONG) Tj');
    page1Streams.push('ET');

    page1Streams.push('BT');
    page1Streams.push('/F1 9.5 Tf');
    page1Streams.push('0.15 0.20 0.25 rg');
    page1Streams.push('50 425 Td');
    page1Streams.push('(Duree : 1 journee complete | Destination : Ebogo (a 1h de Yaounde)) Tj');
    page1Streams.push('0 -15 Td');
    page1Streams.push('(- Balade paisible en pirogue artisanale au coeur de la canopee equatoriale) Tj');
    page1Streams.push('0 -13 Td');
    page1Streams.push('(- Visite de l\'Arbre Tricentenaire sacre et decouverte des plantes medicinales) Tj');
    page1Streams.push('0 -13 Td');
    page1Streams.push('(- Observation d\'oiseaux exotiques et papillons geants du bassin du Congo) Tj');
    page1Streams.push('0 -13 Td');
    page1Streams.push('(- Dejeuner traditionnel du terroir : poisson braise du fleuve et batons de manioc) Tj');
    page1Streams.push('0 -15 Td');
    page1Streams.push('/F2 10.5 Tf');
    page1Streams.push('0.05 0.45 0.35 rg');
    page1Streams.push('(TARIF : 35 000 FCFA / adulte | 20 000 FCFA / enfant (-12 ans)) Tj');
    page1Streams.push('ET');

    // Boîte Offre 3: Mont Cameroun
    page1Streams.push('q');
    page1Streams.push('0.95 0.97 0.98 rg');
    page1Streams.push('40 150 515 145 re f');
    page1Streams.push('0.80 0.85 0.90 RG 1 w');
    page1Streams.push('40 150 515 145 re s');
    page1Streams.push('0.02 0.50 0.40 rg');
    page1Streams.push('40 275 515 20 re f');
    page1Streams.push('Q');

    page1Streams.push('BT');
    page1Streams.push('/F2 11 Tf');
    page1Streams.push('1 1 1 rg');
    page1Streams.push('50 282 Td');
    page1Streams.push('(3. ASCENSION DU MONT CAMEROUN - CHAR DES DIEUX (4 100m)) Tj');
    page1Streams.push('ET');

    page1Streams.push('BT');
    page1Streams.push('/F1 9.5 Tf');
    page1Streams.push('0.15 0.20 0.25 rg');
    page1Streams.push('50 255 Td');
    page1Streams.push('(Duree : Circuit 3J/2N ou 4J/3N | Destination : Buea, Sud-Ouest) Tj');
    page1Streams.push('0 -15 Td');
    page1Streams.push('(- Trek d\'exception avec guides experts de haute montagne certifiees) Tj');
    page1Streams.push('0 -13 Td');
    page1Streams.push('(- Traversieres de la foret tropicale, savanes d\'altitude et champs de lave volcanique) Tj');
    page1Streams.push('0 -13 Td');
    page1Streams.push('(- Bivouac securise dans les refuges de montagne et cuisinier dedie) Tj');
    page1Streams.push('0 -13 Td');
    page1Streams.push('(- Lever de soleil magique au sommet avec vue panoramique sur l\'Atlantique) Tj');
    page1Streams.push('0 -15 Td');
    page1Streams.push('/F2 10.5 Tf');
    page1Streams.push('0.05 0.45 0.35 rg');
    page1Streams.push('(TARIF : 180 000 FCFA / personne (Equipements, porteurs et permis inclus)) Tj');
    page1Streams.push('ET');

    // Pied de page Page 1
    page1Streams.push('BT');
    page1Streams.push('/F1 8.5 Tf');
    page1Streams.push('0.5 0.5 0.5 rg');
    page1Streams.push('40 40 Td');
    page1Streams.push('(Inside Cameroon Tourism - www.insidecameroontourism.cm | Page 1/2) Tj');
    page1Streams.push('ET');

    // --- PAGE 2: B2B, MODALITÉS & CONTACTS ---
    page2Streams.push('q');
    page2Streams.push('0.02 0.40 0.32 rg');
    page2Streams.push('0 770 595 72 re f');
    page2Streams.push('0.95 0.77 0.06 rg');
    page2Streams.push('0 766 595 4 re f');
    page2Streams.push('Q');

    page2Streams.push('BT');
    page2Streams.push('/F2 16 Tf');
    page2Streams.push('1 1 1 rg');
    page2Streams.push('40 805 Td');
    page2Streams.push('(SERVICES ENTREPRISES, MODALITES & RESERVATIONS) Tj');
    page2Streams.push('ET');

    page2Streams.push('BT');
    page2Streams.push('/F1 10 Tf');
    page2Streams.push('0.85 0.95 0.90 rg');
    page2Streams.push('40 782 Td');
    page2Streams.push('(Solutions Sur-Mesure, Team Building & Modalites de Reglement) Tj');
    page2Streams.push('ET');

    // Boîte B2B / Entreprises
    page2Streams.push('q');
    page2Streams.push('0.95 0.97 0.98 rg');
    page2Streams.push('40 600 515 140 re f');
    page2Streams.push('0.80 0.85 0.90 RG 1 w');
    page2Streams.push('40 600 515 140 re s');
    page2Streams.push('0.02 0.50 0.40 rg');
    page2Streams.push('40 720 515 20 re f');
    page2Streams.push('Q');

    page2Streams.push('BT');
    page2Streams.push('/F2 11 Tf');
    page2Streams.push('1 1 1 rg');
    page2Streams.push('50 727 Td');
    page2Streams.push('(FORMULES ENTREPRISES, SEMINAIRES & TEAM BUILDING B2B) Tj');
    page2Streams.push('ET');

    page2Streams.push('BT');
    page2Streams.push('/F1 9.5 Tf');
    page2Streams.push('0.15 0.20 0.25 rg');
    page2Streams.push('50 700 Td');
    page2Streams.push('(- Organisation cle en main de seminaires residentiels et journees de cohesion d\'equipe) Tj');
    page2Streams.push('0 -14 Td');
    page2Streams.push('(- Activites Team Building : olympiades a la plage, rallye decouverte, regates en pirogue) Tj');
    page2Streams.push('0 -14 Td');
    page2Streams.push('(- Salles de conference equipees (videoprojecteur, sonorisation, pauses-cafe)) Tj');
    page2Streams.push('0 -14 Td');
    page2Streams.push('(- Logistique complete : transport en bus VIP climatises, facturation avec TVA / proforma) Tj');
    page2Streams.push('0 -16 Td');
    page2Streams.push('/F2 10 Tf');
    page2Streams.push('0.05 0.45 0.35 rg');
    page2Streams.push('(TARIF : Sur devis personnalise sous 24h selon l\'effectif (de 10 a 200 collaborateurs)) Tj');
    page2Streams.push('ET');

    // Boîte Modalités de Réservation
    page2Streams.push('q');
    page2Streams.push('0.98 0.98 0.96 rg');
    page2Streams.push('40 430 515 145 re f');
    page2Streams.push('0.85 0.85 0.80 RG 1 w');
    page2Streams.push('40 430 515 145 re s');
    page2Streams.push('0.85 0.60 0.10 rg');
    page2Streams.push('40 555 515 20 re f');
    page2Streams.push('Q');

    page2Streams.push('BT');
    page2Streams.push('/F2 11 Tf');
    page2Streams.push('1 1 1 rg');
    page2Streams.push('50 562 Td');
    page2Streams.push('(MODALITES DE RESERVATION ET DE PAIEMENT) Tj');
    page2Streams.push('ET');

    page2Streams.push('BT');
    page2Streams.push('/F1 9.5 Tf');
    page2Streams.push('0.15 0.20 0.25 rg');
    page2Streams.push('50 535 Td');
    page2Streams.push('(- Acompte de reservation : 30% a la confirmation, solde 72h avant le depart.) Tj');
    page2Streams.push('0 -14 Td');
    page2Streams.push('(- Moyens de paiement acceptes au Cameroun et a l\'international :) Tj');
    page2Streams.push('0 -14 Td');
    page2Streams.push('(   * Mobile Money : Orange Money +237 699 00 11 22 et MTN MoMo +237 677 00 11 22) Tj');
    page2Streams.push('0 -14 Td');
    page2Streams.push('(   * Virement bancaire / Versement agence Afriland, BICEC, Societe Generale) Tj');
    page2Streams.push('0 -14 Td');
    page2Streams.push('(   * Carte bancaire en ligne securisee Visa/Mastercard pour la diaspora) Tj');
    page2Streams.push('0 -14 Td');
    page2Streams.push('(- Conditions d\'annulation : remboursement 100% jusqu\'a 7 jours avant le depart.) Tj');
    page2Streams.push('ET');

    // Boîte Contacts & Service Client
    page2Streams.push('q');
    page2Streams.push('0.02 0.35 0.28 rg');
    page2Streams.push('40 240 515 165 re f');
    page2Streams.push('0.95 0.77 0.06 rg');
    page2Streams.push('40 385 515 20 re f');
    page2Streams.push('Q');

    page2Streams.push('BT');
    page2Streams.push('/F2 12 Tf');
    page2Streams.push('0.1 0.1 0.1 rg');
    page2Streams.push('50 392 Td');
    page2Streams.push('(CONTACTEZ NOS CONSEILLERS VOYAGE) Tj');
    page2Streams.push('ET');

    page2Streams.push('BT');
    page2Streams.push('/F2 10.5 Tf');
    page2Streams.push('1 1 1 rg');
    page2Streams.push('50 360 Td');
    page2Streams.push('(WhatsApp Commercial : +237 699 00 11 22 / +237 677 44 55 66) Tj');
    page2Streams.push('0 -18 Td');
    page2Streams.push('(Email : reservations@insidecameroontourism.cm | contact@insidecameroontourism.cm) Tj');
    page2Streams.push('0 -18 Td');
    page2Streams.push('(Site Web : www.insidecameroontourism.cm) Tj');
    page2Streams.push('0 -18 Td');
    page2Streams.push('/F1 9.5 Tf');
    page2Streams.push('0.85 0.95 0.90 rg');
    page2Streams.push('(Adresses : Yaounde (Bastos, face Ambassade) | Douala (Bonanjo, Immeuble Horizon)) Tj');
    page2Streams.push('0 -18 Td');
    page2Streams.push('/F2 10 Tf');
    page2Streams.push('0.98 0.85 0.20 rg');
    page2Streams.push('(Horaires d\'ouverture : Du Lundi au Samedi de 08h00 a 19h30) Tj');
    page2Streams.push('ET');

    // Pied de page Page 2
    page2Streams.push('BT');
    page2Streams.push('/F1 8.5 Tf');
    page2Streams.push('0.5 0.5 0.5 rg');
    page2Streams.push('40 40 Td');
    page2Streams.push('(Inside Cameroon Tourism 2026 - Tous droits reserves | Page 2/2) Tj');
    page2Streams.push('ET');

    return this.assemblePdf([
      page1Streams.join('\n'),
      page2Streams.join('\n'),
    ]);
  }

  private escapePdfText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private assemblePdf(pageContents: string[]): Buffer {
    const pageCount = pageContents.length;
    let currentId = 1;

    const catalogId = currentId++;
    const pagesId = currentId++;

    const pageObjIds: number[] = [];
    const contentObjIds: number[] = [];

    for (let i = 0; i < pageCount; i++) {
      pageObjIds.push(currentId++);
      contentObjIds.push(currentId++);
    }

    const fontF1Id = currentId++;
    const fontF2Id = currentId++;

    const objects: Array<{ id: number; data: string }> = [];

    objects.push({
      id: catalogId,
      data: `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
    });

    const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(' ');
    objects.push({
      id: pagesId,
      data: `<< /Type /Pages /Kids [${kidsStr}] /Count ${pageCount} >>`,
    });

    objects.push({
      id: fontF1Id,
      data: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    });

    objects.push({
      id: fontF2Id,
      data: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    });

    for (let i = 0; i < pageCount; i++) {
      const pId = pageObjIds[i];
      const cId = contentObjIds[i];
      const streamText = pageContents[i];
      const streamLen = Buffer.byteLength(streamText, 'latin1');

      objects.push({
        id: pId,
        data: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ${fontF1Id} 0 R /F2 ${fontF2Id} 0 R >> >> /Contents ${cId} 0 R >>`,
      });

      objects.push({
        id: cId,
        data: `<< /Length ${streamLen} >>\nstream\n${streamText}\nendstream`,
      });
    }

    objects.sort((a, b) => a.id - b.id);

    let pdfStr = '%PDF-1.4\n';
    const offsets: number[] = [];

    for (const obj of objects) {
      offsets[obj.id] = Buffer.byteLength(pdfStr, 'latin1');
      pdfStr += `${obj.id} 0 obj\n${obj.data}\nendobj\n`;
    }

    const startXref = Buffer.byteLength(pdfStr, 'latin1');
    pdfStr += `xref\n0 ${objects.length + 1}\n`;
    pdfStr += '0000000000 65535 f \n';

    for (let i = 1; i <= objects.length; i++) {
      const offset = offsets[i] || 0;
      pdfStr += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }

    pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
    pdfStr += `startxref\n${startXref}\n%%EOF\n`;

    return Buffer.from(pdfStr, 'latin1');
  }
}

export const catalogService = new CatalogService();
