import { PerformanceReport } from '../types';

/**
 * "Skor Kesiapan Live" (Live Readiness Score).
 *
 * Pure utility: given a performance report (all-time) and the current trading
 * mode, compute a 0-100 score from 5 equally weighted (20 points each)
 * beginner-friendly criteria. The component layer owns all i18n — this module
 * only returns language-neutral keys and compact measured "detail" strings
 * (e.g. "12/20", "38.5%", "6.75") that are safe to render in any locale.
 */

export type ReadinessTier = 'belum' | 'hampir' | 'siap';

export interface ReadinessItem {
  /** Stable key used by the UI to pick bilingual copy via l(). */
  key: 'trades' | 'winRate' | 'netPnl' | 'drawdown' | 'profitFactor';
  ok: boolean;
  /** Compact measured value, language-neutral (e.g. "12/20", "38.5%"). */
  detail: string;
}

export interface ReadinessResult {
  /** 0-100, multiples of 20 (5 criteria x 20 points). */
  score: number;
  /** 'siap' >= 70, 'hampir' >= 40, else 'belum'. */
  tier: ReadinessTier;
  items: ReadinessItem[];
}

/** Minimum number of closed trades before live can be considered. */
export const MIN_TRADES_FOR_LIVE = 20;

function toNum(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function computeReadiness(report: PerformanceReport | null, mode: string): ReadinessResult {
  // Live mode is neutral: the user already made the jump, the card does not
  // need to score anything (the UI shows an info state instead).
  if (mode === 'live') {
    return {
      score: 0,
      tier: 'belum',
      items: [],
    };
  }

  if (!report || typeof report !== 'object') {
    return {
      score: 0,
      tier: 'belum',
      items: [
        { key: 'trades', ok: false, detail: `0/${MIN_TRADES_FOR_LIVE}` },
        { key: 'winRate', ok: false, detail: '—' },
        { key: 'netPnl', ok: false, detail: '—' },
        { key: 'drawdown', ok: false, detail: '—' },
        { key: 'profitFactor', ok: false, detail: '—' },
      ],
    };
  }

  // Missing fields are tolerated and treated as "not yet achieved".
  const totalTrades = Math.max(0, Math.round(toNum(report.totalTrades)));
  const winRatePercent = toNum(report.winRatePercent);
  const netPnlIdr = toNum(report.netPnlIdr);
  const maxDrawdownPercent = toNum(report.maxDrawdownPercent);
  const profitFactor =
    typeof report.profitFactor === 'number' && Number.isFinite(report.profitFactor)
      ? report.profitFactor
      : null;
  const grossLossIdr = toNum(report.grossLossIdr);

  const tradesOk = totalTrades >= MIN_TRADES_FOR_LIVE;
  const winRateOk = winRatePercent >= 45;
  const netPnlOk = netPnlIdr > 0;
  const drawdownOk = maxDrawdownPercent <= 15;
  // profitFactor null (no losing trades at all) only counts as a pass when the
  // book is genuinely clean: zero gross losses AND positive net PnL.
  const profitFactorOk =
    profitFactor !== null
      ? profitFactor >= 1.2
      : grossLossIdr === 0 && netPnlIdr > 0;

  const items: ReadinessItem[] = [
    { key: 'trades', ok: tradesOk, detail: `${totalTrades}/${MIN_TRADES_FOR_LIVE}` },
    { key: 'winRate', ok: winRateOk, detail: `${winRatePercent.toFixed(1)}%` },
    { key: 'netPnl', ok: netPnlOk, detail: `${netPnlIdr >= 0 ? '+' : ''}${Math.round(netPnlIdr)}` },
    { key: 'drawdown', ok: drawdownOk, detail: `${maxDrawdownPercent.toFixed(1)}%` },
    {
      key: 'profitFactor',
      ok: profitFactorOk,
      detail: profitFactor === null ? '—' : profitFactor.toFixed(2),
    },
  ];

  const score = items.filter((i) => i.ok).length * 20;
  const tier: ReadinessTier = score >= 70 ? 'siap' : score >= 40 ? 'hampir' : 'belum';

  return { score, tier, items };
}
