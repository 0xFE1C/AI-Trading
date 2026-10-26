import { isSymbolThreatened } from '../signals/threat.js';
import type { ThreatSignal } from '../signals/types.js';

export interface RiskState {
  dailyPnlIdr: number;
  dayStartEquityIdr: number;
  openPositions: number;
  paperBalanceIdr?: number;
  regimeAllowEntries: boolean;
  btcChange1hPct: number;
  btcChange4hPct?: number;
}

export interface GateResult {
  passed: boolean;
  reason: string;
  values: Record<string, number | string | boolean>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function checkCircuitBreaker(s: RiskState, dailyLossLimitPct: number): GateResult {
  const lossPct = s.dayStartEquityIdr > 0 ? (-s.dailyPnlIdr / s.dayStartEquityIdr) * 100 : 0;
  const passed = s.dailyPnlIdr >= 0 || lossPct < dailyLossLimitPct;
  return {
    passed,
    reason: passed
      ? 'Daily loss dalam batas aman'
      : `Daily loss ${lossPct.toFixed(2)}% >= limit ${dailyLossLimitPct}%`,
    values: { lossPct: round2(lossPct), limitPct: dailyLossLimitPct },
  };
}

export function checkExposure(s: RiskState, maxActiveTrades: number): GateResult {
  const passed = s.openPositions < maxActiveTrades;
  return {
    passed,
    reason: passed ? 'Slot posisi tersedia' : `Slot penuh (${s.openPositions}/${maxActiveTrades})`,
    values: { open: s.openPositions, max: maxActiveTrades },
  };
}

export function checkBtcRegime(s: RiskState, crashThreshold1hPct = -3.0): GateResult {
  const passed = s.regimeAllowEntries && s.btcChange1hPct > crashThreshold1hPct;
  return {
    passed,
    reason: passed
      ? 'BTC regime stabil'
      : `BTC ${s.btcChange1hPct.toFixed(2)}% (1j) — flash dump terdeteksi`,
    values: { btcChange1hPct: round2(s.btcChange1hPct), threshold: crashThreshold1hPct },
  };
}

export function checkThreatScope(
  symbol: string,
  activeThreats: ThreatSignal[],
  now = Date.now()
): GateResult {
  const threatened = isSymbolThreatened(symbol, activeThreats, now);
  return {
    passed: !threatened,
    reason: threatened
      ? `Threat aktif untuk ${symbol.toUpperCase()} (<30 menit)`
      : 'Tidak ada threat aktif untuk koin ini',
    values: { symbol, threatCount: activeThreats.length },
  };
}

export function checkSlippageBudget(slippagePct: number, tolerancePct: number): GateResult {
  const passed = slippagePct <= tolerancePct;
  return {
    passed,
    reason: passed
      ? 'Slippage dalam toleransi'
      : `Slippage ${slippagePct.toFixed(2)}% > toleransi ${tolerancePct}%`,
    values: { slippagePct: round2(slippagePct), tolerancePct },
  };
}

export function checkSpreadTrap(spreadPct: number, maxSpreadTolerance = 0.8): GateResult {
  const passed = spreadPct <= maxSpreadTolerance;
  return {
    passed,
    reason: passed
      ? 'Spread wajar'
      : `Spread ${spreadPct.toFixed(2)}% > toleransi ${maxSpreadTolerance}%`,
    values: { spreadPct: round2(spreadPct), tolerance: maxSpreadTolerance },
  };
}

export function checkRsiGuard(rsi15m: number | null, maxRsi = 70): GateResult {
  if (rsi15m === null) {
    return {
      passed: true,
      reason: 'RSI tidak tersedia, gerbang lolos dengan peringatan',
      values: { rsi: -1 },
    };
  }
  const passed = rsi15m <= maxRsi;
  return {
    passed,
    reason: passed
      ? `RSI ${rsi15m.toFixed(1)} dalam batas aman`
      : `RSI ${rsi15m.toFixed(1)} > ${maxRsi} (Overbought)`,
    values: { rsi: round2(rsi15m), maxRsi },
  };
}

/**
 * Peak-to-trough equity kill switch plus an absolute equity floor.
 * Unlike the daily circuit breaker (24h cooldown, entries only), a drawdown
 * breach represents a slow multi-day bleed and halts until a manual reset.
 */
export function checkMaxDrawdown(
  currentEquityIdr: number,
  peakEquityIdr: number,
  maxDrawdownPct: number,
  equityFloorIdr: number
): GateResult {
  const drawdownPct =
    peakEquityIdr > 0 && currentEquityIdr < peakEquityIdr
      ? ((peakEquityIdr - currentEquityIdr) / peakEquityIdr) * 100
      : 0;

  const belowFloor = equityFloorIdr > 0 && currentEquityIdr < equityFloorIdr;
  const drawdownBreached = maxDrawdownPct > 0 && drawdownPct >= maxDrawdownPct;
  const passed = !belowFloor && !drawdownBreached;

  let reason = 'Drawdown dan equity floor dalam batas aman';
  if (belowFloor) {
    reason = `Equity Rp ${Math.round(currentEquityIdr).toLocaleString('id-ID')} di bawah floor Rp ${Math.round(equityFloorIdr).toLocaleString('id-ID')}`;
  } else if (drawdownBreached) {
    reason = `Drawdown ${drawdownPct.toFixed(2)}% >= batas ${maxDrawdownPct}% dari puncak Rp ${Math.round(peakEquityIdr).toLocaleString('id-ID')}`;
  }

  return {
    passed,
    reason,
    values: {
      equityIdr: Math.round(currentEquityIdr),
      peakEquityIdr: Math.round(peakEquityIdr),
      drawdownPct: round2(drawdownPct),
      maxDrawdownPct,
      equityFloorIdr: Math.round(equityFloorIdr),
      belowFloor,
    },
  };
}

/**
 * Caps a per-trade allocation to a percentage of current equity.
 * The legacy max_allocation_per_trade_idr is an absolute number that does not
 * scale with account growth; this cap closes that hole when configured.
 */
export function capAllocationByEquityPercent(
  allocationIdr: number,
  equityIdr: number,
  maxAllocationPercent: number
): { allocationIdr: number; capped: boolean; capIdr: number } {
  if (maxAllocationPercent <= 0 || equityIdr <= 0) {
    return { allocationIdr, capped: false, capIdr: 0 };
  }
  const capIdr = Math.round((equityIdr * maxAllocationPercent) / 100);
  if (allocationIdr <= capIdr) {
    return { allocationIdr, capped: false, capIdr };
  }
  return { allocationIdr: capIdr, capped: true, capIdr };
}

export interface CapitalPlan {
  capitalIdr: number;
  profile: 'conservative' | 'balanced' | 'aggressive';
  maxAllocationPerTradeIdr: number;
  maxActiveTrades: number;
  trailingStopPercent: number;
  dailyLossLimitPercent: number;
  slippageTolerancePercent: number;
  takeProfitStep1Percent: number;
  takeProfitTarget2Percent: number;
  totalCommitmentIdr: number;
  cashBufferIdr: number;
  cashBufferPercent: number;
  minVolumeIdr: number;
  allowNewListings: boolean;
  allowedCoinsOnly: string;
  notes: string[];
}

/**
 * Pure Mathematical Capital Allocation & Risk Sizing Engine
 * Sizes positions proportionally while strictly enforcing Indodax exchange constraints.
 */
export function calculateCapitalAllocation(
  capitalIdrInput: number,
  profile: 'conservative' | 'balanced' | 'aggressive' = 'balanced'
): CapitalPlan {
  const INDODAX_MIN_TRADE_IDR = 10000;
  const capitalIdr = Math.max(INDODAX_MIN_TRADE_IDR, Math.round(Number(capitalIdrInput) || 100000));
  const notes: string[] = [];

  let baseAllocationPct = 0.3;
  let targetMaxTrades = 3;
  let trailingStop = 2.5;
  let dailyLoss = 5.0;
  let slippage = 0.8;
  let tp1 = 5.0;
  let tp2 = 10.0;
  let minVolume = 200000000;
  let allowNew = true;
  let allowedCoins = '';

  if (profile === 'conservative') {
    baseAllocationPct = 0.2;
    targetMaxTrades = capitalIdr >= 5000000 ? 3 : 2;
    trailingStop = 1.8;
    dailyLoss = 3.0;
    slippage = 0.5;
    tp1 = 3.5;
    tp2 = 7.0;
    minVolume = 1000000000;
    allowNew = false;
    allowedCoins = 'btc,eth,sol,bnb,xrp';
  } else if (profile === 'aggressive') {
    baseAllocationPct = capitalIdr >= 1000000 ? 0.3 : 0.45;
    targetMaxTrades = capitalIdr >= 500000 ? 3 : 2;
    trailingStop = 3.5;
    dailyLoss = 8.0;
    slippage = 1.2;
    tp1 = 7.5;
    tp2 = 15.0;
    minVolume = 50000000;
    allowNew = true;
    allowedCoins = '';
  }

  // Calculate proportional per-trade allocation
  let allocation = Math.round(capitalIdr * baseAllocationPct);
  if (allocation < INDODAX_MIN_TRADE_IDR) {
    allocation = INDODAX_MIN_TRADE_IDR;
    notes.push(`Alokasi per koin disesuaikan ke minimum order Indodax (Rp ${INDODAX_MIN_TRADE_IDR.toLocaleString('id-ID')}).`);
  }

  // Calculate safe number of active positions so total exposure <= capital
  const maxAllowedByCapital = Math.max(1, Math.floor(capitalIdr / allocation));
  const maxActiveTrades = Math.min(targetMaxTrades, maxAllowedByCapital);

  // If allocation * maxActiveTrades > capital, adjust allocation downward to fit
  if (allocation * maxActiveTrades > capitalIdr) {
    allocation = Math.max(INDODAX_MIN_TRADE_IDR, Math.floor(capitalIdr / maxActiveTrades));
  }

  const totalCommitmentIdr = allocation * maxActiveTrades;
  const cashBufferIdr = Math.max(0, capitalIdr - totalCommitmentIdr);
  const cashBufferPercent = Math.round((cashBufferIdr / capitalIdr) * 100);

  if (capitalIdr < 50000) {
    notes.push('Saran: Modal di bawah Rp 50.000 memiliki ruang diversifikasi terbatas.');
  }

  return {
    capitalIdr,
    profile,
    maxAllocationPerTradeIdr: allocation,
    maxActiveTrades,
    trailingStopPercent: trailingStop,
    dailyLossLimitPercent: dailyLoss,
    slippageTolerancePercent: slippage,
    takeProfitStep1Percent: tp1,
    takeProfitTarget2Percent: tp2,
    totalCommitmentIdr,
    cashBufferIdr,
    cashBufferPercent,
    minVolumeIdr: minVolume,
    allowNewListings: allowNew,
    allowedCoinsOnly: allowedCoins,
    notes,
  };
}
