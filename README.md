# ICT WhatsApp AI — Plateforme de Qualification Commerciale (v2)

Bienvenue sur le référentiel officiel du bot de qualification commerciale WhatsApp et du tableau de bord de gestion pour **Inside Cameroon Tourism (ICT)**.

Ce projet remplace intégralement l'ancien workflow n8n (`ict_workflow_v2`) par une architecture 100% JavaScript / TypeScript robuste, sans dépendance à n8n ni à Meta Business Manager direct.

---

## 1. Architecture Générale

```
Prospect WhatsApp
      │
      ▼
Evolution API (Baileys / WhatsApp Web API)
      │  webhook message entrant (POST /webhooks/whatsapp)
      ▼
Backend Fastify (TypeScript) ──────► Agent IA (OpenAI / Anthropic SDK)
      │        │                              │
      │        ▼                              ▼
      │   Prisma ORM                  Structured Output (Zod)
      │   (PostgreSQL / SQLite)       (Score, stage, intention, participants...)
      │        │
      │        ▼
      │   BullMQ + Redis (File d'attente, anti-doublon, retry)
      │
      ├──► Evolution API (Envoi de la réponse commerciale)
      ├──► HubSpot CRM (Création / mise à jour du contact + deal)
      │
      ▼
Frontend React 19 (Dashboard temps réel Socket.IO, prise de main humaine, analytics)
```

---

## 2. Structure du Monorepo

```
c:/laragon/www/botwhatsa/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── config/              # Validation des variables d'environnement (Zod)
│   │   │   ├── plugins/             # Prisma DB, Socket.IO, Auth JWT (jose)
│   │   │   ├── prisma/              # Schémas Prisma (PostgreSQL & SQLite dev)
│   │   │   ├── modules/
│   │   │   │   ├── agent/           # Prompts versionnés, appels OpenAI/Anthropic
│   │   │   │   ├── scoring/         # Moteur de calcul du score & routage (port n8n)
│   │   │   │   ├── whatsapp/        # Webhook Evolution API, anti-doublon, envoi
│   │   │   │   ├── hubspot/         # Synchro contacts/deals, mapping étapes
│   │   │   │   ├── leads/           # CRUD Leads, messages, prise de contrôle
│   │   │   │   ├── conversations/   # Vue fil de discussion temps réel
│   │   │   │   ├── stats/           # Métriques KPIs & entonnoir de conversion
│   │   │   │   ├── auth/            # Inscription/connexion, gestion utilisateurs
│   │   │   │   └── settings/        # Diagnostic santé APIs & visualiseur prompt
│   │   │   ├── queues/              # BullMQ + Redis avec fallback mémoire dev
│   │   │   └── server.ts            # Point d'entrée Fastify
│   │   ├── tests/                   # 10 tests unitaires Vitest conformes à la spec
│   │   └── package.json
│   │
│   └── frontend/
│       ├── src/
│       │   ├── pages/               # Vue d'ensemble, Conversations, Leads, Détail, Paramètres, Simulateur
│       │   ├── components/          # Layout, badges, cards, navigation
│       │   ├── lib/                 # Client Axios avec token, client Socket.IO, AuthContext
│       │   └── main.tsx
│       └── package.json
│
├── docker-compose.yml               # Backend, Frontend, Postgres, Redis, Evolution API, Caddy
├── .env.example
└── README.md
```

---

## 3. Prérequis et Installation

### Prérequis
- **Node.js 22 LTS** ou supérieur
- **npm** v10+ ou **pnpm**
- Optionnel : **Docker & Docker Compose** (pour le déploiement conteneurisé)

### Installation des dépendances

```bash
# Dans le dossier apps/backend
cd apps/backend
npm install

# Dans le dossier apps/frontend
cd ../frontend
npm install
```

### Configuration de l'environnement

1. Copiez le fichier `.env.example` dans `apps/backend/.env` :
```bash
cp .env.example apps/backend/.env
```

2. Renseignez vos clés d'API dans `apps/backend/.env` :
- `OPENAI_API_KEY` ou `ANTHROPIC_API_KEY` (si aucune clé n'est fournie, l'agent bascule automatiquement sur son simulateur heuristique intégré pour les tests locaux).
- `EVOLUTION_API_URL` et `EVOLUTION_API_KEY` pour WhatsApp.
- `HUBSPOT_ACCESS_TOKEN` et `HUBSPOT_PIPELINE_ID` pour le CRM HubSpot.

---

## 4. Démarrage de l'Application

### Initialiser la base de données et les données de test

```bash
cd apps/backend
# Générer le client Prisma et initialiser les tables
npx prisma generate
npx prisma db push

# Insérer les utilisateurs et leads de démonstration
npm run prisma:seed
```

### Comptes pré-configurés pour la connexion
- **Administrateur** : `admin@ict.cm` / `Admin123!`
- **Conseillère commerciale** : `agent@ict.cm` / `Agent123!`

### Lancer le Backend
```bash
cd apps/backend
npm run dev
# Le serveur démarre sur http://localhost:3001
```

### Lancer le Frontend
```bash
cd apps/frontend
npm run dev
# Le tableau de bord est accessible sur http://localhost:3000
```

---

## 5. Fonctionnalités Clés

### 1. Qualification Commerciale par IA & Machine à États
- Machine à 7 états : `NEW_CONTACT → DISCOVERY → QUALIFICATION → RECOMMENDATION → OBJECTION_HANDLING → CONVERSION → CUSTOMER`.
- Sortie JSON structurée garantie par schéma Zod (`LeadQualificationOutputSchema`).
- Prompt système officiel ICT versionné dans `apps/backend/src/modules/agent/prompts/lead-qualification.ts`.

### 2. Moteur de Scoring et Routage Dynamique
- Calcul du score sur 100 points basé sur le type de prospect (B2B, Famille, Couple...), le nombre de participants, les dates, l'intention d'achat et le niveau d'interaction.
- Routage automatique :
  - **Score ≥ 80, B2B, VIP ou Demande sur-mesure** ➔ **Conseiller humain** (alerte en direct dans le dashboard).
  - **Produit standard & Disponibilité confirmée** ➔ **Paiement**.
  - **Produit identifié & Score ≥ 61** ➔ **Landing Page**.
  - **Score ≥ 31** ➔ **Continuer qualification**.
  - **Score ≤ 30** ➔ **Nurturing**.

### 3. Prise de Contrôle Humaine ("Human Takeover")
- Un conseiller commercial peut à tout moment désactiver la réponse automatique de l'IA pour un prospect via le bouton de bascule ou en envoyant un message direct depuis l'interface.
- Empêche tout conflit où l'IA et l'agent répondraient simultanément.

### 4. Synchronisation HubSpot CRM
- Upsert automatique des contacts par numéro de téléphone.
- Création conditionnelle d'une Opportunité (Deal) lorsque `qualificationScore >= 61` ou si l'étape est `Paiement` / `Conseiller humain`.
- Suivi du statut de synchronisation (`pending`, `synced`, `failed`) avec retry exponentiel.

### 5. Simulateur Interactif WhatsApp Intégré (`/simulator`)
- Permet de tester l'ensemble de la chaîne de qualification sans dépendre d'un smartphone physique en injectant des messages webhook directement.

---

## 6. Lancement des Tests Automatisés

Le moteur de scoring comprend une suite de 10 cas de test vérifiant la conformité absolue avec le workflow n8n original :

```bash
cd apps/backend
npm run test
```

---

## 7. Déploiement en Production avec Docker

Pour lancer la totalité de la pile (Postgres 16, Redis 7, Evolution API, Backend, Frontend et Caddy SSL) :

```bash
docker compose up -d
```
