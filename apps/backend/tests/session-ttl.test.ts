import { describe, it, expect, vi, beforeEach } from 'vitest';
import { whatsAppService } from '../src/modules/whatsapp/whatsapp.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { env } from '../src/config/env.js';

describe('Session TTL & Anti-Blocking Context Reset', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should only return messages belonging to the current active session (excluding older expired session)', async () => {
    const leadId = 'test-lead-ttl-1';
    const now = Date.now();

    // Simuler un historique avec deux sessions :
    // Session 1 (il y a 3 jours / 4320 minutes) : messages 1 et 2
    // Session 2 (actuelle, il y a 5 et 2 minutes) : messages 3 et 4
    const mockMessages = [
      {
        id: 'msg-4',
        leadId,
        direction: 'outbound',
        content: 'Super, nous avons une formule week-end à Kribi !',
        messageType: 'text',
        whatsappMessageId: 'wamid-4',
        sentByAgentId: null,
        createdAt: new Date(now - 2 * 60 * 1000), // 2 min ago
      },
      {
        id: 'msg-3',
        leadId,
        direction: 'inbound',
        content: 'Bonjour, je voudrais des informations pour Kribi',
        messageType: 'text',
        whatsappMessageId: 'wamid-3',
        sentByAgentId: null,
        createdAt: new Date(now - 5 * 60 * 1000), // 5 min ago
      },
      // GAP de 3 jours (> 120 minutes TTL)
      {
        id: 'msg-2',
        leadId,
        direction: 'outbound',
        content: "L'Île Eding est un lieu magnifique...",
        messageType: 'text',
        whatsappMessageId: 'wamid-2',
        sentByAgentId: null,
        createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000), // 3 jours ago
      },
      {
        id: 'msg-1',
        leadId,
        direction: 'inbound',
        content: "Parlez-moi de l'Île Eding s'il vous plaît",
        messageType: 'text',
        whatsappMessageId: 'wamid-1',
        sentByAgentId: null,
        createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000 - 60000), // 3 jours ago
      },
    ];

    vi.spyOn(prisma.message, 'findMany').mockResolvedValueOnce(mockMessages as any);

    // Récupérer les messages pour la session active
    const activeHistory = await whatsAppService.getActiveSessionMessages(leadId);

    // Doit contenir uniquement les messages de la session récente (msg-3 et msg-4)
    expect(activeHistory).toHaveLength(2);
    expect(activeHistory[0].content).toBe('Bonjour, je voudrais des informations pour Kribi');
    expect(activeHistory[0].role).toBe('user');
    expect(activeHistory[1].content).toBe('Super, nous avons une formule week-end à Kribi !');
    expect(activeHistory[1].role).toBe('assistant');

    // Les anciens messages sur l'Île Eding doivent être totalement exclus
    const hasOldIslandContent = activeHistory.some((m) => m.content.includes('Eding'));
    expect(hasOldIslandContent).toBe(false);
  });

  it('should exclude the current inbound message if already persisted in database', async () => {
    const leadId = 'test-lead-ttl-2';
    const now = Date.now();
    const inboundText = 'Combien coûte le séjour ?';

    const mockMessages = [
      {
        id: 'msg-new',
        leadId,
        direction: 'inbound',
        content: inboundText,
        messageType: 'text',
        whatsappMessageId: 'wamid-new',
        sentByAgentId: null,
        createdAt: new Date(now),
      },
      {
        id: 'msg-prev',
        leadId,
        direction: 'outbound',
        content: 'Voici nos tarifs.',
        messageType: 'text',
        whatsappMessageId: 'wamid-prev',
        sentByAgentId: null,
        createdAt: new Date(now - 60000),
      },
    ];

    vi.spyOn(prisma.message, 'findMany').mockResolvedValueOnce(mockMessages as any);

    const activeHistory = await whatsAppService.getActiveSessionMessages(leadId, inboundText);

    // Le message actuel ne doit pas être dupliqué dans l'historique
    expect(activeHistory).toHaveLength(1);
    expect(activeHistory[0].content).toBe('Voici nos tarifs.');
  });
});
