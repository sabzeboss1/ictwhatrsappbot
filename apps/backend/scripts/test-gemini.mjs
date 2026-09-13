/**
 * Script de test officiel pour l'API Key Google Gemini
 * Usage : node scripts/test-gemini.mjs [VOTRE_CLE_API]
 */

import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.argv[2] || process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.error('❌ Erreur : Aucune clé API fournie. Spécifiez-la en argument ou définissez GEMINI_API_KEY dans votre fichier .env.');
  console.log('Usage : node scripts/test-gemini.mjs [VOTRE_CLE_API]');
  process.exit(1);
}

async function runGeminiTest() {
  console.log('====================================================');
  console.log('🧪 TEST OFFICIEL GOOGLE GEMINI API');
  console.log('====================================================');
  console.log(`Clé testée : ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)} (longueur : ${apiKey.length} car.)\n`);

  // Étape 1 : Vérifier la validité générale de la clé sur Google Cloud
  console.log('1️⃣  Vérification de la clé sur les services Google...');
  try {
    const discoRes = await fetch(`https://www.googleapis.com/discovery/v1/apis?key=${apiKey}`);
    if (discoRes.ok) {
      console.log('   ✓ La clé est bien reconnue par l\'infrastructure Google Cloud (HTTP 200).');
    } else {
      console.log(`   ❌ La clé n'est pas reconnue par Google Cloud (HTTP ${discoRes.status}).`);
    }
  } catch (e) {
    console.log('   ⚠️ Impossible de contacter Google Discovery:', e.message);
  }

  // Étape 2 : Tester l'accès spécifique à l'API Gemini (Generative Language API)
  console.log('\n2️⃣  Test d\'accès à l\'API Gemini (Generative Language API)...');
  try {
    const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const modelsData = await modelsRes.json();

    if (!modelsRes.ok) {
      console.log(`   ❌ Échec d'accès à Gemini (HTTP ${modelsRes.status}) :`);
      console.log(`   Raison : ${modelsData.error?.message || 'Erreur inconnue'}`);
      console.log(`   Code d'erreur Google : ${modelsData.error?.details?.[0]?.reason || modelsData.error?.status || 'N/A'}`);
      
      console.log('\n----------------------------------------------------');
      console.log('💡 DIAGNOSTIC & SOLUTION :');
      console.log('----------------------------------------------------');
      console.log('Bien que la clé soit un identifiant Google valide, l\'API Gemini');
      console.log('n\'est pas encore débloquée pour cette clé.');
      console.log('\nPour corriger cela en 2 minutes :');
      console.log('Option A (Le plus simple et 100% gratuit) :');
      console.log('  1. Allez sur https://aistudio.google.com/apikey');
      console.log('  2. Cliquez sur "Create API key"');
      console.log('  3. Copiez la clé créée et relancez :');
      console.log('     node scripts/test-gemini.mjs NOUVELLE_CLE');
      console.log('\nOption B (Sur votre projet Google Cloud existant) :');
      console.log('  1. Allez sur Google Cloud Console > "API et services" > "Bibliothèque"');
      console.log('  2. Recherchez "Generative Language API" et cliquez sur "ACTIVER"');
      console.log('  3. Dans "Identifiants", vérifiez que votre clé n\'a pas de restriction d\'API bloquante.');
      console.log('----------------------------------------------------');
      return;
    }

    const models = (modelsData.models || [])
      .filter((m) => m.name.includes('gemini'))
      .map((m) => m.name.replace('models/', ''));

    console.log(`   ✓ Succès ! ${models.length} modèles Gemini disponibles :`);
    console.log(`   Modèles : ${models.slice(0, 8).join(', ')}...`);

    // Étape 3 : Génération de texte test avec fallback automatique si haute demande
    const candidates = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it'].filter(
      (m) => models.includes(m)
    );
    if (candidates.length === 0 && models[0]) candidates.push(models[0]);

    let generated = false;
    for (const modelToUse of candidates) {
      console.log(`\n3️⃣  Test de génération avec le modèle [${modelToUse}]...`);
      const genRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: 'Dis bonjour et confirme en 1 phrase enthousiaste que l\'IA Gemini est prête pour le bot WhatsApp Inside Cameroon Tourism ! 🇨🇲' }],
              },
            ],
          }),
        }
      );

      const genData = await genRes.json();
      if (genRes.ok) {
        const reply = genData.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`   ✓ Réponse de Gemini (${modelToUse}) reçue avec succès :`);
        console.log('   --------------------------------------------------');
        console.log(`   "${reply.trim()}"`);
        console.log('   --------------------------------------------------');
        console.log('\n🎉 PARFAIT ! Cette clé Gemini est 100% opérationnelle et prête à être intégrée au bot.');
        generated = true;
        break;
      } else {
        console.log(`   ⚠️ [${modelToUse}] temporairement indisponible (HTTP ${genRes.status}: ${genData.error?.message?.slice(0, 80)}...). Essai du modèle suivant...`);
      }
    }

    if (!generated) {
      console.log('   ❌ Aucun des modèles prioritaires n\'a pu répondre immédiatement.');
    }
  } catch (err) {
    console.error('   ❌ Exception réseau :', err.message);
  }
}

runGeminiTest();
