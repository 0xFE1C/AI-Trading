import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { reportingService } from '../src/services/reports/index.js';
import { backupService } from '../src/services/backup/index.js';
import { telegramService } from '../src/services/telegram/index.js';

test('Performance Reporting Engine & CSV Export', async (t) => {
  await t.test('generates valid performance report structure without crashing', () => {
    const report = reportingService.getPerformanceReport('all');

    assert.ok(report);
    assert.equal(typeof report.totalTrades, 'number');
    assert.equal(typeof report.winRatePercent, 'number');
    assert.equal(typeof report.netPnlIdr, 'number');
    assert.equal(typeof report.totalVolumeIdr, 'number');
    assert.ok(Array.isArray(report.coinBreakdown));
    assert.ok(Array.isArray(report.tradesList));
    assert.ok(report.aiEfficacy);
    assert.equal(typeof report.aiEfficacy.bulletsDodged, 'number');
  });

  await t.test('generates valid CSV string without tax calculations', () => {
    const csv = reportingService.generateCsv(30);

    assert.equal(typeof csv, 'string');
    assert.ok(csv.includes('No,ID Posisi,Waktu Beli,Waktu Jual,Simbol,Harga Beli (IDR)'));
    // Ensure tax headers are NOT included as specifically requested by user
    assert.ok(!csv.toLowerCase().includes('pajak'));
    assert.ok(!csv.toLowerCase().includes('pph'));
  });
});

test('Database Backup Service', async (t) => {
  await t.test('creates live online sqlite snapshot and lists backup items', async () => {
    const backup = await backupService.createBackup();

    assert.ok(backup);
    assert.ok(backup.filename.startsWith('trading_backup_'));
    assert.ok(backup.sizeBytes > 0);

    const list = backupService.getBackups();
    assert.ok(list.length > 0);
    assert.ok(list.some((b) => b.filename === backup.filename));

    // Verify backup file physically exists on disk
    const dataDir = process.env.AI_TRADING_DATA_DIR || path.resolve(process.cwd(), 'data');
    const backupPath = path.join(dataDir, 'backups', backup.filename);
    assert.ok(fs.existsSync(backupPath));
  });
});

test('Telegram Notifier Service', async (t) => {
  await t.test('handles missing or invalid credentials gracefully', async () => {
    const res = await telegramService.testConnection('', '');
    assert.equal(res.success, false);
    assert.ok(res.message.includes('wajib diisi'));
  });

  await t.test('sendAlert returns false when telegram is disabled', async () => {
    const sent = await telegramService.sendAlert('Test message');
    assert.equal(sent, false);
  });
});
