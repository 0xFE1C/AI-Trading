import type { MarketAdapter, AssetClass, Timeframe, MarketCandle, MarketOrderBook, OrderParams, OrderResult } from './MarketAdapter.js';
import type { MarketSummary } from '../signals/types.js';
import { indodax } from '../indodax/index.js';
import { indodaxMarketStream } from '../indodax/marketStream.js';

export class IndodaxAdapter implements MarketAdapter {
  public readonly id = 'indodax';
  public readonly name = 'Indodax';
  public readonly assetClass: AssetClass = 'crypto';

  public async getSummaries(): Promise<MarketSummary[]> {
    const raw = await indodax.getSummaries();
    if (!raw || !raw.tickers) return [];

    const summaries: MarketSummary[] = [];
    const now = Date.now();

    for (const [pairKey, ticker] of Object.entries(raw.tickers)) {
      if (!pairKey.endsWith('_idr')) continue;
      const symbol = pairKey.replace('_idr', '');
      summaries.push({
        symbol,
        pair: pairKey,
        last: parseFloat(ticker.last) || 0,
        high24h: parseFloat(ticker.high) || 0,
        low24h: parseFloat(ticker.low) || 0,
        volIdr24h: parseFloat(ticker.vol_idr) || 0,
        buyPrice: parseFloat(ticker.buy) || 0,
        sellPrice: parseFloat(ticker.sell) || 0,
        ts: ticker.server_time ? ticker.server_time * 1000 : now,
      });
    }

    return summaries;
  }

  public async getDepth(symbol: string): Promise<MarketOrderBook> {
    const depth = await indodax.getDepth(symbol);
    return {
      buy: (depth.buy || []).map(([p, v]) => [parseFloat(p), parseFloat(v)]),
      sell: (depth.sell || []).map(([p, v]) => [parseFloat(p), parseFloat(v)]),
    };
  }

  public async getCandles(symbol: string, tf: Timeframe): Promise<MarketCandle[]> {
    const mappedTf: '15m' | '1h' | '4h' | '1d' =
      tf === '4h' ? '4h' : tf === '1d' ? '1d' : tf === '1h' ? '1h' : '15m';

    const candles = await indodaxMarketStream.getRealCandles(symbol, mappedTf);
    return (candles || []).map((c) => ({
      openTime: (c.timestamp || 0) * 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  public getMinTradeIdr(symbol: string): number {
    return indodax.getMinTradeIdr(symbol);
  }

  public async createOrder(params: OrderParams): Promise<OrderResult> {
    if (params.mode === 'paper') {
      return {
        success: true,
        orderId: `paper_${Date.now()}`,
        executedPrice: params.price,
        executedAmount: params.amount,
        fee: 0,
      };
    }

    try {
      const cleanPair = `${params.symbol.toLowerCase()}_idr`;
      if (params.side === 'buy') {
        const totalIdr = (params.price || 0) * params.amount;
        const res = await indodax.createOrder({
          symbol: cleanPair,
          side: 'BUY',
          type: 'MARKET',
          quoteOrderQty: Math.floor(totalIdr),
        });
        return {
          success: true,
          orderId: res.orderId,
          executedPrice: res.price ? parseFloat(res.price) : params.price,
          executedAmount: res.executedQty ? parseFloat(res.executedQty) : params.amount,
        };
      } else {
        const res = await indodax.createOrder({
          symbol: cleanPair,
          side: 'SELL',
          type: 'MARKET',
          quantity: params.amount,
        });
        return {
          success: true,
          orderId: res.orderId,
          executedPrice: res.price ? parseFloat(res.price) : params.price,
          executedAmount: res.executedQty ? parseFloat(res.executedQty) : params.amount,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Gagal eksekusi order Indodax',
      };
    }
  }
}

export const indodaxAdapter = new IndodaxAdapter();
