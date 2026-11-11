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

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  widthPct: number;
  percentB: number; // 0 = lower band, 0.5 = SMA middle, 1 = upper band, >1 = breakout above upper
}

/**
 * Full Bollinger Bands snapshot including %B position and width%.
 */
export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2
): BollingerBandsResult | null {
  if (!closes || closes.length < period || period <= 0) return null;

  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  if (mean <= 0) return null;

  const variance = slice.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const bandHalf = stdDevMultiplier * stdDev;
  const upper = mean + bandHalf;
  const lower = mean - bandHalf;
  const latest = closes[closes.length - 1];
  const bandRange = upper - lower;
  const percentB = bandRange > 0 ? (latest - lower) / bandRange : 0.5;
  const widthPct = ((bandRange * 100) / mean);

  return {
    upper: Number(upper.toFixed(4)),
    middle: Number(mean.toFixed(4)),
    lower: Number(lower.toFixed(4)),
    widthPct: Number(widthPct.toFixed(2)),
    percentB: Number(percentB.toFixed(3)),
  };
}

export interface AdxResult {
  adx: number;     // 0..100 trend strength (>= 25 = trending, < 20 = ranging/chop)
  plusDi: number;  // +DI directional bullish force
  minusDi: number; // -DI directional bearish force
}

/**
 * Calculates Wilder's Average Directional Index (ADX) + Directional Indicators (+DI / -DI).
 * Requires at least (2 * period) candles so both Wilder's TR/DM smoothing and DX smoothing
 * converge without lookahead or artificial seed values.
 */
export function calculateADX(candles: CandleData[], period = 14): AdxResult | null {
  if (!candles || period <= 0 || candles.length < period * 2) return null;

  const trList: number[] = [];
  const plusDmList: number[] = [];
  const minusDmList: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;

    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );

    trList.push(tr);
    plusDmList.push(plusDm);
    minusDmList.push(minusDm);
  }

  if (trList.length < period * 2 - 1) return null;

  let smoothTr = trList.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDm = plusDmList.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDm = minusDmList.slice(0, period).reduce((a, b) => a + b, 0);

  const dxSeries: number[] = [];
  let latestPlusDi = 0;
  let latestMinusDi = 0;

  const computeDxStep = () => {
    latestPlusDi = smoothTr > 0 ? (smoothPlusDm / smoothTr) * 100 : 0;
    latestMinusDi = smoothTr > 0 ? (smoothMinusDm / smoothTr) * 100 : 0;
    const diSum = latestPlusDi + latestMinusDi;
    const dx = diSum > 0 ? (Math.abs(latestPlusDi - latestMinusDi) / diSum) * 100 : 0;
    dxSeries.push(dx);
  };

  computeDxStep();

  for (let i = period; i < trList.length; i++) {
    smoothTr = smoothTr - smoothTr / period + trList[i];
    smoothPlusDm = smoothPlusDm - smoothPlusDm / period + plusDmList[i];
    smoothMinusDm = smoothMinusDm - smoothMinusDm / period + minusDmList[i];
    computeDxStep();
  }

  if (dxSeries.length < period) return null;

  let adx = dxSeries.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxSeries.length; i++) {
    adx = (adx * (period - 1) + dxSeries[i]) / period;
  }

  return {
    adx: Number(adx.toFixed(2)),
    plusDi: Number(latestPlusDi.toFixed(2)),
    minusDi: Number(latestMinusDi.toFixed(2)),
  };
}

/**
 * Rolling Volume-Weighted Average Price (VWAP) over `window` candles.
 * Uses Typical Price = (High + Low + Close) / 3 weighted by candle volume.
 * Note: when candle `volume` is stored as IDR notional (rawVolume * close) and
 * `rawVolume` is available, prefers `rawVolume` so price is not double-weighted.
 */
export function calculateVWAP(
  candles: Array<{ high: number; low: number; close: number; volume: number; rawVolume?: number }>,
  window = 24
): number | null {
  if (!candles || candles.length === 0 || window <= 0) return null;
  const slice = candles.slice(-window);

  let sumPv = 0;
  let sumVol = 0;
  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    const vol =
      typeof c.rawVolume === 'number' && Number.isFinite(c.rawVolume) && c.rawVolume > 0
        ? c.rawVolume
        : c.close > 0 && c.volume > 0
          ? c.volume
          : 0;
    if (typical > 0 && vol > 0) {
      sumPv += typical * vol;
      sumVol += vol;
    }
  }

  if (sumVol <= 0) return null;
  return Number((sumPv / sumVol).toFixed(4));
}

/**
 * Computes Pearson return correlation (-1.0 .. +1.0) between two close-price series.
 * Aligns from the newest bar backwards over `maxBars` overlapping returns.
 * Returns null if fewer than `minReturns` valid overlapping return pairs exist
 * or either series has zero variance.
 */
export function calculateReturnCorrelation(
  closesA: number[],
  closesB: number[],
  maxBars = 32,
  minReturns = 10
): number | null {
  if (!closesA || !closesB) return null;
  const len = Math.min(closesA.length, closesB.length, maxBars + 1);
  if (len < minReturns + 1) return null;

  const sliceA = closesA.slice(-len);
  const sliceB = closesB.slice(-len);

  const retA: number[] = [];
  const retB: number[] = [];
  for (let i = 1; i < len; i++) {
    if (sliceA[i - 1] > 0 && sliceB[i - 1] > 0) {
      retA.push((sliceA[i] - sliceA[i - 1]) / sliceA[i - 1]);
      retB.push((sliceB[i] - sliceB[i - 1]) / sliceB[i - 1]);
    }
  }

  const n = retA.length;
  if (n < minReturns) return null;

  const meanA = retA.reduce((s, v) => s + v, 0) / n;
  const meanB = retB.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = retA[i] - meanA;
    const db = retB[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  const denom = Math.sqrt(varA * varB);
  if (denom === 0) return null;
  const corr = Math.max(-1, Math.min(1, cov / denom));
  return Number(corr.toFixed(3));
}
