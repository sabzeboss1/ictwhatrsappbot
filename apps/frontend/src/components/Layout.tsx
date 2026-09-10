import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Settings,
  LogOut,
  Smartphone,
  Flame,
  Wifi,
  WifiOff,
  Bell,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { getSocket } from '../lib/socket';

export const Layout: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [socketConnected, setSocketConnected] = useState(false);
  const [activeAlert, setActiveAlert] = useState<{ leadId: string; reason: string; lead: any } | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => setSocketConnected(true);
    const handleDisconnect = () => setSocketConnected(false);

    if (socket.connected) {
      setSocketConnected(true);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    socket.on('lead:alert', (payload) => {
      setActiveAlert(payload);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('lead:alert');
    };
  }, []);

  return (
    <div className="flex h-screen bg-[#0b141a] text-slate-100 overflow-hidden">
      {/* Barre latérale de navigation */}
      <aside className="w-64 bg-[#111b21] border-r border-slate-800 flex flex-col justify-between select-none">
        <div>
          {/* Logo & Header */}
          <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                <span className="text-xl font-black text-white">ICT</span>
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-wide text-white leading-tight">Inside Cameroon</h1>
                <div className="flex items-center space-x-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-xs text-emerald-400 font-medium">WhatsApp AI</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1.5">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Vue d'ensemble</span>
            </NavLink>

            <NavLink
              to="/conversations"
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <div className="flex items-center space-x-3">
                <MessageSquare className="w-5 h-5" />
                <span>Conversations</span>
              </div>
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                Live
              </span>
            </NavLink>

            <NavLink
              to="/leads"
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Users className="w-5 h-5" />
              <span>Leads & Prospects</span>
            </NavLink>

            <NavLink
              to="/simulator"
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <div className="flex items-center space-x-3">
                <Smartphone className="w-5 h-5 text-amber-400" />
                <span>Simulateur Bot</span>
              </div>
              <span className="bg-amber-500/20 text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                Test
              </span>
            </NavLink>

            {isAdmin && (
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`
                }
              >
                <Settings className="w-5 h-5" />
                <span>Paramètres</span>
              </NavLink>
            )}
          </nav>
        </div>

        {/* Profil utilisateur & Déconnexion */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between p-2 rounded-xl">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm">
                {user?.name?.substring(0, 2).toUpperCase() || 'US'}
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-white truncate">{user?.name || 'Utilisateur'}</p>
                <p className="text-[11px] text-slate-400 capitalize">
                  {user?.role === 'admin' ? 'Administrateur' : 'Conseiller'}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Déconnexion"
              className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Zone de contenu principale */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar avec status de connexion et alertes */}
        <header className="h-14 bg-[#111b21] border-b border-slate-800 px-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs">
              {socketConnected ? (
                <div className="flex items-center space-x-1.5 text-emerald-400 font-medium">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Temps réel connecté</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 text-amber-400 font-medium">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Reconnexion en cours...</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-xs text-slate-400">Inside Cameroon Tourism • Bot v2</span>
          </div>
        </header>

        {/* Alerte popup temps réel lead chaud / B2B */}
        {activeAlert && (
          <div className="bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-orange-500/20 border-b border-amber-500/40 px-6 py-2.5 flex items-center justify-between animate-pulse-subtle">
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 rounded-full bg-rose-500/30 text-rose-300 flex items-center justify-center">
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider mr-2">
                  Alerte Lead Prioritaire :
                </span>
                <span className="text-xs text-slate-200">
                  {activeAlert.reason} —{' '}
                  <strong>
                    {activeAlert.lead?.firstName || ''} {activeAlert.lead?.lastName || activeAlert.lead?.phone}
                  </strong>
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  navigate(`/conversations`);
                  setActiveAlert(null);
                }}
                className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded-lg transition-colors"
              >
                Voir conversation
              </button>
              <button
                onClick={() => setActiveAlert(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Contenu de la page */}
        <main className="flex-1 overflow-auto bg-[#0b141a]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
