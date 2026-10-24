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
    // Konservatif: beli pullback pada blue-chip sehat
    const rsi = f.rsi14 ?? 45;
    const rsiScore = rsi < 35 ? 100 : rsi < 48 ? 85 : rsi <= 60 ? 50 : 0;
    // Dip score: drop from high is between -0.5% and -8% (healthy dip, not crashing)
    const dipScore = bandScore(f.dropFromHighPct, -4, -0.5, -9, 0.5);
    const trendScore = f.ema21 != null ? (f.close >= f.ema21 ? 100 : 40) : 70;
    const sentimentScore = clamp((coinSentiment + 1) * 50, 0, 100);
    const qualityScore = clamp(100 - f.spreadPct * 50, 0, 100);

    breakdown.rsi = Math.round(rsiScore * 0.25);
    breakdown.dip = Math.round(dipScore * 0.30);
    breakdown.trend = Math.round(trendScore * 0.25);
    breakdown.sentiment = Math.round(sentimentScore * 0.10);
    breakdown.quality = Math.round(qualityScore * 0.10);
    score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  } else if (strategy === 'momentum') {
    // Balanced: momentum band (2-12%) dengan konfirmasi volume & depth imbalance
    const gainScore = bandScore(f.gain24hPct, 2, 10, 0, 20);
    const volumeScore = clamp((f.volumeSurgeRatio - 0.8) * 60, 0, 100);
    const depthScore = clamp((f.depthImbalance - 0.8) * 100, 0, 100);
    const rsi = f.rsi14 ?? 50;
    const rsiScore = rsi > 70 ? 0 : rsi < 30 ? 70 : 100;
    const sentimentScore = clamp((coinSentiment + 1) * 50, 0, 100);

    breakdown.gain = Math.round(gainScore * 0.30);
    breakdown.volume = Math.round(volumeScore * 0.25);
    breakdown.depth = Math.round(depthScore * 0.20);
    breakdown.rsi = Math.round(rsiScore * 0.15);
    breakdown.sentiment = Math.round(sentimentScore * 0.10);
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
