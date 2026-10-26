import React from 'react';
import {
  BarChart3,
  Radio,
  Layers,
  TrendingUp,
  Sliders,
  Activity,
  Play,
  Pause,
  AlertTriangle,
  Lock,
  Unlock,
  ShieldCheck,
  LogOut,
  X,
  ExternalLink,
  Eye,
  Gauge,
  FileText,
  Gamepad2,
  BookOpen,
  Bot,
} from 'lucide-react';
import { SystemStatus } from '../types';
import { isStaticHost } from '../services/api';
import { brandConfig } from '../brand.config';
import { useLanguage } from '../i18n/LanguageContext';

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
  const { t, formatCurrency } = useLanguage();
  const isAuto = status?.isAutoTradingActive ?? false;
  const mode = status?.mode ?? 'paper';
  const balance = status?.balanceIdr ?? null;
  const hidePortfolio = status?.portfolioRedacted === true;

  const navSections = [
    {
      title: t('sidebar.section.main', 'Main'),
      items: [
        { id: 'dashboard', label: t('nav.dashboard', 'Trading Terminal'), icon: BarChart3, badge: 'Live' },
        { id: 'reports', label: t('nav.reports', 'Reports & Performance'), icon: FileText, badge: 'PDF' },
      ],
    },
    {
      title: t('sidebar.section.research', 'Research & Analysis'),
      items: [
        { id: 'scanner', label: t('nav.scanner', 'Market Scanner'), icon: Radio },
        { id: 'agents', label: t('nav.agents', 'AI Research (10 Swarm)'), icon: Layers, badge: '10' },
      ],
    },
    {
      title: t('sidebar.section.system', 'System & Tools'),
      items: [
        { id: 'backtest', label: t('nav.backtest', 'Strategy Backtest'), icon: TrendingUp },
        { id: 'bots', label: t('nav.bots', 'Bots (WA & Telegram)'), icon: Bot },
        { id: 'quota', label: t('nav.quota', 'AI Quota'), icon: Gauge },
        { id: 'settings', label: t('nav.settings', 'System Settings'), icon: Sliders },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800/80 bg-[#070b13] transition-transform duration-300 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-800/80 bg-[#070b13]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 p-0.5 shadow-lg shadow-blue-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
                <BarChart3 className="h-5 w-5 text-blue-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-white text-base">
                  {brandConfig.appName}
                </span>
                <span className="rounded bg-blue-500/20 px-1 py-0.2 text-[9px] font-mono font-bold text-blue-300 border border-blue-500/30">
                  {brandConfig.version}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                {t('brand.tagline', 'Autonomous Spot Trading')}
              </p>
            </div>
          </div>

          {/* Close button for mobile */}
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
            title="Tutup Menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live Network & Market Status Badge */}
        <div className="px-4 py-2 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isWsConnected ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isWsConnected ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            </span>
            <span className="text-[11px] text-slate-300 font-mono">
              {isWsConnected ? 'INDODAX WS: LIVE' : 'WS: RECONNECTING'}
            </span>
          </div>

          <span className="text-[10px] font-mono text-slate-400">
            {status?.mode === 'live' ? '🔴 LIVE' : '🟢 DEMO'}
          </span>
        </div>

        {/* Navigation Menus */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {navSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {section.title}
              </div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id || (item.id === 'bots' && activeTab === 'whatsapp');

                return (
                  <button
                    key={item.id}
                    data-tour={`nav-${item.id}`}
                    onClick={() => {
                      setActiveTab(item.id);
                      if (isOpenMobile) onCloseMobile();
                    }}
                    className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/30 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 transition-colors ${
                          isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          isActive
                            ? 'bg-blue-500/30 text-blue-300 border border-blue-400/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Quick Portfolio Balance Card */}
          <div className="mt-4 p-3 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1.5 font-mono">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-sans">
              <span>{t('header.balance', 'Balance')}</span>
              <span className="text-[10px] text-blue-400 font-mono">IDR</span>
            </div>
            <div className="text-sm font-bold text-slate-100 truncate">
              {hidePortfolio ? '••••••' : balance === null ? '—' : formatCurrency(balance)}
            </div>
          </div>

          {/* Quick Engine Status Action */}
          <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/30 space-y-2">
            <button
              onClick={onToggleTrading}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isAuto
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30'
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {isAuto ? <Pause className="h-3.5 w-3.5 text-emerald-400" /> : <Play className="h-3.5 w-3.5 text-slate-400" />}
                <span>{isAuto ? t('header.autoTrading.active', 'AUTO TRADING: ACTIVE') : t('header.autoTrading.paused', 'AUTO TRADING: PAUSED')}</span>
              </div>
              {!isAdmin && <Lock className="h-3 w-3 text-slate-500" />}
            </button>

            {/* Mode Switcher */}
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
                <span>{t('header.panicSell', 'PANIC SELL')}</span>
              </div>
              {!isAdmin && <Lock className="h-3 w-3 text-rose-400/60" />}
            </button>
          </div>
        </nav>

        {/* Security & Access Box */}
        <div className="p-3 border-t border-slate-800/80 bg-[#060910] space-y-1.5">
          {/* Glossary Button */}
          {onOpenGlossary && (
            <button
              onClick={onOpenGlossary}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-blue-500/30 bg-blue-950/30 hover:bg-blue-900/40 text-blue-300 hover:text-blue-100 text-xs font-semibold transition-all shadow-sm"
            >
              <BookOpen className="h-4 w-4 text-blue-400" />
              <span>📖 {t('header.glossary', 'Glossary & FAQ')}</span>
            </button>
          )}

          {/* Tutorial Button */}
          {onStartTutorial && (
            <button
              onClick={onStartTutorial}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-indigo-500/30 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 hover:text-indigo-100 text-xs font-semibold transition-all shadow-sm"
            >
              <Gamepad2 className="h-4 w-4 text-indigo-400" />
              <span>🎮 {t('header.tutorial', 'Tutorial')}</span>
            </button>
          )}

          {isAdmin ? (
            <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <ShieldCheck className="h-4 w-4" />
                  <span>{t('header.admin', 'Administrator')}</span>
                </div>
                <span className="text-[10px] text-emerald-300/80 font-mono">Full Access</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                All execution actions & configuration controls are unlocked.
              </p>
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-[11px] text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Lock / Exit Admin</span>
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <Eye className="h-4 w-4" />
                  <span>{t('header.viewOnly', 'View-Only Mode')}</span>
                </div>
                <span className="text-[10px] text-amber-300/80 font-mono">View-Only</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Telemetry and analytics are visible in monitoring mode.
              </p>
              <button
                onClick={onOpenAuthModal}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] font-semibold text-white transition-colors shadow-sm"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span>{t('header.loginAdmin', 'Unlock Admin Access')}</span>
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
