import type { CoinFeatures, MarketRegime, ScoreResult, Strategy } from './types.js';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Skor 0..100: semakin dekat ke rentang ideal semakin tinggi */
function bandScore(value: number, idealLo: number, idealHi: number, hardLo: number, hardHi: number): number {
  if (value < hardLo || value > hardHi) return 0;
  if (value >= idealLo && value <= idealHi) return 100;
  const dist = value < idealLo ? idealLo - value : value - idealHi;
  const maxDist = value < idealLo ? idealLo - hardLo : hardHi - idealHi;
  if (maxDist <= 0) return 100;
  return clamp(100 - (dist / maxDist) * 100, 0, 100);
}

export function scoreOpportunity(
  f: CoinFeatures,
  coinSentiment: number, // -1.0 .. +1.0 from lexicon
  threatActive: boolean,
  regime: MarketRegime,
  strategy: Strategy
): ScoreResult {
  const breakdown: Record<string, number> = {};
  let score = 0;

  if (threatActive) {
    return { symbol: f.symbol, strategy, score: 0, breakdown: { threat_veto: 0 } };
  }

  if (strategy === 'bluechip_pullback') {
    // Missing indicators must not be imputed into a tradable score.
    if (f.rsi14 === null || f.ema21 === null) {
      return { symbol: f.symbol, strategy, score: 0, breakdown: { missing_indicators: 0 } };
    }
    // Konservatif: beli pullback pada blue-chip sehat
    const rsi = f.rsi14;
    const rsiScore = rsi < 35 ? 100 : rsi < 48 ? 85 : rsi <= 60 ? 50 : 0;
    // Dip score: drop from high is between -0.5% and -8% (healthy dip, not crashing)
    const dipScore = bandScore(f.dropFromHighPct, -4, -0.5, -9, 0.5);
    const trendScore = f.close >= f.ema21 ? 100 : 40;
    const sentimentScore = clamp((coinSentiment + 1) * 50, 0, 100);
    const qualityScore = clamp(100 - f.spreadPct * 50, 0, 100);

    breakdown.rsi = Math.round(rsiScore * 0.25);
    breakdown.dip = Math.round(dipScore * 0.30);
    breakdown.trend = Math.round(trendScore * 0.25);
    breakdown.sentiment = Math.round(sentimentScore * 0.10);
    breakdown.quality = Math.round(qualityScore * 0.10);

    // Optional multi-factor confluence bonus when richer indicators are present:
    // VWAP support alignment + positive MACD inflection (capped +8 pts, never penalizes missing fields)
    let confluence = 0;
    if (typeof f.vwapDistancePct === 'number' && f.vwapDistancePct >= -2.5 && f.vwapDistancePct <= 1.5) {
      confluence += 4;
    }
    if (typeof f.macdHistogram === 'number' && f.macdHistogram >= 0) {
      confluence += 4;
    }
    if (confluence > 0) breakdown.confluence = confluence;

    score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  } else if (strategy === 'momentum') {
    if (f.rsi14 === null) {
      return { symbol: f.symbol, strategy, score: 0, breakdown: { missing_indicators: 0 } };
    }
    // Balanced: momentum band (2-12%) dengan konfirmasi volume & depth imbalance
    const gainScore = bandScore(f.gain24hPct, 2, 10, 0, 20);
    const volumeScore = clamp((f.volumeSurgeRatio - 0.8) * 60, 0, 100);
    const depthScore = clamp((f.depthImbalance - 0.8) * 100, 0, 100);
    const rsiScore = f.rsi14 > 70 ? 0 : f.rsi14 < 30 ? 70 : 100;
    const sentimentScore = clamp((coinSentiment + 1) * 50, 0, 100);

    breakdown.gain = Math.round(gainScore * 0.30);
    breakdown.volume = Math.round(volumeScore * 0.25);
    breakdown.depth = Math.round(depthScore * 0.20);
    breakdown.rsi = Math.round(rsiScore * 0.15);
    breakdown.sentiment = Math.round(sentimentScore * 0.10);

    // Multi-factor trend & institutional flow confluence (ADX +DI>-DI, VWAP, MACD, Vol Z-Score)
    let confluence = 0;
    if (
      typeof f.adx14 === 'number' &&
      f.adx14 >= 22 &&
      typeof f.plusDi14 === 'number' &&
      typeof f.minusDi14 === 'number' &&
      f.plusDi14 > f.minusDi14
    ) {
      confluence += 5;
    } else if (
      typeof f.adx14 === 'number' &&
      f.adx14 >= 25 &&
      typeof f.plusDi14 === 'number' &&
      typeof f.minusDi14 === 'number' &&
      f.minusDi14 > f.plusDi14
    ) {
      // Strong bearish directional dominance despite 24h gain -> distribution warning
      confluence -= 8;
    }
    if (typeof f.vwapDistancePct === 'number') {
      if (f.vwapDistancePct >= 0 && f.vwapDistancePct <= 4.0) confluence += 4;
      else if (f.vwapDistancePct > 8.0) confluence -= 5; // Overextended far above intraday VWAP
    }
    if (typeof f.macdHistogram === 'number' && f.macdHistogram > 0) {
      confluence += 3;
    }
    if (typeof f.volumeZScore === 'number' && f.volumeZScore >= 1.5) {
      confluence += 3;
    }
    if (confluence !== 0) breakdown.confluence = confluence;

    score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  } else if (strategy === 'volatility_squeeze') {
    // Volatility Squeeze Breakout: catches tight Bollinger coils expanding upward
    // BEFORE 24h gain becomes overextended. Requires RSI14 + Bollinger Bands.
    if (f.rsi14 === null || f.bbWidthPct === null || f.bbWidthPct === undefined || f.bbPercentB === null || f.bbPercentB === undefined) {
      return { symbol: f.symbol, strategy, score: 0, breakdown: { missing_indicators: 0 } };
    }
    if (f.rsi14 > 70 || f.rsi14 < 45) {
      return { symbol: f.symbol, strategy, score: 0, breakdown: { rsi_out_of_band: 0 } };
    }

    // Tighter coil = higher compression potential (ideal width 1.0%..6.5%, hard cap 12%)
    const compressionScore = bandScore(f.bbWidthPct, 1.0, 6.5, 0.2, 12.0);
    // Breakout position in upper Bollinger zone (%B ideal 0.80..1.50, hard cap 2.10)
    const breakoutPosScore = bandScore(f.bbPercentB, 0.80, 1.50, 0.55, 2.10);
    // Volume ignition: Z-score or surge ratio
    const zPart = typeof f.volumeZScore === 'number' ? clamp(f.volumeZScore * 40, 0, 100) : 0;
    const surgePart = clamp((f.volumeSurgeRatio - 1.0) * 80, 0, 100);
    const volumeIgnitionScore = Math.max(zPart, surgePart);
    // Trend & VWAP alignment
    const aboveVwap = typeof f.vwap === 'number' && f.vwap > 0 ? f.close >= f.vwap : true;
    const aboveEma = f.ema21 !== null ? f.close >= f.ema21 : true;
    const structureScore = aboveVwap && aboveEma ? 100 : aboveVwap || aboveEma ? 60 : 0;
    const sentimentScore = clamp((coinSentiment + 1) * 50, 0, 100);

    breakdown.compression = Math.round(compressionScore * 0.30);
    breakdown.breakout = Math.round(breakoutPosScore * 0.25);
    breakdown.volume = Math.round(volumeIgnitionScore * 0.25);
    breakdown.structure = Math.round(structureScore * 0.12);
    breakdown.sentiment = Math.round(sentimentScore * 0.08);
    if (f.isSqueezeBreakout) {
      breakdown.squeeze_confirmed = 8;
    }
    score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  } else {
    // new_listing: butuh volume & momentum awal
    const volumeScore = clamp((f.volumeSurgeRatio - 1.5) * 50, 0, 100);
    const gainScore = bandScore(f.gain24hPct, 5, 30, 0, 100);
    breakdown.volume = Math.round(volumeScore * 0.60);
    breakdown.gain = Math.round(gainScore * 0.40);
    score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  }

  // Regime adjustment: RISK_OFF requires higher score hurdle
  if (regime === 'RISK_OFF') {
    score -= 10;
    breakdown.regime_penalty = -10;
  }

  return {
    symbol: f.symbol,
    strategy,
    score: clamp(Math.round(score), 0, 100),
    breakdown,
  };
}

export const SCORE_THRESHOLDS: Record<'conservative' | 'balanced' | 'aggressive', number> = {
  conservative: 65,
  balanced: 60,
  aggressive: 50,
};
