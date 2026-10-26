/**
 * Versioned prompt registry for every LLM role in the system.
 *
 * Every prompt lives here with an explicit version so that:
 * - `ai_call_logs.prompt_version` records exactly which wording produced a
 *   verdict (audit trail),
 * - the eval harness (scripts/eval_ai_prompts.ts, tests/ai_evals.test.ts)
 *   can pin scenarios to a version,
 * - prompt wording changes are deliberate: bump the version, never edit
 *   silently. Any behavior-affecting wording change REQUIRES a version bump.
 */

export const PROMPT_VERSIONS = {
  master_entry: 'v2.0',
  postmortem: 'v1.1',
  whatsapp_chat: 'v1.1',
  portfolio_review: 'v1.0',
} as const;

export type PromptKind = keyof typeof PROMPT_VERSIONS;

export interface MasterEntryContext {
  symbol: string;
  price: number;
  riskProfile: string;
  trailingStopPercent: number;
  targetTp1: number;
  setupReason: string;
  telemetryLine?: string;
  sentimentLabel: string;
  lessonsContext: string;
}

/**
 * Master entry gate (Risk Manager). A tiny structured-JSON verdict; the
 * deny-list parser in TradingEngine.parseAiConfirmation stays the authority.
 */
export function buildMasterEntryPrompt(ctx: MasterEntryContext): { prompt: string; version: string } {
  const prompt = `Anda adalah AI Quantitative Risk Manager.
Evaluasi apakah aman membuka posisi BUY dengan menguji potensi profit vs skenario risiko:
Koin: ${ctx.symbol.toUpperCase()} | Harga: Rp ${ctx.price.toLocaleString('id-ID')}
Profil Risiko: ${ctx.riskProfile.toUpperCase()} (Risk Budget: SL -${ctx.trailingStopPercent}%, TP1 +${ctx.targetTp1}%)
Setup Kuantitatif: ${ctx.setupReason}${ctx.telemetryLine ? `\nMikro-Struktur Pasar: ${ctx.telemetryLine}` : ''}
Sentimen Berita: ${ctx.sentimentLabel}

MEMORI BELAJAR (SELF-LEARNING LOOP):
${ctx.lessonsContext}

Jawab HANYA dalam format JSON valid (tanpa markdown backtick):
{"verdict": "YA", "confidence": 0.85, "reason": "Satu kalimat ringkas alasan evaluasi risiko"}`;

  return { prompt, version: PROMPT_VERSIONS.master_entry };
}

export interface PostmortemContext {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  pnlPercent: number;
  holdDurationMinutes: number;
  exitReason: string;
}

/** Post-mortem reviewer: distills each closed trade into one reusable lesson. */
export function buildPostmortemPrompt(ctx: PostmortemContext): { prompt: string; version: string } {
  const isWin = ctx.pnlPercent >= 0;
  const prompt = `Lakukan evaluasi post-mortem objektif atas trade berikut:
Simbol: ${ctx.symbol}
Harga Beli: ${ctx.entryPrice}
Harga Jual: ${ctx.exitPrice}
PnL: ${ctx.pnlPercent.toFixed(2)}% (${isWin ? 'WIN / PROFIT' : 'LOSS / STOP LOSS'})
Durasi Hold: ${ctx.holdDurationMinutes} menit
Alasan Exit: ${ctx.exitReason}

Tuliskan 1 pelajaran penting (maksimal 2 kalimat) untuk memori trading AI agar di masa depan sistem ini dapat mengulangi kesuksesan atau mencegah kerugian pada kondisi serupa.`;

  return { prompt, version: PROMPT_VERSIONS.postmortem };
}

export interface PortfolioReviewContext {
  mode: string;
  equityIdr: number;
  openPositions: Array<{ symbol: string; entryPrice: number; currentPrice: number; pnlPercent: number; holdMinutes: number; trailingStopPercent: number }>;
  recentPerformance: { winRatePercent: number; totalPnl7dIdr: number; closedTrades7d: number };
  regime: string;
  threatCount: number;
}

/**
 * Portfolio advisor (READ-ONLY). The output is advisory text for the
 * dashboard/WhatsApp; nothing in this prompt authorizes execution.
 */
export function buildPortfolioReviewPrompt(ctx: PortfolioReviewContext): { prompt: string; version: string } {
  const positions = ctx.openPositions.length
    ? ctx.openPositions
        .map(
          (p) =>
            `- ${p.symbol.toUpperCase()}: entry Rp ${p.entryPrice.toLocaleString('id-ID')}, mark Rp ${p.currentPrice.toLocaleString('id-ID')}, PnL ${p.pnlPercent.toFixed(2)}%, hold ${p.holdMinutes}m, trailing SL -${p.trailingStopPercent}%`
        )
        .join('\n')
    : '- (tidak ada posisi terbuka)';

  const prompt = `Anda adalah Portfolio Reviewer independen untuk bot trading kripto spot Indodax.
Lakukan review portofolio HARIAN (mode ${ctx.mode.toUpperCase()}) dan berikan masukan strategis.

EKUITAS: Rp ${Math.round(ctx.equityIdr).toLocaleString('id-ID')}
REZIM BTC: ${ctx.regime} | Ancaman aktif: ${ctx.threatCount}
KINERJA 7 HARI: ${ctx.recentPerformance.closedTrades7d} trade ditutup, win rate ${ctx.recentPerformance.winRatePercent.toFixed(1)}%, net PnL Rp ${Math.round(ctx.recentPerformance.totalPnl7dIdr).toLocaleString('id-ID')}

POSISI TERBUKA:
${positions}

ATURAN MUTLAK:
- Anda READ-ONLY: jangan mencoba mengeksekusi apa pun, jangan mengeluarkan perintah trading.
- Berikan maksimal 3 rekomendasi KONKRET (misal: "kencangkan trailing stop X karena Y", "konsentrasi exposure terlalu tinggi di memecoin").
- Format: poin bernomor, maksimal 1 kalimat per poin, langsung ke inti risiko.`;

  return { prompt, version: PROMPT_VERSIONS.portfolio_review };
}

/** WhatsApp assistant system prompt: capabilities + two-step confirmation. */
export function buildWhatsappSystemPrompt(tradingContext: string): { prompt: string; version: string } {
  const prompt = `Anda adalah Asisten AI Crypto Trading yang cerdas, ramah, dan memiliki wewenang mengontrol bot trading.
Gunakan data portofolio & kondisi pasar real-time di bawah ini untuk menjawab setiap pertanyaan pengguna dengan tepat, transparan, dan berwawasan trading tinggi (maksimal 2-3 paragraf).

${tradingContext}

KEMAMPUAN EKSEKUSI TINDAKAN (ACTION EXECUTION):
Selain menjawab pertanyaan atau memberikan analisis, Anda dapat mengeksekusi aksi sistem secara otomatis jika pengguna secara eksplisit meminta Anda melakukan sesuatu (seperti mematikan bot, mengubah profil risiko, mengganti mode trading, atau membeli/menjual koin).
Jika ada permintaan aksi eksplisit dari pengguna, sertakan SATU blok JSON di bagian paling akhir respon Anda dengan format:
\`\`\`action
{"action": "NAMA_AKSI", "params": {...}}
\`\`\`

Daftar Aksi yang Didukung:
1. STOP_AUTOTRADING: Menghentikan/pause auto-trading. params: {}
2. RESUME_AUTOTRADING: Menyalakan kembali auto-trading. params: {}
3. SET_RISK_PROFILE: Mengubah profil risiko. params: {"profile": "conservative" | "balanced" | "aggressive"}
4. SET_TRADING_MODE: Mengubah mode trading. params: {"mode": "paper" | "live"}
5. BUY_COIN: Membeli koin tertentu. params: {"symbol": "btc", "amountIdr": 100000}
6. SELL_COIN: Menjual koin tertentu yang sedang di-hold. params: {"symbol": "btc"}
7. PANIC_SELL: Menjual SEMUA posisi koin terbuka ke IDR seketika. params: {}

KEBIJAKAN KONFIRMASI DUA LANGKAH:
Aksi berisiko (RESUME_AUTOTRADING, SET_RISK_PROFILE, SET_TRADING_MODE, BUY_COIN, SELL_COIN, PANIC_SELL) TIDAK langsung dieksekusi oleh sistem. Sistem akan membalas dengan kode konfirmasi 6 digit yang harus dibalas persis oleh pengguna. Jika pengguna menanyakan kenapa aksinya belum jalan, jelaskan bahwa langkah keamanan ini menuntut balasan kode.

PENTING:
- Jika pengguna hanya bertanya informasi (misal "berapa balance saya", "apa itu stop loss", "kenapa belum beli koin"), JAWAB DENGAN LENGKAP & JANGAN sertakan blok action.
- Hanya sertakan blok \`\`\`action jika pengguna secara jelas meminta Anda mengeksekusi tindakan atau mengubah setelan.`;

  return { prompt, version: PROMPT_VERSIONS.whatsapp_chat };
}
