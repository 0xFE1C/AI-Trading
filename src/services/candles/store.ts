import { db } from '../../db/index.js';
import type { BacktestBar } from '../backtest/index.js';

/**
 * Local candle persistence (research cache).
 *
 * Candles observed by the live engine are written through to SQLite so
 * backtests, walk-forward optimization, and offline AI-gate replays can run
 * without re-scraping the undocumented TradingView history endpoint. A 90-day
 * ring buffer keeps the file bounded.
 */

const RETENTION_DAYS = 90;

export function saveCandles(pair: string, timeframe: string, bars: BacktestBar[]): number {
  if (!Array.isArray(bars) || bars.length === 0) return 0;
  try {
    const cleanPair = pair.toLowerCase().replace('/', '').replace('_', '');
    const insert = db.prepare(`
      INSERT OR REPLACE INTO candles (pair, timeframe, ts, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const cutoff = Date.now() - RETENTION_DAYS * 86400 * 1000;

    const tx = db.transaction(() => {
      for (const bar of bars) {
        if (!(bar.timestamp > 0 && bar.close > 0)) continue;
        insert.run(cleanPair, timeframe, bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume);
      }
      db.prepare('DELETE FROM candles WHERE ts < ?').run(cutoff);
    });
    tx();
    return bars.length;
  } catch (err: any) {
    // Persistence is best-effort: research caching must never break trading.
    console.warn('[CandleStore] Gagal menyimpan candle:', err?.message);
    return 0;
  }
}

export function loadCandles(pair: string, timeframe: string, limit = 5000): BacktestBar[] {
  try {
    const cleanPair = pair.toLowerCase().replace('/', '').replace('_', '');
    return db.prepare(`
      SELECT ts, open, high, low, close, volume FROM candles
      WHERE pair = ? AND timeframe = ?
      ORDER BY ts DESC LIMIT ?
    `).all(cleanPair, timeframe, limit)
      .map((row: any) => ({
        timestamp: row.ts,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume || 0,
      }))
      .reverse();
  } catch {
    return [];
  }
}

export function candleStoreStats(): Record<string, { pairs: number; candles: number; oldestTs: number }> {
  const rows = db.prepare(`
    SELECT timeframe, COUNT(DISTINCT pair) as pairs, COUNT(*) as candles, MIN(ts) as oldestTs
    FROM candles GROUP BY timeframe
  `).all() as Array<{ timeframe: string; pairs: number; candles: number; oldestTs: number }>;
  const out: Record<string, { pairs: number; candles: number; oldestTs: number }> = {};
  for (const r of rows) {
    out[r.timeframe] = { pairs: r.pairs, candles: r.candles, oldestTs: r.oldestTs };
  }
  return out;
}
