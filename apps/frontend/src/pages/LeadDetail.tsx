import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Users,
  RotateCw,
  UserCheck,
  Bot,
  MessageSquare,
  Lock,
  Edit2,
  Tag,
  Coins,
  BellRing,
  Save,
  Check,
  X,
  Send,
  PauseCircle,
  Ban,
} from 'lucide-react';
import { api } from '../lib/api';
import { getLeadDisplayName, isLidAccount } from '../lib/lead-utils';

export const LeadDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // Critères de closing éditables
  const [editOffer, setEditOffer] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editParticipants, setEditParticipants] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savedToast, setSavedToast] = useState(false);

  // Programmation de relance
  const [followUpMsg, setFollowUpMsg] = useState('');
  const [followUpWhen, setFollowUpWhen] = useState('');
  const [scheduling, setScheduling] = useState(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const res = await api.get(`/api/leads/${id}`);
      return res.data;
    },
  });

  useEffect(() => {
    if (lead) {
      setEditOffer(lead.recommendedOffer || '');
      setEditPrice(lead.quotedPrice || '');
      setEditAmount(lead.estimatedAmount ? String(lead.estimatedAmount) : '');
      setEditParticipants(lead.participantsCount ? String(lead.participantsCount) : '');
      setEditDate(lead.preferredDate || '');
      setEditBudget(lead.budget || '');
      setEditNotes(lead.closingNotes || '');
      if (!followUpMsg) {
        const fn = lead.firstName && lead.firstName !== 'Prospect' ? ` ${lead.firstName}` : '';
        const offer = lead.recommendedOffer ? ` concernant *${lead.recommendedOffer}*` : ' concernant votre projet de séjour';
        setFollowUpMsg(
          `Bonjour${fn} 👋 Je reviens vers vous${offer}. Avez-vous des questions ou souhaitez-vous que nous bloquions vos dates ?`
        );
      }
    }
  }, [lead]);

  const handleUpdateField = async (data: any) => {
    if (!id) return;
    setUpdating(true);
    try {
      await api.patch(`/api/leads/${id}`, data);
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveCriteria = async () => {
    await handleUpdateField({
      recommendedOffer: editOffer.trim() || null,
      quotedPrice: editPrice.trim() || null,
      estimatedAmount: editAmount ? parseInt(editAmount.replace(/\D/g, ''), 10) || null : null,
      participantsCount: editParticipants ? parseInt(editParticipants, 10) || null : null,
      preferredDate: editDate.trim() || null,
      budget: editBudget.trim() || null,
      closingNotes: editNotes.trim() || null,
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

  const handleScheduleFollowUp = async () => {
    if (!id || !followUpMsg.trim()) return;
    setScheduling(true);
    try {
      await api.post(`/api/leads/${id}/followups`, {
        message: followUpMsg.trim(),
        scheduledAt: followUpWhen || undefined,
      });
      setFollowUpWhen('');
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['followups'] });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erreur programmation relance');
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelFollowUp = async (fuId: string) => {
    try {
      await api.delete(`/api/followups/${fuId}`);
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
    } catch (e) {
      console.error(e);
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

  const handleSavePhone = async () => {
    if (!id) return;
    setSavingPhone(true);
    try {
      await api.patch(`/api/leads/${id}`, { realPhone: newPhone.trim() });
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setEditingPhone(false);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erreur lors de la mise à jour du numéro');
    } finally {
      setSavingPhone(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-slate-500 text-xs">Chargement du profil lead...</div>;
  }

  if (!lead) {
    return <div className="p-12 text-center text-slate-500 text-xs">Prospect introuvable</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
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
            {getLeadDisplayName(lead).substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold text-white">{getLeadDisplayName(lead)}</h1>
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
              {lead.optOut && (
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Ban className="w-3 h-3" /> Désinscrit (STOP)
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
              {lead.realPhone ? (
                <span className="text-emerald-400 font-mono font-medium">{lead.realPhone}</span>
              ) : isLidAccount(lead) ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-medium">
                  <Lock className="w-3 h-3" /> WhatsApp (Numéro masqué)
                </span>
              ) : (
                <span className="font-mono">{lead.phone}</span>
              )}
              {lead.email ? `• ${lead.email}` : ''}
              {lead.company ? `• ${lead.company}` : ''}
              {!editingPhone && (
                <button
                  onClick={() => {
                    setEditingPhone(true);
                    setNewPhone(lead.realPhone || '');
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold underline text-[11px] ml-1 flex items-center gap-0.5"
                >
                  <Edit2 className="w-2.5 h-2.5" /> {lead.realPhone ? 'Modifier tél.' : 'Renseigner tél.'}
                </button>
              )}
            </div>

            {editingPhone && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+237 6XX XX XX XX"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  autoFocus
                />
                <button
                  onClick={handleSavePhone}
                  disabled={savingPhone || !newPhone.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-lg font-bold transition-all disabled:opacity-50"
                >
                  {savingPhone ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
                <button
                  onClick={() => setEditingPhone(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded-lg"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={`/conversations?leadId=${lead.id}`}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/20"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Accéder au chat live</span>
          </Link>
        </div>
      </div>

      {/* Bandeau Synthèse Closing : Offre • Prix • Participants • Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="glass-panel p-4 rounded-2xl border border-emerald-500/30">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold uppercase tracking-wider">
            <Tag className="w-4 h-4" />
            <span>Offre Sélectionnée</span>
          </div>
          <p className="text-sm font-extrabold text-white mt-1.5 line-clamp-2">
            {lead.recommendedOffer || 'Non encore définie'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 truncate">{lead.need || 'En cours de qualification'}</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-amber-500/30">
          <div className="flex items-center gap-2 text-xs text-amber-400 font-bold uppercase tracking-wider">
            <Coins className="w-4 h-4" />
            <span>Prix & Montant</span>
          </div>
          <p className="text-sm font-extrabold text-white mt-1.5">
            {lead.quotedPrice || lead.budget || 'À chiffrer'}
          </p>
          <p className="text-[11px] text-emerald-400 font-semibold mt-1">
            {lead.estimatedAmount
              ? `Total estimé : ${lead.estimatedAmount.toLocaleString('fr-FR')} FCFA`
              : lead.budget
              ? `Budget client : ${lead.budget}`
              : 'Montant total non estimé'}
          </p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-300 font-bold uppercase tracking-wider">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Participants</span>
          </div>
          <p className="text-xl font-black text-white mt-1.5">
            {lead.participantsCount ? `${lead.participantsCount} pers.` : 'Non précisé'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Profil : {lead.customerType || 'Inconnu'}</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-300 font-bold uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span>Date Choisie</span>
          </div>
          <p className="text-base font-extrabold text-amber-200 mt-1.5">
            {lead.preferredDate || 'Non renseignée'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Intention : <strong className="text-slate-200">{lead.purchaseIntent || 'information'}</strong>
          </p>
        </div>
      </div>

      {/* Grille principale : Qualification IA, Relances & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche */}
        <div className="lg:col-span-2 space-y-6">
          {/* Édition des critères de closing */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Fiche de Closing (Offre, Tarif, Participants, Date & Notes)
              </h2>
              {savedToast && (
                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-4 h-4" /> Modifications enregistrées
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="text-[11px] text-slate-400 block mb-1">Offre sélectionnée / recommandée</label>
                <input
                  type="text"
                  value={editOffer}
                  onChange={(e) => setEditOffer(e.target.value)}
                  placeholder="Ex: Escapade Balnéaire Kribi & Chutes de la Lobé"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Prix communiqué au client</label>
                <input
                  type="text"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="Ex: 75 000 FCFA / personne"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Montant total estimé (FCFA)</label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="Ex: 300000"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Nombre de participants</label>
                <input
                  type="number"
                  value={editParticipants}
                  onChange={(e) => setEditParticipants(e.target.value)}
                  placeholder="Ex: 4"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Date choisie / souhaitée</label>
                <input
                  type="text"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  placeholder="Ex: 15-17 décembre 2026"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] text-slate-400 block mb-1">Budget déclaré par le prospect</label>
                <input
                  type="text"
                  value={editBudget}
                  onChange={(e) => setEditBudget(e.target.value)}
                  placeholder="Ex: 500 000 FCFA"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] text-slate-400 block mb-1">Notes internes de closing</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Compte-rendu d'appel, préférences d'hébergement, échéance de paiement..."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveCriteria}
                disabled={updating}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>{updating ? 'Sauvegarde...' : 'Enregistrer la fiche closing'}</span>
              </button>
            </div>
          </div>

          {/* Historique des messages de la conversation */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Historique de la conversation WhatsApp ({lead.messages?.length || 0})
            </h2>
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
                        : m.messageType === 'followup'
                        ? 'bg-amber-950/30 border border-amber-700/40 text-amber-100'
                        : 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-100'
                    }`}
                  >
                    <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                      <span className="font-bold">
                        {m.direction === 'inbound'
                          ? 'Prospect'
                          : m.messageType === 'followup'
                          ? '🔔 Relance WhatsApp'
                          : m.sentByAgentId
                          ? 'Conseiller Humain'
                          : 'Agent IA'}
                      </span>
                      <span>{new Date(m.createdAt).toLocaleString('fr-FR')}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite : Relances, Actions de gestion & HubSpot */}
        <div className="space-y-6">
          {/* Module de Relance Prospect */}
          <div className="glass-panel p-6 rounded-2xl border border-amber-500/30 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <BellRing className="w-4 h-4" />
                <span>Relance Client</span>
              </h3>
              <button
                onClick={() => handleUpdateField({ followUpPaused: !lead.followUpPaused })}
                className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700"
              >
                <PauseCircle className="w-3 h-3" />
                <span>{lead.followUpPaused ? 'Auto en pause' : 'Auto actif'}</span>
              </button>
            </div>

            {lead.nextFollowUpAt && !lead.optOut && (
              <div className="text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-200 p-2.5 rounded-xl">
                Prochaine relance ({lead.nextFollowUpType === 'manual' ? 'programmée' : 'automatique'}) :{' '}
                <strong>{new Date(lead.nextFollowUpAt).toLocaleString('fr-FR')}</strong>
              </div>
            )}

            <div className="space-y-2.5 text-xs">
              <textarea
                rows={3}
                value={followUpMsg}
                onChange={(e) => setFollowUpMsg(e.target.value)}
                disabled={lead.optOut}
                placeholder="Message de relance WhatsApp..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-2.5 text-white focus:border-emerald-500 focus:outline-none"
              />
              <input
                type="datetime-local"
                value={followUpWhen}
                onChange={(e) => setFollowUpWhen(e.target.value)}
                disabled={lead.optOut}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-white focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={handleScheduleFollowUp}
                disabled={scheduling || lead.optOut || !followUpMsg.trim()}
                className="w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold py-2 rounded-xl transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{scheduling ? 'Programmation...' : followUpWhen ? 'Programmer la relance' : 'Relancer maintenant'}</span>
              </button>
            </div>

            {lead.followUps?.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400">Historique des relances</span>
                {lead.followUps.slice(0, 5).map((fu: any) => (
                  <div
                    key={fu.id}
                    className="flex items-center justify-between text-[11px] bg-slate-900/70 px-2.5 py-1.5 rounded-lg border border-slate-800"
                  >
                    <div className="truncate pr-2">
                      <span
                        className={`font-bold mr-1.5 ${
                          fu.status === 'sent'
                            ? 'text-emerald-400'
                            : fu.status === 'pending'
                            ? 'text-amber-300'
                            : 'text-slate-500'
                        }`}
                      >
                        [{fu.status}]
                      </span>
                      <span className="text-slate-400">
                        {new Date(fu.sentAt || fu.scheduledAt).toLocaleString('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                    {fu.status === 'pending' && (
                      <button
                        onClick={() => handleCancelFollowUp(fu.id)}
                        className="text-rose-400 hover:text-rose-300 p-0.5"
                        title="Annuler cette relance"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions rapides Conseiller */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Actions de gestion</h3>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Score : {lead.qualificationScore}/100 — Statut</label>
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
