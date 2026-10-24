import { getSetting, setSetting, db } from '../../db/index.js';

export class TelegramService {
  private isPolling = false;
  private pollTimeout: NodeJS.Timeout | null = null;
  private lastUpdateId = 0;
  private panicHandler?: () => Promise<{ success: boolean; message: string }>;

  public setPanicHandler(handler: () => Promise<{ success: boolean; message: string }>) {
    this.panicHandler = handler;
  }

  /**
   * Mengirim notifikasi teks ke chat / grup Telegram yang dikonfigurasi.
   */
  public async sendAlert(message: string): Promise<boolean> {
    const channel = getSetting('bot_notification_channel', 'both');
    const enabled = getSetting('telegram_enabled', '0') === '1';
    const botToken = getSetting('telegram_bot_token', '').trim();
    const chatId = getSetting('telegram_chat_id', '').trim();

    if (channel === 'whatsapp_only' || channel === 'none' || !enabled || !botToken || !chatId) {
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [
              [{ text: '/status' }, { text: '/balance' }],
              [{ text: '/pause' }, { text: '/resume' }],
              [{ text: '/panic' }, { text: '/help' }],
            ],
            resize_keyboard: true,
          },
        }),
      });

      const data = (await res.json()) as { ok?: boolean; description?: string };
      if (!data.ok) {
        console.warn('[Telegram Alert Failed]', data.description);
      }
      return Boolean(data.ok);
    } catch (err: any) {
      console.warn('[Telegram Alert Network Error]', err.message);
      return false;
    }
  }

  /**
   * Verifikasi token bot dan chat ID dengan mengirimkan pesan tes.
   */
  public async testConnection(botToken: string, chatId: string): Promise<{ success: boolean; message: string }> {
    try {
      const cleanToken = botToken.trim();
      const cleanChatId = chatId.trim();

      if (!cleanToken || !cleanChatId) {
        return { success: false, message: 'Bot Token dan Chat ID wajib diisi.' };
      }

      const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text: '🤖 *[AI TRADING - TEST CONNECTION]*\n\nKoneksi Telegram Notifier & Remote Control berhasil terhubung!\nBot siap menerima perintah jarak jauh (/status, /balance, /panic, /pause, /resume).',
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [
              [{ text: '/status' }, { text: '/balance' }],
              [{ text: '/pause' }, { text: '/resume' }],
              [{ text: '/panic' }, { text: '/help' }],
            ],
            resize_keyboard: true,
          },
        }),
      });

      const data = (await res.json()) as { ok?: boolean; description?: string };
      if (data.ok) {
        return { success: true, message: 'Pesan tes berhasil dikirim ke Telegram Anda!' };
      }
      return { success: false, message: data.description || 'Gagal mengirim pesan ke Telegram. Periksa token dan chat ID.' };
    } catch (err: any) {
      return { success: false, message: `Error koneksi ke Telegram API: ${err.message}` };
    }
  }

  /**
   * Menjalankan 2-Way Interactive Command Polling.
   */
  public startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    this.pollUpdates();
    console.log('[Telegram Remote Bot] 2-Way Command Listener aktif.');
  }

  public stopPolling() {
    this.isPolling = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
  }

  private async pollUpdates() {
    if (!this.isPolling) return;

    const enabled = getSetting('telegram_enabled', '0') === '1';
    const botToken = getSetting('telegram_bot_token', '').trim();
    const authorizedChatId = getSetting('telegram_chat_id', '').trim();

    if (!enabled || !botToken) {
      this.pollTimeout = setTimeout(() => this.pollUpdates(), 10000);
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=5`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const json = (await res.json()) as { ok?: boolean; result?: Array<{ update_id: number; message?: any }> };

      if (json.ok && Array.isArray(json.result)) {
        for (const update of json.result) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
          const msg = update.message;
          if (!msg || !msg.text) continue;

          const chatType = String(msg.chat?.type || 'private');
          const isPrivateChat = chatType === 'private';
          const senderChatId = String(msg.chat?.id || '');
          const senderUserId = String(msg.from?.id || '');
          const text = msg.text.trim();
          const cmd = text.toLowerCase().split(' ')[0];

          // Strict Authorization: If no chat ID is configured, fail-closed to prevent remote control hijacking
          if (!authorizedChatId) {
            if (cmd === '/start' || cmd === '/chatid' || cmd === '/help') {
              await this.sendDirectReply(
                botToken,
                senderChatId,
                `⚠️ *Telegram Remote Control Belum Dikonfigurasi*\n\n` +
                `Chat ID Anda: \`${senderChatId}\` (User ID: \`${senderUserId}\`)\n\n` +
                `Untuk keamanan dana, seluruh eksekusi perintah ditolak sampai Anda memasukkan Chat ID ini ke Pengaturan Admin di Web Dashboard.`
              );
            }
            continue;
          }

          // Strict Chat & Sender Verification:
          // In private chat: senderChatId === authorizedChatId || senderUserId === authorizedChatId
          // In group/supergroup: senderUserId === authorizedChatId (user who sent the message must match authorizedChatId)
          const isAuthorized = isPrivateChat
            ? (senderChatId === authorizedChatId || senderUserId === authorizedChatId)
            : (senderUserId === authorizedChatId);

          if (!isAuthorized) {
            console.warn(`[Telegram Security] Akses ditolak dari chat tak dikenal: ${senderChatId} (type: ${chatType}, user: ${senderUserId})`);
            continue;
          }

          await this.handleIncomingCommand(botToken, senderChatId, text);
        }
      }
    } catch {
      // Ignore polling timeout/network blips
    }

    if (this.isPolling) {
      this.pollTimeout = setTimeout(() => this.pollUpdates(), 2000);
    }
  }

  private async sendDirectReply(botToken: string, chatId: string, text: string) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });
    } catch {}
  }

  private async handleIncomingCommand(botToken: string, chatId: string, text: string) {
    const cmd = text.toLowerCase().split(' ')[0];

    let reply = '';
    if (cmd === '/start' || cmd === '/help') {
      reply = `🤖 *AI-Trading Remote Control Center*\n\n` +
        `Perintah yang tersedia:\n` +
        `• */status* : Status live bot & posisi koin aktif\n` +
        `• */balance* : Cek saldo kas & portofolio\n` +
        `• */pause* : Menjeda trading otomatis\n` +
        `• */resume* : Melanjutkan trading otomatis\n` +
        `• */panic* : Jual darurat SEMUA koin (butuh /panic confirm)\n` +
        `• */help* : Tampilkan menu bantuan`;
    } else if (cmd === '/status') {
      const isActive = getSetting('is_auto_trading_active', '0') === '1';
      const mode = getSetting('trading_mode', 'paper');
      const positions = db.prepare("SELECT symbol, entry_price, current_price, pnl_percent, amount FROM positions WHERE status = 'open'").all() as any[];

      let posText = 'Tidak ada posisi terbuka (0 holding).';
      if (positions.length > 0) {
        posText = positions.map(p => `• *${p.symbol.toUpperCase()}*: Rp ${p.current_price.toLocaleString('id-ID')} (${p.pnl_percent >= 0 ? '+' : ''}${p.pnl_percent.toFixed(2)}%)`).join('\n');
      }

      reply = `📊 *Status AI-Trading Engine*\n\n` +
        `• *Auto-Trading*: ${isActive ? '🟢 AKTIF' : '⏸️ PAUSED'}\n` +
        `• *Mode*: ${mode.toUpperCase()} TRADING\n` +
        `• *Posisi Aktif (${positions.length})*:\n${posText}`;
    } else if (cmd === '/balance') {
      const mode = getSetting('trading_mode', 'paper');
      const paperBal = parseFloat(getSetting('paper_idr_balance', '10000000'));
      const hasApiKey = !!getSetting('indodax_api_key', '').trim();
      reply = `💰 *Informasi Saldo Kas*\n\n` +
        `• *Mode Saat Ini*: ${mode.toUpperCase()} TRADING\n` +
        `• *Saldo Paper*: Rp ${paperBal.toLocaleString('id-ID')}\n` +
        `• *Koneksi Live API*: ${hasApiKey ? '🟢 Terkonfigurasi' : '⚪ Belum Dikonfigurasi'}\n` +
        `• *Ekuitas Portofolio*: Terlindungi oleh Circuit Breaker`;
    } else if (cmd === '/pause' || cmd === '/stop') {
      setSetting('is_auto_trading_active', '0');
      reply = '⏸️ *Auto-Trading Berhasil Dihentikan (PAUSED)*.\nBot tidak akan membuka posisi baru. Posisi terbuka tetap dipantau oleh pengaman Trailing Stop.';
    } else if (cmd === '/resume' || cmd === '/start_trading') {
      setSetting('is_auto_trading_active', '1');
      reply = '🟢 *Auto-Trading Berhasil Dilanjutkan (ACTIVE)*.\nBot kembali aktif memindai koin momentum dan mengeksekusi konfluensi AI.';
    } else if (cmd === '/panic') {
      const isConfirmed = text.toLowerCase().includes('confirm');
      if (!isConfirmed) {
        reply = `⚠️ *KONFIRMASI LIKUIDASI DARURAT*\n\n` +
          `Perintah ini akan menjual SELURUH koin posisi aktif ke IDR seketika dan menghentikan auto-trading.\n\n` +
          `Ketik */panic confirm* untuk mengeksekusi likuidasi sekarang.`;
      } else if (this.panicHandler) {
        const res = await this.panicHandler();
        reply = `🚨 *PANIC SELL EXECUTED*\n${res.message}`;
      } else {
        setSetting('is_auto_trading_active', '0');
        reply = '🚨 *PANIC SELL TRIGGERED*: Auto-trading dihentikan darurat.';
      }
    } else {
      reply = `Perintah tidak dikenal: ${text}\nKetik */help* untuk melihat daftar perintah.`;
    }

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: reply,
          parse_mode: 'Markdown',
        }),
      });
    } catch {}
  }
}

export const telegramService = new TelegramService();
