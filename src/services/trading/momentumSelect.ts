import type { CoinFeatures, ScoreResult } from '../signals/index.js';
import { SCORE_THRESHOLDS } from '../signals/index.js';

/**
 * Pemilihan kandidat momentum untuk profil balanced & aggressive.
 *
 * Modul murni (tanpa DB/network): mesin scan yang mengambil candle & skor
 * memasukkan kandidat yang SUDAH lolos seluruh hard filter (volume minimum,
 * threat scope, drop dari puncak <= 5%, gain 24j dalam pita, single-exposure
 * meme, dedupe posisi & ghost). Fungsi ini hanya memutuskan kandidat mana
 * yang dipilih sehingga mudah di-unit-test tanpa jaringan.
 *
 * Mode:
 * - 'composite_score': hanya kandidat dengan skor >= SCORE_THRESHOLDS[profile]
 *   yang menang; pilih skor tertinggi (tie-break: gain24h lebih tinggi).
 *   Bila tidak ada yang lolos ambang, jatuh kembali ke pick gain_rank agar bot
 *   tetap men-trading kandidat hard-filtered terbaik (strategi tidak mati total
 *   hanya karena sinyal komposit sedang sepi).
 * - 'gain_rank': perilaku legacy persis — kandidat gain24h tertinggi.
 */

export const MOMENTUM_MEME_TOKENS = new Set(['doge', 'pepe', 'shib', 'floki', 'bonk', 'wif', 'bome', 'neiro', 'pnut', 'turb']);

export type EntryScoringMode = 'composite_score' | 'gain_rank';

export interface MomentumCandidateInput {
  symbol: string;
  gain24h: number;
  volIdr: number;
  last: number;
  dropFromHigh: number;
  // Diisi oleh pemanggil setelah fetch candle 15m + scoreOpportunity;
  // kandidat tanpa skor dianggap tidak lolos ambang pada mode composite.
  features?: CoinFeatures | null;
  score?: ScoreResult | null;
  // Hasil konfirmasi multi-timeframe 1h dari engine; kandidat 'veto' sudah
  // disaring sebelum masuk sini (bidang ini hanya metadata deterministik).
  mtfStatus?: 'pass' | 'veto' | 'warn';
}

export interface MomentumSelection {
  symbol: string;
  reason: string;
  score: ScoreResult | null;
  source: 'composite_score' | 'gain_rank_fallback' | 'gain_rank';
}

export function selectMomentumCandidate(options: {
  mode: EntryScoringMode;
  profile: 'conservative' | 'balanced' | 'aggressive';
  candidates: MomentumCandidateInput[];
  isAlreadyHoldingMeme: boolean;
  /**
   * Simbol yang ditradingkan dalam 24 jam terakhir (dihitung engine dari
   * closed_at posisi). Tie-break rotasi: bila dua kandidat nilainya dalam
   * jarak 2.0 poin, pilih yang TIDAK baru ditradingkan — dorongan lembut
   * agar bot berotasi antar koin, bukan veto.
   */
  recentlyTradedSymbols?: Set<string>;
}): MomentumSelection | null {
  const { mode, profile, candidates, isAlreadyHoldingMeme, recentlyTradedSymbols } = options;

  // Meme single-exposure guard: hanya satu posisi memecoin pada satu waktu.
  const eligible = candidates.filter(
    (c) => !(isAlreadyHoldingMeme && MOMENTUM_MEME_TOKENS.has(c.symbol.toLowerCase()))
  );
  if (eligible.length === 0) return null;

  const rankedByGain = [...eligible].sort((a, b) => b.gain24h - a.gain24h);

  if (mode === 'composite_score') {
    const threshold = SCORE_THRESHOLDS[profile];
    const qualified = eligible
      .filter((c) => c.score && c.score.score >= threshold)
      .sort((a, b) => (b.score!.score - a.score!.score) || (b.gain24h - a.gain24h));

    let best = qualified[0];

    // Tie-break keragaman (rotasi): kandidat dengan skor dalam 2.0 poin dari
    // puncak diurutkan tetap (skor desc, gain desc); ambil yang pertama yang
    // TIDAK baru ditradingkan. Tanpa daftar recently-traded → perilaku lama.
    if (best && best.score && recentlyTradedSymbols && recentlyTradedSymbols.size > 0) {
      const fresh = qualified.find(
        (c) =>
          best!.score!.score - c.score!.score <= 2.0 &&
          !recentlyTradedSymbols.has(c.symbol.toLowerCase())
      );
      if (fresh) best = fresh;
    }

    if (best && best.score) {
      return {
        symbol: best.symbol,
        reason: `Momentum Komposit (Skor: ${best.score.score}/100, +${best.gain24h.toFixed(1)}%, Volume: Rp ${(best.volIdr / 1e6).toFixed(0)} Jt)`,
        score: best.score,
        source: 'composite_score',
      };
    }

    // Fallback terdokumentasi: tidak ada kandidat lolos ambang skor komposit —
    // pakai pick gain_rank supaya kandidat hard-filtered tetap bisa ditradingkan.
  }

  const top = rankedByGain[0];
  return {
    symbol: top.symbol,
    reason: `Top Momentum Gainer (+${top.gain24h.toFixed(1)}%, Volume: Rp ${(top.volIdr / 1e6).toFixed(0)} Jt)`,
    score: top.score ?? null,
    source: mode === 'composite_score' ? 'gain_rank_fallback' : 'gain_rank',
  };
}
