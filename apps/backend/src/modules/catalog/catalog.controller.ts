import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import { catalogService } from './catalog.service.js';
import { authenticate } from '../../plugins/auth.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';

export async function catalogRoutes(fastify: FastifyInstance) {
  // 1. Routes publiques : Téléchargement et visualisation des catalogues PDF
  // Supporte à la fois /api/catalogues/download/:filename (acheminé via le proxy /api/)
  // et /public/catalogues/:filename (accès direct)
  const serveCatalogPdf = async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
    const safeFilename = path.basename(request.params.filename);
    const filePath = path.join(catalogService.getCataloguesDir(), safeFilename);

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Catalogue introuvable' });
    }

    const stream = fs.createReadStream(filePath);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="${safeFilename}"`);
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send(stream);
  };

  fastify.get('/public/catalogues/:filename', serveCatalogPdf);
  fastify.get('/api/catalogues/download/:filename', serveCatalogPdf);

  // 2. Routes protégées : Dashboard et gestion
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);

    // Liste des catalogues disponibles
    protectedRoutes.get('/api/catalogues', async (request: FastifyRequest, reply: FastifyReply) => {
      const list = catalogService.listCatalogs();
      return reply.send(list);
    });

    // Envoi manuel d'un catalogue PDF à un lead par un conseiller humain
    protectedRoutes.post(
      '/api/leads/:id/send-catalog',
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: { catalogId?: string; customCaption?: string };
        }>,
        reply: FastifyReply
      ) => {
        const { id: leadId } = request.params;
        const { catalogId, customCaption } = (request.body as any) || {};
        const agentId = request.user?.userId || 'agent-unknown';

        const result = await whatsAppService.sendManualCatalog(leadId, catalogId, customCaption, agentId);
        return reply.send(result);
      }
    );
  });
}
