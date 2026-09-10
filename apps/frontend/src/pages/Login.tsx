import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight, ShieldCheck, UserCheck, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/api/auth/login', { email, password });
      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Échec de connexion. Vérifiez vos identifiants.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-screen bg-[#0b141a] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Halo lumineux en arrière plan */}
      <div className="absolute w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -top-20 -left-20"></div>
      <div className="absolute w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -bottom-20 -right-20"></div>

      <div className="w-full max-w-md glass-panel rounded-3xl p-8 border border-slate-800 shadow-2xl relative z-10 space-y-6">
        {/* Logo & Titre */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-900/40">
            <span className="text-2xl font-black text-white">ICT</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight mt-3">Inside Cameroon Tourism</h1>
          <p className="text-xs text-slate-400">Plateforme de Qualification Commerciale WhatsApp AI</p>
        </div>

        {error && (
          <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Adresse email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@ict.cm"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Mot de passe</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 text-xs mt-2"
          >
            <span>{loading ? 'Connexion en cours...' : 'Se connecter au Dashboard'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Boutons de démonstration rapide 1-clic */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
          <p className="text-[11px] text-slate-400 text-center font-medium">Comptes de test pré-configurés :</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleDemoLogin('admin@ict.cm', 'Admin123!')}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-left transition-colors group"
            >
              <div className="flex items-center gap-1.5 text-purple-400 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin ICT</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">admin@ict.cm</p>
            </button>

            <button
              type="button"
              onClick={() => handleDemoLogin('agent@ict.cm', 'Agent123!')}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-left transition-colors group"
            >
              <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Conseillère</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">agent@ict.cm</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
