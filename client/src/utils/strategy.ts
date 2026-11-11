import type { LanguageContextType } from '../i18n/LanguageContext';

/**
 * Atribusi strategi entry — label & warna badge yang dipakai bersama oleh
 * ReportView dan DashboardView. Identifiers identik dengan kolom
 * `strategy` di opportunity_shortlist / `entry_strategy` di positions
 * ('bluechip_pullback' | 'momentum' | 'new_listing' | 'manual'; NULL/unknown
 * untuk baris legacy).
 */
export type EntryStrategyKey = 'bluechip_pullback' | 'momentum' | 'volatility_squeeze' | 'new_listing' | 'manual' | 'unknown';

export function strategyKey(strategy: string | null | undefined): EntryStrategyKey {
  switch (strategy) {
    case 'bluechip_pullback':
    case 'momentum':
    case 'volatility_squeeze':
    case 'new_listing':
    case 'manual':
      return strategy;
    default:
      return 'unknown';
  }
}

export function strategyLabel(
  strategy: string | null | undefined,
  l: LanguageContextType['l']
): string {
  switch (strategyKey(strategy)) {
    case 'bluechip_pullback':
      return l('Blue-Chip Pullback', 'Blue-Chip Pullback');
    case 'momentum':
      return l('Momentum', 'Momentum');
    case 'volatility_squeeze':
      return l('Volatility Squeeze', 'Squeeze Breakout');
    case 'new_listing':
      return l('New Listing', 'Listing Baru');
    case 'manual':
      return l('Manual', 'Manual');
    default:
      return l('Unknown', 'Tidak diketahui');
  }
}

/** Kelas badge kecil bertema gelap: blue-chip=sky, momentum=amber, squeeze=emerald, new_listing=fuchsia, manual=slate. */
export function strategyBadgeClass(strategy: string | null | undefined): string {
  switch (strategyKey(strategy)) {
    case 'bluechip_pullback':
      return 'bg-sky-950/60 text-sky-300 border-sky-500/30';
    case 'momentum':
      return 'bg-amber-950/50 text-amber-300 border-amber-500/30';
    case 'volatility_squeeze':
      return 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30';
    case 'new_listing':
      return 'bg-fuchsia-950/50 text-fuchsia-300 border-fuchsia-500/30';
    case 'manual':
      return 'bg-slate-800/70 text-slate-300 border-slate-600/40';
    default:
      return 'bg-slate-900 text-slate-400 border-slate-700';
  }
}

export interface ClientExitPlan {
  tp1Pct: number;
  tp2Pct: number | null;
  trailingPct: number;
  legacy: boolean;
}

/**
 * Parser minimal & defensif untuk positions.exit_plan_json di sisi klien
 * (tanpa mengimpor kode backend). JSON hilang/korup/angka tak masuk akal →
 * null (pemanggil tidak merender apa pun).
 */
export function parseClientExitPlan(raw: string | null | undefined): ClientExitPlan | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const tp1 = Number(parsed.tp1Pct);
    const trail = Number(parsed.trailingPct);
    if (!Number.isFinite(tp1) || tp1 <= 0 || tp1 > 25 || !Number.isFinite(trail) || trail <= 0 || trail > 8) {
      return null;
    }

    const tp2Raw = parsed.tp2Pct;
    const tp2Num = tp2Raw === null || tp2Raw === undefined ? NaN : Number(tp2Raw);
    const tp2 = Number.isFinite(tp2Num) && tp2Num > 0 && tp2Num <= 50 ? tp2Num : null;

    return {
      tp1Pct: tp1,
      tp2Pct: tp2,
      trailingPct: trail,
      legacy: Boolean(parsed.legacy),
    };
  } catch {
    return null;
  }
}

/**
 * Baris ringkas rencana exit utk dashboard:
 * 'TP1 7.5% · TP2 15% · Trail 3.75% · adaptif' (atau '· standar', 'TP2 off').
 */
export function formatClientExitPlanLine(raw: string | null | undefined): string | null {
  const plan = parseClientExitPlan(raw);
  if (!plan) return null;
  const tp2 = plan.tp2Pct !== null ? `TP2 ${plan.tp2Pct}%` : 'TP2 off';
  const label = plan.legacy ? 'standar' : 'adaptif';
  return `TP1 ${plan.tp1Pct}% · ${tp2} · Trail ${plan.trailingPct}% · ${label}`;
}
