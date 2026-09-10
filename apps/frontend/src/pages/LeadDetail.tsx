import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Users,
  Briefcase,
  DollarSign,
  AlertTriangle,
  RotateCw,
  UserCheck,
  Bot,
  MessageSquare,
  ShieldCheck,
  Flame,
} from 'lucide-react';
import { api } from '../lib/api';

export const LeadDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const res = await api.get(`/api/leads/${id}`);
      return res.data;
    },
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/users');
        return res.data;
      } catch {
        return [];
      }
    },
  });

  const handleUpdateField = async (data: any) => {
    if (!id) return;
    setUpdating(true);
    try {
      await api.patch(`/api/leads/${id}`, data);
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const handleResyncHubspot = async () => {
    if (!id) return;
    try {
      await api.post(`/api/leads/${id}/resync-hubspot`);
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-slate-500 text-xs">Chargement du profil lead...</div>;
  }

  if (!lead) {
    return <div className="p-12 text-center text-slate-500 text-xs">Prospect introuvable</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Retour */}
      <Link
        to="/leads"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-emerald-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Retour au répertoire des leads</span>
      </Link>

      {/* Header Fiche Lead */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-extrabold text-white text-xl shadow-lg shadow-emerald-900/30">
            {(lead.firstName || lead.phone).substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-white">
                {lead.firstName ? `${lead.firstName} ${lead.lastName || ''}` : lead.phone}
              </h1>
              {lead.isB2B && (
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold px-2 py-0.5 rounded-full">
                  B2B
                </span>
              )}
              {lead.isVip && (
                <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold px-2 py-0.5 rounded-full">
                  VIP
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {lead.phone} {lead.email ? `• ${lead.email}` : ''} {lead.company ? `• ${lead.company}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/conversations"
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/20"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Accéder au chat live</span>
          </Link>
        </div>
      </div>

      {/* Grille principale : Qualification IA & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche : Qualification & Score */}
        <div className="lg:col-span-2 space-y-6">
          {/* Carte Score & Statut */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Score & Qualification Commerciale</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block">Score calculé</span>
                <span className="text-2xl font-black text-emerald-400 mt-1 block">{lead.qualificationScore}/100</span>
                <span className="text-[11px] text-slate-500">{lead.leadStatus}</span>
              </div>

              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block">Étape entonnoir</span>
                <span className="text-sm font-bold text-white mt-1 block">{lead.conversationStage}</span>
                <span className="text-[11px] text-emerald-400">Progression IA</span>
              </div>

              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block">Prochaine action</span>
                <span className="text-sm font-bold text-amber-300 mt-1 block">{lead.nextStep || 'Nurturing'}</span>
                <span className="text-[11px] text-slate-500">Routage automatique</span>
              </div>
            </div>

            {/* Détails structurés extraits par l'IA */}
            <div className="pt-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                Données collectées par l'agent IA
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Type de client</span>
                  <span className="text-white font-semibold">{lead.customerType || 'Inconnu'}</span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Nombre de participants</span>
                  <span className="text-white font-semibold">
                    {lead.participantsCount ? `${lead.participantsCount} participants` : 'Non précisé'}
                  </span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Date souhaitée</span>
                  <span className="text-white font-semibold">{lead.preferredDate || 'Non renseignée'}</span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Budget estimé</span>
                  <span className="text-white font-semibold">{lead.budget || 'Non spécifié'}</span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 sm:col-span-2">
                  <span className="text-[10px] text-slate-400 block">Besoin exprimé</span>
                  <span className="text-slate-200">{lead.need || 'En cours de découverte'}</span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 sm:col-span-2">
                  <span className="text-[10px] text-slate-400 block">Offre recommandée</span>
                  <span className="text-emerald-400 font-semibold">{lead.recommendedOffer || 'Non encore attribuée'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Historique des messages de la conversation */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Historique de la conversation WhatsApp</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {lead.messages?.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Aucun message échangé.</p>
              ) : (
                lead.messages?.map((m: any) => (
                  <div
                    key={m.id}
                    className={`p-3 rounded-xl text-xs ${
                      m.direction === 'inbound'
                        ? 'bg-slate-900 border border-slate-800 text-slate-200'
                        : 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-100'
                    }`}
                  >
                    <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                      <span className="font-bold">
                        {m.direction === 'inbound' ? 'Prospect' : m.sentByAgentId ? 'Conseiller Humain' : 'Agent IA'}
                      </span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite : Actions de gestion & HubSpot */}
        <div className="space-y-6">
          {/* Actions rapides Conseiller */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Actions de gestion</h3>

            {/* Modification du statut */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Changer le statut manuellement</label>
              <select
                value={lead.leadStatus || ''}
                onChange={(e) => handleUpdateField({ leadStatus: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="Prospect froid">Prospect froid</option>
                <option value="Prospect tiede">Prospect tiède</option>
                <option value="Prospect qualifie">Prospect qualifié</option>
                <option value="Opportunite chaude">Opportunité chaude</option>
              </select>
            </div>

            {/* Modification prochaine étape */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Prochaine étape de vente</label>
              <select
                value={lead.nextStep || ''}
                onChange={(e) => handleUpdateField({ nextStep: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="Nurturing">Nurturing</option>
                <option value="Continuer qualification">Continuer qualification</option>
                <option value="Landing Page">Landing Page</option>
                <option value="Paiement">Paiement</option>
                <option value="Conseiller humain">Conseiller humain</option>
              </select>
            </div>

            {/* Assignation conseiller */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Conseiller assigné</label>
              <select
                value={lead.assignedAgentId || ''}
                onChange={(e) => handleUpdateField({ assignedAgentId: e.target.value || null })}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Non assigné</option>
                {users?.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Bascule IA active */}
            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={() => handleUpdateField({ aiDisabled: !lead.aiDisabled })}
                className={`w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${
                  lead.aiDisabled
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30'
                }`}
              >
                {lead.aiDisabled ? (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Mode Humain actif (IA suspendue)</span>
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4" />
                    <span>IA active (Prendre la main)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Fiche HubSpot CRM */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Synchronisation HubSpot</h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  lead.hubspotSyncStatus === 'synced'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : lead.hubspotSyncStatus === 'failed'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {lead.hubspotSyncStatus}
              </span>
            </div>

            <div className="text-xs space-y-2 text-slate-300">
              <div>
                <span className="text-[10px] text-slate-400 block">HubSpot Contact ID</span>
                <span className="font-mono text-slate-200">{lead.hubspotContactId || 'Non synchronisé'}</span>
              </div>
              {lead.hubspotDealId && (
                <div>
                  <span className="text-[10px] text-slate-400 block">HubSpot Deal ID</span>
                  <span className="font-mono text-slate-200">{lead.hubspotDealId}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleResyncHubspot}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold py-2.5 rounded-xl border border-slate-700 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Forcer la synchronisation CRM</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
