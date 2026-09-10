import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Send,
  Bot,
  UserCheck,
  Flame,
  Phone,
  Calendar,
  Users,
  Briefcase,
  ExternalLink,
  RotateCw,
  Clock,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth-context';

export const Conversations: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [manualText, setManualText] = useState('');
  const [sending, setSending] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Liste des conversations
  const { data: conversations, isLoading: loadingConvs } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await api.get('/api/conversations');
      return res.data;
    },
    refetchInterval: 10000,
  });

  // Sélectionner la première conversation par défaut
  useEffect(() => {
    if (conversations && conversations.length > 0 && !selectedLeadId) {
      setSelectedLeadId(conversations[0].id);
    }
  }, [conversations, selectedLeadId]);

  // 2. Détail de la conversation sélectionnée (avec messages)
  const { data: currentLead, isLoading: loadingLead } = useQuery({
    queryKey: ['lead', selectedLeadId],
    queryFn: async () => {
      if (!selectedLeadId) return null;
      const res = await api.get(`/api/leads/${selectedLeadId}`);
      return res.data;
    },
    enabled: Boolean(selectedLeadId),
  });

  // Auto scroll vers le bas des messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentLead?.messages]);

  // 3. Socket.IO temps réel
  useEffect(() => {
    const socket = getSocket();

    const handleNewMessage = (payload: any) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (selectedLeadId && payload.message?.leadId === selectedLeadId) {
        queryClient.invalidateQueries({ queryKey: ['lead', selectedLeadId] });
      }
    };

    const handleLeadUpdated = (updatedLead: any) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (selectedLeadId && updatedLead.id === selectedLeadId) {
        queryClient.invalidateQueries({ queryKey: ['lead', selectedLeadId] });
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('lead:updated', handleLeadUpdated);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('lead:updated', handleLeadUpdated);
    };
  }, [queryClient, selectedLeadId]);

  // Envoi d'un message manuel par l'agent
  const handleSendManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim() || !selectedLeadId || sending) return;

    setSending(true);
    try {
      await api.post(`/api/leads/${selectedLeadId}/messages`, {
        content: manualText.trim(),
      });
      setManualText('');
      queryClient.invalidateQueries({ queryKey: ['lead', selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      console.error("Erreur lors de l'envoi manuel:", err);
    } finally {
      setSending(false);
    }
  };

  // Basculer mode IA / Prise de main humaine
  const toggleAiMode = async () => {
    if (!currentLead) return;
    const newAiDisabled = !currentLead.aiDisabled;
    try {
      await api.patch(`/api/leads/${currentLead.id}`, {
        aiDisabled: newAiDisabled,
        assignedAgentId: newAiDisabled ? user?.id : currentLead.assignedAgentId,
      });
      queryClient.invalidateQueries({ queryKey: ['lead', currentLead.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      console.error('Erreur bascule IA:', err);
    }
  };

  // Forcer resync HubSpot
  const handleResyncHubspot = async () => {
    if (!currentLead) return;
    try {
      await api.post(`/api/leads/${currentLead.id}/resync-hubspot`);
      queryClient.invalidateQueries({ queryKey: ['lead', currentLead.id] });
    } catch (err) {
      console.error('Erreur sync HubSpot:', err);
    }
  };

  const filteredConversations = (conversations || []).filter((c: any) => {
    const q = search.toLowerCase();
    const name = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
    return name.includes(q) || c.phone.includes(q) || (c.company || '').toLowerCase().includes(q);
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Opportunite chaude':
        return <span className="text-[10px] bg-rose-500/20 text-rose-300 font-bold px-2 py-0.5 rounded-full border border-rose-500/30">Chaud</span>;
      case 'Prospect qualifie':
        return <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">Qualifié</span>;
      case 'Prospect tiede':
        return <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">Tiède</span>;
      default:
        return <span className="text-[10px] bg-slate-500/20 text-slate-400 font-medium px-2 py-0.5 rounded-full">Froid</span>;
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#0b141a]">
      {/* Colonne gauche : Liste des conversations */}
      <div className="w-80 md:w-96 border-r border-slate-800 bg-[#111b21] flex flex-col">
        {/* Barre de recherche */}
        <div className="p-3.5 border-b border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher nom, téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Liste défilante des contacts */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {loadingConvs ? (
            <div className="p-8 text-center text-xs text-slate-500">Chargement des échanges...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Aucune conversation trouvée</div>
          ) : (
            filteredConversations.map((c: any) => {
              const isSelected = c.id === selectedLeadId;
              const lastMsg = c.messages?.[0];
              const displayName = c.firstName ? `${c.firstName} ${c.lastName || ''}` : c.phone;

              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedLeadId(c.id)}
                  className={`w-full text-left p-3.5 transition-all flex items-start space-x-3 ${
                    isSelected
                      ? 'bg-slate-800/80 border-l-4 border-emerald-500'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-slate-200 text-sm border border-slate-700">
                      {displayName.substring(0, 2).toUpperCase()}
                    </div>
                    {c.isB2B && (
                      <span className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 font-black text-[9px] px-1 rounded-full">
                        B2B
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-white truncate">{displayName}</p>
                      <span className="text-[10px] text-slate-500">
                        {lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[11px] text-slate-400 truncate max-w-[180px]">
                        {lastMsg ? lastMsg.content : 'Pas encore de message'}
                      </p>
                      {getStatusBadge(c.leadStatus)}
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-slate-400 font-medium">
                        Score: <strong className="text-emerald-400">{c.qualificationScore}</strong>/100
                      </span>
                      {c.aiDisabled ? (
                        <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded font-semibold">
                          Humain actif
                        </span>
                      ) : (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1">
                          <Bot className="w-2.5 h-2.5" /> IA active
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Colonne centrale : Fil de discussion */}
      <div className="flex-1 flex flex-col bg-[#0b141a] chat-pattern relative">
        {currentLead ? (
          <>
            {/* Header de la conversation */}
            <div className="h-16 bg-[#111b21] border-b border-slate-800 px-6 flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm">
                  {(currentLead.firstName || currentLead.phone).substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white">
                      {currentLead.firstName ? `${currentLead.firstName} ${currentLead.lastName || ''}` : currentLead.phone}
                    </h2>
                    {currentLead.company && (
                      <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                        {currentLead.company}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">{currentLead.phone} • {currentLead.source}</p>
                </div>
              </div>

              {/* Commutateur de prise de contrôle IA / Humain (Section 8.2) */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={toggleAiMode}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    currentLead.aiDisabled
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  }`}
                  title="Activer ou désactiver la réponse automatique de l'IA"
                >
                  {currentLead.aiDisabled ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>Mode Conseiller Humain (IA en pause)</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Mode IA Actif (Réponse auto)</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowDetailPanel(!showDetailPanel)}
                  className={`p-2 rounded-xl text-xs font-semibold border transition-all ${
                    showDetailPanel ? 'bg-slate-800 text-emerald-400 border-slate-700' : 'text-slate-400 border-transparent hover:bg-slate-800'
                  }`}
                  title="Afficher/Masquer le panneau d'informations lead"
                >
                  <ChevronRight className={`w-4 h-4 transition-transform ${showDetailPanel ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Corps des messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingLead ? (
                <div className="text-center text-xs text-slate-500 py-12">Chargement de la conversation...</div>
              ) : currentLead.messages?.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-12">Aucun message échangé pour l'instant.</div>
              ) : (
                currentLead.messages?.map((m: any) => {
                  const isInbound = m.direction === 'inbound';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-md md:max-w-lg rounded-2xl px-4 py-3 shadow-md ${
                          isInbound
                            ? 'bg-[#202c33] text-slate-100 rounded-tl-none border border-slate-700/50'
                            : 'bg-[#005c4b] text-white rounded-tr-none border border-emerald-600/30'
                        }`}
                      >
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        <div className="flex items-center justify-between gap-3 mt-2 pt-1 border-t border-white/10">
                          <span className="text-[10px] text-white/60">
                            {isInbound
                              ? 'Prospect'
                              : m.sentByAgentId
                              ? 'Conseiller Humain'
                              : 'Agent IA ICT'}
                          </span>
                          <span className="text-[10px] text-white/50">
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Champ de réponse manuelle en bas */}
            <div className="p-4 bg-[#111b21] border-t border-slate-800">
              {currentLead.aiDisabled && (
                <div className="mb-2 text-[11px] text-amber-300/90 flex items-center gap-1.5 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Vous avez la main sur cette conversation. L'IA ne répondra pas automatiquement.</span>
                </div>
              )}
              <form onSubmit={handleSendManual} className="flex items-center space-x-3">
                <input
                  type="text"
                  placeholder="Écrivez votre message WhatsApp (envoi direct au prospect)..."
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!manualText.trim() || sending}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-3 rounded-xl flex items-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 text-xs"
                >
                  <Send className="w-4 h-4" />
                  <span>Envoyer</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs">
            Sélectionnez une conversation pour commencer
          </div>
        )}
      </div>

      {/* Volet latéral escamotable : Profil Lead & Scoring */}
      {showDetailPanel && currentLead && (
        <div className="w-80 border-l border-slate-800 bg-[#111b21] flex flex-col overflow-y-auto p-5 space-y-6">
          {/* Header Lead */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Fiche Qualification IA
            </span>
            <h3 className="text-base font-extrabold text-white mt-1">
              {currentLead.firstName ? `${currentLead.firstName} ${currentLead.lastName || ''}` : currentLead.phone}
            </h3>
            <p className="text-xs text-slate-400">{currentLead.customerType || 'Particulier'}</p>
          </div>

          {/* Jauge de score */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-300 font-semibold">Score de qualification</span>
              <span className="text-sm font-black text-emerald-400">{currentLead.qualificationScore}/100</span>
            </div>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(currentLead.qualificationScore, 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between items-center mt-3 text-[11px]">
              <span className="text-slate-400">Statut :</span>
              {getStatusBadge(currentLead.leadStatus)}
            </div>
            <div className="flex justify-between items-center mt-1.5 text-[11px]">
              <span className="text-slate-400">Étape suivante :</span>
              <span className="font-bold text-amber-300">{currentLead.nextStep || 'Nurturing'}</span>
            </div>
          </div>

          {/* Données extraites par l'IA */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Données extraites</h4>

            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-500 block">Date souhaitée</span>
                  <span className="text-slate-200">{currentLead.preferredDate || 'Non spécifiée'}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Users className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-500 block">Nombre de participants</span>
                  <span className="text-slate-200">{currentLead.participantsCount ? `${currentLead.participantsCount} pers.` : 'Inconnu'}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Briefcase className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-500 block">Offre recommandée</span>
                  <span className="text-slate-200">{currentLead.recommendedOffer || 'En cours de découverte'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Statut HubSpot */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">Synchronisation HubSpot</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  currentLead.hubspotSyncStatus === 'synced'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : currentLead.hubspotSyncStatus === 'failed'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {currentLead.hubspotSyncStatus}
              </span>
            </div>

            {currentLead.hubspotContactId && (
              <p className="text-[11px] text-slate-400">
                Contact ID: <span className="font-mono text-slate-300">{currentLead.hubspotContactId}</span>
              </p>
            )}

            <button
              onClick={handleResyncHubspot}
              className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 rounded-xl transition-colors border border-slate-700"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Forcer synchro HubSpot</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
