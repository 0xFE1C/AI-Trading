import React from 'react';
import {
  BarChart3,
  Radio,
  Layers,
  TrendingUp,
  MessageSquare,
  Sliders,
  Zap,
  Activity,
  Play,
  Pause,
  AlertTriangle,
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  X,
  ExternalLink,
  Eye,
  Gauge,
  FileText,
  Globe,
  Gamepad2,
  BookOpen,
  Bot,
} from 'lucide-react';
import { SystemStatus } from '../types';
import { isStaticHost } from '../services/api';
import { brandConfig } from '../brand.config';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  status: SystemStatus | null;
  isAdmin: boolean;
  isWsConnected: boolean;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  onToggleTrading: () => void;
  onToggleMode: () => void;
  onPanicSell: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onStartTutorial?: () => void;
  onOpenGlossary?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  status,
  isAdmin,
  isWsConnected,
  onOpenAuthModal,
  onLogout,
  onToggleTrading,
  onToggleMode,
  onPanicSell,
  isOpenMobile,
  onCloseMobile,
  onStartTutorial,
  onOpenGlossary,
}) => {
  const isAuto = status?.isAutoTradingActive ?? false;
  const mode = status?.mode ?? 'paper';
  const balance = status?.balanceIdr ?? 0;

  const navSections = [
    {
      title: 'Utama',
      items: [
        { id: 'dashboard', label: 'Terminal Trading', icon: BarChart3, badge: 'Live' },
        { id: 'reports', label: 'Laporan & Kinerja', icon: FileText, badge: 'PDF' },
      ],
    },
    {
      title: 'Riset & Analisa',
      items: [
        { id: 'scanner', label: 'Market Scanner', icon: Radio },
        { id: 'agents', label: 'Tim Riset AI (10 Analis)', icon: Layers, badge: '10' },
      ],
    },
    {
      title: 'Sistem & Tools',
      items: [
        { id: 'backtest', label: 'Backtest Strategi', icon: TrendingUp },
        { id: 'bots', label: 'Bots (WA & Telegram)', icon: Bot },
        { id: 'quota', label: 'Kuota AI', icon: Gauge },
        { id: 'settings', label: 'Pengaturan Sistem', icon: Sliders },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#070b13] border-r border-slate-800/80 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand & Connection Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/10">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-slate-100 text-base">{brandConfig.appName}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-slate-700">
                  {brandConfig.version}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  isStaticHost
                    ? 'bg-amber-400'
                    : isWsConnected
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-rose-500'
                }`} />
                <span>
                  {isStaticHost
                    ? 'Mode Demo (Data Simulasi)'
                    : isWsConnected
                    ? 'Feed Indodax Terhubung'
                    : 'Menghubungkan Feed...'}
                </span>
              </div>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Portfolio Mini Card */}
        <div className="p-3.5 mx-3 mt-3 rounded-xl border border-slate-800/80 bg-slate-900/40 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="uppercase tracking-wider font-medium text-[10px]">Saldo Portofolio</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
              mode === 'live'
                ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-400'
                : 'border-amber-500/30 bg-amber-950/40 text-amber-400'
            }`}>
              {mode.toUpperCase()}
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-slate-100">
            Rp {balance.toLocaleString('id-ID')}
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
            <span className="text-slate-400">Status Bot:</span>
            <span className={`font-mono font-semibold flex items-center gap-1 ${
              isAuto ? 'text-emerald-400' : 'text-slate-400'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isAuto ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              {isAuto ? 'RUNNING' : 'PAUSED'}
            </span>
          </div>
        </div>

        {/* Navigation Items Grouped by Category */}
        <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
          {navSections.map((sec) => (
            <div key={sec.title} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {sec.title}
              </div>
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id || (item.id === 'bots' && activeTab === 'whatsapp');
                const tourAttr = item.id === 'settings' ? 'nav-settings' : item.id === 'dashboard' ? 'nav-dashboard' : undefined;
                return (
                  <button
                    key={item.id}
                    data-tour={tourAttr}
                    onClick={() => {
                      setActiveTab(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-semibold'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Quick Action Controls in Sidebar */}
          <div className="pt-4 mt-2 border-t border-slate-800/80 space-y-2">
            <div className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Kontrol Trading</span>
              {!isAdmin && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 lowercase font-mono">
                  <Lock className="h-3 w-3" /> view only
                </span>
              )}
            </div>

            {/* Toggle Auto Trading */}
            <button
              onClick={onToggleTrading}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                isAuto
                  ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40'
                  : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                {isAuto ? <Pause className="h-3.5 w-3.5 text-emerald-400" /> : <Play className="h-3.5 w-3.5 text-slate-400" />}
                <span>{isAuto ? 'Auto Trading: Aktif' : 'Auto Trading: Pause'}</span>
              </div>
              {!isAdmin && <Lock className="h-3 w-3 text-slate-500" />}
            </button>

            {/* Toggle Paper / Live Mode */}
            <button
              onClick={onToggleMode}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono font-medium border transition-colors ${
                mode === 'live'
                  ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40'
                  : 'border-amber-500/40 bg-amber-950/20 text-amber-300 hover:bg-amber-950/40'
              }`}
            >
              <div className="flex items-center gap-2 font-sans">
                <Activity className="h-3.5 w-3.5 text-amber-400" />
                <span>Mode: <strong className="font-mono">{mode.toUpperCase()}</strong></span>
              </div>
              {!isAdmin && <Lock className="h-3 w-3 text-slate-500" />}
            </button>

            {/* Emergency Panic Sell */}
            <button
              onClick={onPanicSell}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border border-rose-500/40 bg-rose-950/20 text-rose-300 hover:bg-rose-950/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                <span>Panic Sell All</span>
              </div>
              {!isAdmin && <Lock className="h-3 w-3 text-rose-400/60" />}
            </button>
          </div>
        </nav>

        {/* Security & Access Box */}
        <div className="p-3 border-t border-slate-800/80 bg-[#060910] space-y-1.5">
          {/* Kamus Istilah & FAQ Button */}
          {onOpenGlossary && (
            <button
              onClick={onOpenGlossary}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-blue-500/30 bg-blue-950/30 hover:bg-blue-900/40 text-blue-300 hover:text-blue-100 text-xs font-semibold transition-all shadow-sm"
            >
              <BookOpen className="h-4 w-4 text-blue-400" />
              <span>📖 Kamus Istilah &amp; FAQ</span>
            </button>
          )}

          {/* Panduan Pemula Button */}
          {onStartTutorial && (
            <button
              onClick={onStartTutorial}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-indigo-500/30 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 hover:text-indigo-100 text-xs font-semibold transition-all shadow-sm"
            >
              <Gamepad2 className="h-4 w-4 text-indigo-400" />
              <span>🎮 Panduan Pemula (Tutorial)</span>
            </button>
          )}

          {isAdmin ? (
            <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Administrator</span>
                </div>
                <span className="text-[10px] text-emerald-300/80 font-mono">Akses Penuh</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Semua tindakan eksekusi & konfigurasi dapat dilakukan.
              </p>
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-[11px] text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Kunci / Keluar Admin</span>
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <Eye className="h-4 w-4" />
                  <span>Mode Pengamat</span>
                </div>
                <span className="text-[10px] text-amber-300/80 font-mono">View-Only</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Anda dapat melihat seluruh data & telemetri tanpa hak mengubah trading.
              </p>
              <button
                onClick={onOpenAuthModal}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] font-semibold text-white transition-colors shadow-sm"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span>Buka Akses Admin</span>
              </button>
            </div>
          )}

          {/* White-Label footer attribution */}
          {brandConfig.developerCredit?.show ? (
            <div className="pt-2 text-center text-[10px] text-slate-400 font-mono">
              Made by{' '}
              <a
                href={brandConfig.developerCredit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline hover:text-blue-300 font-medium inline-flex items-center gap-0.5"
              >
                {brandConfig.developerCredit.name} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          ) : (
            <div className="pt-1 text-center text-[10px] text-slate-500 font-mono">
              {brandConfig.footerNotice}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
