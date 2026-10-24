import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { PanicModal } from './components/PanicModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { GameTutorialModal } from './components/GameTutorialModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlossaryModal } from './components/GlossaryModal';
import { NotificationCenter, AppNotification } from './components/NotificationCenter';
import { LiveModeModal } from './components/LiveModeModal';
import { Toast } from './components/Toast';
import { api, authStorage, isStaticHost, apiConnectionState } from './services/api';
import { SystemStatus } from './types';
import { SettingsSubTab } from './components/SettingsView';
import { brandConfig } from './brand.config';
import {
  Lock,
  Key,
  ShieldCheck,
  Eye,
  ShieldAlert,
  X,
  AlertCircle,
  ArrowRight,
  Sparkles,
  WifiOff,
  ExternalLink,
  BookOpen
} from 'lucide-react';

// Code Splitting & Lazy-loaded Views
const DashboardView = lazy(() =>
  import('./components/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const ReportView = lazy(() =>
  import('./components/ReportView').then((m) => ({ default: m.ReportView }))
);
const MarketScannerView = lazy(() =>
  import('./components/MarketScannerView').then((m) => ({ default: m.MarketScannerView }))
);
const MultiAgentView = lazy(() =>
  import('./components/MultiAgentView').then((m) => ({ default: m.MultiAgentView }))
);
const BacktestView = lazy(() =>
  import('./components/BacktestView').then((m) => ({ default: m.BacktestView }))
);
const BotsView = lazy(() =>
  import('./components/BotsView').then((m) => ({ default: m.BotsView }))
);
const QuotaView = lazy(() =>
  import('./components/QuotaView').then((m) => ({ default: m.QuotaView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);

const ViewLoadingFallback = () => (
  <div className="min-h-[400px] flex flex-col items-center justify-center p-8 space-y-3">
    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    <span className="text-xs text-slate-400 font-mono">Memuat tampilan...</span>
  </div>
);

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'scanner' | 'agents' | 'backtest' | 'bots' | 'whatsapp' | 'quota' | 'settings'>('dashboard');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isApiOnline, setIsApiOnline] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPanicModal, setShowPanicModal] = useState(false);
  const [showLiveConfirmModal, setShowLiveConfirmModal] = useState(false);
  const [showGlossaryModal, setShowGlossaryModal] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [inputToken, setInputToken] = useState(authStorage.getToken());
  const [authError, setAuthError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [displayMode, setDisplayMode] = useState<'simple' | 'pro'>(() => {
    return (localStorage.getItem('ai_trading_display_mode') as 'simple' | 'pro') || 'simple';
  });
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('ai');
  const [showTutorial, setShowTutorial] = useState(false);

  // Notifications History
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem('ai_trading_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addNotification = useCallback((item: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: AppNotification = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => {
      const updated = [newNotif, ...prev].slice(0, 50);
      try {
        localStorage.setItem('ai_trading_notifications', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      try {
        localStorage.setItem('ai_trading_notifications', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
    try {
      localStorage.removeItem('ai_trading_notifications');
    } catch {}
  };

  // Connection state listener
  useEffect(() => {
    const handleConn = (e: any) => {
      if (e?.detail) {
        setIsApiOnline(e.detail.isOnline);
      }
    };
    window.addEventListener('API_CONNECTION_STATE_CHANGED', handleConn);
    return () => window.removeEventListener('API_CONNECTION_STATE_CHANGED', handleConn);
  }, []);

  // Trigger beginner game tutorial on first run
  useEffect(() => {
    const tutorialDone = localStorage.getItem('ai_trading_tutorial_completed');
    if (!tutorialDone && isAdmin) {
      setShowTutorial(true);
    }
  }, [isAdmin]);

  const handleStartTutorial = () => {
    setShowTutorial(true);
  };

  const handleCompleteTutorial = () => {
    localStorage.setItem('ai_trading_tutorial_completed', 'true');
    setShowTutorial(false);
  };

  const handleSetDisplayMode = (mode: 'simple' | 'pro') => {
    setDisplayMode(mode);
    localStorage.setItem('ai_trading_display_mode', mode);
  };

  const handleSwitchTab = (tab: string, subTab?: string) => {
    setActiveTab(tab as any);
    if (subTab && ['ai', 'risk', 'indodax', 'security'].includes(subTab)) {
      setSettingsSubTab(subTab as SettingsSubTab);
    }
  };

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getStatus();
      setStatus(data);
      setIsApiOnline(true);
      if (typeof data.isAdmin === 'boolean') {
        setIsAdmin(data.isAdmin);
      }
    } catch (err: any) {
      if (!isStaticHost) {
        setIsApiOnline(false);
      }
    }
  }, []);

  useEffect(() => {
    api.getAuthStatus().then((res) => {
      if (res && typeof res.isAdmin === 'boolean') {
        setIsAdmin(res.isAdmin);
      }
    });
    fetchStatus();
    const interval = setInterval(fetchStatus, 6000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Listen to 401 Auth Required event across the application
  useEffect(() => {
    const handleAuthReq = (e: any) => {
      setShowAuthModal(true);
      if (e?.detail?.error) {
        setAuthError(e.detail.error);
      }
    };
    window.addEventListener('AUTH_REQUIRED', handleAuthReq);
    return () => window.removeEventListener('AUTH_REQUIRED', handleAuthReq);
  }, []);

  // WebSocket Live Connection with Token Auth
  useEffect(() => {
    if (isStaticHost) {
      setIsWsConnected(true);
      const demoInterval = setInterval(() => {
        fetchStatus();
      }, 5000);
      return () => clearInterval(demoInterval);
    }

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = authStorage.getToken();
      const wsUrl = `${protocol}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsWsConnected(true);
        setIsApiOnline(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'CONNECTED' && typeof payload.isAdmin === 'boolean') {
            setIsAdmin(payload.isAdmin);
          }
          if (payload.type === 'AUTH_SUCCESS') {
            setIsAdmin(true);
          }
          if (payload.type === 'TRADE_EVENT') {
            const ev = payload.data;
            if (ev?.type === 'BUY') {
              addNotification({
                type: 'buy',
                title: `Eksekusi Beli: ${ev.data?.symbol?.toUpperCase()}`,
                message: `Harga: Rp ${ev.data?.price?.toLocaleString('id-ID')} | Total: Rp ${ev.data?.totalIdr?.toLocaleString('id-ID')}\nAlasan: ${ev.data?.reason || '-'}`,
              });
            } else if (ev?.type === 'SELL') {
              addNotification({
                type: 'sell',
                title: `Eksekusi Jual: ${ev.data?.symbol?.toUpperCase()}`,
                message: `Harga: Rp ${ev.data?.price?.toLocaleString('id-ID')} | PnL: ${ev.data?.pnlPercent ? `${ev.data.pnlPercent.toFixed(2)}%` : '-'}\nAlasan: ${ev.data?.reason || '-'}`,
              });
            } else if (ev?.type === 'ALERT') {
              addNotification({
                type: 'warning',
                title: ev.data?.title || 'Peringatan Trading',
                message: ev.data?.message || '',
              });
            }
            fetchStatus();
          }
          if (payload.type === 'NEW_COIN_ALERT') {
            const coin = payload.data;
            addNotification({
              type: 'coin',
              title: `Listing Koin Baru: ${coin?.name || ''} (${coin?.symbol?.toUpperCase() || ''})`,
              message: `Harga awal: Rp ${coin?.price?.toLocaleString('id-ID') || 0}. Tim Riset AI sedang memantau momentum awal.`,
            });
            fetchStatus();
          }
          if (payload.type === 'EMERGENCY_AI_FAILURE') {
            addNotification({
              type: 'alert',
              title: 'Peringatan AI Failover',
              message: `Provider ${payload.data?.providerName || ''} bermasalah. Sistem beralih ke proteksi fail-safe.`,
            });
            fetchStatus();
          }
          if (payload.type === 'ADMIN_TOKEN_ROTATED') {
            api.getAuthStatus().then((res) => {
              if (res && typeof res.isAdmin === 'boolean') {
                setIsAdmin(res.isAdmin);
              }
            });
            fetchStatus();
          }
        } catch {}
      };

      ws.onclose = () => {
        setIsWsConnected(false);
        reconnectTimeout = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        setIsWsConnected(false);
        ws?.close();
      };
    };

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [fetchStatus, addNotification]);

  const handleToggleTrading = async () => {
    if (!isAdmin) {
      setShowAuthModal(true);
      return;
    }
    try {
      const res = await api.toggleAutoTrading();
      if (status) {
        setStatus({ ...status, isAutoTradingActive: res.isActive });
      }
      setToast({
        message: res.isActive ? 'Auto-Trading BERHASIL DIAKTIFKAN' : 'Auto-Trading DIJEDA (PAUSED)',
        type: 'info',
      });
    } catch (err: any) {
      setSetupError(err.message);
    }
  };

  const handleToggleMode = () => {
    if (!isAdmin) {
      setShowAuthModal(true);
      return;
    }
    // If currently paper, ask confirmation before switching to LIVE
    if (status?.mode === 'paper') {
      setShowLiveConfirmModal(true);
    } else {
      // Switching from Live to Paper is safe, proceed directly
      executeToggleMode();
    }
  };

  const executeToggleMode = async () => {
    try {
      const res = await api.toggleTradingMode();
      if (status) {
        setStatus({ ...status, mode: res.mode });
      }
      setToast({
        message: `Mode berhasil diubah ke: ${res.mode.toUpperCase()} TRADING`,
        type: res.mode === 'live' ? 'error' : 'success',
      });
    } catch (err: any) {
      setToast({ message: `Gagal mengubah mode trading: ${err.message}`, type: 'error' });
    }
  };

  const handlePanicSell = () => {
    if (!isAdmin) {
      setShowAuthModal(true);
      return;
    }
    setShowPanicModal(true);
  };

  const executePanicSellConfirmed = async () => {
    const res = await api.panicSell();
    await fetchStatus();
    addNotification({
      type: 'warning',
      title: '🚨 Panic Sell Dilaksanakan',
      message: res.message || 'Seluruh posisi terbuka dilikuidasi ke IDR.',
    });
    return { success: true, message: res.message };
  };

  const handleLogout = () => {
    authStorage.setToken('');
    setInputToken('');
    setIsAdmin(false);
    fetchStatus();
    setToast({ message: 'Akses Admin telah dikunci.', type: 'info' });
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const valid = await api.verifyToken(inputToken.trim());
    if (valid) {
      authStorage.setToken(inputToken.trim());
      setIsAdmin(true);
      setShowAuthModal(false);
      await fetchStatus();
      setToast({ message: 'Autentikasi Administrator Berhasil!', type: 'success' });

      // Launch beginner tutorial if not yet completed
      const tutorialDone = localStorage.getItem('ai_trading_tutorial_completed');
      if (!tutorialDone) {
        setShowTutorial(true);
      }
    } else {
      setAuthError('Token akses tidak valid. Periksa baris ADMIN ACCESS TOKEN di terminal server Anda.');
    }
  };

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex font-sans">
      {/* 1. Left Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(t) => setActiveTab(t)}
        status={status}
        isAdmin={isAdmin}
        isWsConnected={isWsConnected}
        onOpenAuthModal={() => setShowAuthModal(true)}
        onLogout={handleLogout}
        onToggleTrading={handleToggleTrading}
        onToggleMode={handleToggleMode}
        onPanicSell={handlePanicSell}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onStartTutorial={handleStartTutorial}
        onOpenGlossary={() => setShowGlossaryModal(true)}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        {/* Top Header Bar */}
        <TopHeader
          activeTab={activeTab}
          status={status}
          isAdmin={isAdmin}
          displayMode={displayMode}
          onSetDisplayMode={handleSetDisplayMode}
          onOpenSidebarMobile={() => setIsMobileSidebarOpen(true)}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onToggleTrading={handleToggleTrading}
          onToggleMode={handleToggleMode}
          onPanicSell={handlePanicSell}
          onStartTutorial={handleStartTutorial}
          onOpenGlossary={() => setShowGlossaryModal(true)}
          unreadNotificationsCount={notifications.filter((n) => !n.read).length}
          onOpenNotifications={() => setShowNotificationCenter(true)}
        />

        {/* Global Offline / Disconnected Warning Banner */}
        {!isApiOnline && !isStaticHost && (
          <div className="bg-rose-950/80 border-b border-rose-500/40 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs text-rose-200 sticky top-[57px] z-20 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-rose-400 shrink-0 animate-pulse" />
              <span>
                <strong>Terputus dari Server Backend: </strong>
                Sistem tidak dapat memperbarui data real-time. Data yang tampil di layar mungkin merupakan data cache terakhir. Memeriksa kembali koneksi...
              </span>
            </div>
            <button
              onClick={() => fetchStatus()}
              className="px-3 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white font-semibold text-[11px] shrink-0"
            >
              Coba Sambung Ulang
            </button>
          </div>
        )}

        {/* Static Host Demo Notification Banner */}
        {isStaticHost && (
          <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/40 to-slate-950/40 border-b border-blue-500/20 px-4 sm:px-6 py-2 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-blue-300 font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>
                <strong>SIMULATOR DEMO LIVE:</strong> Menjalankan simulasi bursa Indodax real-time. Anda bebas menguji seluruh fitur trading terminal di bawah ini tanpa risiko.
              </span>
            </div>
          </div>
        )}

        {/* View-Only Observer Notice Banner */}
        {!isAdmin && (
          <div className="bg-amber-950/25 border-b border-amber-500/20 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                <strong>Mode Pengamat (View-Only):</strong> Anda dapat melihat seluruh telemetri, scanner, chart, subagents, dan metrik performa secara bebas. Masukkan token admin untuk mengubah kontrol eksekusi trading.
              </span>
            </div>
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-xs px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold self-start sm:self-auto transition-colors shrink-0"
            >
              Buka Kunci Admin
            </button>
          </div>
        )}

        {/* Dynamic Page Views with ErrorBoundary & Suspense */}
        <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
          <ErrorBoundary fallbackTitle="Terjadi Kesalahan pada Halaman Ini">
            <Suspense fallback={<ViewLoadingFallback />}>
              {activeTab === 'dashboard' && (
                <DashboardView
                  status={status}
                  onRefresh={fetchStatus}
                  displayMode={displayMode}
                  onSwitchTab={handleSwitchTab}
                  isAdmin={isAdmin}
                  onOpenAuthModal={() => setShowAuthModal(true)}
                  onToggleTrading={handleToggleTrading}
                />
              )}
              {activeTab === 'reports' && <ReportView isAdmin={isAdmin} />}
              {activeTab === 'scanner' && <MarketScannerView />}
              {activeTab === 'agents' && <MultiAgentView />}
              {activeTab === 'backtest' && <BacktestView />}
              {(activeTab === 'bots' || activeTab === 'whatsapp') && <BotsView />}
              {activeTab === 'quota' && (
                <QuotaView
                  onOpenConnectModal={() => handleSwitchTab('settings', 'ai')}
                  isAdmin={isAdmin}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsView
                  activeSubTab={settingsSubTab}
                  onSubTabChange={setSettingsSubTab}
                />
              )}
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900 bg-[#070b13] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-mono mb-14 md:mb-0">
          <div>
            {brandConfig.appName} {brandConfig.version} &bull; {brandConfig.footerNotice}
          </div>
          <div>
            {brandConfig.developerCredit?.show ? (
              <span>
                Made by{' '}
                <a
                  href={brandConfig.developerCredit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline hover:text-blue-300 font-semibold"
                >
                  {brandConfig.developerCredit.name}
                </a>
              </span>
            ) : (
              <span>{brandConfig.companyName}</span>
            )}
          </div>
        </footer>

        {/* Mobile Bottom Navigation Dock */}
        <MobileBottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => handleSwitchTab(tab)}
          isAdmin={isAdmin}
        />
      </div>

      {/* Admin Authentication Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="max-w-md w-full rounded-2xl border border-sky-500/40 bg-[#0d1322] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sky-400 font-bold text-base">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <div>Otentikasi Administrator</div>
                  <div className="text-xs text-slate-400 font-normal">Akses Penuh Kontrol Trading</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Anda tetap dapat melihat dan memantau seluruh dashboard dalam Mode Pengamat (View-Only). Masukkan <strong>Admin Access Token</strong> untuk melakukan tindakan eksekusi atau mengubah pengaturan bot.
            </p>

            <form onSubmit={handleSaveToken} className="space-y-4 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Key className="w-3.5 h-3.5 text-sky-400" />
                  Admin Access Token
                </label>
                <input
                  type="password"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="Tempelkan token dari terminal server..."
                  className="w-full bg-[#050811] border border-slate-700 focus:border-sky-500 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 font-mono outline-none transition-colors"
                  autoFocus
                />
                <div className="text-[10px] text-slate-400 mt-2 space-y-1">
                  <p>
                    • Token unik tercetak di log terminal server saat startup pada baris <code className="text-amber-400 font-mono">ADMIN ACCESS TOKEN</code>.
                  </p>
                  {isLocalhost && (
                    <p className="text-blue-300">
                      💡 Anda membuka dari komputer lokal (localhost). Token ada di jendela terminal Node.js server.
                    </p>
                  )}
                  <p>
                    • Jika WhatsApp Bot aktif, Anda juga bisa otentikasi dengan mengirim: <code className="text-emerald-400 font-mono">/admin &lt;token&gt;</code>.
                  </p>
                </div>
              </div>

              {authError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
                  {authError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 transition-colors"
                >
                  Tetap di Mode Pengamat
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors shadow-md"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Buka Akses Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Setup Guard Modal / Alert (Ramah Pemula) */}
      {setupError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="max-w-lg w-full rounded-2xl border border-amber-500/40 bg-[#0d1322] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Langkah Persiapan Sebelum Memulai Bot
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Bot memerlukan model AI untuk menganalisis pasar sebelum trading otomatis dapat diaktifkan.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-300">
                Yang perlu dilengkapi:
              </div>
              <div className="space-y-2 text-xs text-slate-400">
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span>{setupError}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSetupError(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 transition-colors"
              >
                Tutup Sementara
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetupError(null);
                  handleSwitchTab('settings', 'ai');
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors shadow-md"
              >
                <span>Buka Pengaturan AI Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Panic Sell Modal */}
      {showPanicModal && (
        <PanicModal
          isOpen={showPanicModal}
          onClose={() => setShowPanicModal(false)}
          onConfirm={executePanicSellConfirmed}
          openPositionsCount={status?.openPositions?.length || 0}
        />
      )}

      {/* Live Mode Confirmation Modal */}
      {showLiveConfirmModal && (
        <LiveModeModal
          isOpen={showLiveConfirmModal}
          onClose={() => setShowLiveConfirmModal(false)}
          onConfirm={executeToggleMode}
        />
      )}

      {/* Interactive Game Onboarding Tutorial Modal */}
      {showTutorial && (
        <GameTutorialModal
          isOpen={showTutorial}
          onComplete={handleCompleteTutorial}
          activeTab={activeTab}
          onSwitchTab={(tab) => handleSwitchTab(tab)}
        />
      )}

      {/* Educational Glossary & FAQ Modal */}
      <GlossaryModal
        isOpen={showGlossaryModal}
        onClose={() => setShowGlossaryModal(false)}
      />

      {/* Notification Center Drawer */}
      <NotificationCenter
        isOpen={showNotificationCenter}
        onClose={() => setShowNotificationCenter(false)}
        notifications={notifications}
        onMarkAllAsRead={handleMarkAllNotificationsRead}
        onClearAll={handleClearAllNotifications}
        onNotificationClick={(item) => {
          if (item.type === 'buy' || item.type === 'sell') {
            setActiveTab('dashboard');
          } else if (item.type === 'coin') {
            setActiveTab('scanner');
          }
          setShowNotificationCenter(false);
        }}
      />

      {/* Global Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default App;
