import crypto from 'crypto';
import { getSetting, setSetting } from '../../db/index.js';
import { whatsappService } from '../whatsapp/index.js';
import { telegramService } from '../telegram/index.js';

export type RotationMode = 'fixed' | 'on_startup' | 'interval';
export type RotationUnit = 'minutes' | 'hours' | 'days';

export interface TokenRotationConfig {
  mode: RotationMode;
  intervalValue: number;
  intervalUnit: RotationUnit;
  lastRotatedAt: number;
  nextRotationAt: number | null;
  currentToken: string;
}

export type TokenRotateCallback = (newToken: string, reason: string) => void | Promise<void>;

/**
 * Melakukan perbandingan dua token secara constant-time menggunakan SHA-256 dan timingSafeEqual
 * untuk mencegah serangan timing attack (side-channel attack).
 */
export function secureCompareTokens(
  provided: string | undefined | null,
  expected: string | undefined | null
): boolean {
  if (!provided || !expected) return false;
  const p = provided.trim();
  const e = expected.trim();
  if (!p || !e) return false;

  const h1 = crypto.createHash('sha256').update(p).digest();
  const h2 = crypto.createHash('sha256').update(e).digest();
  return crypto.timingSafeEqual(h1, h2);
}

/**
 * Admin access is fail-closed: an empty configured token never grants access.
 */
export function isAuthenticatedAdminToken(
  configuredToken: string | undefined | null,
  providedToken: string | undefined | null
): boolean {
  const configured = (configuredToken || '').trim();
  if (!configured) return false;
  return secureCompareTokens(providedToken, configured);
}

export class AdminTokenRotationService {
  private timer: NodeJS.Timeout | null = null;
  private callbacks: TokenRotateCallback[] = [];

  /**
   * Menghasilkan token acak heksadesimal 32 karakter (16 bytes) dengan entropi tinggi
   */
  public generateSecureToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Menghitung durasi milidetik berdasarkan nilai dan satuan waktu
   */
  public calculateIntervalMs(value: number, unit: RotationUnit): number {
    const safeValue = Math.max(1, isNaN(value) ? 1 : value);
    switch (unit) {
      case 'minutes':
        return safeValue * 60 * 1000;
      case 'hours':
        return safeValue * 60 * 60 * 1000;
      case 'days':
      default:
        return safeValue * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Mengambil status konfigurasi rotasi token saat ini
   */
  public getConfig(): TokenRotationConfig {
    const mode = (getSetting('admin_token_rotation_mode', 'fixed') as RotationMode) || 'fixed';
    const intervalValue = Math.max(1, parseInt(getSetting('admin_token_rotation_interval_value', '1'), 10) || 1);
    const intervalUnit = (getSetting('admin_token_rotation_interval_unit', 'days') as RotationUnit) || 'days';
    
    let lastRotatedAt = parseInt(getSetting('admin_token_last_rotated_at', '0'), 10);
    if (!lastRotatedAt || isNaN(lastRotatedAt)) {
      lastRotatedAt = Date.now();
      setSetting('admin_token_last_rotated_at', String(lastRotatedAt));
    }

    const currentToken = getSetting('admin_access_token', '').trim();

    let nextRotationAt: number | null = null;
    if (mode === 'interval') {
      const intervalMs = this.calculateIntervalMs(intervalValue, intervalUnit);
      nextRotationAt = lastRotatedAt + intervalMs;
    }

    return {
      mode: ['fixed', 'on_startup', 'interval'].includes(mode) ? mode : 'fixed',
      intervalValue,
      intervalUnit: ['minutes', 'hours', 'days'].includes(intervalUnit) ? intervalUnit : 'days',
      lastRotatedAt,
      nextRotationAt,
      currentToken,
    };
  }

  /**
   * Memperbarui konfigurasi rotasi token ke SQLite settings
   */
  public saveConfig(config: {
    mode?: RotationMode;
    intervalValue?: number;
    intervalUnit?: RotationUnit;
  }): TokenRotationConfig {
    if (config.mode && ['fixed', 'on_startup', 'interval'].includes(config.mode)) {
      setSetting('admin_token_rotation_mode', config.mode);
    }
    if (typeof config.intervalValue === 'number' && config.intervalValue >= 1) {
      setSetting('admin_token_rotation_interval_value', String(Math.floor(config.intervalValue)));
    }
    if (config.intervalUnit && ['minutes', 'hours', 'days'].includes(config.intervalUnit)) {
      setSetting('admin_token_rotation_interval_unit', config.intervalUnit);
    }

    return this.getConfig();
  }

  /**
   * Mendaftarkan callback saat token berhasil dirotasi
   */
  public onRotate(cb: TokenRotateCallback): void {
    this.callbacks.push(cb);
  }

  /**
   * Melakukan rotasi token admin secara instan:
   * 1. Generate token baru
   * 2. Simpan ke database
   * 3. Cetak banner di terminal
   * 4. Kirim alert ke WhatsApp & Telegram
   * 5. Panggil registered callbacks (seperti WebSocket broadcast)
   */
  public async rotateToken(
    reason: string,
    options: { sendAlerts?: boolean } = { sendAlerts: true }
  ): Promise<{ token: string; rotatedAt: number }> {
    const newToken = this.generateSecureToken();
    const now = Date.now();

    setSetting('admin_access_token', newToken);
    setSetting('admin_token_last_rotated_at', String(now));

    const dateStr = new Date(now).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    // 1. Tampilkan di terminal server dengan jelas
    console.log(`\n======================================================`);
    console.log(`🔄 [ADMIN ACCESS TOKEN ROTATED]`);
    console.log(`📌 Alasan   : ${reason}`);
    if (process.stdout.isTTY) {
      console.log(`🔐 TOKEN BARU: ${newToken}`);
      console.log(`   (Gunakan token baru ini untuk otentikasi dashboard & API)`);
    } else {
      console.log('🔐 TOKEN BARU: disembunyikan karena log non-interaktif (jalankan `npm run admin:token`).');
    }
    console.log(`🕒 Waktu    : ${dateStr}`);
    console.log(`======================================================\n`);

    // 2. Kirim pesan notifikasi ke WhatsApp dan Telegram jika diaktifkan
    if (options.sendAlerts !== false) {
      const alertMsg =
        `🔐 *[ROTASI ADMIN ACCESS TOKEN]*\n\n` +
        `📌 *Alasan:* ${reason}\n` +
        `🕒 *Waktu:* ${dateStr}\n\n` +
        `⚠️ *Token lama sudah tidak berlaku.* Token baru sengaja TIDAK dikirim melalui chat. ` +
        `Ambil token baru langsung di server dengan perintah \`npm run admin:token\`.`;

      try {
        await whatsappService.sendAlert(alertMsg);
      } catch (err: any) {
        console.warn('[AdminTokenRotation] Gagal mengirim alert ke WhatsApp:', err?.message || err);
      }

      try {
        await telegramService.sendAlert(alertMsg);
      } catch (err: any) {
        console.warn('[AdminTokenRotation] Gagal mengirim alert ke Telegram:', err?.message || err);
      }
    }

    // 3. Jalankan event callbacks (WebSocket, log, etc)
    for (const callback of this.callbacks) {
      try {
        await callback(newToken, reason);
      } catch (err: any) {
        console.warn('[AdminTokenRotation] Error pada rotate callback:', err?.message || err);
      }
    }

    return { token: newToken, rotatedAt: now };
  }

  /**
   * Menangani startup server: jika mode 'on_startup', lakukan rotasi token segera
   */
  public async handleStartup(): Promise<{ rotated: boolean; token: string }> {
    const config = this.getConfig();
    if (config.mode === 'on_startup') {
      const result = await this.rotateToken('Startup Server Baru / Program Dinyalakan');
      return { rotated: true, token: result.token };
    }
    return { rotated: false, token: config.currentToken };
  }

  /**
   * Memeriksa apakah interval waktu rotasi berkala sudah tercapai
   */
  public async checkInterval(): Promise<boolean> {
    const config = this.getConfig();
    if (config.mode !== 'interval') {
      return false;
    }

    const intervalMs = this.calculateIntervalMs(config.intervalValue, config.intervalUnit);
    const now = Date.now();

    if (now - config.lastRotatedAt >= intervalMs) {
      const unitLabel =
        config.intervalUnit === 'minutes' ? 'Menit' : config.intervalUnit === 'hours' ? 'Jam' : 'Hari';
      await this.rotateToken(`Jadwal Rotasi Berkala (${config.intervalValue} ${unitLabel})`);
      return true;
    }

    return false;
  }

  /**
   * Memulai background interval scheduler
   */
  public start(checkFrequencyMs: number = 15000): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(async () => {
      try {
        await this.checkInterval();
      } catch (err: any) {
        console.warn('[AdminTokenRotation] Gagal mengecek interval rotasi:', err?.message || err);
      }
    }, checkFrequencyMs);
  }

  /**
   * Menghentikan background interval scheduler
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const adminTokenService = new AdminTokenRotationService();
