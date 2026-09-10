import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
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
  Menu,
  CheckCircle2,
  AlertCircle,
  QrCode,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import { WhatsAppModal } from './WhatsAppModal';

export const Layout: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [socketConnected, setSocketConnected] = useState(false);
  const [activeAlert, setActiveAlert] = useState<{ leadId: string; reason: string; lead: any } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [whatsAppConnected, setWhatsAppConnected] = useState<boolean | null>(null);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);

  // Fermer le menu mobile lors d'un changement de route
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Vérifier le statut WhatsApp
  const checkWhatsApp = async () => {
    try {
      const res = await api.get('/api/whatsapp/status');
      setWhatsAppConnected(Boolean(res.data?.connected));
    } catch {
      setWhatsAppConnected(false);
    }
  };

  useEffect(() => {
    checkWhatsApp();
    const interval = setInterval(checkWhatsApp, 20000);
    return () => clearInterval(interval);
  }, []);

  // Socket.IO
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

  const navLinks = [
    {
      to: '/',
      label: "Vue d'ensemble",
      icon: LayoutDashboard,
      badge: null,
      adminOnly: false,
    },
    {
      to: '/conversations',
      label: 'Conversations',
      icon: MessageSquare,
      badge: 'Live',
      badgeColor: 'bg-emerald-500/20 text-emerald-400',
      adminOnly: false,
    },
    {
      to: '/leads',
      label: 'Leads & Prospects',
      icon: Users,
      badge: null,
      adminOnly: false,
    },
    {
      to: '/simulator',
      label: 'Simulateur Bot',
      icon: Smartphone,
      badge: 'Test',
      badgeColor: 'bg-amber-500/20 text-amber-400',
      adminOnly: false,
    },
    {
      to: '/settings',
      label: 'Paramètres',
      icon: Settings,
      badge: null,
      adminOnly: true,
    },
  ];

  return (
    <div className="flex h-screen bg-[#0b141a] text-slate-100 overflow-hidden relative">
      {/* Navigation Desktop (fixe à gauche sur grand écran) */}
      <aside className="hidden md:flex w-64 bg-[#111b21] border-r border-slate-800 flex-col justify-between select-none shrink-0">
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
            {navLinks
              .filter((l) => !l.adminOnly || isAdmin)
              .map((l) => {
                const Icon = l.icon;
                return (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`
                    }
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5" />
                      <span>{l.label}</span>
                    </div>
                    {l.badge && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${l.badgeColor}`}>
                        {l.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
          </nav>
        </div>

        {/* Bouton rapide état WhatsApp + Profil utilisateur */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/40 space-y-2">
          <button
            onClick={() => setWhatsAppModalOpen(true)}
            className={`w-full p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
              whatsAppConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  whatsAppConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              ></span>
              <span>{whatsAppConnected ? 'WhatsApp Connecté' : 'WhatsApp Déconnecté'}</span>
            </div>
            <QrCode className="w-3.5 h-3.5 opacity-80" />
          </button>

          <div className="flex items-center justify-between p-2 rounded-xl">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-xs">
                {user?.name?.substring(0, 2).toUpperCase() || 'US'}
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-white truncate">{user?.name || 'Utilisateur'}</p>
                <p className="text-[10px] text-slate-400 capitalize">
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

      {/* Navigation Mobile (Tiroir Overlay) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop sombre */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          ></div>

          {/* Tiroir coulissant */}
          <div className="relative w-4/5 max-w-xs bg-[#111b21] border-r border-slate-800 flex flex-col justify-between p-4 z-10 animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg">
                    <span className="text-lg font-black text-white">ICT</span>
                  </div>
                  <span className="font-bold text-sm text-white">Inside Cameroon</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="py-4 space-y-1.5">
                {navLinks
                  .filter((l) => !l.adminOnly || isAdmin)
                  .map((l) => {
                    const Icon = l.icon;
                    return (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        end={l.to === '/'}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-3.5 py-3 rounded-xl font-medium text-sm transition-all ${
                            isActive
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                          }`
                        }
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className="w-5 h-5" />
                          <span>{l.label}</span>
                        </div>
                        {l.badge && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${l.badgeColor}`}>
                            {l.badge}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
              </nav>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setWhatsAppModalOpen(true);
                }}
                className={`w-full p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                  whatsAppConnected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <span>{whatsAppConnected ? '🟢 WhatsApp Connecté' : '🔴 Connecter WhatsApp'}</span>
                <QrCode className="w-4 h-4" />
              </button>

              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-rose-400"
              >
                <LogOut className="w-4 h-4" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zone principale */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Header Responsive */}
        <header className="h-14 bg-[#111b21] border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            {/* Bouton Hamburger sur mobile */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Titre sur mobile */}
            <div className="flex md:hidden items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-xs font-bold text-white">ICT Bot</span>
            </div>

            {/* Indicateur Socket temps réel */}
            <div className="hidden sm:flex items-center space-x-2 text-xs">
              {socketConnected ? (
                <div className="flex items-center space-x-1.5 text-emerald-400 font-medium">
                  <Wifi className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Temps réel connecté</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 text-amber-400 font-medium">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Reconnexion...</span>
                </div>
              )}
            </div>
          </div>

          {/* Bouton d'accès direct WhatsApp Connect */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={() => setWhatsAppModalOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                whatsAppConnected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  whatsAppConnected ? 'bg-emerald-400' : 'bg-rose-500 animate-ping'
                }`}
              ></span>
              <span className="hidden sm:inline">
                {whatsAppConnected ? 'WhatsApp Prêt' : 'Lier WhatsApp (QR)'}
              </span>
              <span className="sm:hidden">WhatsApp</span>
            </button>
          </div>
        </header>

        {/* Alerte popup temps réel lead chaud / B2B */}
        {activeAlert && (
          <div className="bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-orange-500/20 border-b border-amber-500/40 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 animate-pulse-subtle shrink-0">
            <div className="flex items-center space-x-2.5 min-w-0 truncate">
              <div className="w-6 h-6 rounded-full bg-rose-500/30 text-rose-300 flex items-center justify-center shrink-0">
                <Flame className="w-3.5 h-3.5" />
              </div>
              <p className="text-xs text-slate-200 truncate">
                <strong className="text-amber-300 uppercase tracking-wide mr-1.5">
                  Alerte Prioritaire :
                </strong>
                {activeAlert.reason} —{' '}
                <span className="font-semibold text-white">
                  {activeAlert.lead?.firstName || ''} {activeAlert.lead?.lastName || activeAlert.lead?.phone}
                </span>
              </p>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => {
                  navigate(`/conversations`);
                  setActiveAlert(null);
                }}
                className="text-[11px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg transition-colors"
              >
                Voir chat
              </button>
              <button onClick={() => setActiveAlert(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Contenu de la page avec défilement */}
        <main className="flex-1 overflow-auto bg-[#0b141a] min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Modal de connexion WhatsApp QR Code */}
      <WhatsAppModal
        isOpen={whatsAppModalOpen}
        onClose={() => setWhatsAppModalOpen(false)}
        onStatusChange={(connected) => setWhatsAppConnected(connected)}
      />
    </div>
  );
};
