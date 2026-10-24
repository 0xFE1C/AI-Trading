import { calculateRSI, calculateEMA, calculateTrueATR } from '../../utils/indicators.js';
import type { CoinFeatures, MarketSummary } from './types.js';
import type { IndodaxDepth } from '../indodax/index.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

export function extractFeatures(
  summary: MarketSummary,
  candles15m: Array<{ open: number; high: number; low: number; close: number; volume: number }> = [],
  depth?: IndodaxDepth
): CoinFeatures {
  const closes = candles15m.map((c) => c.close);
  const rsi14 = closes.length >= 14 ? calculateRSI(closes, 14) : null;
  const ema9 = closes.length >= 9 ? calculateEMA(closes, 9) : null;
  const ema21 = closes.length >= 21 ? calculateEMA(closes, 21) : null;
  const atr14 = candles15m.length >= 14 ? calculateTrueATR(candles15m, 14) : null;

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
  const isBluechip = ['btc', 'eth', 'sol', 'bnb', 'xrp'].includes(cleanSym);

  return {
    symbol: cleanSym,
    ts: Date.now(),
    close: summary.last,
    rsi14: rsi14 !== null ? round2(rsi14) : null,
    ema9: ema9 !== null ? round2(ema9) : null,
    ema21: ema21 !== null ? round2(ema21) : null,
    atr14: atr14 !== null ? round2(atr14) : null,
    gain24hPct: round2(gain24hPct),
    dropFromHighPct: round2(dropFromHighPct),
    volumeSurgeRatio: round2(volumeSurgeRatio),
    spreadPct: round2(spreadPct),
    depthImbalance,
    isBluechip,
  };
}
