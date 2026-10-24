/**
 * Quantitative Technical Indicators for Real-Time Crypto Market Analysis
 * Pure deterministic mathematical calculations (RSI, EMA, True ATR).
 */

export interface CandleData {
  high: number;
  low: number;
  close: number;
}

/**
 * Calculates Relative Strength Index (RSI) using Wilder's smoothed method.
 * @param closes Array of closing prices (chronological order, oldest to newest)
 * @param period Default 14
 * @returns RSI value (0 to 100) or null if insufficient data
 */
export function calculateRSI(closes: number[], period: number = 14): number | null {
  if (!closes || period <= 0 || closes.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgGain === 0 && avgLoss === 0) return 50; // Neutral momentum for flat-line price
  if (avgLoss === 0) return 100; // Pure gains without down-candles
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

/**
 * Calculates Exponential Moving Average (EMA).
 * @param closes Array of closing prices (chronological order)
 * @param period Lookback period
 * @returns Latest EMA value or null if insufficient data
 */
export function calculateEMA(closes: number[], period: number): number | null {
  if (!closes || period <= 0 || closes.length < period) return null;

  const k = 2 / (period + 1);

  // Initial SMA as seed for EMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  let ema = sum / period;

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }

  return Number(ema.toFixed(4));
}

/**
 * Calculates Average True Range (True ATR).
 * TR = max(high - low, abs(high - prevClose), abs(low - prevClose))
 * @param candles Array of candles with high, low, close
 * @param period Default 14
 * @returns Latest True ATR value or null if insufficient data
 */
export function calculateTrueATR(candles: CandleData[], period: number = 14): number | null {
  if (!candles || period <= 0 || candles.length <= period) return null;

  const trs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const hl = current.high - current.low;
    const hpc = Math.abs(current.high - prev.close);
    const lpc = Math.abs(current.low - prev.close);
    trs.push(Math.max(hl, hpc, lpc));
  }

  if (trs.length < period) return null;

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }

  return Number(atr.toFixed(4));
}
