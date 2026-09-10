import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  LogOut,
  QrCode,
  X,
  Phone,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (connected: boolean) => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  onStatusChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [qrCodeData, setQrCodeData] = useState<{ qrcode?: string; base64?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Charger le statut
  const fetchStatus = async () => {
    try {
      const res = await api.get('/api/whatsapp/status');
      setStatus(res.data);
      if (onStatusChange) {
        onStatusChange(Boolean(res.data?.connected));
      }
      if (res.data?.connected) {
        setQrCodeData(null);
      }
      return res.data;
    } catch (err: any) {
      console.warn('Erreur fetch whatsapp status:', err.message);
      return null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  // Polling automatique si le QR code est affiché pour détecter la connexion
  useEffect(() => {
    let interval: any = null;
    if (isOpen && qrCodeData) {
      interval = setInterval(async () => {
        const s = await fetchStatus();
        if (s?.connected) {
          clearInterval(interval);
        }
      }, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, qrCodeData]);

  // Déclencher la génération du QR code
  const handleConnect = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.post('/api/whatsapp/connect');
      if (res.data?.base64 || res.data?.qrcode) {
        setQrCodeData({
          qrcode: res.data.qrcode,
          base64: res.data.base64,
        });
      } else if (res.data?.state === 'open') {
        await fetchStatus();
      } else {
        setErrorMsg(res.data?.message || 'Impossible de générer le QR Code');
      }
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'Erreur lors de la connexion à Evolution API. Vérifiez que le conteneur est bien démarré.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Déconnecter
  const handleDisconnect = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir déconnecter ce numéro WhatsApp ?')) return;
    setLoading(true);
    try {
      await api.post('/api/whatsapp/disconnect');
      setQrCodeData(null);
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Erreur lors de la déconnexion');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#111b21] border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative space-y-6 text-slate-100">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Connexion WhatsApp</h2>
              <p className="text-xs text-slate-400">Instance Evolution API : {status?.instanceName || 'ict-main'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message d'erreur */}
        {errorMsg && (
          <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* État de connexion actuel */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-3 h-3 rounded-full ${
                status?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            ></div>
            <div>
              <span className="text-xs text-slate-400 block">Statut WhatsApp :</span>
              <span className="text-sm font-bold text-white">
                {status?.connected
                  ? `Connecté ${status.phone ? `(${status.phone})` : ''}`
                  : status?.state === 'connecting'
                  ? 'En attente de scan QR Code'
                  : 'Déconnecté'}
              </span>
            </div>
          </div>

          <button
            onClick={fetchStatus}
            title="Rafraîchir"
            className="p-2 text-slate-400 hover:text-emerald-400 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Vue 1 : Déjà connecté */}
        {status?.connected && (
          <div className="space-y-4 text-center py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Votre numéro WhatsApp est opérationnel !</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                L'IA qualifie automatiquement vos prospects et les synchronise dans HubSpot dès réception des messages.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="inline-flex items-center gap-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Déconnecter ce numéro</span>
              </button>
            </div>
          </div>
        )}

        {/* Vue 2 : QR Code à scanner */}
        {!status?.connected && qrCodeData?.base64 && (
          <div className="space-y-4 text-center py-2">
            <div className="p-4 bg-white rounded-2xl inline-block shadow-xl">
              <img
                src={qrCodeData.base64}
                alt="QR Code WhatsApp"
                className="w-56 h-56 mx-auto object-contain"
              />
            </div>

            <div className="space-y-1 text-xs text-slate-300">
              <p className="font-semibold text-emerald-400">1. Ouvrez WhatsApp sur votre smartphone</p>
              <p className="text-slate-400">2. Allez dans Réglages / Paramètres ➔ Appareils connectés</p>
              <p className="text-slate-400">3. Cliquez sur <strong>Connecter un appareil</strong> et scannez ce code</p>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-amber-400 font-medium">
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
              <span>En attente de scan (détection automatique en direct)...</span>
            </div>
          </div>
        )}

        {/* Vue 3 : Déconnecté sans QR Code généré */}
        {!status?.connected && !qrCodeData && (
          <div className="space-y-4 py-2 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto border border-slate-700">
              <QrCode className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Connectez votre WhatsApp d'entreprise</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Générez le QR Code en un clic pour lier votre numéro à l'Agent IA sans taper de commande dans le terminal.
              </p>
            </div>

            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-xs flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Génération du QR Code en cours...</span>
                </>
              ) : (
                <>
                  <QrCode className="w-4 h-4" />
                  <span>Générer le QR Code WhatsApp</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
