import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { TradingEngine } from '../src/services/trading/index.js';
import { indodax } from '../src/services/indodax/index.js';
import { whatsappService } from '../src/services/whatsapp/index.js';
import { reportingService } from '../src/services/reports/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Simpan & pulihkan setting untuk satu test (pola sama dengan trading.test.ts). */
function captureSettings(keys: string[]): Record<string, string> {
  const saved: Record<string, string> = {};
  for (const key of keys) saved[key] = getSetting(key, '');
  return saved;
}

function restoreSettings(saved: Record<string, string>) {
  for (const [key, value] of Object.entries(saved)) setSetting(key, value);
}

function cleanupPosition(id: string) {
  db.prepare('DELETE FROM trades_history WHERE position_id = ?').run(id);
  db.prepare('DELETE FROM positions WHERE id = ?').run(id);
}

function readEntryStrategy(symbol: string): string | null {
  const row = db
    .prepare('SELECT entry_strategy FROM positions WHERE symbol = ? ORDER BY opened_at DESC LIMIT 1')
    .get(symbol) as { entry_strategy: string | null } | undefined;
  return row ? row.entry_strategy : null;
}

describe('Strategy Attribution — executeBuy persists entry_strategy per entry path', () => {
  test('persists bluechip_pullback / momentum / new_listing / manual and tolerates null (legacy rows)', async (t) => {
    const saved = captureSettings(['paper_idr_balance', 'adaptive_exit_enabled']);
    setSetting('paper_idr_balance', '50000000');
    setSetting('adaptive_exit_enabled', '0');

    const engine = new TradingEngine();
    const cases: Array<{ symbol: string; strategy: string | null | undefined; expected: string | null }> = [
      { symbol: 'attrblue_idr', strategy: 'bluechip_pullback', expected: 'bluechip_pullback' },
      { symbol: 'attrmomo_idr', strategy: 'momentum', expected: 'momentum' },
      { symbol: 'attrnew_idr', strategy: 'new_listing', expected: 'new_listing' },
      { symbol: 'attrman_idr', strategy: 'manual', expected: 'manual' },
      { symbol: 'attrleg_idr', strategy: undefined, expected: null },
    ];

    const createdIds: string[] = [];
    try {
      for (const c of cases) {
        const ok = await engine.executeBuy(c.symbol, 1000, 100, 100000, 'paper', 'unit test attribution', null, c.strategy);
        assert.equal(ok, true, `executeBuy harus sukses untuk ${c.symbol}`);
        const row = db
          .prepare('SELECT id, entry_strategy FROM positions WHERE symbol = ? ORDER BY opened_at DESC LIMIT 1')
          .get(c.symbol) as { id: string; entry_strategy: string | null };
        assert.ok(row, `posisi ${c.symbol} harus ada di DB`);
        createdIds.push(row.id);
        assert.equal(
          row.entry_strategy,
          c.expected,
          `entry_strategy ${c.symbol} harus ${c.expected}`
        );
      }
    } finally {
      for (const id of createdIds) cleanupPosition(id);
      restoreSettings(saved);
    }
  });

  test('WhatsApp AI manual buy action (BUY_COIN) is attributed to manual', async (t) => {
    const saved = captureSettings(['paper_idr_balance', 'trading_mode']);
    setSetting('paper_idr_balance', '50000000');
    setSetting('trading_mode', 'paper');

    const originalGetTicker = indodax.getTicker;
    (indodax as any).getTicker = async (_pair: string) => ({
      ticker: { last: '1000' },
    });

    try {
      const reply = await whatsappService.executeAiAction('BUY_COIN', { symbol: 'attrwa', amountIdr: 100000 }, true);
      assert.ok(reply.includes('AKSI BERHASIL'), `balasan AI action harus sukses, dapat: ${reply}`);

      const row = db
        .prepare("SELECT id, entry_strategy FROM positions WHERE symbol = 'attrwaidr' ORDER BY opened_at DESC LIMIT 1")
        .get() as { id: string; entry_strategy: string | null };
      assert.ok(row, 'posisi dari WhatsApp BUY_COIN harus tercatat');
      t.after(() => cleanupPosition(row.id));
      assert.equal(row.entry_strategy, 'manual', 'beli via WhatsApp/AI Assistant harus teratribusi manual');
    } finally {
      (indodax as any).getTicker = originalGetTicker;
      restoreSettings(saved);
    }
  });
});

// --- Atribusi pada laporan performa ---

interface StrategyBaseline {
  closedTrades: number;
  wins: number;
  losses: number;
  netPnlIdr: number;
}

/** Baseline semua posisi closed SAAT INI (DB test dipakai bersama antar file test). */
function baselineByStrategy(): Map<string, StrategyBaseline> {
  const rows = db
    .prepare("SELECT entry_strategy, pnl_idr FROM positions WHERE status = 'closed'")
    .all() as Array<{ entry_strategy: string | null; pnl_idr: number }>;
  const map = new Map<string, StrategyBaseline>();
  for (const r of rows) {
    const key = (r.entry_strategy && String(r.entry_strategy).trim()) || 'unknown';
    const agg = map.get(key) || { closedTrades: 0, wins: 0, losses: 0, netPnlIdr: 0 };
    agg.closedTrades++;
    if ((r.pnl_idr || 0) > 0) agg.wins++;
    else if ((r.pnl_idr || 0) < 0) agg.losses++;
    agg.netPnlIdr += r.pnl_idr || 0;
    map.set(key, agg);
  }
  return map;
}

function expectPlusBaseline(
  baseline: Map<string, StrategyBaseline>,
  strategy: string,
  mine: { closedTrades: number; wins: number; losses: number; netPnlIdr: number }
) {
  const b = baseline.get(strategy) || { closedTrades: 0, wins: 0, losses: 0, netPnlIdr: 0 };
  return {
    closedTrades: b.closedTrades + mine.closedTrades,
    wins: b.wins + mine.wins,
    losses: b.losses + mine.losses,
    netPnlIdr: Math.round(b.netPnlIdr + mine.netPnlIdr),
  };
}

describe('Strategy Attribution — report strategyBreakdown aggregation', () => {
  test('groups closed trades by entry_strategy (NULL → unknown) with honest win rates, sorted by net PnL desc', (t) => {
    const baseline = baselineByStrategy();
    const insertedIds: string[] = [];

    const insertClosed = (entryStrategy: string | null, pnlIdr: number, holdMinutes: number, symbol: string) => {
      const id = `pos_attr_rep_${Math.random().toString(36).slice(2, 10)}`;
      const closedAt = Date.now();
      const openedAt = closedAt - holdMinutes * 60000;
      db.prepare(`
        INSERT INTO positions (
          id, symbol, base_currency, traded_currency, side, entry_price, current_price,
          amount, initial_cost_idr, highest_price, trailing_stop_price, take_profit_step,
          status, opened_at, closed_at, pnl_idr, pnl_percent, realized_pnl_idr, entry_strategy, mode
        ) VALUES (?, ?, 'idr', ?, 'buy', 100, 100, 1000, 100000, 100, 90, 0, 'closed', ?, ?, ?, ?, 0, ?, 'paper')
      `).run(id, symbol, symbol.replace(/idr$/, ''), openedAt, closedAt, pnlIdr, (pnlIdr / 100000) * 100, entryStrategy);
      insertedIds.push(id);
    };

    // Fixture: 6 posisi closed campuran, termasuk NULL (legacy → unknown).
    insertClosed('bluechip_pullback', 400000, 60, 'attrrepblue_idr');
    insertClosed('new_listing', 250000, 120, 'attrrepnew_idr');
    insertClosed('manual', 50000, 30, 'attrrepman1_idr');
    insertClosed('manual', -20000, 90, 'attrrepman2_idr');
    insertClosed('momentum', -100000, 45, 'attrrepmomo_idr');
    insertClosed(null, -50000, 15, 'attrrepnull_idr');

    t.after(() => {
      for (const id of insertedIds) cleanupPosition(id);
    });

    const report = reportingService.getPerformanceReport('all');
    assert.ok(Array.isArray(report.strategyBreakdown), 'strategyBreakdown harus array');

    const byKey = new Map(report.strategyBreakdown.map((s) => [s.strategy, s]));

    // bluechip_pullback: 1 trade, 1 win, net +400.000
    const blue = byKey.get('bluechip_pullback');
    assert.ok(blue, 'grup bluechip_pullback harus ada');
    const expBlue = expectPlusBaseline(baseline, 'bluechip_pullback', { closedTrades: 1, wins: 1, losses: 0, netPnlIdr: 400000 });
    assert.equal(blue!.closedTrades, expBlue.closedTrades);
    assert.equal(blue!.wins, expBlue.wins);
    assert.equal(blue!.losses, expBlue.losses);
    assert.equal(blue!.netPnlIdr, expBlue.netPnlIdr);
    assert.equal(blue!.winRatePercent, parseFloat(((expBlue.wins / expBlue.closedTrades) * 100).toFixed(1)));

    // momentum: 1 trade, 0 win 1 loss, net -100.000 → win rate 0 (jujur)
    const momo = byKey.get('momentum');
    assert.ok(momo, 'grup momentum harus ada');
    const expMomo = expectPlusBaseline(baseline, 'momentum', { closedTrades: 1, wins: 0, losses: 1, netPnlIdr: -100000 });
    assert.equal(momo!.closedTrades, expMomo.closedTrades);
    assert.equal(momo!.wins, expMomo.wins);
    assert.equal(momo!.losses, expMomo.losses);
    assert.equal(momo!.netPnlIdr, expMomo.netPnlIdr);
    assert.equal(momo!.winRatePercent, 0, 'win rate harus jujur 0 saat semua loss');

    // manual: sepenuhnya milik test ini (tidak ada test lain menulis 'manual')
    const manual = byKey.get('manual');
    assert.ok(manual, 'grup manual harus ada');
    assert.equal(manual!.closedTrades, 2);
    assert.equal(manual!.wins, 1);
    assert.equal(manual!.losses, 1);
    assert.equal(manual!.winRatePercent, 50.0);
    assert.equal(manual!.netPnlIdr, 30000);
    assert.equal(manual!.avgHoldMinutes, 60, 'rata-rata hold (30+90)/2 = 60 menit');

    // NULL entry_strategy → 'unknown'
    const unknown = byKey.get('unknown');
    assert.ok(unknown, 'baris legacy (NULL) harus masuk grup unknown');
    const expUnknown = expectPlusBaseline(baseline, 'unknown', { closedTrades: 1, wins: 0, losses: 1, netPnlIdr: -50000 });
    assert.equal(unknown!.closedTrades, expUnknown.closedTrades);
    assert.equal(unknown!.netPnlIdr, expUnknown.netPnlIdr);

    // avgHoldMinutes selalu number ketika ada trade closed
    for (const s of report.strategyBreakdown) {
      assert.equal(typeof s.netPnlIdr, 'number');
      if (s.closedTrades > 0) {
        assert.equal(typeof s.avgHoldMinutes, 'number', `avgHoldMinutes ${s.strategy} harus number saat ada trade`);
      }
    }

    // Urutan deterministik: netPnlIdr desc (tie-break nama strategi asc)
    for (let i = 1; i < report.strategyBreakdown.length; i++) {
      const prev = report.strategyBreakdown[i - 1];
      const cur = report.strategyBreakdown[i];
      assert.ok(
        prev.netPnlIdr > cur.netPnlIdr || (prev.netPnlIdr === cur.netPnlIdr && prev.strategy <= cur.strategy),
        `urutan harus netPnlIdr desc: ${prev.strategy} (${prev.netPnlIdr}) sebelum ${cur.strategy} (${cur.netPnlIdr})`
      );
    }
    // Urutan relatif grup milik fixture ini
    const orderOf = ['bluechip_pullback', 'new_listing', 'manual', 'momentum'].map((s) =>
      report.strategyBreakdown.findIndex((x) => x.strategy === s)
    );
    for (let i = 1; i < orderOf.length; i++) {
      assert.ok(orderOf[i - 1] < orderOf[i], `grup ${['bluechip_pullback', 'new_listing', 'manual', 'momentum'][i - 1]} harus di atas yang berikutnya`);
    }
  });

  test('empty database returns an empty strategyBreakdown array without crashing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'attr-empty-db-'));
    try {
      // Child process dengan DB segar & kosong (isolasi penuh dari DB test bersama).
      const script = `
        const assert = (await import('node:assert/strict')).default;
        const { pathToFileURL } = await import('node:url');
        const root = ${JSON.stringify(repoRoot)};
        const { db } = await import(pathToFileURL(root + '/src/db/index.ts'));
        const { reportingService } = await import(pathToFileURL(root + '/src/services/reports/index.ts'));
        const closed = db.prepare("SELECT COUNT(*) AS c FROM positions WHERE status = 'closed'").get().c;
        assert.equal(closed, 0, 'DB anak harus kosong dari posisi closed');
        const report = reportingService.getPerformanceReport('all');
        assert.ok(Array.isArray(report.strategyBreakdown));
        assert.deepEqual(report.strategyBreakdown, []);
        const csv = reportingService.generateCsv(30);
        assert.equal(typeof csv, 'string');
        console.log('EMPTY_DB_OK');
      `;
      const res = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
        cwd: repoRoot,
        env: {
          ...process.env,
          AI_TRADING_DATA_DIR: tmp,
          AI_TRADING_DB_PATH: path.join(tmp, 'trading.db'),
          NODE_ENV: 'test',
        },
        encoding: 'utf8',
        timeout: 120000,
      });
      assert.equal(res.status, 0, `child process gagal:\nstdout: ${res.stdout}\nstderr: ${res.stderr}`);
      assert.ok(res.stdout.includes('EMPTY_DB_OK'), `stdout: ${res.stdout}`);
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  });
});
