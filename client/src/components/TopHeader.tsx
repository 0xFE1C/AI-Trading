import React from 'react';
import {
  Menu,
  Activity,
  Play,
  Pause,
  AlertTriangle,
  Lock,
  Unlock,
  ShieldCheck,
  Eye,
  DollarSign,
  TrendingUp,
  Layers,
  Sparkles,
  Zap,
  Globe,
  Gamepad2,
  Bell,
  BookOpen
} from 'lucide-react';
import { SystemStatus } from '../types';
import { isStaticHost } from '../services/api';

interface TopHeaderProps {
  activeTab: string;
  status: SystemStatus | null;
  isAdmin: boolean;
  displayMode: 'simple' | 'pro';
  onSetDisplayMode: (mode: 'simple' | 'pro') => void;
  onOpenSidebarMobile: () => void;
  onOpenAuthModal: () => void;
  onToggleTrading: () => void;
  onToggleMode: () => void;
  onPanicSell: () => void;
  onStartTutorial?: () => void;
  onOpenGlossary?: () => void;
  unreadNotificationsCount?: number;
  onOpenNotifications?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  status,
  isAdmin,
  displayMode,
  onSetDisplayMode,
  onOpenSidebarMobile,
  onOpenAuthModal,
  onToggleTrading,
  onToggleMode,
  onPanicSell,
  onStartTutorial,
  onOpenGlossary,
  unreadNotificationsCount = 0,
  onOpenNotifications,
}) => {
  const isAuto = status?.isAutoTradingActive ?? false;
  const mode = status?.mode ?? 'paper';
  const balance = status?.balanceIdr ?? 0;
  const sentiment = status?.sentiment?.averageSentiment ?? 0;

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: 'Terminal Trading', subtitle: 'Monitoring live chart, order aktif, dan evaluasi AI' },
    reports: { title: 'Laporan & Kinerja', subtitle: 'Audit performa transaksi, unduh laporan PDF eksekutif, dan export CSV' },
    scanner: { title: 'Market Scanner', subtitle: 'Radar momentum top gainers dan deteksi koin baru Indodax' },
    agents: { title: 'Riset Pasar AI', subtitle: 'Analisis sentimen dan tren dari 10 analis AI independen' },
    backtest: { title: 'Backtest Strategi', subtitle: 'Simulasi kuantitatif historis multi-chunk tanpa lookahead' },
    bots: { title: 'Bot Notifikasi & Remote', subtitle: 'Pusat kontrol notifikasi otomatis dan remote control via WhatsApp & Telegram' },
    whatsapp: { title: 'Bot Notifikasi & Remote', subtitle: 'Pusat kontrol notifikasi otomatis dan remote control via WhatsApp & Telegram' },
    quota: { title: 'Kuota AI', subtitle: 'Monitoring sisa kuota dan window reset model AI' },
    settings: { title: 'Pengaturan Sistem', subtitle: 'Konfigurasi provider AI, parameter risiko, dan API keys' },
  };

  const currentTabInfo = tabTitles[activeTab] || { title: 'Dashboard', subtitle: 'Autonomous AI Trading System' };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070b13]/90 backdrop-blur-md px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Hamburger (Mobile) + Breadcrumb / Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSidebarMobile}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800 lg:hidden"
            title="Buka Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-lg font-bold text-slate-100 tracking-tight truncate max-w-[130px] xs:max-w-[180px] sm:max-w-none">
                {currentTabInfo.title}
              </h1>
              {isStaticHost && (
                <span className="hidden md:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-950/40 text-blue-300 font-mono">
                  💡 Mode Demo
                </span>
              )}
              {!isAdmin && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-950/30 text-amber-300 font-mono">
                  <Eye className="h-3 w-3" />
                  Mode Pengamat (View-Only)
                </span>
              )}
              {isAdmin && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 font-mono">
                  <ShieldCheck className="h-3 w-3" />
                  Administrator
                </span>
              )}
            </div>
            <p className="hidden md:block text-xs text-slate-400 mt-0.5">
              {currentTabInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Quick Action Header Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* View Mode Toggle: Pemula vs Pro */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => onSetDisplayMode('simple')}
              title="Tampilan bersih & mudah dipahami untuk pemula"
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                displayMode === 'simple'
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-blue-200" />
              <span className="hidden sm:inline">Pemula</span>
            </button>
            <button
              type="button"
              onClick={() => onSetDisplayMode('pro')}
              title="Tampilan lengkap dengan Chart TradingView & Analisis Kuantitatif"
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                displayMode === 'pro'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3 h-3 text-indigo-200" />
              <span className="hidden sm:inline">Pro</span>
            </button>
          </div>

          {/* Quick Balance Pill */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/50 text-xs font-mono">
            <span className="text-slate-400">Saldo:</span>
            <span className="font-bold text-slate-200">Rp {balance.toLocaleString('id-ID')}</span>
          </div>

          {/* Paper / Live Mode Toggle */}
          <button
            data-tour="trading-mode"
            onClick={onToggleMode}
            className={`hidden sm:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono font-medium border transition-colors ${
              mode === 'live'
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/40'
                : 'border-amber-500/40 bg-amber-950/30 text-amber-400 hover:bg-amber-900/40'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>MODE: {mode.toUpperCase()}</span>
            {!isAdmin && <Lock className="h-3 w-3 text-slate-400" />}
          </button>

          {/* Auto-Trading Toggle */}
          <button
            data-tour="auto-trading"
            onClick={onToggleTrading}
            className={`flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors border shrink-0 ${
              isAuto
                ? 'border-emerald-500/50 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isAuto ? <Pause className="h-3.5 w-3.5 text-emerald-400" /> : <Play className="h-3.5 w-3.5 text-slate-400" />}
            <span className="hidden sm:inline">{isAuto ? 'AUTO TRADING: ACTIVE' : 'AUTO TRADING: PAUSED'}</span>
            <span className="sm:hidden">{isAuto ? 'ON' : 'OFF'}</span>
            {!isAdmin && <Lock className="h-3 w-3 text-slate-400" />}
          </button>

          {/* Emergency Panic Sell */}
          <button
            data-tour="panic-sell"
            onClick={onPanicSell}
            title="Panic sell seluruh posisi koin ke IDR"
            className="flex items-center gap-1 rounded-lg border border-rose-500/60 bg-rose-600/20 px-2 sm:px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-600/30 shrink-0"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden sm:inline">PANIC SELL</span>
            <span className="sm:hidden">PANIC</span>
            {!isAdmin && <Lock className="h-3 w-3 text-rose-400" />}
          </button>

          {/* Interactive Tutorial Button */}
          {onStartTutorial && (
            <button
              onClick={onStartTutorial}
              title="Buka Panduan Tutorial Interaktif Pemula"
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50 hover:text-indigo-200 text-xs font-medium transition-colors shrink-0"
            >
              <Gamepad2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>Tutorial</span>
            </button>
          )}

          {/* Educational Glossary & FAQ Button */}
          {onOpenGlossary && (
            <button
              onClick={onOpenGlossary}
              title="Kamus Istilah & FAQ"
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors shrink-0"
            >
              <BookOpen className="h-3.5 w-3.5 text-blue-400" />
              <span>Kamus &amp; FAQ</span>
            </button>
          )}

          {/* Notification Center Bell Icon */}
          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              title="Buka Pusat Pemberitahuan"
              className="relative p-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
            >
              <Bell className="h-4 w-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white shadow-md">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>
          )}

          {/* Admin Unlock Pill (if in view-only mode) */}
          {!isAdmin && (
            <button
              onClick={onOpenAuthModal}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors shadow-sm shrink-0"
              title="Buka Kunci Akses Administrator"
            >
              <Unlock className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Masuk Admin</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
