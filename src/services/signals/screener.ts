import type { MarketSummary } from './types.js';
import type { IndodaxSummaryTicker } from '../indodax/index.js';

/**
 * Screener pasar menyeluruh (WHOLE-MARKET) — 100% deterministik, 0 token LLM.
 *
 * Modul MURNI (tanpa DB / network / I/O): seluruh input berasal dari respons
 * `indodax.getSummaries()` yang SUDAH di-cache oleh pemanggil, sehingga radar
 * ini hidup tanpa satu pun HTTP tambahan dan tanpa satu pun panggilan AI.
 *
 * Dua fungsi publik:
 * - computeMarketBreadth(): "seberapa luas pasar ikut naik?" — persentase pasir
 *   paling likuid yang harga terakhirnya DI ATAS harga 24 jam lalu.
 * - screenMarket(): ranking tahap-1 yang MURAH dari data ticker saja (tanpa
 *   candle). Filter vol/gain/dropFromHigh identik dengan jalur momentum
 *   engine; spread adalah filter TAMBAHAN berbasis ticker top-of-book (1.5%)
 *   — bukan pengganti gerbang spread berbasis depth 0.8% yang tetap dijalankan
 *   engine pada kandidat final.
 */

export interface MarketBreadth {
  /** 0..100 dengan 1 desimal; 0 saat sampleSize 0 (fail-open) */
  percent: number;
  /** Jumlah pasangan yang ikut dihitung (punya harga 24j yang valid) */
  sampleSize: number;
  advancing: number;
  declining: number;
}

export interface ScreenerOptions {
  /** Volume 24j minimum dalam IDR (identik filter momentum engine) */
  minVolumeIdr?: number;
  /** Spread top-of-book ticker maksimum dalam persen (default 1.5) */
  maxSpreadPercent?: number;
  /** Pita gain (last vs low 24j) yang dianggap momentum sehat */
  gainBandMin?: number;
  gainBandMax?: number;
  /** Retracement maksimum dari pucuk 24j (persen) */
  maxDropFromHighPercent?: number;
  /** Jumlah kandidat teratas yang dikembalikan */
  maxCandidates?: number;
  /** Simbol yang dikecualikan: posisi terbuka, ghost, cooldown, threat */
  excludeSymbols?: Iterable<string>;
}

export interface ScreenerCandidate {
  symbol: string;
  pair: string;
  last: number;
  gain24h: number;
  volIdr: number;
  dropFromHigh: number;
  spreadPct: number;
  /** Persentil volume kandidat di dalam pool yang lolos filter (0..1) */
  volumePercentile: number;
  /** Posisi gain di dalam pita [gainBandMin, gainBandMax] (0..1) */
  gainBandPosition: number;
  /** Skor murah tahap-1: 0.6 * volumePercentile + 0.4 * gainBandPosition */
  cheapScore: number;
  /** Alasan deterministik berbahasa Indonesia (selalu non-kosong) */
  reasons: string[];
}

/** Ambil angka dari string/number secara defensif; mengembalikan null saat tidak valid. */
function toNum(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Market breadth: di antara `topN` pasangan paling likuid (volIdr24h desc),
 * berapa persen yang last > harga 24 jam lalu?
 *
 * Kontrak fail-open: bila `prices24h` kosong/tidak tersedia (mis. stub test
 * atau respons bursa yang tidak menyertakan peta harga 24j) → sampleSize 0
 * dan percent 0; pemanggil (gate breadth) WAJIB memperlakukan sampleSize 0
 * sebagai fail-open (gate lolos), bukan sebagai pasar sehat/lemah.
 *
 * Matematika: advancing = last > p24; declining = last < p24; last == p24
 * dihitung netral (tidak masuk keduanya). percent = advancing / sampleSize * 100
 * dibulatkan 1 desimal. Pasangan tanpa harga 24j yang valid dilewati.
 */
export function computeMarketBreadth(
  summaries: MarketSummary[],
  prices24h: Record<string, string | number>,
  topN = 20
): MarketBreadth {
  if (!Array.isArray(summaries) || summaries.length === 0 || !prices24h) {
    return { percent: 0, sampleSize: 0, advancing: 0, declining: 0 };
  }

  const liquid = [...summaries].sort((a, b) => (b.volIdr24h || 0) - (a.volIdr24h || 0)).slice(0, Math.max(0, topN));

  let advancing = 0;
  let declining = 0;
  let sampleSize = 0;

  for (const s of liquid) {
    const last = toNum(s.last);
    if (last === null || last <= 0) continue;

    const p24 = lookupPrice24h(prices24h, s);
    if (p24 === null || p24 <= 0) continue; // tanpa harga 24j → skip (defensif)

    sampleSize++;
    if (last > p24) advancing++;
    else if (last < p24) declining++;
  }

  const percent = sampleSize > 0 ? round1((advancing / sampleSize) * 100) : 0;
  return { percent, sampleSize, advancing, declining };
}

/**
 * Cari harga 24-jam-lalu dengan beberapa varian kunci pair ('btc_idr',
 * 'btcidr', 'BTCIDR', 'btc', 'BTC') — respons bursa/stub tidak selalu konsisten.
 */
function lookupPrice24h(prices24h: Record<string, string | number>, s: MarketSummary): number | null {
  const compact = s.pair?.replace('_', '');
  const candidates = [
    s.pair,
    compact,
    s.pair?.toUpperCase(),
    compact?.toUpperCase(),
    `${s.symbol}_idr`,
    `${s.symbol}idr`,
    `${s.symbol}_IDR`,
    s.symbol,
    s.symbol?.toUpperCase(),
  ];
  for (const key of candidates) {
    if (!key) continue;
    const raw = prices24h[key];
    if (raw !== undefined) {
      const n = toNum(raw);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Konversi peta ticker `getSummaries()` menjadi daftar MarketSummary murni
 * (parse defensif; ticker rusak/harga nol dilewati). Dipakai engine & radar.
 */
export function marketSummariesFromTickers(
  tickers: Record<string, IndodaxSummaryTicker>
): MarketSummary[] {
  const out: MarketSummary[] = [];
  if (!tickers) return out;
  const ts = Date.now();
  for (const [key, t] of Object.entries(tickers)) {
    if (!key.endsWith('_idr')) continue;
    const last = toNum(t?.last);
    if (last === null || last <= 0) continue;
    out.push({
      symbol: key.replace('_idr', ''),
      pair: key,
      last,
      high24h: toNum(t.high) ?? 0,
      low24h: toNum(t.low) ?? 0,
      volIdr24h: toNum(t.vol_idr) ?? 0,
      buyPrice: toNum(t.buy) ?? 0,
      sellPrice: toNum(t.sell) ?? 0,
      ts,
    });
  }
  return out;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Ranking tahap-1 (MURAH): hanya dari data ticker — TANPA candle, TANPA HTTP,
 * TANPA AI. Hard filter identik dengan jalur momentum engine:
 *   - volume 24j >= minVolumeIdr
 *   - gain24h = (last - low) / low * 100 di dalam pita [gainBandMin, gainBandMax]
 *   - dropFromHigh = (high - last) / high * 100 <= maxDropFromHighPercent
 *   - spread top-of-book ticker <= maxSpreadPercent
 *   - simbol tidak di-exclude (posisi terbuka / ghost / cooldown / threat)
 *
 * Rumus cheapScore (deterministik, terdokumentasi):
 *   volumePercentile  = peringkat volume kandidat di dalam pool yang lolos
 *                       filter, dinormalisasi 0..1 (terbesar = 1; pool 1
 *                       elemen = 1). Ties volume → urutan stabil.
 *   gainBandPosition  = clamp((gain - gainMin) / (gainMax - gainMin), 0, 1)
 *   cheapScore        = 0.6 * volumePercentile + 0.4 * gainBandPosition
 *   (bobot 60/40: likuiditas lebih penting daripada ketinggian gain karena
 *    gain tinggi di pita juga berarti makin dekat pucuk.)
 *
 * Ranking akhir: cheapScore desc → volIdr desc → symbol asc (tie-break penuh,
 * hasil identik untuk input identik). Alasan selalu non-kosong ('momentum
 * sehat' adalah dasar bagi setiap kandidat yang lolos pita gain).
 */
export function screenMarket(summaries: MarketSummary[], opts: ScreenerOptions = {}): ScreenerCandidate[] {
  const {
    minVolumeIdr = 200_000_000,
    maxSpreadPercent = 1.5,
    gainBandMin = 2,
    gainBandMax = 20,
    maxDropFromHighPercent = 5,
    maxCandidates = 12,
    excludeSymbols,
  } = opts;

  const excluded = new Set<string>();
  if (excludeSymbols) {
    for (const s of excludeSymbols) {
      if (s) excluded.add(String(s).toLowerCase().replace('_idr', '').replace('/', ''));
    }
  }

  const passed: ScreenerCandidate[] = [];

  for (const s of summaries) {
    const symbol = s.symbol.toLowerCase().replace('_idr', '');
    if (excluded.has(symbol)) continue;

    // Sanitasi eksplisit: baris dengan field non-finite (mis. dari pemanggil
    // yang membangun summary manual) harus ditolak, bukan lolos karena semua
    // perbandingan dengan NaN menghasilkan false.
    const last = toNum(s.last);
    const low24h = toNum(s.low24h);
    const high24h = toNum(s.high24h);
    const volIdr24h = toNum(s.volIdr24h);
    const buyPrice = toNum(s.buyPrice);
    const sellPrice = toNum(s.sellPrice);
    if (last === null || low24h === null || high24h === null || volIdr24h === null) continue;

    if (volIdr24h < minVolumeIdr) continue;

    const gain24h = low24h > 0 ? ((last - low24h) / low24h) * 100 : 0;
    if (gain24h < gainBandMin || gain24h > gainBandMax) continue;

    const dropFromHigh = high24h > 0 ? ((high24h - last) / high24h) * 100 : 0;
    if (dropFromHigh > maxDropFromHighPercent) continue;

    // Spread top-of-book dari ticker (buy = best bid, sell = best ask).
    const spreadPct = sellPrice !== null && buyPrice !== null && sellPrice > 0 && buyPrice > 0
      ? ((sellPrice - buyPrice) / sellPrice) * 100
      : 0;
    if (spreadPct > maxSpreadPercent) continue;

    passed.push({
      symbol,
      pair: s.pair,
      last,
      gain24h: round1(gain24h),
      volIdr: volIdr24h,
      dropFromHigh: Math.round(dropFromHigh * 100) / 100,
      spreadPct: Math.round(spreadPct * 100) / 100,
      volumePercentile: 0, // diisi setelah pool lengkap
      gainBandPosition: clamp01((gain24h - gainBandMin) / Math.max(gainBandMax - gainBandMin, 1e-9)),
      cheapScore: 0,
      reasons: [],
    });
  }

  // Persentil volume di dalam pool lolos filter (0..1, terbesar = 1).
  const byVolume = [...passed].sort((a, b) => a.volIdr - b.volIdr || a.symbol.localeCompare(b.symbol));
  byVolume.forEach((c, idx) => {
    c.volumePercentile = byVolume.length > 1 ? idx / (byVolume.length - 1) : 1;
  });

  for (const c of passed) {
    c.cheapScore = Math.round((0.6 * c.volumePercentile + 0.4 * c.gainBandPosition) * 10000) / 10000;

    const reasons: string[] = ['momentum sehat'];
    if (c.volumePercentile >= 0.75) reasons.push('volume besar');
    if (c.spreadPct > 0 && c.spreadPct <= 0.5) reasons.push('spread sempit');
    if (c.gainBandPosition >= 0.6) reasons.push('gain kuat di dalam pita');
    c.reasons = reasons;
  }

  return passed
    .sort(
      (a, b) =>
        b.cheapScore - a.cheapScore ||
        b.volIdr - a.volIdr ||
        a.symbol.localeCompare(b.symbol)
    )
    .slice(0, Math.max(0, maxCandidates));
}
