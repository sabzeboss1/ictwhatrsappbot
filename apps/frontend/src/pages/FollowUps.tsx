import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BellRing,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  Settings2,
  Save,
  RotateCcw,
  Trash2,
  Plus,
  ExternalLink,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { getLeadDisplayName } from '../lib/lead-utils';

export const FollowUps: React.FC = () => {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<'pending' | 'upcoming' | 'history' | 'settings'>('pending');
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({
    queryKey: ['followups-stats'],
    queryFn: async () => (await api.get('/api/followups/stats')).data,
    refetchInterval: 15000,
  });

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['followups', { tab, page }],
    queryFn: async () => {
      const res = await api.get('/api/followups', {
        params: {
          status: tab === 'pending' ? 'pending' : undefined,
          page,
          limit: 25,
        },
      });
      return res.data;
    },
    enabled: tab === 'pending' || tab === 'history',
    refetchInterval: 15000,
  });

  const { data: upcomingAuto, isLoading: loadingUpcoming } = useQuery({
    queryKey: ['followups-upcoming'],
    queryFn: async () => (await api.get('/api/followups/upcoming')).data,
    enabled: tab === 'upcoming',
    refetchInterval: 20000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ['followups-settings'],
    queryFn: async () => (await api.get('/api/followups/settings')).data,
  });

  const [form, setForm] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (settingsData && !form) {
      setForm(settingsData);
    }
  }, [settingsData]);

  const handleCancel = async (id: string) => {
    try {
      await api.delete(`/api/followups/${id}`);
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      queryClient.invalidateQueries({ queryKey: ['followups-stats'] });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSettings = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await api.put('/api/followups/settings', form);
      setForm(res.data);
      queryClient.invalidateQueries({ queryKey: ['followups-settings'] });
      queryClient.invalidateQueries({ queryKey: ['followups-stats'] });
      queryClient.invalidateQueries({ queryKey: ['followups-upcoming'] });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erreur sauvegarde paramètres');
    } finally {
      setSaving(false);
    }
  };

  const handleResetSettings = async () => {
    if (!confirm('Réinitialiser la configuration des relances aux valeurs prudentes par défaut ?')) return;
    const res = await api.post('/api/followups/settings/reset');
    setForm(res.data);
    queryClient.invalidateQueries({ queryKey: ['followups-settings'] });
    queryClient.invalidateQueries({ queryKey: ['followups-stats'] });
  };

  const updateStepDelay = (idx: number, delayHours: number) => {
    const steps = [...(form.steps || [])];
    steps[idx] = { ...steps[idx], delayHours };
    setForm({ ...form, steps });
  };

  const updateStepTemplates = (idx: number, text: string) => {
    const steps = [...(form.steps || [])];
    const templates = text
      .split('\n---\n')
      .map((s) => s.trim())
      .filter((s) => s.length >= 5);
    steps[idx] = { ...steps[idx], templates: templates.length ? templates : ['Bonjour {prenom}, avez-vous des questions ?'] };
    setForm({ ...form, steps });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <BellRing className="w-6 h-6 text-amber-400" />
            <span>Module de Relance Clients & Protection Anti-Ban</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Relances programmées et séquences automatiques (J+1 / J+2 / J+4) avec cadence aléatoire, heures ouvrées et gestion STOP.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
              stats?.autoEnabled
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${stats?.autoEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            {stats?.autoEnabled ? 'Relances Auto Actives' : 'Mode Manuel Uniquement'}
          </span>
          <span
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl border ${
              stats?.sendingWindowOpen
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
            }`}
          >
            {stats?.sendingWindowOpen ? 'Plage horaire ouverte' : 'Heures calmes (envois en pause)'}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card rounded-2xl p-4 border border-amber-500/30">
          <span className="text-[11px] font-semibold text-amber-300 uppercase">En file d'attente</span>
          <p className="text-2xl font-black text-white mt-1">{stats?.pending ?? 0}</p>
          <span className="text-[11px] text-slate-400">Relances programmées</span>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-emerald-500/30">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase">Quota 24h</span>
          <p className="text-2xl font-black text-white mt-1">
            {stats?.sent24h ?? 0} <span className="text-sm text-slate-400 font-semibold">/ {stats?.dailyQuota ?? 40}</span>
          </p>
          <span className="text-[11px] text-slate-400">Plafond anti-bannissement</span>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-indigo-500/30">
          <span className="text-[11px] font-semibold text-indigo-300 uppercase">Taux de réponse (30j)</span>
          <p className="text-2xl font-black text-white mt-1">{stats?.replyRate30d ?? 0}%</p>
          <span className="text-[11px] text-slate-400">{stats?.sent30d ?? 0} relance(s) sur 30j</span>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-rose-500/30">
          <span className="text-[11px] font-semibold text-rose-300 uppercase">Désinscrits (STOP)</span>
          <p className="text-2xl font-black text-white mt-1">{stats?.optOuts ?? 0}</p>
          <span className="text-[11px] text-slate-400">Exclus automatiquement</span>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-300 uppercase">Protection Active</span>
          <p className="text-sm font-extrabold text-emerald-400 mt-1.5 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Anti-Spam Baileys
          </p>
          <span className="text-[11px] text-slate-400">Délai aléatoire + présence</span>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 text-xs font-bold">
        <button
          onClick={() => {
            setTab('pending');
            setPage(1);
          }}
          className={`px-3.5 py-2 rounded-xl transition-all ${
            tab === 'pending'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          File programmée ({stats?.pending ?? 0})
        </button>
        <button
          onClick={() => setTab('upcoming')}
          className={`px-3.5 py-2 rounded-xl transition-all ${
            tab === 'upcoming'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          Prochaines relances auto
        </button>
        <button
          onClick={() => {
            setTab('history');
            setPage(1);
          }}
          className={`px-3.5 py-2 rounded-xl transition-all ${
            tab === 'history'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          Historique complet
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('settings')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              tab === 'settings'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Configuration & Anti-Ban</span>
          </button>
        )}
      </div>

      {/* Contenu de l'onglet File Programmée ou Historique */}
      {(tab === 'pending' || tab === 'history') && (
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Prospect</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Message</th>
                  <th className="py-3.5 px-4">Échéance / Envoi</th>
                  <th className="py-3.5 px-4">Statut</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {loadingList ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      Chargement...
                    </td>
                  </tr>
                ) : !listData?.data?.length ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      {tab === 'pending'
                        ? "Aucune relance en attente. Vous pouvez relancer un ou plusieurs prospects depuis le menu Leads & Prospects."
                        : 'Aucun historique de relance.'}
                    </td>
                  </tr>
                ) : (
                  listData.data.map((fu: any) => (
                    <tr key={fu.id} className="hover:bg-slate-800/30">
                      <td className="py-3.5 px-4">
                        <Link
                          to={`/leads/${fu.leadId}`}
                          className="font-bold text-white hover:text-emerald-400 flex items-center gap-1"
                        >
                          <span>{getLeadDisplayName(fu.lead)}</span>
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </Link>
                        <div className="text-[11px] text-slate-400">
                          {fu.lead?.recommendedOffer || 'Offre non définie'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold text-[11px]">
                          {fu.type === 'auto' ? `Auto #${fu.step}` : 'Manuelle'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-md">
                        <p className="line-clamp-2 text-slate-200">{fu.message}</p>
                        {fu.error && <p className="text-[10px] text-rose-400 mt-0.5">{fu.error}</p>}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-300">
                        {new Date(fu.sentAt || fu.scheduledAt).toLocaleString('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {fu.status === 'sent' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Envoyée
                          </span>
                        ) : fu.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                            <Clock className="w-3.5 h-3.5" /> En file
                          </span>
                        ) : fu.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
                            <XCircle className="w-3.5 h-3.5" /> Échec
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <Ban className="w-3.5 h-3.5" /> {fu.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {fu.status === 'pending' && (
                          <button
                            onClick={() => handleCancel(fu.id)}
                            className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 font-semibold"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Annuler</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Onglet Prochaines relances automatiques */}
      {tab === 'upcoming' && (
        <div className="glass-panel rounded-2xl border border-slate-800 p-6 space-y-4">
          {!stats?.autoEnabled && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Les relances automatiques sont actuellement <strong>désactivées</strong> (mode sécurisé par défaut).
                  Activez-les dans l'onglet <em>Configuration & Anti-Ban</em> lorsque vos modèles sont validés.
                </span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setTab('settings')}
                  className="bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg shrink-0"
                >
                  Configurer
                </button>
              )}
            </div>
          )}

          {loadingUpcoming ? (
            <p className="text-xs text-slate-500 py-8 text-center">Calcul des prochaines échéances...</p>
          ) : !upcomingAuto?.length ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              Aucun prospect éligible aux relances automatiques pour le moment.
            </p>
          ) : (
            <div className="space-y-2.5">
              {upcomingAuto.map((item: any) => (
                <div
                  key={item.lead.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs"
                >
                  <div>
                    <Link to={`/leads/${item.lead.id}`} className="font-bold text-white hover:text-emerald-400">
                      {getLeadDisplayName(item.lead)}
                    </Link>
                    <span className="ml-2 text-slate-400">
                      • {item.lead.recommendedOffer || 'Offre en découverte'} • Score {item.lead.qualificationScore}/100
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="bg-emerald-500/15 text-emerald-300 font-bold px-2.5 py-1 rounded-lg">
                      Étape #{item.step}
                    </span>
                    <span className="text-amber-300 font-semibold">
                      Prévue le {new Date(item.nextAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Onglet Configuration & Règles Anti-Bannissement */}
      {tab === 'settings' && form && (
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Garde-fous Anti-Bannissement WhatsApp (Evolution API / Baileys)</span>
                </h2>
                <p className="text-slate-400 mt-0.5">
                  Ces paramètres imitent un conseiller humain et empêchent WhatsApp de détecter un envoi automatisé de masse.
                </p>
              </div>
              <label className="inline-flex items-center gap-2.5 cursor-pointer bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.autoEnabled)}
                  onChange={(e) => setForm({ ...form, autoEnabled: e.target.checked })}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-0"
                />
                <span className="font-bold text-white">Activer les relances automatiques</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Quota max / 24h (recommandé ≤ 50)</label>
                <input
                  type="number"
                  value={form.maxPerDay}
                  onChange={(e) => setForm({ ...form, maxPerDay: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Écart min / max entre 2 envois (sec)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={form.minGapSeconds}
                    onChange={(e) => setForm({ ...form, minGapSeconds: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                  <span>à</span>
                  <input
                    type="number"
                    value={form.maxGapSeconds}
                    onChange={(e) => setForm({ ...form, maxGapSeconds: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Plage d'envoi autorisée (heure Douala)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={form.quietEndHour}
                    onChange={(e) => setForm({ ...form, quietEndHour: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    title="Heure de début des envois (ex: 8h)"
                  />
                  <span>h →</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={form.quietStartHour}
                    onChange={(e) => setForm({ ...form, quietStartHour: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    title="Heure de fin des envois (ex: 20h)"
                  />
                  <span>h</span>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Score minimum pour relancer</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.minScore}
                  onChange={(e) => setForm({ ...form, minScore: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-2">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.skipIfHumanHandling)}
                  onChange={(e) => setForm({ ...form, skipIfHumanHandling: e.target.checked })}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500"
                />
                <span className="text-slate-300">Ne pas relancer automatiquement si un conseiller humain a pris la main</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.includeStopFooter)}
                  onChange={(e) => setForm({ ...form, includeStopFooter: e.target.checked })}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500"
                />
                <span className="text-slate-300">Ajouter la mention de désinscription STOP (fortement recommandé contre les signalements)</span>
              </label>
            </div>
          </div>

          {/* Séquence d'étapes */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Séquence de Relances & Rotation de Variantes</span>
                </h2>
                <p className="text-slate-400 mt-0.5">
                  Séparez plusieurs variantes par une ligne <code className="text-emerald-400">---</code> pour que le bot alterne aléatoirement le texte. Variables :{' '}
                  <code className="text-emerald-400">{'{prenom} {offre} {date} {participants} {prix}'}</code>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {(form.steps || []).map((step: any, idx: number) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-emerald-400">Relance #{idx + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Délai après notre dernier message sans réponse :</span>
                      <input
                        type="number"
                        min={1}
                        value={step.delayHours}
                        onChange={(e) => updateStepDelay(idx, Number(e.target.value))}
                        className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-bold"
                      />
                      <span className="text-slate-300">heures</span>
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={(step.templates || []).join('\n---\n')}
                    onChange={(e) => updateStepTemplates(idx, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono text-[11px] focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={handleResetSettings}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Valeurs par défaut</span>
              </button>

              <div className="flex items-center gap-3">
                {savedOk && <span className="text-emerald-400 font-bold">✓ Enregistré</span>}
                <button
                  onClick={handleSaveSettings}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/20"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Sauvegarde...' : 'Enregistrer la configuration'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
