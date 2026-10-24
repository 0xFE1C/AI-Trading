import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Shield,
  Clock,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  ArrowRight,
  Zap,
  Sliders,
  HelpCircle,
  ShieldCheck,
  Cpu,
  MessageSquare,
  BarChart2,
  Activity,
  Info,
  CheckSquare,
  Square,
  BookOpen,
  Calculator,
} from 'lucide-react';
import { SystemStatus, RiskProfileKey } from '../types';
import { CryptoChart } from './CryptoChart';
import { AbValidationSection } from './AbValidationSection';
import { EntryDiagnosticsSection } from './EntryDiagnosticsSection';
import { HelpTooltip } from './HelpTooltip';
import { Toast } from './Toast';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';

interface DashboardViewProps {
  status: SystemStatus | null;
  onRefresh: () => void;
  displayMode?: 'simple' | 'pro';
  onSwitchTab?: (tab: string, subTab?: string) => void;
  isAdmin?: boolean;
  onOpenAuthModal?: () => void;
  onToggleTrading?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  status,
  onRefresh,
  displayMode = 'simple',
  onSwitchTab,
  isAdmin = false,
  onOpenAuthModal,
  onToggleTrading,
}) => {
  const { l, formatCurrency, formatNumber, language } = useLanguage();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [hasProvider, setHasProvider] = useState<boolean>(false);
  const [hasModels, setHasModels] = useState<boolean>(false);
  const [activeModelName, setActiveModelName] = useState<string>('');
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('ai_trading_guide_open');
    if (saved !== null) return saved === 'true';
    return displayMode === 'simple';
  });
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);
  const [showChartInSimple, setShowChartInSimple] = useState<boolean>(false);
  const [showAbInSimple, setShowAbInSimple] = useState<boolean>(false);
  const [showDiagnosticsInSimple, setShowDiagnosticsInSimple] = useState<boolean>(true);
  const [updatingProfile, setUpdatingProfile] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Persistent Onboarding Checklist
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ai_trading_checklist');
      return saved ? JSON.parse(saved) : { step1: false, step2: false, step3: false, step4: false };
    } catch {
      return { step1: false, step2: false, step3: false, step4: false };
    }
  });

  const toggleChecklistItem = (key: string) => {
    setChecklist((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('ai_trading_checklist', JSON.stringify(next));
      return next;
    });
  };

  const openPositions = status?.openPositions || [];
  const recentTrades = status?.recentTrades || [];
  const lessons = status?.lessonsLearned || [];
  const sentiment = status?.sentiment?.averageSentiment ?? 0;
  const balance = status?.balanceIdr ?? 0;
  const isAuto = status?.isAutoTradingActive ?? false;

  // Calculate total unrealized floating PnL
  const totalFloatingPnl = openPositions.reduce((acc, p) => acc + (p.pnl_idr || 0), 0);
  const totalFloatingPnlPercent = openPositions.length > 0
    ? openPositions.reduce((acc, p) => acc + (p.pnl_percent || 0), 0) / openPositions.length
    : 0;

  useEffect(() => {
    const loadDashboardContext = async () => {
      try {
        const [sett, provs, models] = await Promise.all([
          api.getSettings(),
          api.getProviders(),
          api.getModels(),
        ]);
        setSettings(sett);
        setHasProvider(provs.length > 0);
        setHasModels(models.length > 0);

        const currentModel = sett.master_model || sett.subagent_model || '';
        const foundModel = models.find((m) => m.alias_model_id === currentModel);
        setActiveModelName(foundModel ? foundModel.display_name : currentModel || l('Not selected', 'Belum dipilih'));
      } catch (e) {
        // Silent catch
      }
    };
    loadDashboardContext();
  }, [language]);

  const toggleGuide = () => {
    setIsGuideOpen((prev) => {
      const next = !prev;
      localStorage.setItem('ai_trading_guide_open', String(next));
      return next;
    });
  };

  const handleQuickSelectRisk = async (profile: RiskProfileKey) => {
    if (!isAdmin) {
      if (onOpenAuthModal) onOpenAuthModal();
      return;
    }
    setUpdatingProfile(true);
    try {
      await api.setRiskProfile(profile);
      const freshSettings = await api.getSettings();
      setSettings(freshSettings);
      setToast({
        message: `${l('Risk profile successfully changed to: ', 'Profil risiko berhasil diubah menjadi: ')}${profile.toUpperCase()}`,
        type: 'success',
      });
      onRefresh();
    } catch (err: any) {
      setToast({
        message: `${l('Failed to select risk profile: ', 'Gagal memilih profil risiko: ')}${err.message}`,
        type: 'error',
      });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const currentProfileKey = (settings.risk_profile || 'balanced') as RiskProfileKey;
  const isAiConfigured = hasProvider && hasModels && Boolean(settings.master_model);
  const isWaConnected = status?.whatsapp?.connected ?? false;

  const completedSetupCount = [
    hasProvider,
    isAiConfigured,
    isWaConnected,
    Boolean(settings.risk_profile),
  ].filter(Boolean).length;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Executive Telemetry & Financial KPI Cards (Priority Top Row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Balance & Capital */}
        <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-b from-[#0e1629] via-[#0b1120] to-[#080d19] p-4 sm:p-5 shadow-lg flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {status?.mode === 'paper'
                  ? l('Virtual Balance (Paper)', 'Saldo Virtual (Paper)')
                  : l('Real Indodax Balance', 'Saldo Riil Indodax')}
              </span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-100 tracking-tight">
              {formatCurrency(balance)}
            </div>
            <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${status?.mode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`} />
              <span>{l('Mode: ', 'Mode: ')}<strong className="text-slate-200 uppercase">{status?.mode} Trading</strong></span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/60">
            {status?.mode === 'paper' ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[10px] text-emerald-300 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">{l('Simulation Mode: 100% Risk-Free Virtual Capital', 'Mode Simulasi: Saldo Virtual (Bebas Risiko)')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-500/30 text-[10px] text-amber-300 font-medium">
                <Shield className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span className="truncate">{l('Live Mode: Real Funds & Stop Loss Active', 'Live Riil: Pengaman Stop Loss Aktif')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Floating Profit / Loss */}
        <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-b from-[#0e1629] via-[#0b1120] to-[#080d19] p-4 sm:p-5 shadow-lg flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {l('Floating Profit / Loss', 'Keuntungan / Rugi Berjalan')}
              </span>
              <div className={`p-1.5 rounded-lg border ${
                totalFloatingPnl >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}>
                {totalFloatingPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              </div>
            </div>
            <div className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
              totalFloatingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {totalFloatingPnl >= 0 ? '+' : ''}{formatCurrency(Math.round(totalFloatingPnl))}
            </div>
            <div className={`mt-2 text-xs font-mono font-medium flex items-center gap-1.5 ${
              totalFloatingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {totalFloatingPnl >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              <span>
                {totalFloatingPnlPercent >= 0 ? '+' : ''}{totalFloatingPnlPercent.toFixed(2)}% {l('across', 'dari')} {openPositions.length} {l('coins', 'koin')}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>{l('Active Positions: ', 'Posisi Aktif: ')}<strong className="text-slate-200">{openPositions.length}</strong></span>
            <span>•</span>
            <span>{l('Completed: ', 'Selesai: ')}<strong className="text-slate-200">{recentTrades.length}</strong></span>
          </div>
        </div>

        {/* Card 3: AI Market Condition Index */}
        <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-b from-[#0e1629] via-[#0b1120] to-[#080d19] p-4 sm:p-5 shadow-lg flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {l('AI Market Condition Index', 'Kondisi Pasar Menurut AI')}
              </span>
              <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-100 tracking-tight">
                {sentiment > 0 ? `+${sentiment}` : sentiment}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                sentiment >= 0.2
                  ? 'border-emerald-500/30 bg-emerald-950/50 text-emerald-300'
                  : sentiment <= -0.2
                  ? 'border-rose-500/30 bg-rose-950/50 text-rose-300'
                  : 'border-slate-700 bg-slate-800 text-slate-300'
              }`}>
                {sentiment >= 0.2
                  ? l('BULLISH', 'BULLISH (NAIK)')
                  : sentiment <= -0.2
                  ? l('BEARISH', 'BEARISH (TURUN)')
                  : l('NEUTRAL', 'NETRAL')}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">{l('10 Subagents & Signals Radar', '10 Subagent & Radar Sinyal')}</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>{l('Risk Profile: ', 'Profil Risiko: ')}</span>
            <span className="font-semibold text-slate-200 uppercase font-mono">{currentProfileKey}</span>
          </div>
        </div>

        {/* Card 4: Engine Status & Bot Alerts */}
        <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-b from-[#0e1629] via-[#0b1120] to-[#080d19] p-4 sm:p-5 shadow-lg flex flex-col justify-between hover:border-slate-700/80 transition-all">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {l('Trading Engine & Alerts', 'Status Mesin & Notifikasi')}
              </span>
              <div className={`p-1.5 rounded-lg border ${
                isAuto
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              }`}>
                {isAuto ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4" />}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isAuto ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
              <span className="text-lg font-bold text-slate-100 font-mono">
                {isAuto
                  ? l('ACTIVE (RUNNING)', 'AKTIF (MEMANTAU)')
                  : l('PAUSED (STANDBY)', 'DIJEDA (SIAGA)')}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-slate-400 truncate">
              {isAuto
                ? l('Actively scanning Indodax pairs', 'Memindai koin Indodax real-time')
                : l('Market monitored, orders held', 'Sinyal dipantau, order ditahan')}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-400">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isWaConnected ? l('WA Online', 'WA Aktif') : l('WA Standby', 'WA Siaga')}</span>
            </div>
            <button
              type="button"
              onClick={onToggleTrading}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                isAuto
                  ? 'bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {isAuto ? l('Pause', 'Jeda') : l('Start', 'Mulai')}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Unified, Collapsible Quick Start Guide & Checklist */}
      <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-[#0c1426] via-[#090f1d] to-[#070b14] shadow-md overflow-hidden transition-all">
        {/* Guide Header Bar */}
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 bg-slate-900/30">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shrink-0">
              <Sparkles className="h-4.5 w-4.5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100 tracking-tight">
                  {l('Quick Start Setup Guide', 'Panduan Memulai Cepat (Quick Start)')}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-950/50 text-blue-300 font-semibold font-mono">
                  {completedSetupCount}/4 {l('Configured', 'Terkonfigurasi')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {l(
                  'Essential orientation to configure AI connection, models, alerts, and risk management.',
                  'Orientasi penting untuk menghubungkan AI, memilih model, notifikasi, dan profil risiko.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowHowItWorks(!showHowItWorks)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700/70 bg-slate-800/50 hover:bg-slate-800 text-[11px] text-blue-300 hover:text-blue-200 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
              <span>{l('How it Works', 'Cara Kerja')}</span>
            </button>
            <button
              type="button"
              onClick={toggleGuide}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
            >
              <span>{isGuideOpen ? l('Hide Guide', 'Sembunyikan Panduan') : l('Show Steps', 'Buka Langkah')}</span>
              {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Expandable "How Does the Bot Work for You?" Section */}
        {showHowItWorks && (
          <div className="p-4 border-b border-slate-800/80 bg-blue-950/20 text-xs text-blue-200 flex items-start gap-3 animate-in fade-in duration-200">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-slate-100 block">
                {l('How Does the Bot Work for You?', 'Bagaimana Bot Bekerja untuk Anda?')}
              </span>
              <p className="leading-relaxed text-blue-200/90 text-[11px]">
                {l(
                  'The bot automatically scans all pairs on Indodax every 15 seconds. When safe upward momentum is confirmed by the AI evaluator, the bot executes the buy and immediately sets dynamic trailing stop-loss protection to lock profits and safeguard your capital.',
                  'Bot secara otomatis memindai seluruh koin di Indodax setiap 15 detik. Jika ada koin yang memiliki momentum kenaikan yang aman dan disetujui oleh evaluator AI, bot akan membelinya serta langsung memasang pengaman otomatis (stop-loss dinamis) agar keuntungan Anda terkunci dan modal Anda terlindungi dari kerugian.'
                )}
              </p>
            </div>
          </div>
        )}

        {/* Collapsible Stepper & Action Content */}
        {isGuideOpen && (
          <div className="p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
            {/* 4 Interactive Step Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {/* Step 1: AI Provider */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                hasProvider
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-slate-200'
                  : 'border-blue-500/30 bg-blue-950/20 text-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                    {l('Step 1', 'Langkah 1')}
                  </span>
                  {hasProvider ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {l('Connected', 'Terhubung')}
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-400 font-medium">
                      {l('Connection Required', 'Perlu Dihubungkan')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Cpu className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-100">
                    {l('AI Account Connection', 'Koneksi Akun AI')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mb-3">
                  {hasProvider
                    ? l('AI Provider (Google Antigravity / Token Harbor) is active.', 'Provider AI (Google Antigravity / Token Harbor) telah aktif.')
                    : l('Connect Google account or enter AI API Key.', 'Hubungkan akun Google atau masukkan API Key AI.')}
                </p>
                <button
                  type="button"
                  onClick={() => onSwitchTab && onSwitchTab('settings', 'ai')}
                  className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                    hasProvider
                      ? 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                  }`}
                >
                  <span>{hasProvider ? l('View Providers', 'Lihat Provider') : l('Connect AI', 'Hubungkan AI')}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Step 2: Model Routing */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                isAiConfigured
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-slate-200'
                  : 'border-indigo-500/30 bg-indigo-950/20 text-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                    {l('Step 2', 'Langkah 2')}
                  </span>
                  {isAiConfigured ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {l('Ready', 'Siap')}
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-400 font-medium">
                      {l('Select Model', 'Pilih Model')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-100">
                    {l('Selected AI Model', 'Model AI Terpilih')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mb-3 truncate" title={activeModelName}>
                  {activeModelName
                    ? `${l('Model: ', 'Model: ')}${activeModelName}`
                    : l('Select recommended model (Gemini / Claude)', 'Pilih model rekomendasi (Gemini / Claude)')}
                </p>
                <button
                  type="button"
                  onClick={() => onSwitchTab && onSwitchTab('settings', 'ai')}
                  className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                    isAiConfigured
                      ? 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                  }`}
                >
                  <span>{isAiConfigured ? l('Change Model', 'Ubah Model') : l('Select AI Model', 'Pilih Model AI')}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Step 3: Notification Bots (WhatsApp & Telegram) */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                isWaConnected
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-slate-200'
                  : 'border-slate-800 bg-slate-900/40 text-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                    {l('Step 3 (Optional)', 'Langkah 3 (Opsional)')}
                  </span>
                  {isWaConnected ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {l('Online', 'Online')}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      {l('Not Connected', 'Belum Terhubung')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-100">
                    {l('Notification Bots (WA & Telegram)', 'Bot Notifikasi (WA & Telegram)')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mb-3">
                  {isWaConnected
                    ? l('Real-time transaction alerts to your phone (WhatsApp / Telegram).', 'Notifikasi transaksi aktif ke HP Anda (WhatsApp / Telegram).')
                    : l('Connect WhatsApp or Telegram to receive profit alerts on your phone.', 'Hubungkan WhatsApp atau Telegram untuk menerima notifikasi profit di HP.')}
                </p>
                <button
                  type="button"
                  onClick={() => onSwitchTab && onSwitchTab('bots')}
                  className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                    isWaConnected
                      ? 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      : 'border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                  }`}
                >
                  <span>{isWaConnected ? l('Manage Bots', 'Kelola Bots') : l('Configure Bots', 'Atur Bot Notifikasi')}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Step 4: Risk Profile */}
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/15 text-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                      {l('Step 4', 'Langkah 4')}
                    </span>
                    <span className="text-[11px] text-amber-400 font-medium">
                      {currentProfileKey === 'conservative'
                        ? l('Conservative', 'Konservatif')
                        : currentProfileKey === 'aggressive'
                        ? l('Aggressive', 'Agresif')
                        : l('Balanced', 'Seimbang')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-100">
                      {l('Capital Risk Profile', 'Profil Risiko Modal')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug mb-2.5">
                    {l('Select your trading style in 1 click:', 'Pilih gaya trading Anda dengan 1-klik:')}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    disabled={updatingProfile}
                    onClick={() => handleQuickSelectRisk('conservative')}
                    title={l('Top liquid coins only (BTC, ETH, SOL), Stop Loss 1.5%', 'Hanya koin likuid teratas (BTC, ETH, SOL), Stop Loss 1.5%')}
                    className={`py-1 px-1.5 rounded text-[10px] font-semibold text-center transition-all ${
                      currentProfileKey === 'conservative'
                        ? 'bg-emerald-600 text-white font-bold shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {l('Safe', 'Aman')}
                  </button>
                  <button
                    type="button"
                    disabled={updatingProfile}
                    onClick={() => handleQuickSelectRisk('balanced')}
                    title={l('Top coin momentum + Take Profit 5%', 'Momentum koin teratas + Take Profit 5%')}
                    className={`py-1 px-1.5 rounded text-[10px] font-semibold text-center transition-all ${
                      currentProfileKey === 'balanced'
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {l('Balanced', 'Seimbang')}
                  </button>
                  <button
                    type="button"
                    disabled={updatingProfile}
                    onClick={() => handleQuickSelectRisk('aggressive')}
                    title={l('Targets new listings & high volatility memecoins', 'Mengincar listing baru & koin memecoin')}
                    className={`py-1 px-1.5 rounded text-[10px] font-semibold text-center transition-all ${
                      currentProfileKey === 'aggressive'
                        ? 'bg-amber-600 text-white font-bold shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {l('Aggressive', 'Agresif')}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onSwitchTab && onSwitchTab('settings', 'risk')}
                  className="w-full mt-2.5 py-1 px-2 rounded-lg border border-amber-500/30 bg-amber-950/30 hover:bg-amber-900/40 text-[10px] text-amber-300 font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Calculator className="w-3 h-3 text-amber-400" />
                  <span>{l('Calculate Auto Capital Allocation', 'Hitung Alokasi Modal Otomatis')}</span>
                </button>
              </div>
            </div>

            {/* Checklist Strip inside Guide */}
            <div className="pt-2 border-t border-slate-800/60">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{l('Trader Readiness Checklist:', 'Checklist Kesiapan Trader:')}</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {Object.values(checklist).filter(Boolean).length} / 4 {l('Completed', 'Selesai')}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                {[
                  { id: 'step1', label: l('1. Connect AI Model (Google/Claude)', '1. Hubungkan Model AI (Google/Claude)') },
                  { id: 'step2', label: l('2. Set Safe Risk Profile (Conservative)', '2. Pasang Profil Risiko Aman (Konservatif)') },
                  { id: 'step3', label: l('3. Test for 7+ days in Paper Mode', '3. Uji minimal 7 hari di Mode Paper') },
                  { id: 'step4', label: l('4. Create periodic database backups', '4. Buat cadangan database berkala') },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleChecklistItem(item.id)}
                    className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all ${
                      checklist[item.id]
                        ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                        : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {checklist[item.id] ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    )}
                    <span className={`text-[11px] leading-snug truncate ${checklist[item.id] ? 'line-through text-slate-400' : ''}`}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Action Bar inside Guide */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isAuto ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                <div>
                  <div className="text-xs font-bold text-slate-200">
                    {isAuto
                      ? l('Auto-Trading is ACTIVE & Monitoring Market', 'Auto-Trading Sedang AKTIF Memantau Pasar')
                      : l('Auto-Trading is currently PAUSED (Standby)', 'Auto-Trading Saat Ini Sedang PAUSED (Siaga)')}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {l('Current mode: ', 'Mode saat ini: ')}
                    <strong className="text-slate-300 font-mono">{status?.mode?.toUpperCase()} TRADING</strong>{' '}
                    ({l('Virtual simulation: ', 'Simulasi modal virtual ')}{formatCurrency(balance)}).
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleTrading}
                className={`w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${
                  isAuto
                    ? 'border border-amber-500/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
                }`}
              >
                {isAuto ? (
                  <>
                    <Pause className="w-4 h-4 text-amber-400" />
                    <span>{l('Pause Auto-Trading', 'Jeda Auto-Trading (Pause)')}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>{l('Start Auto-Trading Now (Safe)', 'Mulai Auto-Trading Sekarang (Aman)')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Section: Posisi Koin Aktif */}
      <div className="rounded-xl border border-slate-800 bg-[#0b101b] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-900/30">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold tracking-wide text-slate-200">
              {l('Active Open Positions', 'Posisi Koin yang Sedang Berjalan')} ({openPositions.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {l('Dynamic Protection: Trailing Stop Loss & Scale-Out TP', 'Pengaman Dinamis: Trailing Stop Loss & Scale-Out TP')}
          </span>
        </div>

        {openPositions.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <AlertCircle className="h-8 w-8 text-slate-500 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-medium text-slate-300">
              {l('No positions currently held.', 'Belum ada koin yang sedang di-hold.')}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {l(
                'Autonomous system is scanning Indodax for opportunities. When safe momentum is confirmed, positions will appear here automatically.',
                'Sistem autonomous sedang memindai peluang koin di Indodax. Saat momentum terdeteksi dan aman, koin akan otomatis muncul di sini.'
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800/60 bg-slate-900/50 text-slate-400 font-mono text-[11px] uppercase">
                    <th className="py-3 px-4">{l('Coin / Pair', 'Koin / Pair')}</th>
                    <th className="py-3 px-4">{l('Entry Price', 'Harga Beli')}</th>
                    <th className="py-3 px-4">{l('Current Price', 'Harga Sekarang')}</th>
                    <th className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <span>{l('Stop Loss Level', 'Level Pengaman (Stop Loss)')}</span>
                        <HelpTooltip content={l(
                          'Trailing Stop Loss: Protection price level that automatically ratchets up as coin price rises. If price reverses below this, bot automatically sells to lock profits or limit losses.',
                          'Trailing Stop Loss: Level harga proteksi yang otomatis naik mengikuti kenaikan harga koin. Bila harga berbalik turun menembus angka ini, bot otomatis menjual untuk mengamankan profit atau membatasi rugi.'
                        )} />
                      </div>
                    </th>
                    <th className="py-3 px-4">{l('Capital Used', 'Modal Terpakai')}</th>
                    <th className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <span>{l('Floating PnL', 'Keuntungan (PnL)')}</span>
                        <HelpTooltip content={l(
                          'Floating Profit & Loss: Estimated unrealized profit or loss before sell execution.',
                          'Floating Profit & Loss: Estimasi keuntungan atau kerugian berjalan saat ini sebelum koin dieksekusi jual.'
                        )} />
                      </div>
                    </th>
                    <th className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <span>{l('Protection Status', 'Status Pengamanan')}</span>
                        <HelpTooltip content={l(
                          'Scale-Out TP: When profit hits the initial target, bot secures 50% profits and moves the stop loss to breakeven.',
                          'Scale-Out TP: Saat profit capai target awal, bot menjual 50% untuk kunci profit dan memindahkan stop loss ke titik impas (breakeven).'
                        )} />
                      </div>
                    </th>
                    <th className="py-3 px-4">{l('Hold Duration', 'Lama Hold')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {openPositions.map((pos) => {
                    const isProfit = (pos.pnl_percent || 0) >= 0;
                    const holdMin = Math.round((Date.now() - pos.opened_at) / 60000);

                    return (
                      <tr key={pos.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-200 text-sm">
                          {pos.symbol.toUpperCase()}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {formatCurrency(pos.entry_price)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-100 font-semibold">
                          {formatCurrency(pos.current_price)}
                        </td>
                        <td className="py-3.5 px-4 text-amber-400 font-bold">
                          {formatCurrency(Math.round(pos.trailing_stop_price))}
                          <span className="block text-[10px] text-slate-500 font-sans font-normal">
                            {l('(Auto-sells if breached)', '(Otomatis jual bila tembus)')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {formatCurrency(Math.round(pos.initial_cost_idr))}
                        </td>
                        <td className={`py-3.5 px-4 font-semibold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}{pos.pnl_percent?.toFixed(2)}%
                          <span className="block text-[11px] opacity-80">
                            ({isProfit ? '+' : ''}{formatCurrency(Math.round(pos.pnl_idr || 0))})
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans border ${
                            pos.take_profit_step === 1
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30 font-semibold'
                              : 'bg-blue-950/40 text-blue-300 border-blue-500/30'
                          }`}>
                            <Shield className="h-3 w-3" />
                            {pos.take_profit_step === 1
                              ? l('50% Profit Locked (Breakeven)', '50% Profit Aman (Breakeven Locked)')
                              : l('Tracking Momentum', 'Tracking Momentum')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 flex items-center gap-1.5 pt-4 font-sans">
                          <Clock className="h-3.5 w-3.5 text-slate-500" />
                          {holdMin} {l('min', 'menit')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-slate-800/80 p-3 space-y-3">
              {openPositions.map((pos) => {
                const isProfit = (pos.pnl_percent || 0) >= 0;
                const holdMin = Math.round((Date.now() - pos.opened_at) / 60000);

                return (
                  <div key={pos.id} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-100 font-mono">
                          {pos.symbol.toUpperCase()}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${
                          pos.take_profit_step === 1
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                            : 'bg-blue-950/60 text-blue-300 border-blue-500/30'
                        }`}>
                          <Shield className="w-2.5 h-2.5" />
                          {pos.take_profit_step === 1 ? l('Profit Locked', 'Profit Aman') : l('Tracking', 'Tracking')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{holdMin}m</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/60">
                        <span className="text-[10px] text-slate-500 block uppercase">{l('Current Price', 'Harga Sekarang')}</span>
                        <span className="font-semibold text-slate-200">{formatCurrency(pos.current_price)}</span>
                        <span className="text-[10px] text-slate-500 block">{l('Buy: ', 'Beli: ')}{formatCurrency(pos.entry_price)}</span>
                      </div>
                      <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/60">
                        <span className="text-[10px] text-slate-500 block uppercase">{l('Stop Loss Level', 'Pengaman (Stop Loss)')}</span>
                        <span className="font-bold text-amber-400">{formatCurrency(Math.round(pos.trailing_stop_price))}</span>
                        <span className="text-[10px] text-slate-500 block">{l('Auto Cut/TP', 'Otomatis Cut/TP')}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <div className="text-xs">
                        <span className="text-[10px] text-slate-500 block uppercase font-mono">{l('Capital Used', 'Modal Terpakai')}</span>
                        <span className="font-mono text-slate-300">{formatCurrency(Math.round(pos.initial_cost_idr))}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block uppercase font-mono">{l('Floating PnL', 'PnL Berjalan')}</span>
                        <span className={`text-sm font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}{pos.pnl_percent?.toFixed(2)}%
                          <span className="text-xs font-normal ml-1">
                            ({isProfit ? '+' : ''}{formatCurrency(Math.round(pos.pnl_idr || 0))})
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Accordion or Full: Candlestick Chart */}
      {displayMode === 'simple' ? (
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowChartInSimple(!showChartInSimple)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400">
                <BarChart2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-200 block">
                  {l('Real-Time Market Candlestick Chart (TradingView)', 'Grafik Lilin Pasar Real-Time (TradingView Candlestick)')}
                </span>
                <span className="text-xs text-slate-400">
                  {showChartInSimple
                    ? l('Click to close chart', 'Klik untuk menutup chart')
                    : l('Click to view live technical chart directly from Indodax', 'Klik untuk melihat grafik teknikal harga langsung dari Indodax')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
              <span>{showChartInSimple ? l('Close Chart', 'Tutup Grafik') : l('Show Chart', 'Tampilkan Grafik')}</span>
              {showChartInSimple ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>
          {showChartInSimple && (
            <div className="p-4 pt-0 border-t border-slate-800/80">
              <CryptoChart
                selectedSymbol={
                  openPositions.length > 0
                    ? `${openPositions[0].symbol.replace('idr', '').toUpperCase()}/IDR`
                    : 'BTC/IDR'
                }
              />
            </div>
          )}
        </div>
      ) : (
        <CryptoChart
          selectedSymbol={
            openPositions.length > 0
              ? `${openPositions[0].symbol.replace('idr', '').toUpperCase()}/IDR`
              : 'BTC/IDR'
          }
        />
      )}

      {/* Accordion or Full: A/B Counterfactual Validation Section */}
      {displayMode === 'simple' ? (
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAbInSimple(!showAbInSimple)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-600/15 border border-indigo-500/30 text-indigo-400">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-200 block">
                  {l('Quantitative Lab & AI Added Value Proof (A/B Alpha Tracker)', 'Laboratorium Kuantitatif & Pembuktian Nilai Tambah AI (A/B Alpha Tracker)')}
                </span>
                <span className="text-xs text-slate-400">
                  {showAbInSimple
                    ? l('Click to close quantitative analysis', 'Klik untuk menutup analisis kuantitatif')
                    : l('Tracks AI-rejected coins to prove real-world alpha and decision accuracy', 'Pelacak koin yang ditolak AI untuk membuktikan efektivitas keputusan AI secara nyata')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
              <span>{showAbInSimple ? l('Close Analysis', 'Tutup Analisis') : l('Open Quantitative Analysis', 'Buka Analisis Kuantitatif')}</span>
              {showAbInSimple ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>
          {showAbInSimple && (
            <div className="p-4 pt-0 border-t border-slate-800/80">
              <AbValidationSection />
            </div>
          )}
        </div>
      ) : (
        <AbValidationSection />
      )}

      {/* Accordion or Full: Entry Gate Diagnostics Section */}
      <div data-tour="entry-diagnostics">
        {displayMode === 'simple' ? (
          <div className="rounded-xl border border-slate-800 bg-[#0b101b] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDiagnosticsInSimple(!showDiagnosticsInSimple)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-900/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-200 block">
                    {l('9 Market Entry Gates Status & Coin Radar', 'Status 9 Gerbang Masuk Pasar & Radar Peluang Koin')}
                  </span>
                  <span className="text-xs text-slate-400">
                    {showDiagnosticsInSimple
                      ? l('Click to close gate diagnostics', 'Klik untuk menutup diagnostik gerbang')
                      : l('Transparent insights explaining why the bot is or is not executing trades', 'Pelajari alasan transparan mengapa bot belum atau sedang melakukan transaksi')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                <span>{showDiagnosticsInSimple ? l('Close Diagnostics', 'Tutup Diagnostik') : l('Open Gate Diagnostics', 'Buka Diagnostik Gerbang')}</span>
                {showDiagnosticsInSimple ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
            {showDiagnosticsInSimple && (
              <div className="p-4 pt-0 border-t border-slate-800/80">
                <EntryDiagnosticsSection />
              </div>
            )}
          </div>
        ) : (
          <EntryDiagnosticsSection />
        )}
      </div>

      {/* Two Columns: Recent Trades & AI Self-Learning Lessons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Recent Trade Executions */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
              <Clock className="h-4 w-4 text-blue-400" />
              <span>{l('Recent Trade Executions', 'Aktivitas Transaksi Terakhir')}</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">{l('Order Book', 'Buku Transaksi')}</span>
          </div>

          {recentTrades.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">{l('No trade history yet.', 'Belum ada riwayat transaksi.')}</p>
          ) : (
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {recentTrades.map((t) => {
                const isBuy = t.type === 'BUY';
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-slate-800/50 bg-slate-900/40 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                      }`}>
                        {isBuy ? l('BUY', 'BELI') : l('SELL', 'JUAL')}
                      </span>
                      <div>
                        <span className="font-bold text-slate-200">{t.symbol.toUpperCase()}</span>
                        <p className="text-[11px] text-slate-400">{t.reason || l('Automated by Trading Engine', 'Otomatis oleh Trading Engine')}</p>
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-slate-200 font-medium">{formatCurrency(t.total_idr)}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(t.timestamp).toLocaleTimeString(language === 'id' ? 'id-ID' : 'en-US')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: AI Post-Mortem Self-Learning Lessons */}
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              <span>{l('AI Self-Learning Memory', 'Memori Belajar Mandiri AI (Self-Learning)')}</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">{l('Closed-Loop Memory', 'Closed-Loop Memory')}</span>
          </div>

          {lessons.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              <p>{l('No post-mortem evaluation logs recorded yet.', 'Belum ada rekaman evaluasi post-mortem.')}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {l(
                  'Whenever a coin position is closed, the AI Reviewer analyzes success/failure factors and retains it for future trades.',
                  'Setiap posisi koin ditutup, AI Reviewer menganalisa faktor keberhasilan/kegagalan dan mengingatnya untuk trade berikutnya.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {lessons.map((lessonItem) => {
                const isWin = lessonItem.result === 'WIN';
                return (
                  <div
                    key={lessonItem.id}
                    className="p-3 rounded-lg border border-slate-800/60 bg-slate-900/30 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <div className="flex items-center gap-1.5">
                        {isWin ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-rose-400" />
                        )}
                        <span className="font-bold text-slate-200">{lessonItem.symbol.toUpperCase()}</span>
                        <span className={isWin ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                          ({lessonItem.pnl_percent >= 0 ? '+' : ''}{lessonItem.pnl_percent.toFixed(2)}%)
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(lessonItem.timestamp).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US')}
                      </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed font-sans text-[11px]">
                      "{lessonItem.lesson}"
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* In-App Financial Risk Disclaimer */}
      <div className="p-4 rounded-xl border border-slate-800 bg-[#080d17] text-xs text-slate-400 flex items-start gap-3 shadow-sm">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-300">{l('Risk & Compliance Disclaimer: ', 'Pernyataan Risiko & Kepatuhan: ')}</strong>
          {l(
            'Crypto asset trading carries a high level of risk to your capital. AI Trading is an independent quantitative automation software, not a licensed financial advisor or broker. All strategy decisions and operations are solely controlled by the user. Always prioritize simulation in Paper Mode.',
            'Perdagangan aset kripto memiliki tingkat risiko tinggi terhadap modal Anda. AI Trading adalah piranti lunak otomasi kuantitatif mandiri, bukan penasihat keuangan atau pialang berizin. Segala keputusan strategi dan pengoperasian sepenuhnya berada di bawah kendali pengguna. Selalu utamakan simulasi di Mode Paper.'
          )}
        </p>
      </div>

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
