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
  ArrowLeft,
  Info,
  X,
  FileText,
  ChevronDown,
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
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [sendingCatalog, setSendingCatalog] = useState(false);
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false);

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

  // Liste des catalogues PDF disponibles
  const { data: catalogues } = useQuery({
    queryKey: ['catalogues'],
    queryFn: async () => {
      const res = await api.get('/api/catalogues');
      return res.data;
    },
  });

  // Sélectionner la première conversation par défaut sur desktop
  useEffect(() => {
    if (conversations && conversations.length > 0 && !selectedLeadId && window.innerWidth >= 768) {
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

  // Envoi manuel d'un catalogue PDF officiel
  const handleSendCatalog = async (catalogId?: string) => {
    if (!selectedLeadId || sendingCatalog) return;
    setSendingCatalog(true);
    setShowCatalogDropdown(false);
    try {
      await api.post(`/api/leads/${selectedLeadId}/send-catalog`, { catalogId });
      queryClient.invalidateQueries({ queryKey: ['lead', selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      console.error("Erreur lors de l'envoi du catalogue:", err);
    } finally {
      setSendingCatalog(false);
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

  // Réinitialiser la qualification du lead
  const handleResetLead = async () => {
    if (!currentLead) return;
    if (!confirm('Voulez-vous réinitialiser la qualification de ce prospect pour recommencer le test ?')) return;
    try {
      await api.post(`/api/leads/${currentLead.id}/reset`);
      queryClient.invalidateQueries({ queryKey: ['lead', currentLead.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      console.error('Erreur réinitialisation:', err);
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
    <div className="flex h-full overflow-hidden bg-[#0b141a] relative">
      {/* 1. Colonne Liste des Conversations */}
      <div
        className={`${
          mobileShowChat ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 lg:w-96 border-r border-slate-800 bg-[#111b21] flex-col shrink-0`}
      >
        {/* Barre de recherche */}
        <div className="p-3.5 border-b border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher nom, numéro, offre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Liste des contacts défilante */}
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
                  onClick={() => {
                    setSelectedLeadId(c.id);
                    setMobileShowChat(true);
                  }}
                  className={`w-full text-left p-3.5 transition-all flex items-start space-x-3 ${
                    isSelected
                      ? 'bg-slate-800/80 border-l-4 border-emerald-500'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="relative shrink-0">
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
                      <span className="text-[10px] text-slate-500 shrink-0 ml-1">
                        {lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[11px] text-slate-400 truncate max-w-[170px] sm:max-w-[200px]">
                        {lastMsg ? lastMsg.content : 'Pas de message'}
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

      {/* 2. Colonne Centrale : Chat Actif */}
      <div
        className={`${
          !mobileShowChat ? 'hidden md:flex' : 'flex'
        } flex-1 flex flex-col bg-[#0b141a] chat-pattern relative min-w-0 h-full`}
      >
        {currentLead ? (
          <>
            {/* Header de la conversation */}
            <div className="h-16 bg-[#111b21] border-b border-slate-800 px-3 sm:px-6 flex items-center justify-between z-10 shrink-0">
              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                {/* Bouton retour sur mobile */}
                <button
                  onClick={() => setMobileShowChat(false)}
                  className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 shrink-0"
                  aria-label="Retour"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-xs sm:text-sm shrink-0">
                  {(currentLead.firstName || currentLead.phone).substring(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0 truncate">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs sm:text-sm font-bold text-white truncate">
                      {currentLead.firstName ? `${currentLead.firstName} ${currentLead.lastName || ''}` : currentLead.phone}
                    </h2>
                    {currentLead.company && (
                      <span className="hidden sm:inline text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 truncate">
                        {currentLead.company}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                    {currentLead.phone} • {currentLead.source}
                  </p>
                </div>
              </div>

              {/* Actions Header (Bascule IA / Fiche Info) */}
              <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
                <button
                  onClick={toggleAiMode}
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    currentLead.aiDisabled
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  }`}
                  title="Activer ou désactiver la réponse automatique de l'IA"
                >
                  {currentLead.aiDisabled ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">Mode Conseiller Humain</span>
                      <span className="sm:hidden">Humain</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden sm:inline">Mode IA Actif</span>
                      <span className="sm:hidden">IA</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleResetLead}
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40"
                  title="Réinitialiser la qualification de ce prospect pour recommencer le test"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>

                <div className="relative">
                  <div className="flex items-center">
                    <button
                      onClick={() => handleSendCatalog()}
                      disabled={sendingCatalog}
                      className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-semibold transition-all border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 ${
                        catalogues && catalogues.length > 1 ? 'rounded-l-xl' : 'rounded-xl'
                      }`}
                      title="Envoyer le Catalogue PDF par défaut à ce prospect"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden sm:inline">{sendingCatalog ? 'Envoi...' : 'Envoyer Catalogue PDF'}</span>
                    </button>
                    {catalogues && catalogues.length > 1 && (
                      <button
                        onClick={() => setShowCatalogDropdown(!showCatalogDropdown)}
                        disabled={sendingCatalog}
                        className="px-1.5 py-1.5 rounded-r-xl border border-l-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        title="Choisir un catalogue spécifique à envoyer"
                      >
                        <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                    )}
                  </div>

                  {showCatalogDropdown && catalogues && catalogues.length > 1 && (
                    <div className="absolute right-0 mt-1.5 w-64 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 backdrop-blur-md">
                      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                        Choisir le document à envoyer
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-1">
                        {catalogues.map((cat: any) => (
                          <button
                            key={cat.id}
                            onClick={() => handleSendCatalog(cat.id)}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-800 transition-colors text-xs flex items-center justify-between gap-2 group"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-white truncate group-hover:text-emerald-300">{cat.title}</p>
                              <p className="text-[10px] text-slate-400 truncate">{cat.fileName}</p>
                            </div>
                            {cat.isDefault && (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold shrink-0">
                                Défaut
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowDetailPanel(!showDetailPanel)}
                  className={`p-2 rounded-xl text-xs font-semibold border transition-all ${
                    showDetailPanel ? 'bg-slate-800 text-emerald-400 border-slate-700' : 'text-slate-400 border-transparent hover:bg-slate-800'
                  }`}
                  title="Fiche Qualification"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Corps des messages avec défilement */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4">
              {loadingLead ? (
                <div className="text-center text-xs text-slate-500 py-12">Chargement de la conversation...</div>
              ) : currentLead.messages?.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-12">Aucun message échangé pour l'instant.</div>
              ) : (
                currentLead.messages?.map((m: any) => {
                  const isInbound = m.direction === 'inbound';
                  const isDocument = m.messageType === 'document';
                  const fileMatch = m.content.match(/Fichier\s*:\s*([^\n\r]+)/i);
                  const fileName = fileMatch ? fileMatch[1].trim() : 'Catalogue_ICT_Tourisme_2026.pdf';
                  const downloadUrl = `/api/catalogues/download/${fileName}`;

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-md md:max-w-lg rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-md ${
                          isInbound
                            ? 'bg-[#202c33] text-slate-100 rounded-tl-none border border-slate-700/50'
                            : 'bg-[#005c4b] text-white rounded-tr-none border border-emerald-600/30'
                        }`}
                      >
                        {isDocument ? (
                          <div className="space-y-2.5">
                            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/25 border border-white/10 hover:bg-black/35 transition-all">
                              <div className="w-10 h-10 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 shadow-inner">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-white truncate" title={fileName}>
                                  {fileName}
                                </div>
                                <div className="text-[10px] text-emerald-300/80 font-medium">Document PDF • ICT Tourisme</div>
                              </div>
                              <a
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 transition-all shadow shrink-0"
                                title="Ouvrir / Télécharger le document PDF"
                              >
                                <span>Consulter</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <p className="text-xs leading-relaxed whitespace-pre-wrap text-emerald-50/95">
                              {m.content.replace(/^📄[^\n]*\nFichier\s*:[^\n]*\n+/i, '') || m.content}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        )}
                        <div className="flex items-center justify-between gap-3 mt-1.5 pt-1 border-t border-white/10">
                          <span className="text-[9px] sm:text-[10px] text-white/60">
                            {isInbound
                              ? 'Prospect'
                              : m.sentByAgentId
                              ? 'Conseiller Humain'
                              : 'Agent IA ICT'}
                          </span>
                          <span className="text-[9px] sm:text-[10px] text-white/50">
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

            {/* Champ de saisie manuelle en bas */}
            <div className="p-3 sm:p-4 bg-[#111b21] border-t border-slate-800 shrink-0">
              {currentLead.aiDisabled && (
                <div className="mb-2 text-[10px] sm:text-[11px] text-amber-300/90 flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Prise de main active : l'IA ne répondra pas automatiquement.</span>
                </div>
              )}
              <form onSubmit={handleSendManual} className="flex items-center space-x-2 sm:space-x-3">
                <input
                  type="text"
                  placeholder="Écrivez votre message WhatsApp direct..."
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!manualText.trim() || sending}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl flex items-center space-x-1.5 transition-all shadow-lg shadow-emerald-500/20 text-xs shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Envoyer</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs p-6 text-center">
            Sélectionnez une conversation dans la liste pour commencer
          </div>
        )}
      </div>

      {/* 3. Volet Latéral / Tiroir Mobile : Fiche Qualification & HubSpot */}
      {showDetailPanel && currentLead && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-80 md:relative md:w-80 border-l border-slate-800 bg-[#111b21] flex flex-col z-30 shadow-2xl md:shadow-none overflow-y-auto p-5 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Fiche Qualification IA
              </span>
              <h3 className="text-base font-extrabold text-white mt-0.5">
                {currentLead.firstName ? `${currentLead.firstName} ${currentLead.lastName || ''}` : currentLead.phone}
              </h3>
              <p className="text-xs text-slate-400">{currentLead.customerType || 'Particulier'}</p>
            </div>
            <button
              onClick={() => setShowDetailPanel(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 md:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Jauge de score */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-300 font-semibold">Score IA</span>
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

          {/* Données extraites */}
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
                  <span className="text-[10px] text-slate-500 block">Participants</span>
                  <span className="text-slate-200">{currentLead.participantsCount ? `${currentLead.participantsCount} pers.` : 'Inconnu'}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Briefcase className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-500 block">Offre recommandée</span>
                  <span className="text-slate-200">{currentLead.recommendedOffer || 'En cours'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* HubSpot CRM */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">HubSpot CRM</span>
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
