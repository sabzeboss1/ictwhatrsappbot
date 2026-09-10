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

## Étape 5 : Configurer le Serveur Web (Apache ou Nginx) pour `bot.bossseo.net`

### Option A : Serveur VPS sous Apache (Recommandé pour votre VPS WordPress)

1. Activez les modules Apache nécessaires pour le reverse-proxy, WebSockets et SSL :
```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
```

2. Créez la configuration du VirtualHost :
```bash
sudo nano /etc/apache2/sites-available/bot.bossseo.net.conf
```

Collez la configuration suivante (ou copiez celle fournie dans le fichier `apache-vps-wordpress.conf.example`) :

```apache
<VirtualHost *:80>
    ServerName bot.bossseo.net
    ServerAdmin admin@insidecameroontourism.com

    ProxyPreserveHost On
    ProxyRequests Off

    # 1. Gestion des WebSockets temps réel (Socket.IO)
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/socket.io/(.*) ws://127.0.0.1:3001/socket.io/$1 [P,L]

    # 2. Redirection des routes API Backend
    ProxyPass /api/ http://127.0.0.1:3001/api/
    ProxyPassReverse /api/ http://127.0.0.1:3001/api/

    # 3. Redirection des Webhooks WhatsApp Evolution API
    ProxyPass /webhooks/ http://127.0.0.1:3001/webhooks/
    ProxyPassReverse /webhooks/ http://127.0.0.1:3001/webhooks/

    # 4. Redirection Socket.IO polling
    ProxyPass /socket.io/ http://127.0.0.1:3001/socket.io/
    ProxyPassReverse /socket.io/ http://127.0.0.1:3001/socket.io/

    # 5. Redirection de l'interface Frontend (Dashboard React)
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    ErrorLog ${APACHE_LOG_DIR}/bot.bossseo.net_error.log
    CustomLog ${APACHE_LOG_DIR}/bot.bossseo.net_access.log combined
</VirtualHost>
```

3. Activez le site et rechargez Apache :
```bash
sudo a2ensite bot.bossseo.net.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

---

### Option B : Serveur VPS sous Nginx (Alternative)
<details>
<summary>Cliquez pour voir la configuration Nginx si vous préférez Nginx</summary>

```nginx
server {
    listen 80;
    server_name bot.bossseo.net;

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

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /webhooks/ {
        proxy_pass http://127.0.0.1:3001/webhooks/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

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
</details>

---

## Étape 6 : Générer le Certificat SSL HTTPS Gratuit (Certbot)

Pour **Apache** :
```bash
sudo certbot --apache -d bot.bossseo.net
```
*(Pour Nginx, utilisez `sudo certbot --nginx -d bot.bossseo.net`)*.  
Certbot va configurer automatiquement la redirection HTTPS et le renouvellement automatique.

---

## Étape 7 : Connecter WhatsApp directement depuis le Dashboard (1 Clic)

Plus besoin de lancer de commandes curl complexes dans le terminal !

1. Connectez-vous à votre tableau de bord sur **`https://bot.bossseo.net/login`** avec :
   * **Email :** `admin@ict.cm`
   * **Mot de passe :** `Admin123!`
2. En haut à droite ou dans l'onglet **Paramètres**, cliquez sur le bouton **« Lier WhatsApp (QR) »**.
3. Cliquez sur **« Générer le QR Code »** :
   * Le système configure automatiquement l'instance et le Webhook entrant vers `https://bot.bossseo.net/webhooks/whatsapp`.
   * Le QR Code s'affiche directement sur votre écran.
4. Ouvrez WhatsApp sur votre smartphone :
   * **Paramètres** ➔ **Appareils connectés** ➔ **Connecter un appareil**.
   * Scannez le QR Code affiché.
5. Le badge passe immédiatement à **🟢 WhatsApp Connecté** !

---

## ⚡ Comment mettre à jour en production sans recommencer le déploiement ?

Lorsque vous modifiez du code (frontend, backend, design, etc.), **vous ne devez PAS recommencer le déploiement à zéro**. La base de données PostgreSQL, vos prospects et votre session WhatsApp restent intacts !

Il vous suffit de faire :

### 1. Sur votre machine locale :
```bash
git add .
git commit -m "Mise à jour de l'application"
git push origin main
```

### 2. Sur votre VPS (dans le dossier de l'application) :
```bash
cd /var/www/ict-bot
git pull origin main
docker compose up -d --build frontend backend
```

En moins de 60 secondes, Docker recompile uniquement les conteneurs modifiés et redémarre l'application à chaud sans coupure de base de données.
