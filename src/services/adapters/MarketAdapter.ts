import type { MarketSummary } from '../signals/types.js';

export type AssetClass = 'crypto' | 'stocks' | 'forex' | 'futures';

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface MarketCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketOrderBook {
  buy: Array<[number, number]>; // [price, volume]
  sell: Array<[number, number]>;
}

export interface OrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  amount: number;
  mode?: 'paper' | 'live';
}

export interface OrderResult {
  success: boolean;
  orderId?: string | number;
  executedPrice?: number;
  executedAmount?: number;
  fee?: number;
  error?: string;
}

export interface MarketAdapter {
  readonly id: string;
  readonly name: string;
  readonly assetClass: AssetClass;

  getSummaries(): Promise<MarketSummary[]>;
  getDepth(symbol: string): Promise<MarketOrderBook>;
  getCandles(symbol: string, tf: Timeframe): Promise<MarketCandle[]>;
  getMinTradeIdr(symbol: string): number;
  createOrder(params: OrderParams): Promise<OrderResult>;
}
