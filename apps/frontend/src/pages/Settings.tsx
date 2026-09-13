import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
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
  Smartphone,
  QrCode,
  RotateCw,
  LogOut,
  RefreshCw,
  Save,
  Trash2,
  Plus,
  FileText,
  Zap,
  ChevronDown,
  Layers,
  Tag,
  Sparkles,
  CopyPlus,
  Wrench,
  ExternalLink,
  Upload,
  Star,
  X,
  FileUp,
  MessageSquare,
  HelpCircle,
} from 'lucide-react';
import { api } from '../lib/api';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════
interface PromptTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  prompt: string;
  isActive: boolean;
  isDefault: boolean;
  campaign: string | null;
  version: string;
  createdAt: string;
  updatedAt: string;
}

interface CatalogItem {
  id: string;
  category: string;
  title: string;
  description: string;
  triggerCondition?: string;
  campaignSlug?: string | null;
  fileName: string;
  caption: string;
  isDefault?: boolean;
  publicUrl: string;
  fileSize?: number;
  createdAt?: string;
  updatedAt?: string;
}

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

  // État WhatsApp
  const [waConnecting, setWaConnecting] = useState(false);
  const [waQrData, setWaQrData] = useState<{ qrcode?: string; base64?: string } | null>(null);
  const [waError, setWaError] = useState<string | null>(null);
  const [fixingWebhook, setFixingWebhook] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);

  // État éditeur de prompts
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedCampaign, setEditedCampaign] = useState('');
  const [promptMsg, setPromptMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showNewPromptForm, setShowNewPromptForm] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptDescription, setNewPromptDescription] = useState('');
  const [newPromptCampaign, setNewPromptCampaign] = useState('');

  // État Catalogues PDF
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [catalogBase64, setCatalogBase64] = useState<string>('');
  const [catalogTitle, setCatalogTitle] = useState('');
  const [catalogDescription, setCatalogDescription] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('general');
  const [catalogTriggerCondition, setCatalogTriggerCondition] = useState('');
  const [catalogCampaignSlug, setCatalogCampaignSlug] = useState<string>('');
  const [catalogCaption, setCatalogCaption] = useState('');
  const [catalogIsDefault, setCatalogIsDefault] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Statut WhatsApp
  const { data: waStatus, refetch: refetchWa } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await api.get('/api/whatsapp/status');
      return res.data;
    },
    refetchInterval: waQrData ? 3500 : 15000,
  });

  // Diagnostic de santé global
  const { data: health, isLoading: loadingHealth } = useQuery({
    queryKey: ['settings-health'],
    queryFn: async () => {
      const res = await api.get('/api/settings/health');
      return res.data;
    },
    refetchInterval: 30000,
  });

  // Liste des templates de prompt
  const { data: promptTemplates, isLoading: loadingPrompts } = useQuery({
    queryKey: ['prompt-templates'],
    queryFn: async () => {
      const res = await api.get('/api/prompts');
      return res.data as PromptTemplate[];
    },
  });

  // Liste des catalogues PDF disponibles
  const { data: catalogues, isLoading: loadingCatalogues } = useQuery({
    queryKey: ['catalogues'],
    queryFn: async () => {
      const res = await api.get('/api/catalogues');
      return res.data;
    },
  });

  // Liste des utilisateurs
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/api/users');
      return res.data;
    },
  });

  // Si le statut passe à connecté, on cache le QR Code
  useEffect(() => {
    if (waStatus?.connected) {
      setWaQrData(null);
    }
  }, [waStatus?.connected]);

  // Charger le template sélectionné dans l'éditeur
  useEffect(() => {
    if (promptTemplates && promptTemplates.length > 0 && !selectedTemplateId) {
      // Sélectionner le template actif par défaut
      const active = promptTemplates.find((t) => t.isActive);
      const target = active || promptTemplates[0];
      selectTemplate(target);
    }
  }, [promptTemplates]);

  const selectTemplate = (template: PromptTemplate) => {
    setSelectedTemplateId(template.id);
    setEditedPrompt(template.prompt);
    setEditedName(template.name);
    setEditedDescription(template.description || '');
    setEditedCampaign(template.campaign || '');
    setPromptMsg(null);
  };

  const selectedTemplate = promptTemplates?.find((t) => t.id === selectedTemplateId);

  // ═══════════════════════════════════════════════════════════
  // Mutations Prompts
  // ═══════════════════════════════════════════════════════════

  const savePromptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) throw new Error('Aucun template sélectionné');
      const res = await api.put(`/api/prompts/${selectedTemplateId}`, {
        name: editedName,
        description: editedDescription || null,
        prompt: editedPrompt,
        campaign: editedCampaign || null,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setPromptMsg({ type: 'success', text: `✓ Prompt "${data.name}" sauvegardé (v${data.version})` });
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setTimeout(() => setPromptMsg(null), 4000);
    },
    onError: (err: any) => {
      setPromptMsg({ type: 'error', text: err.response?.data?.error || 'Erreur lors de la sauvegarde' });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put(`/api/prompts/${id}/activate`);
      return res.data;
    },
    onSuccess: (data) => {
      setPromptMsg({ type: 'success', text: `✓ Template "${data.template.name}" activé — le bot utilise maintenant ce prompt !` });
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setTimeout(() => setPromptMsg(null), 4000);
    },
    onError: (err: any) => {
      setPromptMsg({ type: 'error', text: err.response?.data?.error || 'Erreur lors de l\'activation' });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/prompts/${id}/duplicate`);
      return res.data;
    },
    onSuccess: (data) => {
      setPromptMsg({ type: 'success', text: `✓ Template dupliqué : "${data.name}"` });
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      selectTemplate(data);
      setTimeout(() => setPromptMsg(null), 4000);
    },
    onError: (err: any) => {
      setPromptMsg({ type: 'error', text: err.response?.data?.error || 'Erreur lors de la duplication' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/api/prompts/${id}`);
      return res.data;
    },
    onSuccess: () => {
      setPromptMsg({ type: 'success', text: '✓ Template supprimé' });
      setSelectedTemplateId(null);
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setTimeout(() => setPromptMsg(null), 4000);
    },
    onError: (err: any) => {
      setPromptMsg({ type: 'error', text: err.response?.data?.error || 'Erreur lors de la suppression' });
    },
  });

  const createPromptMutation = useMutation({
    mutationFn: async () => {
      if (!newPromptName.trim()) throw new Error('Le nom est requis');
      const res = await api.post('/api/prompts', {
        name: newPromptName,
        description: newPromptDescription || null,
        campaign: newPromptCampaign || null,
        prompt: editedPrompt || 'Vous êtes un assistant commercial...',
        isActive: false,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setPromptMsg({ type: 'success', text: `✓ Template "${data.name}" créé !` });
      setShowNewPromptForm(false);
      setNewPromptName('');
      setNewPromptDescription('');
      setNewPromptCampaign('');
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      selectTemplate(data);
      setTimeout(() => setPromptMsg(null), 4000);
    },
    onError: (err: any) => {
      setPromptMsg({ type: 'error', text: err.response?.data?.error || 'Erreur lors de la création' });
    },
  });

  // ═══════════════════════════════════════════════════════════
  // Gestion & Mutations des Catalogues PDF
  // ═══════════════════════════════════════════════════════════

  const resetCatalogForm = () => {
    setCatalogFile(null);
    setCatalogBase64('');
    setCatalogTitle('');
    setCatalogDescription('');
    setCatalogCategory('general');
    setCatalogTriggerCondition('');
    setCatalogCampaignSlug('');
    setCatalogCaption('');
    setCatalogIsDefault(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setCatalogMsg({ type: 'error', text: 'Veuillez sélectionner un fichier au format PDF valide (.pdf).' });
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setCatalogMsg({ type: 'error', text: 'Le fichier dépasse la taille maximale de 25 Mo.' });
      return;
    }

    setCatalogFile(file);
    const cleanName = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    if (!catalogTitle) {
      setCatalogTitle(cleanName);
    }
    if (!catalogCaption) {
      setCatalogCaption(`📄 Voici notre catalogue officiel : ${cleanName}. N'hésitez pas si vous avez des questions !`);
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCatalogBase64(result);
    };
    reader.onerror = () => {
      setCatalogMsg({ type: 'error', text: 'Erreur lors de la lecture du fichier PDF.' });
    };
    reader.readAsDataURL(file);
  };

  const uploadCatalogMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string;
      triggerCondition?: string;
      category?: string;
      campaignSlug?: string | null;
      caption?: string;
      isDefault?: boolean;
      fileName: string;
      pdfBase64: string;
    }) => {
      const res = await api.post('/api/catalogues/upload', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogues'] });
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setCatalogMsg({ type: 'success', text: "✓ Catalogue importé avec succès ! L'IA en dispose immédiatement." });
      setShowCatalogModal(false);
      resetCatalogForm();
      setTimeout(() => setCatalogMsg(null), 5000);
    },
    onError: (err: any) => {
      setCatalogMsg({
        type: 'error',
        text: err.response?.data?.error || err.message || "Erreur lors de l'importation du catalogue",
      });
    },
  });

  const deleteCatalogMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/api/catalogues/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogues'] });
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setCatalogMsg({ type: 'success', text: '✓ Catalogue supprimé avec succès.' });
      setTimeout(() => setCatalogMsg(null), 4000);
    },
    onError: (err: any) => {
      setCatalogMsg({
        type: 'error',
        text: err.response?.data?.error || 'Erreur lors de la suppression',
      });
    },
  });

  const setDefaultCatalogMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/api/catalogues/${id}/default`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogues'] });
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setCatalogMsg({ type: 'success', text: '✓ Catalogue principal par défaut mis à jour.' });
      setTimeout(() => setCatalogMsg(null), 4000);
    },
    onError: (err: any) => {
      setCatalogMsg({
        type: 'error',
        text: err.response?.data?.error || 'Erreur lors de la mise à jour',
      });
    },
  });

  const handleSubmitCatalog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogFile || !catalogBase64) {
      setCatalogMsg({ type: 'error', text: 'Veuillez sélectionner un fichier PDF à importer.' });
      return;
    }
    if (!catalogTitle.trim()) {
      setCatalogMsg({ type: 'error', text: 'Veuillez renseigner un titre pour le catalogue.' });
      return;
    }

    uploadCatalogMutation.mutate({
      title: catalogTitle.trim(),
      description: catalogDescription.trim() || undefined,
      triggerCondition: catalogTriggerCondition.trim() || undefined,
      category: catalogCategory,
      campaignSlug: catalogCampaignSlug ? catalogCampaignSlug : null,
      caption: catalogCaption.trim() || undefined,
      isDefault: catalogIsDefault,
      fileName: catalogFile.name,
      pdfBase64: catalogBase64,
    });
  };

  // ═══════════════════════════════════════════════════════════
  // Handlers WhatsApp
  // ═══════════════════════════════════════════════════════════

  const handleConnectWhatsApp = async () => {
    setWaConnecting(true);
    setWaError(null);
    try {
      const res = await api.post('/api/whatsapp/connect');
      if (res.data?.base64 || res.data?.qrcode) {
        setWaQrData({
          qrcode: res.data.qrcode,
          base64: res.data.base64,
        });
      } else if (res.data?.state === 'open') {
        await refetchWa();
      } else {
        setWaError(res.data?.message || 'Impossible de récupérer le QR Code');
      }
    } catch (err: any) {
      setWaError(err.response?.data?.message || 'Erreur lors de la connexion à Evolution API');
    } finally {
      setWaConnecting(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!window.confirm('Voulez-vous vraiment déconnecter ce compte WhatsApp ?')) return;
    try {
      await api.post('/api/whatsapp/disconnect');
      setWaQrData(null);
      await refetchWa();
    } catch (err: any) {
      setWaError(err.response?.data?.message || 'Erreur lors de la déconnexion');
    }
  };

  const handleFixWebhook = async () => {
    setFixingWebhook(true);
    setWebhookMsg(null);
    try {
      const res = await api.post('/api/whatsapp/fix-webhook');
      setWebhookMsg(res.data?.message || 'Webhook reconfiguré');
    } catch (err: any) {
      setWebhookMsg('Erreur: ' + (err.response?.data?.message || err.message));
    } finally {
      setFixingWebhook(false);
      setTimeout(() => setWebhookMsg(null), 5000);
    }
  };

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
    if (editedPrompt) {
      navigator.clipboard.writeText(editedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      {/* En-tête */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <Shield className="w-6 h-6 text-emerald-400 shrink-0" />
          <span>Paramètres & Diagnostic Système</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Liaison WhatsApp, éditeur de prompts IA, surveillance des connecteurs et gestion des conseillers.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION : Gestion Connexion WhatsApp                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Instance WhatsApp (Evolution API)</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    waStatus?.connected
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {waStatus?.connected ? 'Connecté 🟢' : 'Déconnecté 🔴'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Instance : <code className="text-slate-300 font-bold">{waStatus?.instanceName || 'ict-main'}</code>{' '}
                {waStatus?.phone ? `• Numéro : ${waStatus.phone}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchWa()}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
              title="Vérifier le statut"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleFixWebhook}
              disabled={fixingWebhook}
              className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
              title="Réparer le webhook (utile après reconnexion)"
            >
              {fixingWebhook ? <RotateCw className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              <span>{fixingWebhook ? '...' : 'Réparer Webhook'}</span>
            </button>
            {waStatus?.connected ? (
              <button
                onClick={handleDisconnectWhatsApp}
                className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Déconnecter</span>
              </button>
            ) : (
              <button
                onClick={handleConnectWhatsApp}
                disabled={waConnecting}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/20"
              >
                {waConnecting ? <RotateCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                <span>{waConnecting ? 'Génération...' : 'Scanner le QR Code'}</span>
              </button>
            )}
          </div>
        </div>

        {waError && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{waError}</span>
          </div>
        )}

        {webhookMsg && (
          <div className="p-3 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-xl text-xs flex items-center gap-2">
            <Wrench className="w-4 h-4 shrink-0" />
            <span>{webhookMsg}</span>
          </div>
        )}

        {/* Affichage direct du QR Code dans la page */}
        {!waStatus?.connected && waQrData?.base64 && (
          <div className="p-4 sm:p-6 bg-slate-900/80 rounded-2xl border border-emerald-500/30 text-center space-y-4 animate-in fade-in duration-300">
            <div className="p-3 bg-white rounded-2xl inline-block shadow-2xl">
              <img
                src={waQrData.base64}
                alt="QR Code WhatsApp"
                className="w-48 h-48 sm:w-56 sm:h-56 mx-auto object-contain"
              />
            </div>
            <div className="space-y-1 text-xs text-slate-300 max-w-md mx-auto">
              <p className="font-bold text-emerald-400">Instructions de connexion :</p>
              <p className="text-slate-400">1. Ouvrez l'application WhatsApp sur votre téléphone.</p>
              <p className="text-slate-400">2. Allez dans Réglages / Paramètres ➔ Appareils connectés.</p>
              <p className="text-slate-400">3. Appuyez sur <strong>Connecter un appareil</strong> et scannez ce code.</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-amber-400 font-medium">
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
              <span>Attente du scan WhatsApp (actualisation automatique dès connexion)...</span>
            </div>
          </div>
        )}
      </div>

      {/* Cartes de Santé / Diagnostics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Base de données */}
        <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-2">
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
        <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-300">Evolution API</span>
            <Smartphone className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                waStatus?.connected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            ></span>
            <span className="text-sm font-extrabold text-white">
              {waStatus?.connected ? 'Prêt & Connecté' : 'En ligne (Non lié)'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">Instance : {health?.evolutionApi?.instance}</p>
        </div>

        {/* HubSpot CRM */}
        <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-2">
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
        <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-2">
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION : Éditeur de Prompts & Templates               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
        {/* Header éditeur */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Éditeur de Prompts & Templates de Campagne
              </h2>
              <p className="text-xs text-slate-400">
                Éditez le prompt système, créez des variantes pour vos campagnes et activez celui que le bot utilise.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowNewPromptForm(!showNewPromptForm)}
              className="flex items-center gap-1.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/40 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Template</span>
            </button>
          </div>
        </div>

        {/* Message de retour */}
        {promptMsg && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              promptMsg.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {promptMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{promptMsg.text}</span>
          </div>
        )}

        {/* Formulaire nouveau template */}
        {showNewPromptForm && (
          <div className="p-4 bg-slate-900/80 rounded-xl border border-violet-500/30 space-y-3 animate-in fade-in duration-200">
            <h3 className="text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Créer un nouveau template
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nom du template *</label>
                <input
                  type="text"
                  placeholder="Ex: Campagne Facebook Kribi"
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Prompt adapté aux prospects venant de FB"
                  value={newPromptDescription}
                  onChange={(e) => setNewPromptDescription(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Campagne associée</label>
                <input
                  type="text"
                  placeholder="Ex: campagne_facebook_kribi"
                  value={newPromptCampaign}
                  onChange={(e) => setNewPromptCampaign(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => createPromptMutation.mutate()}
                disabled={createPromptMutation.isPending || !newPromptName.trim()}
                className="flex items-center gap-1.5 bg-violet-500 hover:bg-violet-400 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-lg shadow-violet-500/20"
              >
                {createPromptMutation.isPending ? <RotateCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Créer</span>
              </button>
              <button
                onClick={() => setShowNewPromptForm(false)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Sélecteur de template */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Liste des templates (sidebar) */}
          <div className="sm:w-72 shrink-0 space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold px-2 pb-1 flex items-center gap-1.5">
              <Layers className="w-3 h-3" />
              Templates ({promptTemplates?.length || 0})
            </p>
            {loadingPrompts ? (
              <div className="text-xs text-slate-500 px-2">Chargement...</div>
            ) : (
              promptTemplates?.map((template) => (
                <button
                  key={template.id}
                  onClick={() => selectTemplate(template)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all ${
                    selectedTemplateId === template.id
                      ? 'bg-violet-500/20 border border-violet-500/40 text-white'
                      : 'bg-slate-900/50 hover:bg-slate-800 border border-transparent text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate">{template.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {template.isActive && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-400 border border-emerald-500/30">
                          ACTIF
                        </span>
                      )}
                      {template.isDefault && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/25 text-blue-400 border border-blue-500/30">
                          DEF
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500 font-mono">v{template.version}</span>
                    {template.campaign && (
                      <span className="text-[10px] text-amber-400/80 flex items-center gap-0.5">
                        <Tag className="w-2.5 h-2.5" />
                        {template.campaign}
                      </span>
                    )}
                  </div>
                  {template.description && (
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">{template.description}</p>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Éditeur de prompt */}
          <div className="flex-1 space-y-3 min-w-0">
            {selectedTemplate ? (
              <>
                {/* Champs méta du template */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Nom du template</label>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Description</label>
                    <input
                      type="text"
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      placeholder="Description courte..."
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-amber-400" />
                      Campagne associée
                    </label>
                    <input
                      type="text"
                      value={editedCampaign}
                      onChange={(e) => setEditedCampaign(e.target.value)}
                      placeholder="campagne_facebook_ads"
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Textarea du prompt */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      Contenu du Prompt Système
                    </span>
                    <span className="font-mono text-slate-500">
                      {editedPrompt.length} caractères
                    </span>
                  </label>
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    rows={16}
                    className="w-full bg-[#0b141a] border border-slate-700/80 rounded-xl px-4 py-3 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-violet-500 transition-colors resize-y"
                    placeholder="Écrivez le prompt système ici..."
                  />
                </div>

                {/* Barre d'actions */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {/* Sauvegarder */}
                  <button
                    onClick={() => savePromptMutation.mutate()}
                    disabled={savePromptMutation.isPending}
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {savePromptMutation.isPending ? <RotateCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>Sauvegarder</span>
                  </button>

                  {/* Activer */}
                  {!selectedTemplate.isActive && (
                    <button
                      onClick={() => activateMutation.mutate(selectedTemplate.id)}
                      disabled={activateMutation.isPending}
                      className="flex items-center gap-1.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/40 px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {activateMutation.isPending ? <RotateCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      <span>Activer ce template</span>
                    </button>
                  )}

                  {/* Dupliquer */}
                  <button
                    onClick={() => duplicateMutation.mutate(selectedTemplate.id)}
                    disabled={duplicateMutation.isPending}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 border border-slate-700"
                  >
                    {duplicateMutation.isPending ? <RotateCw className="w-4 h-4 animate-spin" /> : <CopyPlus className="w-4 h-4" />}
                    <span>Dupliquer</span>
                  </button>

                  {/* Copier */}
                  <button
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border border-slate-700"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copié !' : 'Copier'}</span>
                  </button>

                  {/* Supprimer */}
                  {!selectedTemplate.isDefault && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Supprimer le template "${selectedTemplate.name}" ? Cette action est irréversible.`)) {
                          deleteMutation.mutate(selectedTemplate.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="flex items-center gap-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ml-auto"
                    >
                      {deleteMutation.isPending ? <RotateCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      <span>Supprimer</span>
                    </button>
                  )}
                </div>

                {/* Info version */}
                <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-1">
                  <span>Version : <code className="text-violet-400 font-bold">{selectedTemplate.version}</code></span>
                  <span>Slug : <code className="text-slate-400">{selectedTemplate.slug}</code></span>
                  {selectedTemplate.isActive && (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Ce template est actuellement utilisé par le bot
                    </span>
                  )}
                </div>

                {/* Liaison intelligente avec les Catalogues PDF */}
                <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>
                        Catalogues connectés à ce prompt (
                        {(catalogues as CatalogItem[] | undefined)?.filter(
                          (c) =>
                            !c.campaignSlug ||
                            c.campaignSlug === selectedTemplate.slug ||
                            c.campaignSlug === selectedTemplate.campaign
                        )?.length || 0}
                        )
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Synchronisé en direct avec l'IA
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    L'IA sait exactement quels catalogues sont disponibles. Dès qu'un prospect montre un intérêt, elle choisira le catalogue le plus approprié selon vos règles.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {(catalogues as CatalogItem[] | undefined)
                      ?.filter(
                        (c) =>
                          !c.campaignSlug ||
                          c.campaignSlug === selectedTemplate.slug ||
                          c.campaignSlug === selectedTemplate.campaign
                      )
                      .map((c) => (
                        <div key={c.id} className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-start gap-2">
                          <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-200 truncate">{c.title}</span>
                              {c.isDefault && (
                                <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold shrink-0">
                                  ⭐ Par défaut
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-emerald-400/90 truncate mt-0.5">
                              🎯 {c.triggerCondition || 'Sur demande générale du catalogue'}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
                <div className="text-center space-y-2">
                  <FileText className="w-8 h-8 mx-auto opacity-30" />
                  <p>Sélectionnez un template dans la liste</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION : Catalogues & Brochures PDF                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Catalogues & Brochures PDF (Envoi WhatsApp)</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {catalogues?.length || 0} Disponibles
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Gérez en toute autonomie vos catalogues PDF. L'IA les analyse et les propose automatiquement aux prospects selon vos règles.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              resetCatalogForm();
              setShowCatalogModal(true);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/20 shrink-0"
          >
            <FileUp className="w-4 h-4" />
            <span>+ Importer un Catalogue ou une Brochure PDF</span>
          </button>
        </div>

        {/* Message d'état Catalogue */}
        {catalogMsg && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              catalogMsg.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {catalogMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{catalogMsg.text}</span>
          </div>
        )}

        {/* Modal d'importation de catalogue */}
        {showCatalogModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <FileUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">Importer un Catalogue ou une Brochure PDF</h3>
                    <p className="text-xs text-slate-400">
                      Ajoutez un PDF officiel et définissez la règle pour que le bot sache quand le proposer.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCatalogModal(false);
                    resetCatalogForm();
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSubmitCatalog} className="p-5 space-y-4 overflow-y-auto">
                {/* Fichier PDF */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Fichier PDF à importer <span className="text-rose-400">*</span>
                  </label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                      catalogFile
                        ? 'border-emerald-500/60 bg-emerald-500/5'
                        : 'border-slate-700 hover:border-slate-600 bg-slate-950/40'
                    }`}
                  >
                    {catalogFile ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-left min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate max-w-[280px] sm:max-w-md">{catalogFile.name}</p>
                            <p className="text-[10px] text-slate-400">
                              Taille : {Math.round(catalogFile.size / 1024)} Ko • Fichier PDF prêt à l'envoi
                            </p>
                          </div>
                        </div>
                        <label className="cursor-pointer text-xs font-bold text-emerald-400 hover:text-emerald-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 shrink-0">
                          Changer
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center space-y-2 py-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div className="text-xs text-slate-300">
                          <span className="font-bold text-emerald-400 hover:underline">Cliquez pour choisir votre PDF</span> ou glissez-le ici
                        </div>
                        <p className="text-[10px] text-slate-500">Format PDF uniquement • Taille maximum : 25 Mo</p>
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Titre */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Titre convivial du document <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Catalogue Officiel Formations 2026, Brochure Métiers du Numérique..."
                    value={catalogTitle}
                    onChange={(e) => setCatalogTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Nom clair et vendeur qui sera présenté au prospect.
                  </p>
                </div>

                {/* Quand l'Agent IA doit-il le proposer ? */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Quand l'Agent IA doit-il proposer ce catalogue ?</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Proposer ce catalogue dès que le prospect demande les formations en informatique, programmation ou s'interroge sur les tarifs généraux."
                    value={catalogTriggerCondition}
                    onChange={(e) => setCatalogTriggerCondition(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-emerald-400/90 mt-1 flex items-center gap-1">
                    🎯 L'IA lit directement cette consigne pour décider d'envoyer ou non ce document précis.
                  </p>
                </div>

                {/* Catégorie & Campagne */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Catégorie</label>
                    <select
                      value={catalogCategory}
                      onChange={(e) => setCatalogCategory(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="general">Général (Tous programmes)</option>
                      <option value="tech">Technologies & Informatique</option>
                      <option value="business">Management & Entreprise</option>
                      <option value="sante">Santé & Médical</option>
                      <option value="langues">Langues & Certifications</option>
                      <option value="autre">Autre spécialité</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Campagne / Prompt associé</label>
                    <select
                      value={catalogCampaignSlug}
                      onChange={(e) => setCatalogCampaignSlug(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Tous les prompts (Général)</option>
                      {promptTemplates?.map((t) => (
                        <option key={t.id} value={t.campaign || t.slug}>
                          {t.name} ({t.campaign || t.slug})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Associez ce document à une campagne précise ou laissez pour tous.
                    </p>
                  </div>
                </div>

                {/* Légende WhatsApp */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Message d'accompagnement WhatsApp (Légende du PDF)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 📄 Voici notre catalogue officiel ICT. N'hésitez pas si vous avez des questions !"
                    value={catalogCaption}
                    onChange={(e) => setCatalogCaption(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Ce texte accompagne directement le fichier PDF dans la bulle WhatsApp du prospect.
                  </p>
                </div>

                {/* Définir par défaut */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="catIsDefault"
                    checked={catalogIsDefault}
                    onChange={(e) => setCatalogIsDefault(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="catIsDefault" className="text-xs text-slate-300 font-medium cursor-pointer">
                    Définir comme catalogue principal par défaut (envoyé si aucune règle spécifique ne correspond)
                  </label>
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCatalogModal(false);
                      resetCatalogForm();
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!catalogFile || !catalogTitle.trim() || uploadCatalogMutation.isPending}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadCatalogMutation.isPending ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        <span>Enregistrement du PDF...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Enregistrer & Mettre à disposition du Bot</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Grille des catalogues */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loadingCatalogues ? (
            <div className="col-span-2 text-center text-xs text-slate-500 py-6">
              Chargement des catalogues...
            </div>
          ) : catalogues?.length === 0 ? (
            <div className="col-span-2 text-center text-xs text-slate-500 py-10 border border-dashed border-slate-800 rounded-xl space-y-2">
              <FileText className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
              <p className="text-slate-400 font-medium">Aucun catalogue ou brochure disponible.</p>
              <p className="text-[11px] text-slate-500">Cliquez sur le bouton ci-dessus pour importer votre premier document PDF.</p>
            </div>
          ) : (
            catalogues?.map((cat: any) => (
              <div
                key={cat.id}
                className={`p-4 rounded-xl bg-slate-900/70 border transition-all flex flex-col justify-between space-y-3 ${
                  cat.isDefault
                    ? 'border-amber-500/40 shadow-sm shadow-amber-500/5'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {cat.isDefault && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-300" />
                          <span>Par défaut</span>
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                          cat.category === 'general'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                        }`}
                      >
                        {cat.category === 'general' ? 'Catalogue Principal' : `Brochure ${cat.category}`}
                      </span>
                      {cat.campaignSlug && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/30">
                          Campagne : {cat.campaignSlug}
                        </span>
                      )}
                      {cat.fileSize && (
                        <span className="text-[10px] text-slate-500">
                          {Math.round(cat.fileSize / 1024)} Ko
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-1">{cat.title}</h3>

                  {/* Règle IA */}
                  <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-slate-300">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-400 text-[10px] uppercase tracking-wider mb-0.5">
                      <Sparkles className="w-3 h-3" />
                      <span>Quand le bot le propose :</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      {cat.triggerCondition || cat.description || "Proposé lorsque le client demande des informations générales ou le catalogue des programmes."}
                    </p>
                  </div>

                  {/* Légende WhatsApp */}
                  {cat.caption && (
                    <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400">
                      <span className="text-[10px] font-semibold text-slate-500 block mb-0.5">Légende WhatsApp :</span>
                      <p className="italic text-slate-300 truncate">"{cat.caption}"</p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-[150px]" title={cat.fileName}>
                    {cat.fileName}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={cat.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs flex items-center gap-1 transition-colors border border-slate-700"
                      title="Ouvrir le fichier PDF dans un nouvel onglet"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Consulter</span>
                    </a>

                    {!cat.isDefault && (
                      <button
                        onClick={() => setDefaultCatalogMutation.mutate(cat.id)}
                        disabled={setDefaultCatalogMutation.isPending}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium text-xs flex items-center gap-1 transition-colors border border-amber-500/30"
                        title="Définir ce catalogue comme catalogue principal par défaut"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>Par défaut</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (window.confirm(`Supprimer définitivement le catalogue "${cat.title}" ?`)) {
                          deleteCatalogMutation.mutate(cat.id);
                        }
                      }}
                      disabled={deleteCatalogMutation.isPending}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 transition-colors border border-rose-500/30"
                      title="Supprimer ce catalogue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-300 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-emerald-300">Fonctionnement intelligent de l'Agent IA :</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Dès que vous ajoutez ou modifiez un catalogue ici, l'IA adapte automatiquement son raisonnement. Lorsqu'un prospect converse sur WhatsApp et demande un programme ou confirme son accord, le bot lui annonce le document puis expédie automatiquement le PDF dans la foulée. Vos conseillers peuvent également cliquer sur <strong>"Envoyer Catalogue PDF"</strong> directement depuis la conversation.
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SECTION : Gestion des Utilisateurs & Conseillers       */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire ajout agent */}
        <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
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
              {userMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{userMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Nom complet</label>
              <input
                type="text"
                required
                placeholder="Ex: Brenda Nguemo"
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
        <div className="lg:col-span-2 glass-panel p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Comptes Conseillers & Administrateurs</span>
          </h2>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-left text-xs min-w-[340px]">
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
                    <td className="py-2.5 px-3 text-slate-400 truncate">{u.email}</td>
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
