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

export interface MacdResult {
  macd: number; // EMA(fast) - EMA(slow)
  signal: number; // EMA(macd series, signalPeriod)
  histogram: number; // macd - signal
}

/**
 * Calculates MACD (Moving Average Convergence Divergence) with its signal
 * line and histogram. Returns null until the slow EMA AND the signal EMA
 * over the macd series both have enough data — never a partial guess.
 */
export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MacdResult | null {
  if (!closes || closes.length < slowPeriod + signalPeriod) return null;

  const emaSeries = (period: number): number[] => {
    const k = 2 / (period + 1);
    let seed = 0;
    for (let i = 0; i < period; i++) seed += closes[i];
    const out: number[] = [];
    let ema = seed / period;
    out.push(ema);
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
      out.push(ema);
    }
    return out;
  };

  const fast = emaSeries(fastPeriod);
  const slow = emaSeries(slowPeriod);
  // slow starts at index slowPeriod-1 of closes; align fast to the same index
  const fastAligned = fast.slice(slowPeriod - fastPeriod);

  const macdSeries = fastAligned.map((f, i) => f - slow[i]);
  if (macdSeries.length < signalPeriod) return null;

  const kSignal = 2 / (signalPeriod + 1);
  let signal = macdSeries.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;
  for (let i = signalPeriod; i < macdSeries.length; i++) {
    signal = macdSeries[i] * kSignal + signal * (1 - kSignal);
  }

  const macd = macdSeries[macdSeries.length - 1];
  return {
    macd: Number(macd.toFixed(4)),
    signal: Number(signal.toFixed(4)),
    histogram: Number((macd - signal).toFixed(4)),
  };
}

/**
 * Bollinger Band width in percent of the middle band: identifies squeeze
 * (low width) and expansion (high width) regimes.
 * width% = 4 * stdDev / SMA * 100
 */
export function calculateBollingerWidth(closes: number[], period = 20, stdDevMultiplier = 2): number | null {
  if (!closes || closes.length < period || period <= 0) return null;

  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  if (mean <= 0) return null;
  // width% = (upper - lower) / middle * 100 = (2 * m * stdDev) / sma * 100
  return Number(((stdDevMultiplier * 2 * stdDev * 100) / mean).toFixed(2));
}

/**
 * Z-score of the latest volume against a rolling window: flags volume
 * anomalies (e.g. >= 2 = unusual activity) independent of coin scale.
 * Returns null when the window has zero variance (flat/illiquid data).
 */
export function calculateVolumeZScore(volumes: number[], window = 20): number | null {
  if (!volumes || volumes.length < window || window <= 1) return null;

  const slice = volumes.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / window;
  const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / window;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return null;
  const latest = volumes[volumes.length - 1];
  return Number(((latest - mean) / stdDev).toFixed(2));
}
