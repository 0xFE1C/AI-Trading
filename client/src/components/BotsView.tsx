import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  QrCode,
  Phone,
  Shield,
  Terminal,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Send,
  Save,
  Key,
  Users,
  Lock,
  Bot,
  Bell,
  Eye,
  EyeOff,
  RefreshCw,
  Sliders,
  ExternalLink,
  Zap
} from 'lucide-react';
import { api } from '../services/api';
import { ConfirmModal } from './ConfirmModal';
import { Toast } from './Toast';
import { useLanguage } from '../i18n/LanguageContext';

type NotificationChannelMode = 'both' | 'whatsapp_only' | 'telegram_only' | 'none';

export const BotsView: React.FC = () => {
  const { l, language } = useLanguage();

  // WhatsApp States
  const [waStatus, setWaStatus] = useState<{
    connected: boolean;
    active: boolean;
    qrCode: string | null;
    adminNumber: string;
    adminLid?: string;
  }>({
    connected: false,
    active: false,
    qrCode: null,
    adminNumber: '',
    adminLid: '',
  });
  const [adminPhoneInput, setAdminPhoneInput] = useState('');
  const [connectingWa, setConnectingWa] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // Telegram States
  const [telegramEnabled, setTelegramEnabled] = useState('0');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramFeedback, setTelegramFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Channel Mode State
  const [channelMode, setChannelMode] = useState<NotificationChannelMode>('both');
  const [savingSettings, setSavingSettings] = useState(false);

  // UI Active Subtab inside Bots page: 'all' | 'whatsapp' | 'telegram'
  const [botTab, setBotTab] = useState<'all' | 'whatsapp' | 'telegram'>('all');

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Load All Status & Settings
  const loadData = async () => {
    try {
      const [wa, settings] = await Promise.all([
        api.getWhatsAppStatus(),
        api.getSettings(),
      ]);

      setWaStatus(wa);
      if (wa.adminNumber && !adminPhoneInput) {
        setAdminPhoneInput(wa.adminNumber);
      }

      setTelegramEnabled(settings.telegram_enabled || '0');
      setTelegramBotToken(settings.telegram_bot_token || '');
      setTelegramChatId(settings.telegram_chat_id || '');
      setChannelMode((settings.bot_notification_channel as NotificationChannelMode) || 'both');
    } catch (e) {
      console.error('Error fetching bots status', e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update Notification Channel Mode
  const handleSelectChannelMode = async (mode: NotificationChannelMode) => {
    setChannelMode(mode);
    setSavingSettings(true);
    try {
      const updates: Record<string, string> = {
        bot_notification_channel: mode,
      };

      if (mode === 'both') {
        updates.telegram_enabled = '1';
        updates.whatsapp_enabled = '1';
      } else if (mode === 'whatsapp_only') {
        updates.telegram_enabled = '0';
        updates.whatsapp_enabled = '1';
      } else if (mode === 'telegram_only') {
        updates.telegram_enabled = '1';
        updates.whatsapp_enabled = '0';
      } else if (mode === 'none') {
        updates.telegram_enabled = '0';
        updates.whatsapp_enabled = '0';
      }

      await api.updateSettings(updates);
      const modeLabel =
        mode === 'both'
          ? l('Both (WhatsApp + Telegram)', 'Keduanya Sekaligus (WhatsApp + Telegram)')
          : mode === 'whatsapp_only'
          ? l('WhatsApp Only', 'Hanya WhatsApp')
          : mode === 'telegram_only'
          ? l('Telegram Only', 'Hanya Telegram')
          : l('Disable All Notifications', 'Non-aktifkan Semua Notifikasi');

      setToast({
        message: `${l('Notification channel changed to: ', 'Kanal notifikasi diubah ke: ')}${modeLabel}`,
        type: 'success',
      });
      await loadData();
    } catch (e: any) {
      setToast({
        message: `${l('Failed to update notification mode: ', 'Gagal memperbarui mode notifikasi: ')}${e.message}`,
        type: 'error',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // WhatsApp Handlers
  const handleSavePhone = async () => {
    try {
      let cleaned = adminPhoneInput.trim();
      if (cleaned.startsWith('08')) {
        cleaned = '628' + cleaned.slice(2);
      } else if (cleaned.startsWith('+62')) {
        cleaned = '62' + cleaned.slice(3);
      }
      await api.updateSettings({ whatsapp_admin_number: cleaned });
      setAdminPhoneInput(cleaned);
      setToast({
        message: `${l('WhatsApp Admin number saved successfully', 'Nomor WhatsApp Admin berhasil disimpan')} (${cleaned})!`,
        type: 'success',
      });
      await loadData();
    } catch (e: any) {
      setToast({ message: `${l('Failed to save phone number: ', 'Gagal menyimpan nomor: ')}${e.message}`, type: 'error' });
    }
  };

  const handleConnectWa = async () => {
    setConnectingWa(true);
    try {
      await api.connectWhatsApp();
      setToast({
        message: l('Starting WhatsApp session... Please wait for QR Code.', 'Memulai sesi WhatsApp... Silakan tunggu QR Code muncul.'),
        type: 'info',
      });
      await loadData();
    } catch (e: any) {
      setToast({ message: `${l('Failed to start WhatsApp: ', 'Gagal memulai WhatsApp: ')}${e.message}`, type: 'error' });
    } finally {
      setConnectingWa(false);
    }
  };

  const handleConfirmDisconnectWa = async () => {
    setShowDisconnectModal(false);
    try {
      await api.disconnectWhatsApp();
      setToast({
        message: l('WhatsApp session successfully disconnected.', 'Sesi WhatsApp berhasil diputuskan.'),
        type: 'info',
      });
      await loadData();
    } catch (e: any) {
      setToast({ message: `${l('Failed to disconnect WhatsApp: ', 'Gagal memutuskan WhatsApp: ')}${e.message}`, type: 'error' });
    }
  };

  // Telegram Handlers
  const handleSaveTelegram = async () => {
    try {
      await api.updateSettings({
        telegram_enabled: telegramEnabled,
        telegram_bot_token: telegramBotToken.trim(),
        telegram_chat_id: telegramChatId.trim(),
      });
      setToast({
        message: l('Telegram Bot settings saved successfully!', 'Pengaturan Telegram Bot berhasil disimpan!'),
        type: 'success',
      });
      await loadData();
    } catch (e: any) {
      setToast({ message: `${l('Failed to save Telegram settings: ', 'Gagal menyimpan pengaturan Telegram: ')}${e.message}`, type: 'error' });
    }
  };

  const handleTestTelegram = async () => {
    if (!telegramBotToken.trim() || !telegramChatId.trim()) {
      setToast({
        message: l('Please fill in Telegram Bot Token and Chat ID before testing.', 'Harap isi Bot Token dan Chat ID Telegram sebelum tes.'),
        type: 'error',
      });
      return;
    }
    setTelegramTesting(true);
    setTelegramFeedback(null);
    try {
      const res = await api.testTelegram(telegramBotToken.trim(), telegramChatId.trim());
      if (res.success) {
        setTelegramFeedback({ success: true, message: res.message });
        setToast({
          message: l('Test Telegram notification sent successfully!', 'Tes notifikasi Telegram berhasil terkirim!'),
          type: 'success',
        });
      } else {
        setTelegramFeedback({
          success: false,
          message: res.message || l('Failed to send to Telegram.', 'Gagal mengirim ke Telegram.'),
        });
        setToast({
          message: res.message || l('Failed to send Telegram message', 'Gagal mengirim pesan Telegram'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setTelegramFeedback({ success: false, message: err.message });
      setToast({ message: `${l('Telegram test error: ', 'Error tes Telegram: ')}${err.message}`, type: 'error' });
    } finally {
      setTelegramTesting(false);
    }
  };

  const isWaActive = waStatus.active || waStatus.connected || !!waStatus.qrCode;
  const isTgActive = telegramEnabled === '1' && !!telegramBotToken && !!telegramChatId;

  const publicWaCommands = [
    { cmd: '/help', desc: l('Display full list of bot commands & guide', 'Menampilkan seluruh daftar command & panduan lengkap bot') },
    { cmd: '/status', desc: l('View engine status, active coin positions, and cash balance', 'Melihat status mesin, posisi koin aktif, dan saldo kas') },
    { cmd: '/profit', desc: l("Summary of today's PnL, win rate, and closed trades. Alias: /pnl", 'Rekap laba/rugi (PnL) hari ini, win rate, dan trade tertutup. Alias: /pnl') },
    { cmd: '/market', desc: l('View top 5 gainers and newly listed Indodax coins. Alias: /scanner', 'Melihat 5 koin top gainer dan koin baru masuk Indodax. Alias: /scanner') },
    { cmd: '/agents', desc: l('Summary of 10 AI research analysts & market sentiment score', 'Rangkuman 10 analis riset AI & skor sentimen pasar global') },
    { cmd: '/kenapa [coin]', desc: l('Natural audit explanation why bot bought, held, or sold a coin', 'Penjelasan audit natural kenapa bot beli, hold, atau jual koin') },
    { cmd: '/risk', desc: l('View current active risk profile parameters', 'Melihat parameter profil risiko aktif saat ini') },
  ];

  const adminWaCommands = [
    { cmd: '/admin <token>', desc: l('Authenticate your WhatsApp number as Primary Admin directly from chat', 'Otentikasi nomor WhatsApp Anda sebagai Administrator Utama langsung dari chat') },
    { cmd: '/modal <amount> [profile]', desc: l('Calculate & auto-set capital allocation (e.g. /modal 500000 balanced)', 'Hitung & atur otomatis alokasi modal (cth: /modal 500000 seimbang)') },
    { cmd: '/balance', desc: l('Check IDR cash balance & estimated total assets on Indodax (Admin Only)', 'Cek saldo kas IDR & estimasi total aset di Indodax (Khusus Admin)') },
    { cmd: '/panic', desc: l('EMERGENCY: Instantly sell ALL coins to IDR and pause auto-trading', 'EMERGENCY: Jual SEMUA koin ke IDR seketika dan jeda auto-trading') },
    { cmd: '/stop', desc: l('Pause automated trading. Alias: /pause', 'Hentikan sementara auto-trading otomatis. Alias: /pause') },
    { cmd: '/resume', desc: l('Resume automated trading. Alias: /start', 'Lanjutkan kembali auto-trading otomatis. Alias: /start') },
    { cmd: '/risk <profile>', desc: l('Change risk profile: conservative, balanced, or aggressive', 'Ubah profil risiko: konservatif, seimbang, atau agresif') },
    { cmd: '/mode <paper|live>', desc: l('Switch trading mode between Paper simulation and Live real trading', 'Ubah mode trading antara simulasi Paper dan akun Live') },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-800 bg-[#0b101b] shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 via-sky-500/20 to-indigo-500/20 text-emerald-400 border border-emerald-500/30">
            <Bot className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>{l('Notification Bot Control Center', 'Pusat Kendali Bot Notifikasi')}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                WhatsApp &amp; Telegram
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {l(
                'Configure automated order alerts, remote mobile controls, and emergency failovers in one unified view.',
                'Atur notifikasi transaksi otomatis, kontrol perintah remote HP, dan failover darurat dalam satu halaman terpadu.'
              )}
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex flex-wrap items-center gap-2">
          {/* WA Pill */}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              waStatus.connected
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                : isWaActive
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-400'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                waStatus.connected
                  ? 'bg-emerald-400'
                  : isWaActive
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-600'
              }`}
            />
            <span>
              WA: {waStatus.connected ? l('Online', 'Online') : isWaActive ? l('Scan QR', 'Scan QR') : l('Offline', 'Offline')}
            </span>
          </span>

          {/* Telegram Pill */}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              isTgActive
                ? 'bg-sky-950/40 border-sky-500/40 text-sky-400'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isTgActive ? 'bg-sky-400 animate-pulse' : 'bg-slate-600'}`} />
            <span>TG: {isTgActive ? l('Active', 'Aktif') : l('Inactive', 'Non-Aktif')}</span>
          </span>
        </div>
      </div>

      {/* Global Channel Selector Card */}
      <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <Sliders className="h-4 w-4 text-indigo-400" />
              <span>{l('Notification Delivery Channel Mode', 'Pilihan Kanal Pengiriman Notifikasi')}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {l(
                'Choose whether buy/sell alerts and coin signals are sent to WhatsApp, Telegram, or both simultaneously.',
                'Pilih apakah notifikasi order beli/jual dan sinyal koin dikirim ke WhatsApp, Telegram, atau keduanya sekaligus.'
              )}
            </p>
          </div>
          {savingSettings && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> {l('Saving...', 'Menyimpan...')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Option 1: Both */}
          <button
            type="button"
            onClick={() => handleSelectChannelMode('both')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              channelMode === 'both'
                ? 'border-indigo-500 bg-indigo-950/30 shadow-md shadow-indigo-500/10'
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between pb-1.5">
              <span className="font-bold text-xs text-indigo-300 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
                <span>{l('Both Channels', 'Keduanya Sekaligus')}</span>
              </span>
              {channelMode === 'both' && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500 text-white">
                  {l('Active', 'Aktif')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              {l(
                'WhatsApp + Telegram alerts sent simultaneously. Zero missed signals if one disconnects.',
                'WhatsApp + Telegram dikirim bersamaan. Tidak ada sinyal yang terlewat jika salah satu terputus.'
              )}
            </p>
          </button>

          {/* Option 2: WhatsApp Only */}
          <button
            type="button"
            onClick={() => handleSelectChannelMode('whatsapp_only')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              channelMode === 'whatsapp_only'
                ? 'border-emerald-500 bg-emerald-950/30 shadow-md shadow-emerald-500/10'
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between pb-1.5">
              <span className="font-bold text-xs text-emerald-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>{l('WhatsApp Only', 'Hanya WhatsApp')}</span>
              </span>
              {channelMode === 'whatsapp_only' && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-white">
                  {l('Active', 'Aktif')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              {l(
                'All alerts and AI chats are exclusively routed through your connected WhatsApp phone number.',
                'Semua peringatan dan interaksi AI hanya dikirim melalui nomor WhatsApp yang terhubung.'
              )}
            </p>
          </button>

          {/* Option 3: Telegram Only */}
          <button
            type="button"
            onClick={() => handleSelectChannelMode('telegram_only')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              channelMode === 'telegram_only'
                ? 'border-sky-500 bg-sky-950/30 shadow-md shadow-sky-500/10'
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between pb-1.5">
              <span className="font-bold text-xs text-sky-300 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-sky-400" />
                <span>{l('Telegram Only', 'Hanya Telegram')}</span>
              </span>
              {channelMode === 'telegram_only' && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500 text-white">
                  {l('Active', 'Aktif')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              {l(
                'Uses official Telegram bot API. Zero personal phone QR scans required.',
                'Hanya menggunakan bot Telegram resmi. Tidak perlu scan QR WhatsApp ponsel pribadi.'
              )}
            </p>
          </button>

          {/* Option 4: None */}
          <button
            type="button"
            onClick={() => handleSelectChannelMode('none')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              channelMode === 'none'
                ? 'border-rose-500 bg-rose-950/30 shadow-md shadow-rose-500/10'
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between pb-1.5">
              <span className="font-bold text-xs text-rose-300 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-rose-400" />
                <span>{l('Disable Notifications', 'Nonaktifkan Notifikasi')}</span>
              </span>
              {channelMode === 'none' && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500 text-white">
                  {l('Active', 'Aktif')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              {l(
                'Mute all chat bot notifications. Trading engine runs silently in background.',
                'Matikan seluruh notifikasi chat bot. Bot tetap trading otomatis di background tanpa pesan.'
              )}
            </p>
          </button>
        </div>
      </div>

      {/* View Sub-Tab Filters: All / WhatsApp / Telegram */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setBotTab('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            botTab === 'all'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          {l('All Bots (WA & Telegram)', 'Semua Bot (WhatsApp & Telegram)')}
        </button>
        <button
          type="button"
          onClick={() => setBotTab('whatsapp')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            botTab === 'whatsapp'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{l('WhatsApp Settings', 'Pengaturan WhatsApp')}</span>
        </button>
        <button
          type="button"
          onClick={() => setBotTab('telegram')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            botTab === 'telegram'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>{l('Telegram Settings', 'Pengaturan Telegram')}</span>
        </button>
      </div>

      {/* SECTION 1: WHATSAPP BOT CONFIGURATION */}
      {(botTab === 'all' || botTab === 'whatsapp') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>WhatsApp Trading Bot (Baileys)</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                    channelMode === 'telegram_only' || channelMode === 'none'
                      ? 'bg-slate-800 text-slate-400'
                      : waStatus.connected
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                      : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                  }`}>
                    {channelMode === 'telegram_only' || channelMode === 'none'
                      ? l('Disabled by Channel Selection', 'Dinonaktifkan oleh Pilihan Kanal')
                      : waStatus.connected
                      ? l('Online Connected', 'Koneksi Online')
                      : l('Awaiting QR Scan', 'Menunggu Scan QR')}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {l(
                    'AI queries, remote admin commands, and real-time buy/sell alerts directly to WhatsApp chat.',
                    'Tanya-jawab AI trading, perintah remote admin, dan alert buy/sell otomatis ke chat WhatsApp.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isWaActive ? (
                <button
                  onClick={handleConnectWa}
                  disabled={connectingWa}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
                >
                  {connectingWa ? l('Connecting...', 'Menghubungkan...') : l('Start WhatsApp', 'Mulai WhatsApp')}
                </button>
              ) : (
                <button
                  onClick={() => setShowDisconnectModal(true)}
                  className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/30 hover:bg-rose-900/40 text-xs font-semibold text-rose-300 transition-colors"
                >
                  {l('Disconnect WA Session', 'Putuskan Sesi WA')}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (5 cols): QR Code Scanner */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 text-center shadow-sm">
                <div className="flex items-center justify-center gap-2 text-slate-200 font-semibold text-sm mb-3">
                  <QrCode className="h-4 w-4 text-emerald-400" />
                  <span>{l('Pairing WhatsApp (Scan QR)', 'Pairing WhatsApp (Scan QR)')}</span>
                </div>

                {waStatus.connected ? (
                  <div className="py-8 space-y-2">
                    <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
                    <p className="text-sm font-semibold text-slate-100">
                      {l('WhatsApp is Connected!', 'WhatsApp Sudah Terhubung!')}
                    </p>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      {l(
                        'Bot is ready to respond to AI questions, execute commands, and send order notifications.',
                        'Bot siap merespon pertanyaan AI, memproses perintah publik, dan mengirim notifikasi transaksi ke Administrator.'
                      )}
                    </p>
                  </div>
                ) : waStatus.qrCode ? (
                  <div className="space-y-3">
                    <div className="inline-block p-3 rounded-xl bg-white shadow-md">
                      <img src={waStatus.qrCode} alt="WhatsApp QR Code" className="w-56 h-56 mx-auto" />
                    </div>
                    <p className="text-xs text-slate-400">
                      {l(
                        'Open WhatsApp on phone > Linked Devices > Link a Device.',
                        'Buka WhatsApp di ponsel > Perangkat Tertaut (Linked Devices) > Tautkan Perangkat.'
                      )}
                    </p>
                  </div>
                ) : !isWaActive ? (
                  <div className="py-10 space-y-3 text-slate-400 text-xs">
                    <p className="text-slate-300 font-medium">
                      {l('WhatsApp is currently inactive.', 'WhatsApp saat ini dalam kondisi non-aktif.')}
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      {l(
                        'Click button below to start session and generate QR Code pairing.',
                        'Klik tombol di bawah ini untuk memulai sesi WhatsApp dan menampilkan QR Code pairing.'
                      )}
                    </p>
                    <button
                      onClick={handleConnectWa}
                      disabled={connectingWa}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-sm transition-colors"
                    >
                      {connectingWa ? l('Starting...', 'Memulai...') : l('Activate WhatsApp & Generate QR', 'Aktifkan WhatsApp & Generate QR')}
                    </button>
                  </div>
                ) : (
                  <div className="py-12 text-slate-400 text-xs">
                    <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2" />
                    {l('Initializing Baileys session...', 'Sedang menginisialisasi sesi Baileys...')}
                  </div>
                )}

                <div className="mt-4 p-3 rounded-xl border border-slate-800/80 bg-slate-900/40 text-[11px] text-slate-400 text-left space-y-1">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
                    {l('Pairing Tips & QR Troubleshooting:', 'Tips Pairing & Solusi QR:')}
                  </span>
                  <p>• {l('QR Code rotates automatically every 40s for security.', 'QR Code berganti otomatis setiap 40 detik demi keamanan.')}</p>
                  <p>• {l('QR not appearing? Click Disconnect WA Session and restart.', 'QR tidak muncul? Klik Putuskan Sesi lalu aktifkan kembali.')}</p>
                  <p>• {l('Set your phone number in whitelist below to receive order alerts.', 'Atur nomor HP Anda di whitelist bawah agar menerima alert order otomatis.')}</p>
                </div>
              </div>

              {/* Admin Phone Number Whitelist */}
              <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                  <Phone className="h-4 w-4 text-emerald-400" />
                  <span>{l('WhatsApp Administrator Phone Number', 'Nomor HP Administrator WhatsApp')}</span>
                </div>
                <p className="text-xs text-slate-400">
                  {l(
                    'This number will receive trade alerts and hold authority to execute sensitive admin commands.',
                    'Nomor HP ini akan menjadi penerima utama notifikasi beli/jual serta berhak mengeksekusi perintah sensitif.'
                  )}
                </p>

                <div className="space-y-2">
                  <label className="text-[11px] font-mono text-slate-400 block">
                    {l('Admin Phone (Format: 628xxx)', 'Nomor HP Admin (Format: 628xxx)')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={adminPhoneInput}
                      onChange={(e) => setAdminPhoneInput(e.target.value)}
                      placeholder={l('Example: 62812XXXXXXXX', 'Contoh: 62812XXXXXXXX')}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 font-mono text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={handleSavePhone}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-sm transition-colors"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{l('Save', 'Simpan')}</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    {l(
                      'Supports 62 or 08 prefixes. The system normalizes automatically to international standard.',
                      'Gunakan awalan 62 atau 08. Sistem otomatis mengubahnya ke format standar WhatsApp internasional.'
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column (7 cols): WhatsApp Commands Guide */}
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  <span>{l('WhatsApp Chat Command Reference', 'Daftar Perintah Chat WhatsApp')}</span>
                </div>
                <p className="text-xs text-slate-400">
                  {l(
                    'Send these commands directly to the bot from your phone anytime:',
                    'Kirim perintah ini langsung ke nomor WhatsApp bot dari ponsel Anda kapan saja:'
                  )}
                </p>

                {/* Public Commands */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    <span>{l('Public Commands (Accessible to anyone):', 'Perintah Publik (Bisa Diakses Semua Orang):')}</span>
                  </span>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/60 overflow-hidden">
                    {publicWaCommands.map((c) => (
                      <div key={c.cmd} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                        <span className="font-mono font-bold text-emerald-400">{c.cmd}</span>
                        <span className="text-slate-400 text-[11px]">{c.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Admin Commands */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-rose-400" />
                    <span>{l('Administrator Commands (Auth Token Required):', 'Perintah Khusus Administrator (Wajib Terotentikasi):')}</span>
                  </span>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/60 overflow-hidden">
                    {adminWaCommands.map((c) => (
                      <div key={c.cmd} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                        <span className="font-mono font-bold text-amber-400">{c.cmd}</span>
                        <span className="text-slate-400 text-[11px]">{c.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: TELEGRAM BOT CONFIGURATION */}
      {(botTab === 'all' || botTab === 'telegram') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-sky-500/20 bg-sky-950/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>Telegram Official Bot Notifier</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                    channelMode === 'whatsapp_only' || channelMode === 'none'
                      ? 'bg-slate-800 text-slate-400'
                      : isTgActive
                      ? 'bg-sky-950 text-sky-400 border border-sky-500/40'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}>
                    {channelMode === 'whatsapp_only' || channelMode === 'none'
                      ? l('Disabled by Channel Selection', 'Dinonaktifkan oleh Pilihan Kanal')
                      : isTgActive
                      ? l('Bot Ready & Active', 'Bot Siap & Aktif')
                      : l('Not Configured', 'Belum Dikonfigurasi')}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {l(
                    'Receive instant buy/sell alerts and remote interactions without scanning personal phone QR codes.',
                    'Menerima alert beli/jual secara instan dan interaksi remote tanpa perlu scan QR ponsel pribadi.'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveTelegram}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white shadow-sm transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{l('Save Telegram', 'Simpan Telegram')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (6 cols): Form Credentials */}
            <div className="lg:col-span-6 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                    <Key className="h-4 w-4 text-sky-400" />
                    <span>{l('Telegram Bot Credentials', 'Kredensial Bot Telegram')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">{l('Enable:', 'Aktifkan:')}</label>
                    <select
                      value={telegramEnabled}
                      onChange={(e) => setTelegramEnabled(e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 outline-none focus:border-sky-500"
                    >
                      <option value="1">{l('Active', 'Aktif')}</option>
                      <option value="0">{l('Disabled', 'Non-Aktif')}</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Telegram Bot Token</label>
                    <div className="relative">
                      <input
                        type={showTelegramToken ? 'text' : 'password'}
                        value={telegramBotToken}
                        onChange={(e) => setTelegramBotToken(e.target.value)}
                        placeholder="Contoh: 123456789:ABC-DEF1234ghIkl..."
                        className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTelegramToken(!showTelegramToken)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                        title={showTelegramToken ? l('Hide Token', 'Sembunyikan Token') : l('Show Token', 'Lihat Token')}
                      >
                        {showTelegramToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      {l(
                        'Secret token provided by @BotFather on Telegram when creating your bot.',
                        'Token rahasia dari @BotFather di Telegram saat Anda membuat bot baru.'
                      )}
                    </span>
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium block mb-1">
                      {l('Telegram Chat ID (User or Group)', 'Telegram Chat ID (User atau Grup)')}
                    </label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="Contoh: 987654321 atau -100123456789"
                      className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                    />
                    <span className="text-[10px] text-slate-500 block mt-1">
                      {l(
                        'Your user ID or group ID. Get it by sending a message to @userinfobot on Telegram.',
                        'ID akun Anda atau ID grup. Dapatkan dengan mengirim pesan ke @userinfobot di Telegram.'
                      )}
                    </span>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleTestTelegram}
                      disabled={telegramTesting}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white shadow-sm transition-colors"
                    >
                      <Send className={`h-3.5 w-3.5 ${telegramTesting ? 'animate-spin' : ''}`} />
                      <span>{telegramTesting ? l('Sending Test Message...', 'Mengirim Pesan Tes...') : l('Send Test Message', 'Kirim Pesan Tes Telegram')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveTelegram}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{l('Save Settings', 'Simpan Pengaturan')}</span>
                    </button>
                  </div>

                  {telegramFeedback && (
                    <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                      telegramFeedback.success
                        ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-950/40 text-rose-300 border border-rose-500/30'
                    }`}>
                      {telegramFeedback.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{telegramFeedback.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column (6 cols): 3-Step Setup Guide & Telegram Commands */}
            <div className="lg:col-span-6 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                  <HelpCircle className="h-4 w-4 text-sky-400" />
                  <span>{l('Telegram Bot Setup Guide (3 Minutes)', 'Panduan Setup Bot Telegram (3 Menit Selesai)')}</span>
                </div>

                <div className="space-y-3 text-xs text-slate-300">
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 space-y-1">
                    <span className="font-bold text-sky-400 block">
                      {l('Step 1: Create Bot on Telegram', 'Langkah 1: Buat Bot di Telegram')}
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {l(
                        'Open Telegram > search @BotFather > send /newbot command. Name your bot and copy the API Token provided.',
                        'Buka Telegram -> cari @BotFather -> kirim perintah /newbot. Beri nama dan username bot Anda. Salin API Token yang diberikan.'
                      )}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 space-y-1">
                    <span className="font-bold text-sky-400 block">
                      {l('Step 2: Obtain Your Chat ID', 'Langkah 2: Dapatkan Chat ID Anda')}
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {l(
                        'Search @userinfobot on Telegram > click Start. The bot replies with your numeric Id (e.g. 123456789).',
                        'Cari bot @userinfobot di Telegram -> klik Start. Bot akan menampilkan angka Id Anda (contoh: 123456789).'
                      )}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 space-y-1">
                    <span className="font-bold text-sky-400 block">
                      {l('Step 3: Start Your Bot & Test', 'Langkah 3: Start Bot Anda & Tes')}
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      ⚠️ <strong>{l('Mandatory:', 'Wajib:')}</strong>{' '}
                      {l(
                        'Open your newly created bot chat and click /start so Telegram permits it to send you messages. Then click Send Test Message on the left.',
                        'Buka chat bot yang baru Anda buat, lalu klik /start agar bot diizinkan mengirim pesan kepada Anda. Setelah itu klik tombol Kirim Pesan Tes Telegram di sebelah kiri.'
                      )}
                    </p>
                  </div>
                </div>

                {/* Telegram Keyboard Commands */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-sky-400" />
                    <span>{l('Interactive Telegram Commands:', 'Perintah Interaktif Telegram Keyboard:')}</span>
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-center text-slate-200">
                      /status
                    </div>
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-center text-slate-200">
                      /balance
                    </div>
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-center text-slate-200">
                      /pause
                    </div>
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-center text-slate-200">
                      /resume
                    </div>
                    <div className="p-2 rounded bg-rose-950/40 border border-rose-500/30 text-[11px] font-mono font-bold text-center text-rose-300">
                      /panic
                    </div>
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-center text-slate-200">
                      /help
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect WhatsApp Modal */}
      {showDisconnectModal && (
        <ConfirmModal
          isOpen={showDisconnectModal}
          title={l('Disconnect WhatsApp Session?', 'Putuskan Sesi WhatsApp?')}
          message={l(
            'Disconnecting will clear the active credentials. You will need to scan the QR code again to resume notifications.',
            'Memutuskan koneksi akan menghapus kredensial sesi saat ini. Anda perlu melakukan scan QR Code kembali untuk mengaktifkan notifikasi WhatsApp.'
          )}
          confirmText={l('Yes, Disconnect Session', 'Ya, Putuskan Sesi')}
          isDanger={true}
          onConfirm={handleConfirmDisconnectWa}
          onCancel={() => setShowDisconnectModal(false)}
        />
      )}

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
};

export const WhatsAppView = BotsView;
