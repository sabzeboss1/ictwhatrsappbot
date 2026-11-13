import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Users,
  RotateCw,
  ChevronRight,
  X,
  Flame,
  Calendar,
  Lock,
  Download,
  FileSpreadsheet,
  BellRing,
  MessageSquare,
  Coins,
  Tag,
  Check,
  Clock,
  PauseCircle,
  Ban,
  Send,
  Save,
} from 'lucide-react';
import { api } from '../lib/api';
import { getLeadDisplayName, isLidAccount } from '../lib/lead-utils';

export const Leads: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [stageFilter, setStageFilter] = useState(searchParams.get('stage') || '');
  const [offerFilter, setOfferFilter] = useState(searchParams.get('offer') || '');
  const [followUpFilter, setFollowUpFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [page, setPage] = useState(1);

  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resyncing, setResyncing] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  // Édition rapide dans le tiroir (Drawer)
  const [editOffer, setEditOffer] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editParticipants, setEditParticipants] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  // Relance rapide (unitaire ou groupée)
  const [followUpModal, setFollowUpModal] = useState<{ mode: 'single' | 'bulk'; lead?: any } | null>(null);
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [followUpWhen, setFollowUpWhen] = useState('');
  const [sendingFollowUp, setSendingFollowUp] = useState(false);

  useEffect(() => {
    if (selectedLead) {
      setEditOffer(selectedLead.recommendedOffer || '');
      setEditPrice(selectedLead.quotedPrice || '');
      setEditAmount(selectedLead.estimatedAmount ? String(selectedLead.estimatedAmount) : '');
      setEditParticipants(selectedLead.participantsCount ? String(selectedLead.participantsCount) : '');
      setEditDate(selectedLead.preferredDate || '');
      setEditBudget(selectedLead.budget || '');
      setEditNotes(selectedLead.closingNotes || '');
    }
  }, [selectedLead]);

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', { search, statusFilter, stageFilter, offerFilter, followUpFilter, dateFrom, dateTo, sortBy, page }],
    queryFn: async () => {
      const res = await api.get('/api/leads', {
        params: {
          search: search || undefined,
          status: statusFilter || undefined,
          stage: stageFilter || undefined,
          offer: offerFilter || undefined,
          followUp: followUpFilter || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
          sort: sortBy,
          order: 'desc',
          page,
          limit: 20,
        },
      });
      return res.data;
    },
    refetchInterval: 15000,
  });

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      const res = await api.get('/api/leads/export', {
        params: {
          format,
          search: search || undefined,
          status: statusFilter || undefined,
          stage: stageFilter || undefined,
          offer: offerFilter || undefined,
          followUp: followUpFilter || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
          ids: selectedIds.length ? selectedIds.join(',') : undefined,
        },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type:
          format === 'csv'
            ? 'text/csv;charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `Leads_ICT_${dateStr}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.response?.data?.error || "Erreur lors de l'extraction des données");
    } finally {
      setExporting(null);
    }
  };

  const handleSaveCriteria = async () => {
    if (!selectedLead) return;
    setSavingCriteria(true);
    try {
      const res = await api.patch(`/api/leads/${selectedLead.id}`, {
        recommendedOffer: editOffer.trim() || null,
        quotedPrice: editPrice.trim() || null,
        estimatedAmount: editAmount ? parseInt(editAmount.replace(/\D/g, ''), 10) || null : null,
        participantsCount: editParticipants ? parseInt(editParticipants, 10) || null : null,
        preferredDate: editDate.trim() || null,
        budget: editBudget.trim() || null,
        closingNotes: editNotes.trim() || null,
      });
      setSelectedLead({ ...selectedLead, ...res.data });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erreur sauvegarde');
    } finally {
      setSavingCriteria(false);
    }
  };

  const handleTogglePauseFollowUp = async (lead: any) => {
    try {
      const res = await api.patch(`/api/leads/${lead.id}`, { followUpPaused: !lead.followUpPaused });
      if (selectedLead?.id === lead.id) setSelectedLead({ ...selectedLead, ...res.data });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (e) {
      console.error(e);
    }
  };

  const openSingleFollowUp = (lead: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const fn = lead.firstName && lead.firstName !== 'Prospect' ? ` ${lead.firstName}` : '';
    const offer = lead.recommendedOffer ? ` concernant *${lead.recommendedOffer}*` : ' concernant votre projet de séjour au Cameroun';
    setFollowUpMessage(
      `Bonjour${fn} 👋 Je reviens vers vous${offer}. Avez-vous des questions ou souhaitez-vous que nous bloquions vos dates${lead.preferredDate ? ` (${lead.preferredDate})` : ''} ?`
    );
    setFollowUpWhen('');
    setFollowUpModal({ mode: 'single', lead });
  };

  const openBulkFollowUp = () => {
    setFollowUpMessage(
      'Bonjour {prenom} 👋 Je reviens vers vous concernant {offre}. Souhaitez-vous que je vérifie les disponibilités pour finaliser votre projet ? 😊'
    );
    setFollowUpWhen('');
    setFollowUpModal({ mode: 'bulk' });
  };

  const handleSubmitFollowUp = async () => {
    if (!followUpMessage.trim()) return;
    setSendingFollowUp(true);
    try {
      if (followUpModal?.mode === 'single' && followUpModal.lead) {
        await api.post(`/api/leads/${followUpModal.lead.id}/followups`, {
          message: followUpMessage.trim(),
          scheduledAt: followUpWhen || undefined,
        });
      } else if (followUpModal?.mode === 'bulk') {
        const res = await api.post('/api/followups/bulk', {
          leadIds: selectedIds,
          message: followUpMessage.trim(),
          scheduledAt: followUpWhen || undefined,
        });
        alert(
          `${res.data.created} relance(s) programmée(s) avec étalement anti-spam.${
            res.data.rejected?.length ? `\n${res.data.rejected.length} ignorée(s) (STOP ou sans message entrant).` : ''
          }`
        );
        setSelectedIds([]);
      }
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      setFollowUpModal(null);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erreur lors de la programmation de la relance');
    } finally {
      setSendingFollowUp(false);
    }
  };

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

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allCurrentIds: string[] = (leadsData?.data || []).map((l: any) => l.id);
  const allSelected = allCurrentIds.length > 0 && allCurrentIds.every((id) => selectedIds.includes(id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds((prev) => prev.filter((id) => !allCurrentIds.includes(id)));
    else setSelectedIds((prev) => Array.from(new Set([...prev, ...allCurrentIds])));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Opportunite chaude':
        return (
          <span className="text-[11px] bg-rose-500/20 text-rose-300 font-bold px-2 py-0.5 rounded-full border border-rose-500/30 inline-flex items-center gap-1">
            <Flame className="w-3 h-3" /> Chaud
          </span>
        );
      case 'Prospect qualifie':
        return (
          <span className="text-[11px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
            Qualifié
          </span>
        );
      case 'Prospect tiede':
        return (
          <span className="text-[11px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
            Tiède
          </span>
        );
      default:
        return (
          <span className="text-[11px] bg-slate-500/20 text-slate-400 font-medium px-2 py-0.5 rounded-full">
            Froid
          </span>
        );
    }
  };

  const formatRelDate = (d?: string | null) => {
    if (!d) return null;
    const date = new Date(d);
    if (isNaN(date.getTime())) return null;
    const diffH = Math.round((date.getTime() - Date.now()) / 3600000);
    if (diffH < -24) return `il y a ${Math.round(Math.abs(diffH) / 24)}j`;
    if (diffH < 0) return `il y a ${Math.abs(diffH)}h`;
    if (diffH === 0) return 'imminent';
    if (diffH < 24) return `dans ${diffH}h`;
    return `dans ${Math.round(diffH / 24)}j`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
      {/* En-tête + Boutons d'Extraction Connectée */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Leads & Prospects — Vue Closing Enrichie
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Critères de choix complets (offre, prix, participants, date) affichés instantanément sans ouvrir chaque fiche, avec extraction directe.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedIds.length > 0 && (
            <button
              onClick={openBulkFollowUp}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all"
            >
              <BellRing className="w-4 h-4" />
              <span>Relancer la sélection ({selectedIds.length})</span>
            </button>
          )}

          <button
            onClick={() => handleExport('xlsx')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all"
            title="Exporter vers Excel (.xlsx) avec feuille de synthèse et filtres"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              {exporting === 'xlsx'
                ? 'Export Excel...'
                : selectedIds.length
                ? `Extraire Excel (${selectedIds.length})`
                : 'Extraire Excel (.xlsx)'}
            </span>
          </button>

          <button
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 font-semibold px-3.5 py-2 rounded-xl text-xs border border-slate-700 transition-all"
            title="Exporter en CSV UTF-8 (séparateur point-virgule compatible Excel FR)"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>{exporting === 'csv' ? 'Export CSV...' : 'Extraire CSV'}</span>
          </button>
        </div>
      </div>

      {/* Barre de Filtres & Recherche */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[230px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher nom, téléphone, entreprise, offre, date..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">Tous les statuts</option>
            <option value="Opportunite chaude">Opportunité chaude (≥ 80)</option>
            <option value="Prospect qualifie">Prospect qualifié (61-80)</option>
            <option value="Prospect tiede">Prospect tiède (31-60)</option>
            <option value="Prospect froid">Prospect froid (≤ 30)</option>
          </select>

          <select
            value={offerFilter}
            onChange={(e) => {
              setOfferFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">Toutes les offres</option>
            <option value="Kribi">Kribi & Chutes de la Lobé</option>
            <option value="Ebogo">Écotourisme Ebogo & Pirogue</option>
            <option value="Mont Cameroun">Ascension Mont Cameroun</option>
            <option value="Limb">Limbé & Sémé Beach</option>
          </select>

          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setPage(1);
            }}
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

          <select
            value={followUpFilter}
            onChange={(e) => {
              setFollowUpFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">Suivi / Relances (tous)</option>
            <option value="waiting">À relancer (en attente de réponse)</option>
            <option value="paused">Relances auto en pause</option>
            <option value="optout">Désinscrits (STOP)</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="updatedAt">Tri : Activité récente</option>
            <option value="qualificationScore">Tri : Score décroissant</option>
            <option value="estimatedAmount">Tri : Montant estimé</option>
            <option value="participantsCount">Tri : Nb participants</option>
            <option value="createdAt">Tri : Date de création</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span>Période :</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white"
            />
            <span>→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white"
            />
            {(search || statusFilter || stageFilter || offerFilter || followUpFilter || dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setStageFilter('');
                  setOfferFilter('');
                  setFollowUpFilter('');
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
                className="text-rose-400 hover:text-rose-300 font-semibold ml-2"
              >
                Réinitialiser filtres
              </button>
            )}
          </div>
          <div>
            <strong className="text-white">{leadsData?.total || 0}</strong> prospect(s) correspondant aux critères
          </div>
        </div>
      </div>

      {/* Tableau enrichi des Leads — affiche instantanément Offre, Prix, Participants, Date */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                  />
                </th>
                <th className="py-3.5 px-3">Prospect</th>
                <th className="py-3.5 px-3">Offre sélectionnée</th>
                <th className="py-3.5 px-3">Prix & Budget</th>
                <th className="py-3.5 px-3">Participants</th>
                <th className="py-3.5 px-3">Date choisie</th>
                <th className="py-3.5 px-3">Score & Statut</th>
                <th className="py-3.5 px-3">Suivi / Relance</th>
                <th className="py-3.5 px-3 text-right">Actions rapides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Chargement des prospects...
                  </td>
                </tr>
              ) : leadsData?.data?.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Aucun prospect ne correspond aux critères
                  </td>
                </tr>
              ) : (
                leadsData?.data?.map((lead: any) => {
                  const isChecked = selectedIds.includes(lead.id);
                  const lastMsg = lead.messages?.[0];
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                        isChecked ? 'bg-emerald-500/5' : ''
                      }`}
                    >
                      <td className="py-3.5 px-3" onClick={(e) => toggleSelect(lead.id, e)}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                        />
                      </td>

                      {/* Prospect */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{getLeadDisplayName(lead)}</span>
                          {lead.isB2B && (
                            <span className="bg-amber-500/20 text-amber-300 font-bold text-[9px] px-1.5 py-0.5 rounded">
                              B2B
                            </span>
                          )}
                          {lead.isVip && (
                            <span className="bg-purple-500/20 text-purple-300 font-bold text-[9px] px-1.5 py-0.5 rounded">
                              VIP
                            </span>
                          )}
                          {isLidAccount(lead) && (
                            <span
                              className="inline-flex items-center text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20"
                              title="Identifiant masqué WhatsApp (LID)"
                            >
                              <Lock className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {lead.realPhone ? (
                            <span className="text-emerald-400 font-mono font-medium">{lead.realPhone}</span>
                          ) : isLidAccount(lead) ? (
                            <span className="text-amber-400/90">ID WhatsApp masqué</span>
                          ) : (
                            <span className="font-mono">{lead.phone}</span>
                          )}
                          {lead.customerType && lead.customerType !== 'Inconnu' ? ` • ${lead.customerType}` : ''}
                        </div>
                        {lead.company && <div className="text-[10px] text-amber-400 font-semibold">{lead.company}</div>}
                      </td>

                      {/* Offre sélectionnée */}
                      <td className="py-3.5 px-3 max-w-[230px]">
                        {lead.recommendedOffer ? (
                          <div className="font-semibold text-emerald-300 flex items-start gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{lead.recommendedOffer}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">En découverte</span>
                        )}
                        {lead.need && (
                          <p className="text-[10px] text-slate-400 truncate mt-0.5" title={lead.need}>
                            {lead.need}
                          </p>
                        )}
                      </td>

                      {/* Prix & Budget */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {lead.quotedPrice ? (
                          <div className="font-bold text-white flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-amber-400" />
                            <span>{lead.quotedPrice}</span>
                          </div>
                        ) : lead.budget ? (
                          <div className="font-semibold text-slate-200" title="Budget annoncé par le prospect">
                            Budget : {lead.budget}
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                        {lead.estimatedAmount ? (
                          <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                            Total ≈ {lead.estimatedAmount.toLocaleString('fr-FR')} FCFA
                          </div>
                        ) : lead.quotedPrice && lead.budget ? (
                          <div className="text-[10px] text-slate-400 mt-0.5">Budget : {lead.budget}</div>
                        ) : null}
                      </td>

                      {/* Participants */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {lead.participantsCount ? (
                          <span className="inline-flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 text-white font-bold px-2.5 py-1 rounded-lg">
                            <Users className="w-3.5 h-3.5 text-emerald-400" />
                            {lead.participantsCount} pers.
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Date choisie */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {lead.preferredDate ? (
                          <span className="inline-flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 text-amber-200 font-semibold px-2.5 py-1 rounded-lg">
                            <Calendar className="w-3.5 h-3.5 text-amber-400" />
                            {lead.preferredDate}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Score & Statut */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(lead.leadStatus)}
                          <span className="font-extrabold text-emerald-400">{lead.qualificationScore}/100</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Étape : <span className="text-slate-300 font-medium">{lead.nextStep || 'Nurturing'}</span>
                        </div>
                      </td>

                      {/* Suivi / Relance */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {lead.optOut ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                            <Ban className="w-3 h-3" /> STOP
                          </span>
                        ) : lead.nextFollowUpAt ? (
                          <div className="text-[11px] text-amber-300 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Relance {formatRelDate(lead.nextFollowUpAt)}</span>
                          </div>
                        ) : lead.awaitingReply ? (
                          <span className="text-[11px] text-slate-300">En attente client</span>
                        ) : (
                          <span className="text-[11px] text-emerald-400">À jour</span>
                        )}
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {lead.followUpCount > 0 ? `${lead.followUpCount} relance(s)` : ''}
                          {lastMsg ? ` • msg ${formatRelDate(lastMsg.createdAt) || ''}` : ''}
                        </div>
                      </td>

                      {/* Actions rapides */}
                      <td className="py-3.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={(e) => openSingleFollowUp(lead, e)}
                            disabled={lead.optOut}
                            title="Relancer ce prospect sur WhatsApp"
                            className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 disabled:opacity-30 transition-colors"
                          >
                            <BellRing className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => navigate(`/conversations?leadId=${lead.id}`)}
                            title="Ouvrir la conversation"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          <Link
                            to={`/leads/${lead.id}`}
                            className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300 font-semibold pl-1"
                          >
                            <span>Fiche</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      {/* Panneau latéral escamotable (Drawer Closing Rapide) */}
      {selectedLead && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[440px] bg-[#111b21] border-l border-slate-800 shadow-2xl z-50 flex flex-col p-5 sm:p-6 overflow-y-auto animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Fiche Closing Instantanée
              </span>
              <h2 className="text-base font-extrabold text-white mt-0.5">{getLeadDisplayName(selectedLead)}</h2>
              <p className="text-xs text-slate-400 font-mono">
                {selectedLead.realPhone || selectedLead.phone}
                {selectedLead.email ? ` • ${selectedLead.email}` : ''}
              </p>
            </div>
            <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="py-5 space-y-5 flex-1 text-xs">
            {/* Score et Statut */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-semibold">Score IA</span>
                <span className="text-base font-black text-emerald-400">{selectedLead.qualificationScore}/100</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Statut :</span>
                {getStatusBadge(selectedLead.leadStatus)}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Prochaine étape :</span>
                <span className="font-bold text-amber-300">{selectedLead.nextStep || 'Nurturing'}</span>
              </div>
            </div>

            {/* Critères de choix éditables en direct (sans ouvrir la fiche complète) */}
            <div className="bg-slate-900/70 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-emerald-400 uppercase tracking-wider text-[11px]">
                  Critères de Choix & Closing
                </h4>
                {savedToast && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                    <Check className="w-3.5 h-3.5" /> Enregistré
                  </span>
                )}
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Offre sélectionnée / recommandée</label>
                <input
                  type="text"
                  value={editOffer}
                  onChange={(e) => setEditOffer(e.target.value)}
                  placeholder="Ex: Escapade Balnéaire Kribi & Chutes de la Lobé"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Prix communiqué</label>
                  <input
                    type="text"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    placeholder="75 000 FCFA / pers"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Total estimé (FCFA)</label>
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="300000"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Nombre de participants</label>
                  <input
                    type="number"
                    value={editParticipants}
                    onChange={(e) => setEditParticipants(e.target.value)}
                    placeholder="Ex: 4"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Date choisie</label>
                  <input
                    type="text"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    placeholder="Ex: 15-17 décembre"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Budget annoncé par le prospect</label>
                <input
                  type="text"
                  value={editBudget}
                  onChange={(e) => setEditBudget(e.target.value)}
                  placeholder="Ex: 500 000 FCFA"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Notes internes de closing</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes pour l'équipe commerciale (non visibles par le client)..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                onClick={handleSaveCriteria}
                disabled={savingCriteria}
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2 rounded-xl transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingCriteria ? 'Enregistrement...' : 'Enregistrer les critères'}</span>
              </button>
            </div>

            {/* Actions de Relance rapide */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">Suivi & Relances WhatsApp</span>
                <span className="text-[11px] text-slate-400">{selectedLead.followUpCount || 0} envoyée(s)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openSingleFollowUp(selectedLead)}
                  disabled={selectedLead.optOut}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold py-2 rounded-xl transition-colors"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Relancer</span>
                </button>
                <button
                  onClick={() => handleTogglePauseFollowUp(selectedLead)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold flex items-center gap-1"
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>{selectedLead.followUpPaused ? 'Reprendre auto' : 'Pause auto'}</span>
                </button>
              </div>
            </div>

            {/* HubSpot */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">HubSpot CRM</span>
                <span className="font-semibold text-emerald-400">{selectedLead.hubspotSyncStatus}</span>
              </div>
              <button
                onClick={() => handleResync(selectedLead.id)}
                disabled={resyncing}
                className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2 rounded-xl border border-slate-700"
              >
                <RotateCw className={`w-3.5 h-3.5 ${resyncing ? 'animate-spin' : ''}`} />
                <span>Resynchroniser HubSpot</span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center gap-2.5">
            <Link
              to={`/conversations?leadId=${selectedLead.id}`}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs text-center border border-slate-700"
            >
              Chat Live
            </Link>
            <Link
              to={`/leads/${selectedLead.id}`}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs text-center"
            >
              Fiche complète
            </Link>
          </div>
        </div>
      )}

      {/* Modal de Relance (unitaire ou groupée) */}
      {followUpModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <BellRing className="w-5 h-5 text-amber-400" />
                <span>
                  {followUpModal.mode === 'single'
                    ? `Relancer ${getLeadDisplayName(followUpModal.lead)}`
                    : `Relance groupée (${selectedIds.length} prospects)`}
                </span>
              </h3>
              <button onClick={() => setFollowUpModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Variables disponibles : <code className="text-emerald-400">{'{prenom}'}</code>,{' '}
              <code className="text-emerald-400">{'{offre}'}</code>,{' '}
              <code className="text-emerald-400">{'{date}'}</code>,{' '}
              <code className="text-emerald-400">{'{participants}'}</code>,{' '}
              <code className="text-emerald-400">{'{prix}'}</code>. Les envois sont automatiquement espacés et limités aux heures ouvrées pour protéger votre numéro WhatsApp.
            </p>

            <div>
              <label className="text-xs text-slate-300 font-semibold block mb-1.5">Message WhatsApp</label>
              <textarea
                rows={4}
                value={followUpMessage}
                onChange={(e) => setFollowUpMessage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300 font-semibold block mb-1.5">
                Date d'envoi (laisser vide pour envoyer dès le prochain cycle)
              </label>
              <input
                type="datetime-local"
                value={followUpWhen}
                onChange={(e) => setFollowUpWhen(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setFollowUpModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmitFollowUp}
                disabled={sendingFollowUp || !followUpMessage.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingFollowUp ? 'Programmation...' : followUpWhen ? 'Programmer la relance' : 'Envoyer la relance'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
