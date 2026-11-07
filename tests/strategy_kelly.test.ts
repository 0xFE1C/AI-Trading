import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { strategyKellyFactor } from '../src/services/trading/strategyKelly.js';
import { TradingEngine } from '../src/services/trading/index.js';
import { indodax, IndodaxSummaryTicker } from '../src/services/indodax/index.js';
import { indodaxMarketStream } from '../src/services/indodax/marketStream.js';

/**
 * Test Strategy-level Kelly Governor:
 *  - Matriks murni strategyKellyFactor (threshold dicerminkan persis dari
 *    faktor Kelly global: <0.35 → 0.6, >=0.65 → 1.2, <6 trade → 1.0).
 *  - Integrasi engine: alokasi paper buy terlihat mengecil untuk strategi
 *    yang kalah vs netral (lewat scanAndExecuteEntries penuh, stub bursa).
 */

describe('strategyKellyFactor — matriks murni (mirror threshold Kelly global)', () => {
  const wins = (n: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ pnlPercent: i < n ? 5 : -3 }));

  test('kosong / < 6 trade → tepat 1.0 (belum cukup bukti)', () => {
    assert.equal(strategyKellyFactor([]), 1.0);
    assert.equal(strategyKellyFactor([{ pnlPercent: 5 }]), 1.0);
    assert.equal(strategyKellyFactor(wins(5, 5)), 1.0, '5 trade SEMUA menang tetap 1.0 (< 6 trade)');
    assert.equal(strategyKellyFactor(wins(0, 5)), 1.0, '5 trade SEMUA rugi tetap 1.0 (< 6 trade)');
  });

  test('win rate < 0.35 → 0.6', () => {
    assert.equal(strategyKellyFactor(wins(0, 6)), 0.6, '6 trade, 0 menang (0.0)');
    assert.equal(strategyKellyFactor(wins(2, 6)), 0.6, '6 trade, 2 menang (0.333)');
    assert.equal(strategyKellyFactor(wins(17, 50)), 0.6, '50 trade, 17 menang (0.34)');
  });

  test('win rate >= 0.65 → 1.2', () => {
    assert.equal(strategyKellyFactor(wins(4, 6)), 1.2, '6 trade, 4 menang (0.667)');
    assert.equal(strategyKellyFactor(wins(13, 20)), 1.2, '20 trade, 13 menang (0.65 — batas bawah inklusif)');
    assert.equal(strategyKellyFactor(wins(6, 6)), 1.2, '6 trade semua menang (1.0)');
  });

  test('win rate 0.35 s/d < 0.65 → 1.0', () => {
    assert.equal(strategyKellyFactor(wins(7, 20)), 1.0, '20 trade, 7 menang (0.35 — tepat di ambang, netral)');
    assert.equal(strategyKellyFactor(wins(3, 6)), 1.0, '6 trade, 3 menang (0.5)');
    assert.equal(strategyKellyFactor(wins(32, 50)), 1.0, '50 trade, 32 menang (0.64)');
  });
});

// --- Integrasi engine --------------------------------------------------------

const engine = new TradingEngine();

const originalGetSummaries = indodax.getSummaries;
const originalGetDepth = indodax.getDepth;
const originalGetRealCandles = indodaxMarketStream.getRealCandles;
const originalPingDeadmanSwitch = (indodax as any).pingDeadmanSwitch;

function stubSummaries(payload: any) {
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

function ticker(last: number, low: number, high: number, vol: number): IndodaxSummaryTicker {
  return {
    name: 'Test',
    last: String(last),
    high: String(high),
    low: String(low),
    vol_idr: String(vol),
    buy: String(last * 0.999),
    sell: String(last * 1.001),
    server_time: Date.now(),
  };
}

/** Kandidat momentum likuid: last 100, gain24h ~8%, volume besar. */
function momentumPair(symbol: string): IndodaxSummaryTicker {
  return ticker(100, 100 / 1.08, 101, 5e8);
}

/** Candle 15m momentum (RSI ~63, lonjakan volume di akhir). */
function momentumCandles15m(n = 30): any[] {
  const candles: any[] = [];
  let close = 100;
  for (let i = 0; i < n; i++) {
    const open = close;
    close = i % 2 === 0 ? open * 1.015 : open * 0.992;
    candles.push({
      timestamp: Date.now() - (n - i) * 900_000,
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
      volume: i >= n - 4 ? 800 : 100,
    });
  }
  return candles;
}

const LIQUID_DEPTH = { buy: [['99.9', '100000']], sell: [['100', '100000']] };

/** Seed N posisi tertutup dengan entry_strategy, PnL, dan umur (menit) tertentu. */
function seedClosedAt(strategy: string | null, symbol: string, count: number, pnlIdr: number, ageMinutes: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `kelly_${symbol}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
    const closedAt = Date.now() - (ageMinutes * 60_000 + i * 60_000);
    db.prepare(`
      INSERT INTO positions (id, symbol, base_currency, traded_currency, side, entry_price, current_price, amount,
        initial_cost_idr, highest_price, trailing_stop_price, take_profit_step, status, opened_at, closed_at,
        pnl_idr, pnl_percent, realized_pnl_idr, entry_strategy, mode)
      VALUES (?, ?, 'idr', ?, 'buy', 100, 100, 1000, 100000, 100, 99, 0, 'closed', ?, ?, ?, ?, 0, ?, 'paper')
    `).run(id, symbol, symbol.replace(/idr$/, ''), closedAt - 60_000, closedAt, pnlIdr, (pnlIdr / 100000) * 100, strategy);
    ids.push(id);
  }
  return ids;
}

function cleanupPositions(ids: string[]) {
  for (const id of ids) {
    db.prepare('DELETE FROM trades_history WHERE position_id = ?').run(id);
    db.prepare('DELETE FROM positions WHERE id = ?').run(id);
  }
}

function cleanupOpenBySymbol(symbol: string) {
  const rows = db.prepare('SELECT id FROM positions WHERE symbol = ?').all(symbol) as Array<{ id: string }>;
  for (const r of rows) {
    db.prepare('DELETE FROM trades_history WHERE position_id = ?').run(r.id);
    db.prepare('DELETE FROM positions WHERE id = ?').run(r.id);
  }
}

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
  'strategy_kelly_enabled',
];
const settingsSnapshot: Record<string, string> = {};
for (const k of SETTINGS_KEYS) settingsSnapshot[k] = getSetting(k, '');

describe('Strategy Kelly Governor — integrasi engine (paper buy terlihat terskala)', () => {
  test('strategi kalah → alokasi dibungkus faktor 0.6 SETELAH faktor Kelly global; nonaktif → hanya global', async () => {
    // 20 trade momentum TERAKHIR semuanya rugi:
    //  - Kelly GLOBAL (pnl_idr) : winRate 0 < 0.35 → x0.6 → 100000 → 60000
    //  - Kelly STRATEGI (baru)  : momentum winRate 0 < 0.35 → x0.6 → 60000 → 36000
    const seeded = seedClosedAt('momentum', 'kellyseedidr', 20, -1000, 0);
    cleanupOpenBySymbol('aaa');
    cleanupOpenBySymbol('bbb');

    setSetting('trading_mode', 'paper');
    setSetting('is_auto_trading_active', '1');
    setSetting('ai_mode', 'off');
    setSetting('risk_profile', 'balanced');
    setSetting('entry_scoring_mode', 'composite_score');
    setSetting('allow_new_listings', '1');
    setSetting('allowed_coins_only', '');
    setSetting('min_24h_volume_idr', '200000000');
    setSetting('max_allocation_per_trade_idr', '100000');
    setSetting('max_active_trades', '3');
    setSetting('market_breadth_min_percent', '0');
    setSetting('reentry_cooldown_hours', '0');
    setSetting('paper_idr_balance', '10000000');
    setSetting('strategy_kelly_enabled', '1');

    const tickers: Record<string, IndodaxSummaryTicker> = {
      aaa_idr: momentumPair('aaa'),
      bbb_idr: momentumPair('bbb'),
    };
    stubSummaries({ tickers, prices_24h: {} });
    stubRealCandles((_pair, tf) => (tf === '15m' ? momentumCandles15m() : []));
    stubDepth(() => LIQUID_DEPTH);

    try {
      // Run 1: strategy_kelly_enabled=1 → 100000 x0.6 (global) x0.6 (strategi) = 36000
      await (engine as any).scanAndExecuteEntries();
      const pos1 = db.prepare("SELECT id, initial_cost_idr, entry_strategy FROM positions WHERE symbol = 'aaa' ORDER BY opened_at DESC LIMIT 1").get() as any;
      assert.ok(pos1, 'engine harus membuka posisi paper untuk kandidat momentum');
      assert.equal(pos1.entry_strategy, 'momentum');
      assert.equal(pos1.initial_cost_idr, 36000, `alokasi harus 36000 (global 0.6 lalu strategi 0.6), dapat ${pos1.initial_cost_idr}`);

      // Run 2: strategy_kelly_enabled=0 → hanya faktor global → 60000
      setSetting('strategy_kelly_enabled', '0');
      await (engine as any).scanAndExecuteEntries();
      const pos2 = db.prepare("SELECT id, initial_cost_idr, entry_strategy FROM positions WHERE symbol = 'bbb' ORDER BY opened_at DESC LIMIT 1").get() as any;
      assert.ok(pos2, 'run kedua harus membuka posisi paper');
      assert.equal(pos2.initial_cost_idr, 60000, `alokasi tanpa strategy Kelly harus 60000 (global saja), dapat ${pos2.initial_cost_idr}`);
    } finally {
      restoreStubs();
      cleanupPositions(seeded);
      cleanupOpenBySymbol('aaa');
      cleanupOpenBySymbol('bbb');
      for (const [k, v] of Object.entries(settingsSnapshot)) setSetting(k, v);
    }
  });

  test('strategi netral (win rate 0.5) → faktor 1.0 meski Kelly global aktif mengecilkan', async () => {
    // Global Kelly membaca 20 trade TERAKHIR lintas strategi: seed 'new_listing'
    // yang SEMUA rugi & LEBIH BARU → global x0.6. Trade momentum (10W/10L,
    // winRate 0.5) lebih tua → faktor strategi momentum = 1.0 → alokasi 60000
    // (global saja, TANPA penalti strategi tambahan).
    const globalSeed = seedClosedAt('new_listing', 'kellygseedidr', 20, -1000, 0);
    const momentumSeed = seedClosedAt('momentum', 'kellyw1idr', 10, 1500, 60);
    momentumSeed.push(...seedClosedAt('momentum', 'kellyw2idr', 10, -1000, 80));
    cleanupOpenBySymbol('ccc');

    setSetting('trading_mode', 'paper');
    setSetting('is_auto_trading_active', '1');
    setSetting('ai_mode', 'off');
    setSetting('risk_profile', 'balanced');
    setSetting('entry_scoring_mode', 'composite_score');
    setSetting('allow_new_listings', '1');
    setSetting('allowed_coins_only', '');
    setSetting('min_24h_volume_idr', '200000000');
    setSetting('max_allocation_per_trade_idr', '100000');
    setSetting('max_active_trades', '3');
    setSetting('market_breadth_min_percent', '0');
    setSetting('reentry_cooldown_hours', '0');
    setSetting('paper_idr_balance', '10000000');
    setSetting('strategy_kelly_enabled', '1');

    const tickers: Record<string, IndodaxSummaryTicker> = { ccc_idr: momentumPair('ccc') };
    stubSummaries({ tickers, prices_24h: {} });
    stubRealCandles((_pair, tf) => (tf === '15m' ? momentumCandles15m() : []));
    stubDepth(() => LIQUID_DEPTH);

    try {
      await (engine as any).scanAndExecuteEntries();
      const pos = db.prepare("SELECT initial_cost_idr FROM positions WHERE symbol = 'ccc' ORDER BY opened_at DESC LIMIT 1").get() as any;
      assert.ok(pos, 'engine harus membuka posisi paper');
      assert.equal(pos.initial_cost_idr, 60000, `strategi netral tidak boleh menambah penalti (global 0.6 saja), dapat ${pos.initial_cost_idr}`);
    } finally {
      restoreStubs();
      cleanupPositions(globalSeed);
      cleanupPositions(momentumSeed);
      cleanupOpenBySymbol('ccc');
      for (const [k, v] of Object.entries(settingsSnapshot)) setSetting(k, v);
    }
  });

  test('applyStrategyKelly: manual / unknown / null TIDAK PERNAH ditune meski jelek', () => {
    const seeded = [
      ...seedClosedAt('manual', 'kellymanidr', 20, -1000, 0),
      ...seedClosedAt('momentum', 'kellymomseedidr', 20, -1000, 2),
    ];
    try {
      setSetting('strategy_kelly_enabled', '1');
      const manual = engine.applyStrategyKelly(100000, 'manual');
      assert.deepEqual(manual, { allocationIdr: 100000, factor: 1.0 }, 'manual harus faktor 1.0');

      const unknown = engine.applyStrategyKelly(100000, undefined);
      assert.deepEqual(unknown, { allocationIdr: 100000, factor: 1.0 }, 'strategi tak dikenal harus faktor 1.0');

      const nullish = engine.applyStrategyKelly(100000, null);
      assert.deepEqual(nullish, { allocationIdr: 100000, factor: 1.0 }, 'null (baris legacy) harus faktor 1.0');

      // Momentum yang kalah → 0.6; floor Rp 10.000: alokasi kecil tidak boleh
      // jatuh di bawah floor.
      const losing = engine.applyStrategyKelly(100000, 'momentum');
      assert.equal(losing.factor, 0.6);
      assert.equal(losing.allocationIdr, 60000);
      const floored = engine.applyStrategyKelly(12000, 'momentum');
      assert.equal(floored.factor, 0.6);
      assert.equal(floored.allocationIdr, 10000, 'alokasi hasil faktor tidak boleh di bawah Rp 10.000');

      // Fitur mati → faktor netral meski strategi kalah
      setSetting('strategy_kelly_enabled', '0');
      const off = engine.applyStrategyKelly(100000, 'momentum');
      assert.deepEqual(off, { allocationIdr: 100000, factor: 1.0 }, 'strategy_kelly_enabled=0 harus menonaktifkan governor');
    } finally {
      cleanupPositions(seeded);
      setSetting('strategy_kelly_enabled', '1');
    }
  });
});
