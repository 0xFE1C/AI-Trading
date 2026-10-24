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
  Bell,
} from 'lucide-react';
import { SystemStatus } from '../types';
import { isStaticHost } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { LanguageSelector } from './LanguageSelector';

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
  unreadNotificationsCount = 0,
  onOpenNotifications,
}) => {
  const { t } = useLanguage();
  const isAuto = status?.isAutoTradingActive ?? false;
  const mode = status?.mode ?? 'paper';

  const currentTabTitle = t(`header.tab.${activeTab}.title`, 'Trading Terminal');
  const currentTabSubtitle = t(`header.tab.${activeTab}.subtitle`, 'Live chart monitoring, active orders, and multi-agent AI research');

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070b13]/90 backdrop-blur-md px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Hamburger (Mobile) + Breadcrumb / Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSidebarMobile}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800 lg:hidden"
            title="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-lg font-bold text-slate-100 tracking-tight truncate max-w-[130px] xs:max-w-[180px] sm:max-w-none">
                {currentTabTitle}
              </h1>
              {isStaticHost && (
                <span className="hidden md:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-950/40 text-blue-300 font-mono">
                  💡 Demo
                </span>
              )}
              {!isAdmin && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-950/30 text-amber-300 font-mono">
                  <Eye className="h-3 w-3" />
                  {t('header.viewOnly', 'View-Only Mode')}
                </span>
              )}
              {isAdmin && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 font-mono">
                  <ShieldCheck className="h-3 w-3" />
                  {t('header.admin', 'Administrator')}
                </span>
              )}
            </div>
            <p className="hidden md:block text-xs text-slate-400 mt-0.5">
              {currentTabSubtitle}
            </p>
          </div>
        </div>

        {/* Right: Quick Action Header Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Language Selector */}
          <LanguageSelector variant="header" />

          {/* View Mode Toggle: Simple vs Pro */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => onSetDisplayMode('simple')}
              title={t('header.viewMode.simpleTooltip', 'Clean & beginner-friendly interface')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                displayMode === 'simple'
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-blue-200" />
              <span className="hidden sm:inline">{t('header.viewMode.simple', 'Simple')}</span>
            </button>
            <button
              type="button"
              onClick={() => onSetDisplayMode('pro')}
              title={t('header.viewMode.proTooltip', 'Full view with candlestick chart & quantitative diagnostics')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                displayMode === 'pro'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3 h-3 text-indigo-200" />
              <span className="hidden sm:inline">{t('header.viewMode.pro', 'Pro')}</span>
            </button>
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
            <span>{mode === 'live' ? t('header.mode.live', 'MODE: LIVE') : t('header.mode.paper', 'MODE: DEMO')}</span>
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
            <span className="hidden sm:inline">
              {isAuto ? t('header.autoTrading.active', 'AUTO TRADING: ACTIVE') : t('header.autoTrading.paused', 'AUTO TRADING: PAUSED')}
            </span>
            <span className="sm:hidden">{isAuto ? 'ON' : 'OFF'}</span>
            {!isAdmin && <Lock className="h-3 w-3 text-slate-400" />}
          </button>

          {/* Emergency Panic Sell */}
          <button
            data-tour="panic-sell"
            onClick={onPanicSell}
            title={t('header.panicSellTooltip', 'Emergency market liquidation of all open coins to IDR')}
            className="flex items-center gap-1 rounded-lg border border-rose-500/60 bg-rose-600/20 px-2 sm:px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-600/30 shrink-0"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden sm:inline">{t('header.panicSell', 'PANIC SELL')}</span>
            <span className="sm:hidden">PANIC</span>
            {!isAdmin && <Lock className="h-3 w-3 text-rose-400" />}
          </button>

          {/* Notification Center Bell Icon */}
          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              title={t('header.notifications', 'Notifications')}
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
              title={t('header.loginAdmin', 'Admin Login')}
            >
              <Unlock className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t('header.loginAdmin', 'Admin Login')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
