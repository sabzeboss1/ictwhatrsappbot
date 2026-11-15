/*
CONNEXION DU BOT WHATSAPP AU PIPELINE HUBSPOT
Exemple à adapter, non exécuté contre votre compte.
Module CommonJS pour un environnement Node.js disposant de fetch global.
Si votre projet utilise ESM, remplacez module.exports par des exports ESM.

INSTALLATION
1. Réutilisez le contact HubSpot que votre bot crée déjà : il faut son ID.
2. Placez le jeton HubSpot dans la variable d'environnement HUBSPOT_ACCESS_TOKEN.
   Gardez-le exclusivement côté serveur. Ne le partagez pas et ne le journalisez pas.
   L'application doit être autorisée à écrire les transactions (crm.objects.deals.write).
3. Appelez creerOpportunite UNE SEULE FOIS par nouvelle demande commerciale.
4. Stockez immédiatement l'ID retourné dans votre base, sur cette demande.
5. Appelez changerEtape sur cet ID lorsque l'événement métier est vérifié.

IMPORTANT EN PRODUCTION
- Ce module ne fournit PAS une déduplication persistante ni une gestion de concurrence.
- Utilisez une clé de demande stable et un verrou par demande dans votre base.
- Un webhook WhatsApp peut être reçu plusieurs fois : dédupliquez ses événements.
- Si un POST expire ou renvoie une erreur serveur, sa création peut avoir réussi.
  Ne recommencez pas aveuglément : vérifiez et réconciliez dans HubSpot d'abord.
- Sur 429, respectez Retry-After et mettez les opérations en attente.
- Journalisez les statuts et correlationId, jamais le jeton ou les données clients.
- Ne passez à GAGNEE qu'après confirmation fiable de la réservation et du paiement
  requis par vos règles, pas à la simple déclaration du client.
- Les messages et relances WhatsApp restent gérés séparément par votre bot.

Pipeline et étapes : valeurs retournées à la création dans cette conversation.
Si vous modifiez les étapes dans HubSpot, actualisez ces constantes.
Référence : https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/deals/guide
*/

const PIPELINE_ID = '4352514296';
const ETAPES = Object.freeze({
    NOUVELLE_DEMANDE: '6443559115',
    A_QUALIFIER: '6443559116',
    QUALIFIEE: '6443559117',
    OFFRE_ENVOYEE: '6443559118',
    ACCORD_PAIEMENT_ATTENDU: '6443559119',
    GAGNEE: '6443559120',
    PERDUE: '6443559121',
});

async function requeteHubSpot(method, chemin, donnees) {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) throw new Error('Variable HUBSPOT_ACCESS_TOKEN manquante.');
    if (typeof fetch !== 'function') {
        throw new Error('Cet exemple nécessite un environnement avec fetch global.');
    }

    let reponse;
    try {
        reponse = await fetch(`https://api.hubapi.com${chemin}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(donnees),
            signal: AbortSignal.timeout(20000),
        });
    } catch (cause) {
        const erreur = new Error(
            'Réponse HubSpot non reçue. Vérifier le résultat avant de répéter une création.'
        );
        erreur.creationPeutAvoirReussi = method === 'POST';
        throw erreur;
    }

    // Ne pas afficher le contenu brut de la réponse dans les logs.
    const resultat = await reponse.json().catch(() => null);
    if (!reponse.ok) {
        const erreur = new Error(`Appel HubSpot refusé : HTTP ${reponse.status}.`);
        erreur.status = reponse.status;
        erreur.correlationId = resultat?.correlationId;
        erreur.retryAfter = reponse.headers.get('retry-after');
        erreur.creationPeutAvoirReussi = method === 'POST' && reponse.status >= 500;
        throw erreur;
    }
    return resultat;
}

async function creerOpportunite({ contactId, nomDemande, montant }) {
    if (!/^\d+$/.test(String(contactId))) {
        throw new Error('Un ID de contact HubSpot valide est requis.');
    }
    if (typeof nomDemande !== 'string' || !nomDemande.trim()) {
        throw new Error('Un nom de demande est requis.');
    }
    const properties = {
        dealname: nomDemande.trim(),
        pipeline: PIPELINE_ID,
        dealstage: ETAPES.NOUVELLE_DEMANDE,
    };
    if (montant !== undefined && montant !== null) {
        if (typeof montant !== 'number' || !Number.isFinite(montant) || montant < 0) {
            throw new Error('Le montant doit être un nombre positif ou nul.');
        }
        // Utiliser la devise de la transaction configurée dans votre compte.
        properties.amount = String(montant);
    }

    const resultat = await requeteHubSpot('POST', '/crm/v3/objects/deals', {
        properties,
        associations: [{
            to: { id: String(contactId) },
            types: [{
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 3, // Sens transaction -> contact.
            }],
        }],
    });
    if (!resultat?.id) {
        throw new Error('Création peut-être réussie, mais ID absent : vérifier avant de répéter.');
    }
    return String(resultat.id);
}

async function changerEtape(dealId, cleEtape) {
    if (!/^\d+$/.test(String(dealId))) {
        throw new Error('Un ID de transaction HubSpot valide est requis.');
    }
    if (!Object.hasOwn(ETAPES, cleEtape)) {
        throw new Error('Étape inconnue. Utiliser une clé de ETAPES.');
    }
    // Le dealId doit provenir de la demande enregistrée par votre bot dans ce pipeline.
    // Votre logique métier doit empêcher les retours en arrière sur événements retardés.
    return requeteHubSpot('PATCH', `/crm/v3/objects/deals/${dealId}`, {
        properties: { dealstage: ETAPES[cleEtape] },
    });
}

module.exports = { creerOpportunite, changerEtape, PIPELINE_ID, ETAPES };

/*
POINTS D'INTÉGRATION DANS VOTRE BOT — exemples à adapter, non exécutés :

// Après avoir récupéré votre contactId existant, dans un traitement verrouillé
// par demande, et seulement si aucune création n'est déjà faite ou incertaine :
const dealId = await creerOpportunite({
  contactId,
  nomDemande: 'Demande excursion WhatsApp',
});
// Enregistrez dealId en base immédiatement avant d'acquitter ce traitement.

// Plus tard, après collecte des informations nécessaires :
await changerEtape(dealId, 'QUALIFIEE');

// Seulement lorsque l'offre a réellement été envoyée :
await changerEtape(dealId, 'OFFRE_ENVOYEE');

// Seulement après vérification de votre événement de confirmation :
await changerEtape(dealId, 'GAGNEE');

TEST CONSEILLÉ
Utilisez d'abord un contact de test et une demande nommée « TEST WhatsApp ».
Vérifiez l'association au bon contact et le changement d'étape dans HubSpot.
Ne branchez les événements réels qu'après ce contrôle.
*/
