import { db, initDatabase } from '../src/db/index.js';

console.log('=== PEMBERSIHAN & INISIALISASI DATABASE FRESH ===');

// Hapus seluruh data di tabel operasional
const tablesToClear = [
  'positions',
  'trades_history',
  'subagent_logs',
  'lessons_learned',
  'new_coin_alerts',
  'ai_ab_evaluations',
  'ghost_positions',
  'entry_gate_logs',
  'ai_call_logs',
  'news_items',
  'regime_log',
  'opportunity_shortlist',
  'agent_messages',
  'models',
  'providers',
];

for (const tbl of tablesToClear) {
  try {
    db.prepare(`DELETE FROM ${tbl}`).run();
  } catch {}
}

initDatabase();

// Reset setting trading ke kondisi fresh default
db.prepare("UPDATE settings SET value = '0' WHERE key = 'is_auto_trading_active'").run();
db.prepare("UPDATE settings SET value = 'paper' WHERE key = 'trading_mode'").run();
db.prepare("UPDATE settings SET value = '10000000' WHERE key = 'paper_idr_balance'").run();
db.prepare("UPDATE settings SET value = 'balanced' WHERE key = 'risk_profile'").run();
db.prepare("UPDATE settings SET value = 'confirm' WHERE key = 'ai_mode'").run();

// Jalankan VACUUM dan WAL checkpoint
db.pragma('wal_checkpoint(TRUNCATE)');
db.exec('VACUUM;');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
console.log(`\nStatus 16 Tabel Database:`);
for (const t of tables) {
  const countRow = db.prepare(`SELECT count(*) as c FROM ${t.name}`).get() as { c: number };
  console.log(`  ✓ ${t.name.padEnd(24)}: ${countRow.c} baris`);
}

const tokenRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_access_token'").get() as { value: string } | undefined;
console.log('\n--- Konfigurasi Standar ---');
console.log(`- Trading Mode        : paper (Saldo Awal: Rp 10.000.000)`);
console.log(`- Auto Trading Active : 0 (PAUSED - Aman)`);
console.log(`- Risk Profile        : balanced`);
console.log(`- AI Mode             : confirm`);
console.log(`- Admin Access Token  : ${tokenRow?.value}`);

db.close();
console.log('\n✅ Database berhasil di-reset 100% fresh!');
