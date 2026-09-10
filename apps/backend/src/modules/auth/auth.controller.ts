import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../plugins/prisma.js';
import { comparePassword, createToken, hashPassword, authenticate, requireRole } from '../../plugins/auth.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Connexion
  fastify.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = (request.body as any) || {};

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email et mot de passe requis' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Identifiants invalides' });
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({ error: 'Identifiants invalides' });
    }

    const token = await createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'admin' | 'agent',
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  // Profil connecté
  fastify.get('/api/auth/me', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'Utilisateur introuvable' });
    }

    return reply.send({ user });
  });

  // Gestion des agents/utilisateurs (Admin uniquement)
  fastify.register(async (adminRoutes) => {
    adminRoutes.addHook('preHandler', authenticate);
    adminRoutes.addHook('preHandler', requireRole(['admin']));

    adminRoutes.get('/api/users', async (request: FastifyRequest, reply: FastifyReply) => {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          _count: {
            select: { leads: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      return reply.send(users);
    });

    adminRoutes.post('/api/users', async (request: FastifyRequest, reply: FastifyReply) => {
      const { email, name, password, role } = (request.body as any) || {};

      if (!email || !name || !password) {
        return reply.status(400).send({ error: 'Email, nom et mot de passe requis' });
      }

      const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (existing) {
        return reply.status(409).send({ error: 'Un compte avec cet email existe déjà' });
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          name: name.trim(),
          passwordHash,
          role: role === 'admin' ? 'admin' : 'agent',
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      return reply.status(201).send(user);
    });
  });
}
