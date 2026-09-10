import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  UserPlus,
  Server,
  Cpu,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';

export const Settings: React.FC = () => {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  // Formulaire création utilisateur
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'agent' | 'admin'>('agent');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMsg, setUserMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Diagnostic de santé
  const { data: health, isLoading: loadingHealth } = useQuery({
    queryKey: ['settings-health'],
    queryFn: async () => {
      const res = await api.get('/api/settings/health');
      return res.data;
    },
    refetchInterval: 30000,
  });

  // Prompt système
  const { data: promptData, isLoading: loadingPrompt } = useQuery({
    queryKey: ['settings-prompt'],
    queryFn: async () => {
      const res = await api.get('/api/settings/prompt');
      return res.data;
    },
  });

  // Liste des utilisateurs
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/api/users');
      return res.data;
    },
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserMsg(null);
    setCreatingUser(true);

    try {
      await api.post('/api/users', { name, email, password, role });
      setUserMsg({ type: 'success', text: `Utilisateur ${name} créé avec succès !` });
      setName('');
      setEmail('');
      setPassword('');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      setUserMsg({
        type: 'error',
        text: err.response?.data?.error || 'Erreur lors de la création du compte',
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCopyPrompt = () => {
    if (promptData?.prompt) {
      navigator.clipboard.writeText(promptData.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <Shield className="w-6 h-6 text-emerald-400" />
          <span>Paramètres & Diagnostic Système</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Surveillance des connecteurs (Evolution API, HubSpot, IA), gestion des conseillers et contrôle du prompt.
        </p>
      </div>

      {/* Cartes de Santé / Diagnostics (Section 8.5) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Base de données */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-300">Base de données</span>
            <Server className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="text-sm font-extrabold text-white">
              {loadingHealth ? '...' : health?.database?.status === 'healthy' ? 'Connectée' : 'Erreur'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">{health?.database?.type}</p>
        </div>

        {/* Evolution API (WhatsApp) */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-300">Evolution API</span>
            <span className="text-[10px] text-emerald-400 font-mono">Instance WhatsApp</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                health?.evolutionApi?.status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            ></span>
            <span className="text-sm font-extrabold text-white">
              {loadingHealth
                ? '...'
                : health?.evolutionApi?.status === 'connected'
                ? 'En ligne'
                : 'Prêt (Simulé)'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">{health?.evolutionApi?.instance}</p>
        </div>

        {/* HubSpot CRM */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-300">HubSpot CRM</span>
            <span className="text-[10px] text-amber-400 font-mono">Contacts & Deals</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                health?.hubspot?.status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            ></span>
            <span className="text-sm font-extrabold text-white">
              {loadingHealth
                ? '...'
                : health?.hubspot?.status === 'connected'
                ? 'Actif'
                : 'Mode Démo/Local'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">Pipeline: {health?.hubspot?.pipelineId}</p>
        </div>

        {/* Moteur IA */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-300">Moteur IA</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="text-sm font-extrabold text-white">Actif</span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">{health?.ai?.provider}</p>
        </div>
      </div>

      {/* Visualisation Prompt Système Actif */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Prompt Système Actif (Lecture Seule)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Version :{' '}
              <span className="font-mono text-emerald-400 font-bold">
                {promptData?.version || '1.0.0'}
              </span>{' '}
              (Stocké dans <code className="text-slate-300">modules/agent/prompts/lead-qualification.ts</code>)
            </p>
          </div>

          <button
            onClick={handleCopyPrompt}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copié !' : 'Copier le prompt'}</span>
          </button>
        </div>

        <div className="bg-[#0b141a] p-4 rounded-xl border border-slate-800 max-h-72 overflow-y-auto font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
          {promptData?.prompt || 'Chargement du prompt...'}
        </div>
      </div>

      {/* Gestion des Utilisateurs & Conseillers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire ajout agent */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>Ajouter un Conseiller</span>
          </h2>

          {userMsg && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                userMsg.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              {userMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{userMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Nom complet</label>
              <input
                type="text"
                required
                placeholder="Ex: Samuel Eto'o"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Email</label>
              <input
                type="email"
                required
                placeholder="agent@ict.cm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Mot de passe provisoire</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Rôle</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="agent">Conseiller Commercial (Agent)</option>
                <option value="admin">Administrateur (Admin)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creatingUser}
              className="w-full mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
            >
              {creatingUser ? 'Création...' : 'Créer le compte'}
            </button>
          </form>
        </div>

        {/* Liste des utilisateurs enregistrés */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Comptes Conseillers & Administrateurs</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Nom</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Rôle</th>
                  <th className="py-2.5 px-3">Leads assignés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {users?.map((u: any) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-3 font-semibold text-white">{u.name}</td>
                    <td className="py-2.5 px-3 text-slate-400">{u.email}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          u.role === 'admin'
                            ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {u.role === 'admin' ? 'Admin' : 'Agent'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{u._count?.leads || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
