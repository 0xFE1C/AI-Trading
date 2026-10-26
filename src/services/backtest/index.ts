import { indodax } from '../indodax/index.js';
import { getTakerFeePercent } from '../trading/fees.js';

export interface BacktestParams {
  symbol: string; // e.g. 'btcidr', 'ethidr', 'solidr', 'pepeidr'
  timeframe: '15m' | '1h' | '4h' | '1d';
  days?: number; // default 30 days
  initialBalanceIdr?: number; // default 10.000.000 IDR
  allocationPerTradeIdr?: number; // default 100.000 IDR
  trailingStopPercent?: number; // default 2.5%
  takeProfitStep1Percent?: number; // default 5.0%
  minGainThresholdPercent?: number; // default 1.5% for live_momentum / auto-scaled for candle_breakout
  slippagePercent?: number; // default 0.2%
  feePercent?: number; // default: configured Indodax taker fee
  strategyType?: 'live_momentum' | 'candle_breakout'; // default 'live_momentum'
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  entryTime: number;
  exitTime: number;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  highestPrice: number;
  amount: number;
  totalCostIdr: number;
  pnlIdr: number;
  pnlPercent: number;
  exitReason: string;
  holdDurationHours: number;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  days: number;
  effectiveDays: number;
  dataTruncated: boolean;
  totalCandles: number;
  initialBalance: number;
  finalBalance: number;
  netPnlIdr: number;
  netPnlPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  profitFactor: number | null;
  maxDrawdownPercent: number;
  averageTradePnlPercent: number;
  slippagePercent: number;
  feePercent: number;
  strategyUsed: string;
  trades: BacktestTrade[];
  equityCurve: Array<{ time: string; timestamp: number; equity: number }>;
}

export interface BacktestBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class BacktestEngine {
  /**
   * Run backtest simulation against real Indodax historical candlestick data with pagination
   */
  public async run(params: BacktestParams): Promise<BacktestResult> {
    const symbol = params.symbol.toLowerCase().replace('/', '').replace('_', '');
    const cleanPair = symbol.endsWith('idr') ? symbol : `${symbol}idr`;
    const cleanSymbol = cleanPair.toUpperCase();
    const timeframe = params.timeframe || '1h';
    const days = params.days && params.days > 0 ? Math.min(params.days, 180) : 30;

    let tfParam = '60';
    if (timeframe === '15m') tfParam = '15';
    else if (timeframe === '1h') tfParam = '60';
    else if (timeframe === '4h') tfParam = '240';
    else if (timeframe === '1d') tfParam = '1D';

    // Target time range
    const nowSec = Math.floor(Date.now() / 1000);
    const rangeSec = days * 86400;
    const fromTarget = nowSec - rangeSec;
    let currentTo = nowSec;

    let allRawBars: any[] = [];
    const maxIterations = 8; // allows paginating up to ~5000 candles

    for (let iter = 0; iter < maxIterations; iter++) {
      if (currentTo <= fromTarget) break;

      const historyUrl = `https://indodax.com/tradingview/history_v2?from=${fromTarget}&to=${currentTo}&tf=${tfParam}&symbol=${cleanSymbol}`;

      try {
        const res = await fetch(historyUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Trading/1.0',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) break;
        const chunk = (await res.json()) as any[];
        if (!Array.isArray(chunk) || chunk.length === 0) break;

        allRawBars = chunk.concat(allRawBars);

        const earliestTime = typeof chunk[0].Time === 'number' ? chunk[0].Time : parseInt(chunk[0].Time, 10);
        if (earliestTime >= currentTo) break; // no progress made
        currentTo = earliestTime - 1;

        if (chunk.length < 50) break; // reached earliest available history on exchange
      } catch (err: any) {
        console.warn(`[Backtest] Warning fetching history_v2 pagination chunk ${iter} untuk ${cleanSymbol}:`, err.message);
        break;
      }
    }

    if (allRawBars.length === 0) {
      throw new Error(`Data historis candlestick tidak ditemukan untuk ${cleanSymbol} pada timeframe ${timeframe}. Pastikan simbol terdaftar di Indodax.`);
    }

    // Deduplicate bars by timestamp and sort chronologically
    const barMap = new Map<number, BacktestBar>();
    for (const b of allRawBars) {
      const ts = (typeof b.Time === 'number' ? b.Time : parseInt(b.Time, 10)) * 1000;
      const open = typeof b.Open === 'number' ? b.Open : parseFloat(b.Open);
      const high = typeof b.High === 'number' ? b.High : parseFloat(b.High);
      const low = typeof b.Low === 'number' ? b.Low : parseFloat(b.Low);
      const close = typeof b.Close === 'number' ? b.Close : parseFloat(b.Close);
      const volume = typeof b.Volume === 'number' ? b.Volume : parseFloat(b.Volume || '0');

      if (open > 0 && high > 0 && low > 0 && close > 0) {
        barMap.set(ts, { timestamp: ts, open, high, low, close, volume });
      }
    }

    const bars: BacktestBar[] = Array.from(barMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    if (bars.length < 5) {
      throw new Error(`Data historis candlestick tidak cukup (${bars.length} candle) untuk ${cleanSymbol} pada timeframe ${timeframe}.`);
    }

    return this.simulate(bars, params);
  }

  /**
   * Deterministic Bar-by-bar Strategy Simulation Engine
   * Includes Realistic Slippage, Exchange Fees, Dynamic Trailing Ratchet,
   * Partial Take-Profit + Breakeven, and Zero-Lookahead Intra-bar Execution.
   */
  public simulate(bars: BacktestBar[], params: BacktestParams): BacktestResult {
    const symbol = params.symbol.toUpperCase();
    const cleanSymbol = symbol.endsWith('IDR') ? symbol : `${symbol}IDR`;
    const timeframe = params.timeframe || '1h';
    const days = params.days || 30;
    const initialBalance = params.initialBalanceIdr || 10000000;
    const allocationPerTrade = params.allocationPerTradeIdr || 100000;
    const trailingStopPercent = params.trailingStopPercent || 2.5;
    const takeProfitStep1Percent = params.takeProfitStep1Percent || 5.0;
    const slippagePercent = params.slippagePercent !== undefined ? params.slippagePercent : 0.2;
    const feePercent = params.feePercent !== undefined ? params.feePercent : getTakerFeePercent();
    const strategyType = params.strategyType || 'live_momentum';

    // Effective days & truncation tracking
    const earliestMs = bars[0].timestamp;
    const latestMs = bars[bars.length - 1].timestamp;
    const effectiveDays = Math.max(1, Math.round((latestMs - earliestMs) / 86400000));
    const dataTruncated = effectiveDays < (days - 1);

    // Dynamic threshold calibration based on strategy & timeframe
    let minGainThreshold = params.minGainThresholdPercent;
    if (minGainThreshold === undefined || minGainThreshold <= 0) {
      if (strategyType === 'live_momentum') {
        minGainThreshold = 1.5; // 24h rolling gain threshold (matches live scan range 1.5% - 20%)
      } else {
        // Single candlestick momentum threshold adaptive per timeframe
        if (timeframe === '15m') minGainThreshold = 0.3;
        else if (timeframe === '1h') minGainThreshold = 0.6;
        else if (timeframe === '4h') minGainThreshold = 1.2;
        else minGainThreshold = 2.0;
      }
    }

    // Cost rates
    const slippageRate = slippagePercent / 100;
    const takerFeeRate = feePercent / 100;

    // Simulation State
    let cash = initialBalance;
    let peakEquity = initialBalance;
    let maxDrawdownPercent = 0;

    let inPosition = false;
    let entryPrice = 0;
    let currentAmount = 0;
    let initialCost = 0;
    let highestPrice = 0;
    let trailingStopPrice = 0;
    let takeProfitStep = 0;
    let entryTime = 0;
    let tradeRealizedCash = 0;

    const trades: BacktestTrade[] = [];
    const equityCurve: Array<{ time: string; timestamp: number; equity: number }> = [];

    // Rolling volume window
    const volumeWindow: number[] = [];

    // Rolling 24h window calculation (number of candles covering 24h)
    let candlesIn24h = 24;
    if (timeframe === '15m') candlesIn24h = 96;
    else if (timeframe === '4h') candlesIn24h = 6;
    else if (timeframe === '1d') candlesIn24h = 1;

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      volumeWindow.push(bar.volume);
      if (volumeWindow.length > 20) volumeWindow.shift();
      const avgVolume = volumeWindow.reduce((a, b) => a + b, 0) / volumeWindow.length;

      if (inPosition) {
        // Step 1: Check existing stop loss against bar.low
        // To eliminate intra-bar lookahead bias, check low against the stop level carried from previous bar!
        const previousSL = trailingStopPrice;

        if (bar.low <= previousSL) {
          // Trailing stop hit!
          const rawExitPrice = Math.min(bar.open, previousSL);
          const effectiveExitPrice = rawExitPrice * (1 - slippageRate);
          const exitProceeds = currentAmount * effectiveExitPrice * (1 - takerFeeRate);
          cash += exitProceeds;
          tradeRealizedCash += exitProceeds;

          const pnlIdr = tradeRealizedCash - initialCost;
          const pnlPercent = (pnlIdr / initialCost) * 100;
          const holdHours = Math.max(1, Math.round((bar.timestamp - entryTime) / 3600000));

          // Crystal clear, honest exit reason labeling
          let exitReason = '';
          if (takeProfitStep === 1) {
            if (rawExitPrice > entryPrice * 1.002) {
              exitReason = `Partial TP (+${takeProfitStep1Percent}%) + Trailing Stop (+${(((rawExitPrice - entryPrice) / entryPrice) * 100).toFixed(1)}%)`;
            } else if (Math.abs(rawExitPrice - entryPrice) / entryPrice <= 0.002) {
              exitReason = `Partial TP (+${takeProfitStep1Percent}%) + Breakeven Exit`;
            } else {
              exitReason = `Partial TP (+${takeProfitStep1Percent}%) + Stop Exit (-${(((entryPrice - rawExitPrice) / entryPrice) * 100).toFixed(1)}%)`;
            }
          } else {
            if (rawExitPrice >= entryPrice) {
              exitReason = `Trailing Stop Profit (+${(((rawExitPrice - entryPrice) / entryPrice) * 100).toFixed(1)}%)`;
            } else {
              exitReason = `Trailing Stop Loss (-${(((entryPrice - rawExitPrice) / entryPrice) * 100).toFixed(1)}%)`;
            }
          }

          trades.push({
            id: `bt_${trades.length + 1}`,
            symbol: cleanSymbol,
            entryTime,
            exitTime: bar.timestamp,
            entryDate: new Date(entryTime).toLocaleString('id-ID'),
            exitDate: new Date(bar.timestamp).toLocaleString('id-ID'),
            entryPrice,
            exitPrice: rawExitPrice,
            highestPrice,
            amount: currentAmount,
            totalCostIdr: initialCost,
            pnlIdr: Math.round(pnlIdr),
            pnlPercent: parseFloat(pnlPercent.toFixed(2)),
            exitReason,
            holdDurationHours: holdHours,
          });

          inPosition = false;
        } else {
          // Step 2: Position survived stop test. Now check high for new peak and partial take-profit
          highestPrice = Math.max(highestPrice, bar.high);

          // Partial Take-Profit check (+X% threshold)
          const currentGainPercent = ((bar.high - entryPrice) / entryPrice) * 100;
          if (currentGainPercent >= takeProfitStep1Percent && takeProfitStep === 0) {
            const halfAmount = currentAmount * 0.5;
            const targetTpPrice = entryPrice * (1 + takeProfitStep1Percent / 100);
            const effectiveTpPrice = targetTpPrice * (1 - slippageRate);
            const tpProceeds = halfAmount * effectiveTpPrice * (1 - takerFeeRate);
            cash += tpProceeds;
            tradeRealizedCash += tpProceeds;
            currentAmount -= halfAmount;
            takeProfitStep = 1;
            trailingStopPrice = Math.max(trailingStopPrice, entryPrice); // Move SL to breakeven!
          }

          // Step 3: Ratchet dynamic trailing stop for next bar
          const computedSL = highestPrice * (1 - trailingStopPercent / 100);
          if (computedSL > trailingStopPrice) {
            trailingStopPrice = computedSL;
          }
        }
      } else {
        // Entry Signal Evaluation
        let entrySignal = false;

        if (strategyType === 'live_momentum') {
          // Live Trading Engine Strategy Replay:
          // 24-hour rolling momentum + volume filter + bullish confirmation
          if (i >= candlesIn24h) {
            const lookbackBars = bars.slice(i - candlesIn24h, i);
            const low24h = Math.min(...lookbackBars.map((b) => b.low));
            const gain24h = low24h > 0 ? ((bar.close - low24h) / low24h) * 100 : 0;
            const isBullish = bar.close > bar.open;
            const hasVolume = bar.volume >= avgVolume * 0.6;

            // Momentum criteria matching live trading scan (gain between threshold and 25%)
            if (isBullish && gain24h >= minGainThreshold && gain24h <= 25.0 && hasVolume) {
              entrySignal = true;
            }
          }
        } else {
          // Single Candlestick Momentum Breakout Strategy
          const barGainPercent = ((bar.close - bar.open) / bar.open) * 100;
          const isBullishCandle = bar.close > bar.open;
          const hasMomentum = barGainPercent >= minGainThreshold;
          const hasVolumeConfirmation = bar.volume >= avgVolume * 0.7;

          if (isBullishCandle && hasMomentum && hasVolumeConfirmation) {
            entrySignal = true;
          }
        }

        if (entrySignal && cash >= allocationPerTrade) {
          inPosition = true;
          const rawEntryPrice = bar.close;
          // Apply slippage on entry
          entryPrice = rawEntryPrice * (1 + slippageRate);
          initialCost = Math.min(allocationPerTrade, cash);
          currentAmount = (initialCost * (1 - takerFeeRate)) / entryPrice;
          cash -= initialCost;
          tradeRealizedCash = 0;
          highestPrice = rawEntryPrice;
          trailingStopPrice = rawEntryPrice * (1 - trailingStopPercent / 100);
          takeProfitStep = 0;
          entryTime = bar.timestamp;
        }
      }

      // Equity tracking for this bar
      const currentHoldingValue = inPosition ? currentAmount * bar.close : 0;
      const totalEquity = Math.round(cash + currentHoldingValue);

      if (totalEquity > peakEquity) {
        peakEquity = totalEquity;
      }

      const drawdown = peakEquity > 0 ? ((peakEquity - totalEquity) / peakEquity) * 100 : 0;
      if (drawdown > maxDrawdownPercent) {
        maxDrawdownPercent = drawdown;
      }

      // Sample equity curve (limit to ~200 points for chart performance)
      if (i % Math.max(1, Math.floor(bars.length / 150)) === 0 || i === bars.length - 1) {
        equityCurve.push({
          time: new Date(bar.timestamp).toLocaleDateString('id-ID'),
          timestamp: bar.timestamp,
          equity: totalEquity,
        });
      }
    }

    // Close any position remaining open on the final candle
    if (inPosition && bars.length > 0) {
      const finalBar = bars[bars.length - 1];
      const rawExitPrice = finalBar.close;
      const effectiveExitPrice = rawExitPrice * (1 - slippageRate);
      const exitProceeds = currentAmount * effectiveExitPrice * (1 - takerFeeRate);
      cash += exitProceeds;
      tradeRealizedCash += exitProceeds;

      const pnlIdr = tradeRealizedCash - initialCost;
      const pnlPercent = (pnlIdr / initialCost) * 100;

      trades.push({
        id: `bt_${trades.length + 1}`,
        symbol: cleanSymbol,
        entryTime,
        exitTime: finalBar.timestamp,
        entryDate: new Date(entryTime).toLocaleString('id-ID'),
        exitDate: new Date(finalBar.timestamp).toLocaleString('id-ID'),
        entryPrice,
        exitPrice: rawExitPrice,
        highestPrice,
        amount: currentAmount,
        totalCostIdr: initialCost,
        pnlIdr: Math.round(pnlIdr),
        pnlPercent: parseFloat(pnlPercent.toFixed(2)),
        exitReason: 'Backtest End (Market Close)',
        holdDurationHours: Math.max(1, Math.round((finalBar.timestamp - entryTime) / 3600000)),
      });
    }

    const finalBalance = Math.round(cash);
    const netPnlIdr = finalBalance - initialBalance;
    const netPnlPercent = parseFloat(((netPnlIdr / initialBalance) * 100).toFixed(2));
    const winningTrades = trades.filter((t) => t.pnlIdr > 0).length;
    const losingTrades = trades.filter((t) => t.pnlIdr <= 0).length;
    const winRatePercent = trades.length > 0 ? parseFloat(((winningTrades / trades.length) * 100).toFixed(1)) : 0;

    const totalGainIdr = trades.filter((t) => t.pnlIdr > 0).reduce((sum, t) => sum + t.pnlIdr, 0);
    const totalLossIdr = Math.abs(trades.filter((t) => t.pnlIdr < 0).reduce((sum, t) => sum + t.pnlIdr, 0));

    // Honest profit factor: return null if totalLossIdr is 0 (rendered as ∞ without fake 99.99)
    const profitFactor = totalLossIdr === 0 ? (totalGainIdr > 0 ? null : 0) : parseFloat((totalGainIdr / totalLossIdr).toFixed(2));
    const avgPnlPercent = trades.length > 0 ? parseFloat((trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length).toFixed(2)) : 0;

    return {
      symbol: cleanSymbol,
      timeframe,
      days,
      effectiveDays,
      dataTruncated,
      totalCandles: bars.length,
      initialBalance,
      finalBalance,
      netPnlIdr,
      netPnlPercent,
      totalTrades: trades.length,
      winningTrades,
      losingTrades,
      winRatePercent,
      profitFactor,
      maxDrawdownPercent: parseFloat(maxDrawdownPercent.toFixed(2)),
      averageTradePnlPercent: avgPnlPercent,
      slippagePercent,
      feePercent,
      strategyUsed: strategyType === 'live_momentum' ? '24h Rolling Momentum (Live Engine Replay)' : 'Single Candlestick Momentum Breakout',
      trades: trades.reverse(), // most recent first
      equityCurve,
    };
  }
}

export const backtestEngine = new BacktestEngine();
