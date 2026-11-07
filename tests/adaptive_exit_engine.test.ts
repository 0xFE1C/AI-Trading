import { test, describe } from 'node:test';
import assert from 'node:assert';
import { TradingEngine, PositionRecord } from '../src/services/trading/index.js';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { indodax } from '../src/services/indodax/index.js';
import { calculateTrueATR } from '../src/utils/indicators.js';
import {
  computeExitPlan,
  parseStoredExitPlan,
  buildLegacyPlan,
  ExitPlanInput,
} from '../src/services/trading/adaptiveExit.js';
import { backtestEngine, BacktestBar } from '../src/services/backtest/index.js';
import { portfolioBacktestEngine } from '../src/services/backtest/portfolio.js';
import type { PortfolioBacktestParams } from '../src/services/backtest/portfolio.js';

const LEGACY_INPUT: ExitPlanInput = {
  atrPct: null,
  regime: null,
  volumeSurgeRatio: null,
  depthImbalance: null,
  isBluechip: false,
  baseTp1Pct: 5.0,
  baseTp2Pct: 10.0,
  baseTrailingPct: 2.5,
};

interface PlanPositionOptions {
  symbol?: string;
  entryPrice?: number;
  amount?: number;
  costIdr?: number;
  trailingStopPrice?: number;
  takeProfitStep?: number;
  openedAt?: number;
  highestPrice?: number;
  planJson?: string | null;
  mode?: 'paper' | 'live';
}

function insertPlanPosition(opts: PlanPositionOptions = {}): PositionRecord {
  const entry = opts.entryPrice ?? 100;
  const amount = opts.amount ?? 1000;
  const pos: PositionRecord = {
    id: `pos_adapt_${Math.random().toString(36).slice(2, 10)}`,
    symbol: opts.symbol || `adaptest${Math.random().toString(36).slice(2, 6)}idr`,
    base_currency: 'idr',
    traded_currency: (opts.symbol || 'adaptest').replace(/idr$/, ''),
    side: 'buy',
    entry_price: entry,
    current_price: opts.highestPrice ?? entry,
    amount,
    initial_cost_idr: opts.costIdr ?? entry * amount,
    highest_price: opts.highestPrice ?? entry,
    trailing_stop_price: opts.trailingStopPrice ?? entry * 0.9,
    take_profit_step: opts.takeProfitStep ?? 0,
    status: 'open',
    opened_at: opts.openedAt ?? Date.now(),
    closed_at: null,
    pnl_idr: 0,
    pnl_percent: 0,
    realized_pnl_idr: 0,
    exit_plan_json: opts.planJson ?? null,
    exit_reason: null,
    mode: opts.mode ?? 'paper',
  };

  db.prepare(`
    INSERT INTO positions (
      id, symbol, base_currency, traded_currency, side, entry_price, current_price,
      amount, initial_cost_idr, highest_price, trailing_stop_price, take_profit_step,
      status, opened_at, realized_pnl_idr, mode, exit_plan_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pos.id, pos.symbol, pos.base_currency, pos.traded_currency, pos.side,
    pos.entry_price, pos.current_price, pos.amount, pos.initial_cost_idr,
    pos.highest_price, pos.trailing_stop_price, pos.take_profit_step,
    pos.status, pos.opened_at, pos.realized_pnl_idr ?? 0, pos.mode, pos.exit_plan_json ?? null
  );

  return pos;
}

function cleanupPosition(id: string) {
  db.prepare('DELETE FROM trades_history WHERE position_id = ?').run(id);
  db.prepare('DELETE FROM positions WHERE id = ?').run(id);
}

/** Simpan & pulihkan setting untuk satu test (pola sama dengan trading.test.ts). */
function captureSettings(keys: string[]): Record<string, string> {
  const saved: Record<string, string> = {};
  for (const key of keys) saved[key] = getSetting(key, '');
  return saved;
}

function restoreSettings(saved: Record<string, string>) {
  for (const [key, value] of Object.entries(saved)) setSetting(key, value);
}

describe('Adaptive Exit — plan persistence at buy time', () => {
  test('executeBuy persists exit_plan_json with expected fields and uses plan trailing percent', async (t) => {
    const saved = captureSettings(['paper_idr_balance', 'adaptive_exit_enabled']);
    setSetting('paper_idr_balance', '10000000');
    setSetting('adaptive_exit_enabled', '1');

    const engine = new TradingEngine();
    let buyEventData: any = null;
    engine.setTradeCallback(async (event) => {
      if (event.type === 'BUY') buyEventData = event.data;
    });

    // ATR 6% → volFactor 2 (cap), RISK_ON → TP 1.25x → TP1 12.5%, TP2 25%,
    // trailing = min(2.5*2*1.15=5.75, 2x base=5) = 5
    const plan = computeExitPlan({
      ...LEGACY_INPUT,
      atrPct: 6,
      regime: 'RISK_ON',
      volumeSurgeRatio: 2.0,
    });

    try {
      const ok = await engine.executeBuy('adaptivebuy_idr', 1000, 100, 100000, 'paper', 'unit test adaptive plan', plan);
      assert.equal(ok, true);

      const row = db
        .prepare("SELECT * FROM positions WHERE symbol = 'adaptivebuy_idr' AND status = 'open' ORDER BY opened_at DESC LIMIT 1")
        .get() as any;
      assert.ok(row, 'position must exist');
      t.after(() => {
        cleanupPosition(row.id);
        restoreSettings(saved);
      });

      const stored = parseStoredExitPlan(row.exit_plan_json);
      assert.ok(stored, 'exit_plan_json must be present and parseable');
      assert.equal(stored!.tp1Pct, 12.5);
      assert.equal(stored!.tp2Pct, 25);
      assert.equal(stored!.trailingPct, 5);
      assert.equal(stored!.legacy, false);
      assert.equal(stored!.regime, 'RISK_ON');
      assert.ok(stored!.rationale.length >= 2, 'rationale harus berisi faktor ATR + rezim');

      // Trailing awal datang dari plan (5%), BUKAN setting global 2.5%
      assert.ok(Math.abs(row.trailing_stop_price - 950) < 1e-6, `trailing_stop_price ${row.trailing_stop_price} harus ~950`);

      assert.ok(buyEventData, 'BUY event harus dipancarkan');
      assert.ok(String(buyEventData.exitPlanLine).includes('(adaptif)'));
      assert.ok(String(buyEventData.exitPlanLine).includes('TP1 12.5%'));
    } catch (err) {
      restoreSettings(saved);
      throw err;
    }
  });

  test("adaptive_exit_enabled='0' stores an exact legacy plan (byte-identical behavior)", async (t) => {
    const saved = captureSettings(['paper_idr_balance', 'adaptive_exit_enabled']);
    setSetting('paper_idr_balance', '10000000');
    setSetting('adaptive_exit_enabled', '0');

    const engine = new TradingEngine();
    let buyEventData: any = null;
    engine.setTradeCallback(async (event) => {
      if (event.type === 'BUY') buyEventData = event.data;
    });

    try {
      // Beli manual tanpa plan eksplisit → engine membangun fallback legacy
      const ok = await engine.executeBuy('legacybuy_idr', 1000, 100, 100000, 'paper', 'unit test legacy');
      assert.equal(ok, true);

      const row = db
        .prepare("SELECT * FROM positions WHERE symbol = 'legacybuy_idr' AND status = 'open' ORDER BY opened_at DESC LIMIT 1")
        .get() as any;
      assert.ok(row);
      t.after(() => {
        cleanupPosition(row.id);
        restoreSettings(saved);
      });

      const stored = parseStoredExitPlan(row.exit_plan_json);
      assert.ok(stored);
      const legacy = buildLegacyPlan({ baseTp1Pct: 5.0, baseTp2Pct: 10.0, baseTrailingPct: 2.5 });
      assert.deepStrictEqual(stored, legacy, 'plan tersimpan harus identik fallback legacy persis setting');
      assert.ok(Math.abs(row.trailing_stop_price - 975) < 1e-6, 'trailing awal 2.5% legacy');
      assert.ok(String(buyEventData.exitPlanLine).includes('(standar)'));
    } catch (err) {
      restoreSettings(saved);
      throw err;
    }
  });
});

describe('Adaptive Exit — engine consumes the per-position plan', () => {
  test('tick path exits at plan.tp1Pct: widened 7.5% target does NOT exit at +5% but does at +7.5%', async (t) => {
    const saved = captureSettings([
      'take_profit_target_1_percent',
      'take_profit_target_2_percent',
      'trading_fee_percent',
      'adaptive_exit_enabled',
    ]);
    // Setting sengaja 5%: posisi ber-plan 7.5% HARUS mengabaikannya
    setSetting('take_profit_target_1_percent', '5.0');
    setSetting('take_profit_target_2_percent', '10.0');
    setSetting('trading_fee_percent', '0');
    setSetting('adaptive_exit_enabled', '1');

    // ATR 3% → volFactor 1.5 → TP1 7.5%, TP2 15%, trailing min(3.75, 5) = 3.75
    const plan = computeExitPlan({ ...LEGACY_INPUT, atrPct: 3, regime: 'NEUTRAL' });
    assert.equal(plan.tp1Pct, 7.5);

    const pos = insertPlanPosition({
      planJson: JSON.stringify(plan),
      trailingStopPrice: 100 * (1 - plan.trailingPct / 100),
    });
    const engine = new TradingEngine();

    t.after(() => {
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    // +5% gross: di bawah target plan 7.5% → TIDAK boleh exit TP1
    await engine.handleRealtimeTick({ pair: pos.symbol, price: 105, volume: 1, timestamp: Date.now() });
    let row = db.prepare('SELECT amount, take_profit_step, status FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.take_profit_step, 0, 'plan TP1 7.5% tidak boleh menyala di +5% meski setting 5%');
    assert.equal(row.amount, 1000);
    assert.equal(row.status, 'open');

    // +7.5% gross: menyentuh target plan → TP1 scale-out 50%
    await engine.handleRealtimeTick({ pair: pos.symbol, price: 107.5, volume: 1, timestamp: Date.now() });
    row = db.prepare('SELECT amount, take_profit_step, status, realized_pnl_idr FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.take_profit_step, 1, 'plan TP1 7.5% harus menyala di +7.5%');
    assert.equal(row.amount, 500);
    assert.equal(row.status, 'open');
    assert.ok(row.realized_pnl_idr > 0);
  });

  test('tick path honors plan tp2Pct=null (TP2 off for that position even if setting enables it)', async (t) => {
    const saved = captureSettings(['take_profit_target_1_percent', 'take_profit_target_2_percent', 'trading_fee_percent']);
    setSetting('take_profit_target_1_percent', '5.0');
    setSetting('take_profit_target_2_percent', '10.0');
    setSetting('trading_fee_percent', '0');

    const plan = { ...buildLegacyPlan({ baseTp1Pct: 5, baseTp2Pct: null, baseTrailingPct: 2.5 }) };
    const pos = insertPlanPosition({ planJson: JSON.stringify(plan), takeProfitStep: 1, trailingStopPrice: 100 });
    const engine = new TradingEngine();

    t.after(() => {
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    // +15% gross: TP2 setting 10% akan menyala, tapi plan posisi mematikan TP2
    await engine.handleRealtimeTick({ pair: pos.symbol, price: 115, volume: 1, timestamp: Date.now() });
    const row = db.prepare('SELECT amount, take_profit_step, status FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.take_profit_step, 1, 'TP2 harus tetap off untuk plan dengan tp2Pct null');
    assert.equal(row.amount, 1000, 'tidak boleh ada jualan TP2');
    assert.equal(row.status, 'open');
  });

  test('corrupt exit_plan_json falls back safely to global settings (legacy behavior)', async (t) => {
    const saved = captureSettings(['take_profit_target_1_percent', 'take_profit_target_2_percent', 'trading_fee_percent']);
    setSetting('take_profit_target_1_percent', '5.0');
    setSetting('take_profit_target_2_percent', '10.0');
    setSetting('trading_fee_percent', '0');

    const pos = insertPlanPosition({ planJson: '{{{corrupt json!!' });
    const engine = new TradingEngine();

    t.after(() => {
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    // +6% gross: hanya TP1 setting 5% yang bisa menyala (fallback berhasil)
    await engine.handleRealtimeTick({ pair: pos.symbol, price: 106, volume: 1, timestamp: Date.now() });
    const row = db.prepare('SELECT amount, take_profit_step, status FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.take_profit_step, 1, 'fallback setting harus tetap mengeksekusi TP1');
    assert.equal(row.amount, 500);
    assert.equal(row.status, 'open');
  });

  test('exit_plan_json with invalid numbers is rejected and falls back to settings', async (t) => {
    const saved = captureSettings(['take_profit_target_1_percent', 'take_profit_target_2_percent', 'trading_fee_percent']);
    setSetting('take_profit_target_1_percent', '5.0');
    setSetting('take_profit_target_2_percent', '10.0');
    setSetting('trading_fee_percent', '0');

    const pos = insertPlanPosition({ planJson: '{"tp1Pct": -3, "trailingPct": 0, "tp2Pct": 10}' });
    const engine = new TradingEngine();

    t.after(() => {
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    await engine.handleRealtimeTick({ pair: pos.symbol, price: 106, volume: 1, timestamp: Date.now() });
    const row = db.prepare('SELECT amount, take_profit_step FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.take_profit_step, 1, 'plan dengan angka tidak masuk akal dibuang → fallback setting 5%');
    assert.equal(row.amount, 500);
  });
});

describe('Adaptive Exit — stagnation exit (rotasi modal, jalur polling saja)', () => {
  function mockTicker(price: number) {
    const original = indodax.getTicker;
    indodax.getTicker = (async (_symbol: string) => ({
      ticker: { last: String(price) },
    })) as any;
    return () => {
      indodax.getTicker = original;
    };
  }

  test('stagnation exit fires after max_hold_hours for a flat position', async (t) => {
    const saved = captureSettings(['max_hold_hours', 'trading_fee_percent', 'take_profit_target_1_percent']);
    setSetting('max_hold_hours', '48');
    setSetting('trading_fee_percent', '0'); // PnL net flat = 0% (dalam rentang -1%..+1.5%)
    setSetting('take_profit_target_1_percent', '5.0');

    const pos = insertPlanPosition({
      openedAt: Date.now() - 49 * 3600 * 1000, // 49 jam > 48 jam
      trailingStopPrice: 90, // jauh di bawah harga → tidak ada trailing exit
    });
    const engine = new TradingEngine();
    const restoreTicker = mockTicker(100);

    t.after(() => {
      restoreTicker();
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    await (engine as any).manageOpenPositions();

    const row = db.prepare('SELECT status, exit_reason FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.status, 'closed', 'posisi stagnan harus dieksit penuh');
    assert.ok(String(row.exit_reason).includes('Stagnasi >48 jam'), row.exit_reason);
    assert.ok(String(row.exit_reason).includes('realokasi modal'), row.exit_reason);
  });

  test('stagnation exit does NOT fire for a winner (+10% net)', async (t) => {
    const saved = captureSettings(['max_hold_hours', 'trading_fee_percent', 'take_profit_target_1_percent']);
    setSetting('max_hold_hours', '48');
    setSetting('trading_fee_percent', '0');
    setSetting('take_profit_target_1_percent', '50'); // matikan TP1 agar winner tidak scale-out

    const pos = insertPlanPosition({
      openedAt: Date.now() - 49 * 3600 * 1000,
      trailingStopPrice: 90,
    });
    const engine = new TradingEngine();
    const restoreTicker = mockTicker(110); // +10% net → winner

    t.after(() => {
      restoreTicker();
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    await (engine as any).manageOpenPositions();

    const row = db.prepare('SELECT status, exit_reason FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.status, 'open', 'winner terus berjalan, tidak di-rotasi');
    assert.equal(row.exit_reason, null);
  });

  test('stagnation exit does NOT fire for a loser beyond -1% (waits for trailing stop)', async (t) => {
    const saved = captureSettings(['max_hold_hours', 'trading_fee_percent', 'take_profit_target_1_percent']);
    setSetting('max_hold_hours', '48');
    setSetting('trading_fee_percent', '0');
    setSetting('take_profit_target_1_percent', '50');

    const pos = insertPlanPosition({
      openedAt: Date.now() - 49 * 3600 * 1000,
      trailingStopPrice: 90, // 2% drawdown masih di atas stop → menunggu
    });
    const engine = new TradingEngine();
    const restoreTicker = mockTicker(98); // -2% net → drawdown di luar rentang stagnasi

    t.after(() => {
      restoreTicker();
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    await (engine as any).manageOpenPositions();

    const row = db.prepare('SELECT status, exit_reason FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.status, 'open', 'loss > -1% tetap menunggu trailing stop, bukan panik-jual');
    assert.equal(row.exit_reason, null);
  });

  test('stagnation boundary: exactly -1.0% net IS inside the window (fires)', async (t) => {
    const saved = captureSettings(['max_hold_hours', 'trading_fee_percent', 'take_profit_target_1_percent']);
    setSetting('max_hold_hours', '48');
    setSetting('trading_fee_percent', '0');
    setSetting('take_profit_target_1_percent', '50');

    const pos = insertPlanPosition({
      openedAt: Date.now() - 49 * 3600 * 1000,
      trailingStopPrice: 90,
    });
    const engine = new TradingEngine();
    const restoreTicker = mockTicker(99); // -1.0% net tepat — window inclusif

    t.after(() => {
      restoreTicker();
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    await (engine as any).manageOpenPositions();

    const row = db.prepare('SELECT status, exit_reason FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.status, 'closed', 'tepat -1.0% masih di dalam jendela stagnasi (inklusif)');
    assert.ok(String(row.exit_reason).includes('Stagnasi'), row.exit_reason);
  });

  test('stagnation boundary: exactly +1.5% net IS inside the window (fires)', async (t) => {
    const saved = captureSettings(['max_hold_hours', 'trading_fee_percent', 'take_profit_target_1_percent']);
    setSetting('max_hold_hours', '48');
    setSetting('trading_fee_percent', '0');
    setSetting('take_profit_target_1_percent', '50');

    const pos = insertPlanPosition({
      openedAt: Date.now() - 49 * 3600 * 1000,
      trailingStopPrice: 90,
    });
    const engine = new TradingEngine();
    const restoreTicker = mockTicker(101.5); // +1.5% net tepat — winner kecil, realokasi

    t.after(() => {
      restoreTicker();
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    await (engine as any).manageOpenPositions();

    const row = db.prepare('SELECT status, exit_reason FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.status, 'closed', 'tepat +1.5% masih di dalam jendela stagnasi (inklusif)');
    assert.ok(String(row.exit_reason).includes('Stagnasi'), row.exit_reason);
  });

  test("max_hold_hours='0' disables the stagnation exit entirely", async (t) => {
    const saved = captureSettings(['max_hold_hours', 'trading_fee_percent']);
    setSetting('max_hold_hours', '0');
    setSetting('trading_fee_percent', '0');

    const pos = insertPlanPosition({
      openedAt: Date.now() - 1000 * 3600 * 1000, // sangat tua
      trailingStopPrice: 90,
    });
    const engine = new TradingEngine();
    const restoreTicker = mockTicker(100);

    t.after(() => {
      restoreTicker();
      cleanupPosition(pos.id);
      restoreSettings(saved);
    });

    await (engine as any).manageOpenPositions();

    const row = db.prepare('SELECT status FROM positions WHERE id = ?').get(pos.id) as any;
    assert.equal(row.status, 'open', 'max_hold_hours 0 harus menonaktifkan stagnasi exit');
  });
});

describe('Adaptive Exit — backtest adaptive mode', () => {
  /** Serie sintetis: 20 bar datar (range 4%), breakout entry, rally 2 bar, lalu koreksi. */
  function buildRunnerBars(): BacktestBar[] {
    const bars: BacktestBar[] = [];
    for (let i = 0; i < 20; i++) {
      bars.push({ timestamp: (i + 1) * 3600000, open: 100, high: 102, low: 98, close: 100, volume: 1000 });
    }
    // Bar entry: bullish +3.5%, volume surge 2.5x → ATR trailing window tinggi
    bars.push({ timestamp: 21 * 3600000, open: 100, high: 104, low: 99, close: 103.5, volume: 2500 });
    // Rally
    bars.push({ timestamp: 22 * 3600000, open: 104, high: 112, low: 103, close: 111, volume: 1500 });
    bars.push({ timestamp: 23 * 3600000, open: 112, high: 118, low: 113, close: 117, volume: 1500 });
    // Koreksi menyentuh trailing stop
    bars.push({ timestamp: 24 * 3600000, open: 117, high: 117.5, low: 110, close: 111, volume: 1000 });
    return bars;
  }

  const commonParams = {
    symbol: 'ADAPTIDR',
    timeframe: '1h' as const,
    allocationPerTradeIdr: 100000,
    trailingStopPercent: 2.5,
    takeProfitStep1Percent: 5.0,
    takeProfitTarget2Percent: 10.0,
    minGainThresholdPercent: 2.0,
    strategyType: 'candle_breakout' as const,
    slippagePercent: 0.2,
    feePercent: 0.4,
  };

  test('adaptiveExit=false is byte-identical to the default (legacy) run', () => {
    const bars = buildRunnerBars();
    const legacy = backtestEngine.simulate(bars, { ...commonParams });
    const explicitFalse = backtestEngine.simulate(bars, { ...commonParams, adaptiveExit: false });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(explicitFalse)), JSON.parse(JSON.stringify(legacy)));
    assert.ok(!legacy.strategyUsed.includes('Adaptive'));
  });

  test('adaptiveExit=true widens TP1 on the high-ATR entry and rides the runner to a better exit', () => {
    const bars = buildRunnerBars();

    // Dokumentasikan mekanisme: ATR window tinggi + proxy RISK_ON (close > SMA20)
    // melebarkan TP1 jauh di atas 5%, sementara trailing tetap <= 2x base.
    const entryWindow = bars.slice(0, 21);
    const atr = calculateTrueATR(entryWindow, 14);
    assert.ok(atr !== null && atr > 0);
    const entryPlan = computeExitPlan({
      atrPct: (atr / 103.5) * 100,
      regime: 'RISK_ON', // close 103.5 > SMA20 = 100 (proxy backtest)
      volumeSurgeRatio: 2500 / (22500 / 21),
      depthImbalance: null,
      isBluechip: false,
      baseTp1Pct: 5.0,
      baseTp2Pct: 10.0,
      baseTrailingPct: 2.5,
    });
    assert.ok(entryPlan.tp1Pct > 5, `ATR tinggi + RISK_ON harus melebarkan TP1 (dapat ${entryPlan.tp1Pct})`);
    assert.ok(entryPlan.trailingPct <= 5, 'trailing tidak boleh melebihi 2x base 2.5%');

    const legacy = backtestEngine.simulate(bars, { ...commonParams });
    const adaptive = backtestEngine.simulate(bars, { ...commonParams, adaptiveExit: true });

    assert.equal(legacy.totalTrades, 1);
    assert.equal(adaptive.totalTrades, 1);

    // Legacy: TP1 +5% lalu TP2 +10% tercapai sebelum koreksi
    assert.ok(legacy.trades[0].exitReason.includes('TP2'), legacy.trades[0].exitReason);
    // Adaptif: TP1 dinaikkan → tidak sempat TP2; sisa posisi lebih besar ikut ke puncak
    assert.ok(!adaptive.trades[0].exitReason.includes('TP2'), adaptive.trades[0].exitReason);
    assert.ok(adaptive.trades[0].exitReason.includes('Partial TP'), adaptive.trades[0].exitReason);
    assert.notStrictEqual(adaptive.trades[0].exitReason, legacy.trades[0].exitReason);

    assert.ok(
      adaptive.trades[0].pnlPercent > legacy.trades[0].pnlPercent,
      `adaptive pnl ${adaptive.trades[0].pnlPercent}% harus lebih baik dari legacy ${legacy.trades[0].pnlPercent}%`
    );
    assert.ok(adaptive.strategyUsed.includes('Adaptive Exit'));
  });

  test('portfolio backtest: adaptiveExit=false identical to default; true changes the outcome on the same series', () => {
    const bars: BacktestBar[] = [];
    for (let i = 0; i < 25; i++) {
      bars.push({ timestamp: (i + 1) * 3600000, open: 100, high: 102, low: 98, close: 100, volume: 1000 });
    }
    bars.push({ timestamp: 26 * 3600000, open: 100, high: 104, low: 99, close: 103.5, volume: 2500 });
    bars.push({ timestamp: 27 * 3600000, open: 104, high: 112, low: 103, close: 111, volume: 1500 });
    bars.push({ timestamp: 28 * 3600000, open: 112, high: 118, low: 113, close: 117, volume: 1500 });
    bars.push({ timestamp: 29 * 3600000, open: 117, high: 117.5, low: 110, close: 111, volume: 1000 });

    const barsBySymbol = new Map<string, BacktestBar[]>([['portidr', bars]]);
    const baseParams: PortfolioBacktestParams = {
      symbols: ['portidr'],
      timeframe: '1h',
      days: 2,
      initialBalanceIdr: 1000000,
      allocationPerTradeIdr: 100000,
      maxActiveTrades: 1,
      trailingStopPercent: 2.5,
      takeProfitStep1Percent: 5.0,
      takeProfitTarget2Percent: 10.0,
      minGainThresholdPercent: 2.0,
      slippagePercent: 0.2,
      feePercent: 0.4,
    };

    const legacy = portfolioBacktestEngine.simulate(barsBySymbol, { ...baseParams }, '1h', 2, 'exchange');
    const explicitFalse = portfolioBacktestEngine.simulate(barsBySymbol, { ...baseParams, adaptiveExit: false }, '1h', 2, 'exchange');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(explicitFalse)), JSON.parse(JSON.stringify(legacy)));
    assert.ok(legacy.totalTrades >= 1);

    const adaptive = portfolioBacktestEngine.simulate(barsBySymbol, { ...baseParams, adaptiveExit: true }, '1h', 2, 'exchange');
    assert.ok(adaptive.totalTrades >= 1);
    assert.notStrictEqual(
      JSON.stringify(adaptive.trades),
      JSON.stringify(legacy.trades),
      'rencana adaptif harus mengubah hasil portofolio pada serie yang sama'
    );
    assert.ok(
      adaptive.trades[0].pnlPercent > legacy.trades[0].pnlPercent,
      `portfolio adaptive ${adaptive.trades[0].pnlPercent}% > legacy ${legacy.trades[0].pnlPercent}%`
    );
  });
});
