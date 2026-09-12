import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CatalogItem {
  id: string;
  title: string;
  fileName: string;
  category: 'general' | 'kribi' | 'ebogo' | 'mont_cameroun';
  description: string;
  caption: string;
  filePath: string;
  fileSize?: number;
  publicUrl: string;
}

export class CatalogService {
  private cataloguesDir: string;
  private catalogues: Map<string, CatalogItem> = new Map();

  constructor() {
    // Répertoire de stockage public des catalogues PDF
    this.cataloguesDir = path.resolve(__dirname, '../../../public/catalogues');
    this.initCatalogRegistry();
  }

  private initCatalogRegistry() {
    const generalCatalog: CatalogItem = {
      id: 'ict-general-2026',
      title: 'Catalogue Officiel — Inside Cameroon Tourism 2026',
      fileName: 'Catalogue_ICT_Tourisme_2026.pdf',
      category: 'general',
      description: 'Catalogue complet des séjours, excursions et circuits touristiques au Cameroun.',
      caption: '📄 *Catalogue Officiel Inside Cameroon Tourism 2026*\n\nVoici notre sélection d\'expériences touristiques au Cameroun (Kribi, Ebogo, Mont Cameroun, Team Building) avec l\'ensemble des formules et tarifs. Bonne lecture ! ✨🇨🇲',
      filePath: path.join(this.cataloguesDir, 'Catalogue_ICT_Tourisme_2026.pdf'),
      publicUrl: '/api/catalogues/download/Catalogue_ICT_Tourisme_2026.pdf',
    };

    const kribiBrochure: CatalogItem = {
      id: 'brochure-kribi',
      title: 'Brochure Balnéaire — Escapade Kribi & Chutes de la Lobé',
      fileName: 'Brochure_Kribi_Lobe_2026.pdf',
      category: 'kribi',
      description: 'Programme détaillé du séjour balnéaire à Kribi avec visite des Chutes de la Lobé.',
      caption: '🌊 *Brochure Escapade Kribi & Chutes de la Lobé*\n\nDécouvrez le programme complet de notre formule week-end et séjour à Kribi (hébergements, visites, pirogue et tarifs). 🏖️',
      filePath: path.join(this.cataloguesDir, 'Brochure_Kribi_Lobe_2026.pdf'),
      publicUrl: '/api/catalogues/download/Brochure_Kribi_Lobe_2026.pdf',
    };

    const ebogoBrochure: CatalogItem = {
      id: 'brochure-ebogo',
      title: 'Brochure Écotourisme — Pirogue & Forêt d\'Ebogo',
      fileName: 'Brochure_Ebogo_Ecotourisme_2026.pdf',
      category: 'ebogo',
      description: 'Excursion nature sur le fleuve Nyong et visite de l\'arbre tricentenaire à Ebogo.',
      caption: '🛶 *Brochure Écotourisme Ebogo & Fleuve Nyong*\n\nVoici le programme de l\'excursion nature en pirogue à Ebogo avec menu terroir et activités incluses. 🌿',
      filePath: path.join(this.cataloguesDir, 'Brochure_Ebogo_Ecotourisme_2026.pdf'),
      publicUrl: '/api/catalogues/download/Brochure_Ebogo_Ecotourisme_2026.pdf',
    };

    const montCamerounBrochure: CatalogItem = {
      id: 'brochure-mont-cameroun',
      title: 'Brochure Randonnée — Ascension du Mont Cameroun',
      fileName: 'Brochure_Ascension_Mont_Cameroun_2026.pdf',
      category: 'mont_cameroun',
      description: 'Guide complet pour l\'ascension du Char des Dieux (Buea, 4100m).',
      caption: '⛰️ *Brochure Ascension Mont Cameroun (4100m)*\n\nRetrouvez le circuit étape par étape, la liste du matériel recommandé, l\'encadrement des guides et les tarifs. 🥾',
      filePath: path.join(this.cataloguesDir, 'Brochure_Ascension_Mont_Cameroun_2026.pdf'),
      publicUrl: '/api/catalogues/download/Brochure_Ascension_Mont_Cameroun_2026.pdf',
    };

    this.catalogues.set(generalCatalog.id, generalCatalog);
    this.catalogues.set(kribiBrochure.id, kribiBrochure);
    this.catalogues.set(ebogoBrochure.id, ebogoBrochure);
    this.catalogues.set(montCamerounBrochure.id, montCamerounBrochure);
  }

  public getCataloguesDir(): string {
    return this.cataloguesDir;
  }

  /**
   * Assure la présence des répertoires et génère les fichiers PDF officiels s'ils n'existent pas encore.
   */
  public ensureDefaultCatalogsExist(): void {
    if (!fs.existsSync(this.cataloguesDir)) {
      fs.mkdirSync(this.cataloguesDir, { recursive: true });
      console.log(`[CatalogService] Répertoire créé : ${this.cataloguesDir}`);
    }

    for (const [id, item] of this.catalogues.entries()) {
      if (!fs.existsSync(item.filePath)) {
        console.log(`[CatalogService] Génération du PDF officiel : ${item.fileName}...`);
        const pdfBuffer = this.generatePdfDocument(item);
        fs.writeFileSync(item.filePath, pdfBuffer);
        console.log(`✓ [CatalogService] PDF créé avec succès : ${item.fileName} (${pdfBuffer.length} octets)`);
      }

      try {
        const stats = fs.statSync(item.filePath);
        item.fileSize = stats.size;
      } catch {
        // Ignorer
      }
    }
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
    return list;
  }

  /**
   * Récupère le catalogue principal par défaut
   */
  public getDefaultCatalog(): CatalogItem {
    const defaultItem = this.catalogues.get('ict-general-2026');
    if (!defaultItem) {
      throw new Error('Catalogue par défaut introuvable');
    }
    return defaultItem;
  }

  /**
   * Récupère un catalogue par identifiant ou par catégorie
   */
  public getCatalog(idOrCategory?: string | null): CatalogItem {
    if (!idOrCategory || idOrCategory === 'general') {
      return this.getDefaultCatalog();
    }

    // Par ID direct
    if (this.catalogues.has(idOrCategory)) {
      return this.catalogues.get(idOrCategory)!;
    }

    // Par catégorie (kribi, ebogo, mont_cameroun)
    const normalized = idOrCategory.toLowerCase();
    for (const item of this.catalogues.values()) {
      if (item.category === normalized || item.id.includes(normalized)) {
        return item;
      }
    }

    return this.getDefaultCatalog();
  }

  /**
   * Obtient le buffer binaire d'un catalogue
   */
  public getCatalogBuffer(idOrCategory?: string | null): { buffer: Buffer; item: CatalogItem } {
    const item = this.getCatalog(idOrCategory);
    if (!fs.existsSync(item.filePath)) {
      this.ensureDefaultCatalogsExist();
    }
    const buffer = fs.readFileSync(item.filePath);
    return { buffer, item };
  }

  /**
   * Récupère la Data URI en base64 pour l'envoi via Evolution API
   * Format: data:application/pdf;base64,...
   */
  public getCatalogBase64(idOrCategory?: string | null): { base64DataUri: string; item: CatalogItem } {
    const { buffer, item } = this.getCatalogBuffer(idOrCategory);
    const base64 = buffer.toString('base64');
    const base64DataUri = `data:application/pdf;base64,${base64}`;
    return { base64DataUri, item };
  }

  // ═══════════════════════════════════════════════════════════
  // Générateur PDF Pur Node.js (Standard PDF-1.4 Universel)
  // ═══════════════════════════════════════════════════════════
  private generatePdfDocument(item: CatalogItem): Buffer {
    const isGeneral = item.category === 'general';
    const isKribi = item.category === 'kribi';
    const isEbogo = item.category === 'ebogo';
    const isMontCameroun = item.category === 'mont_cameroun';

    // Construction des flux de contenu (Page A4: 595.28 x 841.89 points)
    const page1Streams: string[] = [];
    const page2Streams: string[] = [];

    // --- PAGE 1: EN-TÊTE & PRÉSENTATION ---
    // Bandeau supérieur vert émeraude (Couleur ICT #005c4b / #059669)
    page1Streams.push('q');
    page1Streams.push('0.02 0.40 0.32 rg'); // RGB #056652
    page1Streams.push('0 720 595 122 re f'); // Rectangle bandeau header
    page1Streams.push('0.95 0.77 0.06 rg'); // Bordure dorée
    page1Streams.push('0 716 595 4 re f');
    page1Streams.push('Q');

    // Titre blanc dans le bandeau
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
      // Remplacer les caractères accentués courants par leurs équivalents ASCII pour la police Helvetica standard Type 1
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Assemble un fichier PDF 1.4 binaire valide à partir des flux de contenu des pages
   */
  private assemblePdf(pageContents: string[]): Buffer {
    const pageCount = pageContents.length;
    let currentId = 1;

    // 1: Catalog
    const catalogId = currentId++;
    // 2: Pages container
    const pagesId = currentId++;

    const pageObjIds: number[] = [];
    const contentObjIds: number[] = [];

    for (let i = 0; i < pageCount; i++) {
      pageObjIds.push(currentId++);
      contentObjIds.push(currentId++);
    }

    // 4: Font F1 (Helvetica)
    const fontF1Id = currentId++;
    // 5: Font F2 (Helvetica-Bold)
    const fontF2Id = currentId++;

    const objects: Array<{ id: number; data: string }> = [];

    // Catalog
    objects.push({
      id: catalogId,
      data: `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
    });

    // Pages
    const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(' ');
    objects.push({
      id: pagesId,
      data: `<< /Type /Pages /Kids [${kidsStr}] /Count ${pageCount} >>`,
    });

    // Font F1
    objects.push({
      id: fontF1Id,
      data: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    });

    // Font F2
    objects.push({
      id: fontF2Id,
      data: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    });

    // Pages et Contenus
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

    // Tri des objets par ID
    objects.sort((a, b) => a.id - b.id);

    // Calcul des offsets
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
