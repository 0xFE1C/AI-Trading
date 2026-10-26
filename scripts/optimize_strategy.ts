import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { BacktestBar } from '../src/services/backtest/index.js';

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

export interface ConfigEvaluation {
  config: GridParams;
  inSample60d: SplitResult;
  outOfSample30d: SplitResult;
  full90d: SplitResult;
  status: 'ROBUST_PROFITABLE' | 'MODERATE' | 'OVERFITTED' | 'UNPROFITABLE';
}

// Fetch historical candles with pagination from Indodax
async function fetch90dBars(symbol: string): Promise<BacktestBar[]> {
  const cleanSymbol = symbol.toUpperCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const fromTarget = nowSec - 90 * 86400;
  let currentTo = nowSec;
  let allRawBars: any[] = [];

  for (let i = 0; i < 8; i++) {
    if (currentTo <= fromTarget) break;
    const url = `https://indodax.com/tradingview/history_v2?from=${fromTarget}&to=${currentTo}&tf=60&symbol=${cleanSymbol}`;
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

// Deterministic simulation core with customizable fee/slippage mode
function simulateSlice(
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

// Aggregate multiple pair results
function aggregateResults(results: SplitResult[]): SplitResult {
  const totalTrades = results.reduce((s, r) => s + r.trades, 0);
  const totalWins = results.reduce((s, r) => s + Math.round((r.winRate / 100) * r.trades), 0);
  const netPnlIdr = results.reduce((s, r) => s + r.netPnlIdr, 0);
  const netPnlPercent = parseFloat(((netPnlIdr / 10000000) * 100).toFixed(2));
  const winRate = totalTrades > 0 ? parseFloat(((totalWins / totalTrades) * 100).toFixed(1)) : 0;
  const maxDrawdown = Math.max(...results.map((r) => r.maxDrawdown));
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

async function main() {
  const timestampIso = new Date().toISOString();
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {}

  console.log('========================================================================================');
  console.log('       QUANTITATIVE STRATEGY OPTIMIZER & OUT-OF-SAMPLE SPLIT BENCHMARK                  ');
  console.log(`       Run Timestamp : ${timestampIso} (Commit: ${gitCommit})                          `);
  console.log('========================================================================================\n');

  const symbols = ['BTCIDR', 'ETHIDR', 'SOLIDR', 'DOGEIDR', 'PEPEIDR'];
  console.log('Mengunduh 90 hari data lilin per jam (Indodax API)...');

  const barData: Record<string, BacktestBar[]> = {};
  for (const s of symbols) {
    const bars = await fetch90dBars(s);
    barData[s] = bars;
    console.log(`- ${s}: ${bars.length} candle (~${Math.round((bars[bars.length - 1].timestamp - bars[0].timestamp) / 86400000)} hari)`);
  }

  // Define candidate configurations with explicit parameters
  const configurations: GridParams[] = [
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

  console.log('\n========================================================================================');
  console.log('       BAGIAN 1: TRAIN (60 HARI IN-SAMPLE) VS TEST (30 HARI OUT-OF-SAMPLE)               ');
  console.log('========================================================================================');
  console.log('Split: Train = Day 0 s/d 60 (lilin 0 s/d 1440), Test = Day 60 s/d 90 (lilin 1440+)\n');

  const evaluations: ConfigEvaluation[] = [];

  for (const cfg of configurations) {
    const trainResults: SplitResult[] = [];
    const testResults: SplitResult[] = [];
    const fullResults: SplitResult[] = [];

    for (const sym of symbols) {
      const bars = barData[sym];
      const splitIdx = Math.floor(bars.length * (60 / 90));
      const barsTrain = bars.slice(0, splitIdx);
      const barsTest = bars.slice(splitIdx);

      trainResults.push(simulateSlice(barsTrain, cfg, 'taker'));
      testResults.push(simulateSlice(barsTest, cfg, 'taker'));
      fullResults.push(simulateSlice(bars, cfg, 'taker'));
    }

    const aggTrain = aggregateResults(trainResults);
    const aggTest = aggregateResults(testResults);
    const aggFull = aggregateResults(fullResults);

    let status: ConfigEvaluation['status'] = 'UNPROFITABLE';
    if (aggTest.profitFactor !== null && aggTest.profitFactor >= 1.0 && aggTest.netPnlIdr > 0) {
      status = 'ROBUST_PROFITABLE';
    } else if (aggTrain.profitFactor !== null && aggTrain.profitFactor >= 1.0 && (aggTest.profitFactor === null || aggTest.profitFactor < 0.8)) {
      status = 'OVERFITTED';
    } else if (aggFull.netPnlIdr > -100000) {
      status = 'MODERATE';
    }

    evaluations.push({
      config: cfg,
      inSample60d: aggTrain,
      outOfSample30d: aggTest,
      full90d: aggFull,
      status,
    });

    const pfTrainStr = aggTrain.profitFactor !== null ? `${aggTrain.profitFactor.toFixed(2)}x` : 'N/A';
    const pfTestStr = aggTest.profitFactor !== null ? `${aggTest.profitFactor.toFixed(2)}x` : 'N/A';
    const pfFullStr = aggFull.profitFactor !== null ? `${aggFull.profitFactor.toFixed(2)}x` : 'N/A';

    console.log(`[CONFIG] ${cfg.name}`);
    console.log(`  Formula     : ${cfg.strategyType} | TP: +${cfg.takeProfitPercent}% | SL: -${cfg.trailingStopPercent}% | SMA50: ${cfg.useSmaTrendFilter}`);
    console.log(`  Train (60d) : ${aggTrain.trades} trades | Win: ${aggTrain.winRate}% | PF: ${pfTrainStr} | PnL: Rp ${aggTrain.netPnlIdr.toLocaleString('id-ID')}`);
    console.log(`  Test (30d)  : ${aggTest.trades} trades | Win: ${aggTest.winRate}% | PF: ${pfTestStr} | PnL: Rp ${aggTest.netPnlIdr.toLocaleString('id-ID')} -> STATUS: [${status}]`);
    console.log(`  Full (90d)  : ${aggFull.trades} trades | Win: ${aggFull.winRate}% | PF: ${pfFullStr} | PnL: Rp ${aggFull.netPnlIdr.toLocaleString('id-ID')} (MaxDD: -${aggFull.maxDrawdown}%)\n`);
  }

  console.log('========================================================================================');
  console.log('       BAGIAN 2: EVALUASI EFEK BIAYA (TAKER FEE 0.4% VS MAKER FEE 0.15%)                ');
  console.log('========================================================================================');
  console.log('Perbandingan dampak langsung jika eksekusi beralih dari Market Order ke Limit Order:\n');

  for (const cfg of configurations) {
    const fullTaker: SplitResult[] = [];
    const fullMaker: SplitResult[] = [];

    for (const sym of symbols) {
      const bars = barData[sym];
      fullTaker.push(simulateSlice(bars, cfg, 'taker'));
      fullMaker.push(simulateSlice(bars, cfg, 'maker'));
    }

    const aggTaker = aggregateResults(fullTaker);
    const aggMaker = aggregateResults(fullMaker);

    const feeSavedIdr = aggMaker.netPnlIdr - aggTaker.netPnlIdr;
    const pfTakerStr = aggTaker.profitFactor !== null ? `${aggTaker.profitFactor.toFixed(2)}x` : 'N/A';
    const pfMakerStr = aggMaker.profitFactor !== null ? `${aggMaker.profitFactor.toFixed(2)}x` : 'N/A';

    console.log(`CONFIG: ${cfg.name}`);
    console.log(`  Taker (0.4% RT) : PnL Rp ${aggTaker.netPnlIdr.toLocaleString('id-ID').padStart(10)} | PF: ${pfTakerStr.padStart(6)} | Win: ${aggTaker.winRate}%`);
    console.log(`  Maker (0.15% RT): PnL Rp ${aggMaker.netPnlIdr.toLocaleString('id-ID').padStart(10)} | PF: ${pfMakerStr.padStart(6)} | Win: ${aggMaker.winRate}%`);
    console.log(`  Penghematan     : +Rp ${feeSavedIdr.toLocaleString('id-ID')} dari pemotongan biaya spread & komisi\n`);
  }

  console.log('========================================================================================');
  console.log('       BAGIAN 3: WALK-FORWARD ANALYSIS (JENDELA BERGULIR EKSPANSIF)                     ');
  console.log('========================================================================================');
  console.log('Dua lipatan: (train 30d -> test 30d) lalu (train 60d -> test 30d). Sama seperti');
  console.log('trader nyata: model diuji ulang pada data yang TIDAK PERNAH dilihat saat optimasi.');
  console.log('Config hanya layak live bila OOS-nya konsisten profit di kedua lipatan.\n');

  const walkForwardResults: Array<{
    configId: string;
    configName: string;
    folds: Array<{ trainDays: number; testDays: number; netPnlIdr: number; profitFactor: number | null; trades: number }>;
    aggregateOosPnlIdr: number;
    aggregateOosProfitFactor: number | null;
    inSamplePnlIdr: number;
    oosToIsRatio: number | null;
    verdict: 'WALK_FORWARD_ROBUST' | 'WALK_FORWARD_WEAK' | 'OVERFIT';
  }> = [];

  for (const cfg of configurations) {
    const folds: Array<{ trainDays: number; testDays: number; netPnlIdr: number; profitFactor: number | null; trades: number }> = [];

    for (const sym of symbols) {
      const bars = barData[sym];
      if (bars.length < 100) continue;
      const foldSize = Math.floor(bars.length / 3); // ~30 hari per 1h-candle block

      // Fold A: train [0, foldSize) -> test [foldSize, 2*foldSize)
      const isA = simulateSlice(bars.slice(0, foldSize), cfg, 'taker');
      const oosA = simulateSlice(bars.slice(foldSize, 2 * foldSize), cfg, 'taker');

      // Fold B: train [0, 2*foldSize) -> test [2*foldSize, end)
      const isB = simulateSlice(bars.slice(0, 2 * foldSize), cfg, 'taker');
      const oosB = simulateSlice(bars.slice(2 * foldSize), cfg, 'taker');

      folds.push(
        { trainDays: 30, testDays: 30, netPnlIdr: oosA.netPnlIdr, profitFactor: oosA.profitFactor, trades: oosA.trades },
        { trainDays: 60, testDays: 30, netPnlIdr: oosB.netPnlIdr, profitFactor: oosB.profitFactor, trades: oosB.trades },
        // In-sample references for the ratio (train windows)
        { trainDays: 30, testDays: 0, netPnlIdr: isA.netPnlIdr, profitFactor: isA.profitFactor, trades: isA.trades },
        { trainDays: 60, testDays: 0, netPnlIdr: isB.netPnlIdr, profitFactor: isB.profitFactor, trades: isB.trades }
      );
    }

    const oosFolds = folds.filter((f) => f.testDays > 0);
    const isFolds = folds.filter((f) => f.testDays === 0);
    const aggregateOosPnlIdr = oosFolds.reduce((s, f) => s + f.netPnlIdr, 0);
    const positiveOosPnl = oosFolds.reduce((s, f) => s + Math.max(0, f.netPnlIdr), 0);
    const negativeOosPnl = Math.abs(oosFolds.reduce((s, f) => s + Math.min(0, f.netPnlIdr), 0));
    const aggregateOosProfitFactor = negativeOosPnl === 0 ? (positiveOosPnl > 0 ? null : 0) : parseFloat((positiveOosPnl / negativeOosPnl).toFixed(2));
    const inSamplePnlIdr = isFolds.reduce((s, f) => s + f.netPnlIdr, 0);
    const oosToIsRatio = inSamplePnlIdr > 0 ? parseFloat((aggregateOosPnlIdr / inSamplePnlIdr).toFixed(2)) : null;

    let verdict: 'WALK_FORWARD_ROBUST' | 'WALK_FORWARD_WEAK' | 'OVERFIT' = 'OVERFIT';
    const profitableFolds = oosFolds.filter((f) => f.netPnlIdr > 0).length;
    if (aggregateOosPnlIdr > 0 && profitableFolds === oosFolds.length) {
      verdict = 'WALK_FORWARD_ROBUST';
    } else if (aggregateOosPnlIdr > 0) {
      verdict = 'WALK_FORWARD_WEAK';
    }

    walkForwardResults.push({
      configId: cfg.id,
      configName: cfg.name,
      folds: oosFolds,
      aggregateOosPnlIdr,
      aggregateOosProfitFactor,
      inSamplePnlIdr,
      oosToIsRatio,
      verdict,
    });

    const pfStr = aggregateOosProfitFactor !== null ? `${aggregateOosProfitFactor.toFixed(2)}x` : 'N/A';
    const ratioStr = oosToIsRatio !== null ? oosToIsRatio.toFixed(2) : 'N/A';
    console.log(`[WALK-FORWARD] ${cfg.name}`);
    for (const fold of oosFolds) {
      const foldPf = fold.profitFactor !== null ? `${fold.profitFactor.toFixed(2)}x` : 'N/A';
      console.log(`  Fold (train ${fold.trainDays}d / test ${fold.testDays}d): OOS PnL Rp ${fold.netPnlIdr.toLocaleString('id-ID')} | PF: ${foldPf} | ${fold.trades} trades`);
    }
    console.log(`  Agregat OOS : Rp ${aggregateOosPnlIdr.toLocaleString('id-ID')} | PF: ${pfStr} | Rasio OOS/IS: ${ratioStr} -> [${verdict}]\n`);
  }

  // Save full audit log to JSON
  const auditPath = path.resolve(process.cwd(), 'data', 'optimizer_audit.json');
  fs.writeFileSync(
    auditPath,
      JSON.stringify(
        {
          timestamp: timestampIso,
          gitCommit,
          symbols,
          candleCounts: Object.fromEntries(Object.entries(barData).map(([k, v]) => [k, v.length])),
          evaluations,
          walkForward: walkForwardResults,
        },
        null,
        2
      )
  );

  console.log(`[Audit Trail] Log audit lengkap berhasil disimpan ke: data/optimizer_audit.json`);
}

main();
