import { execSync } from 'child_process';
import { db, getSetting, setSetting } from '../../db/index.js';
import { loadCachedBars } from '../backtest/index.js';
import type { BacktestBar } from '../backtest/index.js';

/**
 * Optimizer Service — walk-forward strategy optimization sebagai first-class
 * service (diekstrak dari scripts/optimize_strategy.ts tanpa mengubah metode
 * verdiknya). Deterministik, 0 token LLM:
 *
 *  - Data: candle store dulu via loadCachedBars (backtest/index.ts); hanya
 *    saat cache tidak menutup rentang → fallback fetch paginated history_v2.
 *  - Part 1: split in-sample (2/3 pertama) vs out-of-sample (1/3 terakhir)
 *    per konfigurasi per simbol, verdict ROBUST_PROFITABLE / OVERFITTED /
 *    MODERATE / UNPROFITABLE (matematika identik dengan script aslinya).
 *  - Part 3: expanding walk-forward (2 lipatan: 30→30, 60→30) per simbol,
 *    verdict WALK_FORWARD_ROBUST / WALK_FORWARD_WEAK / OVERFIT.
 *  - Preset profit-side: hanya konfigurasi terpilih dengan walk-forward
 *    ROBUST + OOS PF >= 1.0 + OOS PnL > 0 yang menulis preset TP1/TP2 ke
 *    settings (JANGAN PERNAH trailing/SL — anchor risiko tetap milik user).
 */

// ---------- Tipe hasil simulasi (diambil dari script asli, tidak diubah) ----------

export interface GridParams {
  id: string;
  name: string;
  strategyType: 'momentum_breakout' | 'consolidation_breakout' | 'trend_pullback';
  description: string;
  takeProfitPercent: number;
  trailingStopPercent: number;
  minGainThresholdPercent: number;
  maxGainThresholdPercent?: number;
  useSmaTrendFilter: boolean;
  smaPeriod: number;
  maxConsolidationRangePercent?: number;
}

export interface SplitResult {
  trades: number;
  winRate: number;
  netPnlIdr: number;
  netPnlPercent: number;
  profitFactor: number | null;
  grossProfitIdr: number;
  grossLossIdr: number;
  maxDrawdown: number;
  avgTradePercent: number;
}

export type ConfigStatus = 'ROBUST_PROFITABLE' | 'MODERATE' | 'OVERFITTED' | 'UNPROFITABLE';
export type WalkForwardVerdict = 'WALK_FORWARD_ROBUST' | 'WALK_FORWARD_WEAK' | 'OVERFIT';

export interface WalkForwardFold {
  trainDays: number;
  testDays: number; // 0 = referensi in-sample
  netPnlIdr: number;
  profitFactor: number | null;
  trades: number;
}

export interface WalkForwardResult {
  verdict: WalkForwardVerdict;
  oosPnlIdr: number;
  oosProfitFactor: number | null;
  inSamplePnlIdr: number;
  oosToIsRatio: number | null;
  folds: WalkForwardFold[]; // hanya lipatan OOS (testDays > 0)
  inSampleFolds: WalkForwardFold[];
}

export interface ConfigEvaluation {
  config: GridParams;
  inSample: SplitResult;
  outOfSample: SplitResult;
  full: SplitResult;
  status: ConfigStatus;
  walkForward: WalkForwardResult;
}

export interface FeeComparisonRow {
  configId: string;
  configName: string;
  taker: SplitResult;
  maker: SplitResult;
}

export interface SymbolRunResult {
  symbol: string;
  timeframe: string;
  barCount: number;
  coveredDays: number;
  dataSource: 'cache' | 'exchange';
  chosenConfig: GridParams;
  inSamplePF: number | null;
  outSamplePF: number | null;
  oosPnlIdr: number; // PnL out-of-sample 30d (Part 1) konfigurasi terpilih
  inSamplePnlIdr: number;
  verdict: ConfigStatus;
  walkForward: WalkForwardResult;
  evaluations: ConfigEvaluation[]; // semua konfigurasi (untuk audit script)
}

export interface OptimizerRunSummary {
  ok: boolean;
  error?: string;
  reason?: 'already_running';
  startedAt: number;
  durationMs: number;
  timeframe: string;
  days: number;
  symbols: SymbolRunResult[];
  feeComparison: FeeComparisonRow[];
  presetWritten: boolean;
  preset: OptimizerPresetMeta | null;
}

// ---------- Konfigurasi grid kandidat (identik dengan script asli) ----------

export const OPTIMIZER_CONFIGURATIONS: GridParams[] = [
  {
    id: 'cfg_1_baseline_wide_gain',
    name: 'Baseline Live (TP 5%, SL 2.5%, gain24h <= 25%)',
    strategyType: 'momentum_breakout',
    description: 'Replay scan bot live dengan ambang batas atas longgar (gain 1.5% - 25%)',
    takeProfitPercent: 5.0,
    trailingStopPercent: 2.5,
    minGainThresholdPercent: 1.5,
    maxGainThresholdPercent: 25.0,
    useSmaTrendFilter: false,
    smaPeriod: 50,
  },
  {
    id: 'cfg_2_baseline_early_gain',
    name: 'Baseline Early (TP 5%, SL 2.5%, gain24h <= 8%)',
    strategyType: 'momentum_breakout',
    description: 'Momentum awal tanpa mengejar pucuk pompa (gain 1.5% - 8%)',
    takeProfitPercent: 5.0,
    trailingStopPercent: 2.5,
    minGainThresholdPercent: 1.5,
    maxGainThresholdPercent: 8.0,
    useSmaTrendFilter: false,
    smaPeriod: 50,
  },
  {
    id: 'cfg_3_wide_room',
    name: 'Wide Breathing Room (TP 8%, SL 4.0%)',
    strategyType: 'momentum_breakout',
    description: 'Memberi ruang bernapas lebih longgar untuk volatilitas intraday spot IDR',
    takeProfitPercent: 8.0,
    trailingStopPercent: 4.0,
    minGainThresholdPercent: 1.5,
    maxGainThresholdPercent: 8.0,
    useSmaTrendFilter: false,
    smaPeriod: 50,
  },
  {
    id: 'cfg_4_wide_asymmetric',
    name: 'Asymmetric Runner (TP 12%, SL 5.0%)',
    strategyType: 'momentum_breakout',
    description: 'Mengejar reward-to-risk asimetris 2.4:1',
    takeProfitPercent: 12.0,
    trailingStopPercent: 5.0,
    minGainThresholdPercent: 1.5,
    maxGainThresholdPercent: 8.0,
    useSmaTrendFilter: false,
    smaPeriod: 50,
  },
  {
    id: 'cfg_5_consolidation_runner',
    name: 'Consolidation Breakout (TP 15%, SL 5.0% + SMA 50)',
    strategyType: 'consolidation_breakout',
    description: 'Breakout dari konsolidasi 24 jam ketat (range <= 6%) di atas tren SMA 50',
    takeProfitPercent: 15.0,
    trailingStopPercent: 5.0,
    minGainThresholdPercent: 2.0,
    useSmaTrendFilter: true,
    smaPeriod: 50,
    maxConsolidationRangePercent: 6.0,
  },
  {
    id: 'cfg_6_trend_dip_buyer',
    name: 'Trend Dip Buyer (TP 10%, SL 4.0% + SMA 50 Pullback)',
    strategyType: 'trend_pullback',
    description: 'Membeli saat harga memantul setelah 1 lilin koreksi di atas SMA 50',
    takeProfitPercent: 10.0,
    trailingStopPercent: 4.0,
    minGainThresholdPercent: 1.0,
    useSmaTrendFilter: true,
    smaPeriod: 50,
  },
];

export const DEFAULT_OPTIMIZER_SYMBOLS = ['BTCIDR', 'ETHIDR', 'SOLIDR', 'DOGEIDR', 'PEPEIDR'];
export const MAX_OPTIMIZER_SYMBOLS = 6;
export const MAX_OPTIMIZER_DAYS = 120;

// ---------- Mesin simulasi (matematika identik dengan script asli) ----------

/**
 * Simulasi deterministik per irisan bar dengan zero-lookahead, half-TP1,
 * breakeven move, dan trailing ratchet. feeMode 'maker' untuk evaluasi efek
 * biaya; 'taker' untuk seluruh keputusan verdict. TIDAK diubah dari script.
 */
export function simulateSlice(
  bars: BacktestBar[],
  params: GridParams,
  feeMode: 'taker' | 'maker' = 'taker'
): SplitResult {
  const initialBalance = 10000000;
  const allocation = 100000;

  // Fee and slippage rates
  // Taker: 0.2% exchange fee + 0.2% slippage = 0.4% per side
  // Maker (Limit orders): 0.1% exchange fee + 0.05% slippage = 0.15% per side
  const slippageRate = feeMode === 'maker' ? 0.0005 : 0.002;
  const feeRate = feeMode === 'maker' ? 0.001 : 0.002;

  let cash = initialBalance;
  let peakEquity = initialBalance;
  let maxDrawdown = 0;

  let inPos = false;
  let entryPrice = 0;
  let currentAmount = 0;
  let initialCost = 0;
  let highestPrice = 0;
  let trailingStopPrice = 0;
  let takeProfitStep = 0;
  let tradeRealizedCash = 0;

  const trades: Array<{ pnlIdr: number; pnlPercent: number }> = [];

  // Precompute SMA
  const smaPeriod = params.smaPeriod || 50;
  const smaValues: number[] = new Array(bars.length).fill(0);
  for (let i = 0; i < bars.length; i++) {
    if (i >= smaPeriod - 1) {
      let sum = 0;
      for (let j = i - smaPeriod + 1; j <= i; j++) sum += bars[j].close;
      smaValues[i] = sum / smaPeriod;
    }
  }

  // Rolling volume window
  const volumeWindow: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    volumeWindow.push(bar.volume);
    if (volumeWindow.length > 20) volumeWindow.shift();
    const avgVolume = volumeWindow.reduce((a, b) => a + b, 0) / volumeWindow.length;

    if (inPos) {
      // Step 1: Check existing SL against bar.low (Zero-lookahead: SL from prior bar)
      const previousSL = trailingStopPrice;
      if (bar.low <= previousSL) {
        const rawExit = Math.min(bar.open, previousSL);
        const exitProceeds = currentAmount * rawExit * (1 - slippageRate) * (1 - feeRate);
        cash += exitProceeds;
        tradeRealizedCash += exitProceeds;

        const pnlIdr = tradeRealizedCash - initialCost;
        const pnlPercent = (pnlIdr / initialCost) * 100;
        trades.push({ pnlIdr: Math.round(pnlIdr), pnlPercent });
        inPos = false;
      } else {
        // Step 2: Survived stop, check TP expansion
        highestPrice = Math.max(highestPrice, bar.high);
        const gainPercent = ((bar.high - entryPrice) / entryPrice) * 100;

        if (gainPercent >= params.takeProfitPercent && takeProfitStep === 0) {
          const halfAmount = currentAmount * 0.5;
          const targetTpPrice = entryPrice * (1 + params.takeProfitPercent / 100);
          const tpProceeds = halfAmount * targetTpPrice * (1 - slippageRate) * (1 - feeRate);
          cash += tpProceeds;
          tradeRealizedCash += tpProceeds;
          currentAmount -= halfAmount;
          takeProfitStep = 1;
          trailingStopPrice = Math.max(trailingStopPrice, entryPrice); // Move SL to breakeven
        }

        // Step 3: Ratchet SL for next candle
        const computedSL = highestPrice * (1 - params.trailingStopPercent / 100);
        if (computedSL > trailingStopPrice) {
          trailingStopPrice = computedSL;
        }
      }
    } else {
      // Entry Signals
      if (i >= 24 && i >= smaPeriod) {
        const low24h = Math.min(...bars.slice(i - 24, i).map((b) => b.low));
        const gain24h = low24h > 0 ? ((bar.close - low24h) / low24h) * 100 : 0;
        const isBullish = bar.close > bar.open;
        const hasVolume = bar.volume >= avgVolume * 0.7;
        const isAboveSma = bar.close > smaValues[i];

        let entry = false;

        if (params.strategyType === 'momentum_breakout') {
          // Standard/Early Momentum Breakout
          const passSma = !params.useSmaTrendFilter || isAboveSma;
          const maxGain = params.maxGainThresholdPercent || 25.0;
          if (isBullish && gain24h >= params.minGainThresholdPercent && gain24h <= maxGain && hasVolume && passSma) {
            entry = true;
          }
        } else if (params.strategyType === 'consolidation_breakout') {
          // Consolidation Range Breakout (Macro Trend Runner)
          const high24h = Math.max(...bars.slice(i - 24, i).map((b) => b.high));
          const range24h = low24h > 0 ? ((high24h - low24h) / low24h) * 100 : 0;
          const maxRange = params.maxConsolidationRangePercent || 6.0;
          const wasConsolidating = range24h <= maxRange;
          if (isAboveSma && wasConsolidating && bar.close > high24h && isBullish && hasVolume) {
            entry = true;
          }
        } else if (params.strategyType === 'trend_pullback') {
          // Pullback / Dip in established uptrend
          const prevBar = bars[i - 1];
          const isPullback = prevBar.close < prevBar.open;
          const bounceConfirmation = bar.close > prevBar.close && isBullish;
          if (isAboveSma && isPullback && bounceConfirmation && hasVolume) {
            entry = true;
          }
        }

        if (entry && cash >= allocation) {
          inPos = true;
          const rawEntry = bar.close;
          entryPrice = rawEntry * (1 + slippageRate);
          initialCost = Math.min(allocation, cash);
          currentAmount = (initialCost * (1 - feeRate)) / entryPrice;
          cash -= initialCost;
          tradeRealizedCash = 0;
          highestPrice = rawEntry;
          trailingStopPrice = rawEntry * (1 - params.trailingStopPercent / 100);
          takeProfitStep = 0;
        }
      }
    }

    // Equity tracking
    const currentHolding = inPos ? currentAmount * bar.close : 0;
    const totalEq = Math.round(cash + currentHolding);
    if (totalEq > peakEquity) peakEquity = totalEq;
    const dd = peakEquity > 0 ? ((peakEquity - totalEq) / peakEquity) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Close remaining trade at market close
  if (inPos && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const exitProceeds = currentAmount * lastBar.close * (1 - slippageRate) * (1 - feeRate);
    cash += exitProceeds;
    tradeRealizedCash += exitProceeds;
    const pnlIdr = tradeRealizedCash - initialCost;
    trades.push({ pnlIdr: Math.round(pnlIdr), pnlPercent: (pnlIdr / initialCost) * 100 });
  }

  const finalBalance = Math.round(cash);
  const netPnlIdr = finalBalance - initialBalance;
  const netPnlPercent = parseFloat(((netPnlIdr / initialBalance) * 100).toFixed(2));
  const wins = trades.filter((t) => t.pnlIdr > 0).length;
  const winRate = trades.length > 0 ? parseFloat(((wins / trades.length) * 100).toFixed(1)) : 0;

  const totalGain = trades.filter((t) => t.pnlIdr > 0).reduce((sum, t) => sum + t.pnlIdr, 0);
  const totalLoss = Math.abs(trades.filter((t) => t.pnlIdr < 0).reduce((sum, t) => sum + t.pnlIdr, 0));
  const profitFactor = totalLoss === 0 ? (totalGain > 0 ? null : 0) : parseFloat((totalGain / totalLoss).toFixed(2));
  const avgTrade = trades.length > 0 ? parseFloat((trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length).toFixed(2)) : 0;

  return {
    trades: trades.length,
    winRate,
    netPnlIdr,
    netPnlPercent,
    profitFactor,
    grossProfitIdr: totalGain,
    grossLossIdr: totalLoss,
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    avgTradePercent: avgTrade,
  };
}

/** Agregasi hasil beberapa simbol (identik dengan script asli). */
export function aggregateResults(results: SplitResult[]): SplitResult {
  const totalTrades = results.reduce((s, r) => s + r.trades, 0);
  const totalWins = results.reduce((s, r) => s + Math.round((r.winRate / 100) * r.trades), 0);
  const netPnlIdr = results.reduce((s, r) => s + r.netPnlIdr, 0);
  const netPnlPercent = parseFloat(((netPnlIdr / 10000000) * 100).toFixed(2));
  const winRate = totalTrades > 0 ? parseFloat(((totalWins / totalTrades) * 100).toFixed(1)) : 0;
  const maxDrawdown = results.length > 0 ? Math.max(...results.map((r) => r.maxDrawdown)) : 0;
  const avgTradePercent = totalTrades > 0 ? parseFloat((results.reduce((s, r) => s + r.avgTradePercent * r.trades, 0) / totalTrades).toFixed(2)) : 0;

  const totalGrossProfit = results.reduce((s, r) => s + r.grossProfitIdr, 0);
  const totalGrossLoss = results.reduce((s, r) => s + r.grossLossIdr, 0);
  const profitFactor = totalGrossLoss === 0 ? (totalGrossProfit > 0 ? null : 0) : parseFloat((totalGrossProfit / totalGrossLoss).toFixed(2));

  return {
    trades: totalTrades,
    winRate,
    netPnlIdr,
    netPnlPercent,
    profitFactor,
    grossProfitIdr: totalGrossProfit,
    grossLossIdr: totalGrossLoss,
    maxDrawdown,
    avgTradePercent,
  };
}

// ---------- Sumber data: candle store dulu, fallback fetch history_v2 ----------

const TIMEFRAME_TO_TF_PARAM: Record<string, string> = {
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': '1D',
};

/**
 * Fetch paginated dari endpoint TradingView history_v2 Indodax (dipindah dari
 * script asli, diparameterisasi days & timeframe). Tanpa cache — pemanggil
 * WAJIB mencoba loadOptimizerBars dulu.
 */
export async function fetchHistoryBars(symbol: string, timeframe = '1h', days = 90): Promise<BacktestBar[]> {
  const cleanSymbol = symbol.toUpperCase();
  const tfParam = TIMEFRAME_TO_TF_PARAM[timeframe] || '60';
  const nowSec = Math.floor(Date.now() / 1000);
  const fromTarget = nowSec - days * 86400;
  let currentTo = nowSec;
  let allRawBars: any[] = [];

  for (let i = 0; i < 8; i++) {
    if (currentTo <= fromTarget) break;
    const url = `https://indodax.com/tradingview/history_v2?from=${fromTarget}&to=${currentTo}&tf=${tfParam}&symbol=${cleanSymbol}`;
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 AI-Trading/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) break;
      const chunk = (await res.json()) as any[];
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      allRawBars = chunk.concat(allRawBars);
      const earliest = typeof chunk[0].Time === 'number' ? chunk[0].Time : parseInt(chunk[0].Time, 10);
      if (earliest >= currentTo) break;
      currentTo = earliest - 1;
      if (chunk.length < 50) break;
    } catch {
      break;
    }
  }

  const map = new Map<number, BacktestBar>();
  for (const b of allRawBars) {
    const ts = (typeof b.Time === 'number' ? b.Time : parseInt(b.Time, 10)) * 1000;
    const open = typeof b.Open === 'number' ? b.Open : parseFloat(b.Open);
    const high = typeof b.High === 'number' ? b.High : parseFloat(b.High);
    const low = typeof b.Low === 'number' ? b.Low : parseFloat(b.Low);
    const close = typeof b.Close === 'number' ? b.Close : parseFloat(b.Close);
    const volume = typeof b.Volume === 'number' ? b.Volume : parseFloat(b.Volume || '0');
    if (open > 0 && high > 0 && low > 0 && close > 0) {
      map.set(ts, { timestamp: ts, open, high, low, close, volume });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Candle store FIRST: bila cache lokal menutup rentang (contiguity dicek
 * loadCachedBars) → pakai tanpa network; hanya cache miss yang fetch bursa.
 */
export async function loadOptimizerBars(
  symbol: string,
  timeframe = '1h',
  days = 90
): Promise<{ bars: BacktestBar[]; source: 'cache' | 'exchange' }> {
  const cleanPair = symbol.toLowerCase().replace('/', '').replace('_', '');
  const cached = loadCachedBars(cleanPair, timeframe, days);
  if (cached && cached.length > 0) {
    return { bars: cached, source: 'cache' };
  }
  const fetched = await fetchHistoryBars(cleanSymbolSafe(symbol), timeframe, days);
  return { bars: fetched, source: 'exchange' };
}

function cleanSymbolSafe(symbol: string): string {
  const upper = symbol.toUpperCase().replace('/', '').replace('_', '');
  return upper.endsWith('IDR') ? upper : `${upper}IDR`;
}

// ---------- Walk-forward per simbol (verdict math identik dengan script) ----------

/**
 * Evaluasi satu konfigurasi pada satu simbol: split in/out-of-sample (2/3 vs
 * 1/3) + expanding walk-forward (lipatan 30→30 lalu 60→30). Semua kondisi
 * verdict PERSIS script asli, hanya discop ke satu simbol.
 */
export function evaluateConfigOnBars(bars: BacktestBar[], cfg: GridParams): ConfigEvaluation {
  const splitIdx = Math.floor(bars.length * (2 / 3));
  const inSample = simulateSlice(bars.slice(0, splitIdx), cfg, 'taker');
  const outOfSample = simulateSlice(bars.slice(splitIdx), cfg, 'taker');
  const full = simulateSlice(bars, cfg, 'taker');

  // Verdict Part 1 — kondisi identik dengan script asli (agregasi cross-symbol
  // di script; di sini per simbol, matematikanya sama).
  let status: ConfigStatus = 'UNPROFITABLE';
  if (outOfSample.profitFactor !== null && outOfSample.profitFactor >= 1.0 && outOfSample.netPnlIdr > 0) {
    status = 'ROBUST_PROFITABLE';
  } else if (inSample.profitFactor !== null && inSample.profitFactor >= 1.0 && (outOfSample.profitFactor === null || outOfSample.profitFactor < 0.8)) {
    status = 'OVERFITTED';
  } else if (full.netPnlIdr > -100000) {
    status = 'MODERATE';
  }

  return {
    config: cfg,
    inSample,
    outOfSample,
    full,
    status,
    walkForward: computeWalkForward(bars, cfg),
  };
}

function computeWalkForward(bars: BacktestBar[], cfg: GridParams): WalkForwardResult {
  const folds: WalkForwardFold[] = [];
  const inSampleFolds: WalkForwardFold[] = [];

  if (bars.length >= 100) {
    const foldSize = Math.floor(bars.length / 3); // ~30 hari per 1h-candle block

    // Fold A: train [0, foldSize) -> test [foldSize, 2*foldSize)
    const isA = simulateSlice(bars.slice(0, foldSize), cfg, 'taker');
    const oosA = simulateSlice(bars.slice(foldSize, 2 * foldSize), cfg, 'taker');

    // Fold B: train [0, 2*foldSize) -> test [2*foldSize, end)
    const isB = simulateSlice(bars.slice(0, 2 * foldSize), cfg, 'taker');
    const oosB = simulateSlice(bars.slice(2 * foldSize), cfg, 'taker');

    folds.push(
      { trainDays: 30, testDays: 30, netPnlIdr: oosA.netPnlIdr, profitFactor: oosA.profitFactor, trades: oosA.trades },
      { trainDays: 60, testDays: 30, netPnlIdr: oosB.netPnlIdr, profitFactor: oosB.profitFactor, trades: oosB.trades }
    );
    // Referensi in-sample untuk rasio OOS/IS (jendela train)
    inSampleFolds.push(
      { trainDays: 30, testDays: 0, netPnlIdr: isA.netPnlIdr, profitFactor: isA.profitFactor, trades: isA.trades },
      { trainDays: 60, testDays: 0, netPnlIdr: isB.netPnlIdr, profitFactor: isB.profitFactor, trades: isB.trades }
    );
  }

  const aggregateOosPnlIdr = folds.reduce((s, f) => s + f.netPnlIdr, 0);
  const positiveOosPnl = folds.reduce((s, f) => s + Math.max(0, f.netPnlIdr), 0);
  const negativeOosPnl = Math.abs(folds.reduce((s, f) => s + Math.min(0, f.netPnlIdr), 0));
  const aggregateOosProfitFactor = negativeOosPnl === 0 ? (positiveOosPnl > 0 ? null : 0) : parseFloat((positiveOosPnl / negativeOosPnl).toFixed(2));
  const inSamplePnlIdr = inSampleFolds.reduce((s, f) => s + f.netPnlIdr, 0);
  const oosToIsRatio = inSamplePnlIdr > 0 ? parseFloat((aggregateOosPnlIdr / inSamplePnlIdr).toFixed(2)) : null;

  // Verdict walk-forward — kondisi identik dengan script asli.
  let verdict: WalkForwardVerdict = 'OVERFIT';
  const profitableFolds = folds.filter((f) => f.netPnlIdr > 0).length;
  if (aggregateOosPnlIdr > 0 && folds.length > 0 && profitableFolds === folds.length) {
    verdict = 'WALK_FORWARD_ROBUST';
  } else if (aggregateOosPnlIdr > 0) {
    verdict = 'WALK_FORWARD_WEAK';
  }

  return {
    verdict,
    oosPnlIdr: aggregateOosPnlIdr,
    oosProfitFactor: aggregateOosProfitFactor,
    inSamplePnlIdr,
    oosToIsRatio,
    folds,
    inSampleFolds,
  };
}

/** Tier deterministik untuk pemilihan konfigurasi terpilih per simbol. */
const WF_TIER: Record<WalkForwardVerdict, number> = {
  WALK_FORWARD_ROBUST: 2,
  WALK_FORWARD_WEAK: 1,
  OVERFIT: 0,
};

/**
 * Gerbang preset (dipakai juga sebagai prioritas pemilihan konfigurasi):
 * walk-forward ROBUST + OOS PF terukur >= 1.0 + OOS PnL positif.
 */
function passesPresetGate(e: ConfigEvaluation): boolean {
  return (
    e.walkForward.verdict === 'WALK_FORWARD_ROBUST' &&
    e.outOfSample.profitFactor !== null &&
    e.outOfSample.profitFactor >= 1.0 &&
    e.outOfSample.netPnlIdr > 0
  );
}

// ---------- Guard konkurensi ----------

let optimizing = false;

export function isOptimizing(): boolean {
  return optimizing;
}

// ---------- Callback alert (idiom setCallback ala service lain) ----------

export type OptimizerAlertFn = (message: string) => void | Promise<void>;
let optimizerAlertCallback: OptimizerAlertFn | null = null;

/** Injeksi callback notifikasi (dipasang server.ts ke WhatsApp/Telegram/broadcast). */
export function setOptimizerAlertCallback(cb: OptimizerAlertFn | null) {
  optimizerAlertCallback = cb;
}

async function notifyOptimizerAlert(message: string) {
  if (!optimizerAlertCallback) return;
  try {
    await optimizerAlertCallback(message);
  } catch {
    // Notifikasi gagal → tidak boleh menggagalkan hasil optimasi.
  }
}

// ---------- Preset profit-side (SATU-SATUNYA jalur write preset) ----------

export interface OptimizerPresetMeta {
  testedAt: number;
  symbols: string[];
  verdict: 'WALK_FORWARD_ROBUST';
  oosPfMedian: number | null;
  oosPnlIdrTotal: number;
  tp1: number;
  tp2: number;
}

export const OPTIMIZER_PRESET_MAX_AGE_MS = 14 * 24 * 3600 * 1000;

export const OPTIMIZER_PRESET_RATIONALE =
  'Preset hasil optimasi walk-forward (OOS PF ≥ 1.0) dipakai untuk target profit.';

export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Gerbang preset (profit-side SAJA):
 *   wf_verdict === 'WALK_FORWARD_ROBUST' AND out_sample_pf >= 1.0 AND oosPnlIdr > 0
 * Agregasi lintas simbol robust: MEDIAN tp1 (deterministik); tp2 = 2x tp1
 * (aturan ekstensi yang sama dengan adaptiveExit). Trailing/SL TIDAK PERNAH
 * ditulis — anchor risiko tetap setting user (trailing_stop_percent).
 * Verdict selain ROBUST (OVERFIT/WEAK dsb.) tidak pernah menulis preset.
 */
export function selectPresetRuns(runs: SymbolRunResult[]): SymbolRunResult[] {
  return runs.filter(
    (r) =>
      r.walkForward.verdict === 'WALK_FORWARD_ROBUST' &&
      r.outSamplePF !== null &&
      Number.isFinite(r.outSamplePF) &&
      r.outSamplePF >= 1.0 &&
      r.oosPnlIdr > 0
  );
}

export function buildPresetMeta(robust: SymbolRunResult[], testedAt: number): OptimizerPresetMeta | null {
  if (robust.length === 0) return null;
  const tp1 = round2(computeMedian(robust.map((r) => r.chosenConfig.takeProfitPercent)) as number);
  const pfs = robust.map((r) => r.outSamplePF).filter((v): v is number => v !== null && Number.isFinite(v));
  return {
    testedAt,
    symbols: robust.map((r) => r.symbol),
    verdict: 'WALK_FORWARD_ROBUST',
    oosPfMedian: pfs.length > 0 ? round2(computeMedian(pfs) as number) : null,
    oosPnlIdrTotal: robust.reduce((s, r) => s + r.oosPnlIdr, 0),
    tp1,
    tp2: round2(tp1 * 2),
  };
}

function formatPresetAlert(meta: OptimizerPresetMeta): string {
  return (
    `🧪 *[OPTIMIZER — PRESET BARU TERSIMPAN]*\n` +
    `Hasil walk-forward ROBUST ditemukan pada ${meta.symbols.length} simbol: *${meta.symbols.join(', ')}*\n` +
    `• Target profit baru (median): TP1 *${meta.tp1}%* · TP2 *${meta.tp2}%*\n` +
    `• OOS PF median: *${meta.oosPfMedian !== null ? meta.oosPfMedian.toFixed(2) + 'x' : 'N/A'}*\n` +
    `• Total OOS PnL: *Rp ${Math.round(meta.oosPnlIdrTotal).toLocaleString('id-ID')}*\n` +
    `Hanya target PROFIT yang diubah — trailing stop Anda tetap menjadi anchor risiko. ` +
    `Aktifkan via setting "optimizer_preset_enabled" bila ingin dipakai engine.`
  );
}

/**
 * Tulis preset dari hasil run (hanya simbol robust lolos gerbang). Mengembalikan
 * meta preset yang ditulis, atau null bila tidak ada simbol yang lolos (settings
 * preset tidak disentuh sama sekali).
 */
export async function applyPresetFromRuns(runs: SymbolRunResult[], testedAt = Date.now()): Promise<OptimizerPresetMeta | null> {
  const robust = selectPresetRuns(runs);
  const meta = buildPresetMeta(robust, testedAt);
  if (!meta) return null;

  setSetting('optimizer_preset_tp1', String(meta.tp1));
  setSetting('optimizer_preset_tp2', String(meta.tp2));
  setSetting('optimizer_preset_meta', JSON.stringify(meta));

  await notifyOptimizerAlert(formatPresetAlert(meta));
  return meta;
}

export interface FreshPreset {
  tp1: number;
  tp2: number | null; // null = TP2 nonaktif
  meta: OptimizerPresetMeta;
}

/**
 * Preset valid = meta terbaca + tp1 finite positif + umur <= 14 hari
 * (testedAt; preset lebih tua diperlakukan TIDAK ADA).
 */
export function getFreshOptimizerPreset(now = Date.now()): FreshPreset | null {
  const raw = getSetting('optimizer_preset_meta', '');
  if (!raw) return null;
  let meta: OptimizerPresetMeta;
  try {
    const parsed = JSON.parse(raw) as Partial<OptimizerPresetMeta> | null;
    if (!parsed || typeof parsed !== 'object' || !Number.isFinite(parsed.testedAt) || parsed.verdict !== 'WALK_FORWARD_ROBUST') {
      return null;
    }
    meta = parsed as OptimizerPresetMeta;
  } catch {
    return null;
  }
  // Freshness window: lebih tua dari 14 hari (atau timestamp masa depan rusak) → absent.
  const age = now - meta.testedAt;
  if (!Number.isFinite(age) || age < 0 || age > OPTIMIZER_PRESET_MAX_AGE_MS) return null;

  const tp1 = parseFloat(getSetting('optimizer_preset_tp1', ''));
  if (!Number.isFinite(tp1) || tp1 <= 0) return null;
  const tp2Raw = parseFloat(getSetting('optimizer_preset_tp2', ''));
  const tp2 = Number.isFinite(tp2Raw) && tp2Raw > 0 ? tp2Raw : null;
  return { tp1, tp2, meta };
}

// ---------- Persistensi hasil per simbol ----------

export interface OptimizerRunRow {
  id: string;
  ts: number;
  symbol: string;
  timeframe: string;
  verdict: string;
  in_sample_pf: number | null;
  out_sample_pf: number | null;
  oos_pnl_idr: number;
  wf_verdict: string | null;
  wf_oos_pnl_idr: number | null;
  chosen_config_json: string | null;
}

export function persistOptimizerRun(r: SymbolRunResult, ts = Date.now()) {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO optimizer_runs
        (id, ts, symbol, timeframe, verdict, in_sample_pf, out_sample_pf, oos_pnl_idr, wf_verdict, wf_oos_pnl_idr, chosen_config_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `opt_${ts}_${r.symbol}`,
      ts,
      r.symbol,
      r.timeframe,
      r.verdict,
      r.inSamplePF,
      r.outSamplePF,
      Math.round(r.oosPnlIdr),
      r.walkForward.verdict,
      Math.round(r.walkForward.oosPnlIdr),
      JSON.stringify(r.chosenConfig)
    );
  } catch (err: any) {
    // Audit trail bersifat best-effort; kegagalan DB tidak menggagalkan run.
    console.warn('[Optimizer] Gagal menyimpan optimizer_runs:', err?.message);
  }
}

export function getRecentOptimizerRuns(limit = 10): OptimizerRunRow[] {
  try {
    return db.prepare('SELECT * FROM optimizer_runs ORDER BY ts DESC LIMIT ?').all(limit) as OptimizerRunRow[];
  } catch {
    return [];
  }
}

// ---------- Orkestrator utama ----------

function clampOpts(opts: { symbols?: string[]; timeframe?: string; days?: number }) {
  const rawSymbols = Array.isArray(opts.symbols) ? opts.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean) : [];
  const symbols = (rawSymbols.length > 0 ? rawSymbols : DEFAULT_OPTIMIZER_SYMBOLS).slice(0, MAX_OPTIMIZER_SYMBOLS);
  // Validasi timeframe: tidak valid / tidak disediakan → '1h' (bukan undefined).
  const requestedTf = typeof opts.timeframe === 'string' ? opts.timeframe : '1h';
  const timeframe = TIMEFRAME_TO_TF_PARAM[requestedTf] ? requestedTf : '1h';
  const daysRaw = Number(opts.days);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.round(daysRaw), MAX_OPTIMIZER_DAYS) : 90;
  return { symbols, timeframe, days };
}

/**
 * Jalankan optimasi walk-forward penuh. TIDAK PERNAH melempar error (seluruh
 * run dibungkus try/catch agar tidak bisa merusak server); hasil error
 * dilaporkan lewat ok:false + error. Guard konkurensi: re-entry ditolak.
 */
export async function runWalkForwardOptimization(
  opts: { symbols?: string[]; timeframe?: string; days?: number; includeFeeComparison?: boolean } = {}
): Promise<OptimizerRunSummary> {
  const startedAt = Date.now();
  if (optimizing) {
    return {
      ok: false,
      error: 'Optimasi sudah berjalan. Tunggu run saat ini selesai.',
      reason: 'already_running',
      startedAt,
      durationMs: 0,
      timeframe: '1h',
      days: 90,
      symbols: [],
      feeComparison: [],
      presetWritten: false,
      preset: null,
    };
  }

  optimizing = true;
  try {
    const { symbols, timeframe, days } = clampOpts(opts);

    const symbolResults: SymbolRunResult[] = [];
    const barsBySymbol = new Map<string, BacktestBar[]>();
    for (const sym of symbols) {
      const { bars, source } = await loadOptimizerBars(sym, timeframe, days);
      barsBySymbol.set(sym, bars);
      const coveredDays = bars.length >= 2 ? Math.round((bars[bars.length - 1].timestamp - bars[0].timestamp) / 86400000) : 0;

      // Evaluasi semua konfigurasi untuk simbol ini, lalu pilih SATU konfigurasi
      // terpilih secara deterministik: (1) yang lolos gerbang preset lengkap
      // dulu (wf ROBUST + OOS PF >= 1.0 + OOS PnL > 0), (2) tier walk-forward
      // tertinggi, (3) OOS PnL agregat tertinggi, (4) tie-break config id asc.
      // Matematika verdict TIDAK berubah — hanya urutan prioritas pemilihan.
      const evaluations = OPTIMIZER_CONFIGURATIONS.map((cfg) => evaluateConfigOnBars(bars, cfg));
      const ranked = [...evaluations].sort((a, b) => {
        const gateDiff = (passesPresetGate(b) ? 1 : 0) - (passesPresetGate(a) ? 1 : 0);
        if (gateDiff !== 0) return gateDiff;
        const tierDiff = WF_TIER[b.walkForward.verdict] - WF_TIER[a.walkForward.verdict];
        if (tierDiff !== 0) return tierDiff;
        if (b.walkForward.oosPnlIdr !== a.walkForward.oosPnlIdr) return b.walkForward.oosPnlIdr - a.walkForward.oosPnlIdr;
        return a.config.id < b.config.id ? -1 : a.config.id > b.config.id ? 1 : 0;
      });
      const chosen = ranked[0];

      symbolResults.push({
        symbol: sym,
        timeframe,
        barCount: bars.length,
        coveredDays,
        dataSource: source,
        chosenConfig: chosen.config,
        inSamplePF: chosen.inSample.profitFactor,
        outSamplePF: chosen.outOfSample.profitFactor,
        oosPnlIdr: chosen.outOfSample.netPnlIdr,
        inSamplePnlIdr: chosen.inSample.netPnlIdr,
        verdict: chosen.status,
        walkForward: chosen.walkForward,
        evaluations,
      });

      // Lepaskan event loop antar simbol agar realtime tick engine tak pernah
      // tertahan lebih lama dari satu blok evaluasi sinkron.
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Persistensi audit trail per simbol (best-effort).
    const runTs = Date.now();
    for (const r of symbolResults) persistOptimizerRun(r, runTs);

    // Preset profit-side: hanya ditulis bila ada simbol robust lolos gerbang.
    const preset = await applyPresetFromRuns(symbolResults, runTs);

    // Evaluasi efek biaya (taker vs maker) — hanya untuk script audit. Bars
    // dipakai ulang dari memori (tidak ada fetch tambahan).
    const feeComparison: FeeComparisonRow[] = [];
    if (opts.includeFeeComparison) {
      for (const cfg of OPTIMIZER_CONFIGURATIONS) {
        const takerResults: SplitResult[] = [];
        const makerResults: SplitResult[] = [];
        for (const sr of symbolResults) {
          const evalRow = sr.evaluations.find((e) => e.config.id === cfg.id);
          const bars = barsBySymbol.get(sr.symbol);
          if (evalRow && bars) {
            takerResults.push(evalRow.full);
            makerResults.push(simulateSlice(bars, cfg, 'maker'));
          }
        }
        feeComparison.push({
          configId: cfg.id,
          configName: cfg.name,
          taker: aggregateResults(takerResults),
          maker: aggregateResults(makerResults),
        });
      }
    }

    return {
      ok: true,
      startedAt,
      durationMs: Date.now() - startedAt,
      timeframe,
      days,
      symbols: symbolResults,
      feeComparison,
      presetWritten: preset !== null,
      preset,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
      startedAt,
      durationMs: Date.now() - startedAt,
      timeframe: '1h',
      days: 90,
      symbols: [],
      feeComparison: [],
      presetWritten: false,
      preset: null,
    };
  } finally {
    optimizing = false;
  }
}

/** Commit git untuk audit trail script (best-effort, tanpa secret). */
export function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
