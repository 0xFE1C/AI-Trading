import type { BacktestBar } from './index.js';
import { getTakerFeePercent } from '../trading/fees.js';

/**
 * Portfolio-level backtest: multiple symbols, concurrent position slots and a
 * shared cash pool, mirroring how the live engine actually trades (max
 * active trades, per-trade allocation, trailing-stop ratchet, partial TP1).
 * The single-symbol engine answers "is this strategy good on this coin";
 * this answers "is this strategy good for the PORTFOLIO the bot would run".
 */

export interface PortfolioBacktestParams {
  symbols: string[]; // e.g. ['btcidr', 'ethidr', 'solidr']
  timeframe?: '15m' | '1h' | '4h' | '1d';
  days?: number;
  initialBalanceIdr?: number;
  allocationPerTradeIdr?: number;
  maxActiveTrades?: number;
  trailingStopPercent?: number;
  takeProfitStep1Percent?: number;
  minGainThresholdPercent?: number;
  slippagePercent?: number;
  feePercent?: number;
}

export interface PortfolioTrade {
  symbol: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnlIdr: number;
  pnlPercent: number;
  exitReason: string;
}

export interface PortfolioSymbolStat {
  symbol: string;
  candles: number;
  trades: number;
  netPnlIdr: number;
}

export interface PortfolioBacktestResult {
  timeframe: string;
  days: number;
  symbolsRequested: string[];
  symbolsWithData: string[];
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
  maxConcurrentPositions: number;
  slotUtilizationPercent: number;
  slippagePercent: number;
  feePercent: number;
  perSymbol: PortfolioSymbolStat[];
  equityCurve: Array<{ timestamp: number; equity: number }>;
  trades: PortfolioTrade[];
}

interface OpenPosition {
  symbol: string;
  entryTime: number;
  entryPrice: number;
  amount: number;
  initialCost: number;
  highestPrice: number;
  trailingStopPrice: number;
  takeProfitStep: number;
  realizedCash: number;
}

export class PortfolioBacktestEngine {
  public async run(params: PortfolioBacktestParams): Promise<PortfolioBacktestResult> {
    const timeframe = params.timeframe || '1h';
    const days = params.days && params.days > 0 ? Math.min(params.days, 180) : 30;
    const symbols = (params.symbols || []).map((s) => s.toLowerCase().replace('/', '').replace('_', '')).slice(0, 10);
    if (symbols.length === 0) {
      throw new Error('Minimal satu simbol harus ditentukan untuk backtest portofolio.');
    }

    const barsBySymbol = new Map<string, BacktestBar[]>();
    for (const symbol of symbols) {
      const bars = await this.fetchBars(symbol, timeframe, days);
      if (bars.length >= 10) {
        barsBySymbol.set(symbol, bars);
      }
    }

    if (barsBySymbol.size === 0) {
      throw new Error('Tidak ada simbol dengan data historis yang cukup untuk backtest portofolio.');
    }

    return this.simulate(barsBySymbol, params, timeframe, days);
  }

  /** Fetches paginated 1h/15m/4h/1D history from the Indodax TradingView endpoint. */
  private async fetchBars(symbol: string, timeframe: string, days: number): Promise<BacktestBar[]> {
    const tfParam = timeframe === '15m' ? '15' : timeframe === '4h' ? '240' : timeframe === '1d' ? '1D' : '60';
    const nowSec = Math.floor(Date.now() / 1000);
    const from = nowSec - days * 86400;
    const allRawBars: any[] = [];
    let currentTo = nowSec;

    for (let iter = 0; iter < 8; iter++) {
      if (currentTo <= from) break;
      const url = `https://indodax.com/tradingview/history_v2?from=${from}&to=${currentTo}&tf=${tfParam}&symbol=${symbol.toUpperCase()}`;
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Trading/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) break;
        const chunk = (await res.json()) as any[];
        if (!Array.isArray(chunk) || chunk.length === 0) break;
        allRawBars.push(...chunk);
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

  public simulate(
    barsBySymbol: Map<string, BacktestBar[]>,
    params: PortfolioBacktestParams,
    timeframe = '1h',
    days = 30
  ): PortfolioBacktestResult {
    const initialBalance = params.initialBalanceIdr || 10_000_000;
    const allocationPerTrade = params.allocationPerTradeIdr || 100_000;
    const maxActiveTrades = Math.max(1, params.maxActiveTrades || 3);
    const trailingStopPercent = params.trailingStopPercent || 2.5;
    const takeProfitStep1Percent = params.takeProfitStep1Percent || 5.0;
    const slippagePercent = params.slippagePercent !== undefined ? params.slippagePercent : 0.2;
    const feePercent = params.feePercent !== undefined ? params.feePercent : getTakerFeePercent();
    const minGainThreshold = params.minGainThresholdPercent || 1.5;

    const slippageRate = slippagePercent / 100;
    const takerFeeRate = feePercent / 100;

    // Unified chronological timeline: one step per distinct timestamp so
    // cross-symbol concurrency is honored exactly like the live engine.
    const timeSet = new Set<number>();
    for (const bars of barsBySymbol.values()) {
      for (const bar of bars) timeSet.add(bar.timestamp);
    }
    const timeline = Array.from(timeSet).sort((a, b) => a - b);

    // Per-symbol state. Each step: consume fresh bars FIRST, then manage
    // open positions on that bar (zero-lookahead: stops carry from the
    // previous bar), then evaluate entries at the close.
    const barIndexBySymbol = new Map<string, number>();
    const volumeWindows = new Map<string, number[]>();
    const candlesIn24h = timeframe === '15m' ? 96 : timeframe === '4h' ? 6 : timeframe === '1d' ? 1 : 24;

    let cash = initialBalance;
    let peakEquity = initialBalance;
    let maxDrawdownPercent = 0;
    let maxConcurrent = 0;
    let concurrentSlotSum = 0;
    let slotSamples = 0;

    const openPositions: OpenPosition[] = [];
    const trades: PortfolioTrade[] = [];
    const equityCurve: Array<{ timestamp: number; equity: number }> = [];
    const equitySampleStep = Math.max(1, Math.floor(timeline.length / 200));

    const closePosition = (pos: OpenPosition, exitPriceRaw: number, ts: number, reason: string) => {
      const exitPrice = exitPriceRaw * (1 - slippageRate);
      const proceeds = pos.amount * exitPrice * (1 - takerFeeRate);
      cash += proceeds;
      pos.realizedCash += proceeds;
      const pnlIdr = pos.realizedCash - pos.initialCost;
      trades.push({
        symbol: pos.symbol.toUpperCase(),
        entryTime: pos.entryTime,
        exitTime: ts,
        entryPrice: pos.entryPrice,
        exitPrice: exitPriceRaw,
        pnlIdr: Math.round(pnlIdr),
        pnlPercent: parseFloat(((pnlIdr / pos.initialCost) * 100).toFixed(2)),
        exitReason: reason,
      });
    };

    for (const ts of timeline) {
      // --- 1. Consume each symbol's fresh bar for this timestamp ---
      const freshBars = new Map<string, BacktestBar>();
      for (const [symbol, bars] of barsBySymbol) {
        const idx = (barIndexBySymbol.get(symbol) ?? -1) + 1;
        if (idx < bars.length && bars[idx].timestamp === ts) {
          barIndexBySymbol.set(symbol, idx);
          freshBars.set(symbol, bars[idx]);

          const volWindow = volumeWindows.get(symbol) || [];
          volWindow.push(bars[idx].volume);
          if (volWindow.length > 20) volWindow.shift();
          volumeWindows.set(symbol, volWindow);
        }
      }

      // --- 2. Manage open positions on their fresh bar ---
      const exitedThisStep = new Set<string>();
      for (let i = openPositions.length - 1; i >= 0; i--) {
        const pos = openPositions[i];
        const bar = freshBars.get(pos.symbol);
        if (!bar) continue;

        // Trailing stop checked against the level carried from the previous bar
        if (bar.low <= pos.trailingStopPrice) {
          const rawExit = Math.min(bar.open, pos.trailingStopPrice);
          let reason: string;
          if (pos.takeProfitStep === 1) {
            reason = rawExit > pos.entryPrice * 1.002
              ? 'Partial TP + Trailing Stop Profit'
              : Math.abs(rawExit - pos.entryPrice) / pos.entryPrice <= 0.002
                ? 'Partial TP + Breakeven Exit'
                : 'Partial TP + Stop Exit';
          } else {
            reason = rawExit >= pos.entryPrice ? 'Trailing Stop Profit' : 'Trailing Stop Loss';
          }
          closePosition(pos, rawExit, ts, reason);
          openPositions.splice(i, 1);
          exitedThisStep.add(pos.symbol);
          continue;
        }

        pos.highestPrice = Math.max(pos.highestPrice, bar.high);
        const gainPercent = ((bar.high - pos.entryPrice) / pos.entryPrice) * 100;
        if (gainPercent >= takeProfitStep1Percent && pos.takeProfitStep === 0) {
          const half = pos.amount * 0.5;
          const tpPrice = pos.entryPrice * (1 + takeProfitStep1Percent / 100) * (1 - slippageRate);
          const proceeds = half * tpPrice * (1 - takerFeeRate);
          cash += proceeds;
          pos.realizedCash += proceeds;
          pos.amount -= half;
          pos.takeProfitStep = 1;
          pos.trailingStopPrice = Math.max(pos.trailingStopPrice, pos.entryPrice);
        }

        const computedSL = pos.highestPrice * (1 - trailingStopPercent / 100);
        if (computedSL > pos.trailingStopPrice) {
          pos.trailingStopPrice = computedSL;
        }
      }

      // --- 3. New entries: momentum rule (same as the live scan), free slot + cash ---
      if (openPositions.length < maxActiveTrades && cash >= allocationPerTrade) {
        const candidates: Array<{ symbol: string; gain24h: number; bar: BacktestBar }> = [];
        for (const [symbol, bar] of freshBars) {
          if (exitedThisStep.has(symbol)) continue;
          if (openPositions.some((p) => p.symbol === symbol)) continue;

          const bars = barsBySymbol.get(symbol)!;
          const idx = barIndexBySymbol.get(symbol)!;
          if (idx < candlesIn24h) continue;

          const lookback = bars.slice(idx - candlesIn24h, idx);
          const low24h = Math.min(...lookback.map((b) => b.low));
          const gain24h = low24h > 0 ? ((bar.close - low24h) / low24h) * 100 : 0;
          const isBullish = bar.close > bar.open;
          const volWindow = volumeWindows.get(symbol) || [bar.volume];
          const avgVolume = volWindow.reduce((a, b) => a + b, 0) / volWindow.length;
          const hasVolume = bar.volume >= avgVolume * 0.6;

          if (isBullish && gain24h >= minGainThreshold && gain24h <= 25.0 && hasVolume) {
            candidates.push({ symbol, gain24h, bar });
          }
        }

        candidates.sort((a, b) => b.gain24h - a.gain24h);
        for (const candidate of candidates) {
          if (openPositions.length >= maxActiveTrades || cash < allocationPerTrade) break;
          const rawEntry = candidate.bar.close;
          const entryPrice = rawEntry * (1 + slippageRate);
          const initialCost = Math.min(allocationPerTrade, cash);
          const amount = (initialCost * (1 - takerFeeRate)) / entryPrice;
          cash -= initialCost;
          openPositions.push({
            symbol: candidate.symbol,
            entryTime: ts,
            entryPrice,
            amount,
            initialCost,
            highestPrice: rawEntry,
            trailingStopPrice: rawEntry * (1 - trailingStopPercent / 100),
            takeProfitStep: 0,
            realizedCash: 0,
          });
        }
      }

      // --- 4. Equity, drawdown, concurrency telemetry ---
      let holdings = 0;
      for (const pos of openPositions) {
        const bars = barsBySymbol.get(pos.symbol)!;
        const idx = barIndexBySymbol.get(pos.symbol) ?? -1;
        const mark = idx >= 0 ? bars[idx].close : pos.entryPrice;
        holdings += pos.amount * mark;
      }
      const equity = cash + holdings;
      if (equity > peakEquity) peakEquity = equity;
      const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
      if (dd > maxDrawdownPercent) maxDrawdownPercent = dd;
      if (openPositions.length > maxConcurrent) maxConcurrent = openPositions.length;
      concurrentSlotSum += openPositions.length;
      slotSamples++;

      if (slotSamples % equitySampleStep === 0 || slotSamples === timeline.length) {
        equityCurve.push({ timestamp: ts, equity: Math.round(equity) });
      }
    }

    // Close any position still open at the end (marked honestly)
    const finalTs = timeline[timeline.length - 1] || Date.now();
    for (const pos of [...openPositions]) {
      const bars = barsBySymbol.get(pos.symbol)!;
      const idx = barIndexBySymbol.get(pos.symbol) ?? -1;
      const mark = idx >= 0 ? bars[idx].close : pos.entryPrice;
      closePosition(pos, mark, finalTs, 'Backtest End (Market Close)');
    }

    const finalBalance = Math.round(cash);
    const netPnlIdr = finalBalance - initialBalance;
    const winningTrades = trades.filter((t) => t.pnlIdr > 0).length;
    const losingTrades = trades.filter((t) => t.pnlIdr <= 0).length;
    const totalGain = trades.filter((t) => t.pnlIdr > 0).reduce((s, t) => s + t.pnlIdr, 0);
    const totalLoss = Math.abs(trades.filter((t) => t.pnlIdr < 0).reduce((s, t) => s + t.pnlIdr, 0));

    const perSymbol: PortfolioSymbolStat[] = Array.from(barsBySymbol.keys()).map((symbol) => {
      const symTrades = trades.filter((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
      return {
        symbol: symbol.toUpperCase(),
        candles: (barsBySymbol.get(symbol) || []).length,
        trades: symTrades.length,
        netPnlIdr: symTrades.reduce((s, t) => s + t.pnlIdr, 0),
      };
    });

    return {
      timeframe,
      days,
      symbolsRequested: (params.symbols || []).map((s) => s.toUpperCase()),
      symbolsWithData: perSymbol.map((s) => s.symbol),
      totalCandles: perSymbol.reduce((s, x) => s + x.candles, 0),
      initialBalance,
      finalBalance,
      netPnlIdr,
      netPnlPercent: parseFloat(((netPnlIdr / initialBalance) * 100).toFixed(2)),
      totalTrades: trades.length,
      winningTrades,
      losingTrades,
      winRatePercent: trades.length > 0 ? parseFloat(((winningTrades / trades.length) * 100).toFixed(1)) : 0,
      profitFactor: totalLoss === 0 ? (totalGain > 0 ? null : 0) : parseFloat((totalGain / totalLoss).toFixed(2)),
      maxDrawdownPercent: parseFloat(maxDrawdownPercent.toFixed(2)),
      maxConcurrentPositions: maxConcurrent,
      slotUtilizationPercent: slotSamples > 0 ? parseFloat(((concurrentSlotSum / slotSamples / maxActiveTrades) * 100).toFixed(1)) : 0,
      slippagePercent,
      feePercent,
      perSymbol,
      equityCurve,
      trades: trades.reverse(),
    };
  }
}

export const portfolioBacktestEngine = new PortfolioBacktestEngine();
