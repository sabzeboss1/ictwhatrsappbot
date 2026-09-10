import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  Flame,
  MessageSquare,
  TrendingUp,
  Snowflake,
  Sun,
  ShieldCheck,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

export const Overview: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['stats-overview'],
    queryFn: async () => {
      const res = await api.get('/api/stats/overview');
      return res.data;
    },
    refetchInterval: 15000,
  });

  const { data: funnel, isLoading: loadingFunnel } = useQuery({
    queryKey: ['stats-funnel'],
    queryFn: async () => {
      const res = await api.get('/api/stats/funnel');
      return res.data;
    },
  });

  // Écoute temps réel pour rafraîchir les métriques immédiatement
  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
      queryClient.invalidateQueries({ queryKey: ['stats-funnel'] });
    };

    socket.on('lead:updated', handleUpdate);
    socket.on('message:new', handleUpdate);

    return () => {
      socket.off('lead:updated', handleUpdate);
      socket.off('message:new', handleUpdate);
    };
  }, [queryClient]);

  const COLORS = ['#64748b', '#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#059669'];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span>Tableau de Bord Commercial</span>
            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2.5 py-1 rounded-full border border-emerald-500/30">
              Live IA
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Performances du bot WhatsApp ICT, qualification automatique et entonnoir de conversion.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/conversations"
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-xs sm:text-sm"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Ouvrir les conversations</span>
          </Link>
        </div>
      </div>

      {/* Cartes de synthèse KPI (Section 8.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total & Chauds */}
        <div className="glass-card rounded-2xl p-5 border border-rose-500/30 relative overflow-hidden group hover:border-rose-500/50 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Opportunités Chaudes</p>
              <p className="text-3xl font-black text-white mt-2">
                {loadingStats ? '...' : stats?.byStatus?.hot || 0}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Flame className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Score ≥ 80 ou B2B prioritaire
          </p>
        </div>

        {/* Qualifiés */}
        <div className="glass-card rounded-2xl p-5 border border-emerald-500/30 hover:border-emerald-500/50 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Prospects Qualifiés</p>
              <p className="text-3xl font-black text-white mt-2">
                {loadingStats ? '...' : stats?.byStatus?.qualified || 0}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Score de 61 à 80
          </p>
        </div>

        {/* Tièdes & Froids */}
        <div className="glass-card rounded-2xl p-5 border border-amber-500/30 hover:border-amber-500/50 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Tièdes & En cours</p>
              <p className="text-3xl font-black text-white mt-2">
                {loadingStats ? '...' : (stats?.byStatus?.warm || 0) + (stats?.byStatus?.cold || 0)}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Sun className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Nurturing ou qualification active
          </p>
        </div>

        {/* Taux de conversion */}
        <div className="glass-card rounded-2xl p-5 border border-indigo-500/30 hover:border-indigo-500/50 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Taux de Conversion</p>
              <p className="text-3xl font-black text-white mt-2">
                {loadingStats ? '...' : `${stats?.conversionRate || 0}%`}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
            {stats?.todayMessages || 0} messages traités aujourd'hui
          </p>
        </div>
      </div>

      {/* Graphique de l'entonnoir (Funnel) + Alertes Récentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entonnoir de conversion */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-white">Entonnoir des Étapes de Conversation</h2>
              <p className="text-xs text-slate-400 mt-0.5">Progression des prospects dans la machine à états IA</p>
            </div>
          </div>

          <div className="h-72 w-full">
            {loadingFunnel ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Chargement du graphique...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel || []} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <XAxis type="number" stroke="#64748b" fontSize={12} />
                  <YAxis type="category" dataKey="label" stroke="#94a3b8" fontSize={11} width={130} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="count" name="Nombre de prospects" radius={[0, 8, 8, 0]}>
                    {(funnel || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 5 Dernières alertes "Lead Chaud" nécessitant un humain */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-400" />
                <span>Alertes Conseillers</span>
              </h2>
              <span className="text-[11px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-semibold">
                Priorité
              </span>
            </div>

            <div className="space-y-3">
              {stats?.recentAlerts?.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">Aucune alerte urgente en cours</p>
              ) : (
                stats?.recentAlerts?.map((lead: any) => (
                  <Link
                    key={lead.id}
                    to={`/conversations`}
                    className="block p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 hover:border-slate-600 transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {lead.firstName ? `${lead.firstName} ${lead.lastName || ''}` : lead.phone}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {lead.company ? `${lead.company} • ` : ''}
                          {lead.recommendedOffer || 'Demande personnalisée'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-extrabold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                          {lead.qualificationScore} pts
                        </span>
                        <span className="text-[10px] text-slate-500 mt-1">{lead.nextStep}</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <Link
            to="/leads"
            className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors pt-3 border-t border-slate-800"
          >
            <span>Voir tous les leads</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
