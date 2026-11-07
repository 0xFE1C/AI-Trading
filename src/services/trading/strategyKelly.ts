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
