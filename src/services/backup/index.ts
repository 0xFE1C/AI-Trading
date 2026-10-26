import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { db, DATA_DIR } from '../../db/index.js';

export interface BackupItem {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: number;
  createdFormatted: string;
}

export class BackupService {
  private backupDir: string;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Menjalankan scheduler auto-backup berkala (default: 24 jam sekali).
   */
  public startAutoBackup(intervalMs: number = 24 * 60 * 60 * 1000) {
    if (this.intervalTimer) clearInterval(this.intervalTimer);

    // Initial backup 60 detik setelah server hidup (unref to prevent event-loop block)
    const initTimer = setTimeout(() => {
      this.createBackup().catch((err) => {
        console.warn('[Initial Backup Warning]', err.message);
      });
    }, 60000);
    if (initTimer.unref) initTimer.unref();

    this.intervalTimer = setInterval(() => {
      this.createBackup().catch((err) => {
        console.error('[Periodic Backup Error]', err.message);
      });
    }, intervalMs);
    if (this.intervalTimer.unref) this.intervalTimer.unref();
  }

  /**
   * Menghentikan scheduler auto-backup saat shutdown.
   */
  public stopAutoBackup() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Membuat snapshot cadangan online SQLite tanpa mengunci database
   * menggunakan atomic temp file dan verifikasi PRAGMA integrity_check.
   */
  public async createBackup(): Promise<BackupItem> {
    const timestamp = Date.now();
    const d = new Date(timestamp);
    const dateStr = d.toISOString().replace(/[:.]/g, '-');
    const filename = `trading_backup_${dateStr}.db`;
    const destPath = path.join(this.backupDir, filename);
    const tempPath = path.join(this.backupDir, `${filename}.tmp`);

    try {
      // 1. Live online backup to temporary file via better-sqlite3 API
      await db.backup(tempPath);

      // 2. Integrity check on newly created backup before promoting
      const backupDb = new Database(tempPath, { readonly: true });
      try {
        const integrity = backupDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
        const isOk = Array.isArray(integrity) && integrity.length > 0 && integrity[0].integrity_check === 'ok';
        if (!isOk) {
          throw new Error('Integritas backup database SQLite gagal (corrupt)');
        }
      } finally {
        backupDb.close();
      }

      // 3. Atomic rename to final .db filename
      fs.renameSync(tempPath, destPath);
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
      throw err;
    }

    const stats = fs.statSync(destPath);
    console.log(`[BackupService] Database backup dibuat & terverifikasi: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);

    // Rotasi: Simpan maksimal 10 file backup terakhir
    this.rotateBackups(10);

    return {
      filename,
      sizeBytes: stats.size,
      sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
      createdAt: timestamp,
      createdFormatted: d.toLocaleString('id-ID'),
    };
  }

  /**
   * Mengambil daftar file cadangan database yang tersimpan.
   */
  public getBackups(): BackupItem[] {
    if (!fs.existsSync(this.backupDir)) return [];
    const files = fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.db'));

    return files
      .map((f) => {
        const fullPath = path.join(this.backupDir, f);
        const stats = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stats.size,
          sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
          createdAt: stats.mtimeMs,
          createdFormatted: new Date(stats.mtimeMs).toLocaleString('id-ID'),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private rotateBackups(keepCount: number) {
    try {
      const files = this.getBackups();
      if (files.length > keepCount) {
        const toDelete = files.slice(keepCount);
        for (const file of toDelete) {
          const filePath = path.join(this.backupDir, file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[BackupService] Backup lama dihapus (rotasi): ${file.filename}`);
          }
        }
      }
    } catch (err: any) {
      console.warn('[BackupService Rotation Warning]', err.message);
    }
  }
}

export const backupService = new BackupService();
