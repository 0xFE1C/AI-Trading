import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { db, getSetting, setSetting } from '../src/db/index.js';
import {
  applyPresetFromRuns,
  buildPresetMeta,
  computeMedian,
  evaluateConfigOnBars,
  getFreshOptimizerPreset,
  isOptimizing,
  OPTIMIZER_CONFIGURATIONS,
  OPTIMIZER_PRESET_MAX_AGE_MS,
  persistOptimizerRun,
  runWalkForwardOptimization,
  selectPresetRuns,
  simulateSlice,
  aggregateResults,
  setOptimizerAlertCallback,
  type OptimizerAlertFn,
  type SymbolRunResult,
  type GridParams,
} from '../src/services/optimizer/index.js';
import { saveCandles } from '../src/services/candles/store.js';
import { TradingEngine } from '../src/services/trading/index.js';
import type { BacktestBar } from '../src/services/backtest/index.js';

/**
 * Test optimizer walk-forward pada BAR SINTETIS (tanpa network):
 *  - candle store diisi via saveCandles sehingga loadCachedBars menutup
 *    rentang 90 hari → TIDAK ada fetch history_v2 sama sekali.
 *  - fetch global di-stub melempar error agar fallback pun tetap offline.
 */

// --- Stub fetch global: semua fallback fetch harus gagal cepat & offline ---
const originalFetch = globalThis.fetch;
function stubFetchOffline() {
  (globalThis as any).fetch = async () => {
    throw new Error('offline-stub: test tidak boleh network');
  };
}
function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// --- Generator bar sintetis (tuned agar verdict deterministik) -------------

const HOUR = 3_600_000;
const LAST_BUCKET = Math.floor(Date.now() / HOUR) * HOUR;

function buildBars(closes: number[]): BacktestBar[] {
  return closes.map((c, i) => {
    const prev = i === 0 ? c : closes[i - 1];
    return {
      timestamp: LAST_BUCKET - (closes.length - 1 - i) * HOUR,
      open: prev,
      high: Math.max(prev, c) * 1.001,
      low: Math.min(prev, c) * 0.999,
      close: c,
      volume: 1000 + (i % 5) * 200,
    };
  });
}

type Phase = Array<{ hours: number; pct: number }>;

function runPhases(phases: Phase[]): number[] {
  const closes: number[] = [];
  let price = 1000;
  for (const p of phases) {
    for (let h = 0; h < p.hours; h++) {
      price *= 1 + p.pct / 100;
      closes.push(price);
    }
  }
  return closes;
}

// Siklus 48 jam alternating: pump-runner (win besar) & pump-fader (loss kecil)
// → OOS punya campuran win/loss realistis (profitFactor finite, bukan null).
function trendCloses(cycles: number): number[] {
  const phases: Phase = [];
  for (let i = 0; i < cycles; i++) {
    const cycle: Phase =
      i % 2 === 0
        ? [
            { hours: 1, pct: 4 },
            { hours: 27, pct: 1.0 },
            { hours: 20, pct: -1.3 },
          ]
        : [
            { hours: 1, pct: 4 },
            { hours: 3, pct: -4 },
            { hours: 44, pct: -0.05 },
          ];
    phases.push(...cycle);
  }
  return runPhases(phases);
}

// Regime flip: 1/3 pertama runner-beruntun (tren kuat), lalu fader-beruntun
// (pasar berbalik) → in-sample profit, OOS rugi → OVERFITTED/WEAK, no preset.
// 45 siklus = 1980 jam (~82.5 hari) agar muat dalam retensi 90 hari candle store.
function flipCloses(cycles: number): number[] {
  const phases: Phase = [];
  const first = Math.floor(cycles / 3);
  for (let i = 0; i < cycles; i++) {
    if (i < first) {
      phases.push(
        { hours: 1, pct: 4 },
        { hours: 27, pct: 1.0 },
        { hours: 8, pct: -0.4 }
      );
    } else {
      phases.push(
        { hours: 1, pct: 4 },
        { hours: 3, pct: -4 },
        { hours: 44, pct: -0.05 }
      );
    }
  }
  return runPhases(phases);
}

// Fader-only: pump 1 lilin lalu dump — hampir semua trade rugi → UNPROFITABLE.
function faderCloses(cycles: number): number[] {
  const phases: Phase = [];
  for (let i = 0; i < cycles; i++) {
    phases.push(
      { hours: 1, pct: 4 },
      { hours: 3, pct: -4 },
      { hours: 44, pct: -0.05 }
    );
  }
  return runPhases(phases);
}

function seedCandleStore(pair: string, closes: number[]) {
  const saved = saveCandles(pair, '1h', buildBars(closes));
  assert.ok(saved > 0, `candle store harus menerima bar untuk ${pair}`);
}

// --- Settings snapshot ------------------------------------------------------

const SETTINGS_KEYS = [
  'optimizer_preset_enabled',
  'optimizer_auto_run',
  'optimizer_last_run_at',
  'optimizer_preset_tp1',
  'optimizer_preset_tp2',
  'optimizer_preset_meta',
];
const settingsSnapshot: Record<string, string> = {};
for (const k of SETTINGS_KEYS) settingsSnapshot[k] = getSetting(k, '');

function clearPresetSettings() {
  setSetting('optimizer_preset_tp1', '');
  setSetting('optimizer_preset_tp2', '');
  setSetting('optimizer_preset_meta', '');
}

// --- Kolektor alert (idiom callback injection) ------------------------------

let alertMessages: string[] = [];
const alertCollector: OptimizerAlertFn = async (msg) => {
  alertMessages.push(msg);
};

// --- Fixture hasil run sintetis untuk test median/gerbang -------------------

function fakeRun(symbol: string, opts: { tp1: number; wf: SymbolRunResult['walkForward']['verdict']; oosPF: number | null; oosPnl: number }): SymbolRunResult {
  const cfg: GridParams = { ...OPTIMIZER_CONFIGURATIONS[0], takeProfitPercent: opts.tp1 };
  return {
    symbol,
    timeframe: '1h',
    barCount: 2160,
    coveredDays: 90,
    dataSource: 'cache',
    chosenConfig: cfg,
    inSamplePF: 1.5,
    outSamplePF: opts.oosPF,
    oosPnlIdr: opts.oosPnl,
    inSamplePnlIdr: 90000,
    verdict: 'ROBUST_PROFITABLE',
    walkForward: {
      verdict: opts.wf,
      oosPnlIdr: opts.oosPnl * 2,
      oosProfitFactor: opts.oosPF,
      inSamplePnlIdr: 180000,
      oosToIsRatio: 1.0,
      folds: [],
      inSampleFolds: [],
    },
    evaluations: [],
  };
}

// --- Tests -------------------------------------------------------------------

describe('Optimizer Service — walk-forward pada bar sintetis (offline)', () => {
  test('seri trending menghasilkan verdict ROBUST dan MENULIS preset profit-side + alert', async () => {
    stubFetchOffline();
    setOptimizerAlertCallback(alertCollector);
    alertMessages = [];
    clearPresetSettings();
    // 44 siklus x 48 jam = 2112 bar (~88 hari) — muat retensi 90 hari & menutup
    // jendela 85 hari yang diminta (days: 85 → butuh 2041 bar).
    seedCandleStore('opttrend', trendCloses(44));

    try {
      const summary = await runWalkForwardOptimization({ symbols: ['OPTTREND'], timeframe: '1h', days: 85 });

      assert.equal(summary.ok, true, `run harus ok, error: ${summary.error}`);
      assert.equal(summary.days, 85);
      assert.equal(summary.symbols.length, 1);
      const run = summary.symbols[0];
      assert.equal(run.dataSource, 'cache', 'candle store harus dipakai lebih dulu (tanpa network)');
      assert.equal(run.barCount >= 2041, true, `bar dari cache harus menutup 85 hari (dapat ${run.barCount})`);
      assert.equal(run.walkForward.verdict, 'WALK_FORWARD_ROBUST', `wf verdict: ${run.walkForward.verdict}`);
      assert.ok(run.outSamplePF !== null && run.outSamplePF >= 1.0, `OOS PF harus >= 1.0 (dapat ${run.outSamplePF})`);
      assert.ok(run.oosPnlIdr > 0, 'OOS PnL harus positif');
      assert.equal(summary.presetWritten, true, 'preset harus ditulis untuk simbol robust');

      // Preset tersimpan di settings: TP1 dari chosen config, TP2 = 2x TP1
      const tp1 = parseFloat(getSetting('optimizer_preset_tp1', ''));
      const tp2 = parseFloat(getSetting('optimizer_preset_tp2', ''));
      assert.ok(Number.isFinite(tp1) && tp1 > 0, 'optimizer_preset_tp1 harus terisi angka positif');
      assert.equal(tp2, tp1 * 2, 'TP2 preset = 2x TP1 (aturan ekstensi yang sama dgn adaptiveExit)');
      const meta = JSON.parse(getSetting('optimizer_preset_meta', ''));
      assert.equal(meta.verdict, 'WALK_FORWARD_ROBUST');
      assert.deepEqual(meta.symbols, ['OPTTREND']);
      assert.equal(meta.tp1, tp1);
      assert.ok(meta.testedAt > 0);

      // Sisi rugi TIDAK PERNAH ditulis oleh preset: config terpilih membawa TP
      // saja; kolom audit hanya menyimpan config, bukan nilai trailing baru.
      const chosenRow = db.prepare('SELECT chosen_config_json FROM optimizer_runs WHERE symbol = ?').get('OPTTREND') as { chosen_config_json: string } | undefined;
      assert.ok(chosenRow, 'baris optimizer_runs harus ada untuk simbol robust');
      const chosen = JSON.parse(chosenRow.chosen_config_json);
      assert.equal(chosen.takeProfitPercent, tp1);

      // Alert admin terkirim dengan angka (tanpa secret). Pesan memakai
      // *bold* WhatsApp → bandingkan versi polos tanpa asterisk.
      assert.equal(alertMessages.length, 1, 'satu alert per write preset');
      const alertPlain = alertMessages[0].replace(/\*/g, '');
      assert.ok(alertPlain.includes('ROBUST'), 'alert harus menyebut verdict robust');
      assert.ok(alertPlain.includes(`TP1 ${tp1}%`));
      assert.ok(alertPlain.includes(`TP2 ${tp2}%`));
      assert.ok(alertPlain.includes('OPTTREND'));

      // Baris optimizer_runs terpersist dengan kolom verdict
      const row = db.prepare('SELECT * FROM optimizer_runs WHERE symbol = ? ORDER BY ts DESC LIMIT 1').get('OPTTREND') as any;
      assert.equal(row.verdict, 'ROBUST_PROFITABLE');
      assert.equal(row.wf_verdict, 'WALK_FORWARD_ROBUST');
      assert.equal(row.timeframe, '1h');
    } finally {
      setOptimizerAlertCallback(null);
      restoreFetch();
      db.prepare("DELETE FROM candles WHERE pair = 'opttrend'").run();
      db.prepare("DELETE FROM optimizer_runs WHERE symbol = 'OPTTREND'").run();
      clearPresetSettings();
    }
  });

  test('seri regime-flip menghasilkan OVERFIT/WEAK dan TIDAK menulis preset', async () => {
    stubFetchOffline();
    alertMessages = [];
    setOptimizerAlertCallback(alertCollector);
    clearPresetSettings();
    seedCandleStore('optflip', flipCloses(45));

    try {
      // 1980 bar (~82.5 hari) → jendela 80 hari agar cache menutup rentang.
      const summary = await runWalkForwardOptimization({ symbols: ['OPTFLIP'], timeframe: '1h', days: 80 });

      assert.equal(summary.ok, true, `run harus ok, error: ${summary.error}`);
      const run = summary.symbols[0];
      assert.ok(
        run.walkForward.verdict === 'OVERFIT' || run.walkForward.verdict === 'WALK_FORWARD_WEAK',
        `verdict flip harus OVERFIT/WEAK, dapat: ${run.walkForward.verdict}`
      );
      assert.equal(summary.presetWritten, false, 'verdict non-ROBUST tidak boleh menulis preset');
      assert.equal(summary.preset, null);
      assert.equal(alertMessages.length, 0, 'tanpa preset → tanpa alert');
      assert.equal(getSetting('optimizer_preset_tp1', ''), '', 'tp1 preset tidak boleh ditulis');
      assert.equal(getSetting('optimizer_preset_meta', ''), '', 'meta preset tidak boleh ditulis');

      // Audit trail tetap tercatat (dengan verdict non-robust)
      const row = db.prepare('SELECT * FROM optimizer_runs WHERE symbol = ? ORDER BY ts DESC LIMIT 1').get('OPTFLIP') as any;
      assert.ok(row, 'run flip tetap tercatat di optimizer_runs');
      assert.equal(row.wf_verdict, run.walkForward.verdict);
    } finally {
      setOptimizerAlertCallback(null);
      restoreFetch();
      db.prepare("DELETE FROM candles WHERE pair = 'optflip'").run();
      db.prepare("DELETE FROM optimizer_runs WHERE symbol = 'OPTFLIP'").run();
      clearPresetSettings();
    }
  });

  test('guard konkurensi: run ganda paralel ditolak (satu run pada satu waktu)', async () => {
    stubFetchOffline();
    seedCandleStore('optguard', trendCloses(44));
    try {
      assert.equal(isOptimizing(), false);
      const [first, second] = await Promise.all([
        runWalkForwardOptimization({ symbols: ['OPTGUARD'], days: 85 }),
        runWalkForwardOptimization({ symbols: ['OPTGUARD'], days: 85 }),
      ]);
      const rejected = first.ok ? second : first;
      const accepted = first.ok ? first : second;
      assert.equal(accepted.ok, true);
      assert.equal(rejected.ok, false);
      assert.equal(rejected.reason, 'already_running');
      assert.equal(isOptimizing(), false, 'flag harus reset setelah run selesai');
      // Regresi: run tanpa opts.timeframe (jalur auto-run) harus default '1h',
      // bukan undefined (dulu membuat INSERT optimizer_runs gagal NOT NULL).
      assert.equal(accepted.timeframe, '1h');
      assert.equal(accepted.symbols[0].timeframe, '1h');
    } finally {
      restoreFetch();
      db.prepare("DELETE FROM candles WHERE pair = 'optguard'").run();
      db.prepare("DELETE FROM optimizer_runs WHERE symbol = 'OPTGUARD'").run();
      clearPresetSettings();
    }
  });

  test('bounds: simbol > 6 di-clamp ke 6 dan days > 120 di-clamp ke 120', async () => {
    stubFetchOffline();
    try {
      const summary = await runWalkForwardOptimization({
        symbols: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
        days: 500,
        timeframe: '5m' as any, // timeframe tidak valid → fallback '1h'
      });
      assert.equal(summary.ok, true);
      assert.equal(summary.symbols.length, 6, 'maksimal 6 simbol');
      assert.equal(summary.days, 120, 'maksimal 120 hari');
      assert.equal(summary.timeframe, '1h', 'timeframe tidak valid fallback ke 1h');
    } finally {
      restoreFetch();
      db.prepare("DELETE FROM optimizer_runs WHERE symbol IN ('S1','S2','S3','S4','S5','S6')").run();
      clearPresetSettings();
    }
  });
});

describe('Optimizer Service — aturan preset (gerbang, median, freshness)', () => {
  test('gerbang robust-only: OVERFIT dan WALK_FORWARD_WEAK tidak pernah masuk seleksi preset', () => {
    const runs: SymbolRunResult[] = [
      fakeRun('A', { tp1: 5, wf: 'WALK_FORWARD_ROBUST', oosPF: 1.3, oosPnl: 100000 }),
      fakeRun('B', { tp1: 20, wf: 'OVERFIT', oosPF: 0.4, oosPnl: -50000 }),
      fakeRun('C', { tp1: 30, wf: 'WALK_FORWARD_WEAK', oosPF: 1.2, oosPnl: 10000 }),
      // ROBUST tapi OOS PF < 1.0 → gagal gerbang
      fakeRun('D', { tp1: 40, wf: 'WALK_FORWARD_ROBUST', oosPF: 0.9, oosPnl: 80000 }),
      // ROBUST + PF ok tapi OOS PnL 0 → gagal gerbang
      fakeRun('E', { tp1: 50, wf: 'WALK_FORWARD_ROBUST', oosPF: 1.1, oosPnl: 0 }),
    ];
    const robust = selectPresetRuns(runs);
    assert.deepEqual(robust.map((r) => r.symbol), ['A'], 'hanya run yang lolos gerbang lengkap');
  });

  test('agregasi median deterministik: tp1 = median simbol robust, tp2 = 2x tp1', async () => {
    alertMessages = [];
    setOptimizerAlertCallback(alertCollector);
    clearPresetSettings();
    try {
      const runs: SymbolRunResult[] = [
        fakeRun('M1', { tp1: 5.0, wf: 'WALK_FORWARD_ROBUST', oosPF: 1.2, oosPnl: 50000 }),
        fakeRun('M2', { tp1: 6.5, wf: 'WALK_FORWARD_ROBUST', oosPF: 1.4, oosPnl: 70000 }),
        fakeRun('M3', { tp1: 8.0, wf: 'WALK_FORWARD_ROBUST', oosPF: 1.1, oosPnl: 60000 }),
      ];
      const testedAt = Date.now();
      const meta = await applyPresetFromRuns(runs, testedAt);
      assert.ok(meta);
      assert.equal(meta!.tp1, 6.5, 'median dari [5, 6.5, 8] = 6.5');
      assert.equal(meta!.tp2, 13, 'tp2 = 2x median');
      assert.equal(meta!.oosPfMedian, 1.2, 'median OOS PF [1.1, 1.2, 1.4]');
      assert.equal(meta!.oosPnlIdrTotal, 180000);
      assert.deepEqual(meta!.symbols, ['M1', 'M2', 'M3']);
      assert.equal(getSetting('optimizer_preset_tp1', ''), '6.5');
      assert.equal(getSetting('optimizer_preset_tp2', ''), '13');

      // Median genap: [5, 6] → 5.5
      assert.equal(buildPresetMeta(
        [
          fakeRun('G1', { tp1: 5, wf: 'WALK_FORWARD_ROBUST', oosPF: 1.1, oosPnl: 1 }),
          fakeRun('G2', { tp1: 6, wf: 'WALK_FORWARD_ROBUST', oosPF: 1.1, oosPnl: 1 }),
        ],
        testedAt
      )!.tp1, 5.5);

      assert.equal(alertMessages.length, 1, 'setiap write preset memicu satu alert');
    } finally {
      setOptimizerAlertCallback(null);
      clearPresetSettings();
    }
  });

  test('tanpa simbol robust: applyPresetFromRuns tidak menyentuh settings', async () => {
    clearPresetSettings();
    setSetting('optimizer_preset_tp1', '3.3');
    try {
      const meta = await applyPresetFromRuns([fakeRun('X', { tp1: 9, wf: 'OVERFIT', oosPF: 0.5, oosPnl: -1000 })], Date.now());
      assert.equal(meta, null);
      assert.equal(getSetting('optimizer_preset_tp1', ''), '3.3', 'preset lama tidak boleh tersentuh');
      assert.equal(getSetting('optimizer_preset_meta', ''), '');
    } finally {
      clearPresetSettings();
    }
  });

  test('freshness window: preset > 14 hari diperlakukan TIDAK ADA; segar tetap terbaca', () => {
    clearPresetSettings();
    const now = Date.now();

    // Segar (2 hari)
    setSetting('optimizer_preset_tp1', '6.5');
    setSetting('optimizer_preset_tp2', '13');
    setSetting('optimizer_preset_meta', JSON.stringify({ testedAt: now - 2 * 86400_000, symbols: ['BTCIDR'], verdict: 'WALK_FORWARD_ROBUST', oosPfMedian: 1.2, oosPnlIdrTotal: 90000, tp1: 6.5, tp2: 13 }));
    const fresh = getFreshOptimizerPreset(now);
    assert.ok(fresh);
    assert.equal(fresh!.tp1, 6.5);
    assert.equal(fresh!.tp2, 13);

    // Tepat pada batas 14 hari masih segar
    setSetting('optimizer_preset_meta', JSON.stringify({ testedAt: now - OPTIMIZER_PRESET_MAX_AGE_MS, symbols: ['BTCIDR'], verdict: 'WALK_FORWARD_ROBUST', oosPfMedian: 1.2, oosPnlIdrTotal: 90000, tp1: 6.5, tp2: 13 }));
    assert.ok(getFreshOptimizerPreset(now), 'umur tepat 14 hari masih segar');

    // Stale (15 hari) → absent
    setSetting('optimizer_preset_meta', JSON.stringify({ testedAt: now - 15 * 86400_000, symbols: ['BTCIDR'], verdict: 'WALK_FORWARD_ROBUST', oosPfMedian: 1.2, oosPnlIdrTotal: 90000, tp1: 6.5, tp2: 13 }));
    assert.equal(getFreshOptimizerPreset(now), null, 'preset > 14 hari harus dianggap tidak ada');

    // Korup → absent
    setSetting('optimizer_preset_meta', '{bukan-json');
    assert.equal(getFreshOptimizerPreset(now), null);

    // Verdict bukan ROBUST → absent
    setSetting('optimizer_preset_meta', JSON.stringify({ testedAt: now - 1000, symbols: ['BTCIDR'], verdict: 'OVERFIT', oosPfMedian: 0.5, oosPnlIdrTotal: -1, tp1: 6.5, tp2: 13 }));
    assert.equal(getFreshOptimizerPreset(now), null);

    clearPresetSettings();
  });

  test('computeMedian dasar', () => {
    assert.equal(computeMedian([]), null);
    assert.equal(computeMedian([3]), 3);
    assert.equal(computeMedian([3, 1, 2]), 2);
    assert.equal(computeMedian([4, 1]), 2.5);
    assert.equal(computeMedian([10, 2, 8, 4]), 6);
  });
});

describe('Optimizer Service — verdict math & persistensi', () => {
  test('simulateSlice & aggregateResults: matematika dasar tetap sehat', () => {
    const bars = buildBars(trendCloses(45));
    const res = simulateSlice(bars, OPTIMIZER_CONFIGURATIONS[0], 'taker');
    assert.ok(Number.isFinite(res.netPnlIdr));
    assert.ok(res.maxDrawdown >= 0);
    // Mode maker harus selalu >= taker (biaya lebih rendah) pada seri yang sama
    const maker = simulateSlice(bars, OPTIMIZER_CONFIGURATIONS[0], 'maker');
    assert.ok(maker.netPnlIdr >= res.netPnlIdr, 'maker (fee 0.15%) tidak boleh lebih buruk dari taker (0.4%)');
    // Empty bars → hasil nol tanpa crash
    const empty = simulateSlice([], OPTIMIZER_CONFIGURATIONS[0], 'taker');
    assert.equal(empty.trades, 0);
    assert.equal(empty.netPnlIdr, 0);
    assert.equal(empty.profitFactor, 0);
    // Agregasi
    const agg = aggregateResults([res, empty]);
    assert.equal(agg.trades, res.trades);
    assert.equal(agg.netPnlIdr, res.netPnlIdr);
  });

  test('evaluateConfigOnBars: kondisi verdict Part-1 dan walk-forward sesuai script asli', () => {
    // Seri pump-dump beruntun (fader-only) → semua trade rugi dalam jumlah
    // besar → UNPROFITABLE, walk-forward OVERFIT (tidak ada lipatan profit).
    const faders = buildBars(faderCloses(45));
    const ev = evaluateConfigOnBars(faders, OPTIMIZER_CONFIGURATIONS[0]);
    assert.equal(ev.status, 'UNPROFITABLE', `status fader: ${ev.status}`);
    assert.equal(ev.walkForward.verdict, 'OVERFIT', `wf fader: ${ev.walkForward.verdict}`);

    // Seri konstan → tidak ada entry sama sekali → PnL 0 → MODERATE + OVERFIT
    const flat = buildBars(new Array(2160).fill(1000));
    const evFlat = evaluateConfigOnBars(flat, OPTIMIZER_CONFIGURATIONS[0]);
    assert.equal(evFlat.status, 'MODERATE');
    assert.equal(evFlat.walkForward.verdict, 'OVERFIT');

    // Seri terlalu pendek (< 100 bar) → walk-forward tanpa lipatan → OVERFIT
    const short = buildBars(trendCloses(10).slice(0, 60));
    const evShort = evaluateConfigOnBars(short, OPTIMIZER_CONFIGURATIONS[0]);
    assert.equal(evShort.walkForward.folds.length, 0);
    assert.equal(evShort.walkForward.verdict, 'OVERFIT');
  });

  test('persistOptimizerRun + pruneOldData: retensi 90 hari', () => {
    const run = fakeRun('PRUNESYM', { tp1: 5, wf: 'WALK_FORWARD_ROBUST', oosPF: 1.2, oosPnl: 123000 });
    const now = Date.now();
    persistOptimizerRun(run, now);
    const fresh = db.prepare('SELECT * FROM optimizer_runs WHERE symbol = ?').get('PRUNESYM') as any;
    assert.ok(fresh, 'baris fresh harus ada');
    assert.equal(fresh.oos_pnl_idr, 123000);
    assert.ok(JSON.parse(fresh.chosen_config_json));

    // Baris tua 95 hari → harus terhapus oleh pruneOldData engine
    persistOptimizerRun({ ...run, symbol: 'PRUNEOLD' }, now - 95 * 86400_000);
    const engine = new TradingEngine();
    engine.pruneOldData();
    assert.ok(db.prepare('SELECT * FROM optimizer_runs WHERE symbol = ?').get('PRUNESYM'), 'baris segar harus selamat');
    assert.equal(db.prepare('SELECT * FROM optimizer_runs WHERE symbol = ?').get('PRUNEOLD'), undefined, 'baris > 90 hari harus terprune');

    db.prepare("DELETE FROM optimizer_runs WHERE symbol IN ('PRUNESYM', 'PRUNEOLD')").run();
  });
});
