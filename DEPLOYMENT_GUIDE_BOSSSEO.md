# Guide de Déploiement en Production — ICT WhatsApp AI
**Sous-domaine cible :** `bot.bossseo.net`  
**Environnement :** Serveur VPS Linux avec WordPress existant (Nginx / Apache)

---

## Vue d'ensemble de l'Architecture sur le VPS

Votre site WordPress existant continue d'occuper les ports 80 et 443 via le serveur web Nginx principal. Notre application tourne en conteneurs Docker sur des ports internes isolés, et Nginx achemine le trafic du sous-domaine `bot.bossseo.net` vers notre conteneur.

```
Internet / Prospects WhatsApp
            │
            ▼
   Nginx Principal du VPS (Port 80 / 443 SSL Let's Encrypt)
            │
     ┌──────┴──────────────────────────────────┐
     ▼                                         ▼
WordPress existant              bot.bossseo.net (Reverse Proxy)
(bossseo.net)                                  │
                                ┌──────────────┼──────────────┐
                                ▼              ▼              ▼
                          Frontend       Backend API     Webhooks
                          (Port 3000)    (Port 3001)     (Port 3001)
                                               │
                                               ├─► PostgreSQL 16 (Port 5432)
                                               ├─► Redis 7 (Port 6379)
                                               ├─► Evolution API (Port 8080)
                                               ├─► OpenAI / Claude API
                                               └─► HubSpot CRM API
```

---

## Étape 1 : Configuration DNS

Connectez-vous à votre gestionnaire de nom de domaine (Cloudflare, Namecheap, OVH, etc.) pour la zone DNS de `bossseo.net` :

* **Type :** `A`
* **Nom (Host) :** `bot` (ou `bot.bossseo.net`)
* **Valeur (IP) :** L'adresse IP publique de votre VPS
* **TTL :** Automatique ou 300 secondes

---

## Étape 2 : Cloner le Répertoire sur le Serveur VPS

Connectez-vous en SSH à votre serveur VPS :

```bash
ssh root@IP_DE_VOTRE_VPS
```

Clonez le projet dans votre répertoire de travail :

```bash
cd /var/www
git clone https://github.com/sabzeboss1/ictwhatrsappbot.git ict-bot
cd ict-bot
```

---

## Étape 3 : Configurer les Variables d'Environnement

Créez le fichier de configuration `.env` :

```bash
cp .env.example .env
nano .env
```

Renseignez les valeurs adaptées à `bot.bossseo.net` :

```ini
# --- Application Backend ---
PORT=3001
NODE_ENV=production
JWT_SECRET=ict_production_jwt_secret_change_me_998877

# --- Base de données PostgreSQL Docker ---
DATABASE_URL=postgresql://ict_user:ict_password@postgres:5432/ict_whatsapp?schema=public

# --- Redis ---
REDIS_URL=redis://redis:6379

# --- Intelligence Artificielle ---
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-votre-cle-openai-ici...
# ANTHROPIC_API_KEY=

# --- Evolution API (WhatsApp) ---
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=B6D711FCDE4D4FD5936544120E713976
EVOLUTION_INSTANCE_NAME=ict-main
EVOLUTION_WEBHOOK_SECRET=ict_evolution_secret_token_2026

# --- HubSpot CRM ---
HUBSPOT_ACCESS_TOKEN=pat-na1-votre-token-hubspot-ici...
HUBSPOT_PIPELINE_ID=default

# --- URLs Publiques Frontend ---
VITE_API_URL=https://bot.bossseo.net
VITE_SOCKET_URL=https://bot.bossseo.net
```

Sauvegardez avec `Ctrl + O` puis quittez avec `Ctrl + X`.

---

## Étape 4 : Lancer les Services Docker (Sans Conflit avec WordPress)

Puisque votre VPS exécute déjà WordPress avec Nginx ou Apache sur le port 80, nous ne lançons **PAS** le conteneur Caddy.

Lancez uniquement les 5 services applicatifs nécessaires :

```bash
docker compose up -d --build postgres redis evolution-api backend frontend
```

### Initialiser la base de données et le compte admin :
```bash
# Génération et migration des tables PostgreSQL
docker compose exec backend npx prisma db push --schema=prisma/schema.postgres.prisma

# Insertion du compte Admin et Agent ICT
docker compose exec backend npm run prisma:seed
```

---

## Étape 5 : Configurer Nginx pour le sous-domaine `bot.bossseo.net`

Créez le fichier de configuration Nginx pour `bot.bossseo.net` :

```bash
sudo nano /etc/nginx/sites-available/bot.bossseo.net.conf
```

Collez la configuration suivante :

```nginx
server {
    listen 80;
    server_name bot.bossseo.net;

    # 1. Interface Web (Frontend Dashboard React)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 2. API Backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 3. Webhook entrant Evolution API -> Backend
    location /webhooks/ {
        proxy_pass http://127.0.0.1:3001/webhooks/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 4. WebSockets temps réel (Socket.IO)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Activer le site dans Nginx :
```bash
sudo ln -s /etc/nginx/sites-available/bot.bossseo.net.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Étape 6 : Générer le Certificat SSL HTTPS Gratuit (Certbot)

Exécutez Certbot pour installer le certificat SSL Let's Encrypt :

```bash
sudo certbot --nginx -d bot.bossseo.net
```
*Répondez aux questions et choisissez la redirection automatique en HTTPS (option 2).*

---

## Étape 7 : Connecter votre Numéro WhatsApp (QR Code)

### 1. Créer l'instance WhatsApp `ict-main`
Depuis votre serveur VPS, exécutez la commande suivante :

```bash
curl -X POST "http://localhost:8080/instance/create" \
  -H "apikey: B6D711FCDE4D4FD5936544120E713976" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "ict-main",
    "token": "ict_instance_token_2026",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

### 2. Scanner le QR Code
Ouvrez votre navigateur sur :
```
http://IP_DE_VOTRE_VPS:8080/instance/connect/ict-main
```
1. Ouvrez WhatsApp sur votre smartphone.
2. Allez dans **Paramètres** ➔ **Appareils connectés** ➔ **Connecter un appareil**.
3. Scannez le QR Code affiché à l'écran.
4. Le statut passe à `CONNECTED`.

### 3. Configurer le Webhook vers votre domaine
Exécutez cette commande pour relier Evolution API à notre backend en production :

```bash
curl -X POST "http://localhost:8080/webhook/set/ict-main" \
  -H "apikey: B6D711FCDE4D4FD5936544120E713976" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://bot.bossseo.net/webhooks/whatsapp",
      "headers": {
        "X-Webhook-Secret": "ict_evolution_secret_token_2026"
      },
      "byEvents": false,
      "base64": false,
      "events": [
        "MESSAGES_UPSERT"
      ]
    }
  }'
```

---

## Étape 8 : Vérification et Accès

1. Accédez à votre tableau de bord commercial :
   👉 **`https://bot.bossseo.net`**
2. Connectez-vous avec :
   * **Email :** `admin@ict.cm`
   * **Mot de passe :** `Admin123!`
3. Envoyez un message depuis n'importe quel compte WhatsApp au numéro connecté :
   * L'IA répond en quelques secondes.
   * La conversation apparaît en temps réel dans l'onglet **Conversations**.
   * Le prospect est automatiquement créé et noté dans votre compte **HubSpot CRM**.
