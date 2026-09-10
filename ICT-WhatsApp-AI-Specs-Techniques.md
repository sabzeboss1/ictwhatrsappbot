# ICT WhatsApp AI — Cahier des Charges Technique (v2)

**Projet :** Bot de qualification de leads WhatsApp propulsé par IA, avec dashboard de gestion et synchronisation HubSpot.
**Stack :** 100% JavaScript / TypeScript (front + back).
**Contexte :** Reconstruction from scratch du workflow n8n existant (`ict_workflow_v2`), sans dépendance à n8n ni à Meta Business Manager direct.

---

## 1. Vue d'ensemble

```
Prospect WhatsApp
      │
      ▼
Evolution API (Docker, Baileys)
      │  webhook message entrant
      ▼
Backend Node.js/TypeScript ──────► Anthropic/OpenAI API (agent IA qualification)
      │        │                            │
      │        ▼                            ▼
      │   PostgreSQL (leads,          Structured Output
      │   conversations, scores)      (JSON: score, stage, intent...)
      │        │
      │        ▼
      │   Redis + BullMQ (file d'attente, anti-doublon, retry)
      │
      ├──► Evolution API (envoi réponse WhatsApp)
      ├──► HubSpot API (création/MAJ contact + deal)
      │
      ▼
Frontend React (dashboard temps réel : conversations, leads, scores)
```

---

## 2. Stack technique

### 2.1 Backend

| Composant | Choix | Raison |
|---|---|---|
| Runtime | **Node.js 22 LTS** | Stable, support long terme |
| Langage | **TypeScript** | Sécurité de type, cohérence avec le front |
| Framework HTTP | **Fastify** | Léger, rapide, bon support TS natif |
| ORM | **Prisma** | Migrations simples, typage auto généré |
| Base de données | **PostgreSQL 16** | Fiable, bon support JSON/JSONB pour les données IA |
| File d'attente | **BullMQ + Redis** | Anti-doublon, retry, traitement asynchrone des messages |
| Validation | **Zod** | Validation des payloads webhook + schémas structured output IA |
| Agent IA | **SDK Anthropic (`@anthropic-ai/sdk`)** ou OpenAI | Appel direct, pas besoin de LangChain pour un seul agent |
| WhatsApp | **Evolution API** (service Docker séparé) | Auto-hébergé, pas de Meta Business Manager direct |
| CRM | **`@hubspot/api-client`** | SDK officiel HubSpot |
| Auth dashboard | **JWT (jose) + bcrypt** | Simple, sans dépendance lourde |
| Logs | **Pino** | Natif Fastify, performant |
| Tests | **Vitest** | Rapide, compatible TS/ESM |

### 2.2 Frontend

| Composant | Choix | Raison |
|---|---|---|
| Framework | **React 19 + Vite** | Rapide en dev, écosystème mature |
| Langage | **TypeScript** | Cohérence avec le backend |
| Style | **Tailwind CSS** | Rapide à itérer, cohérent |
| Composants UI | **shadcn/ui** | Composants accessibles, personnalisables |
| État serveur | **TanStack Query** | Cache, refetch, synchro avec l'API |
| Temps réel | **Socket.IO (client)** | Voir les conversations/scores se mettre à jour en direct |
| Graphiques | **Recharts** | Visualiser scores, volumes de leads, taux de conversion |
| Routing | **React Router** | Standard |
| Formulaires | **React Hook Form + Zod** | Cohérence de validation front/back |

### 2.3 Infrastructure

| Composant | Choix |
|---|---|
| Conteneurisation | **Docker + Docker Compose** |
| Reverse proxy / HTTPS | **Caddy** (certificats auto) |
| Hébergement | VPS **Hetzner** ou **DigitalOcean** |
| CI/CD | **GitHub Actions** (build, test, déploiement) |
| Monitoring erreurs | **Sentry** |
| Monitoring uptime | **UptimeRobot** (gratuit) |
| Temps réel serveur | **Socket.IO (server)** intégré à Fastify |

---

## 3. Architecture des dossiers (monorepo)

```
ict-whatsapp-ai/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── whatsapp/       # webhooks Evolution API, envoi messages
│   │   │   │   ├── agent/          # appel IA, prompt système, parsing structuré
│   │   │   │   ├── scoring/        # calcul du score + règles de routage
│   │   │   │   ├── hubspot/        # sync contacts/deals
│   │   │   │   ├── leads/          # CRUD leads, historique conversation
│   │   │   │   └── auth/           # login dashboard
│   │   │   ├── queues/             # jobs BullMQ (traitement message, retry)
│   │   │   ├── prisma/             # schema.prisma, migrations
│   │   │   ├── plugins/            # plugins Fastify (db, redis, socket.io)
│   │   │   └── server.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── frontend/
│       ├── src/
│       │   ├── pages/              # Dashboard, Conversations, Leads, Settings
│       │   ├── components/
│       │   ├── hooks/              # useLeads, useConversations (TanStack Query)
│       │   ├── lib/                # client API, client socket.io
│       │   └── main.tsx
│       ├── Dockerfile
│       └── package.json
│
├── docker-compose.yml              # backend + frontend + postgres + redis + evolution-api + caddy
├── .env.example
└── README.md
```

---

## 4. Modèle de données (PostgreSQL / Prisma)

```prisma
model Lead {
  id                 String   @id @default(cuid())
  phone              String   @unique
  firstName          String?
  lastName           String?
  email              String?
  company            String?
  source             String   // whatsapp | instagram_ads | facebook_ads | paid_ads
  campaign           String?
  customerType       String?  // Particulier, Couple, Famille, Groupe, Entreprise, Ecole, ONG, Administration, Inconnu
  conversationStage  String   @default("NEW_CONTACT") // NEW_CONTACT, DISCOVERY, QUALIFICATION, RECOMMENDATION, OBJECTION_HANDLING, CONVERSION, CUSTOMER
  intent             String?  // Decouverte, Information, Reservation, SAV, Autre
  need               String?
  participantsCount  Int?
  preferredDate      String?
  budget             String?
  recommendedOffer   String?
  productIdentified  Boolean  @default(false)
  purchaseIntent     String?  // information, interesse, demande_prix, veut_reserver
  availabilityConfirmed Boolean @default(false)
  productStandard    Boolean  @default(false)
  customRequest      Boolean  @default(false)
  isB2B              Boolean  @default(false)
  isVip              Boolean  @default(false)
  interactionLevel   String?  // repond_peu, dialogue_actif, fournit_toutes_infos
  objections         String[] @default([])
  qualificationScore Int      @default(0)
  leadStatus         String?  // Prospect froid, Prospect tiede, Prospect qualifie, Opportunite chaude
  nextStep           String?  // Nurturing, Continuer qualification, Landing Page, Paiement, Conseiller humain
  assignedAgentId    String?
  hubspotContactId   String?
  hubspotDealId      String?
  hubspotSyncStatus  String   @default("pending") // pending | synced | failed
  hubspotLastError   String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  messages           Message[]
  assignedAgent      User?    @relation(fields: [assignedAgentId], references: [id])
}

model Message {
  id                String   @id @default(cuid())
  leadId            String
  lead              Lead     @relation(fields: [leadId], references: [id])
  direction         String   // inbound | outbound
  content           String
  messageType       String   // text, image, audio, document, location, interactive, unknown
  whatsappMessageId String?  @unique  // clé de l'anti-doublon
  sentByAgentId     String?  // si un humain a répondu manuellement
  createdAt         DateTime @default(now())
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  role         String   @default("agent") // admin | agent
  createdAt    DateTime @default(now())
  leads        Lead[]
}

model AuditLog {
  id        String   @id @default(cuid())
  actorId   String?  // userId ou "system" pour l'IA
  action    String   // ex: "lead.status_changed", "message.sent_manually"
  entityId  String
  metadata  Json?
  createdAt DateTime @default(now())
}
```

---

## 5. Contrat d'API (REST)

Toutes les routes protégées (sauf webhook) exigent un header `Authorization: Bearer <JWT>`.

### 5.1 Auth

| Méthode | Route | Body | Réponse |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/api/auth/me` | — | `{ user }` |

### 5.2 Webhook WhatsApp (public, protégé par secret)

| Méthode | Route | Description |
|---|---|---|
| POST | `/webhooks/whatsapp` | Reçoit les événements Evolution API (`messages.upsert`). Header `X-Webhook-Secret` obligatoire, comparé à `EVOLUTION_WEBHOOK_SECRET`. Réponse `200` immédiate (traitement délégué à la queue). |

### 5.3 Leads

| Méthode | Route | Query/Body | Réponse |
|---|---|---|---|
| GET | `/api/leads` | `?status=&stage=&search=&page=&limit=` | `{ data: Lead[], total, page }` |
| GET | `/api/leads/:id` | — | `Lead` avec `messages` inclus |
| PATCH | `/api/leads/:id` | `{ leadStatus?, nextStep?, assignedAgentId? }` | `Lead` mis à jour |
| POST | `/api/leads/:id/messages` | `{ content: string }` | Envoie un message manuel (agent humain prend la main) |
| POST | `/api/leads/:id/resync-hubspot` | — | Force une resynchronisation HubSpot |

### 5.4 Conversations (vue temps réel)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/conversations` | Liste des conversations actives triées par dernière activité |
| GET | `/api/conversations/:leadId/messages` | Historique paginé |

### 5.5 Statistiques (dashboard)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/stats/overview` | Totaux : leads par statut, taux de conversion, volume messages/jour |
| GET | `/api/stats/funnel` | Répartition par `conversationStage` |

### 5.6 Événements Socket.IO (temps réel)

| Event | Payload | Déclencheur |
|---|---|---|
| `lead:updated` | `Lead` | Après chaque traitement IA ou modification manuelle |
| `message:new` | `Message` | Nouveau message entrant ou sortant |
| `lead:alert` | `{ leadId, reason }` | Lead chaud/B2B/VIP nécessitant un humain |

---

## 6. Agent IA — Prompt système complet

> **Important** : reprendre ce prompt tel quel (il vient du workflow n8n existant, déjà validé côté métier). Le stocker dans `apps/backend/src/modules/agent/prompts/lead-qualification.ts` comme constante versionnée (ne pas le laisser en dur dans le code d'appel API, pour pouvoir le faire évoluer sans redéploiement complet).

```
Tu es l'Agent IA de qualification commerciale d'Inside Cameroon Tourism (ICT), déployé sur WhatsApp.
Version : ICT Qualification AI 1.0.

IDENTITÉ ET MISSION
Tu représentes officiellement ICT. Chaque réponse engage l'image de l'entreprise. Ta mission :
transformer chaque conversation WhatsApp en opportunité commerciale qualifiée. Tu n'es pas un
chatbot de questions-réponses : tu es un conseiller commercial numérique qui accompagne chaque
prospect jusqu'à la prochaine étape de son parcours d'achat (Landing Page, paiement, ou conseiller humain).

TON ET STYLE
Professionnel, chaleureux, rassurant, courtois, positif, naturel.
Messages courts, lisibles sur mobile, personnalisés, conversationnels.
Jamais de longs blocs de texte : si plusieurs infos sont nécessaires, les répartir en plusieurs
messages courts ou listes courtes.
Langue par défaut : français. Si le prospect écrit dans une autre langue que tu maîtrises,
continue naturellement dans cette langue.
Emojis avec modération pour humaniser, jamais au détriment de la clarté.

CE QUE TU NE DOIS JAMAIS FAIRE
Inventer une information (prix, disponibilité, dates, offres).
Promettre un avantage non validé ou une disponibilité non confirmée.
Modifier un tarif ou une offre.
Donner un avis personnel ou critiquer un concurrent.
Exercer une pression commerciale ou forcer une vente.
Fournir des informations juridiques/contractuelles non validées.
Partager des données personnelles d'un autre client.
Envoyer le catalogue complet sans avoir compris le besoin.
Répondre uniquement par un prix, sans contexte.
Remplacer un conseiller humain sur une vente complexe (B2B, VIP, sur-mesure, groupe > 30).
En cas de doute, reconnais ton incertitude et oriente vers un conseiller humain.

STRUCTURE OBLIGATOIRE DE CHAQUE RÉPONSE
1. Accuser réception / répondre à la demande.
2. Apporter une information utile et exacte.
3. Poser UNE SEULE question pertinente pour faire avancer la qualification (jamais plusieurs
   questions à la fois).
4. Indiquer clairement la prochaine étape quand le prospect est prêt.

MACHINE À ÉTATS
Tu dois toujours savoir dans quel état se trouve la conversation (variable conversation_stage) :
NEW_CONTACT → DISCOVERY → QUALIFICATION → RECOMMENDATION → OBJECTION_HANDLING → CONVERSION → CUSTOMER

CE QUE TU DOIS COLLECTER SELON LE TYPE DE PROSPECT
- Particulier/Couple/Famille : nom, nombre de participants, occasion, date souhaitée, motivation.
- Entreprise (B2B) : entreprise, secteur, nature du besoin, taille du groupe, objectif professionnel.
- École/ONG/Association : nom de la structure, niveau/type, nombre de participants, objectif de
  sortie, encadrement.
- Groupe / Événement privé : taille du groupe, occasion, date, niveau de personnalisation.
Ne redemande jamais une information déjà donnée par le prospect dans la conversation.

CATALOGUE ET OFFRES
Tu ne connais PAS le détail des offres par cœur. Pour toute question sur une offre précise
(contenu, prix, disponibilité), utilise l'outil "Catalogue ICT" mis à ta disposition plutôt que
d'inventer une réponse. Ne recommande jamais l'offre la plus chère par défaut : recommande
l'offre qui correspond le mieux au besoin exprimé.

SORTIE ATTENDUE
À la fin de chaque tour, en plus de ton message WhatsApp, tu dois structurer les informations
extraites de l'échange selon le schéma JSON fourni. Ne calcule PAS toi-même le score de
qualification : renseigne uniquement les champs bruts.
```

### 6.1 Schéma de sortie structurée (Zod, équivalent au parser n8n)

```typescript
import { z } from "zod";

export const LeadQualificationOutputSchema = z.object({
  whatsapp_message: z.string(),
  conversation_stage: z.enum([
    "NEW_CONTACT", "DISCOVERY", "QUALIFICATION",
    "RECOMMENDATION", "OBJECTION_HANDLING", "CONVERSION", "CUSTOMER",
  ]),
  intent: z.enum(["Decouverte", "Information", "Reservation", "SAV", "Autre"]),
  customer_type: z.enum([
    "Particulier", "Couple", "Famille", "Groupe",
    "Entreprise", "Ecole", "ONG", "Administration", "Inconnu",
  ]),
  need: z.string().nullable().optional(),
  participants_count: z.number().int().nullable().optional(),
  preferred_date: z.string().nullable().optional(),
  budget: z.string().nullable().optional(),
  recommended_offer: z.string().nullable().optional(),
  product_identified: z.boolean().default(false),
  purchase_intent: z.enum(["information", "interesse", "demande_prix", "veut_reserver"]),
  availability_confirmed: z.boolean().default(false),
  product_standard: z.boolean().default(false),
  custom_request: z.boolean().default(false),
  is_b2b: z.boolean().default(false),
  is_vip: z.boolean().default(false),
  interaction_level: z.enum(["repond_peu", "dialogue_actif", "fournit_toutes_infos"]),
  objections: z.array(z.string()).default([]),
  email: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
});
```

### 6.2 Logique de scoring (portage direct du nœud n8n `Calcul Score + Routage`)

```typescript
function computeScore(item: LeadQualificationOutput): { score: number; leadStatus: string; nextStep: string } {
  let score = 0;

  const typeScores: Record<string, number> = {
    Entreprise: 20, ONG: 18, Ecole: 18, Groupe: 15,
    Couple: 10, Famille: 10, Particulier: 5,
  };
  score += typeScores[item.customer_type] ?? 0;

  const n = item.participants_count ?? 0;
  if (n >= 31) score += 20;
  else if (n >= 11) score += 15;
  else if (n >= 3) score += 10;
  else if (n >= 1) score += 5;

  if (item.preferred_date) {
    score += /\d{1,2}/.test(item.preferred_date) ? 15 : 10;
  }

  const intentScores: Record<string, number> = {
    information: 5, interesse: 10, demande_prix: 15, veut_reserver: 25,
  };
  score += intentScores[item.purchase_intent] ?? 0;

  const interactionScores: Record<string, number> = {
    repond_peu: 5, dialogue_actif: 10, fournit_toutes_infos: 20,
  };
  score += interactionScores[item.interaction_level] ?? 0;

  score = Math.min(score, 100);

  let leadStatus: string;
  if (score <= 30) leadStatus = "Prospect froid";
  else if (score <= 60) leadStatus = "Prospect tiede";
  else if (score <= 80) leadStatus = "Prospect qualifie";
  else leadStatus = "Opportunite chaude";

  let nextStep = "Nurturing";
  if (item.is_b2b || item.is_vip || item.custom_request || score >= 80) {
    nextStep = "Conseiller humain";
  } else if (item.purchase_intent === "veut_reserver" && item.availability_confirmed && item.product_standard) {
    nextStep = "Paiement";
  } else if (item.product_identified && score >= 61) {
    nextStep = "Landing Page";
  } else if (score >= 31) {
    nextStep = "Continuer qualification";
  }

  return { score, leadStatus, nextStep };
}
```

---

## 7. Intégration HubSpot — mapping des champs

### 7.1 Objet Contact

| Champ HubSpot (propriété) | Source | Type | Note |
|---|---|---|---|
| `firstname` | `Lead.firstName` | standard | |
| `lastname` | `Lead.lastName` | standard | |
| `email` | `Lead.email` | standard | requis par HubSpot pour dédoublonnage si présent |
| `phone` | `Lead.phone` | standard | identifiant de recherche principal (upsert par téléphone) |
| `company` | `Lead.company` | standard | |
| `lifecyclestage` | dérivé de `conversationStage` | standard | mapping ci-dessous |
| `ict_customer_type` | `Lead.customerType` | **custom** | à créer dans HubSpot |
| `ict_qualification_score` | `Lead.qualificationScore` | **custom** (number) | à créer |
| `ict_lead_status` | `Lead.leadStatus` | **custom** | à créer |
| `ict_source_campaign` | `Lead.campaign` | **custom** | à créer |
| `hs_lead_source` | `Lead.source` | standard (ou custom selon compte) | |

**Mapping `conversationStage` → `lifecyclestage` HubSpot :**

| conversationStage | lifecyclestage HubSpot |
|---|---|
| NEW_CONTACT, DISCOVERY | `lead` |
| QUALIFICATION, RECOMMENDATION | `marketingqualifiedlead` |
| OBJECTION_HANDLING, CONVERSION | `salesqualifiedlead` |
| CUSTOMER | `customer` |

### 7.2 Objet Deal (créé uniquement si `qualificationScore >= 61` ou `nextStep` = "Paiement"/"Conseiller humain")

| Champ HubSpot | Source |
|---|---|
| `dealname` | `Prospect {firstName} {lastName} - {recommendedOffer}` |
| `amount` | `null` au départ (à compléter par l'agent humain) |
| `dealstage` | mapping selon `nextStep` (`appointmentscheduled`, `qualifiedtobuy`, etc. — à aligner avec le pipeline réel du compte HubSpot) |
| `pipeline` | pipeline "Ventes ICT" (ID à récupérer via l'API HubSpot du compte) |
| Association | lié au contact via `associations` API |

### 7.3 Stratégie de synchronisation

- **Upsert par téléphone** : rechercher le contact via `phone` (search API) avant de créer, pour éviter les doublons.
- **Asynchrone via queue** (`hubspot-sync`) : ne jamais bloquer la réponse WhatsApp en attendant HubSpot.
- **Gestion d'échec** : si l'appel HubSpot échoue, stocker `hubspotSyncStatus = "failed"` + `hubspotLastError`, et retry via BullMQ (backoff exponentiel, 5 tentatives max), avec alerte si échec définitif.

---

## 8. Frontend — pages du dashboard

### 8.1 Page "Vue d'ensemble" (`/`)
- Cartes de synthèse : nombre de leads par statut (froid/tiède/qualifié/chaud), messages reçus aujourd'hui, taux de conversion (30 derniers jours).
- Graphique en entonnoir des `conversationStage` (Recharts).
- Liste des 5 dernières alertes "lead chaud" nécessitant un humain.

### 8.2 Page "Conversations" (`/conversations`)
- Layout deux colonnes façon messagerie : liste des conversations à gauche (triée par activité récente, badge de statut coloré), fil de discussion à droite.
- Mise à jour en temps réel via Socket.IO (nouveau message = remonte en haut de liste + badge "non lu").
- Champ de réponse manuelle en bas : un agent humain peut prendre la main sur une conversation (bascule "IA active / Agent humain actif" par lead, pour éviter que l'IA et l'humain répondent en même temps).

### 8.3 Page "Leads" (`/leads`)
- Tableau filtrable/triable : nom, téléphone, source, score, statut, prochaine étape, agent assigné.
- Filtres : statut, étape de conversation, source, plage de dates.
- Clic sur une ligne → panneau latéral avec détail complet + bouton "Resynchroniser HubSpot" + lien direct vers la fiche HubSpot (si `hubspotContactId` existe).

### 8.4 Page "Détail Lead" (`/leads/:id`)
- Toutes les données extraites par l'IA (besoin, budget, date souhaitée, objections, etc.).
- Historique complet de la conversation.
- Boutons d'action : changer le statut manuellement, réassigner à un autre agent, forcer le passage à l'étape suivante.

### 8.5 Page "Paramètres" (`/settings`) — admin uniquement
- Gestion des utilisateurs (agents).
- Visualisation (lecture seule) du prompt système actif et de sa version.
- Statut de connexion Evolution API et HubSpot (health check visuel).

---

## 9. Sécurité et rôles

| Rôle | Permissions |
|---|---|
| **admin** | Accès total : gestion utilisateurs, paramètres, tous les leads, resync HubSpot |
| **agent** | Accès aux leads qui lui sont assignés + leads non assignés, peut répondre manuellement, ne peut pas gérer les utilisateurs |

**Règles techniques :**
- Toutes les routes `/api/*` (sauf `/api/auth/login` et `/webhooks/whatsapp`) exigent un JWT valide.
- Le webhook Evolution API est protégé par un secret partagé (`X-Webhook-Secret`), **jamais** exposé côté frontend.
- Les clés API (Anthropic/OpenAI, HubSpot, Evolution API) restent strictement côté backend, jamais dans le bundle frontend.
- Rate limiting sur `/webhooks/whatsapp` et `/api/auth/login` (`@fastify/rate-limit`).
- Logs d'audit (`AuditLog`) pour toute action sensible : changement de statut manuel, message envoyé manuellement, resync forcée.

---

## 10. Variables d'environnement (`.env.example`)

```
# Backend
DATABASE_URL=postgresql://user:pass@postgres:5432/ict_whatsapp
REDIS_URL=redis://redis:6379
JWT_SECRET=

# IA
ANTHROPIC_API_KEY=
# ou OPENAI_API_KEY=

# Evolution API
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE_NAME=ict-main
EVOLUTION_WEBHOOK_SECRET=

# HubSpot
HUBSPOT_ACCESS_TOKEN=
HUBSPOT_PIPELINE_ID=

# Frontend
VITE_API_URL=https://api.tondomaine.com
VITE_SOCKET_URL=https://api.tondomaine.com
```

---

## 11. Critères d'acceptation par module

| Module | Critère de "fini" |
|---|---|
| Webhook WhatsApp | Un message envoyé au numéro déclenche bien une entrée en base, sans doublon même si Evolution API renvoie l'événement deux fois |
| Agent IA | La réponse générée respecte le schéma Zod à 100% (validation stricte, retry si parsing échoue) |
| Scoring | Les résultats du calcul correspondent exactement à la logique n8n d'origine sur un jeu de 10 cas de test |
| HubSpot sync | Un lead qualifié (score ≥ 61) apparaît dans HubSpot avec les bons champs sous 30 secondes ; un échec réseau déclenche un retry automatique |
| Dashboard temps réel | Un nouveau message WhatsApp apparaît dans l'interface sans rechargement de page, en moins de 2 secondes |
| Auth | Un agent ne peut pas accéder aux routes admin (`/settings`, gestion utilisateurs) ; testé via un test d'intégration |
| Reprise après panne | Si le backend redémarre, aucun message en cours de traitement n'est perdu (jobs BullMQ persistés dans Redis) |

---

## 12. Roadmap de développement suggérée

1. **Semaine 1** : setup monorepo, Docker Compose (Postgres, Redis, Evolution API), schéma Prisma, auth basique.
2. **Semaine 2** : module WhatsApp (webhook + envoi) + anti-doublon + queue BullMQ.
3. **Semaine 3** : agent IA (prompt + structured output) + calcul de score + tests unitaires (section 11).
4. **Semaine 4** : intégration HubSpot (contacts + deals) + gestion des échecs/retry.
5. **Semaine 5** : dashboard frontend (vue d'ensemble, conversations temps réel, leads, détail lead).
6. **Semaine 6** : durcissement (rate limiting, audit log, Sentry, tests de charge), déploiement VPS + CI/CD.

---

## 13. Points de vigilance

- **Risque de ban WhatsApp** : Evolution API n'est pas officielle. Prévoir un plan B (migration vers un BSP officiel comme 360dialog/Twilio) si le volume grossit ou si le numéro devient critique pour le chiffre d'affaires.
- **Sauvegardes** : backups automatiques PostgreSQL quotidiens (les conversations et scores sont la valeur du produit).
- **Sécurité** : ne jamais logger le contenu complet des messages en clair dans un service tiers externe sans consentement (RGPD/vie privée des prospects).
- **Le prompt IA est un actif métier** : versionner ses modifications (section 6) séparément du code applicatif pour pouvoir l'ajuster sans redéploiement complet à terme.
