import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { apiRouter } from '../src/api/routes.js';
import { TradingEngine } from '../src/services/trading/index.js';
import { indodax, IndodaxSummaryTicker } from '../src/services/indodax/index.js';
import { indodaxMarketStream } from '../src/services/indodax/marketStream.js';
import { saveCandles } from '../src/services/candles/store.js';
import { selectMomentumCandidate, MomentumCandidateInput } from '../src/services/trading/momentumSelect.js';
import { ScoreResult } from '../src/services/signals/index.js';

/**
 * Test gate deterministik pasar menyeluruh (0 token LLM):
 * market_breadth, reentry_cooldown, mtf_alignment, radar /api/market/radar.
 * Semua stub memakai monkey-patching instance singleton (pola yang sama
 * dengan trading.test.ts) dan dipulihkan setiap test.
 */

const engine = new TradingEngine();

// --- Stub management ------------------------------------------------------

const originalGetSummaries = indodax.getSummaries;
const originalGetDepth = indodax.getDepth;
const originalGetRealCandles = indodaxMarketStream.getRealCandles;
const originalPingDeadmanSwitch = (indodax as any).pingDeadmanSwitch;

interface SummariesPayload {
  tickers: Record<string, IndodaxSummaryTicker>;
  prices_24h: Record<string, string>;
}

function stubSummaries(payload: SummariesPayload) {
  (indodax as any).getSummaries = async () => payload;
}

function stubDepth(handler: (pair: string) => any) {
  (indodax as any).getDepth = async (pair: string) => handler(pair);
}

function stubRealCandles(handler: (pair: string, timeframe: string) => any[]) {
  (indodaxMarketStream as any).getRealCandles = async (pair: string, timeframe: string) => handler(pair, timeframe);
}

function restoreStubs() {
  indodax.getSummaries = originalGetSummaries;
  indodax.getDepth = originalGetDepth;
  indodaxMarketStream.getRealCandles = originalGetRealCandles;
  (indodax as any).pingDeadmanSwitch = originalPingDeadmanSwitch;
}

// --- Settings snapshot ----------------------------------------------------

const SETTINGS_KEYS = [
  'trading_mode',
  'is_auto_trading_active',
  'ai_mode',
  'risk_profile',
  'entry_scoring_mode',
  'allow_new_listings',
  'allowed_coins_only',
  'min_24h_volume_idr',
  'max_allocation_per_trade_idr',
  'max_active_trades',
  'market_breadth_min_percent',
  'reentry_cooldown_hours',
  'paper_idr_balance',
];
const settingsSnapshot: Record<string, string> = {};
for (const k of SETTINGS_KEYS) settingsSnapshot[k] = getSetting(k, '');

function applySettings(overrides: Record<string, string>) {
  for (const [k, v] of Object.entries(overrides)) setSetting(k, v);
}

// --- Data builders --------------------------------------------------------

function ticker(last: number, low: number, high: number, vol: number, buy?: number, sell?: number): IndodaxSummaryTicker {
  return {
    name: 'Test',
    last: String(last),
    high: String(high),
    low: String(low),
    vol_idr: String(vol),
    buy: String(buy ?? last * 0.999),
    sell: String(sell ?? last * 1.001),
    server_time: Date.now(),
  };
}

/** 20 pasangan decoy likuid yang SEMUA melemah vs harga 24 jam lalu. */
function decliningDecoys(vol = 1e9): { tickers: Record<string, IndodaxSummaryTicker>; prices_24h: Record<string, string> } {
  const tickers: Record<string, IndodaxSummaryTicker> = {};
  const prices_24h: Record<string, string> = {};
  for (let i = 0; i < 20; i++) {
    const sym = `dec${String(i).padStart(2, '0')}`;
    tickers[`${sym}_idr`] = ticker(100, 90, 101, vol);
    prices_24h[`${sym}idr`] = '120'; // 24j lalu lebih tinggi → turun
  }
  return { tickers, prices_24h };
}

/** Candle 15m yang menghasilkan skor momentum tinggi (RSI ~63, surge volume). */
function momentumCandles15m(n = 30): Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> {
  const candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let close = 100;
  for (let i = 0; i < n; i++) {
    const open = close;
    close = i % 2 === 0 ? open * 1.015 : open * 0.992;
    const volume = i >= n - 4 ? 800 : 100;
    candles.push({
      timestamp: Date.now() - (n - i) * 900_000,
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
      volume,
    });
  }
  return candles;
}

/** Candle 15m pullback blue-chip (RSI ~42, skor > ambang konservatif 65). */
function bluechipCandles15m(n = 30): Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> {
  const candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let close = 100;
  for (let i = 0; i < n; i++) {
    const open = close;
    close = i % 2 === 0 ? open * 1.002 : open * 0.9975;
    candles.push({
      timestamp: Date.now() - (n - i) * 900_000,
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
      volume: 100,
    });
  }
  return candles;
}

/** Bar 1h downtrend mulus (close & EMA21 turun) untuk veto mtf_alignment. */
function downtrend1hBars(n = 24): Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> {
  const bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  let close = 200;
  for (let i = 0; i < n; i++) {
    bars.push({ timestamp: Date.now() - (n - i) * 3_600_000, open: close, high: close * 1.001, low: close * 0.999, close, volume: 1000 });
    close -= 1;
  }
  return bars;
}

function momentumTickerPair(symbol: string, gainPct: number, vol = 5e8): IndodaxSummaryTicker {
  const last = 100;
  const low = last / (1 + gainPct / 100);
  return ticker(last, low, last * 1.01, vol);
}

function insertClosedPosition(symbol: string, closedAgoMs: number, pnlIdr: number): string {
  const id = `mgt_${symbol}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO positions (id, symbol, base_currency, traded_currency, side, entry_price, current_price, amount,
      initial_cost_idr, highest_price, trailing_stop_price, take_profit_step, status, opened_at, closed_at,
      pnl_idr, pnl_percent, mode)
    VALUES (?, ?, 'idr', 'idr', 'buy', 100, 100, 1, 100, 100, 99, 0, 'closed', ?, ?, ?, ?, 'paper')
  `).run(id, symbol, Date.now() - closedAgoMs - 3_600_000, Date.now() - closedAgoMs, pnlIdr, (pnlIdr / 100) * 100);
  return id;
}

function latestGateRow(gateName: string, symbol?: string): any {
  const row = symbol
    ? db.prepare("SELECT * FROM entry_gate_logs WHERE gate_name = ? AND symbol = ? ORDER BY ts DESC, rowid DESC LIMIT 1").get(gateName, symbol)
    : db.prepare("SELECT * FROM entry_gate_logs WHERE gate_name = ? ORDER BY ts DESC, rowid DESC LIMIT 1").get(gateName);
  return row;
}

function countPositions(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM positions').get() as { c: number }).c;
}

const LIQUID_DEPTH = { buy: [['99.9', '100000']], sell: [['100', '100000']] };

// --- Cleanup ---------------------------------------------------------------

const MY_TABLES = ['positions', 'ghost_positions', 'trades_history', 'entry_gate_logs', 'ai_ab_evaluations', 'opportunity_shortlist', 'new_coin_alerts'];
const rowidMarkers: Record<string, number> = {};

function markRowids() {
  for (const t of MY_TABLES) {
    const row = db.prepare(`SELECT COALESCE(MAX(rowid), 0) AS m FROM ${t}`).get() as { m: number };
    rowidMarkers[t] = row.m;
  }
}

function cleanMyRows() {
  for (const t of MY_TABLES) {
    db.prepare(`DELETE FROM ${t} WHERE rowid > ?`).run(rowidMarkers[t] ?? 0);
  }
  db.prepare("DELETE FROM candles WHERE pair IN ('aaa', 'bbb', 'btc')").run();
  db.prepare('DELETE FROM market_screener').run();
}

// --- Tests -----------------------------------------------------------------

describe('Gate Deterministik Pasar Menyeluruh (0 token LLM)', () => {
  test('market_breadth memveto momentum saat breadth < 30 dan prices_24h tersedia', async () => {
    markRowids();
    applySettings({
      trading_mode: 'paper',
      is_auto_trading_active: '1',
      ai_mode: 'off',
      risk_profile: 'balanced',
      entry_scoring_mode: 'composite_score',
      allow_new_listings: '1',
      allowed_coins_only: '',
      min_24h_volume_idr: '200000000',
      market_breadth_min_percent: '30',
      reentry_cooldown_hours: '4',
    });
    db.prepare(`
      INSERT INTO new_coin_alerts (id, symbol, name, initial_price, current_price, volume_24h, surge_percent, detected_at, status)
      VALUES ('mgt_alert_1', 'aaa', 'AAA Token', 100, 105, 300000000, 5, ?, 'monitoring')
    `).run(Date.now());

    const decoys = decliningDecoys();
    decoys.tickers['aaa_idr'] = momentumTickerPair('aaa', 8, 3e8);
    decoys.tickers['bbb_idr'] = momentumTickerPair('bbb', 6, 3e8);
    decoys.prices_24h['aaaidr'] = '90'; // aaa naik, tapi volume kecil → tidak masuk top-20
    stubSummaries(decoys);
    stubRealCandles(() => momentumCandles15m());

    const positionsBefore = countPositions();
    try {
      await (engine as any).scanAndExecuteEntries();

      const row = latestGateRow('market_breadth');
      assert.ok(row, 'gate market_breadth harus dilog setiap siklus');
      assert.equal(row.passed, 0);
      const values = JSON.parse(row.values_json);
      assert.equal(values.percent, 0);
      assert.equal(values.sampleSize, 20);
      assert.equal(values.threshold, 30);
      assert.equal(values.action, 'veto_momentum_new_listing');

      assert.equal(countPositions(), positionsBefore, 'tidak boleh ada buy saat breadth veto');
      const alert = db.prepare("SELECT status FROM new_coin_alerts WHERE id = 'mgt_alert_1'").get() as any;
      assert.equal(alert.status, 'monitoring', 'jalur new_listing juga diveto breadth');
      assert.equal(latestGateRow('reentry_cooldown'), undefined);
      assert.equal(latestGateRow('mtf_alignment'), undefined);
    } finally {
      cleanMyRows();
      restoreStubs();
    }
  });

  test('market_breadth fail-open saat prices_24h hilang (sampleSize 0) dan momentum lanjut beli', async () => {
    markRowids();
    applySettings({
      trading_mode: 'paper',
      is_auto_trading_active: '1',
      ai_mode: 'off',
      risk_profile: 'balanced',
      entry_scoring_mode: 'composite_score',
      allow_new_listings: '0',
      allowed_coins_only: '',
      min_24h_volume_idr: '200000000',
      market_breadth_min_percent: '30',
      reentry_cooldown_hours: '4',
      paper_idr_balance: '10000000',
      max_allocation_per_trade_idr: '100000',
      max_active_trades: '3',
    });

    const tickers: Record<string, IndodaxSummaryTicker> = {
      aaa_idr: momentumTickerPair('aaa', 8, 5e8),
      bbb_idr: momentumTickerPair('bbb', 6, 4e8),
    };
    stubSummaries({ tickers, prices_24h: {} }); // peta 24j hilang → fail-open
    stubRealCandles((_pair, tf) => (tf === '15m' ? momentumCandles15m() : []));
    stubDepth(() => LIQUID_DEPTH);

    try {
      await (engine as any).scanAndExecuteEntries();

      const row = latestGateRow('market_breadth');
      assert.ok(row);
      assert.equal(row.passed, 1, 'sampleSize 0 harus fail-open (lolos)');
      const values = JSON.parse(row.values_json);
      assert.equal(values.sampleSize, 0);
      assert.equal(values.action, 'fail_open');

      const pos = db.prepare("SELECT symbol, entry_strategy, status FROM positions WHERE id LIKE 'pos_aaa_%'").get() as any;
      assert.ok(pos, 'momentum harus lanjut membeli saat gate fail-open');
      assert.equal(pos.symbol, 'aaa');
      assert.equal(pos.entry_strategy, 'momentum');
      assert.equal(pos.status, 'open');

      const mtfRow = latestGateRow('mtf_alignment', 'aaa');
      assert.ok(mtfRow, 'mtf_alignment harus dilog untuk kandidat komposit top-8');
      assert.equal(mtfRow.passed, 1);
      assert.equal(JSON.parse(mtfRow.values_json).status, 'warn', '1h tanpa data → warn (fail-open)');
    } finally {
      cleanMyRows();
      restoreStubs();
    }
  });

  test('bluechip_pullback tetap BOLEH trading saat breadth memblokir', async () => {
    markRowids();
    applySettings({
      trading_mode: 'paper',
      is_auto_trading_active: '1',
      ai_mode: 'off',
      risk_profile: 'conservative',
      entry_scoring_mode: 'composite_score',
      allow_new_listings: '0',
      allowed_coins_only: '',
      min_24h_volume_idr: '200000000',
      market_breadth_min_percent: '30',
      reentry_cooldown_hours: '4',
      paper_idr_balance: '10000000',
      max_allocation_per_trade_idr: '100000',
      max_active_trades: '3',
    });

    const decoys = decliningDecoys();
    decoys.tickers['btc_idr'] = ticker(1617000000, 1617000000 * 0.95, 1617000000 * 1.01, 5e8);
    stubSummaries(decoys);
    stubRealCandles((_pair, tf) => (tf === '15m' ? bluechipCandles15m() : []));
    stubDepth(() => LIQUID_DEPTH);

    try {
      await (engine as any).scanAndExecuteEntries();

      const breadthRow = latestGateRow('market_breadth');
      assert.ok(breadthRow);
      assert.equal(breadthRow.passed, 0, 'breadth tetap memblok (20/20 decoy turun)');

      const pos = db.prepare("SELECT symbol, entry_strategy, status FROM positions WHERE id LIKE 'pos_btc_%'").get() as any;
      assert.ok(pos, 'bluechip pullback harus tetap dievaluasi & dibeli saat breadth block');
      assert.equal(pos.symbol, 'btc');
      assert.equal(pos.entry_strategy, 'bluechip_pullback');

      // MTF bluechip store-only: candle store kosong untuk 'btc' 1h → warn → pass
      const mtfRow = latestGateRow('mtf_alignment', 'btc');
      assert.ok(mtfRow);
      assert.equal(mtfRow.passed, 1);
      assert.equal(JSON.parse(mtfRow.values_json).status, 'warn');
      assert.equal(JSON.parse(mtfRow.values_json).source, 'none', 'bluechip TIDAK boleh fetch 1h (store-only)');
    } finally {
      cleanMyRows();
      restoreStubs();
    }
  });

  test('reentry_cooldown: jendela 4 jam, rugi x2, 0 = nonaktif, simbol segar tidak diblok', () => {
    markRowids();
    applySettings({ reentry_cooldown_hours: '4' });
    const ids = [
      insertClosedPosition('co_win', 2 * 3_600_000, 500), // menang 2 jam lalu → blokir (4j)
      insertClosedPosition('co_loss', 5 * 3_600_000, -300), // rugi 5 jam lalu → blokir (8j)
      insertClosedPosition('co_old_win', 5 * 3_600_000, 300), // menang 5 jam lalu → lolos
      insertClosedPosition('co_old_loss', 9 * 3_600_000, -100), // rugi 9 jam lalu → lolos (8j)
      insertClosedPosition('co_ancient', 30 * 3_600_000, 200), // 30 jam lalu → bukan recently-traded
    ];

    try {
      const blocked = engine.getReentryCooldownBlockedSymbols();
      assert.ok(blocked.has('co_win'));
      assert.ok(blocked.has('co_loss'), 'rugi dalam 4 jam × 2 = 8 jam → tetap blokir');
      assert.equal(blocked.get('co_loss')?.lossMultiplier, 2);
      assert.ok(!blocked.has('co_old_win'), 'menang 5 jam lalu > 4 jam → lolos');
      assert.ok(!blocked.has('co_old_loss'), 'rugi 9 jam lalu > 8 jam → lolos');
      assert.ok(!blocked.has('fresh_symbol'), 'simbol tanpa posisi tertutup tidak diblok');
      assert.ok(blocked.get('co_win')!.closedAgoHours < 4);

      // recentlyTraded (rotasi 24 jam)
      const recent = engine.getRecentlyTradedSymbols();
      assert.ok(recent.has('co_win'));
      assert.ok(recent.has('co_loss'));
      assert.ok(recent.has('co_old_loss'), 'ditutup 9 jam lalu → masih < 24 jam → recently-traded');
      assert.ok(!recent.has('co_ancient'), 'ditutup 30 jam lalu → bukan recently-traded');

      // '0' menonaktifkan sepenuhnya
      setSetting('reentry_cooldown_hours', '0');
      assert.equal(engine.getReentryCooldownBlockedSymbols().size, 0);
    } finally {
      setSetting('reentry_cooldown_hours', '4');
      for (const id of ids) db.prepare('DELETE FROM positions WHERE id = ?').run(id);
    }
  });

  test('reentry_cooldown memblokir koin yang baru ditutup dan bot merotasi ke koin lain', async () => {
    markRowids();
    applySettings({
      trading_mode: 'paper',
      is_auto_trading_active: '1',
      ai_mode: 'off',
      risk_profile: 'balanced',
      entry_scoring_mode: 'composite_score',
      allow_new_listings: '0',
      allowed_coins_only: '',
      min_24h_volume_idr: '200000000',
      market_breadth_min_percent: '0', // breadth off → isolasi perilaku cooldown
      reentry_cooldown_hours: '4',
      paper_idr_balance: '10000000',
      max_allocation_per_trade_idr: '100000',
      max_active_trades: '3',
    });
    const cooldownPosId = insertClosedPosition('bbb', 2 * 3_600_000, 500); // bbb ditutup 2 jam lalu (menang)

    const tickers: Record<string, IndodaxSummaryTicker> = {
      aaa_idr: momentumTickerPair('aaa', 8, 5e8),
      bbb_idr: momentumTickerPair('bbb', 10, 5e8), // bbb gainer tertinggi tapi cooldown
    };
    stubSummaries({ tickers, prices_24h: {} });
    stubRealCandles((_pair, tf) => (tf === '15m' ? momentumCandles15m() : []));
    stubDepth(() => LIQUID_DEPTH);

    try {
      await (engine as any).scanAndExecuteEntries();

      const cooldownRow = latestGateRow('reentry_cooldown', 'bbb');
      assert.ok(cooldownRow, 'koin yang baru ditutup harus dilog reentry_cooldown');
      assert.equal(cooldownRow.passed, 0);
      const values = JSON.parse(cooldownRow.values_json);
      assert.equal(values.symbol, 'bbb');
      assert.ok(values.closedAgoHours < 4);
      assert.equal(values.lossMultiplier, 1);

      const pos = db.prepare("SELECT symbol, entry_strategy FROM positions WHERE id LIKE 'pos_aaa_%'").get() as any;
      assert.ok(pos, 'bot harus merotasi ke koin lain (aaa), bukan mengejar bbb');
      assert.equal(pos.symbol, 'aaa');
      assert.equal(pos.entry_strategy, 'momentum');
    } finally {
      db.prepare('DELETE FROM positions WHERE id = ?').run(cooldownPosId);
      cleanMyRows();
      restoreStubs();
    }
  });

  test('mtf_alignment memveto momentum saat tren 1h downtrend (dari candle store)', async () => {
    markRowids();
    applySettings({
      trading_mode: 'paper',
      is_auto_trading_active: '1',
      ai_mode: 'off',
      risk_profile: 'balanced',
      entry_scoring_mode: 'composite_score',
      allow_new_listings: '0',
      allowed_coins_only: '',
      min_24h_volume_idr: '200000000',
      market_breadth_min_percent: '0',
      reentry_cooldown_hours: '0',
      paper_idr_balance: '10000000',
      max_allocation_per_trade_idr: '100000',
      max_active_trades: '3',
    });

    saveCandles('aaa', '1h', downtrend1hBars(24)); // ≥ 22 bar di store → tanpa fetch
    const tickers: Record<string, IndodaxSummaryTicker> = {
      aaa_idr: momentumTickerPair('aaa', 8, 5e8),
    };
    stubSummaries({ tickers, prices_24h: {} });
    stubRealCandles((_pair, tf) => (tf === '15m' ? momentumCandles15m() : []));

    const positionsBefore = countPositions();
    try {
      await (engine as any).scanAndExecuteEntries();

      const mtfRow = latestGateRow('mtf_alignment', 'aaa');
      assert.ok(mtfRow, 'mtf_alignment harus dilog untuk kandidat komposit');
      assert.equal(mtfRow.passed, 0, 'downtrend 1h harus veto');
      const values = JSON.parse(mtfRow.values_json);
      assert.equal(values.status, 'veto');
      assert.equal(values.source, 'store');
      assert.ok(values.close < values.ema21);
      assert.ok(values.ema21 < values.ema21Prev);

      assert.equal(countPositions(), positionsBefore, 'tidak boleh buy saat MTF veto');
    } finally {
      cleanMyRows();
      restoreStubs();
    }
  });

  test('mtf_alignment fail-open saat bar 1h < 22 (warn → tetap beli)', async () => {
    markRowids();
    applySettings({
      trading_mode: 'paper',
      is_auto_trading_active: '1',
      ai_mode: 'off',
      risk_profile: 'balanced',
      entry_scoring_mode: 'composite_score',
      allow_new_listings: '0',
      allowed_coins_only: '',
      min_24h_volume_idr: '200000000',
      market_breadth_min_percent: '0',
      reentry_cooldown_hours: '0',
      paper_idr_balance: '10000000',
      max_allocation_per_trade_idr: '100000',
      max_active_trades: '3',
    });

    saveCandles('aaa', '1h', downtrend1hBars(10)); // < 22 bar
    const tickers: Record<string, IndodaxSummaryTicker> = {
      aaa_idr: momentumTickerPair('aaa', 8, 5e8),
    };
    stubSummaries({ tickers, prices_24h: {} });
    stubRealCandles((_pair, tf) => (tf === '15m' ? momentumCandles15m() : [])); // fetch 1h → kosong
    stubDepth(() => LIQUID_DEPTH);

    try {
      await (engine as any).scanAndExecuteEntries();

      const mtfRow = latestGateRow('mtf_alignment', 'aaa');
      assert.ok(mtfRow);
      assert.equal(mtfRow.passed, 1, 'data 1h kurang tidak boleh memblokir (fail-open)');
      const values = JSON.parse(mtfRow.values_json);
      assert.equal(values.status, 'warn');
      assert.ok(values.bars < 22);

      const pos = db.prepare("SELECT symbol FROM positions WHERE id LIKE 'pos_aaa_%'").get() as any;
      assert.ok(pos, 'entry tetap berjalan saat MTF warn');
      assert.equal(pos.symbol, 'aaa');
    } finally {
      cleanMyRows();
      restoreStubs();
    }
  });

  test('mode gain_rank (legacy) tidak menjalankan cek MTF', async () => {
    markRowids();
    applySettings({
      trading_mode: 'paper',
      is_auto_trading_active: '1',
      ai_mode: 'off',
      risk_profile: 'balanced',
      entry_scoring_mode: 'gain_rank',
      allow_new_listings: '0',
      allowed_coins_only: '',
      min_24h_volume_idr: '200000000',
      market_breadth_min_percent: '0',
      reentry_cooldown_hours: '0',
      paper_idr_balance: '10000000',
      max_allocation_per_trade_idr: '100000',
      max_active_trades: '3',
    });

    const tickers: Record<string, IndodaxSummaryTicker> = {
      aaa_idr: momentumTickerPair('aaa', 8, 5e8),
    };
    stubSummaries({ tickers, prices_24h: {} });
    // Candle 15m tetap tersedia untuk gerbang indikator wajib saat eksekusi;
    // seleksi gain_rank murni memakai ranking gain24h tanpa skor komposit.
    stubRealCandles((_pair, tf) => (tf === '15m' ? momentumCandles15m() : []));
    stubDepth(() => LIQUID_DEPTH);

    try {
      await (engine as any).scanAndExecuteEntries();

      assert.equal(latestGateRow('mtf_alignment', 'aaa'), undefined, 'gain_rank tidak men-skor komposit → tanpa MTF');
      const pos = db.prepare("SELECT symbol, entry_strategy FROM positions WHERE id LIKE 'pos_aaa_%'").get() as any;
      assert.ok(pos, 'gain_rank tetap membeli gainer teratas');
      assert.equal(pos.symbol, 'aaa');
    } finally {
      cleanMyRows();
      restoreStubs();
    }
  });

  test('selectMomentumCandidate: tie-break keragaman dalam 2.0 poin (murni)', () => {
    const mkCandidate = (symbol: string, score: number, gain24h: number): MomentumCandidateInput => ({
      symbol,
      gain24h,
      volIdr: 1e9,
      last: 100,
      dropFromHigh: 1,
      score: { symbol, strategy: 'momentum', score, breakdown: {} } as ScoreResult,
    });

    // Dua kandidat lolos ambang: 70 vs 69 (jarak 1.0 ≤ 2.0) → pilih yang TIDAK baru ditradingkan.
    const a = mkCandidate('aaa', 70, 5);
    const b = mkCandidate('bbb', 69, 9);
    const sel = selectMomentumCandidate({
      mode: 'composite_score',
      profile: 'balanced',
      candidates: [a, b],
      isAlreadyHoldingMeme: false,
      recentlyTradedSymbols: new Set(['aaa']),
    });
    assert.ok(sel);
    assert.equal(sel.symbol, 'bbb', 'kandidat segar harus menang dalam jarak 2.0 poin');

    // Tanpa recentlyTraded → skor tertinggi menang.
    const sel2 = selectMomentumCandidate({
      mode: 'composite_score',
      profile: 'balanced',
      candidates: [a, b],
      isAlreadyHoldingMeme: false,
    });
    assert.equal(sel2?.symbol, 'aaa');

    // Jarak > 2.0 poin → tie-break TIDAK berlaku.
    const c = mkCandidate('ccc', 67.5, 15);
    const sel3 = selectMomentumCandidate({
      mode: 'composite_score',
      profile: 'balanced',
      candidates: [a, c],
      isAlreadyHoldingMeme: false,
      recentlyTradedSymbols: new Set(['aaa']),
    });
    assert.equal(sel3?.symbol, 'aaa', 'jarak 2.5 poin > 2.0 → kandidat terbaru tidak merebut');

    // Semua kandidat baru ditradingkan → tetap pilih skor tertinggi (nudge, bukan veto).
    const sel4 = selectMomentumCandidate({
      mode: 'composite_score',
      profile: 'balanced',
      candidates: [a, b],
      isAlreadyHoldingMeme: false,
      recentlyTradedSymbols: new Set(['aaa', 'bbb']),
    });
    assert.equal(sel4?.symbol, 'aaa');
  });

  test('GET /api/market/radar mengembalikan snapshot terpersistensi (publik)', async () => {
    db.prepare('DELETE FROM market_screener').run();

    const app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Belum ada snapshot → array kosong, ts 0
      let res = await fetch(`${baseUrl}/api/market/radar`);
      assert.equal(res.status, 200);
      let body: any = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.ts, 0);
      assert.deepEqual(body.data.candidates, []);
      assert.equal(body.data.breadth.percent, 0);
      assert.equal(body.data.breadth.sampleSize, 0);

      // Dua snapshot: yang lama harus diabaikan, yang terbaru dikembalikan
      const oldTs = Date.now() - 60_000;
      const newTs = Date.now() - 10_000;
      const insert = db.prepare(`
        INSERT INTO market_screener (id, ts, symbol, rank, cheap_score, gain24h, vol_idr, breadth_percent, breadth_sample, reasons_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insert.run('radar_old_1', oldTs, 'old', 1, 0.5, 5, 1e9, 10, 20, '["momentum sehat"]');
      insert.run('radar_new_1', newTs, 'sol', 1, 0.94, 9.3, 12850000000, 62.5, 20, '["momentum sehat","volume besar"]');
      insert.run('radar_new_2', newTs, 'sui', 2, 0.79, 12.7, 5120000000, 62.5, 20, '["momentum sehat","gain kuat di dalam pita"]');

      res = await fetch(`${baseUrl}/api/market/radar`); // tanpa auth → publik
      assert.equal(res.status, 200);
      body = await res.json();
      assert.equal(body.data.ts, newTs);
      assert.equal(body.data.breadth.percent, 62.5);
      assert.equal(body.data.breadth.sampleSize, 20);
      assert.equal(body.data.candidates.length, 2);
      assert.equal(body.data.candidates[0].symbol, 'sol');
      assert.equal(body.data.candidates[0].cheapScore, 0.94);
      assert.equal(body.data.candidates[0].volIdr, 12850000000);
      assert.deepEqual(body.data.candidates[0].reasons, ['momentum sehat', 'volume besar']);
      assert.equal(body.data.candidates[1].rank, 2);
    } finally {
      db.prepare('DELETE FROM market_screener').run();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('pruneOldData menghapus baris market_screener lebih tua dari 7 hari', () => {
    db.prepare('DELETE FROM market_screener').run();
    const now = Date.now();
    const insert = db.prepare(`
      INSERT INTO market_screener (id, ts, symbol, rank, cheap_score, gain24h, vol_idr, breadth_percent, breadth_sample, reasons_json)
      VALUES (?, ?, ?, 1, 0.5, 5, 1000000000, 50, 20, '[]')
    `);
    insert.run('radar_old', now - 8 * 24 * 3_600_000, 'oldcoin');
    insert.run('radar_fresh', now - 1 * 3_600_000, 'newcoin');

    try {
      engine.pruneOldData();
      const old = db.prepare("SELECT COUNT(*) AS c FROM market_screener WHERE id = 'radar_old'").get() as { c: number };
      const fresh = db.prepare("SELECT COUNT(*) AS c FROM market_screener WHERE id = 'radar_fresh'").get() as { c: number };
      assert.equal(old.c, 0, 'baris > 7 hari harus dihapus');
      assert.equal(fresh.c, 1, 'baris segar harus tetap');
    } finally {
      db.prepare('DELETE FROM market_screener').run();
    }
  });

  test('radar persistensi via runLoop tetap hidup saat bot pause + anti-spam snapshot', async () => {
    markRowids();
    db.prepare('DELETE FROM market_screener').run();
    applySettings({ is_auto_trading_active: '0' }); // bot pause
    (indodax as any).pingDeadmanSwitch = async () => {};

    const tickers: Record<string, IndodaxSummaryTicker> = {
      sol_idr: momentumTickerPair('sol', 9, 12850000000),
      sui_idr: momentumTickerPair('sui', 12, 5120000000),
      dec01_idr: ticker(100, 90, 101, 1e9),
      dec02_idr: ticker(100, 90, 101, 2e9),
    };
    const prices_24h: Record<string, string> = {
      solidr: '90',
      suiidr: '90',
      dec01idr: '120',
      dec02idr: '120',
    };
    stubSummaries({ tickers, prices_24h });

    try {
      await engine.runLoop();
      const rows1 = db.prepare('SELECT * FROM market_screener ORDER BY rank ASC').all() as any[];
      assert.ok(rows1.length >= 2, 'radar harus terpersist saat bot pause');
      assert.equal(rows1[0].symbol, 'sol');
      assert.ok(rows1[0].breadth_percent > 0);
      assert.ok(rows1[0].breadth_sample >= 3);

      // Siklus kedua dengan data identik → TIDAK menulis baris baru (anti-spam)
      await engine.runLoop();
      const rows2 = db.prepare('SELECT COUNT(*) AS c FROM market_screener').get() as { c: number };
      assert.equal(rows2.c, rows1.length, 'snapshot identik tidak boleh ditulis ulang');

      // Data berubah (kandidat baru masuk) → snapshot baru ditulis
      tickers['avax_idr'] = momentumTickerPair('avax', 7, 9800000000);
      prices_24h['avaxidr'] = '90';
      await engine.runLoop();
      const rows3 = db.prepare('SELECT COUNT(*) AS c FROM market_screener').get() as { c: number };
      assert.ok(rows3.c > rows2.c, 'snapshot baru harus ditulis saat komposisi berubah');
      const hasAvax = db.prepare("SELECT COUNT(*) AS c FROM market_screener WHERE symbol = 'avax'").get() as { c: number };
      assert.equal(hasAvax.c, 1);
    } finally {
      cleanMyRows();
      restoreStubs();
    }
  });
});
