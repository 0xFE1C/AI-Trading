import type { HeadlineSentiment } from './types.js';

/** Kamus bullish: kata -> bobot +0.1 .. +1.0 */
const BULLISH_LEXICON: Record<string, number> = {
  // English
  surge: 0.8,
  soar: 0.9,
  soaring: 0.9,
  rally: 0.8,
  breakout: 0.7,
  bull: 0.6,
  bullish: 0.7,
  pump: 0.5,
  gains: 0.4,
  rise: 0.4,
  rising: 0.4,
  rebound: 0.5,
  recovery: 0.4,
  'all-time high': 0.9,
  ath: 0.9,
  adoption: 0.5,
  partnership: 0.4,
  upgrade: 0.4,
  approval: 0.6,
  approved: 0.6,
  institutional: 0.4,
  inflows: 0.3,
  accumulation: 0.4,
  'buy the dip': 0.4,
  milestone: 0.3,
  integration: 0.3,

  // Bahasa Indonesia
  melonjak: 0.8,
  melambung: 0.9,
  menguat: 0.5,
  naik: 0.4,
  pemulihan: 0.4,
  adopsi: 0.5,
  kemitraan: 0.4,
  persetujuan: 0.6,
  disetujui: 0.6,
  akumulasi: 0.4,
  tonggak: 0.3,
  integrasi: 0.3,
};

/** Kamus bearish: kata -> bobot -0.1 .. -1.0 */
const BEARISH_LEXICON: Record<string, number> = {
  // English
  crash: -0.9,
  crashes: -0.9,
  plunge: -0.8,
  plunges: -0.8,
  dump: -0.6,
  selloff: -0.7,
  'sell-off': -0.7,
  bear: -0.6,
  bearish: -0.7,
  decline: -0.4,
  declining: -0.4,
  drop: -0.4,
  drops: -0.4,
  fall: -0.4,
  falls: -0.4,
  correction: -0.4,
  liquidation: -0.6,
  liquidations: -0.6,
  fear: -0.5,
  panic: -0.7,
  fud: -0.5,
  outflow: -0.3,
  outflows: -0.3,
  resistance: -0.2,

  // Bahasa Indonesia
  turun: -0.4,
  jatuh: -0.5,
  melemah: -0.5,
  anjlok: -0.8,
  jual: -0.3,
  kepanikan: -0.7,
  koreksi: -0.4,
  likuidasi: -0.6,
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COMPILED_BULLISH: Array<[RegExp, number]> = Object.entries(BULLISH_LEXICON).map(
  ([word, weight]) => [new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i'), weight]
);

const COMPILED_BEARISH: Array<[RegExp, number]> = Object.entries(BEARISH_LEXICON).map(
  ([word, weight]) => [new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i'), weight]
);

export const COIN_PATTERNS: Record<string, RegExp> = {
  BTC: /\b(bitcoin|btc)\b/i,
  ETH: /\b(ethereum|eth|ether)\b/i,
  SOL: /\b(solana|sol)\b/i,
  BNB: /\b(bnb|binance coin)\b/i,
  XRP: /\b(ripple|xrp)\b/i,
  DOGE: /\b(dogecoin|doge)\b/i,
  PEPE: /\b(pepe)\b/i,
  SHIB: /\b(shiba|shib)\b/i,
  USDT: /\b(tether|usdt)\b/i,
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function scoreHeadline(title: string, description = ''): HeadlineSentiment {
  const text = `${title} ${description}`;
  const matchedBullish: string[] = [];
  const matchedBearish: string[] = [];
  let raw = 0;

  for (const [re, weight] of COMPILED_BULLISH) {
    if (re.test(text)) {
      matchedBullish.push(re.source.replace(/\\b|\\/g, ''));
      raw += weight;
    }
  }

  for (const [re, weight] of COMPILED_BEARISH) {
    if (re.test(text)) {
      matchedBearish.push(re.source.replace(/\\b|\\/g, ''));
      raw += weight; // already negative
    }
  }

  const mentionedCoins = Object.entries(COIN_PATTERNS)
    .filter(([, re]) => re.test(text))
    .map(([symbol]) => symbol);

  // tanh maps raw sum smoothly to -1.0 .. +1.0
  const score = Math.tanh(raw / 2);

  return {
    score: round3(score),
    matchedBullish,
    matchedBearish,
    mentionedCoins,
  };
}

/** Agregasi sentimen per koin dari banyak headline (dengan decay usia berita max 48 jam) */
export function aggregateCoinSentiment(
  items: Array<{ sentiment: HeadlineSentiment; ageHours: number }>
): Record<string, number> {
  const acc: Record<string, { total: number; weight: number }> = {};

  for (const { sentiment, ageHours } of items) {
    const decay = Math.max(0, 1 - ageHours / 48);
    if (decay === 0) continue;

    for (const coin of sentiment.mentionedCoins) {
      if (!acc[coin]) acc[coin] = { total: 0, weight: 0 };
      acc[coin].total += sentiment.score * decay;
      acc[coin].weight += decay;
    }
  }

  const out: Record<string, number> = {};
  for (const [coin, { total, weight }] of Object.entries(acc)) {
    out[coin] = round3(weight > 0 ? total / weight : 0);
  }

  return out;
}
