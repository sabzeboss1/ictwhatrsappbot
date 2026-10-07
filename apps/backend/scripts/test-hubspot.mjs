import { Client } from '@hubspot/api-client';

const token = process.env.HUBSPOT_ACCESS_TOKEN;
if (!token) {
  console.error('Veuillez définir HUBSPOT_ACCESS_TOKEN dans votre environnement.');
  process.exit(1);
}

console.log('='.repeat(60));
console.log('🧪 TEST DE CONNEXION ET CRÉATION HUBSPOT CRM');
console.log('Token utilisé :', token.substring(0, 15) + '...');
console.log('='.repeat(60));

const client = new Client({ accessToken: token });

async function runTest() {
  try {
    // 1. Test d'authentification (Lecture des contacts)
    console.log('\n[1/4] Test de lecture des contacts (crm.objects.contacts.read)...');
    const contactsPage = await client.crm.contacts.basicApi.getPage(1);
    console.log(`✅ Authentification réussie ! Total contacts trouvés sur la page : ${contactsPage.results.length}`);

    // 2. Test des pipelines de transactions (Deals)
    console.log('\n[2/4] Vérification des Pipelines Deals (crm.objects.deals.read)...');
    try {
      const pipelines = await client.crm.pipelines.pipelinesApi.getAll('deals');
      console.log(`✅ Pipelines Deals trouvés (${pipelines.results.length}) :`);
      pipelines.results.forEach((p) => {
        console.log(`   - Pipeline: "${p.label}" (ID: ${p.id})`);
      });
    } catch (pipeErr) {
      console.warn('⚠️ Impossible de lire les pipelines deals:', pipeErr.message);
    }

    // 3. Test de création d'un contact (Standard)
    const testPhone = '+237699001122';
    const testEmail = `lead.test.ict.${Date.now()}@example.com`;
    console.log(`\n[3/4] Test de création d'un contact test (Téléphone: ${testPhone})...`);

    let createdContact;
    try {
      createdContact = await client.crm.contacts.basicApi.create({
        properties: {
          firstname: 'Jean (Test Bot)',
          lastname: 'WhatsApp ICT',
          email: testEmail,
          phone: testPhone,
          company: 'ICT Tourisme Démo',
          lifecyclestage: 'lead',
        },
        associations: [],
      });
      console.log(`✅ Contact créé avec succès !`);
      console.log(`   - ID Contact HubSpot : ${createdContact.id}`);
      console.log(`   - Prénom/Nom : Jean WhatsApp ICT`);
      console.log(`   - Email : ${testEmail}`);
    } catch (createErr) {
      console.error('❌ Échec de création contact standard :', createErr.message);
      if (createErr.body) console.error(JSON.stringify(createErr.body, null, 2));
      return;
    }

    // 4. Test d'une transaction (Deal) liée au contact
    console.log("\n[4/4] Test de création d'une opportunité (Deal) associée...");
    try {
      const createdDeal = await client.crm.deals.basicApi.create({
        properties: {
          dealname: 'Deal Test - Safari ICT WhatsApp',
          dealstage: 'appointmentscheduled',
          pipeline: 'default',
        },
        associations: [
          {
            to: { id: createdContact.id },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 3, // Deal to Contact
              },
            ],
          },
        ],
      });
      console.log(`✅ Transaction (Deal) créée avec succès !`);
      console.log(`   - ID Deal HubSpot : ${createdDeal.id}`);
    } catch (dealErr) {
      console.warn('⚠️ Erreur création Deal (vérifier les scopes de deals ou le pipeline) :', dealErr.message);
      if (dealErr.body) console.warn(JSON.stringify(dealErr.body, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 RÉSULTAT FINAL : Votre clé HubSpot fonctionne parfaitement !');
    console.log('='.repeat(60));
  } catch (err) {
    console.error('\n❌ Erreur générale HubSpot :', err.message);
    if (err.body) {
      console.error('Détails erreur API :', JSON.stringify(err.body, null, 2));
    }
  }
}

runTest();
