import { getSetting } from '../../db/index.js';

export const DEFAULT_TAKER_FEE_PERCENT = 0.3322;

/**
 * All engine orders are MARKET orders, so they pay the taker fee. Indodax
 * publishes an all-in rate (trading fee + VAT + CFX); users with a different
 * tier can override it via the trading_fee_percent setting.
 */
export function getTakerFeePercent(): number {
  const raw = parseFloat(getSetting('trading_fee_percent', String(DEFAULT_TAKER_FEE_PERCENT)));
  if (!Number.isFinite(raw) || raw < 0 || raw > 5) return DEFAULT_TAKER_FEE_PERCENT;
  return raw;
}

export function getTakerFeeRate(): number {
  return getTakerFeePercent() / 100;
}
