import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Download,
  Upload,
  Key,
  Shield,
  Save,
  CheckCircle2,
  Cpu,
  Layers,
  Calculator,
  Globe,
  Radio,
  Copy,
  ExternalLink,
  Zap,
  Sparkles,
  Info,
  X,
  AlertCircle,
  Lock,
  ArrowRight,
  RotateCcw,
  HelpCircle,
  TrendingUp,
  Send,
  Bot,
  Clock,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api, authStorage } from '../services/api';
import {
  AIProvider,
  AIModel,
  TunnelStatus,
  TokenRotationStatus,
  TokenRotationMode,
  TokenRotationUnit,
} from '../types';
import { ConfirmModal } from './ConfirmModal';
import { Toast } from './Toast';
import { LanguageSelector } from './LanguageSelector';
import { useLanguage } from '../i18n/LanguageContext';

export type SettingsSubTab = 'ai' | 'risk' | 'indodax' | 'security';

interface SettingsViewProps {
  activeSubTab?: SettingsSubTab;
  onSubTabChange?: (subTab: SettingsSubTab) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  activeSubTab: externalSubTab,
  onSubTabChange,
}) => {
  const { l, formatCurrency, formatNumber, language } = useLanguage();
  const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [currentSubTab, setCurrentSubTab] = useState<SettingsSubTab>(() => {
    if (externalSubTab) return externalSubTab;
    const saved = localStorage.getItem('ai_trading_settings_subtab');
    if (saved && ['ai', 'risk', 'indodax', 'security'].includes(saved)) {
      return saved as SettingsSubTab;
    }
    return 'ai';
  });

  // Sync if externalSubTab changes from parent
  useEffect(() => {
    if (externalSubTab && externalSubTab !== currentSubTab) {
      setCurrentSubTab(externalSubTab);
    }
  }, [externalSubTab]);

  const setSubTab = (tab: SettingsSubTab) => {
    setCurrentSubTab(tab);
    localStorage.setItem('ai_trading_settings_subtab', tab);
    if (onSubTabChange) onSubTabChange(tab);
  };

  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [allModels, setAllModels] = useState<AIModel[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [importingProviderId, setImportingProviderId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // New Provider Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [provName, setProvName] = useState('');
  const [provBaseUrl, setProvBaseUrl] = useState('');
  const [provApiKeys, setProvApiKeys] = useState('');
  const [provAlias, setProvAlias] = useState('');
  const [provProtocol, setProvProtocol] = useState<'chat_completions' | 'messages'>('chat_completions');

  // Tunneling State
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus>({ active: false, type: null, url: null });
  const [selectedTunnelType, setSelectedTunnelType] = useState<'cloudflared' | 'ngrok'>('cloudflared');
  const [ngrokToken, setNgrokToken] = useState('');
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [copiedTunnelUrl, setCopiedTunnelUrl] = useState(false);

  // Risk Wizard Modal State
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [wizardCapital, setWizardCapital] = useState('100000');
  const [wizardProfile, setWizardProfile] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');

  // Antigravity Google OAuth Modal State
  const [showAntigravityModal, setShowAntigravityModal] = useState(false);
  const [agyStep, setAgyStep] = useState<'idle' | 'waiting' | 'manual' | 'exchanging' | 'success' | 'error'>('idle');
  const [agyAuthUrl, setAgyAuthUrl] = useState('');
  const [agyCallbackInput, setAgyCallbackInput] = useState('');
  const [agyError, setAgyError] = useState('');
  const [agySuccessData, setAgySuccessData] = useState<{ email?: string; projectId?: string; modelsCount?: number } | null>(null);
  const [copiedAuthUrl, setCopiedAuthUrl] = useState(false);
  const [copiedAdminToken, setCopiedAdminToken] = useState(false);

  // Telegram Test State
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramFeedback, setTelegramFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Admin Token Rotation State
  const [rotationStatus, setRotationStatus] = useState<TokenRotationStatus | null>(null);
  const [rotationLoading, setRotationLoading] = useState(false);
  const [showRotateConfirmModal, setShowRotateConfirmModal] = useState(false);
  const [showTokenPlain, setShowTokenPlain] = useState(false);
  const [rotationSuccessMessage, setRotationSuccessMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [provData, modelData, settData, tunData] = await Promise.all([
        api.getProviders(),
        api.getModels(),
        api.getSettings(),
        api.getTunnelStatus(),
      ]);
      setProviders(provData);
      setAllModels(modelData);
      setSettings(settData);
      setTunnelStatus(tunData);
      if (settData.ngrok_authtoken) {
        setNgrokToken(settData.ngrok_authtoken);
      }

      try {
        const rotData = await api.getTokenRotationStatus();
        setRotationStatus(rotData);
      } catch {
        // Fallback or observer mode
      }
    } catch (e) {
      console.error('Error loading settings', e);
    }
  };

  const handleSaveRotationConfig = async () => {
    if (!rotationStatus) return;
    try {
      setRotationLoading(true);
      const updated = await api.updateTokenRotationConfig({
        mode: rotationStatus.mode,
        intervalValue: rotationStatus.intervalValue,
        intervalUnit: rotationStatus.intervalUnit,
      });
      setRotationStatus(updated);
      setRotationSuccessMessage(l('Token rotation settings saved successfully!', 'Pengaturan rotasi token berhasil disimpan!'));
      setTimeout(() => setRotationSuccessMessage(null), 4000);
    } catch (err: any) {
      setToast({ message: err?.message || l('Failed to save token rotation settings', 'Gagal menyimpan pengaturan rotasi token'), type: 'error' });
    } finally {
      setRotationLoading(false);
    }
  };

  const handleManualRotateToken = async () => {
    try {
      setRotationLoading(true);
      setShowRotateConfirmModal(false);
      const res = await api.rotateTokenNow();
      authStorage.setToken(res.token);
      setSettings((prev) => ({ ...prev, admin_access_token: res.token }));
      if (rotationStatus) {
        setRotationStatus((prev) =>
          prev
            ? {
                ...prev,
                currentToken: res.token,
                lastRotatedAt: res.rotatedAt,
                nextRotationAt:
                  prev.mode === 'interval'
                    ? res.rotatedAt +
                      (prev.intervalUnit === 'minutes'
                        ? prev.intervalValue * 60000
                        : prev.intervalUnit === 'hours'
                        ? prev.intervalValue * 3600000
                        : prev.intervalValue * 86400000)
                    : null,
              }
            : null
        );
      }
      setRotationSuccessMessage(l('New token generated and synchronized to this session!', 'Token baru berhasil di-generate dan disinkronkan ke sesi ini!'));
      setTimeout(() => setRotationSuccessMessage(null), 5000);
    } catch (err: any) {
      setToast({ message: err?.message || l('Failed to rotate token', 'Gagal merotasi token'), type: 'error' });
    } finally {
      setRotationLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handler untuk memulai alur Google OAuth Antigravity
  const handleStartAntigravityConnect = async () => {
    setShowAntigravityModal(true);
    setAgyStep('waiting');
    setAgyError('');
    setAgyCallbackInput('');
    setAgySuccessData(null);

    try {
      const data = await api.getAntigravityAuthUrl();
      setAgyAuthUrl(data.authUrl);

      // Buka popup otorisasi Google OAuth
      const popup = window.open(data.authUrl, 'oauth_popup', 'width=600,height=720,left=250,top=100');

      // Deteksi jika popup diblokir oleh peramban
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        setAgyStep('manual');
      }
    } catch (err: any) {
      setAgyError(err.message || l('Failed to initiate Antigravity authorization.', 'Gagal memulai otorisasi Antigravity.'));
      setAgyStep('error');
    }
  };

  // Handler penukaran kode/URL callback ke backend
  const submitAntigravityCallback = async (codeOrUrl: string) => {
    if (!codeOrUrl.trim()) return;
    setAgyStep('exchanging');
    setAgyError('');

    try {
      const res = await api.exchangeAntigravityOAuth({ url: codeOrUrl.trim() });
      setAgySuccessData({
        email: res.email,
        projectId: res.projectId,
        modelsCount: res.modelsCount,
      });
      setAgyStep('success');
      await loadData();
    } catch (err: any) {
      setAgyError(err.message || l('Failed to exchange Antigravity token.', 'Gagal menukarkan token Antigravity.'));
      setAgyStep('error');
    }
  };

  // Listener untuk postMessage dari jendela callback popup
  useEffect(() => {
    const handleOAuthMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'ANTIGRAVITY_OAUTH_CALLBACK') {
        const urlOrCode = event.data.url || event.data.code;
        if (urlOrCode) {
          await submitAntigravityCallback(urlOrCode);
        }
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  // Quick Preset Helper for Provider Form
  const applyPreset = (preset: 'antigravity' | 'tokenharbor' | 'openai' | 'anthropic') => {
    if (preset === 'antigravity') {
      setShowAddForm(false);
      handleStartAntigravityConnect();
    } else if (preset === 'tokenharbor') {
      setProvName('Token Harbor');
      setProvBaseUrl('https://tokenharbor.ai/v1/chat/completions');
      setProvAlias('hrbr');
      setProvProtocol('chat_completions');
    } else if (preset === 'openai') {
      setProvName('OpenAI');
      setProvBaseUrl('https://api.openai.com/v1');
      setProvAlias('openai');
      setProvProtocol('chat_completions');
    } else if (preset === 'anthropic') {
      setProvName('Anthropic');
      setProvBaseUrl('https://api.anthropic.com/v1');
      setProvAlias('claude');
      setProvProtocol('messages');
    }
  };

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provName || !provBaseUrl || !provAlias) return;

    try {
      const keysList = provApiKeys
        .split('\n')
        .map((k) => k.trim())
        .filter(Boolean);

      const res = await api.saveProvider({
        name: provName.trim(),
        base_url: provBaseUrl.trim(),
        api_keys: keysList,
        alias: provAlias.trim().toLowerCase(),
        protocol: provProtocol,
      });

      setStatusMessage(`Provider "${provName}" berhasil disimpan! Klik tombol "{l('Auto-Import Models', 'Import Models Otomatis')}" untuk mengambil daftar model.`);
      setShowAddForm(false);
      setProvName('');
      setProvBaseUrl('');
      setProvApiKeys('');
      setProvAlias('');
      await loadData();

      if (res.providerId) {
        handleImportModels(res.providerId);
      }
    } catch (err: any) {
      setToast({ message: `Gagal menambah provider: ${err.message}`, type: 'error' });
    }
  };

  const handleDeleteProvider = (id: string) => {
    setDeleteProviderId(id);
  };

  const handleConfirmDeleteProvider = async () => {
    if (!deleteProviderId) return;
    const id = deleteProviderId;
    setDeleteProviderId(null);
    try {
      await api.deleteProvider(id);
      setToast({ message: l('Provider and associated models deleted successfully.', 'Provider dan model terkait berhasil dihapus.'), type: 'info' });
      await loadData();
    } catch (err: any) {
      setToast({ message: `Gagal menghapus provider: ${err.message}`, type: 'error' });
    }
  };

  const handleImportModels = async (providerId: string) => {
    setImportingProviderId(providerId);
    setStatusMessage(null);
    try {
      const res = await api.importModels(providerId);
      if (res.success) {
        setStatusMessage(res.message || `Berhasil mengimpor ${res.count} model.`);
        setToast({ message: `Berhasil mengimpor ${res.count} model!`, type: 'success' });
        await loadData();
      } else {
        setToast({ message: l('Failed to import models from provider.', 'Gagal mengimpor model dari provider.'), type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: `Error saat import models: ${err.message}`, type: 'error' });
    } finally {
      setImportingProviderId(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const payload = { ...settings };

      // Validation: Minimum order size Indodax & Anti-Negative validation
      if (payload.max_allocation_per_trade_idr) {
        const alloc = parseFloat(payload.max_allocation_per_trade_idr);
        if (isNaN(alloc) || alloc < 10000) {
          setToast({ message: l('Allocation per trade must be at least IDR 10,000 (Indodax minimum order size)', 'Alokasi per trade minimal Rp 10.000 (batas minimum transaksi Indodax)'), type: 'error' });
          return;
        }
      }

      if (payload.trailing_stop_percent) {
        const ts = parseFloat(payload.trailing_stop_percent);
        if (isNaN(ts) || ts <= 0 || ts > 50) {
          setToast({ message: l('Trailing stop percent must be between 0.1% and 50%', 'Trailing stop percent harus antara 0.1% s/d 50%'), type: 'error' });
          return;
        }
      }

      if (payload.take_profit_target_1_percent) {
        const tp = parseFloat(payload.take_profit_target_1_percent);
        if (isNaN(tp) || tp <= 0 || tp > 200) {
          setToast({ message: l('Take profit target 1 must be greater than 0%', 'Take profit target 1 harus lebih dari 0%'), type: 'error' });
          return;
        }
      }

      if (payload.daily_loss_limit_percent) {
        const dll = parseFloat(payload.daily_loss_limit_percent);
        if (isNaN(dll) || dll <= 0 || dll > 100) {
          setToast({ message: l('Daily loss limit must be between 1% and 100%', 'Batas kerugian harian harus antara 1% s/d 100%'), type: 'error' });
          return;
        }
      }

      if (payload.max_active_trades) {
        const mat = parseInt(payload.max_active_trades, 10);
        if (isNaN(mat) || mat < 1 || mat > 20) {
          setToast({ message: l('Max active positions must be between 1 and 20 coins', 'Maksimal posisi aktif harus antara 1 s/d 20 koin'), type: 'error' });
          return;
        }
      }

      if (ngrokToken) {
        payload.ngrok_authtoken = ngrokToken;
      }
      await api.updateSettings(payload);
      if (payload.admin_access_token) {
        authStorage.setToken(payload.admin_access_token);
      }
      setSaveSuccess(true);
      setToast({ message: l('Configuration settings saved successfully!', 'Konfigurasi pengaturan berhasil disimpan!'), type: 'success' });
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setToast({ message: `Gagal menyimpan settings: ${err.message}`, type: 'error' });
    }
  };

  const updateSettingField = (key: string, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  // Export Settings as JSON (H.3 #4)
  const handleExportSettings = () => {
    try {
      const exportable = { ...settings };
      // Delete sensitive credentials from export for security
      delete exportable.indodax_secret_key;
      delete exportable.telegram_bot_token;
      delete exportable.admin_access_token;
      delete exportable.ngrok_authtoken;

      const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai_trading_settings_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ message: 'Pengaturan berhasil diekspor ke file JSON!', type: 'success' });
    } catch (err: any) {
      setToast({ message: `Gagal mengekspor: ${err.message}`, type: 'error' });
    }
  };

  // Import Settings from JSON (H.3 #4)
  const handleImportSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const imported = JSON.parse(text);
        if (typeof imported !== 'object' || imported === null) {
          throw new Error('Format file JSON tidak valid.');
        }

        // Apply settings
        await api.updateSettings(imported);
        setSettings((prev) => ({ ...prev, ...imported }));
        setToast({ message: 'Pengaturan berhasil diimpor & disimpan!', type: 'success' });
        loadData();
      } catch (err: any) {
        setToast({ message: `Gagal mengimpor file: ${err.message}`, type: 'error' });
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Tunnel Start / Stop
  const handleToggleTunnel = async () => {
    setTunnelLoading(true);
    try {
      if (tunnelStatus.active) {
        const res = await api.stopTunnel();
        setTunnelStatus(res.data);
        setToast({ message: 'Tunnel publik berhasil dimatikan.', type: 'info' });
      } else {
        const res = await api.startTunnel(selectedTunnelType, ngrokToken);
        setTunnelStatus(res.data);
        setToast({ message: 'Tunnel publik aktif! Anda dapat mengakses dashboard dari internet.', type: 'success' });
      }
    } catch (err: any) {
      setToast({ message: `Tunnel error: ${err.message}`, type: 'error' });
    } finally {
      setTunnelLoading(false);
    }
  };

  const copyTunnelUrl = () => {
    if (!tunnelStatus.url) return;
    navigator.clipboard.writeText(tunnelStatus.url);
    setCopiedTunnelUrl(true);
    setTimeout(() => setCopiedTunnelUrl(false), 2000);
  };

  const handleTestTelegram = async () => {
    setTelegramTesting(true);
    setTelegramFeedback(null);
    try {
      const token = settings.telegram_bot_token || '';
      const chatId = settings.telegram_chat_id || '';
      if (!token || !chatId) {
        setTelegramFeedback({
          type: 'error',
          message: l('Please enter Telegram Bot Token and Chat ID first.', 'Mohon isi Telegram Bot Token dan Chat ID terlebih dahulu.'),
        });
        return;
      }
      const res = await api.testTelegram(token, chatId);
      if (res.success) {
        setTelegramFeedback({
          type: 'success',
          message: res.message || l('Test message sent to Telegram successfully!', 'Pesan tes berhasil dikirim ke Telegram!'),
        });
      } else {
        setTelegramFeedback({
          type: 'error',
          message: res.message || l('Failed to send test message to Telegram. Check token and Chat ID.', 'Gagal mengirim pesan tes ke Telegram. Periksa token dan Chat ID.'),
        });
      }
    } catch (err: any) {
      setTelegramFeedback({
        type: 'error',
        message: err.message || l('Error occurred while contacting Telegram API.', 'Terjadi kesalahan saat menghubungi Telegram API.'),
      });
    } finally {
      setTelegramTesting(false);
    }
  };

  // Pure Deterministic Risk Calculation Wizard with Direct Auto-Save
  const handleApplyRiskWizard = async () => {
    const capital = Math.max(10000, parseFloat(wizardCapital) || 100000);
    try {
      const res = await api.autoSetCapital(capital, wizardProfile);
      const freshSettings = await api.getSettings();
      setSettings(freshSettings);
      setShowRiskModal(false);
      const msg = `Parameter risiko berhasil dihitung & disimpan otomatis untuk modal Rp ${capital.toLocaleString('id-ID')} (${wizardProfile.toUpperCase()}).`;
      setStatusMessage(msg);
      setToast({ message: msg, type: 'success' });
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setToast({ message: `Gagal auto-set modal: ${err.message}`, type: 'error' });
    }
  };

  const handleSelectRiskProfile = async (profile: 'conservative' | 'balanced' | 'aggressive') => {
    try {
      const res = await api.setRiskProfile(profile);
      const freshSettings = await api.getSettings();
      setSettings(freshSettings);
      setStatusMessage(`Profil risiko berhasil diubah ke: ${res.profile.name}. Parameter disesuaikan.`);
      setToast({ message: `Profil risiko berhasil diubah ke: ${res.profile.name}`, type: 'success' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setToast({ message: `Gagal menerapkan profil risiko: ${err.message}`, type: 'error' });
    }
  };

  // 1-Click Beginner Preset Setup
  const handleApplyBeginnerPreset = async () => {
    try {
      await api.setRiskProfile('conservative');

      let subModel = settings.subagent_model;
      let mastModel = settings.master_model;
      let waModel = settings.whatsapp_model;

      if (allModels.length > 0) {
        const first = allModels[0].alias_model_id;
        subModel = subModel || first;
        mastModel = mastModel || first;
        waModel = waModel || first;
      }

      const recommended: Record<string, string> = {
        ...settings,
        risk_profile: 'conservative',
        paper_idr_balance: '10000000',
        max_allocation_per_trade_idr: '50000',
        max_active_trades: '2',
        daily_loss_limit_percent: '3.0',
        trailing_stop_percent: '1.5',
        take_profit_target_1_percent: '4.0',
        btc_regime_max_drop_percent: '3.0',
        min_24h_volume_idr: '500000000',
        slippage_tolerance_percent: '0.5',
        allow_new_listings: '0',
        volatility_sizing_enabled: '1',
        ai_mode: 'confirm',
        swarm_event_driven: '1',
      };

      if (subModel) recommended.subagent_model = subModel;
      if (mastModel) recommended.master_model = mastModel;
      if (waModel) recommended.whatsapp_model = waModel;

      await api.updateSettings(recommended);
      setSettings(recommended);
      setSaveSuccess(true);
      setStatusMessage('Preset Pemula Berhasil Diterapkan! Profil: Konservatif, Saldo Simulasi: Rp 10 Juta, Filter: Bluechip Aman.');
      setToast({ message: l('Beginner-Friendly Preset Applied Successfully!', 'Preset Pemula Ramah Modal Berhasil Diterapkan!'), type: 'success' });
      setTimeout(() => {
        setSaveSuccess(false);
        setStatusMessage(null);
      }, 5000);
    } catch (err: any) {
      setToast({ message: `Gagal menerapkan preset pemula: ${err.message}`, type: 'error' });
    }
  };

  const handleResetPaperBalance = (balance: number) => {
    updateSettingField('paper_idr_balance', balance.toString());
    setStatusMessage(`Saldo virtual Paper Trading diubah menjadi Rp ${balance.toLocaleString('id-ID')}. Klik "Simpan Perubahan" untuk menyimpan.`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-slate-800 bg-[#0b101b] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-inner">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>{l('System Settings & Configuration', 'Pengaturan & Konfigurasi Sistem')}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-500/30">
                v1.0
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {l('Manage AI connections, risk parameters, Indodax accounts, and remote access security with clarity.', 'Kelola koneksi AI, parameter risiko, akun Indodax, dan keamanan remote access secara rapi dan terarah.')}
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-950/40 transition-all active:scale-95 shrink-0"
        >
          <Save className="h-4 w-4" />
          <span>{l('Save Changes', 'Simpan Perubahan')}</span>
        </button>
      </div>

      {/* Notifications */}
      {statusMessage && (
        <div className="p-4 rounded-xl border border-blue-500/40 bg-blue-950/40 text-blue-200 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <Info className="h-4 w-4 text-blue-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded bg-slate-900/60">
            Tutup
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-center gap-2.5 shadow-sm animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{l('All settings successfully saved to local database!', 'Seluruh pengaturan berhasil disimpan ke database lokal!')}</span>
        </div>
      )}

      {/* 1-Click Beginner Setup Banner */}
      <div
        data-tour="beginner-preset"
        className="p-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-slate-900/60 to-blue-950/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">
                {l('1-Click Automatic Setup for Beginners', 'Setup Otomatis 1-Klik untuk Pemula')}
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {l('Recommended', 'Direkomendasikan')}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {l('Confused by technical settings? Click this button to automatically apply Conservative (Safe) risk profile, IDR 10,000,000 simulation balance, and bluechip coin protection filters.', 'Bingung mengatur angka teknis? Klik tombol ini untuk otomatis menerapkan profil risiko Konservatif (Aman), modal simulasi Rp 10.000.000, dan menyalakan filter proteksi koin bluechip.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleApplyBeginnerPreset}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all shrink-0 active:scale-95"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{l('Apply Beginner Preset', 'Terapkan Preset Pemula')}</span>
        </button>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-1.5 rounded-2xl bg-[#090d16] border border-slate-800/80">
        <button
          type="button"
          onClick={() => setSubTab('ai')}
          className={`flex items-center gap-2.5 p-3 rounded-xl text-left transition-all ${
            currentSubTab === 'ai'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Cpu className={`w-4 h-4 shrink-0 ${currentSubTab === 'ai' ? 'text-white' : 'text-blue-400'}`} />
          <div className="min-w-0">
            <div className="text-xs truncate">{l('1. AI Provider & Model', '1. AI Provider & Model')}</div>
            <div className={`text-[10px] truncate ${currentSubTab === 'ai' ? 'text-blue-100' : 'text-slate-500'}`}>
              {l('Google OAuth / API Keys', 'Google OAuth / API Keys')}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('risk')}
          className={`flex items-center gap-2.5 p-3 rounded-xl text-left transition-all ${
            currentSubTab === 'risk'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Shield className={`w-4 h-4 shrink-0 ${currentSubTab === 'risk' ? 'text-white' : 'text-amber-400'}`} />
          <div className="min-w-0">
            <div className="text-xs truncate">{l('2. Capital & Risk Management', '2. Modal & Manajemen Risiko')}</div>
            <div className={`text-[10px] truncate ${currentSubTab === 'risk' ? 'text-blue-100' : 'text-slate-500'}`}>
              {l('Profiles & Loss Limits', 'Profil & Batas Kerugian')}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('indodax')}
          className={`flex items-center gap-2.5 p-3 rounded-xl text-left transition-all ${
            currentSubTab === 'indodax'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Key className={`w-4 h-4 shrink-0 ${currentSubTab === 'indodax' ? 'text-white' : 'text-emerald-400'}`} />
          <div className="min-w-0">
            <div className="text-xs truncate">{l('3. Indodax Keys (Live Mode)', '3. Kunci Indodax (Mode Live)')}</div>
            <div className={`text-[10px] truncate ${currentSubTab === 'indodax' ? 'text-blue-100' : 'text-slate-500'}`}>
              {l('Real Money Trading Only', 'Khusus Uang Riil')}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('security')}
          className={`flex items-center gap-2.5 p-3 rounded-xl text-left transition-all ${
            currentSubTab === 'security'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Globe className={`w-4 h-4 shrink-0 ${currentSubTab === 'security' ? 'text-white' : 'text-sky-400'}`} />
          <div className="min-w-0">
            <div className="text-xs truncate">{l('4. Remote Access & Notifications', '4. Akses Remote & Notifikasi')}</div>
            <div className={`text-[10px] truncate ${currentSubTab === 'security' ? 'text-blue-100' : 'text-slate-500'}`}>
              {l('Telegram, Tunnel & Token', 'Telegram, Tunnel & Token')}
            </div>
          </div>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: AI PROVIDER & MODEL ROUTING                                        */}
      {/* ========================================================================= */}
      {currentSubTab === 'ai' && (
        <div className="space-y-6">
          {/* Friendly Callout for AI */}
          <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-950/20 text-xs text-blue-300 flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-100">
                {l('Easiest Method for Beginners:', 'Cara Termudah untuk Pemula:')}
              </p>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {l('You do not need to purchase expensive API Keys. Simply click "Connect Antigravity (Google OAuth)" below. Log in with your Google account to get instant access to Gemini models at zero additional cost.', 'Anda tidak perlu membeli API Key mahal. Cukup klik tombol Hubungkan Antigravity (Google OAuth) di bawah. Anda akan login menggunakan akun Google dan langsung mendapatkan akses ke model Google Gemini tanpa biaya tambahan.')}
              </p>
            </div>
          </div>

          {/* AI Providers Section */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-blue-400" />
                  <span>{l('AI Providers List & Auto-Failover Keys', 'Daftar AI Providers & Auto-Failover Keys')}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {l('Supports Antigravity (Google OAuth), Token Harbor, OpenAI, Anthropic, and custom endpoints with auto-failover.', 'Mendukung Antigravity (Google OAuth), Token Harbor, OpenAI, Anthropic, dan custom endpoint dengan auto-failover.')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartAntigravityConnect}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-bold text-white shadow-md transition-all group"
                >
                  <Sparkles className="h-4 w-4 text-blue-200 group-hover:scale-110 transition-transform" />
                  <span>{l('Connect Antigravity (Google OAuth)', 'Hubungkan Antigravity (Google OAuth)')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-850 text-xs font-semibold text-slate-300 hover:bg-slate-750 hover:text-slate-100 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{l('+ Manual Provider', '+ Provider Manual')}</span>
                </button>
              </div>
            </div>

            {/* Add Provider Form */}
            {showAddForm && (
              <form onSubmit={handleCreateProvider} className="p-5 rounded-xl border border-blue-500/30 bg-slate-900/90 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    {l('Add Manual Provider Form (API Key)', 'Form Tambah Provider Manual (API Key)')}
                  </h4>

                  {/* Quick Template Presets */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[11px] text-slate-500">{l('Quick Presets:', 'Preset Cepat:')}</span>
                    <button
                      type="button"
                      onClick={() => applyPreset('antigravity')}
                      className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-500/30 text-[10px] font-mono hover:bg-blue-900/50 flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Antigravity</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('tokenharbor')}
                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono hover:bg-slate-700"
                    >
                      Token Harbor
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('openai')}
                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono hover:bg-slate-700"
                    >
                      OpenAI
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('anthropic')}
                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono hover:bg-slate-700"
                    >
                      Anthropic
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">{l('Provider Name', 'Nama Provider')}</label>
                    <input
                      type="text"
                      required
                      value={provName}
                      onChange={(e) => setProvName(e.target.value)}
                      placeholder={l('Example: Token Harbor or Custom AI', 'Contoh: Token Harbor atau Custom AI')}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 block mb-1">{l('Alias Prefix', 'Alias Prefix')}</label>
                    <input
                      type="text"
                      required
                      value={provAlias}
                      onChange={(e) => setProvAlias(e.target.value)}
                      placeholder="Contoh: hrbr atau custom"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-300 block mb-1">{l('Base URL / Endpoint', 'Base URL / Endpoint')}</label>
                    <input
                      type="url"
                      required
                      value={provBaseUrl}
                      onChange={(e) => setProvBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1 atau https://tokenharbor.ai/v1/chat/completions"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-300 block mb-1">
                      {l('Multiple API Keys (1 Key per Line - Auto-Failover)', 'Multiple API Keys (1 Key per Baris - Auto-Failover)')}
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={provApiKeys}
                      onChange={(e) => setProvApiKeys(e.target.value)}
                      placeholder="sk-key-utama-01&#10;sk-key-cadangan-02"
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500 leading-relaxed"
                    />
                    <span className="text-[11px] text-slate-400 block mt-1">
                      {l('If Key 1 hits rate limits, the system seamlessly fails over to Key 2 for continuous analysis.', 'Jika Key 1 terkena rate limit, sistem otomatis berganti ke Key 2 demi kontinuitas analisis.')}
                    </span>
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 block mb-1">{l('API Protocol Format', 'Format Protokol API')}</label>
                    <select
                      value={provProtocol}
                      onChange={(e) => setProvProtocol(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value="chat_completions">OpenAI Chat Completions (/v1/chat/completions)</option>
                      <option value="messages">Anthropic Messages (/v1/messages)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-sm"
                  >
                    {l('Save & Import Models', 'Simpan & Import Model')}
                  </button>
                </div>
              </form>
            )}

            {/* Existing Providers Cards */}
            {providers.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl space-y-2 bg-slate-950/30">
                <Cpu className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="font-semibold text-slate-300">{l('No AI Providers connected yet.', 'Belum ada AI Provider yang terhubung.')}</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  {l('Click "Connect Antigravity" above for quick login via free Google OAuth.', 'Klik tombol Hubungkan Antigravity di atas untuk login cepat dengan Google OAuth gratis.')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {providers.map((p) => {
                  const isImporting = importingProviderId === p.id;
                  const modelsCount = p.models?.length || 0;

                  return (
                    <div
                      key={p.id}
                      className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 text-sm">{p.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-500/30">
                            alias: {p.alias}
                          </span>
                          {p.protocol === 'antigravity' ? (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30 font-semibold flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-indigo-400" />
                              <span>Google OAuth</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                              {p.protocol}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleImportModels(p.id)}
                            disabled={isImporting}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/20 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                          >
                            <Download className={`h-3.5 w-3.5 ${isImporting ? 'animate-bounce' : ''}`} />
                            <span>{isImporting ? 'Mengimpor Model...' : 'Import Models Otomatis'}</span>
                          </button>

                          <button
                            onClick={() => handleDeleteProvider(p.id)}
                            className="p-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-950/40 transition-colors"
                            title="Hapus Provider"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {p.protocol === 'antigravity' ? (
                        <div className="text-xs text-slate-400 grid grid-cols-1 md:grid-cols-2 gap-2 font-mono bg-indigo-950/20 p-2.5 rounded-lg border border-indigo-500/20">
                          <div>
                            <span className="text-slate-500">Akun Google: </span>
                            <span className="text-emerald-400 font-bold">{p.oauth_data?.email || 'Google User'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">GCP Project ID: </span>
                            <span className="text-blue-400 font-semibold">{p.oauth_data?.projectId || 'Default Project'}</span>
                          </div>
                          <div className="md:col-span-2">
                            <span className="text-slate-500">Koneksi Engine: </span>
                            <span className="text-slate-300">Google Cloud Code API (Auto-Refresh OAuth Active)</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 grid grid-cols-1 md:grid-cols-2 gap-2 font-mono">
                          <div>
                            <span className="text-slate-500">Base URL: </span>
                            <span className="text-slate-300">{p.base_url}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Keys Terdaftar: </span>
                            <span className="text-slate-300">{p.keys_count || (p.api_keys?.length || 0)} Kunci</span>
                          </div>
                        </div>
                      )}

                      <div className="pt-2">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-slate-400 font-semibold font-mono">
                            Model Tersedia ({modelsCount}):
                          </span>
                        </div>

                        {modelsCount === 0 ? (
                          <p className="text-xs text-slate-500 italic">
                            Belum ada model terdaftar. Silakan klik tombol "Import Models Otomatis" di atas untuk mendownload katalog model dari {p.name}.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-950/60 rounded-lg border border-slate-800/60">
                            {p.models?.map((m) => (
                              <span
                                key={m.id}
                                className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-200 border border-slate-700/80 flex items-center gap-1"
                              >
                                <span className="text-blue-400">{p.alias}/</span>{m.model_id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Model Routing Assignment */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2 pb-2 border-b border-slate-800/80">
              <Layers className="h-4 w-4 text-indigo-400" />
              <span>Penugasan Model AI (Model Routing Assignment)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Tentukan model mana yang dipakai untuk masing-masing tugas sistem.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 block">
                  1. Model untuk 10 Subagent Berita
                </label>
                <select
                  value={settings.subagent_model || ''}
                  onChange={(e) => updateSettingField('subagent_model', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                >
                  <option value="">Pilih Model Cepat / Hemat Token...</option>
                  {allModels.map((m) => (
                    <option key={m.alias_model_id} value={m.alias_model_id}>
                      {m.alias_model_id} ({m.display_name})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 block">Rekomendasi: Gemini 3.8 Flash atau Claude Haiku</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 block">
                  2. Model untuk Manajer Risiko AI (Evaluator Utama)
                </label>
                <select
                  value={settings.master_model || ''}
                  onChange={(e) => updateSettingField('master_model', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                >
                  <option value="">Pilih Model Penalaran Tinggi...</option>
                  {allModels.map((m) => (
                    <option key={m.alias_model_id} value={m.alias_model_id}>
                      {m.alias_model_id} ({m.display_name})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 block">Rekomendasi: Claude Sonnet 4.6 atau GPT-4o</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 block">
                  3. Model untuk Asisten WhatsApp
                </label>
                <select
                  value={settings.whatsapp_model || ''}
                  onChange={(e) => updateSettingField('whatsapp_model', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                >
                  <option value="">Pilih Model Chat WhatsApp...</option>
                  {allModels.map((m) => (
                    <option key={m.alias_model_id} value={m.alias_model_id}>
                      {m.alias_model_id} ({m.display_name})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 block">Rekomendasi: Gemini 3.8 Flash (Respon cepat)</span>
              </div>
            </div>
          </div>

          {/* Mode Eksekusi AI & Efisiensi Token (Section 9 Engine) */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  <span>Mode Eksekusi AI &amp; Optimasi Token (Mesin Deterministik)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Kendali arsitektur hybrid vs deterministik untuk mencegah pemborosan token dan kegagalan eksekusi trading.
                </p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono border self-start sm:self-auto ${
                (settings.ai_mode || 'confirm') === 'confirm'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : (settings.ai_mode || 'confirm') === 'off'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                Mode: {(settings.ai_mode || 'confirm').toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* AI Mode Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-200 block">
                  1. Mode Pengambilan Keputusan Trading (AI Mode)
                </label>
                <select
                  value={settings.ai_mode || 'confirm'}
                  onChange={(e) => updateSettingField('ai_mode', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                >
                  <option value="confirm">
                    Hybrid (Konfirmasi Ringkas AI - Disarankan)
                  </option>
                  <option value="off">
                    Deterministik Penuh (100% Tanpa LLM, 0 Token AI)
                  </option>
                  <option value="required">
                    Wajib AI Penuh (Legacy - Bergantung Penuh pada LLM)
                  </option>
                </select>
                <div className="text-[11px] text-slate-400 leading-relaxed space-y-1">
                  {(settings.ai_mode || 'confirm') === 'confirm' && (
                    <p className="text-blue-300/90">
                      <strong>Hybrid:</strong> Mesin deterministik (RSI, EMA21, ATR, Order Book, Lexicon Berita) menyaring sinyal. AI hanya dipanggil 1x untuk sanity check ringkas. Jika kuota AI habis/error, sistem otomatis fallback ke sinyal deterministik tanpa membekukan trading.
                    </p>
                  )}
                  {settings.ai_mode === 'off' && (
                    <p className="text-emerald-300/90">
                      <strong>Deterministik:</strong> 100% sinyal teknikal &amp; sentimen lexicon kamus. 0 panggilan LLM, 0 token terbakar, eksekusi order instan sub-detik tanpa latensi jaringan AI.
                    </p>
                  )}
                  {settings.ai_mode === 'required' && (
                    <p className="text-amber-300/90">
                      <strong>Wajib AI:</strong> Semua kandidat trade harus diverifikasi model LLM. Jika API provider mengalami error atau timeout, order tidak akan dieksekusi.
                    </p>
                  )}
                </div>
              </div>

              {/* Swarm Event-Driven Dedup Toggle */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-200 block">
                  2. Strategi Swarm Polling (Deduplikasi Konteks)
                </label>
                <select
                  value={settings.swarm_event_driven ?? '1'}
                  onChange={(e) => updateSettingField('swarm_event_driven', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                >
                  <option value="1">
                    Event-Driven (Deduplikasi Fingerprint SHA256 - Disarankan)
                  </option>
                  <option value="0">
                    Polling Statis (Panggil LLM Setiap Interval Tetap)
                  </option>
                </select>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  {(settings.swarm_event_driven ?? '1') === '1' ? (
                    <p className="text-emerald-300/90">
                      <strong>Hemat Token:</strong> Subagent swarm menghitung hash fingerprint judul berita dan harga koin. Jika tidak ada perubahan signifikan, AI call dilewati (skipped) otomatis, memangkas 70%&ndash;90% konsumsi token harian.
                    </p>
                  ) : (
                    <p className="text-slate-400">
                      <strong>Polling Tetap:</strong> 10 subagent memanggil LLM setiap 60 detik tanpa memeriksa kesamaan konteks (~14.400 calls/hari).
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MODAL & MANAJEMEN RISIKO                                           */}
      {/* ========================================================================= */}
      {currentSubTab === 'risk' && (
        <div className="space-y-6">
          {/* Paper Trading Reassurance */}
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 text-xs text-emerald-300 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-100">
                Mode Simulasi (Paper Trading) Sedang Aktif:
              </p>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Anda bebas bereksperimen dengan parameter risiko apa pun di bawah tanpa takut rugi. Seluruh transaksi menggunakan saldo simulasi virtual tanpa menyentuh uang riil sama sekali.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-400" />
                  <span>Parameter Manajemen Risiko &amp; Proteksi Modal</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Atur profil risiko, batas alokasi per transaksi, trailing stop loss, dan circuit breaker kerugian.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowRiskModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-500/40 bg-amber-600/20 text-xs font-semibold text-amber-300 hover:bg-amber-600/30 transition-colors shadow-sm"
              >
                <Calculator className="h-3.5 w-3.5" />
                <span>Hitung Otomatis Berdasarkan Modal</span>
              </button>
            </div>

            {/* Preset Profil Risiko (Konservatif / Seimbang / Agresif) */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Pilih Preset Profil Risiko Utama:
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Konservatif */}
                <div
                  onClick={() => handleSelectRiskProfile('conservative')}
                  className={`cursor-pointer p-4 rounded-xl border transition-all ${
                    settings.risk_profile === 'conservative'
                      ? 'border-emerald-500 bg-emerald-950/30 shadow-md shadow-emerald-500/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2">
                    <span className="font-bold text-sm text-emerald-400">Konservatif (Aman &amp; Pemula)</span>
                    {settings.risk_profile === 'conservative' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500 text-white">Aktif</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Hanya beli koin bluechip likuid (BTC, ETH, SOL, BNB, XRP). Menolak koin baru &amp; memecoin. Trailing Stop 1.5%, Alokasi Rp 50k, Maks 2 koin.
                  </p>
                </div>

                {/* Seimbang */}
                <div
                  onClick={() => handleSelectRiskProfile('balanced')}
                  className={`cursor-pointer p-4 rounded-xl border transition-all ${
                    settings.risk_profile === 'balanced' || !settings.risk_profile
                      ? 'border-blue-500 bg-blue-950/30 shadow-md shadow-blue-500/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2">
                    <span className="font-bold text-sm text-blue-400">Seimbang (Rekomendasi)</span>
                    {(settings.risk_profile === 'balanced' || !settings.risk_profile) && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white">Aktif</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Pertumbuhan modal seimbang. Filter volume min Rp 250 Juta, deteksi koin baru aktif, Trailing Stop 2.5%, Alokasi Rp 100k, Maks 3 koin.
                  </p>
                </div>

                {/* Agresif */}
                <div
                  onClick={() => handleSelectRiskProfile('aggressive')}
                  className={`cursor-pointer p-4 rounded-xl border transition-all ${
                    settings.risk_profile === 'aggressive'
                      ? 'border-amber-500 bg-amber-950/30 shadow-md shadow-amber-500/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2">
                    <span className="font-bold text-sm text-amber-400">Agresif (Momentum &amp; Pump)</span>
                    {settings.risk_profile === 'aggressive' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500 text-white">Aktif</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Mengejar momentum lonjakan harga awal &amp; listing baru. Toleransi volatilitas tinggi, Trailing Stop 3.5%, Alokasi Rp 250k, Maks 5 koin.
                  </p>
                </div>
              </div>
            </div>

            {/* Fine-Tuning Parameters */}
            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                Rincian Parameter Teknis:
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-300 block mb-1">Maksimal Alokasi per Trade (IDR)</label>
                  <input
                    type="number"
                    value={settings.max_allocation_per_trade_idr || '100000'}
                    onChange={(e) => updateSettingField('max_allocation_per_trade_idr', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Modal per order beli (min Rp 10.000)</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Maksimal Koin Aktif Bersamaan</label>
                  <input
                    type="number"
                    value={settings.max_active_trades || '3'}
                    onChange={(e) => updateSettingField('max_active_trades', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Diversifikasi posisi terbuka</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">Batas Rugi Harian / Circuit Breaker (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={settings.daily_loss_limit_percent || '5.0'}
                    onChange={(e) => updateSettingField('daily_loss_limit_percent', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Pause bot 24 jam jika rugi hari ini melebihi limit</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">{l('Trailing Stop Loss (%)', 'Trailing Stop Loss (%)')}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.trailing_stop_percent || '2.5'}
                    onChange={(e) => updateSettingField('trailing_stop_percent', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Jarak trailing pengunci profit saat harga naik</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">{l('Scale-Out Take-Profit Target Stage 1 (%)', 'Scale-Out Take-Profit Target Tahap 1 (%)')}</label>
                  <input
                    type="number"
                    step="0.5"
                    value={settings.take_profit_target_1_percent || '5.0'}
                    onChange={(e) => updateSettingField('take_profit_target_1_percent', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Jual 50% &amp; geser stop loss ke Breakeven</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">{l('Macro Regime Guard: BTC 24h Drop (%)', 'Macro Regime Guard: Drop BTC 24j (%)')}</label>
                  <input
                    type="number"
                    step="0.5"
                    value={settings.btc_regime_max_drop_percent || '4.0'}
                    onChange={(e) => updateSettingField('btc_regime_max_drop_percent', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Tunda beli jika pasar kripto makro anjlok tajam</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">{l('Minimum 24h Volume (IDR)', 'Minimal Volume 24 Jam (IDR)')}</label>
                  <input
                    type="number"
                    step="50000000"
                    value={settings.min_24h_volume_idr || '250000000'}
                    onChange={(e) => updateSettingField('min_24h_volume_idr', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Hanya trading koin dengan volume transaksi tinggi</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">{l('Orderbook Slippage Tolerance (%)', 'Toleransi Slippage Orderbook (%)')}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.slippage_tolerance_percent || '0.8'}
                    onChange={(e) => updateSettingField('slippage_tolerance_percent', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Tolak order beli jika spread harga terlalu lebar</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">{l('Allow New Listing Coins?', 'Beli Koin Baru Listing?')}</label>
                  <select
                    value={settings.allow_new_listings || '1'}
                    onChange={(e) => updateSettingField('allow_new_listings', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 outline-none focus:border-blue-500"
                  >
                    <option value="1">{l('Active (Allow new listings)', 'Aktif (Boleh Beli Koin Baru Listing)')}</option>
                    <option value="0">{l('Disabled (Established coins only)', 'Nonaktif (Hanya Koin yang Sudah Mapan)')}</option>
                  </select>
                  <span className="text-[11px] text-slate-500 block mt-1">Koin baru listing memiliki potensi keuntungan &amp; risiko tinggi</span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 block mb-1">{l('ATR Volatility Sizing', 'Alokasi Dinamis ATR / Volatilitas')}</label>
                  <select
                    value={settings.volatility_sizing_enabled ?? '1'}
                    onChange={(e) => updateSettingField('volatility_sizing_enabled', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 outline-none focus:border-blue-500"
                  >
                    <option value="1">{l('Enabled (Scale down lot on high volatility)', 'Aktif (Kecilkan Lot jika Koin Sangat Volatil)')}</option>
                    <option value="0">{l('Disabled (Use equal flat lots)', 'Nonaktif (Gunakan Lot Tetap Sama Rata)')}</option>
                  </select>
                  <span className="text-[11px] text-slate-500 block mt-1">Mengurangi ukuran order hingga 40% pada koin liar (&gt;10% fluktuasi)</span>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="text-xs text-slate-300 block mb-1">{l('Custom Coin Whitelist (Optional)', 'Whitelist Koin Khusus (Opsional)')}</label>
                  <input
                    type="text"
                    value={settings.allowed_coins_only || ''}
                    onChange={(e) => updateSettingField('allowed_coins_only', e.target.value)}
                    placeholder="Contoh: btc,eth,sol (kosongkan untuk menganalisis semua koin likuid)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Batasi bot hanya pada simbol tertentu (pisahkan dengan koma)</span>
                </div>
              </div>
            </div>

            {/* Virtual Balance Management */}
            <div className="pt-4 border-t border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
                <div>
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                    {l('Paper Trading Simulation Balance', 'Saldo Simulasi Paper Trading')}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {l('Virtual balance for strategy testing without touching real Rupiah.', 'Saldo virtual untuk testing strategi tanpa menyentuh Rupiah asli.')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">Preset Cepat:</span>
                  {[5000000, 10000000, 50000000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleResetPaperBalance(val)}
                      className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-slate-200 transition-colors"
                    >
                      Rp {(val / 1000000).toFixed(0)} Juta
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: KUNCI INDODAX (MODE LIVE)                                          */}
      {/* ========================================================================= */}
      {currentSubTab === 'indodax' && (
        <div className="space-y-6">
          {/* Live vs Paper Explanation */}
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs text-amber-200 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-100">
                {l('Notice for Beginners:', 'Perhatian untuk Pemula:')}
              </p>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                {l('Indodax API keys are ONLY needed if you intend to switch from Paper Simulation to Live Trading with real funds. If you are currently testing the bot, leave these fields empty.', 'Kunci API Indodax HANYA dibutuhkan jika Anda ingin beralih dari Paper Trading (Simulasi) ke Live Trading dengan Rupiah asli di bursa Indodax. Jika saat ini Anda hanya ingin mencoba bot, kosongkan saja bagian ini.')}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-5 shadow-sm">
            <div className="pb-3 border-b border-slate-800/80">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                <Key className="h-4 w-4 text-emerald-400" />
                <span>{l('Official Indodax Trade API v2.0 Credentials', 'Kredensial Resmi Indodax Trade API v2.0')}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {l('Use official API Key and Secret Key generated from your Indodax Trade API account.', 'Gunakan API Key dan Secret Key resmi dari menu Trade API akun Indodax Anda.')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">
                  Indodax API Key (X-APIKEY)
                </label>
                <input
                  type="text"
                  value={settings.indodax_api_key || ''}
                  onChange={(e) => updateSettingField('indodax_api_key', e.target.value)}
                  placeholder="Masukkan API Key Indodax..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Kunci publik untuk identifikasi akun Anda di Indodax.
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-300 font-medium">
                    Indodax Secret Key (HMAC-SHA256 &amp; SHA512)
                  </label>
                  {settings.has_indodax_secret && (
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="h-3 w-3" />
                      {l('Key Stored Securely', 'Kunci Tersimpan Aman')}
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={settings.indodax_secret_key || ''}
                  onChange={(e) => updateSettingField('indodax_secret_key', e.target.value)}
                  placeholder={settings.has_indodax_secret ? 'Kunci tersimpan aman. Isi hanya untuk mengganti...' : 'Masukkan Secret Key Indodax...'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  Secret key disimpan terenkripsi di lokal SQLite dan tidak pernah dibocorkan ke browser.
                </span>
              </div>
            </div>

            {/* Safe Setup Instructions for Indodax */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>{l('Security Guidelines for Indodax API Keys:', 'Panduan Keamanan Pembuatan Kunci Indodax:')}</span>
              </div>
              <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-5 leading-relaxed">
                <li>{l('Open official website indodax.com > Trade API menu.', 'Buka situs resmi indodax.com > Menu Trade API.')}</li>
                <li>{l('Check View Info and Trade permissions only.', 'Centang izin View Info dan Trade.')}</li>
                <li><strong className="text-rose-400">{l('NEVER', 'JANGAN PERNAH')}</strong> {l('grant Withdraw permissions. Our trading bot never requests or requires withdrawal access.', 'mencentang izin Withdraw. Bot trading kami tidak memerlukan dan tidak pernah meminta akses penarikan dana.')}</li>
                <li>{l('Paste your API Key and Secret Key into the form above, then click "Save Changes".', 'Simpan API Key dan Secret Key ke form di atas, lalu klik "Simpan Perubahan".')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: AKSES REMOTE & KEAMANAN                                            */}
      {/* ========================================================================= */}
      {currentSubTab === 'security' && (
        <div className="space-y-6">
          {/* Language Preference Section */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800/80">
              <Globe className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                Language / Preferensi Bahasa
              </h3>
            </div>
            <LanguageSelector variant="settings" />
          </div>
          {/* Admin Token & Auto-Rotation Management Section */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <Shield className="h-4 w-4 text-sky-400" />
                  <span>{l('Access Security & Admin Token Auto-Rotation', 'Keamanan Akses & Manajemen Rotasi Token Admin')}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {l('Secret token for web dashboard and API access. The system can rotate this token automatically.', 'Token rahasia untuk login ke dashboard web dan API. Sistem dapat merotasi token ini secara otomatis.')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-semibold border ${
                  (rotationStatus?.mode || 'fixed') === 'fixed'
                    ? 'bg-slate-900 border-slate-700 text-slate-300'
                    : (rotationStatus?.mode || 'fixed') === 'on_startup'
                    ? 'bg-sky-950/40 border-sky-500/40 text-sky-400'
                    : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                }`}>
                  {(rotationStatus?.mode || 'fixed') === 'fixed' && (
                    <>
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{l('Mode: Static Token (Fixed)', 'Mode: Token Statis (Tetap)')}</span>
                    </>
                  )}
                  {(rotationStatus?.mode || 'fixed') === 'on_startup' && (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                      <span>{l('Mode: Startup Rotation', 'Mode: Rotasi Startup')}</span>
                    </>
                  )}
                  {(rotationStatus?.mode || 'fixed') === 'interval' && (
                    <>
                      <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>
                        {l('Mode: Every', 'Mode: Tiap')} {rotationStatus?.intervalValue || 1}{' '}
                        {(rotationStatus?.intervalUnit || 'days') === 'minutes' ? l('Minutes', 'Menit') : (rotationStatus?.intervalUnit || 'days') === 'hours' ? l('Hours', 'Jam') : l('Days', 'Hari')}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Success Message Banner */}
            {rotationSuccessMessage && (
              <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{rotationSuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRotationSuccessMessage(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded bg-slate-900"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Current Active Token Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-300 block mb-1 font-medium">{l('Current Admin Access Token', 'Admin Access Token Saat Ini')}</label>
                <div className="flex gap-2">
                  <input
                    type={showTokenPlain ? 'text' : 'password'}
                    value={settings.admin_access_token || rotationStatus?.currentToken || ''}
                    readOnly
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-sky-500 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTokenPlain(!showTokenPlain)}
                    className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
                    title={showTokenPlain ? l('Hide Token', 'Sembunyikan Token') : l('Show Token', 'Lihat Token')}
                  >
                    {showTokenPlain ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(settings.admin_access_token || rotationStatus?.currentToken || '');
                      setCopiedAdminToken(true);
                      setTimeout(() => setCopiedAdminToken(false), 2000);
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-mono flex items-center gap-1.5 transition-colors"
                    title={l('Copy Token', 'Salin Token')}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedAdminToken ? l('Copied', 'Tersalin') : l('Copy', 'Salin')}</span>
                  </button>
                </div>
                <span className="text-[11px] text-slate-500 block mt-1">
                  {l('Token is printed to server terminal and transmitted to WhatsApp & Telegram upon rotation.', 'Token tercetak di terminal server dan dikirimkan otomatis ke WhatsApp & Telegram saat berganti.')}
                </span>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-800/80 bg-slate-900/40 text-xs text-slate-400 leading-relaxed flex items-start gap-2.5">
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200 block mb-0.5">{l('Public Tunnel Access Protection:', 'Proteksi Akses Tunnel Publik:')}</span>
                  {l('When accessing the dashboard via the public internet (Cloudflare / Ngrok), this token is required to prevent unauthorized changes to risk parameters or API keys.', 'Saat dashboard dibuka via internet (Cloudflare / Ngrok), token ini wajib dimasukkan agar pihak luar tidak bisa mengubah parameter risiko, melihat API key, atau menghentikan trading.')}
                </div>
              </div>
            </div>

            {/* Rotation Mode Selector Grid */}
            <div>
              <label className="text-xs text-slate-300 block mb-2 font-medium">
                {l('Select Automated Token Rotation Policy:', 'Pilih Kebijakan Rotasi Token Otomatis:')}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Mode 1: Fixed */}
                <div
                  onClick={() => {
                    setRotationStatus((prev) => ({
                      mode: 'fixed',
                      intervalValue: prev?.intervalValue || 1,
                      intervalUnit: prev?.intervalUnit || 'days',
                      lastRotatedAt: prev?.lastRotatedAt || Date.now(),
                      nextRotationAt: null,
                      currentToken: prev?.currentToken || settings.admin_access_token || '',
                    }));
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    (rotationStatus?.mode || 'fixed') === 'fixed'
                      ? 'border-blue-500/80 bg-blue-950/20 text-blue-200 shadow-sm'
                      : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-blue-400" />
                      <span>{l('1. Fixed / Static (Default)', '1. Tetap / Statis (Default)')}</span>
                    </span>
                    {(rotationStatus?.mode || 'fixed') === 'fixed' && (
                      <span className="h-2 w-2 rounded-full bg-blue-400" />
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    {l('Token never changes automatically. Convenient and ideal for beginners.', 'Token tidak pernah berubah otomatis. Aman dan sangat cocok bagi pemula yang tidak ingin repot.')}
                  </p>
                </div>

                {/* Mode 2: Startup */}
                <div
                  onClick={() => {
                    setRotationStatus((prev) => ({
                      mode: 'on_startup',
                      intervalValue: prev?.intervalValue || 1,
                      intervalUnit: prev?.intervalUnit || 'days',
                      lastRotatedAt: prev?.lastRotatedAt || Date.now(),
                      nextRotationAt: null,
                      currentToken: prev?.currentToken || settings.admin_access_token || '',
                    }));
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    rotationStatus?.mode === 'on_startup'
                      ? 'border-sky-500/80 bg-sky-950/20 text-sky-200 shadow-sm'
                      : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                      <span>{l('2. On Every Server Startup', '2. Setiap Startup Server')}</span>
                    </span>
                    {rotationStatus?.mode === 'on_startup' && (
                      <span className="h-2 w-2 rounded-full bg-sky-400" />
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    {l('A new token is generated every time the server boots up. The old token is invalidated.', 'Token otomatis berubah baru setiap kali program server dijalankan ulang. Token lama hangus.')}
                  </p>
                </div>

                {/* Mode 3: Interval */}
                <div
                  onClick={() => {
                    setRotationStatus((prev) => ({
                      mode: 'interval',
                      intervalValue: prev?.intervalValue || 1,
                      intervalUnit: prev?.intervalUnit || 'days',
                      lastRotatedAt: prev?.lastRotatedAt || Date.now(),
                      nextRotationAt: (prev?.lastRotatedAt || Date.now()) + (24 * 3600 * 1000),
                      currentToken: prev?.currentToken || settings.admin_access_token || '',
                    }));
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    rotationStatus?.mode === 'interval'
                      ? 'border-emerald-500/80 bg-emerald-950/20 text-emerald-200 shadow-sm'
                      : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{l('3. Scheduled Periodic Interval', '3. Berkala / Terjadwal')}</span>
                    </span>
                    {rotationStatus?.mode === 'interval' && (
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    {l('Token automatically rotates at custom intervals (e.g. daily) and is dispatched to WhatsApp.', 'Token otomatis berganti setiap rentang waktu (misal setiap 1 hari). Dikirim ke WhatsApp.')}
                  </p>
                </div>
              </div>
            </div>

            {/* Interval Configuration Form (Shown only when mode is 'interval') */}
            {rotationStatus?.mode === 'interval' && (
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/15 space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <Clock className="w-4 h-4" />
                  <span>{l('Periodic Rotation Duration Settings', 'Pengaturan Durasi Rotasi Berkala')}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">{l('Rotate Every (Number):', 'Rotasi Setiap (Angka):')}</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={rotationStatus.intervalValue}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setRotationStatus((prev) => prev ? { ...prev, intervalValue: val } : null);
                      }}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">{l('Time Unit:', 'Satuan Waktu:')}</label>
                    <select
                      value={rotationStatus.intervalUnit}
                      onChange={(e) => {
                        const unit = e.target.value as TokenRotationUnit;
                        setRotationStatus((prev) => prev ? { ...prev, intervalUnit: unit } : null);
                      }}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="days">{l('Days (Recommended, e.g. 1 day)', 'Hari (Rekomendasi, misal 1 hari)')}</option>
                      <option value="hours">{l('Hours (e.g. every 6 or 12 hours)', 'Jam (Misal setiap 6 atau 12 jam)')}</option>
                      <option value="minutes">{l('Minutes (For testing / rapid rotation)', 'Menit (Untuk testing / kebutuhan cepat)')}</option>
                    </select>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex flex-col justify-center font-mono">
                    <div>Terakhir: {rotationStatus.lastRotatedAt ? new Date(rotationStatus.lastRotatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '-'}</div>
                    <div className="text-emerald-400 font-bold mt-0.5">
                      Berikutnya: {rotationStatus.nextRotationAt ? new Date(rotationStatus.nextRotationAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '-'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleSaveRotationConfig}
                disabled={rotationLoading}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-sm transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{rotationLoading ? l('Saving...', 'Menyimpan...') : l('Save Rotation Policy', 'Simpan Kebijakan Rotasi')}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRotateConfirmModal(true)}
                disabled={rotationLoading}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 shadow-sm transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rotationLoading ? 'animate-spin' : ''}`} />
                <span>{l('Rotate Token Now (Manual)', 'Rotasi Token Sekarang (Manual)')}</span>
              </button>
            </div>
          </div>

          {/* Web Public Tunneling */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <Globe className="h-4 w-4 text-emerald-400" />
                  <span>{l('Public Web Access / Tunneling (Cloudflared & Ngrok)', 'Akses Web Publik / Tunneling (Cloudflared & Ngrok)')}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {l('Access this dashboard securely over the internet from mobile or remote devices without port forwarding.', 'Buka dashboard ini secara publik melalui internet dari HP atau laptop lain tanpa port forwarding.')}
                </p>
              </div>

              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-semibold border ${
                tunnelStatus.active
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tunnelStatus.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                {tunnelStatus.active ? l('Tunnel Active', 'Tunnel Aktif') : l('Tunnel Inactive', 'Tunnel Non-Aktif')}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-300 block mb-1.5 font-medium">{l('Select Tunnel Service', 'Pilih Layanan Tunnel')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTunnelType('cloudflared')}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      selectedTunnelType === 'cloudflared'
                        ? 'border-emerald-500/60 bg-emerald-950/30 text-emerald-300'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold font-mono">Cloudflared</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{l('Free, zero account / setup required', 'Gratis, tanpa akun / setup')}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTunnelType('ngrok')}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      selectedTunnelType === 'ngrok'
                        ? 'border-blue-500/60 bg-blue-950/30 text-blue-300'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold font-mono">Ngrok</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{l('Requires Authtoken', 'Membutuhkan Authtoken')}</div>
                  </button>
                </div>
              </div>

              <div>
                {selectedTunnelType === 'ngrok' ? (
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Ngrok Authtoken</label>
                    <input
                      type="password"
                      value={ngrokToken}
                      onChange={(e) => setNgrokToken(e.target.value)}
                      placeholder="Masukkan authtoken dari dashboard ngrok..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/40 text-xs text-slate-400 leading-relaxed">
                    <span className="font-semibold text-slate-200 block mb-0.5">Cloudflare Quick Tunnel:</span>
                    Langsung membuat URL HTTPS publik secara otomatis tanpa perlu mendaftar atau konfigurasi DNS apa pun.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
              <div>
                {tunnelStatus.active && tunnelStatus.url ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">URL Publik:</span>
                    <a
                      href={tunnelStatus.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono font-bold text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      {tunnelStatus.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      onClick={copyTunnelUrl}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title={l('Copy Link', 'Salin Link')}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    {copiedTunnelUrl && <span className="text-[10px] text-emerald-400 font-mono">{l('Copied!', 'Tersalin!')}</span>}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 font-mono">{l('Dashboard is currently only accessible locally at localhost:3001.', 'Dashboard saat ini hanya dapat dibuka di localhost:3001.')}</span>
                )}
              </div>

              <button
                onClick={handleToggleTunnel}
                disabled={tunnelLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-colors ${
                  tunnelStatus.active
                    ? 'border border-rose-500/40 bg-rose-950/40 text-rose-300 hover:bg-rose-900/40'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <Radio className={`h-3.5 w-3.5 ${tunnelLoading ? 'animate-spin' : ''}`} />
                <span>
                  {tunnelLoading
                    ? l('Processing...', 'Memproses...')
                    : tunnelStatus.active
                    ? l('Stop Tunnel', 'Hentikan Tunnel')
                    : l('Start Public Tunnel', 'Mulai Tunnel Publik')}
                </span>
              </button>
            </div>
          </div>

          {/* Unified Notification Bots Hub Banner */}
          <div className="rounded-2xl border border-sky-500/20 bg-sky-950/10 p-5 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span>{l('Unified Notification Bots Hub (WhatsApp & Telegram)', 'Pengaturan Bot Notifikasi Terpadu (WhatsApp & Telegram)')}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pengaturan kanal notifikasi, pairing WhatsApp QR, dan token Telegram Bot kini disatukan di tab <strong>Bots</strong>.
                  </p>
                </div>
              </div>

              <span className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border ${
                settings.telegram_enabled === '1'
                  ? 'bg-sky-950/40 border-sky-500/40 text-sky-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}>
                {settings.telegram_enabled === '1' ? 'Telegram Aktif' : 'Telegram Non-Aktif'}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-400 text-[11px]">
                Kelola status sesi, pilih mode pengiriman (keduanya / salah satu), dan tes koneksi di Pusat Kendali Bots.
              </span>
              <button
                type="button"
                onClick={() => {
                  const botsTab = document.querySelector('[data-tour="nav-bots"]') as HTMLElement;
                  if (botsTab) botsTab.click();
                  else {
                    const navBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Bots'));
                    if (navBtn) navBtn.click();
                  }
                }}
                className="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0"
              >
                <span>{l('Open Bots Tab', 'Buka Tab Bots')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Ekspor & Impor Pengaturan (H.3 #4) */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-indigo-400" />
                  <span>{l('Configuration Backup: Export & Import Settings', 'Cadangan Konfigurasi: Ekspor & Impor Pengaturan')}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {l('Export complete bot configurations to a JSON file for effortless migration to other devices.', 'Simpan seluruh pengaturan bot ke file JSON untuk memudahkan migrasi ke komputer atau server lain.')}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleExportSettings}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all"
              >
                <Download className="w-4 h-4" />
                <span>{l('Export Settings (JSON)', 'Ekspor Pengaturan (JSON)')}</span>
              </button>

              <label className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer transition-all">
                <Upload className="w-4 h-4 text-slate-400" />
                <span>{l('Import Settings (JSON)', 'Impor Pengaturan (JSON)')}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportSettings}
                  className="hidden"
                />
              </label>

              <span className="text-[11px] text-slate-500 text-center sm:text-left">
                Kredensial rahasia (Secret Key &amp; Bot Token) otomatis disaring demi keamanan.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADMIN TOKEN ROTATION CONFIRMATION                                  */}
      {/* ========================================================================= */}
      {showRotateConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="max-w-md w-full rounded-2xl border border-amber-500/40 bg-[#0d1322] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  {l('Confirm Admin Token Rotation', 'Konfirmasi Rotasi Token Admin')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {l('This action will generate a new Admin Access Token.', 'Tindakan ini akan menghasilkan Admin Access Token baru.')}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                ⚠️ <strong>{l('Attention:', 'Perhatian:')}</strong>
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-[11px]">
                <li>{l('The old access token will immediately expire and cannot be used again.', 'Token akses lama akan langsung hangus dan tidak dapat digunakan lagi.')}</li>
                <li>{l('The new token is printed directly in the Server Terminal and sent to Admin WhatsApp.', 'Token baru akan langsung ditampilkan di Terminal Server dan dikirimkan ke WhatsApp Admin.')}</li>
                <li>{l('Your current browser session will automatically synchronize with the new token so you stay logged in.', 'Sesi browser Anda saat ini akan otomatis diperbarui dengan token baru sehingga Anda tidak akan ter-logout.')}</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRotateConfirmModal(false)}
                disabled={rotationLoading}
                className="px-3.5 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleManualRotateToken}
                disabled={rotationLoading}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-md shadow-amber-950/50 flex items-center gap-1.5 transition-all"
              >
                {rotationLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{rotationLoading ? l('Processing...', 'Memproses...') : l('Yes, Rotate Token Now', 'Ya, Rotasi Token Sekarang')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: RISK CALCULATION WIZARD                                          */}
      {/* ========================================================================= */}
      {showRiskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-2xl border border-amber-500/40 bg-[#0d1322] p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Calculator className="h-4 w-4" />
                <span>{l('Automated Risk Parameter Wizard', 'Kalkulator Parameter Risiko Otomatis')}</span>
              </div>
              <button onClick={() => setShowRiskModal(false)} className="text-slate-400 hover:text-slate-200 text-xs">
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold block">
                    {l('What is your Total Capital? (IDR)', 'Berapa Total Modal Anda? (IDR)')}
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const status = await api.getStatus();
                        const bal = status?.balanceIdr || 0;
                        if (bal >= 10000) {
                          setWizardCapital(Math.round(bal).toString());
                          setToast({ message: `Saldo terdeteksi: Rp ${Math.round(bal).toLocaleString('id-ID')}`, type: 'info' });
                        } else {
                          setToast({ message: `Saldo saat ini Rp ${Math.round(bal).toLocaleString('id-ID')} (kurang dari Rp 10.000)`, type: 'info' });
                        }
                      } catch {
                        setToast({ message: 'Tidak dapat mengambil saldo bursa.', type: 'error' });
                      }
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium"
                  >
                    {l('Fetch Current Balance', 'Ambil Saldo Terkini')}
                  </button>
                </div>
                <input
                  type="number"
                  step="10000"
                  value={wizardCapital}
                  onChange={(e) => setWizardCapital(e.target.value)}
                  placeholder="Contoh: 100000 atau 1000000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 font-mono text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {['50000', '100000', '500000', '1000000', '5000000', '10000000'].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setWizardCapital(val)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        wizardCapital === val
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      Rp {parseInt(val).toLocaleString('id-ID')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1.5">
                  {l('Select Risk Profile:', 'Pilih Profil Risiko:')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardProfile('conservative')}
                    className={`p-2 rounded-lg border text-center transition-colors ${
                      wizardProfile === 'conservative'
                        ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span className="font-bold block">Konservatif</span>
                    <span className="text-[10px] opacity-75">Aman &amp; Bertahap</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWizardProfile('balanced')}
                    className={`p-2 rounded-lg border text-center transition-colors ${
                      wizardProfile === 'balanced'
                        ? 'border-blue-500/60 bg-blue-950/40 text-blue-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span className="font-bold block">Seimbang</span>
                    <span className="text-[10px] opacity-75">Rekomendasi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWizardProfile('aggressive')}
                    className={`p-2 rounded-lg border text-center transition-colors ${
                      wizardProfile === 'aggressive'
                        ? 'border-amber-500/60 bg-amber-950/40 text-amber-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span className="font-bold block">Agresif</span>
                    <span className="text-[10px] opacity-75">High Return</span>
                  </button>
                </div>
              </div>

              {(() => {
                const cap = Math.max(10000, parseFloat(wizardCapital) || 100000);
                const allocPct = wizardProfile === 'conservative' ? 0.2 : wizardProfile === 'aggressive' ? (cap >= 1000000 ? 0.3 : 0.45) : 0.3;
                let alloc = Math.max(10000, Math.round(cap * allocPct));
                const targetTrades = wizardProfile === 'conservative' ? (cap >= 5000000 ? 3 : 2) : (cap >= 500000 ? 3 : 2);
                const maxAllowed = Math.max(1, Math.floor(cap / alloc));
                const finalTrades = Math.min(targetTrades, maxAllowed);
                if (alloc * finalTrades > cap) {
                  alloc = Math.max(10000, Math.floor(cap / finalTrades));
                }
                const totalCommit = alloc * finalTrades;
                const buffer = Math.max(0, cap - totalCommit);
                const bufferPct = Math.round((buffer / cap) * 100);

                return (
                  <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 space-y-1.5 font-mono text-[11px] text-slate-300">
                    <div className="text-slate-500 uppercase text-[10px] font-bold pb-1 border-b border-slate-900 flex justify-between items-center">
                      <span>{l('Automatic Calculation Results:', 'Hasil Kalkulasi Otomatis:')}</span>
                      <span className="text-amber-400 font-sans font-semibold text-[10px]">{l('100% Compliant with Indodax Rules', '100% Sesuai Aturan Indodax')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">{l('Allocation per Coin:', 'Alokasi per Koin:')}</span>
                      <strong className="text-emerald-400">Rp {alloc.toLocaleString('id-ID')}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">{l('Max Active Coins:', 'Maksimal Koin Aktif:')}</span>
                      <strong className="text-slate-100">{finalTrades} Posisi</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">{l('Safety Cash Reserve:', 'Cadangan Kas Pengaman:')}</span>
                      <strong className="text-sky-400">Rp {buffer.toLocaleString('id-ID')} ({bufferPct}%)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">Trailing Stop Loss:</span>
                      <strong className="text-amber-400">{wizardProfile === 'conservative' ? '1.8%' : wizardProfile === 'balanced' ? '2.5%' : '3.5%'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">{l('Take Profit Target 1:', 'Target Take Profit 1:')}</span>
                      <strong className="text-indigo-400">{wizardProfile === 'conservative' ? '3.5%' : wizardProfile === 'balanced' ? '5.0%' : '7.5%'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">{l('Daily Loss Limit:', 'Batas Rugi Harian:')}</span>
                      <strong className="text-rose-400">{wizardProfile === 'conservative' ? '3.0%' : wizardProfile === 'balanced' ? '5.0%' : '8.0%'}</strong>
                    </div>

                    {cap < 50000 && (
                      <div className="pt-1.5 border-t border-slate-900 text-[10px] font-sans text-amber-400/90 leading-tight">
                        💡 Modal di bawah Rp 50.000 dapat berjalan aman dengan 1-2 koin aktif (minimal order Indodax Rp 10.000).
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRiskModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyRiskWizard}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white shadow-sm"
              >
                {l('Apply Parameters', 'Terapkan Parameter')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ANTIGRAVITY GOOGLE OAUTH CONNECTION                               */}
      {/* ========================================================================= */}
      {showAntigravityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-blue-500/30 bg-[#0d1322] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>{l('Connect Antigravity', 'Hubungkan Antigravity')}</span>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-500/30">
                      Google Cloud Code
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {l('Direct Google OAuth authentication for Gemini & Claude model access', 'Otentikasi langsung Google OAuth untuk akses model Gemini & Claude')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAntigravityModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Status: WAITING FOR POPUP / DETECTING */}
            {agyStep === 'waiting' && (
              <div className="py-6 text-center space-y-4">
                <div className="relative mx-auto w-12 h-12 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                  <Globe className="h-5 w-5 text-blue-400" />
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-200">
                    {l('Waiting for Authorization in Google Window...', 'Menunggu Otorisasi di Jendela Google...')}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                    {l('The Google authorization window has opened. Please select your Google account and click Allow / Continue.', 'Jendela otorisasi Google telah dibuka. Silakan pilih akun Google Anda dan klik Allow / Lanjutkan.')}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs text-amber-300 text-left space-y-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>{l('Popup window blocked or did not appear?', 'Jendela popup tidak muncul atau diblokir peramban?')}</span>
                  </p>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    {l('If your browser blocked the automatic popup, switch to manual mode to open the link and paste the redirect callback URL manually.', 'Jika peramban Anda memblokir popup otomatis, Anda dapat beralih ke mode manual untuk membuka tautan otorisasi dan menempelkan URL callback hasil redirect secara manual.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAgyStep('manual')}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/40 border border-amber-500/40 text-amber-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{l('Switch to Manual URL Input (Popup Blocked)', 'Beralih ke Input URL Manual (Popup Terblokir)')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Status: MANUAL CALLBACK URL INPUT */}
            {agyStep === 'manual' && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/10 text-xs text-blue-300 flex items-start gap-2.5">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
                  <div>
                    <p className="font-semibold">{l('Manual Verification Mode (Popup Blocked / Headless)', 'Mode Verifikasi Manual (Popup Terblokir / Headless)')}</p>
                    <p className="text-[11px] text-blue-200/80 mt-0.5">
                      {l('Follow the 2 simple steps below to connect your Antigravity Google account manually.', 'Ikuti 2 langkah mudah di bawah ini untuk menghubungkan akun Google Antigravity Anda secara manual.')}
                    </p>
                  </div>
                </div>

                {/* Step 1: Open URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">1</span>
                    <span>{l('Open Google Authentication Link', 'Buka Tautan Otentikasi Google')}</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={agyAuthUrl}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-300 font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(agyAuthUrl);
                        setCopiedAuthUrl(true);
                        setTimeout(() => setCopiedAuthUrl(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-medium text-slate-200 hover:bg-slate-700 flex items-center gap-1"
                    >
                      {copiedAuthUrl ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedAuthUrl ? 'Tersalin' : 'Salin'}</span>
                    </button>
                    <a
                      href={agyAuthUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-1"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>{l('Open', 'Buka')}</span>
                    </a>
                  </div>
                </div>

                {/* Step 2: Paste Callback URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">2</span>
                    <span>{l('Paste Redirected Callback URL or Code', 'Tempelkan URL Callback Hasil Redirect atau Kode')}</span>
                  </label>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {l('After clicking "Allow" in Google, copy the entire contents of your browser address bar (e.g. http://127.0.0.1:3001/callback?code=4/0A...) and paste it below:', 'Setelah menekan "Allow" di Google, salin seluruh isi bilah alamat peramban Anda (contoh: http://127.0.0.1:3001/callback?code=4/0A...) lalu tempelkan di bawah:')}
                  </p>
                  <input
                    type="text"
                    value={agyCallbackInput}
                    onChange={(e) => setAgyCallbackInput(e.target.value)}
                    placeholder="http://127.0.0.1:3001/callback?code=... atau kode otorisasi"
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAntigravityModal(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={!agyCallbackInput.trim()}
                    onClick={() => submitAntigravityCallback(agyCallbackInput)}
                    className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-md disabled:opacity-50"
                  >
                    Hubungkan Antigravity
                  </button>
                </div>
              </div>
            )}

            {/* Status: EXCHANGING & ONBOARDING */}
            {agyStep === 'exchanging' && (
              <div className="py-8 text-center space-y-4">
                <div className="relative mx-auto w-12 h-12 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                  <Sparkles className="h-5 w-5 text-blue-400 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">{l('Connecting Antigravity Account...', 'Menghubungkan Akun Antigravity...')}</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                    {l('Exchanging Google OAuth code, detecting GCP Cloud Code Project, and importing model catalog.', 'Menukarkan kode otorisasi Google OAuth, mendeteksi GCP Cloud Code Project, dan mengimpor katalog model.')}
                  </p>
                </div>
              </div>
            )}

            {/* Status: SUCCESS */}
            {agyStep === 'success' && (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100">
                    {l('Successfully Connected to Antigravity!', 'Berhasil Terhubung ke Antigravity!')}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    {l('OAuth connection and auto-refresh tokens are stored securely.', 'Koneksi OAuth dan auto-refresh token telah tersimpan aktif.')}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 text-xs font-mono text-left space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{l('Account Email:', 'Email Akun:')}</span>
                    <span className="text-emerald-400 font-bold">{agySuccessData?.email || 'Google User'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">GCP Project:</span>
                    <span className="text-blue-400">{agySuccessData?.projectId || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{l('Imported Models:', 'Model Diimpor:')}</span>
                    <span className="text-slate-200 font-bold">{agySuccessData?.modelsCount || 6} {l('Models Ready', 'Model Siap Pakai')}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAntigravityModal(false)}
                  className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-md"
                >
                  {l('Done & Close', 'Selesai & Tutup')}
                </button>
              </div>
            )}

            {/* Status: ERROR */}
            {agyStep === 'error' && (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-rose-300">{l('Failed to Connect Antigravity', 'Gagal Menghubungkan Antigravity')}</h4>
                  <p className="text-xs text-rose-200/80 max-w-sm mx-auto mt-1 break-words font-mono">
                    {agyError || l('Authentication error occurred.', 'Terjadi kesalahan saat otentikasi.')}
                  </p>
                </div>

                <div className="flex gap-2 justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAntigravityModal(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    onClick={handleStartAntigravityConnect}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-sm"
                  >
                    Coba Lagi
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteProviderId)}
        title={l('Delete AI Provider?', 'Hapus Provider AI?')}
        message={l('Are you sure you want to delete this provider and all connected models? This action cannot be undone.', 'Yakin ingin menghapus provider ini beserta seluruh model yang terhubung? Tindakan ini tidak dapat dibatalkan.')}
        confirmText={l('Delete Provider', 'Hapus Provider')}
        cancelText={l('Cancel', 'Batal')}
        variant="danger"
        onConfirm={handleConfirmDeleteProvider}
        onCancel={() => setDeleteProviderId(null)}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};
