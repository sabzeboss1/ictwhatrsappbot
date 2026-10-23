import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import { catalogService } from './catalog.service.js';
import { authenticate } from '../../plugins/auth.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { agentService } from '../agent/agent.service.js';

export async function catalogRoutes(fastify: FastifyInstance) {
  // 1. Routes publiques : Téléchargement et visualisation des catalogues PDF
  const serveCatalogPdf = async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
    const rawFilename = decodeURIComponent(request.params.filename);
    const safeFilename = path.basename(rawFilename);
    const filePath = path.join(catalogService.getCataloguesDir(), safeFilename);

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Catalogue introuvable' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = request.headers.range;

    // Nom de fichier encodé pour compatibilité universelle des navigateurs mobiles (RFC 5987)
    const encodedFilename = encodeURIComponent(safeFilename);
    const contentDisposition = `inline; filename="${safeFilename.replace(/"/g, '')}"; filename*=UTF-8''${encodedFilename}`;

    // Support des Range Requests HTTP 206 (Indispensable pour iOS Safari, Android Chrome et WhatsApp Webview)
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
        reply.header('Content-Range', `bytes */${fileSize}`);
        return reply.status(416).send('Requested range not satisfiable');
      }

      const fileBuffer = fs.readFileSync(filePath);
      const chunk = fileBuffer.subarray(start, end + 1);

      reply.status(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', chunk.length);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', contentDisposition);
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(chunk);
    }

    // Réponse complète HTTP 200 avec taille exacte et support des plages déclaré
    const fileBuffer = fs.readFileSync(filePath);
    reply.status(200);
    reply.header('Content-Length', fileBuffer.length);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', contentDisposition);
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send(fileBuffer);
  };

  fastify.get('/public/catalogues/:filename', serveCatalogPdf);
  fastify.get('/api/catalogues/download/:filename', serveCatalogPdf);

  // 2. Routes protégées : Dashboard, gestion et import par l'administrateur
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);

    // Liste de tous les catalogues disponibles
    protectedRoutes.get('/api/catalogues', async (request: FastifyRequest, reply: FastifyReply) => {
      const list = catalogService.listCatalogs();
      return reply.send(list);
    });

    // Import d'un nouveau catalogue PDF par l'administrateur
    protectedRoutes.post(
      '/api/catalogues/upload',
      async (
        request: FastifyRequest<{
          Body: {
            title: string;
            fileName?: string;
            fileBase64?: string;
            pdfBase64?: string;
            description?: string;
            triggerCondition?: string;
            caption?: string;
            category?: string;
            campaign?: string | null;
            campaignSlug?: string | null;
            isDefault?: boolean;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const body = request.body || ({} as any);
          console.log('[CatalogController] 📥 POST /api/catalogues/upload reçu :', {
            title: body.title,
            fileName: body.fileName,
            hasFileBase64: Boolean(body.fileBase64),
            hasPdfBase64: Boolean(body.pdfBase64),
          });

          const newItem = await catalogService.addUploadedCatalog(body);

          // Invalider le cache du prompt pour que l'IA intègre immédiatement le nouveau catalogue
          agentService.invalidatePromptCache();

          console.log(`✓ [CatalogController] Catalogue "${newItem.title}" créé avec succès (ID: ${newItem.id})`);
          return reply.status(201).send({
            success: true,
            message: `Catalogue "${newItem.title}" importé et activé avec succès !`,
            catalog: newItem,
          });
        } catch (err: any) {
          console.error('[CatalogController] ❌ Erreur upload catalogue :', err.message);
          return reply.status(400).send({ error: err.message || 'Erreur lors de l\'importation du catalogue' });
        }
      }
    );

    // Définir un catalogue comme document par défaut
    protectedRoutes.patch(
      '/api/catalogues/:id/default',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const updated = catalogService.setDefaultCatalog(request.params.id);
          agentService.invalidatePromptCache();
          return reply.send({ success: true, catalog: updated });
        } catch (err: any) {
          return reply.status(400).send({ error: err.message });
        }
      }
    );

    // Modifier les consignes ou métadonnées d'un catalogue
    protectedRoutes.patch(
      '/api/catalogues/:id',
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: {
            title?: string;
            description?: string;
            triggerCondition?: string;
            caption?: string;
            category?: string;
            campaign?: string | null;
            isDefault?: boolean;
          };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const updated = catalogService.updateCatalog(request.params.id, request.body || {});
          agentService.invalidatePromptCache();
          return reply.send({ success: true, catalog: updated });
        } catch (err: any) {
          return reply.status(400).send({ error: err.message });
        }
      }
    );

    // Supprimer un catalogue
    protectedRoutes.delete(
      '/api/catalogues/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          catalogService.deleteCatalog(request.params.id);
          agentService.invalidatePromptCache();
          return reply.send({ success: true, message: 'Catalogue supprimé avec succès.' });
        } catch (err: any) {
          return reply.status(400).send({ error: err.message });
        }
      }
    );

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
