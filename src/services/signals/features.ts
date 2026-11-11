import {
  calculateRSI,
  calculateEMA,
  calculateTrueATR,
  calculateMACD,
  calculateBollingerBands,
  calculateVolumeZScore,
  calculateADX,
  calculateVWAP,
} from '../../utils/indicators.js';
import type { CoinFeatures, MarketSummary } from './types.js';
import type { IndodaxDepth } from '../indodax/index.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Koin likuid utama Indodax — dipakai features & backtest adaptive exit.
export const BLUECHIP_SYMBOLS = ['btc', 'eth', 'sol', 'bnb', 'xrp'];

export function isBluechipSymbol(symbol: string): boolean {
  const cleanSym = String(symbol || '').toLowerCase().replace('_idr', '').replace(/idr$/, '');
  return BLUECHIP_SYMBOLS.includes(cleanSym);
}

export function computeDepthImbalance(depth: IndodaxDepth, layers = 10): number {
  if (!depth || !depth.buy || !depth.sell || depth.buy.length === 0 || depth.sell.length === 0) {
    return 1.0;
  }

  const buyLayers = depth.buy.slice(0, layers);
  const sellLayers = depth.sell.slice(0, layers);

  let buyVolumeTotal = 0;
  for (const [p, v] of buyLayers) {
    buyVolumeTotal += parseFloat(p) * parseFloat(v);
  }

  let sellVolumeTotal = 0;
  for (const [p, v] of sellLayers) {
    sellVolumeTotal += parseFloat(p) * parseFloat(v);
  }

  if (sellVolumeTotal === 0) return 2.0;
  return round2(buyVolumeTotal / sellVolumeTotal);
}

/**
 * Detects whether a coin is emerging from a low-volatility Bollinger Band squeeze
 * into an upside breakout (prior 20-bar width compressed, current price >= upper band
 * or %B >= 0.85 with positive volume expansion).
 */
export function detectSqueezeBreakout(
  closes: number[],
  bbPercentB: number | null,
  bbWidthPct: number | null,
  volumeZScore: number | null,
  volumeSurgeRatio: number
): boolean {
  if (closes.length < 24 || bbPercentB === null || bbWidthPct === null) return false;

  // Check prior Bollinger width (3 bars ago) to verify coils/compression before breakout
  const priorCloses = closes.slice(0, closes.length - 2);
  const priorBb = calculateBollingerBands(priorCloses, 20, 2);
  if (!priorBb) return false;

  const wasTight = priorBb.widthPct <= 6.5 || (bbWidthPct <= 8.0 && priorBb.widthPct <= bbWidthPct * 1.05);
  // A fresh coil breakout can print %B from ~0.82 (pressing upper band) up to ~1.75
  // when the prior band was ultra-tight (<2% width) and the breakout candle expands volatility.
  const breakingUp = bbPercentB >= 0.82 && bbPercentB <= 1.85;
  const hasVolumeFuel = (volumeZScore !== null && volumeZScore >= 0.8) || volumeSurgeRatio >= 1.25;

  return wasTight && breakingUp && hasVolumeFuel;
}

export function extractFeatures(
  summary: MarketSummary,
  candles15m: Array<{ open: number; high: number; low: number; close: number; volume: number; rawVolume?: number }> = [],
  depth?: IndodaxDepth
): CoinFeatures {
  const closes = candles15m.map((c) => c.close);
  const volumes = candles15m.map((c) => c.volume);

  const rsi14 = closes.length >= 15 ? calculateRSI(closes, 14) : null;
  const ema9 = closes.length >= 9 ? calculateEMA(closes, 9) : null;
  const ema21 = closes.length >= 21 ? calculateEMA(closes, 21) : null;
  const ema50 = closes.length >= 50 ? calculateEMA(closes, 50) : null;
  const atr14 = candles15m.length >= 15 ? calculateTrueATR(candles15m, 14) : null;

  const macdRes = closes.length >= 35 ? calculateMACD(closes, 12, 26, 9) : null;
  const adxRes = candles15m.length >= 28 ? calculateADX(candles15m, 14) : null;
  const bbRes = closes.length >= 20 ? calculateBollingerBands(closes, 20, 2) : null;
  const vwap = candles15m.length >= 4 ? calculateVWAP(candles15m, 24) : null;
  const volumeZScore = volumes.length >= 20 ? calculateVolumeZScore(volumes, 20) : null;

  const vwapDistancePct =
    vwap !== null && vwap > 0 && summary.last > 0
      ? round2(((summary.last - vwap) / vwap) * 100)
      : null;

  const gain24hPct = summary.low24h > 0 ? ((summary.last - summary.low24h) / summary.low24h) * 100 : 0;
  const dropFromHighPct = summary.high24h > 0 ? ((summary.last - summary.high24h) / summary.high24h) * 100 : 0;

  // Volume surge ratio: volume of last 4 candles (1h) vs average per 4 candles
  let volumeSurgeRatio = 1.0;
  if (candles15m.length >= 8) {
    const lastHourVol = candles15m.slice(-4).reduce((a, c) => a + c.volume, 0);
    const avgHourlyVol = candles15m.reduce((a, c) => a + c.volume, 0) / Math.max(candles15m.length / 4, 1);
    volumeSurgeRatio = avgHourlyVol > 0 ? lastHourVol / avgHourlyVol : 1.0;
  }

  const spreadPct = summary.sellPrice > 0 ? ((summary.sellPrice - summary.buyPrice) / summary.sellPrice) * 100 : 0;
  const depthImbalance = depth ? computeDepthImbalance(depth, 10) : 1.0;

  const cleanSym = summary.symbol.toLowerCase().replace('_idr', '');
  const isBluechip = BLUECHIP_SYMBOLS.includes(cleanSym);

  const isSqueezeBreakout = detectSqueezeBreakout(
    closes,
    bbRes?.percentB ?? null,
    bbRes?.widthPct ?? null,
    volumeZScore,
    volumeSurgeRatio
  );

  return {
    symbol: cleanSym,
    ts: Date.now(),
    close: summary.last,
    high24h: summary.high24h,
    low24h: summary.low24h,
    volume24hIdr: summary.volIdr24h,
    rsi14: rsi14 !== null ? round2(rsi14) : null,
    ema9: ema9 !== null ? round2(ema9) : null,
    ema21: ema21 !== null ? round2(ema21) : null,
    ema50: ema50 !== null ? round2(ema50) : null,
    atr14: atr14 !== null ? round2(atr14) : null,
    macdHistogram: macdRes ? macdRes.histogram : null,
    adx14: adxRes ? adxRes.adx : null,
    plusDi14: adxRes ? adxRes.plusDi : null,
    minusDi14: adxRes ? adxRes.minusDi : null,
    bbWidthPct: bbRes ? bbRes.widthPct : null,
    bbPercentB: bbRes ? bbRes.percentB : null,
    vwap,
    vwapDistancePct,
    volumeZScore,
    isSqueezeBreakout,
    gain24hPct: round2(gain24hPct),
    dropFromHighPct: round2(dropFromHighPct),
    volumeSurgeRatio: round2(volumeSurgeRatio),
    spreadPct: round2(spreadPct),
    depthImbalance,
    isBluechip,
  };
}
