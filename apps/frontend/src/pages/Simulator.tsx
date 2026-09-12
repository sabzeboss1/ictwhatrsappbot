import React, { useState } from 'react';
import axios from 'axios';
import {
  Smartphone,
  Send,
  Sparkles,
  Bot,
  Building,
  Users,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  FileText,
} from 'lucide-react';

export const Simulator: React.FC = () => {
  const [phone, setPhone] = useState('+237699001122');
  const [pushName, setPushName] = useState('Jean-Pierre Nkomo');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<Array<{ timestamp: string; type: 'sent' | 'received' | 'info'; text: string }>>([]);

  const PRESETS = [
    {
      title: 'B2B Entreprise (Team Building)',
      icon: Building,
      phone: '+237699112233',
      name: 'Directeur RH TotalEnergies',
      text: 'Bonjour, nous souhaitons organiser un séminaire team-building pour 40 cadres de notre entreprise le 15 novembre à Kribi. Pouvez-vous nous faire une proposition ?',
      description: 'Déclenche B2B, score élevé et alerte conseiller humain immédiate.',
    },
    {
      title: 'Famille (Vacances Kribi)',
      icon: Users,
      phone: '+237677445566',
      name: 'Sandrine Ebanda',
      text: 'Bonjour ! Quel est le tarif pour l’escapade à Kribi avec les chutes de la Lobé pour une famille de 4 personnes pendant les vacances de décembre ?',
      description: 'Déclenche détection Famille, dates avec chiffres et intention demande de prix.',
    },
    {
      title: 'Réservation directe & Paiement',
      icon: CreditCard,
      phone: '+237655889900',
      name: 'Marcelle Fotso',
      text: 'Bonjour, je souhaite réserver immédiatement le tour guidé au Mont Cameroun pour 2 personnes le 20 octobre. Je veux payer ma réservation par Orange Money.',
      description: 'Déclenche intention veut_reserver et routage vers Paiement.',
    },
    {
      title: 'Demande Catalogue PDF',
      icon: FileText,
      phone: '+237699554433',
      name: 'Sandrine Mbarga',
      text: 'Bonjour ! Je prépare nos prochaines vacances au Cameroun et j’aimerais découvrir toutes vos offres. Pouvez-vous m’envoyer votre catalogue complet avec les tarifs au format PDF s’il vous plaît ?',
      description: 'Déclenche la détection IA du catalogue, l\'envoi du document PDF et la notification en temps réel.',
    },
  ];

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setPhone(preset.phone);
    setPushName(preset.name);
    setMessage(preset.text);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    setSending(true);
    const sentText = message.trim();
    const now = new Date().toLocaleTimeString();

    setLogs((prev) => [
      { timestamp: now, type: 'sent', text: `[${pushName} • ${phone}]: ${sentText}` },
      ...prev,
    ]);

    try {
      // Appel du webhook WhatsApp avec le secret configuré
      const res = await axios.post(
        '/webhooks/whatsapp',
        {
          phone,
          pushName,
          message: sentText,
          messageId: `sim_${Date.now()}`,
        },
        {
          headers: {
            'X-Webhook-Secret': 'ict_evolution_secret_token_2026',
          },
        }
      );

      setLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          type: 'info',
          text: `Webhook reçu avec succès (HTTP 200). Traitement asynchrone par l'agent IA lancé. Vérifiez l'onglet "Conversations" pour voir la réponse en temps réel !`,
        },
        ...prev,
      ]);

      setMessage('');
    } catch (err: any) {
      setLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          type: 'info',
          text: `Erreur webhook : ${err.response?.data?.error || err.message}`,
        },
        ...prev,
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8">
      {/* En-tête */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 shrink-0" />
          <span>Simulateur Interactif WhatsApp</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Testez le comportement de l'agent IA, la qualification automatique, le calcul du score et les alertes sans avoir besoin d'un téléphone physique.
        </p>
      </div>

      {/* Scénarios prédéfinis en 1 clic */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Scénarios types en 1 clic</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRESETS.map((preset, idx) => {
            const Icon = preset.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="text-left glass-card p-4 rounded-2xl border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/60 transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-white leading-snug">{preset.title}</h3>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Formulaire d'injection de message */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-400" />
            <span>Émetteur du message simulé</span>
          </h2>

          <form onSubmit={handleSendMessage} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Numéro WhatsApp (E.164)</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+237699001122"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  💡 Entrez un <strong>vrai numéro</strong> avec indicatif (+237 ou +33...) pour recevoir la réponse en direct sur votre WhatsApp.
                </span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Nom du prospect (PushName)</label>
                <input
                  type="text"
                  required
                  value={pushName}
                  onChange={(e) => setPushName(e.target.value)}
                  placeholder="Jean-Pierre Nkomo"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Message WhatsApp du prospect</label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tapez le message comme si vous étiez le client..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={!message.trim() || sending}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 text-xs"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Injection en cours...' : 'Envoyer le message WhatsApp (Webhook)'}</span>
            </button>
          </form>
        </div>

        {/* Journal d'activité de test */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" />
                <span>Journal des Événements Simulés</span>
              </h2>
              {logs.length > 0 && (
                <button
                  onClick={() => setLogs([])}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  Effacer
                </button>
              )}
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
              {logs.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-16">
                  Aucun message injecté pour l'instant. Choisissez un scénario prédéfini ou écrivez un message puis cliquez sur "Envoyer".
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl text-xs border ${
                      log.type === 'sent'
                        ? 'bg-slate-900 border-slate-800 text-slate-200'
                        : 'bg-emerald-950/40 border-emerald-800/40 text-emerald-200'
                    }`}
                  >
                    <div className="text-[10px] text-slate-400 mb-1">{log.timestamp}</div>
                    <p className="leading-relaxed">{log.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Rendez-vous dans la page <strong>Conversations</strong> pour voir la réaction de l'IA en direct !</span>
          </div>
        </div>
      </div>
    </div>
  );
};
