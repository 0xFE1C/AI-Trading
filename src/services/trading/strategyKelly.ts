/**
 * Strategy-level Kelly Governor — saudara per-strategi dari faktor Kelly
 * global yang sudah ada di scanAndExecuteEntries (20 trade tertutup terakhir,
 * winRate < 0.35 → x0.6, >= 0.65 → x1.2, selainnya 1.0).
 *
 * Modul MURNI: tanpa DB / network / Date.now / random → 100% deterministik
 * dan unit-testable. Threshold sengaja DICERMINKAN PERSIS dari faktor Kelly
 * global agar tidak ada strategi yang diperlakukan lebih lunak/ketat dari
 * portofolio secara keseluruhan.
 *
 * Dasar PnL: menang = pnlPercent > 0 — tanda (sign) pnl_percent dan pnl_idr
 * identik untuk posisi tertutup (keduanya dihitung dari PnL net yang sama),
 * jadi winRate di sini konsisten dengan winRate Kelly global yang memakai
 * pnl_idr > 0.
 */

export const STRATEGY_KELLY_MIN_TRADES = 6;
export const STRATEGY_KELLY_LOSING_FACTOR = 0.6;
export const STRATEGY_KELLY_WINNING_FACTOR = 1.2;
export const STRATEGY_KELLY_LOSING_WIN_RATE = 0.35;
export const STRATEGY_KELLY_WINNING_WIN_RATE = 0.65;

/**
 * Faktor pengali alokasi untuk SATU strategi berdasarkan N trade tertutup
 * terakhirnya. < 6 trade → 1.0 (belum cukup bukti, jangan main pivot).
 */
export function strategyKellyFactor(closedTrades: Array<{ pnlPercent: number }>): number {
  if (!Array.isArray(closedTrades) || closedTrades.length < STRATEGY_KELLY_MIN_TRADES) {
    return 1.0;
  }

  const wins = closedTrades.filter((t) => typeof t?.pnlPercent === 'number' && Number.isFinite(t.pnlPercent) && t.pnlPercent > 0).length;
  const winRate = wins / closedTrades.length;

  if (winRate < STRATEGY_KELLY_LOSING_WIN_RATE) {
    return STRATEGY_KELLY_LOSING_FACTOR;
  }
  if (winRate >= STRATEGY_KELLY_WINNING_WIN_RATE) {
    return STRATEGY_KELLY_WINNING_FACTOR;
  }
  return 1.0;
}

export interface ContinuousKellyAnalytics {
  sampleSize: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  payoffRatio: number | null; // R = AvgWin / AvgLoss
  fullKellyFraction: number;  // f* = W - (1 - W) / R
  halfKellyMultiplier: number; // Clamped allocation multiplier [0.5 .. 1.35] around baseline
  expectancyPct: number;      // W * AvgWin - (1 - W) * AvgLoss
}

/**
 * Payoff-Aware Continuous Half-Kelly Estimator:
 * Classic Kelly f* = W - (1 - W) / R captures asymmetric spot payoffs (e.g. a
 * 42% win-rate trend runner with 3:1 avg win/loss has strong positive expectancy,
 * whereas a 62% win-rate scalper with 0.4:1 payoff bleeds money).
 */
export function computeContinuousKelly(closedTrades: Array<{ pnlPercent: number }>): ContinuousKellyAnalytics {
  const valid = (closedTrades || []).filter(
    (t) => typeof t?.pnlPercent === 'number' && Number.isFinite(t.pnlPercent)
  );
  const n = valid.length;
  if (n < STRATEGY_KELLY_MIN_TRADES) {
    return {
      sampleSize: n,
      winRate: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      payoffRatio: null,
      fullKellyFraction: 0,
      halfKellyMultiplier: 1.0,
      expectancyPct: 0,
    };
  }

  const winTrades = valid.filter((t) => t.pnlPercent > 0);
  const lossTrades = valid.filter((t) => t.pnlPercent < 0);
  const w = winTrades.length / n;
  const l = lossTrades.length / n;

  const avgWin = winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.pnlPercent, 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + t.pnlPercent, 0) / lossTrades.length) : 0;
  const expectancy = w * avgWin - l * avgLoss;

  if (avgLoss === 0) {
    const mult = avgWin > 0 ? 1.3 : 1.0;
    return {
      sampleSize: n,
      winRate: Number(w.toFixed(4)),
      avgWinPct: Number(avgWin.toFixed(2)),
      avgLossPct: 0,
      payoffRatio: avgWin > 0 ? null : 0,
      fullKellyFraction: avgWin > 0 ? 1.0 : 0,
      halfKellyMultiplier: mult,
      expectancyPct: Number(expectancy.toFixed(2)),
    };
  }

  const r = avgWin > 0 ? avgWin / avgLoss : 0;
  const fullKelly = r > 0 ? w - (1 - w) / r : -1;

  // Map Half-Kelly edge into a bounded position-sizing multiplier [0.50 .. 1.35]:
  // Negative expectancy -> throttle down to 0.50x..0.75x; strong positive edge -> up to 1.35x.
  let multiplier = 1.0;
  if (fullKelly <= -0.15) {
    multiplier = 0.5;
  } else if (fullKelly < 0) {
    multiplier = 0.7;
  } else if (fullKelly >= 0.30) {
    multiplier = 1.35;
  } else if (fullKelly >= 0.15) {
    multiplier = 1.15;
  }

  return {
    sampleSize: n,
    winRate: Number(w.toFixed(4)),
    avgWinPct: Number(avgWin.toFixed(2)),
    avgLossPct: Number(avgLoss.toFixed(2)),
    payoffRatio: Number(r.toFixed(2)),
    fullKellyFraction: Number(fullKelly.toFixed(4)),
    halfKellyMultiplier: Number(multiplier.toFixed(2)),
    expectancyPct: Number(expectancy.toFixed(2)),
  };
}
