import { calculateReturnCorrelation } from '../../utils/indicators.js';
import type { GateResult } from './riskGuard.js';

/**
 * Portfolio Risk & Sector Correlation Intelligence Engine (100% Deterministic, 0 Token Cost).
 *
 * Protects the account from two silent institutional killers in crypto spot trading:
 * 1. Correlated Cluster Stacking: Holding 3 coins in the exact same narrative/sector or
 *    with >0.82 15m return correlation turns a "diversified 3-slot portfolio" into a single
 *    3x-leveraged bet when Bitcoin sneezes.
 * 2. Portfolio Heat Blindness: Knowing open slot count (e.g. 2/3) does not tell you how much
 *    IDR equity is actually at risk if every open position hits its current trailing stop.
 *    Positions ratcheted above entry have 0 downside heat ("free-roll").
 */

export type CryptoSector =
  | 'btc_macro'
  | 'smart_contract_l1'
  | 'defi'
  | 'meme'
  | 'ai_compute'
  | 'gaming_metaverse'
  | 'exchange_infra'
  | 'payments_rwa'
  | 'alt_other';

const SECTOR_MAP: Record<string, CryptoSector> = {
  // Macro reserve
  btc: 'btc_macro',
  wbtc: 'btc_macro',

  // Smart Contract L1 / L2
  eth: 'smart_contract_l1',
  sol: 'smart_contract_l1',
  ada: 'smart_contract_l1',
  avax: 'smart_contract_l1',
  dot: 'smart_contract_l1',
  near: 'smart_contract_l1',
  atom: 'smart_contract_l1',
  sui: 'smart_contract_l1',
  apt: 'smart_contract_l1',
  sei: 'smart_contract_l1',
  ton: 'smart_contract_l1',
  trx: 'smart_contract_l1',
  arb: 'smart_contract_l1',
  op: 'smart_contract_l1',
  pol: 'smart_contract_l1',
  matic: 'smart_contract_l1',
  ftm: 'smart_contract_l1',
  inj: 'smart_contract_l1',
  tia: 'smart_contract_l1',

  // DeFi & Oracles
  uni: 'defi',
  aave: 'defi',
  link: 'defi',
  mkr: 'defi',
  ldo: 'defi',
  pendle: 'defi',
  crv: 'defi',
  snx: 'defi',
  comp: 'defi',
  cake: 'defi',
  jup: 'defi',
  ray: 'defi',
  ena: 'defi',
  dydx: 'defi',

  // Memecoins
  doge: 'meme',
  pepe: 'meme',
  shib: 'meme',
  floki: 'meme',
  bonk: 'meme',
  wif: 'meme',
  bome: 'meme',
  neiro: 'meme',
  pnut: 'meme',
  turb: 'meme',
  meme: 'meme',
  mog: 'meme',
  brett: 'meme',
  popcat: 'meme',

  // AI, Compute & DePIN
  fet: 'ai_compute',
  render: 'ai_compute',
  rndr: 'ai_compute',
  tao: 'ai_compute',
  wld: 'ai_compute',
  arkm: 'ai_compute',
  akt: 'ai_compute',
  jasmy: 'ai_compute',
  grt: 'ai_compute',
  fil: 'ai_compute',
  ar: 'ai_compute',
  io: 'ai_compute',

  // Gaming & Metaverse
  imx: 'gaming_metaverse',
  gala: 'gaming_metaverse',
  sand: 'gaming_metaverse',
  mana: 'gaming_metaverse',
  axs: 'gaming_metaverse',
  ape: 'gaming_metaverse',
  beam: 'gaming_metaverse',
  ron: 'gaming_metaverse',
  pixel: 'gaming_metaverse',

  // Exchange & Infrastructure
  bnb: 'exchange_infra',
  okb: 'exchange_infra',
  bgb: 'exchange_infra',
  cro: 'exchange_infra',
  pyth: 'exchange_infra',
  zro: 'exchange_infra',

  // Payments & RWA
  xrp: 'payments_rwa',
  xlm: 'payments_rwa',
  ltc: 'payments_rwa',
  bch: 'payments_rwa',
  etc: 'payments_rwa',
  hbar: 'payments_rwa',
  algo: 'payments_rwa',
  ondo: 'payments_rwa',
  vet: 'payments_rwa',
};

export function normalizeCoinSymbol(symbol: string): string {
  return String(symbol || '')
    .toLowerCase()
    .replace('_idr', '')
    .replace('/idr', '')
    .replace(/idr$/, '')
    .replace(/[^a-z0-9]/g, '');
}

export function classifyCoinSector(symbol: string): CryptoSector {
  const clean = normalizeCoinSymbol(symbol);
  return SECTOR_MAP[clean] || 'alt_other';
}

export const SECTOR_LABELS: Record<CryptoSector, { en: string; id: string }> = {
  btc_macro: { en: 'BTC Macro Reserve', id: 'Cadangan Makro BTC' },
  smart_contract_l1: { en: 'Smart Contract L1/L2', id: 'Smart Contract L1/L2' },
  defi: { en: 'DeFi & Oracles', id: 'DeFi & Oracle' },
  meme: { en: 'Memecoins', id: 'Memecoin' },
  ai_compute: { en: 'AI & DePIN', id: 'AI & DePIN' },
  gaming_metaverse: { en: 'Gaming & Metaverse', id: 'Gaming & Metaverse' },
  exchange_infra: { en: 'Exchange & Infra', id: 'Bursa & Infrastruktur' },
  payments_rwa: { en: 'Payments & RWA', id: 'Pembayaran & RWA' },
  alt_other: { en: 'Emerging Altcoins', id: 'Altcoin Lainnya' },
};

export interface CorrelationGuardInput {
  candidateSymbol: string;
  candidateCloses?: number[];
  openPositions: Array<{
    symbol: string;
    closes?: number[];
  }>;
  maxSameSector?: number;        // default 2 (for meme = 1)
  maxReturnCorrelation?: number; // default 0.85
}

/**
 * Evaluates whether adding `candidateSymbol` violates sector concentration or
 * pairwise 15m return correlation limits against currently open positions.
 * Pure & fail-open when candle arrays are absent or shorter than 11 bars.
 */
export function checkPortfolioCorrelation(input: CorrelationGuardInput): GateResult {
  const candidateSym = normalizeCoinSymbol(input.candidateSymbol);
  const candidateSector = classifyCoinSector(candidateSym);
  const maxReturnCorr = input.maxReturnCorrelation ?? 0.85;
  // Memecoins are restricted to max 1 slot; major L1s/other sectors default to max 2
  const defaultSectorCap = candidateSector === 'meme' ? 1 : (input.maxSameSector ?? 2);

  if (!input.openPositions || input.openPositions.length === 0) {
    return {
      passed: true,
      reason: 'Portofolio kosong — bebas korelasi',
      values: {
        symbol: candidateSym,
        sector: candidateSector,
        sameSectorCount: 0,
        maxCorrelation: 0,
      },
    };
  }

  let sameSectorCount = 0;
  let highestCorr = -1;
  let highestCorrPeer = '';

  for (const pos of input.openPositions) {
    const peerSym = normalizeCoinSymbol(pos.symbol);
    if (!peerSym || peerSym === candidateSym) continue;

    const peerSector = classifyCoinSector(peerSym);
    // 'alt_other' is a catch-all bucket, so don't treat two unrelated uncategorized coins as the same sector
    if (candidateSector !== 'alt_other' && peerSector === candidateSector) {
      sameSectorCount++;
    }

    if (input.candidateCloses && pos.closes) {
      const corr = calculateReturnCorrelation(input.candidateCloses, pos.closes, 32, 12);
      if (corr !== null && corr > highestCorr) {
        highestCorr = corr;
        highestCorrPeer = peerSym;
      }
    }
  }

  if (sameSectorCount >= defaultSectorCap) {
    return {
      passed: false,
      reason: `Konsentrasi sektor ${candidateSector} penuh (${sameSectorCount}/${defaultSectorCap} posisi aktif)`,
      values: {
        symbol: candidateSym,
        sector: candidateSector,
        sameSectorCount,
        sectorCap: defaultSectorCap,
        maxCorrelation: highestCorr > -1 ? highestCorr : 0,
      },
    };
  }

  if (highestCorr >= maxReturnCorr) {
    return {
      passed: false,
      reason: `Korelasi return terlalu tinggi dengan ${highestCorrPeer.toUpperCase()} (r=${highestCorr.toFixed(2)} >= ${maxReturnCorr})`,
      values: {
        symbol: candidateSym,
        sector: candidateSector,
        correlatedWith: highestCorrPeer,
        correlation: highestCorr,
        threshold: maxReturnCorr,
      },
    };
  }

  return {
    passed: true,
    reason: 'Diversifikasi sektor & korelasi sehat',
    values: {
      symbol: candidateSym,
      sector: candidateSector,
      sameSectorCount,
      maxCorrelation: highestCorr > -1 ? highestCorr : 0,
    },
  };
}

export interface PositionHeatItem {
  symbol: string;
  sector: CryptoSector;
  marketValueIdr: number;
  costBasisIdr: number;
  stopLiquidationIdr: number;
  atRiskIdr: number;         // Capital below cost basis if stopped out (0 if stop >= breakeven+fees)
  lockedProfitIdr: number;   // Guaranteed net profit if stopped out right now (>= 0)
  isFreeRoll: boolean;       // True when trailing stop is ratcheted above breakeven (zero downside to capital)
  distanceToStopPct: number; // % drop from currentPrice to trailingStopPrice
}

export interface PortfolioHeatSnapshot {
  equityIdr: number;
  totalExposureIdr: number;
  exposurePercent: number;
  totalAtRiskIdr: number;      // Total portfolio heat in IDR (downside vs cost basis)
  portfolioHeatPercent: number; // totalAtRiskIdr / equityIdr * 100
  lockedProfitIdr: number;     // Total profit already locked above breakeven by trailing ratchets
  freeRollPositions: number;
  totalPositions: number;
  sectorExposure: Array<{
    sector: CryptoSector;
    count: number;
    valueIdr: number;
    sharePercent: number;
  }>;
  correlationMatrix: Array<{
    pairA: string;
    pairB: string;
    correlation: number;
  }>;
  maxPairwiseCorrelation: number | null;
  diversificationScore: number; // 0..100 (100 = well diversified & low heat)
  positions: PositionHeatItem[];
}

/**
 * Computes institutional Portfolio Heat, Free-Roll Ratchet Protection, Sector Allocation,
 * and Pairwise Return Correlation across all open positions.
 */
export function computePortfolioHeat(args: {
  equityIdr: number;
  feeRate: number;
  openPositions: Array<{
    symbol: string;
    entry_price: number;
    current_price: number;
    amount: number;
    initial_cost_idr: number;
    trailing_stop_price: number;
    closes?: number[];
  }>;
}): PortfolioHeatSnapshot {
  const equityIdr = Math.max(0, Number(args.equityIdr) || 0);
  const feeRate = Math.max(0, Number(args.feeRate) || 0);

  const items: PositionHeatItem[] = [];
  const sectorAgg = new Map<CryptoSector, { count: number; valueIdr: number }>();

  let totalExposureIdr = 0;
  let totalAtRiskIdr = 0;
  let totalLockedProfitIdr = 0;
  let freeRollPositions = 0;

  for (const pos of args.openPositions) {
    const cleanSym = normalizeCoinSymbol(pos.symbol);
    const sector = classifyCoinSector(cleanSym);
    const amount = Math.max(0, Number(pos.amount) || 0);
    const curPrice = Math.max(0, Number(pos.current_price) || Number(pos.entry_price) || 0);
    const stopPrice = Math.max(0, Number(pos.trailing_stop_price) || 0);
    const baseCost = pos.initial_cost_idr > 0 ? pos.initial_cost_idr : pos.entry_price * amount;
    const costWithEntryFee = baseCost * (1 + feeRate);

    const marketValueIdr = curPrice * amount;
    const stopLiquidationIdr = stopPrice * amount * (1 - feeRate);
    const stopNetPnl = stopLiquidationIdr - costWithEntryFee;

    const atRiskIdr = stopNetPnl < 0 ? Math.abs(stopNetPnl) : 0;
    const lockedProfitIdr = stopNetPnl > 0 ? stopNetPnl : 0;
    const isFreeRoll = stopNetPnl >= -1; // Within Rp 1 rounding of breakeven or better
    const distanceToStopPct =
      curPrice > 0 && stopPrice > 0 ? Math.max(0, ((curPrice - stopPrice) / curPrice) * 100) : 0;

    if (isFreeRoll) freeRollPositions++;
    totalExposureIdr += marketValueIdr;
    totalAtRiskIdr += atRiskIdr;
    totalLockedProfitIdr += lockedProfitIdr;

    const prevSec = sectorAgg.get(sector) || { count: 0, valueIdr: 0 };
    prevSec.count += 1;
    prevSec.valueIdr += marketValueIdr;
    sectorAgg.set(sector, prevSec);

    items.push({
      symbol: cleanSym.toUpperCase(),
      sector,
      marketValueIdr: Math.round(marketValueIdr),
      costBasisIdr: Math.round(costWithEntryFee),
      stopLiquidationIdr: Math.round(stopLiquidationIdr),
      atRiskIdr: Math.round(atRiskIdr),
      lockedProfitIdr: Math.round(lockedProfitIdr),
      isFreeRoll,
      distanceToStopPct: Number(distanceToStopPct.toFixed(2)),
    });
  }

  const sectorExposure = Array.from(sectorAgg.entries())
    .map(([sector, s]) => ({
      sector,
      count: s.count,
      valueIdr: Math.round(s.valueIdr),
      sharePercent: totalExposureIdr > 0 ? Number(((s.valueIdr / totalExposureIdr) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.valueIdr - a.valueIdr);

  // Pairwise correlation matrix among open positions
  const correlationMatrix: Array<{ pairA: string; pairB: string; correlation: number }> = [];
  let maxPairwiseCorrelation: number | null = null;

  for (let i = 0; i < args.openPositions.length; i++) {
    for (let j = i + 1; j < args.openPositions.length; j++) {
      const a = args.openPositions[i];
      const b = args.openPositions[j];
      if (!a.closes || !b.closes) continue;
      const corr = calculateReturnCorrelation(a.closes, b.closes, 32, 10);
      if (corr !== null) {
        const pairA = normalizeCoinSymbol(a.symbol).toUpperCase();
        const pairB = normalizeCoinSymbol(b.symbol).toUpperCase();
        correlationMatrix.push({ pairA, pairB, correlation: corr });
        if (maxPairwiseCorrelation === null || corr > maxPairwiseCorrelation) {
          maxPairwiseCorrelation = corr;
        }
      }
    }
  }

  const exposurePercent = equityIdr > 0 ? Number(((totalExposureIdr / equityIdr) * 100).toFixed(2)) : 0;
  const portfolioHeatPercent = equityIdr > 0 ? Number(((totalAtRiskIdr / equityIdr) * 100).toFixed(2)) : 0;

  // Diversification & Risk Health Score (0..100)
  let divScore = 100;
  // Penalize high portfolio heat (> 3% starts gentle penalty, > 8% steep)
  if (portfolioHeatPercent > 2.0) {
    divScore -= Math.min(40, (portfolioHeatPercent - 2.0) * 5);
  }
  // Penalize single-sector concentration when holding >= 2 positions
  if (args.openPositions.length >= 2) {
    const topSectorShare = sectorExposure[0]?.sharePercent ?? 0;
    if (topSectorShare > 65) {
      divScore -= Math.min(25, (topSectorShare - 65) * 0.7);
    }
  }
  // Penalize high pairwise correlation
  if (maxPairwiseCorrelation !== null && maxPairwiseCorrelation > 0.65) {
    divScore -= Math.min(25, (maxPairwiseCorrelation - 0.65) * 70);
  }

  return {
    equityIdr: Math.round(equityIdr),
    totalExposureIdr: Math.round(totalExposureIdr),
    exposurePercent,
    totalAtRiskIdr: Math.round(totalAtRiskIdr),
    portfolioHeatPercent,
    lockedProfitIdr: Math.round(totalLockedProfitIdr),
    freeRollPositions,
    totalPositions: args.openPositions.length,
    sectorExposure,
    correlationMatrix,
    maxPairwiseCorrelation,
    diversificationScore: Math.max(0, Math.min(100, Math.round(divScore))),
    positions: items,
  };
}
