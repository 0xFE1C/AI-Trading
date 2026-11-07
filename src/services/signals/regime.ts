import type { BtcRegimeInput, RegimeVerdict } from './types.js';

/**
 * Percentile rank (0-100, satu desimal) dari nilai ATR TERAKHIR di dalam seri
 * ATR yang tersedia. Perhitungan memakai matematika yang sama dengan
 * calculateTrueATR (true range + Wilder smoothing), tetapi seri ATR lengkap
 * dipertahankan untuk ranking persentil.
 *
 * Window persentil = SELURUH riwayat candle yang diberikan. Feed produksi
 * memuat +-2 hari candle 15m, sehingga "30d" pada nama input
 * `atrPercentile30d` berarti "persentil pada window terkini yang tersedia",
 * bukan window kalender 30 hari penuh.
 *
 * Returns null when there are fewer than period+2 candles (belum cukup data
 * untuk satu nilai ATR yang bisa diranking secara bermakna).
 */
export function atrPercentileFromCandles(
  candles: Array<{ high: number; low: number; close: number }>,
  period = 14
): number | null {
  if (!candles || candles.length < period + 2) return null;

  // True range series (baris matematika identik dengan utils/indicators.ts)
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

  // Wilder smoothing over the full series (konvensi ATR yang sama)
  const atrSeries: number[] = [];
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atrSeries.push(atr);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    atrSeries.push(atr);
  }

  const latest = atrSeries[atrSeries.length - 1];
  const below = atrSeries.filter((v) => v < latest).length;
  const equal = atrSeries.filter((v) => v === latest).length;
  // Konvensi midpoint untuk ties: seri datar (semua nilai sama) -> 50
  const rank = ((below + equal / 2) / atrSeries.length) * 100;
  return Math.round(rank * 10) / 10;
}

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
