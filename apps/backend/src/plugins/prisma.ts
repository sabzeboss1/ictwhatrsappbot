import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export async function connectPrisma() {
  try {
    await prisma.$connect();
    console.log('✓ Connecté à la base de données via Prisma');
  } catch (err) {
    console.error('Erreur de connexion Prisma:', err);
  }
}
