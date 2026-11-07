/**
 * Adaptive Exit Engine — rencana exit per posisi yang kontekstual, bukan aturan
 * kaku "TP di 3% flat". Mengambil ATR (volatilitas), rezim BTC, lonjakan volume,
 * kedalaman bid, dan status blue-chip untuk melebarkan/mencerutkan target TP dan
 * trailing stop DI SAAT ENTRY, lalu rencananya disimpan di posisi.
 *
 * Modul MURNI: tanpa DB / network / Date.now / random → 100% deterministik dan
 * unit-testable. Prinsip penting:
 *  - Target profit boleh melar (mengikuti volatilitas & rezim), tetapi RISIKO
 *    (trailing) tetap berjangkar pada setting user: tidak pernah > 2x base.
 *  - Data hilang → faktor tepat 1.0 (perilaku legacy), tidak pernah lebih
 *    sedikit proteksi dari setting dasar user.
 */

export interface ExitPlanInput {
  atrPct: number | null; // TrueATR sebagai % harga, di saat entry
  regime: string | null; // 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'CRASH' | null
  volumeSurgeRatio: number | null;
  depthImbalance: number | null;
  isBluechip: boolean;
  baseTp1Pct: number; // setting user take_profit_target_1_percent
  baseTp2Pct: number | null; // setting user (<=0 atau null = TP2 nonaktif)
  baseTrailingPct: number; // setting user trailing_stop_percent
  tp1SellFractionPct?: number | null; // fraksi jual TP1 (default 50), tidak diubah oleh engine
  tp2SellFractionPct?: number | null; // fraksi jual TP2 dari sisa (default 50)
}

export interface ExitPlan {
  tp1Pct: number;
  tp1Fraction: number; // fraksi 1..100 dari posisi
  tp2Pct: number | null;
  tp2Fraction: number;
  trailingPct: number;
  atrPct: number | null;
  regime: string | null;
  rationale: string[]; // Bahasa Indonesia, satu entri per faktor non-netral
  legacy: boolean; // true saat tidak ada sinyal adaptif sama sekali
}

// --- Konstanta faktor (satu sumber kebenaran untuk engine & backtest) ---

const REGIME_TP_FACTOR: Record<string, number> = {
  RISK_ON: 1.25,
  NEUTRAL: 1.0,
  RISK_OFF: 0.8,
  CRASH: 0.7,
};

const REGIME_TRAIL_FACTOR: Record<string, number> = {
  RISK_ON: 1.15,
  NEUTRAL: 1.0,
  RISK_OFF: 0.85,
  CRASH: 0.75,
};

const REGIME_TP_LINE: Record<string, string> = {
  RISK_ON: 'Regime RISK_ON → target dilonggarkan agar profit berlari',
  RISK_OFF: 'Regime RISK_OFF → target dipercepat agar profit terkunci',
  CRASH: 'Regime CRASH → target dipercepat, trailing diperketat',
};

const REGIME_TRAIL_LINE: Record<string, string> = {
  RISK_ON: 'Regime RISK_ON → trailing diperlebar sedikit (1.15x)',
  RISK_OFF: 'Regime RISK_OFF → trailing diperketat (0.85x)',
  CRASH: 'Regime CRASH → trailing diperketat (0.75x)',
};

const MOMENTUM_BOOST_LINE = 'Lonjakan volume + bid wall kuat → target +20%';
const MOMENTUM_WEAK_LINE = 'Volume melemah (surge <0.8x) → target dipangkas (0.85x)';
const ATR_WIDE_PREFIX = 'ATR';
const ATR_WIDE_SUFFIX = '(>2x normal) → target & trailing diperlebar';
const ATR_TIGHT_SUFFIX = '(volatilitas rendah) → target & trailing dirapatkan';
const BLUECHIP_LINE = 'Blue-chip: pergerakan lebih stabil → target & trailing sedikit dirapatkan';

// Batas keras hasil akhir (profit boleh melar, risiko tetap terjangkar)
const TP1_MIN = 2.0;
const TP1_MAX = 25.0;
const TP2_MIN = 4.0;
const TP2_MAX = 50.0;
const TRAIL_MIN = 1.0;
const TRAIL_MAX = 8.0;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isFinitePositive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Faktor volatilitas dari ATR: ATR 2% dianggap "normal" (faktor 1.0).
 * ATR hilang/tidak valid → tepat 1.0 (perilaku legacy dijamin tidak berubah).
 */
function volatilityFactor(atrPct: number | null): number {
  if (!isFinitePositive(atrPct)) return 1.0;
  return clamp(atrPct / 2.0, 0.7, 2.0);
}

function regimeFactor(map: Record<string, number>, regime: string | null): number {
  if (!regime) return 1.0;
  return map[regime] ?? 1.0;
}

/**
 * Faktor momentum TP: butuh KONFIRMASI GANDA (lonjakan volume >= 1.5x DAN
 * bid wall >= 1.2x) untuk melebarkan; volume surut (<0.8x) memangkas target.
 * Data hilang → 1.0.
 */
function momentumTpFactor(
  volumeSurgeRatio: number | null,
  depthImbalance: number | null
): { factor: number; line: string | null } {
  const surge = typeof volumeSurgeRatio === 'number' && Number.isFinite(volumeSurgeRatio) ? volumeSurgeRatio : null;
  const depth = typeof depthImbalance === 'number' && Number.isFinite(depthImbalance) ? depthImbalance : null;

  if (surge !== null && surge >= 1.5 && depth !== null && depth >= 1.2) {
    return { factor: 1.2, line: MOMENTUM_BOOST_LINE };
  }
  if (surge !== null && surge < 0.8) {
    return { factor: 0.85, line: MOMENTUM_WEAK_LINE };
  }
  return { factor: 1.0, line: null };
}

/** Fraksi jual dalam persen (1..100); di luar rentang / tidak valid → 50. */
function sanitizeFractionPct(value: number | null | undefined): number {
  return isFinitePositive(value) && value >= 1 && value <= 100 ? value : 50;
}

/**
 * Fallback legacy: PERSIS nilai setting user saat ini, tanpa clamp tambahan —
 * dijamin byte-identik dengan perilaku engine sebelum adaptive exit ada.
 */
export function buildLegacyPlan(input: Pick<
  ExitPlanInput,
  'baseTp1Pct' | 'baseTp2Pct' | 'baseTrailingPct' | 'tp1SellFractionPct' | 'tp2SellFractionPct'
>): ExitPlan {
  const tp2 = isFinitePositive(input.baseTp2Pct) ? round2(input.baseTp2Pct) : null;
  return {
    tp1Pct: round2(input.baseTp1Pct),
    tp1Fraction: sanitizeFractionPct(input.tp1SellFractionPct),
    tp2Pct: tp2,
    tp2Fraction: sanitizeFractionPct(input.tp2SellFractionPct),
    trailingPct: round2(input.baseTrailingPct),
    atrPct: null,
    regime: null,
    rationale: [],
    legacy: true,
  };
}

/**
 * Menghitung rencana exit adaptif. Semua keluaran dibulatkan 2 desimal dan
 * di-clamp ke batas keras. `legacy=true` hanya saat ATR dan rezim sama-sama
 * absen — semua faktor dipaksa 1.0 sehingga hasil = nilai base user.
 */
export function computeExitPlan(input: ExitPlanInput): ExitPlan {
  const atr = isFinitePositive(input.atrPct) ? input.atrPct : null;
  const regime = typeof input.regime === 'string' && input.regime ? input.regime : null;

  // Tidak ada sinyal adaptif sama sekali → perilaku legacy murni
  if (atr === null && regime === null) {
    const legacy = buildLegacyPlan(input);
    return { ...legacy, atrPct: null, regime: null };
  }

  const rationale: string[] = [];
  const volF = volatilityFactor(atr);
  if (volF > 1.0 && atr !== null) {
    rationale.push(`${ATR_WIDE_PREFIX} ${round2(atr)}% ${ATR_WIDE_SUFFIX}`);
  } else if (volF < 1.0 && atr !== null) {
    rationale.push(`${ATR_WIDE_PREFIX} ${round2(atr)}% ${ATR_TIGHT_SUFFIX}`);
  }

  const regimeTp = regimeFactor(REGIME_TP_FACTOR, regime);
  const regimeTrail = regimeFactor(REGIME_TRAIL_FACTOR, regime);
  if (regime && regimeTp !== 1.0 && REGIME_TP_LINE[regime]) {
    rationale.push(REGIME_TP_LINE[regime]);
  }
  if (regime && regimeTrail !== 1.0 && REGIME_TRAIL_LINE[regime]) {
    rationale.push(REGIME_TRAIL_LINE[regime]);
  }

  const { factor: momentumTp, line: momentumLine } = momentumTpFactor(input.volumeSurgeRatio, input.depthImbalance);
  if (momentumLine) rationale.push(momentumLine);

  const bluechipTp = input.isBluechip ? 0.97 : 1.0;
  const bluechipTrail = input.isBluechip ? 0.95 : 1.0;
  if (input.isBluechip) rationale.push(BLUECHIP_LINE);

  // Target profit: boleh melar mengikuti konteks, dibatasi batas keras 2..25%.
  const tp1Pct = clamp(round2(input.baseTp1Pct * volF * regimeTp * momentumTp * bluechipTp), TP1_MIN, TP1_MAX);

  // TP2 tetap ekstensi 2x dari TP1 adaptif (bukan angka bebas).
  const tp2Pct = isFinitePositive(input.baseTp2Pct) ? clamp(round2(tp1Pct * 2), TP2_MIN, TP2_MAX) : null;

  // Trailing (sisi rugi): beradaptasi modest, hard bound 1..8%, dan TIDAK
  // PERNAH melebihi 2x base user — target boleh melar, risiko tetap
  // berjangkar pada setting user. Urutan operasi penting: bulatkan dulu
  // kedua kandidat, baru ambil min, lalu jamin floor TRAIL_MIN — tanpa ini
  // base < 0.5% bisa menghasilkan nilai di bawah floor, dan pembulatan
  // setelah min bisa melampaui jangkar 2x-base hingga 0.005pp.
  const trailClamped = clamp(round2(input.baseTrailingPct * volF * regimeTrail * bluechipTrail), TRAIL_MIN, TRAIL_MAX);
  const trailAnchored = Math.max(TRAIL_MIN, Math.min(trailClamped, round2(input.baseTrailingPct * 2)));
  const trailingPct = trailAnchored;

  return {
    tp1Pct,
    tp1Fraction: sanitizeFractionPct(input.tp1SellFractionPct),
    tp2Pct,
    tp2Fraction: sanitizeFractionPct(input.tp2SellFractionPct),
    trailingPct,
    atrPct: atr,
    regime,
    rationale,
    legacy: false,
  };
}

/**
 * Titik keputusan entry: pakai rencana adaptif hanya bila fitur aktif;
 * adaptive_exit_enabled='0' → fallback legacy persis nilai setting.
 */
export function resolveEntryExitPlan(args: ExitPlanInput & { adaptiveEnabled: boolean }): ExitPlan {
  if (!args.adaptiveEnabled) {
    return buildLegacyPlan(args);
  }
  return computeExitPlan(args);
}

/**
 * Parse defensif exit_plan_json dari database. JSON hilang/korup/angka tidak
 * masuk akal → null (pemanggil WAJIB fallback ke setting global persis seperti
 * perilaku lama). tp2Pct invalid dinetralkan ke null (TP2 off), tp1/trailing
 * invalid membuat SELURUH plan dibuang.
 */
export function parseStoredExitPlan(raw: string | null | undefined): ExitPlan | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ExitPlan> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const tp1 = Number((parsed as Partial<ExitPlan>).tp1Pct);
    const trail = Number((parsed as Partial<ExitPlan>).trailingPct);
    // Batas bawah + atas: rencana yang ditulis engine selalu berada di dalam
    // klem yang sama dengan computeExitPlan. Baris DB yang diedit manual
    // dengan nilai ekstrem (mis. tp1 500%) harus ditolak, bukan dipercaya.
    if (!Number.isFinite(tp1) || tp1 <= 0 || tp1 > TP1_MAX || !Number.isFinite(trail) || trail <= 0 || trail > TRAIL_MAX) {
      return null;
    }

    const tp2Raw = (parsed as Partial<ExitPlan>).tp2Pct;
    const tp2Num = tp2Raw === null || tp2Raw === undefined ? NaN : Number(tp2Raw);
    const tp2 = Number.isFinite(tp2Num) && tp2Num > 0 && tp2Num <= TP2_MAX ? tp2Num : null;

    const fr1 = Number((parsed as Partial<ExitPlan>).tp1Fraction);
    const fr2 = Number((parsed as Partial<ExitPlan>).tp2Fraction);

    const atrRaw = (parsed as Partial<ExitPlan>).atrPct;
    const atr = atrRaw === null || atrRaw === undefined ? null : Number(atrRaw);

    return {
      tp1Pct: tp1,
      tp1Fraction: Number.isFinite(fr1) && fr1 >= 1 && fr1 <= 100 ? fr1 : 50,
      tp2Pct: tp2,
      tp2Fraction: Number.isFinite(fr2) && fr2 >= 1 && fr2 <= 100 ? fr2 : 50,
      trailingPct: trail,
      atrPct: atr !== null && Number.isFinite(atr) ? atr : null,
      regime: typeof (parsed as Partial<ExitPlan>).regime === 'string' ? (parsed as Partial<ExitPlan>).regime as string : null,
      rationale: Array.isArray((parsed as Partial<ExitPlan>).rationale)
        ? ((parsed as Partial<ExitPlan>).rationale as unknown[]).map(String)
        : [],
      legacy: Boolean((parsed as Partial<ExitPlan>).legacy),
    };
  } catch {
    return null;
  }
}

/**
 * Satu baris ringkas untuk notifikasi WhatsApp / audit:
 * 'Exit Plan: TP1 7.5% · TP2 15% · Trail 3.75% (adaptif)' atau '(standar)'.
 */
export function formatExitPlanLine(plan: ExitPlan | null): string | null {
  if (!plan) return null;
  const tp2 = plan.tp2Pct !== null && Number.isFinite(plan.tp2Pct) ? ` · TP2 ${plan.tp2Pct}%` : ' · TP2 off';
  const label = plan.legacy ? 'standar' : 'adaptif';
  return `Exit Plan: TP1 ${plan.tp1Pct}%${tp2} · Trail ${plan.trailingPct}% (${label})`;
}

/** Kemudahan untuk pemanggil yang hanya punya string JSON dari DB. */
export function formatStoredExitPlanLine(raw: string | null | undefined): string | null {
  return formatExitPlanLine(parseStoredExitPlan(raw));
}
