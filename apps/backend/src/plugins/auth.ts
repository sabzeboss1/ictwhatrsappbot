import { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

const secretKey = new TextEncoder().encode(env.JWT_SECRET);

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'admin' | 'agent';
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export async function createToken(payload: TokenPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Non autorisé: Jeton manquant ou invalide' });
  }

  const token = authHeader.substring(7);
  const user = await verifyToken(token);
  if (!user) {
    return reply.status(401).send({ error: 'Non autorisé: Jeton expiré ou invalide' });
  }

  request.user = user;
}

export function requireRole(allowedRoles: ('admin' | 'agent')[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Accès interdit: permissions insuffisantes' });
    }
  };
}
