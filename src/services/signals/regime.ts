import type { BtcRegimeInput, RegimeVerdict } from './types.js';

export function detectBtcRegime(input: BtcRegimeInput): RegimeVerdict {
  const reasons: string[] = [];

  // CRASH: Sharp downward movement in short window (1h <= -3% or 4h <= -5%)
  if (input.change1hPct <= -3.0 || input.change4hPct <= -5.0) {
    reasons.push(
      `BTC ${input.change1hPct.toFixed(2)}% (1j) / ${input.change4hPct.toFixed(2)}% (4j) — flash dump terdeteksi`
    );
    return { regime: 'CRASH', allowNewEntries: false, reasons };
  }

  const belowEma = input.ema21_1h != null ? input.close < input.ema21_1h : false;
  const highVolatility = input.atrPercentile30d != null && input.atrPercentile30d >= 80;

  if (belowEma && highVolatility) {
    reasons.push('BTC di bawah EMA21 (1j) dengan volatilitas tinggi (ATR pct >= 80)');
    return { regime: 'RISK_OFF', allowNewEntries: true, reasons };
  }

  if (input.change1hPct >= 1.0 && !belowEma) {
    reasons.push(`BTC +${input.change1hPct.toFixed(2)}% (1j) dan di atas EMA21`);
    return { regime: 'RISK_ON', allowNewEntries: true, reasons };
  }

  reasons.push(`BTC stabil: 1h: ${input.change1hPct.toFixed(2)}%, 4h: ${input.change4hPct.toFixed(2)}%`);
  return { regime: 'NEUTRAL', allowNewEntries: true, reasons };
}
