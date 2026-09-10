#!/bin/sh
set -e

echo "🔄 Synchronisation de la base PostgreSQL avec Prisma..."
npx prisma db push --skip-generate --accept-data-loss || true

echo "🚀 Démarrage du serveur ICT WhatsApp AI..."
exec node dist/server.js
