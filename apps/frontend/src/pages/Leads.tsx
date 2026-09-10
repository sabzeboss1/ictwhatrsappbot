import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  Users,
  RotateCw,
  ExternalLink,
  ChevronRight,
  X,
  Bot,
  UserCheck,
  Flame,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { api } from '../lib/api';

export const Leads: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [resyncing, setResyncing] = useState(false);

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', { search, statusFilter, stageFilter, page }],
    queryFn: async () => {
      const res = await api.get('/api/leads', {
        params: {
          search,
          status: statusFilter || undefined,
          stage: stageFilter || undefined,
          page,
          limit: 15,
        },
      });
      return res.data;
    },
    refetchInterval: 15000,
  });

  const handleResync = async (leadId: string) => {
    setResyncing(true);
    try {
      await api.post(`/api/leads/${leadId}/resync-hubspot`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (selectedLead && selectedLead.id === leadId) {
        const updated = await api.get(`/api/leads/${leadId}`);
        setSelectedLead(updated.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setResyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Opportunite chaude':
        return <span className="text-xs bg-rose-500/20 text-rose-300 font-bold px-2.5 py-1 rounded-full border border-rose-500/30 flex items-center gap-1"><Flame className="w-3 h-3" /> Chaud</span>;
      case 'Prospect qualifie':
        return <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">Qualifié</span>;
      case 'Prospect tiede':
        return <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-2.5 py-1 rounded-full border border-amber-500/30">Tiède</span>;
      default:
        return <span className="text-xs bg-slate-500/20 text-slate-400 font-medium px-2.5 py-1 rounded-full">Froid</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Titre */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Répertoire des Prospects</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Tous les contacts WhatsApp qualifiés automatiquement par l'IA avec scoring et synchronisation CRM.
          </p>
        </div>
      </div>

      {/* Filtres & Recherche */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par nom, téléphone, entreprise, offre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="">Tous les statuts</option>
          <option value="Opportunite chaude">Opportunité chaude (Score ≥ 80)</option>
          <option value="Prospect qualifie">Prospect qualifié (Score 61-80)</option>
          <option value="Prospect tiede">Prospect tiède (Score 31-60)</option>
          <option value="Prospect froid">Prospect froid (Score ≤ 30)</option>
        </select>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="">Toutes les étapes</option>
          <option value="NEW_CONTACT">Nouveau contact</option>
          <option value="DISCOVERY">Découverte</option>
          <option value="QUALIFICATION">Qualification</option>
          <option value="RECOMMENDATION">Recommandation</option>
          <option value="OBJECTION_HANDLING">Objections</option>
          <option value="CONVERSION">Conversion</option>
          <option value="CUSTOMER">Client</option>
        </select>
      </div>

      {/* Tableau des Leads */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Prospect</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Score</th>
                <th className="py-3.5 px-4">Statut</th>
                <th className="py-3.5 px-4">Étape suivante</th>
                <th className="py-3.5 px-4">HubSpot</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Chargement des prospects...
                  </td>
                </tr>
              ) : leadsData?.data?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Aucun prospect ne correspond aux critères
                  </td>
                </tr>
              ) : (
                leadsData?.data?.map((lead: any) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">
                        {lead.firstName ? `${lead.firstName} ${lead.lastName || ''}` : lead.phone}
                      </div>
                      <div className="text-[11px] text-slate-400">{lead.phone}</div>
                      {lead.company && <div className="text-[10px] text-amber-400 font-semibold">{lead.company}</div>}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-slate-300 font-medium">{lead.customerType || 'Inconnu'}</span>
                      {lead.isB2B && (
                        <span className="ml-1.5 bg-amber-500/20 text-amber-300 font-bold text-[9px] px-1.5 py-0.5 rounded">
                          B2B
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-emerald-400 w-6">{lead.qualificationScore}</span>
                        <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ width: `${Math.min(lead.qualificationScore, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">{getStatusBadge(lead.leadStatus)}</td>

                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-200">{lead.nextStep || 'Nurturing'}</span>
                    </td>

                    <td className="py-3.5 px-4">
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
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/leads/${lead.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
                      >
                        <span>Fiche</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {leadsData && leadsData.totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Page {leadsData.page} sur {leadsData.totalPages} ({leadsData.total} prospects)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-white"
              >
                Précédent
              </button>
              <button
                disabled={page >= leadsData.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-white"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Panneau latéral escamotable (Drawer) au clic sur un lead */}
      {selectedLead && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-[#111b21] border-l border-slate-800 shadow-2xl z-50 flex flex-col p-5 sm:p-6 overflow-y-auto animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Aperçu rapide</span>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                {selectedLead.firstName ? `${selectedLead.firstName} ${selectedLead.lastName || ''}` : selectedLead.phone}
              </h2>
            </div>
            <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="py-6 space-y-6 flex-1">
            {/* Score et Statut */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-300 font-semibold">Score IA</span>
                <span className="text-base font-black text-emerald-400">{selectedLead.qualificationScore}/100</span>
              </div>
              <div className="flex justify-between items-center mt-2 text-xs">
                <span className="text-slate-400">Statut :</span>
                {getStatusBadge(selectedLead.leadStatus)}
              </div>
              <div className="flex justify-between items-center mt-2 text-xs">
                <span className="text-slate-400">Prochaine étape :</span>
                <span className="font-bold text-amber-300">{selectedLead.nextStep}</span>
              </div>
            </div>

            {/* Détails qualification */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Informations extraites</h4>
              <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div>
                  <span className="text-[10px] text-slate-400 block">Type de client</span>
                  <span className="text-slate-200 font-medium">{selectedLead.customerType || 'Non déterminé'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Participants</span>
                  <span className="text-slate-200 font-medium">
                    {selectedLead.participantsCount ? `${selectedLead.participantsCount} personnes` : 'Non précisé'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Date souhaitée</span>
                  <span className="text-slate-200 font-medium">{selectedLead.preferredDate || 'Non précisée'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Offre recommandée</span>
                  <span className="text-emerald-400 font-medium">{selectedLead.recommendedOffer || 'En cours'}</span>
                </div>
              </div>
            </div>

            {/* Synchronisation HubSpot */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">HubSpot CRM</span>
                <span className="text-xs font-semibold text-emerald-400">{selectedLead.hubspotSyncStatus}</span>
              </div>
              {selectedLead.hubspotContactId && (
                <p className="text-[11px] text-slate-400">
                  ID Contact: <code className="text-slate-300">{selectedLead.hubspotContactId}</code>
                </p>
              )}
              {selectedLead.hubspotLastError && (
                <p className="text-[11px] text-rose-400 bg-rose-500/10 p-2 rounded">
                  {selectedLead.hubspotLastError}
                </p>
              )}
              <button
                onClick={() => handleResync(selectedLead.id)}
                disabled={resyncing}
                className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2.5 rounded-xl transition-colors border border-slate-700"
              >
                <RotateCw className={`w-3.5 h-3.5 ${resyncing ? 'animate-spin' : ''}`} />
                <span>Resynchroniser HubSpot</span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center gap-3">
            <Link
              to={`/leads/${selectedLead.id}`}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs text-center transition-colors"
            >
              Voir fiche complète
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
