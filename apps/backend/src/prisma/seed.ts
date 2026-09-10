import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding de la base de données ICT WhatsApp AI...');

  // 1. Nettoyage initial (optionnel en dev)
  await prisma.message.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();
  await prisma.auditLog.deleteMany();

  // 2. Création des utilisateurs
  const adminPassword = await bcrypt.hash('Admin123!', 10);
  const agentPassword = await bcrypt.hash('Agent123!', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@ict.cm',
      name: 'Directeur ICT (Admin)',
      passwordHash: adminPassword,
      role: 'admin',
    },
  });

  const agent = await prisma.user.create({
    data: {
      email: 'agent@ict.cm',
      name: 'Brenda Nguemo (Conseillère)',
      passwordHash: agentPassword,
      role: 'agent',
    },
  });

  console.log(`✓ Utilisateurs créés: ${admin.email} (admin), ${agent.email} (agent)`);

  // 3. Création de Leads de démonstration
  const lead1 = await prisma.lead.create({
    data: {
      phone: '+237699123456',
      firstName: 'Alain',
      lastName: 'Kamdem',
      email: 'alain.kamdem@mtn.cm',
      company: 'MTN Cameroun',
      source: 'whatsapp',
      campaign: 'campagne_entreprises_q4',
      customerType: 'Entreprise',
      conversationStage: 'QUALIFICATION',
      intent: 'Reservation',
      need: 'Team building annuel pour la direction technique',
      participantsCount: 35,
      preferredDate: '24 octobre 2026',
      budget: '3 500 000 FCFA',
      recommendedOffer: 'Séminaire Écotourisme & Team building Kribi',
      productIdentified: true,
      purchaseIntent: 'demande_prix',
      availabilityConfirmed: true,
      productStandard: false,
      customRequest: true,
      isB2B: true,
      isVip: true,
      interactionLevel: 'fournit_toutes_infos',
      objections: JSON.stringify(['Validation budget comité requise']),
      qualificationScore: 88,
      leadStatus: 'Opportunite chaude',
      nextStep: 'Conseiller humain',
      assignedAgentId: agent.id,
      hubspotContactId: 'hs_demo_001',
      hubspotDealId: 'deal_demo_001',
      hubspotSyncStatus: 'synced',
    },
  });

  await prisma.message.createMany({
    data: [
      {
        leadId: lead1.id,
        direction: 'inbound',
        content: 'Bonjour, je suis Alain Kamdem de MTN Cameroun. Nous souhaitons organiser un team building pour 35 collaborateurs le 24 octobre prochain.',
        createdAt: new Date(Date.now() - 3600000 * 4),
      },
      {
        leadId: lead1.id,
        direction: 'outbound',
        content: 'Bonjour M. Kamdem et merci de contacter Inside Cameroon Tourism ! 🇨🇲 Ce sera un immense honneur d\'accompagner MTN. Pour ce groupe de 35 personnes, préférez-vous la formule détente balnéaire à Kribi ou aventure dans les hauts plateaux de l\'Ouest ?',
        createdAt: new Date(Date.now() - 3600000 * 3),
      },
      {
        leadId: lead1.id,
        direction: 'inbound',
        content: 'Kribi nous intéresse énormément, avec une activité nautique et une soirée barbecue privatisée.',
        createdAt: new Date(Date.now() - 3600000 * 2),
      },
      {
        leadId: lead1.id,
        direction: 'outbound',
        content: 'Parfait ! Compte tenu de la taille de votre équipe et du caractère exclusif de votre demande B2B, je transmets immédiatement votre dossier à notre conseillère dédiée Brenda Nguemo qui vous appelle dans l\'heure avec un devis détaillé.',
        createdAt: new Date(Date.now() - 3600000 * 1),
      },
    ],
  });

  const lead2 = await prisma.lead.create({
    data: {
      phone: '+237677987654',
      firstName: 'Carine',
      lastName: 'Mbarga',
      email: 'carine.mbarga@gmail.com',
      source: 'instagram_ads',
      customerType: 'Famille',
      conversationStage: 'RECOMMENDATION',
      intent: 'Reservation',
      need: 'Vacances de Pâques en famille avec 3 enfants',
      participantsCount: 5,
      preferredDate: '10 avril',
      budget: '450 000 FCFA',
      recommendedOffer: 'Escapade Balnéaire Kribi & Chutes de la Lobé',
      productIdentified: true,
      purchaseIntent: 'interesse',
      availabilityConfirmed: false,
      productStandard: true,
      customRequest: false,
      isB2B: false,
      isVip: false,
      interactionLevel: 'dialogue_actif',
      objections: JSON.stringify([]),
      qualificationScore: 65,
      leadStatus: 'Prospect qualifie',
      nextStep: 'Landing Page',
      assignedAgentId: agent.id,
      hubspotSyncStatus: 'synced',
      hubspotContactId: 'hs_demo_002',
    },
  });

  await prisma.message.createMany({
    data: [
      {
        leadId: lead2.id,
        direction: 'inbound',
        content: 'Bonjour ! J\'ai vu votre pub pour le séjour à Kribi. C\'est adapté pour une famille de 5 avec enfants ?',
        createdAt: new Date(Date.now() - 7200000),
      },
      {
        leadId: lead2.id,
        direction: 'outbound',
        content: 'Bonjour Carine ! Absolument, notre escapade Kribi comprend un hôtel pieds dans l\'eau avec piscine sécurisée et la visite guidée en pirogue des Chutes de la Lobé que les enfants adorent ! Pour quelle période envisagez-vous ce séjour ?',
        createdAt: new Date(Date.now() - 5400000),
      },
      {
        leadId: lead2.id,
        direction: 'inbound',
        content: 'Nous pensons vers le 10 avril pour les congés scolaires.',
        createdAt: new Date(Date.now() - 3600000),
      },
    ],
  });

  const lead3 = await prisma.lead.create({
    data: {
      phone: '+237655334455',
      firstName: 'Patrick',
      lastName: 'Eyango',
      source: 'facebook_ads',
      customerType: 'Particulier',
      conversationStage: 'DISCOVERY',
      intent: 'Information',
      need: 'Renseignement sur les tarifs',
      participantsCount: 1,
      preferredDate: null,
      purchaseIntent: 'information',
      interactionLevel: 'repond_peu',
      objections: JSON.stringify([]),
      qualificationScore: 20,
      leadStatus: 'Prospect froid',
      nextStep: 'Nurturing',
      hubspotSyncStatus: 'pending',
    },
  });

  await prisma.message.createMany({
    data: [
      {
        leadId: lead3.id,
        direction: 'inbound',
        content: 'Bjr infos svp',
        createdAt: new Date(Date.now() - 1800000),
      },
      {
        leadId: lead3.id,
        direction: 'outbound',
        content: 'Bonjour et bienvenue chez Inside Cameroon Tourism ! 🌍 Nous proposons des excursions week-end (Kribi, Ebogo, Limbe) et des circuits découverte. Qu\'aimeriez-vous découvrir en particulier ?',
        createdAt: new Date(Date.now() - 1200000),
      },
    ],
  });

  console.log('✓ 3 leads et leurs messages de démonstration ont été créés avec succès !');
}

main()
  .catch((e) => {
    console.error('Erreur seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
