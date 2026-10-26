import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { db, getSetting, setSetting, applyRiskProfile, RISK_PROFILES, DATA_DIR } from '../../db/index.js';
import { tradingEngine, PositionRecord } from '../trading/index.js';
import { calculateCapitalAllocation } from '../trading/riskGuard.js';
import { indodax } from '../indodax/index.js';
import { buildWhatsappSystemPrompt } from '../ai/prompts.js';
import { agentSwarm } from '../agents/index.js';
import { aiClient } from '../ai/index.js';
import { secureCompareTokens } from '../auth/tokenRotation.js';

const AUTH_DIR = path.join(DATA_DIR, 'baileys_auth');
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

export class WhatsAppBotService {
  private sock: WASocket | null = null;
  private qrCodeDataUrl: string | null = null;
  private isConnected = false;
  private isServiceActive = false;
  private lastAdminJid: string | null = null;
  private onQrCallback?: (qrDataUrl: string) => void;
  private onStatusCallback?: (status: { connected: boolean; user?: string }) => void;

  public setCallbacks(
    onQr: (qr: string) => void,
    onStatus: (status: { connected: boolean; user?: string }) => void
  ) {
    this.onQrCallback = onQr;
    this.onStatusCallback = onStatus;
  }

  public getStatus(): {
    connected: boolean;
    active: boolean;
    qrCode: string | null;
    adminNumber: string;
    adminLid: string;
  } {
    return {
      connected: this.isConnected,
      active: this.isServiceActive,
      qrCode: this.qrCodeDataUrl,
      adminNumber: getSetting('whatsapp_admin_number', ''),
      adminLid: getSetting('whatsapp_admin_lid', ''),
    };
  }

  public async disconnect() {
    this.isServiceActive = false;
    this.isConnected = false;
    this.qrCodeDataUrl = null;
    try {
      if (this.sock) {
        this.sock.end(undefined);
        this.sock = null;
      }
    } catch (e) {
      console.warn('Error disconnecting WhatsApp socket', e);
    }
    if (this.onStatusCallback) {
      this.onStatusCallback({ connected: false });
    }
  }

  /**
   * Identifies whether the incoming sender JID or participant is authorized as Admin.
   * Supports:
   * 1. Standard MSISDN phone numbers (e.g. 6282223616154, 082223616154)
   * 2. WhatsApp Multi-Device Linked Identity Device JIDs (e.g. 111893192687716@lid)
   * 3. Comma/space-separated admin whitelist tokens in settings
   * 4. Auto-bound admin LID stored via in-chat /admin <token> verification
   */
  public isSenderAdmin(jid: string, participant?: string): boolean {
    const adminNumber = getSetting('whatsapp_admin_number', '').trim();
    const adminLid = getSetting('whatsapp_admin_lid', '').trim();

    const cleanJid = jid.toLowerCase().trim();
    const cleanParticipant = (participant || '').toLowerCase().trim();
    const isGroup = cleanJid.endsWith('@g.us');

    // In a group, admin status MUST be determined exclusively by the participant sender, NOT the group JID!
    const effectiveSenderJid = isGroup ? cleanParticipant : cleanJid;
    if (!effectiveSenderJid) return false;

    // Direct match against known active admin JID session (never match group JIDs)
    if (this.lastAdminJid && !this.lastAdminJid.endsWith('@g.us') && effectiveSenderJid === this.lastAdminJid) {
      return true;
    }

    // Extract digits from incoming JID, stripping device suffix like :2 (e.g. "6282223616154:2@s.whatsapp.net" -> "6282223616154")
    const rawUser = effectiveSenderJid.split('@')[0].split(':')[0];
    const senderDigits = rawUser.replace(/\D/g, '');

    // Normalize Indonesian phone numbers: 08xxx vs 628xxx
    const normalizeIdn = (d: string) => (d.startsWith('0') ? '62' + d.slice(1) : d);
    const normSenderDigits = normalizeIdn(senderDigits);

    const configuredTokens = `${adminNumber},${adminLid}`
      .split(/[,;\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    for (const token of configuredTokens) {
      // 1. Direct JID match (e.g. "111893192687716@lid" or "6282223616154@s.whatsapp.net")
      if (token.includes('@')) {
        if (effectiveSenderJid === token) return true;
        // Strip device suffix from token if present
        const tokenBase = token.split('@')[0].split(':')[0] + '@' + token.split('@')[1];
        const effectiveBase = effectiveSenderJid.split('@')[0].split(':')[0] + '@' + effectiveSenderJid.split('@')[1];
        if (effectiveBase === tokenBase) return true;
      }

      // 2. Digits-only match (e.g. "111893192687716" or "6282223616154")
      const tokenDigits = token.replace(/\D/g, '');
      if (tokenDigits) {
        if (senderDigits === tokenDigits) return true;

        const normToken = normalizeIdn(tokenDigits);
        if (normSenderDigits === normToken) return true;

        // Strict match with minimum 10 digits to prevent false positive country code collisions
        if (tokenDigits.length >= 10 && senderDigits === tokenDigits) return true;
        if (normToken.length >= 10 && normSenderDigits === normToken) return true;
      }
    }

    return false;
  }

  /**
   * Determines whether a command is dangerous/state-mutating (Admin-Only).
   */
  public isDangerousCommand(cmd: string, args: string[]): boolean {
    const dangerousCommands = [
      '/panic',
      '/panic-sell',
      '/stop',
      '/pause',
      '/resume',
      '/start',
      '/buy',
      '/sell',
      '/mode',
      '/balance',
      '/saldo',
    ];

    if (dangerousCommands.includes(cmd)) return true;

    // /risk with arguments (e.g. /risk agresif) mutates parameters -> Admin-only!
    // /risk without arguments only views the current profile -> Public
    if (cmd === '/risk' && args.length > 0 && args[0].toLowerCase() !== 'status') {
      return true;
    }

    // /modal with arguments auto-sets capital & risk -> Admin-only!
    if (cmd === '/modal' && args.length > 0) {
      return true;
    }

    return false;
  }

  public async start() {
    this.isServiceActive = true;
    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['AI-Crypto-Trading', 'Chrome', '1.0.0'],
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const dataUrl = await QRCode.toDataURL(qr);
            this.qrCodeDataUrl = dataUrl;
            if (this.onQrCallback) this.onQrCallback(dataUrl);
            console.log('[WhatsApp Baileys] QR Code baru siap di-scan (tersedia di Web UI & Terminal).');
          } catch (e) {
            console.error('Failed to generate QR data URL', e);
          }
        }

        if (connection === 'close') {
          this.isConnected = false;
          this.qrCodeDataUrl = null;
          const shouldReconnect =
            (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('[WhatsApp Baileys] Koneksi terputus. Reconnecting:', shouldReconnect);
          if (this.onStatusCallback) this.onStatusCallback({ connected: false });
          if (shouldReconnect) {
            setTimeout(() => this.start(), 5000);
          }
        } else if (connection === 'open') {
          this.isConnected = true;
          this.qrCodeDataUrl = null;
          console.log('[WhatsApp Baileys] Berhasil terhubung ke WhatsApp!');
          if (this.onStatusCallback) {
            this.onStatusCallback({
              connected: true,
              user: this.sock?.user?.id || 'Connected User',
            });
          }

          // Startup notification: notify admin that WhatsApp is connected and auto-trading is running
          const isAutoTradingActive = getSetting('is_auto_trading_active', '0') === '1';
          const mode = getSetting('trading_mode', 'paper');
          const risk = getSetting('risk_profile', 'balanced');

          const startupMessage = isAutoTradingActive
            ? `🚀 *AI TRADING BOT ONLINE*\n\n✅ Sesi WhatsApp berhasil terhubung ke server!\n🟢 *Status Auto-Trading:* AKTIF\n📊 *Mode:* ${mode.toUpperCase()} TRADING\n🛡️ *Profil Risiko:* ${risk.toUpperCase()}\n📡 *Monitoring:* 400+ pair IDR Indodax\n🧠 *Multi-Agent Swarm:* 10 Subagent Siap\n\nKetik */help* untuk melihat seluruh perintah, atau kirim pertanyaan biasa untuk berdiskusi dengan AI Asisten.`
            : `🚀 *AI TRADING BOT ONLINE*\n\n✅ Sesi WhatsApp berhasil terhubung ke server!\n⏸️ *Status Auto-Trading:* PAUSED (Siaga)\n📊 *Mode:* ${mode.toUpperCase()} TRADING\n🛡️ *Profil Risiko:* ${risk.toUpperCase()}\n\nKetik */resume* atau */start* untuk mengaktifkan auto-trading, atau */help* untuk melihat daftar command.`;

          await this.sendAlert(startupMessage);
        }
      });

      // Handle incoming messages (Public AI Chat + Safe Commands for Everyone, Protected Dangerous Commands for Admin)
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid) continue;

          const participant = msg.key.participant || (msg as any).participant;

          // Extract text from text message or extended text message
          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

          const trimmed = text.trim();
          if (!trimmed) continue;

          const isAdmin = this.isSenderAdmin(remoteJid, participant);
          if (isAdmin) {
            // Never set a group JID as lastAdminJid (prevents group privilege escalation)
            if (!remoteJid.endsWith('@g.us')) {
              this.lastAdminJid = remoteJid;
            } else if (participant && !participant.endsWith('@g.us')) {
              this.lastAdminJid = participant;
            }
          }

          // DUAL-MODE ROUTER:
          if (trimmed.startsWith('/')) {
            // COMMAND MODE
            await this.handleCommand(remoteJid, trimmed, isAdmin);
          } else {
            // CONVERSATIONAL AI MODE: Open to everyone with trading context & natural action execution!
            await this.handleAiChat(remoteJid, trimmed, isAdmin);
          }
        }
      });
    } catch (err) {
      console.error('[WhatsApp Service Error]', err);
    }
  }

  // --- Command Handler (Public vs Admin Guarded) ---

  public async handleCommand(jid: string, commandText: string, isAdmin: boolean) {
    const parts = commandText.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Special Auth Command: /admin <token> or /login <token>
    if (cmd === '/admin' || cmd === '/login') {
      if (jid.includes('@g.us')) {
        await this.sendMessage(
          jid,
          `⛔ *PERINGATAN KEAMANAN*\n\nOtentikasi admin tidak dapat dilakukan di grup chat demi mencegah kebocoran token. Silakan kirim perintah ini secara langsung melalui chat pribadi (JAPRI) ke nomor bot.`
        );
        return;
      }

      const tokenInput = args[0]?.trim();
      const serverToken =
        getSetting('admin_access_token', '').trim() ||
        process.env.ADMIN_ACCESS_TOKEN?.trim() ||
        '';

      if (!tokenInput) {
        await this.sendMessage(
          jid,
          `🔑 *OTENTIKASI ADMINISTRATOR*\n\nMasukkan token akses admin:\n*/admin <admin_access_token>*\n\n💡 Token dapat dilihat di terminal server saat startup atau di menu Settings Web Dashboard.`
        );
        return;
      }

      if (serverToken && secureCompareTokens(tokenInput, serverToken)) {
        this.lastAdminJid = jid;
        if (jid.includes('@lid')) {
          setSetting('whatsapp_admin_lid', jid);
        } else {
          const clean = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
          const existing = getSetting('whatsapp_admin_number', '').trim();
          if (!existing.includes(clean)) {
            setSetting('whatsapp_admin_number', existing ? `${existing}, ${clean}` : clean);
          }
        }

        await this.sendMessage(
          jid,
          `✅ *OTENTIKASI ADMIN BERHASIL!*\n\nIdentitas Anda (*${jid}*) telah terdaftar sebagai Administrator Utama AI Trading Bot.\n\n🛡️ Anda sekarang memiliki izin penuh untuk:\n• */panic* : Emergency jual semua posisi\n• */stop* : Pause auto-trading\n• */resume* : Start/lanjutkan auto-trading\n• */buy* & */sell* : Eksekusi trading manual\n• */risk <profil>* : Ubah parameter risiko\n• */mode <paper|live>* : Ubah mode trading`
        );
        console.log(`[WhatsApp Auth] Administrator baru berhasil diverifikasi via token: ${jid}`);
      } else {
        await this.sendMessage(
          jid,
          `❌ *OTENTIKASI GAGAL*\nToken yang Anda masukkan salah. Pastikan menyalin ADMIN ACCESS TOKEN dari terminal server atau menu Settings Web Dashboard.`
        );
      }
      return;
    }

    // Role-based Access Control Check for Dangerous Commands
    if (this.isDangerousCommand(cmd, args)) {
      if (!isAdmin) {
        await this.sendMessage(
          jid,
          `⚠️ *Akses Ditolak*\n\nPerintah *${cmd}* bersifat sensitif (kontrol trading & transaksi bursa) dan hanya dapat dijalankan oleh Administrator AI Trading.\n\n💡 *Pemilik Bot?*\nJika Anda adalah pemilik sistem, silakan lakukan otentikasi admin dengan mengetik:\n*/admin <admin_access_token>*\n\n(Token Admin dapat dilihat di terminal server saat startup atau menu Settings Web Dashboard).`
        );
        return;
      }
    }

    switch (cmd) {
      case '/help':
        await this.sendMessage(
          jid,
          `🤖 *DAFTAR COMMAND AI TRADING BOT*

🌍 *Perintah Publik (Bisa Diakses Semua Orang):*
• */status* : Cek status engine, posisi aktif & floating PnL
• */pnl* : Laporan keuntungan (PnL) hari ini & total win rate
• */market* : Lihat koin trending gainer & koin baru listing
• */agents* : Status 10 analis AI & skor sentimen pasar global
• */kenapa [koin]* : Penjelasan audit kenapa bot hold/beli/jual koin
• */risk* : Lihat profil risiko aktif saat ini

🔐 *Perintah Khusus Administrator:*
• */admin <token>* : Otentikasi identitas sebagai Admin
• */balance* atau */saldo* : Cek saldo IDR & aset crypto di Indodax
• */panic* : EMERGENCY jual SEMUA posisi ke IDR seketika!
• */stop* : Hentikan sementara auto-trading
• */resume* atau */start* : Lanjutkan auto-trading otomatis
• */buy <koin> <nominalIdr>* : Beli koin manual (cth: /buy btc 100000)
• */sell <koin>* : Jual koin manual (cth: /sell btc)
• */risk <konservatif|seimbang|agresif>* : Ganti profil risiko
• */modal <nominal> [profil]* : Hitung & atur otomatis alokasi modal (cth: /modal 500000 seimbang)
• */mode <paper|live>* : Ganti mode trading

💡 *Tanya Jawab AI:*
Kirim pesan biasa tanpa tanda "/" untuk berdiskusi atau menanyakan analisis pasar langsung ke AI Asisten.`
        );
        break;

      case '/kenapa':
      case '/audit': {
        const symbolArg = args[0];
        let targetPos: PositionRecord | undefined;
        let targetTrade: any;

        if (symbolArg) {
          const clean = symbolArg.toLowerCase().replace('/', '').replace('_', '');
          const pair = clean.endsWith('idr') ? clean : `${clean}idr`;
          targetPos = db
            .prepare("SELECT * FROM positions WHERE (symbol = ? OR symbol = ?) AND status = 'open'")
            .get(pair, clean) as PositionRecord | undefined;
          if (!targetPos) {
            targetTrade = db
              .prepare("SELECT * FROM positions WHERE (symbol = ? OR symbol = ?) ORDER BY closed_at DESC LIMIT 1")
              .get(pair, clean);
          }
        } else {
          targetPos = db
            .prepare("SELECT * FROM positions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1")
            .get() as PositionRecord | undefined;
          if (!targetPos) {
            targetTrade = db
              .prepare("SELECT * FROM positions WHERE status = 'closed' ORDER BY closed_at DESC LIMIT 1")
              .get();
          }
        }

        if (targetPos) {
          const holdMinutes = targetPos.opened_at
            ? Math.max(1, Math.round((Date.now() - targetPos.opened_at) / 60000))
            : 0;
          const holdHours = (holdMinutes / 60).toFixed(1);
          await this.sendMessage(
            jid,
            `📋 *AUDIT & ALASAN POSISI AKTIF*
• Koin: *${targetPos.symbol.toUpperCase()}*
• Status: *SEDANG DI-HOLD* (${targetPos.pnl_percent >= 0 ? '+' : ''}${targetPos.pnl_percent.toFixed(2)}%)
• Durasi Hold: *${holdMinutes} menit (${holdHours} jam)*
• Harga Masuk: Rp ${targetPos.entry_price.toLocaleString('id-ID')}
• Harga Saat Ini: Rp ${targetPos.current_price.toLocaleString('id-ID')}
• Trailing Stop Level: Rp ${targetPos.trailing_stop_price.toLocaleString('id-ID')} (Kunci Profit)
• Alasan Entry: *${targetPos.exit_reason || 'Momentum breakout & konfirmasi AI Risk Evaluator'}*
• Safety Loop: *Tidak melanggar batas circuit breaker & grounded data.*`
          );
        } else if (targetTrade) {
          const holdMinutes =
            targetTrade.opened_at && targetTrade.closed_at
              ? Math.max(1, Math.round((targetTrade.closed_at - targetTrade.opened_at) / 60000))
              : targetTrade.opened_at
              ? Math.max(1, Math.round((Date.now() - targetTrade.opened_at) / 60000))
              : 0;
          const holdHours = (holdMinutes / 60).toFixed(1);
          await this.sendMessage(
            jid,
            `📋 *AUDIT POSISI TERAKHIR*
• Koin: *${targetTrade.symbol.toUpperCase()}*
• Status: *TELAH DITUTUP*
• PnL Akhir: *${targetTrade.pnl_percent >= 0 ? '+' : ''}${targetTrade.pnl_percent.toFixed(2)}% (Rp ${targetTrade.pnl_idr.toLocaleString('id-ID')})*
• Durasi Hold: *${holdMinutes} menit (${holdHours} jam)*
• Alasan Exit: *${targetTrade.exit_reason || 'Trailing stop loss tersentuh'}*`
          );
        } else {
          await this.sendMessage(
            jid,
            `📋 *AUDIT POSISI*\nSaat ini bot belum memiliki posisi aktif. Bot sedang memindai pasar mencari momentum aman sesuai profil risiko Anda.`
          );
        }
        break;
      }

      case '/risk': {
        const profileInput = (args[0] || '').toLowerCase();
        if (profileInput === 'konservatif' || profileInput === 'conservative') {
          applyRiskProfile('conservative');
          await this.sendMessage(
            jid,
            `🛡️ *PROFIL RISIKO DIUBAH: KONSERVATIF*
• Cocok untuk Pemula (Fokus Menjaga Modal)
• Alokasi: Rp 50.000 / trade (Maks 2 posisi)
• Fokus Koin: Hanya koin Likuid Utama (BTC, ETH, SOL, BNB, XRP)
• Trailing Stop: 1.5% (Proteksi ketat)
• Target TP 1: +3.0%
• Koin Listing Baru: DINONAKTIFKAN (Bebas resiko dump)`
          );
        } else if (profileInput === 'agresif' || profileInput === 'aggressive') {
          applyRiskProfile('aggressive');
          await this.sendMessage(
            jid,
            `⚡ *PROFIL RISIKO DIUBAH: AGRESIF*
• Alokasi: Rp 250.000 / trade (Maks 5 posisi)
• Fokus: Semua koin + Early Pump Radar + Memecoin
• Trailing Stop: 3.5%
• Target TP 1: +8.0%
• Batas Kerugian Harian: 8.0%`
          );
        } else if (profileInput === 'seimbang' || profileInput === 'balanced') {
          applyRiskProfile('balanced');
          await this.sendMessage(
            jid,
            `⚖️ *PROFIL RISIKO DIUBAH: SEIMBANG*
• Profil Standar Seimbang
• Alokasi: Rp 100.000 / trade (Maks 3 posisi)
• Fokus: Top 20 koin likuid + momentum filter
• Trailing Stop: 2.5%
• Target TP 1: +5.0%
• Batas Kerugian Harian: 5.0%`
          );
        } else {
          const currentProfile = getSetting('risk_profile', 'balanced');
          await this.sendMessage(
            jid,
            `⚙️ *PROFIL RISIKO SAAT INI: ${currentProfile.toUpperCase()}*
Gunakan: */risk <profil>*
Pilihan:
1. */risk konservatif* (Aman untuk pemula, no meme, max 2 koin besar)
2. */risk seimbang* (Standar momentum + TP 5%)
3. */risk agresif* (Maksimal momentum + radar listing baru)`
          );
        }
        break;
      }

      case '/modal': {
        const capitalInput = args[0]?.trim();
        const profileInput = (args[1]?.trim() || '').toLowerCase();

        if (!capitalInput) {
          const currentCap = parseFloat(getSetting('paper_idr_balance', '10000000'));
          const currentAlloc = parseFloat(getSetting('max_allocation_per_trade_idr', '100000'));
          const currentMaxTrades = getSetting('max_active_trades', '3');
          const currentProfile = getSetting('risk_profile', 'balanced');

          await this.sendMessage(
            jid,
            `💰 *PENGATURAN MODAL OTOMATIS (AUTO-SET)*
• Modal Terkonfigurasi: *Rp ${currentCap.toLocaleString('id-ID')}*
• Profil Risiko: *${currentProfile.toUpperCase()}*
• Alokasi per Koin: *Rp ${currentAlloc.toLocaleString('id-ID')}*
• Maksimal Koin Aktif: *${currentMaxTrades} Koin*

💡 *Cara Mengatur Ulang Modal via WhatsApp (Khusus Admin):*
Gunakan: */modal <nominal_idr> [konservatif|seimbang|agresif]*
Contoh:
• */modal 100000*
• */modal 500000 seimbang*
• */modal 2000000 konservatif*`
          );
          break;
        }

        // Helper to parse nominal like '500k', '1jt', '1.5jt', or raw numbers
        let cleanNum = capitalInput.toLowerCase().replace(/rp|\.|,/g, '');
        if (cleanNum.endsWith('k')) {
          cleanNum = String(parseFloat(cleanNum) * 1000);
        } else if (cleanNum.endsWith('jt') || cleanNum.endsWith('m')) {
          cleanNum = String(parseFloat(cleanNum) * 1000000);
        }
        const parsedCapital = parseFloat(cleanNum);

        if (isNaN(parsedCapital) || parsedCapital < 10000) {
          await this.sendMessage(
            jid,
            `⚠️ Nominal modal tidak valid. Minimum modal trading di Indodax adalah *Rp 10.000*.\nContoh: */modal 500000*`
          );
          break;
        }

        let targetProfile: 'conservative' | 'balanced' | 'aggressive' = 'balanced';
        if (profileInput.includes('konservatif') || profileInput.includes('conservative')) {
          targetProfile = 'conservative';
        } else if (profileInput.includes('agresif') || profileInput.includes('aggressive')) {
          targetProfile = 'aggressive';
        } else if (profileInput.includes('seimbang') || profileInput.includes('balanced')) {
          targetProfile = 'balanced';
        } else {
          targetProfile = (getSetting('risk_profile', 'balanced') as any) || 'balanced';
        }

        const plan = calculateCapitalAllocation(parsedCapital, targetProfile);

        // Apply settings
        setSetting('risk_profile', plan.profile);
        setSetting('paper_idr_balance', String(plan.capitalIdr));
        setSetting('max_allocation_per_trade_idr', String(plan.maxAllocationPerTradeIdr));
        setSetting('max_active_trades', String(plan.maxActiveTrades));
        setSetting('trailing_stop_percent', String(plan.trailingStopPercent));
        setSetting('daily_loss_limit_percent', String(plan.dailyLossLimitPercent));
        setSetting('slippage_tolerance_percent', String(plan.slippageTolerancePercent));
        setSetting('take_profit_target_1_percent', String(plan.takeProfitStep1Percent));
        setSetting('allow_new_listings', plan.allowNewListings ? '1' : '0');
        setSetting('allowed_coins_only', plan.allowedCoinsOnly);
        setSetting('min_24h_volume_idr', String(plan.minVolumeIdr));

        await this.sendMessage(
          jid,
          `✅ *MODAL BERHASIL DI-AUTO SET!*
• Total Modal: *Rp ${plan.capitalIdr.toLocaleString('id-ID')}*
• Profil: *${plan.profile.toUpperCase()}*
• Alokasi per Posisi: *Rp ${plan.maxAllocationPerTradeIdr.toLocaleString('id-ID')}*
• Maksimal Koin Aktif: *${plan.maxActiveTrades} Koin*
• Cadangan Kas Pengaman: *Rp ${plan.cashBufferIdr.toLocaleString('id-ID')} (${plan.cashBufferPercent}%)*
• Trailing Stop Loss: *${plan.trailingStopPercent}%*
• Target Take Profit: *${plan.takeProfitStep1Percent}%*
${plan.notes.length > 0 ? `\n📌 *Catatan:* ${plan.notes.join('\n')}` : ''}

Seluruh parameter trading telah disimpan dan aktif melindungi modal Anda.`
        );
        break;
      }

      case '/status': {
        const mode = getSetting('trading_mode', 'paper');
        const isActive = getSetting('is_auto_trading_active', '1') === '1';
        const positions = db.prepare("SELECT * FROM positions WHERE status = 'open'").all() as PositionRecord[];

        let posText = 'Tidak ada koin yang sedang di-hold.';
        if (positions.length > 0) {
          posText = positions
            .map(
              (p) =>
                `• *${p.symbol.toUpperCase()}* | Entry: Rp ${p.entry_price.toLocaleString('id-ID')} | Now: Rp ${p.current_price.toLocaleString('id-ID')} | PnL: ${p.pnl_percent >= 0 ? '+' : ''}${p.pnl_percent.toFixed(2)}%`
            )
            .join('\n');
        }

        await this.sendMessage(
          jid,
          `📊 *STATUS AI TRADING ENGINE*
• Status: ${isActive ? '🟢 AKTIF (Scanning & Trading)' : '⏸️ PAUSED'}
• Mode: ${mode.toUpperCase()} TRADING
• Koin Di-hold (${positions.length}):
${posText}`
        );
        break;
      }

      case '/balance':
      case '/saldo': {
        const mode = getSetting('trading_mode', 'paper');
        if (mode === 'paper') {
          const paperBal = parseFloat(getSetting('paper_idr_balance', '10000000'));
          await this.sendMessage(
            jid,
            `💰 *SALDO PORTOFOLIO (PAPER TRADING)*\n• Saldo IDR Virtual: Rp ${paperBal.toLocaleString('id-ID')}`
          );
        } else {
          try {
            const accInfo = await indodax.getAccountInfo();
            const idrBal = accInfo?.data?.balance?.idr || 0;
            await this.sendMessage(
              jid,
              `💰 *SALDO RESMI INDODAX*\n• Saldo IDR: Rp ${Number(idrBal).toLocaleString('id-ID')}`
            );
          } catch (e: any) {
            await this.sendMessage(jid, `⚠️ Gagal mengambil saldo Indodax: ${e.message}`);
          }
        }
        break;
      }

      case '/market':
      case '/scanner':
      case '/gainer': {
        try {
          const summaries = await indodax.getSummaries();
          const topGainers: Array<{ symbol: string; gain: number; last: number }> = [];

          for (const [key, t] of Object.entries(summaries.tickers || {})) {
            if (!key.endsWith('_idr')) continue;
            const low = parseFloat(t.low);
            const last = parseFloat(t.last);
            if (low > 0) {
              const gain = ((last - low) / low) * 100;
              topGainers.push({ symbol: key.replace('_idr', '').toUpperCase(), gain, last });
            }
          }
          topGainers.sort((a, b) => b.gain - a.gain);
          const top5 = topGainers.slice(0, 5);

          const textList = top5
            .map((g, i) => `${i + 1}. *${g.symbol}* : +${g.gain.toFixed(2)}% (Rp ${g.last.toLocaleString('id-ID')})`)
            .join('\n');

          await this.sendMessage(jid, `🚀 *TOP 5 GAINER INDODAX HARI INI*\n${textList}`);
        } catch (err: any) {
          await this.sendMessage(jid, `⚠️ Gagal memuat data pasar Indodax: ${err.message}`);
        }
        break;
      }

      case '/agents':
      case '/agent': {
        const sentiment = agentSwarm.getAggregatedSentiment();
        await this.sendMessage(
          jid,
          `🧠 *STATUS MULTI-AGENT SWARM*
• 10 Subagent Aktif (Konteks Terisolasi)
• Rata-rata Skor Sentimen Pasar: *${sentiment.averageSentiment > 0 ? '+' : ''}${sentiment.averageSentiment}* (-1.0 s/d +1.0)
• Peringatan Bahaya / Threat: *${sentiment.threatCount} terdeteksi*
• Koin Paling Banyak Dibahas: ${Object.keys(sentiment.coinSentiments).slice(0, 4).join(', ') || 'BTC, ETH, SOL'}`
        );
        break;
      }

      case '/pnl':
      case '/profit':
      case '/rekor':
      case '/pos':
      case '/posisi': {
        const stats = db.prepare(`
          SELECT
            COUNT(*) as total_trades,
            SUM(CASE WHEN pnl_percent >= 0 THEN 1 ELSE 0 END) as win_count,
            SUM(pnl_idr) as total_profit_idr
          FROM positions
          WHERE status = 'closed'
        `).get() as { total_trades: number; win_count: number; total_profit_idr: number | null };

        const winRate = stats.total_trades > 0 ? ((stats.win_count / stats.total_trades) * 100).toFixed(1) : '0';

        await this.sendMessage(
          jid,
          `📈 *LAPORAN PNL & REKOR TRADING*
• Total Posisi Ditutup: ${stats.total_trades}
• Win Rate: *${winRate}%* (${stats.win_count} Win / ${stats.total_trades - stats.win_count} Loss)
• Total Net Profit: *Rp ${(stats.total_profit_idr || 0).toLocaleString('id-ID')}*`
        );
        break;
      }

      case '/panic':
      case '/panic-sell': {
        const isConfirmed = args.length > 0 && args[0].toLowerCase() === 'confirm';
        if (!isConfirmed) {
          await this.sendMessage(
            jid,
            `⚠️ *KONFIRMASI LIKUIDASI DARURAT*\n\nPerintah ini akan menjual SELURUH koin posisi aktif ke IDR seketika dan menghentikan auto-trading.\n\nKetik */panic confirm* untuk mengeksekusi sekarang.`
          );
          break;
        }
        const closedCount = await tradingEngine.panicSellAll();
        await this.sendMessage(
          jid,
          `🚨 *EMERGENCY PANIC SELL BERHASIL DIJALANKAN*
• ${closedCount} posisi koin aktif telah dijual ke IDR seketika.
• Auto-trading otomatis dihentikan sementara demi mengamankan modal Anda.
• Ketik */resume* jika ingin mengaktifkan kembali.`
        );
        break;
      }

      case '/stop':
      case '/pause': {
        setSetting('is_auto_trading_active', '0');
        await this.sendMessage(jid, '⏸️ *Auto-Trading telah dihentikan (PAUSED).*');
        break;
      }

      case '/resume':
      case '/start': {
        setSetting('is_auto_trading_active', '1');
        await this.sendMessage(jid, '▶️ *Auto-Trading kembali diaktifkan (RESUMED).* AI memantau market 24/7.');
        break;
      }

      case '/mode': {
        const modeInput = (args[0] || '').toLowerCase();
        if (modeInput === 'live' || modeInput === 'paper') {
          setSetting('trading_mode', modeInput);
          await this.sendMessage(
            jid,
            `🔄 *MODE TRADING DIUBAH KE: ${modeInput.toUpperCase()}*\nBot sekarang beroperasi dalam mode *${modeInput.toUpperCase()}*.`
          );
        } else {
          const currentMode = getSetting('trading_mode', 'paper');
          await this.sendMessage(
            jid,
            `⚙️ *MODE TRADING SAAT INI: ${currentMode.toUpperCase()}*\nGunakan: */mode paper* atau */mode live*`
          );
        }
        break;
      }

      case '/buy': {
        const symbolInput = args[0];
        const nominalInput = parseFloat(args[1]);

        if (!symbolInput || isNaN(nominalInput) || nominalInput <= 0) {
          await this.sendMessage(
            jid,
            '❌ Format salah. Gunakan: */buy <simbol> <nominalIdr>*\nContoh: */buy btc 100000*'
          );
          break;
        }

        const cleanSymbol = symbolInput.toLowerCase().replace('/', '').replace('_', '');
        const pair = cleanSymbol.endsWith('idr') ? cleanSymbol : `${cleanSymbol}idr`;

        try {
          const ticker = await indodax.getTicker(pair);
          const price = parseFloat(ticker?.ticker?.last || '0');
          if (!price || price <= 0) {
            await this.sendMessage(jid, `❌ Simbol "${symbolInput}" tidak ditemukan di Indodax.`);
            break;
          }

          const amount = nominalInput / price;
          const mode = (getSetting('trading_mode', 'paper') as 'paper' | 'live');

          await tradingEngine.executeBuy(pair, price, amount, nominalInput, mode, 'Manual command via WhatsApp');

          await this.sendMessage(
            jid,
            `✅ *ORDER BUY DIEKSEKUSI*\n• Koin: *${pair.toUpperCase()}*\n• Harga: Rp ${price.toLocaleString('id-ID')}\n• Nominal: Rp ${nominalInput.toLocaleString('id-ID')}\n• Estimasi Koin: ${amount.toFixed(6)}\n• Mode: *${mode.toUpperCase()}*`
          );
        } catch (err: any) {
          await this.sendMessage(jid, `❌ Gagal eksekusi order buy: ${err.message}`);
        }
        break;
      }

      case '/sell': {
        const symbolInput = args[0];
        if (!symbolInput) {
          await this.sendMessage(jid, '❌ Format salah. Gunakan: */sell <simbol>*\nContoh: */sell btc*');
          break;
        }

        const cleanSymbol = symbolInput.toLowerCase().replace('/', '').replace('_', '');
        const pair = cleanSymbol.endsWith('idr') ? cleanSymbol : `${cleanSymbol}idr`;

        try {
          const pos = db
            .prepare("SELECT * FROM positions WHERE (symbol = ? OR symbol = ?) AND status = 'open'")
            .get(pair, cleanSymbol) as PositionRecord | undefined;

          if (!pos) {
            await this.sendMessage(jid, `❌ Tidak ada posisi terbuka untuk "${symbolInput.toUpperCase()}".`);
            break;
          }

          const ticker = await indodax.getTicker(pos.symbol);
          const currentPrice = parseFloat(ticker?.ticker?.last || '0') || pos.current_price;

          await tradingEngine.closePosition(pos, currentPrice, 'Manual sell command via WhatsApp');

          await this.sendMessage(
            jid,
            `✅ *ORDER SELL DIEKSEKUSI*\n• Koin: *${pos.symbol.toUpperCase()}*\n• Harga Jual: Rp ${currentPrice.toLocaleString('id-ID')}\n• Jumlah: ${pos.amount}\n• Mode: *${pos.mode.toUpperCase()}*`
          );
        } catch (err: any) {
          await this.sendMessage(jid, `❌ Gagal eksekusi order sell: ${err.message}`);
        }
        break;
      }

      default:
        await this.sendMessage(
          jid,
          `❓ Command "${cmd}" tidak dikenali. Ketik */help* untuk melihat daftar panduan, atau kirim pertanyaan biasa tanpa awalan "/" untuk berdiskusi dengan AI Asisten.`
        );
        break;
    }
  }

  // --- Conversational AI Mode with Full Trading System Context & Action Execution ---

  /**
   * Menghasilkan ringkasan komprehensif data portofolio, saldo, posisi aktif, dan sentimen pasar
   * sebagai konteks real-time untuk AI Assistant.
   */
  public async getFullTradingContext(isAdmin: boolean): Promise<string> {
    const mode = getSetting('trading_mode', 'paper');
    const isAutoTrading = getSetting('is_auto_trading_active', '1') === '1';
    const riskProfile = getSetting('risk_profile', 'balanced');
    const tradeAllocation = getSetting('trade_allocation_idr', '100000');
    const maxPositions = getSetting('max_open_positions', '3');
    const trailingStop = getSetting('trailing_stop_percent', '2.5');
    const takeProfit = getSetting('take_profit_1_percent', '5.0');
    const allowNewListings = getSetting('allow_new_listings', '1') === '1';

    // 1. Balance & Equity Calculation (active mode only, fee-aware)
    let balanceInfo = '';
    const activeMode: 'paper' | 'live' = mode === 'live' ? 'live' : 'paper';
    const positions = db.prepare(
      "SELECT * FROM positions WHERE status = 'open' AND mode = ?"
    ).all(activeMode) as PositionRecord[];

    if (!isAdmin) {
      balanceInfo = `- Mode: ${mode.toUpperCase()} TRADING
- Informasi Saldo & Portofolio: [Dilindungi - Khusus Akses Administrator]`;
    } else {
      try {
        const snapshot = await tradingEngine.getEquitySnapshot(activeMode);
        const floatingPnl = Math.round(snapshot.floatingPnlIdr);
        if (activeMode === 'paper') {
          balanceInfo = `- Mode: PAPER (Simulasi Uang Virtual)
- Saldo Kas IDR Tersedia: Rp ${snapshot.cashIdr.toLocaleString('id-ID')}
- Total Nilai Posisi Koin (net fee): Rp ${Math.round(snapshot.holdingsValueIdr).toLocaleString('id-ID')}
- Total Ekuitas Portofolio (Kas + Koin): Rp ${Math.round(snapshot.equityIdr).toLocaleString('id-ID')}
- Floating PnL Saat Ini: ${floatingPnl >= 0 ? '+' : ''}Rp ${Math.round(floatingPnl).toLocaleString('id-ID')}`;
        } else {
          balanceInfo = `- Mode: LIVE (Akun Riil Indodax)
- Saldo IDR Siap Pakai: Rp ${snapshot.cashFreeIdr.toLocaleString('id-ID')}
- Saldo IDR Tertahan (Dalam Order): Rp ${snapshot.cashLockedIdr.toLocaleString('id-ID')}
- Total Nilai Posisi Koin (net fee): Rp ${Math.round(snapshot.holdingsValueIdr).toLocaleString('id-ID')}
- Estimasi Total Ekuitas: Rp ${Math.round(snapshot.equityIdr).toLocaleString('id-ID')}`;
        }
      } catch (e: any) {
        balanceInfo = `- Mode: ${mode.toUpperCase()} (Gagal memuat data saldo/equity: ${e.message})`;
      }
    }

    // 2. Open Positions Details
    let positionsDetail = '';
    if (!isAdmin) {
      positionsDetail = positions.length > 0
        ? `Terdapat ${positions.length} koin aktif yang sedang dipantau oleh Autonomous Engine.`
        : 'Tidak ada posisi koin terbuka saat ini.';
    } else if (positions.length > 0) {
      positionsDetail = positions.map((p, idx) => {
        const holdMinutes = Math.max(1, Math.round((Date.now() - p.opened_at) / 60000));
        const pnlSign = p.pnl_percent >= 0 ? '+' : '';
        const curPnlIdr = Math.round((p.current_price - p.entry_price) * p.amount);
        return `${idx + 1}. [${p.symbol.toUpperCase()}]
   • Harga Beli: Rp ${p.entry_price.toLocaleString('id-ID')} | Harga Sekarang: Rp ${p.current_price.toLocaleString('id-ID')}
   • Jumlah: ${p.amount} koin (Nilai Beli: Rp ${p.initial_cost_idr.toLocaleString('id-ID')})
   • Floating PnL: ${pnlSign}${p.pnl_percent.toFixed(2)}% (${pnlSign}Rp ${curPnlIdr.toLocaleString('id-ID')})
   • Trailing Stop (Kunci Profit): Rp ${p.trailing_stop_price.toLocaleString('id-ID')}
   • Durasi Hold: ${holdMinutes} menit
   • Alasan Entry: ${p.exit_reason || 'Momentum breakout & konfirmasi AI'}`;
      }).join('\n');
    } else {
      positionsDetail = 'Tidak ada posisi koin terbuka saat ini (100% kas IDR aman & tidak ada risiko floating loss).';
    }

    // 3. Trade Performance & History (Today & Recent)
    let performanceInfo = '';
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayTrades = db.prepare(`
        SELECT COUNT(*) as count,
               COALESCE(SUM(CASE WHEN pnl_idr > 0 THEN 1 ELSE 0 END), 0) as wins,
               COALESCE(SUM(CASE WHEN pnl_idr < 0 THEN 1 ELSE 0 END), 0) as losses,
               COALESCE(SUM(pnl_idr), 0) as totalPnl
        FROM trades
        WHERE closed_at >= ?
      `).get(startOfDay.getTime()) as { count: number; wins: number; losses: number; totalPnl: number };

      const recentTrades = db.prepare(`
        SELECT symbol, pnl_percent, pnl_idr, exit_reason, closed_at
        FROM trades
        ORDER BY closed_at DESC
        LIMIT 3
      `).all() as Array<{ symbol: string; pnl_percent: number; pnl_idr: number; exit_reason: string; closed_at: number }>;

      const recentSummary = recentTrades.length > 0
        ? recentTrades.map(t => `${t.symbol.toUpperCase()} (${t.pnl_percent >= 0 ? '+' : ''}${t.pnl_percent.toFixed(1)}%, Rp ${t.pnl_idr.toLocaleString('id-ID')})`).join(', ')
        : 'Belum ada trade yang ditutup hari ini.';

      performanceInfo = `- Performa Hari Ini: ${todayTrades.count} trade selesai (${todayTrades.wins} Menang, ${todayTrades.losses} Kalah)
- Realized Net PnL Hari Ini: ${todayTrades.totalPnl >= 0 ? '+' : ''}Rp ${Math.round(todayTrades.totalPnl).toLocaleString('id-ID')}
- Trade Terakhir: ${recentSummary}`;
    } catch {}

    // 4. Multi-Agent Swarm & Market Intelligence
    const sentiment = agentSwarm.getAggregatedSentiment();
    const sentimentDesc = sentiment.averageSentiment > 0.3
      ? 'Bullish / Optimis'
      : sentiment.averageSentiment < -0.2
      ? 'Bearish / Waspada'
      : 'Netral / Konsolidasi';

    // 5. BTC Market Regime
    let btcRegime = 'Normal';
    try {
      const btcHigh = parseFloat(getSetting('btc_high_24h', '0'));
      const btcCurrent = parseFloat(getSetting('btc_current_price', '0'));
      if (btcHigh > 0 && btcCurrent > 0) {
        const dropPercent = ((btcHigh - btcCurrent) / btcHigh) * 100;
        btcRegime = `Harga Rp ${btcCurrent.toLocaleString('id-ID')} (High: Rp ${btcHigh.toLocaleString('id-ID')}, Koreksi: -${dropPercent.toFixed(1)}%)`;
      }
    } catch {}

    // 6. Lessons Learned (Closed Loop Memory)
    let lessonsList = 'Belum ada catatan evaluasi trade.';
    try {
      const recentLessons = db.prepare(`
        SELECT symbol, result, lesson FROM lessons_learned ORDER BY timestamp DESC LIMIT 3
      `).all() as Array<{ symbol: string; result: string; lesson: string }>;
      if (recentLessons.length > 0) {
        lessonsList = recentLessons.map((l, i) => `${i + 1}. [${l.symbol.toUpperCase()}] ${l.lesson}`).join('\n');
      }
    } catch {}

    return `=== STATUS SISTEM & PORTOFOLIO TRADING REAL-TIME ===
1. KONFIGURASI ENGINE:
- Status Auto-Trading: ${isAutoTrading ? 'AKTIF (Berjalan 24/7 memantau pasar)' : 'DIHENTIKAN SEMENTARA (PAUSED)'}
- Profil Risiko: ${riskProfile.toUpperCase()} (Alokasi: Rp ${Number(tradeAllocation).toLocaleString('id-ID')}/trade, Max ${maxPositions} Posisi, Trailing Stop ${trailingStop}%, TP Target ${takeProfit}%, Koin Baru Listing: ${allowNewListings ? 'Aktif' : 'Nonaktif'})
- Role Pengirim Saat Ini: ${isAdmin ? 'ADMINISTRATOR UTAMA (Berhak eksekusi perintah trading & kontrol bot)' : 'USER PUBLIK / TAMU (Akses melihat data & konsultasi)'}

2. SALDO & EKUITAS:
${balanceInfo}

3. POSISI KOIN TERBUKA (HOLDING):
${positionsDetail}

4. HISTORI & PERFORMA:
${performanceInfo}

5. INTELIJEN PASAR & SENTIMEN SWARM:
- Skor Sentimen Pasar Global: ${sentiment.averageSentiment > 0 ? '+' : ''}${sentiment.averageSentiment} (${sentimentDesc})
- Peringatan Ancaman / Threat: ${sentiment.threatCount} peringatan terdeteksi
- Rezim Pasar BTC: ${btcRegime}

6. MEMORI SELF-LEARNING (EVALUASI KESALAHAN/PELAJARAN LALU):
${lessonsList}
===================================================`;
  }

  /**
   * Mendeteksi intent tindakan langsung dari teks pesan jika AI tidak menyertakan blok action
   */
  public detectFallbackActionIntent(userMessage: string): { action: string; params: any } | null {
    const lower = userMessage.toLowerCase().trim();

    // 1. Emergency Panic Sell
    if (
      lower.includes('panic sell') ||
      lower.includes('jual semua koin') ||
      lower.includes('jual semua posisi') ||
      lower.includes('tutup semua posisi') ||
      lower.includes('emergency sell')
    ) {
      return { action: 'PANIC_SELL', params: {} };
    }

    // 2. Stop / Pause Auto-trading
    if (
      lower.match(/\b(stop|hentikan|pause|matikan|nonaktifkan)\b.*(?:bot|trading|auto)/i) ||
      lower.match(/\b(?:bot|trading|auto).*(?:stop|hentikan|pause|matikan|nonaktifkan)\b/i) ||
      lower === 'stop bot' ||
      lower === 'pause bot' ||
      lower === 'matikan bot'
    ) {
      return { action: 'STOP_AUTOTRADING', params: {} };
    }

    // 3. Resume / Start Auto-trading
    if (
      lower.match(/\b(start|lanjutkan|resume|nyalakan|aktifkan|jalankan)\b.*(?:bot|trading|auto)/i) ||
      lower.match(/\b(?:bot|trading|auto).*(?:start|lanjutkan|resume|nyalakan|aktifkan|jalankan)\b/i) ||
      lower === 'start bot' ||
      lower === 'resume bot' ||
      lower === 'nyalakan bot'
    ) {
      return { action: 'RESUME_AUTOTRADING', params: {} };
    }

    // 4. Change Risk Profile
    if (lower.includes('konservatif') && (lower.includes('risiko') || lower.includes('resiko') || lower.includes('profil') || lower.includes('ubah') || lower.includes('ganti') || lower.includes('set'))) {
      return { action: 'SET_RISK_PROFILE', params: { profile: 'conservative' } };
    }
    if (lower.includes('agresif') && (lower.includes('risiko') || lower.includes('resiko') || lower.includes('profil') || lower.includes('ubah') || lower.includes('ganti') || lower.includes('set'))) {
      return { action: 'SET_RISK_PROFILE', params: { profile: 'aggressive' } };
    }
    if (lower.includes('seimbang') && (lower.includes('risiko') || lower.includes('resiko') || lower.includes('profil') || lower.includes('ubah') || lower.includes('ganti') || lower.includes('set'))) {
      return { action: 'SET_RISK_PROFILE', params: { profile: 'balanced' } };
    }

    // 5. Change Trading Mode
    if (lower.includes('mode live') || lower.includes('pindah ke live') || lower.includes('ganti ke live') || lower.includes('ubah ke live')) {
      return { action: 'SET_TRADING_MODE', params: { mode: 'live' } };
    }
    if (lower.includes('mode paper') || lower.includes('pindah ke paper') || lower.includes('ganti ke paper') || lower.includes('ubah ke paper')) {
      return { action: 'SET_TRADING_MODE', params: { mode: 'paper' } };
    }

    // 6. Manual Buy: e.g. "beli btc 50000", "belikan eth 100k", "beli sol sebesar 100000"
    const buyMatch = lower.match(/\bbeli(?:kan)?\s+([a-zA-Z0-9]+)\s+(?:sebesar\s+|sejumlah\s+|nominal\s+|rp\s*|sebesar\s*rp\s*)?(\d+(?:\.\d+)?)\s*(k|rb|ribu|jt|juta)?\b/i);
    if (buyMatch) {
      const symbol = buyMatch[1];
      let num = parseFloat(buyMatch[2]);
      const unit = (buyMatch[3] || '').toLowerCase();
      if (unit === 'k' || unit === 'rb' || unit === 'ribu') num *= 1000;
      if (unit === 'jt' || unit === 'juta') num *= 1000000;
      if (num > 0) {
        return { action: 'BUY_COIN', params: { symbol, amountIdr: num } };
      }
    }

    // 7. Manual Sell: e.g. "jual btc", "close btc", "tutup posisi eth"
    const sellMatch = lower.match(/\b(?:jual|close|tutup\s+posisi)\s+([a-zA-Z0-9]+)\b/i);
    if (sellMatch && !lower.includes('semua')) {
      return { action: 'SELL_COIN', params: { symbol: sellMatch[1] } };
    }

    return null;
  }

  /**
   * Eksekusi aksi sistem trading berdasarkan instruksi AI Assistant
   */
  // --- Two-Step Confirmation for Destructive AI Actions ---
  // The conversational agent can emit action blocks from free-form chat. An
  // LLM misread or a spoofed admin session must never move real funds
  // directly: risky actions arm a pending confirmation and require the admin
  // to reply with a 6-digit code within 5 minutes.

  private static readonly DESTRUCTIVE_AI_ACTIONS = new Set([
    'RESUME_AUTOTRADING',
    'SET_RISK_PROFILE',
    'SET_TRADING_MODE',
    'BUY_COIN',
    'SELL_COIN',
    'PANIC_SELL',
  ]);

  private static readonly CONFIRMATION_TTL_MS = 5 * 60 * 1000;

  private pendingAiConfirmations = new Map<
    string,
    { action: string; params: any; code: string; issuedAt: number }
  >();

  private static readonly ACTION_LABELS: Record<string, string> = {
    RESUME_AUTOTRADING: 'mengaktifkan kembali auto-trading',
    SET_RISK_PROFILE: 'mengubah profil risiko',
    SET_TRADING_MODE: 'mengubah mode trading (paper/live)',
    BUY_COIN: 'membeli koin',
    SELL_COIN: 'menjual posisi koin',
    PANIC_SELL: 'melikuidasi SEMUA posisi ke IDR',
  };

  private async issueAiActionConfirmation(jid: string, act: string, params: any): Promise<string> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    // One pending action per chat: a newer request replaces the older one.
    this.pendingAiConfirmations.set(jid, { action: act, params, code, issuedAt: Date.now() });
    const label = WhatsAppBotService.ACTION_LABELS[act] || act.toLowerCase();
    return [
      '🔐 *KONFIRMASI DUA LANGKAH*',
      '',
      `Aksi *${act}* (${label}) tergolong aksi berisiko dan wajib dikonfirmasi.`,
      '',
      `Balas pesan ini dengan kode: *${code}*`,
      `_Kode berlaku 5 menit. Balas apa pun selain kode untuk membatalkan._`,
    ].join('\n');
  }

  /**
   * Consumes a pending confirmation if `message` is a 6-digit code. Returns
   * null when nothing is pending or the message is not a code (letting the
   * AI chat flow handle it). Executed here, OUTSIDE the LLM, so the model
   * can never bypass or fabricate the second factor.
   */
  public async tryConsumeAiConfirmation(jid: string, message: string, isAdmin: boolean): Promise<string | null> {
    const pending = this.pendingAiConfirmations.get(jid);
    if (!pending) return null;
    const trimmed = (message || '').trim();
    if (!/^\d{6}$/.test(trimmed)) return null;

    this.pendingAiConfirmations.delete(jid);

    if (Date.now() - pending.issuedAt > WhatsAppBotService.CONFIRMATION_TTL_MS) {
      return `⌛ *Kode kedaluwarsa.* Aksi *${pending.action}* dibatalkan. Minta ulang bila masih ingin mengeksekusi.`;
    }
    if (trimmed !== pending.code) {
      return `❌ *Kode salah.* Aksi *${pending.action}* dibatalkan. Minta ulang bila masih ingin mengeksekusi.`;
    }
    if (!isAdmin) {
      return '⚠️ *Sesi admin berakhir.* Aksi dibatalkan. Autentikasi ulang dengan */admin <token>* lalu minta ulang aksinya.';
    }

    return this.runAiAction(pending.action, pending.params);
  }

  public async executeAiAction(actionName: string, params: any, isAdmin: boolean, jid?: string): Promise<string> {
    const act = (actionName || '').toUpperCase().trim();

    // Guard: Hanya administrator yang boleh mengubah status atau mengeksekusi order
    if (!isAdmin) {
      return `⚠️ *Akses Tindakan Ditolak*\nPermintaan tindakan *${act}* tidak dapat dieksekusi karena nomor/akun WhatsApp Anda belum terdaftar sebagai Administrator Utama.\n\n💡 *Otentikasi Admin:*\nKetik */admin <admin_access_token>* untuk memverifikasi hak akses admin.`;
    }

    if (jid && WhatsAppBotService.DESTRUCTIVE_AI_ACTIONS.has(act)) {
      return this.issueAiActionConfirmation(jid, act, params);
    }

    return this.runAiAction(act, params);
  }

  private async runAiAction(act: string, params: any): Promise<string> {
    try {
      switch (act) {
        case 'STOP_AUTOTRADING': {
          setSetting('is_auto_trading_active', '0');
          return '⏸️ *AKSI BERHASIL*: Auto-Trading telah dihentikan sementara (PAUSED). Bot tidak akan membuka posisi baru.';
        }

        case 'RESUME_AUTOTRADING': {
          setSetting('is_auto_trading_active', '1');
          return '▶️ *AKSI BERHASIL*: Auto-Trading kembali diaktifkan (RESUMED). AI memantau market 24/7.';
        }

        case 'SET_RISK_PROFILE': {
          const profile = (params?.profile || '').toLowerCase();
          if (profile === 'conservative' || profile === 'konservatif') {
            applyRiskProfile('conservative');
            return '🛡️ *AKSI BERHASIL*: Profil risiko diubah ke *KONSERVATIF* (Rp 50k/trade, Max 2 posisi, Trailing Stop 1.5%, koin listing baru dinonaktifkan).';
          } else if (profile === 'aggressive' || profile === 'agresif') {
            applyRiskProfile('aggressive');
            return '⚡ *AKSI BERHASIL*: Profil risiko diubah ke *AGRESIF* (Rp 250k/trade, Max 5 posisi, Trailing Stop 3.5%, memecoin & listing baru aktif).';
          } else if (profile === 'balanced' || profile === 'seimbang') {
            applyRiskProfile('balanced');
            return '⚖️ *AKSI BERHASIL*: Profil risiko diubah ke *SEIMBANG* (Rp 100k/trade, Max 3 posisi, Trailing Stop 2.5%).';
          } else {
            return `⚠️ Profil risiko "${profile}" tidak valid. Pilihan: *konservatif*, *seimbang*, atau *agresif*.`;
          }
        }

        case 'SET_TRADING_MODE': {
          const mode = (params?.mode || '').toLowerCase();
          if (mode === 'live' || mode === 'paper') {
            setSetting('trading_mode', mode);
            return `🔄 *AKSI BERHASIL*: Mode trading berhasil diubah ke *${mode.toUpperCase()}*.`;
          }
          return `⚠️ Mode trading "${mode}" tidak valid. Pilihan: *paper* atau *live*.`;
        }

        case 'BUY_COIN': {
          const symbolInput = String(params?.symbol || '').trim();
          const amountIdr = Number(params?.amountIdr || params?.nominalIdr || 0);

          if (!symbolInput || isNaN(amountIdr) || amountIdr <= 0) {
            return `❌ Parameter beli tidak valid. Tentukan koin dan nominal IDR (misal: "beli btc 100000").`;
          }

          const cleanSymbol = symbolInput.toLowerCase().replace('/', '').replace('_', '');
          const pair = cleanSymbol.endsWith('idr') ? cleanSymbol : `${cleanSymbol}idr`;

          const ticker = await indodax.getTicker(pair);
          const currentPrice = parseFloat(ticker?.ticker?.last || '0');
          if (currentPrice <= 0) {
            return `❌ Gagal mengambil harga live dari Indodax untuk pair ${pair.toUpperCase()}.`;
          }

          const amount = amountIdr / currentPrice;
          const mode = (getSetting('trading_mode', 'paper') === 'live' ? 'live' : 'paper') as 'paper' | 'live';
          const success = await tradingEngine.executeBuy(
            pair,
            currentPrice,
            amount,
            amountIdr,
            mode,
            'Order beli dieksekusi melalui instruksi AI Assistant'
          );

          if (success) {
            return `✅ *AKSI BERHASIL: ORDER BUY DIEKSEKUSI*\n• Koin: *${pair.toUpperCase()}*\n• Nominal: Rp ${amountIdr.toLocaleString('id-ID')}\n• Harga Eksekusi: Rp ${currentPrice.toLocaleString('id-ID')}\n• Estimasi Jumlah: ${amount.toFixed(6)} koin\n• Mode: *${mode.toUpperCase()}*`;
          } else {
            return `❌ *Order Beli Gagal*: Saldo tidak mencukupi atau nominal di bawah batas minimum transaksi bursa.`;
          }
        }

        case 'SELL_COIN': {
          const symbolInput = String(params?.symbol || '').trim();
          if (!symbolInput) {
            return `❌ Tentukan nama koin yang ingin dijual (misal: "jual btc").`;
          }

          const clean = symbolInput.toLowerCase().replace('/', '').replace('_', '');
          const pair = clean.endsWith('idr') ? clean : `${clean}idr`;

          const pos = db.prepare("SELECT * FROM positions WHERE (symbol = ? OR symbol = ?) AND status = 'open'").get(pair, clean) as PositionRecord | undefined;
          if (!pos) {
            return `❌ Tidak ada posisi terbuka untuk koin *${pair.toUpperCase()}* saat ini.`;
          }

          const ticker = await indodax.getTicker(pos.symbol);
          const currentPrice = parseFloat(ticker?.ticker?.last || '0') || pos.current_price;
          const closed = await tradingEngine.closePosition(pos, currentPrice, 'Order sell dieksekusi melalui instruksi AI Assistant');

          if (closed) {
            return `✅ *AKSI BERHASIL: ORDER SELL DIEKSEKUSI*\n• Koin: *${pos.symbol.toUpperCase()}*\n• Harga Jual: Rp ${currentPrice.toLocaleString('id-ID')}\n• Jumlah: ${pos.amount}\n• Mode: *${pos.mode.toUpperCase()}*`;
          } else {
            return `❌ *Order Jual Gagal*: Batal menutup posisi di bursa.`;
          }
        }

        case 'PANIC_SELL': {
          const closedCount = await tradingEngine.panicSellAll();
          return `🚨 *EMERGENCY PANIC SELL BERHASIL*\n• Telah melikuidasi *${closedCount} posisi koin* ke saldo kas IDR.\n• Auto-trading otomatis dihentikan sementara (PAUSED) demi mengamankan modal Anda.`;
        }

        default:
          return `⚠️ Aksi "${act}" tidak dikenali oleh sistem.`;
      }
    } catch (actErr: any) {
      return `❌ Terjadi kesalahan saat mengeksekusi aksi ${act}: ${actErr.message}`;
    }
  }

  // --- Conversational AI Mode (Answers Questions with Trading Context & Natural Action Execution) ---

  public async handleAiChat(jid: string, userMessage: string, isAdmin?: boolean) {
    const effectiveIsAdmin = isAdmin !== undefined ? isAdmin : this.isSenderAdmin(jid);
    const whatsappModel = getSetting('whatsapp_model', '');

    try {
      // 0. Confirmation-code consumption happens OUTSIDE the LLM: a pending
      // destructive action executes only when the admin replies with the code.
      const confirmationResult = await this.tryConsumeAiConfirmation(jid, userMessage, effectiveIsAdmin);
      if (confirmationResult !== null) {
        await this.sendMessage(jid, confirmationResult);
        return;
      }

      const fullTradingContext = await this.getFullTradingContext(effectiveIsAdmin);

      const { prompt: systemPrompt, version } = buildWhatsappSystemPrompt(fullTradingContext);

      const reply = await aiClient.complete({
        model: whatsappModel || undefined,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        agentCaller: 'whatsapp',
        promptVersion: version,
      });

      // 1. Ekstraksi blok action dari jawaban AI
      let cleanReply = reply;
      let detectedAction: { action: string; params: any } | null = null;

      const actionBlockMatch = reply.match(/```(?:action|json)?\s*([\s\S]*?)\s*```/);
      if (actionBlockMatch) {
        try {
          const parsed = JSON.parse(actionBlockMatch[1]);
          if (parsed && parsed.action) {
            detectedAction = parsed;
            cleanReply = reply.replace(actionBlockMatch[0], '').trim();
          }
        } catch {
          // Abaikan jika bukan JSON action valid
        }
      }

      // 2. Fallback: jika AI lupa menyertakan blok action tapi pesan user eksplisit meminta tindakan
      if (!detectedAction) {
        detectedAction = this.detectFallbackActionIntent(userMessage);
      }

      // 3. Eksekusi aksi jika terdeteksi (aksi berisiko memicu konfirmasi 2-langkah)
      let actionResultText = '';
      if (detectedAction) {
        actionResultText = await this.executeAiAction(detectedAction.action, detectedAction.params, effectiveIsAdmin, jid);
      }

      let finalMessage = cleanReply;
      if (actionResultText) {
        finalMessage = cleanReply ? `${cleanReply}\n\n${actionResultText}` : actionResultText;
      }

      await this.sendMessage(jid, finalMessage);
    } catch (err: any) {
      await this.sendMessage(jid, `Mohon maaf, AI Assistant sedang offline: ${err.message}`);
    }
  }

  // --- Notification Broadcasts (Trade Alerts, Emergency API Failover, Startup) ---

  /**
   * Resolves all valid destination JIDs for administrator notifications.
   * Handles LID, phone number JIDs, and dynamically paired admins.
   */
  public async getAdminJids(): Promise<string[]> {
    const adminNumber = getSetting('whatsapp_admin_number', '').trim();
    const adminLid = getSetting('whatsapp_admin_lid', '').trim();

    const targets = new Set<string>();

    if (this.lastAdminJid) {
      targets.add(this.lastAdminJid);
    }

    const rawTokens = `${adminNumber},${adminLid}`
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    for (const token of rawTokens) {
      if (token.includes('@')) {
        targets.add(token);
      } else {
        const digits = token.replace(/\D/g, '');
        if (!digits) continue;
        if (digits.length >= 15 || digits.startsWith('11189')) {
          targets.add(`${digits}@lid`);
        } else {
          const norm = digits.startsWith('0') ? '62' + digits.slice(1) : digits;
          targets.add(`${norm}@s.whatsapp.net`);
        }
      }
    }

    return Array.from(targets);
  }

  public async sendAlert(message: string) {
    const channel = getSetting('bot_notification_channel', 'both');
    const waEnabled = getSetting('whatsapp_enabled', '1') !== '0';
    if (channel === 'telegram_only' || channel === 'none' || !waEnabled) return;

    if (!this.sock || !this.isConnected) return;
    const jids = await this.getAdminJids();
    if (jids.length === 0) {
      console.log('[WhatsApp] Notifikasi tidak terkirim: Nomor/LID admin belum terdaftar.');
      return;
    }

    for (const jid of jids) {
      await this.sendMessage(jid, message);
    }
  }

  public async sendMessage(jid: string, text: string) {
    if (!this.sock) return;
    try {
      await this.sock.sendMessage(jid, { text });
    } catch (err) {
      console.error(`Gagal mengirim pesan WhatsApp ke ${jid}:`, err);
    }
  }
}

export const whatsappService = new WhatsAppBotService();
