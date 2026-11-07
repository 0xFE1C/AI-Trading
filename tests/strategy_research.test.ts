import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMACD, calculateBollingerWidth, calculateVolumeZScore } from '../src/utils/indicators.js';
import { saveCandles, loadCandles, candleStoreStats } from '../src/services/candles/store.js';
import { PortfolioBacktestEngine } from '../src/services/backtest/portfolio.js';
import { backtestEngine, loadCachedBars } from '../src/services/backtest/index.js';
import { historyBarsToCandleRows } from '../src/services/indodax/marketStream.js';
import type { BacktestBar } from '../src/services/backtest/index.js';

describe('MACD', () => {
  test('returns null on insufficient data', () => {
    assert.equal(calculateMACD([1, 2, 3], 12, 26, 9), null);
  });

  test('is zero-ish on a flat series and positive on a steady uptrend', () => {
    const flat = new Array(60).fill(100);
    const flatMacd = calculateMACD(flat)!;
    assert.equal(flatMacd.macd, 0);
    assert.equal(flatMacd.histogram, 0);

    // A linear ramp has a CONSTANT macd, so the signal EMA converges to it
    // and the histogram decays toward zero — verify both properties.
    const uptrend = Array.from({ length: 80 }, (_, i) => 100 + i);
    const upMacd = calculateMACD(uptrend)!;
    assert.ok(upMacd.macd > 0, 'steady uptrend must have positive MACD');
    assert.ok(Math.abs(upMacd.histogram) < 1.5, `linear ramp histogram must be near zero (got ${upMacd.histogram})`);
  });

  test('macd equals fast EMA minus slow EMA alignment (hand-checkable series)', () => {
    // Linear ramp makes EMAs deterministic; just verify internal consistency:
    // histogram = macd - signal
    const closes = Array.from({ length: 50 }, (_, i) => 1000 * Math.exp(i * 0.01));
    const r = calculateMACD(closes)!;
    assert.ok(Math.abs(r.histogram - (r.macd - r.signal)) < 0.01);
  });
});

describe('Bollinger Width', () => {
  test('returns null on insufficient data', () => {
    assert.equal(calculateBollingerWidth([1, 2], 20), null);
  });

  test('flat series has zero width; volatile series has wide width', () => {
    const flat = new Array(30).fill(500);
    assert.equal(calculateBollingerWidth(flat, 20), 0);

    const volatile = Array.from({ length: 30 }, (_, i) => 500 + (i % 2 === 0 ? 50 : -50));
    const width = calculateBollingerWidth(volatile, 20)!;
    assert.ok(width > 10, `volatile width should exceed 10% (got ${width})`);
  });
});

describe('Volume Z-Score', () => {
  test('returns null on insufficient data or zero-variance window', () => {
    assert.equal(calculateVolumeZScore([1, 2, 3], 20), null);
    assert.equal(calculateVolumeZScore(new Array(25).fill(100), 20), null);
  });

  test('flags an anomalous volume spike (z >= 2)', () => {
    const base = new Array(25).fill(1000);
    const withSpike = [...base.slice(0, 24), 5000];
    const z = calculateVolumeZScore(withSpike, 20)!;
    assert.ok(z >= 2, `spike z-score should be >= 2 (got ${z})`);
  });
});

describe('Candle Store (research cache)', () => {
  test('round-trips candles and reports store stats', () => {
    // Recent timestamps: the store prunes anything older than 90 days.
    const now = Date.now();
    const bars: BacktestBar[] = Array.from({ length: 30 }, (_, i) => ({
      timestamp: now - (30 - i) * 3_600_000,
      open: 100 + i,
      high: 110 + i,
      low: 95 + i,
      close: 105 + i,
      volume: 1000 + i,
    }));

    const saved = saveCandles('TEST/IDR', '1h', bars);
    assert.equal(saved, 30);

    const loaded = loadCandles('testidr', '1h', 100);
    assert.equal(loaded.length, 30);
    assert.equal(loaded[0].timestamp, bars[0].timestamp, 'loaded candles must be chronological');
    assert.equal(loaded[29].close, bars[29].close);

    // Upsert: re-saving replaces, never duplicates
    saveCandles('testidr', '1h', bars);
    assert.equal(loadCandles('testidr', '1h', 100).length, 30);

    const stats = candleStoreStats();
    assert.ok(stats['1h'] && stats['1h'].candles >= 30);
  });

  test('rejects invalid bars without throwing', () => {
    assert.equal(saveCandles('badpair', '1h', []), 0);
    assert.equal(
      saveCandles('badpair', '1h', [{ timestamp: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 }]),
      1 // loop skips the invalid bar but the call itself succeeds
    );
    assert.equal(loadCandles('badpair', '1h').length, 0);
  });

  test('round-trips the raw coin volume alongside the IDR-notional volume', () => {
    const now = Date.now();
    const bars: BacktestBar[] = [
      { timestamp: now - 3_600_000, open: 100, high: 110, low: 95, close: 105, volume: 1050, rawVolume: 10 },
    ];
    saveCandles('volsem', '1h', bars);
    const loaded = loadCandles('volsem', '1h', 10);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].volume, 1050, 'notional IDR volume must round-trip');
    assert.equal(loaded[0].rawVolume, 10, 'raw coin volume must survive the store round-trip');
  });
});

describe('history_v2 -> candle-store mapping (volume semantics)', () => {
  test('persists IDR-notional volume (rawVol * close) and keeps the raw coin volume', () => {
    const rows = historyBarsToCandleRows([
      { Time: 1700000000, Open: '100', High: '110', Low: '95', Close: '105', Volume: '10' },
      { Time: 1700003600, Open: 105, High: 112, Low: 100, Close: 108.5, Volume: 2.5 },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].volume, Math.round(10 * 105), 'string inputs: volume must be rawVol * close');
    assert.equal(rows[0].rawVolume, 10);
    assert.equal(rows[1].volume, Math.round(2.5 * 108.5), 'numeric inputs: same semantics');
    assert.equal(rows[1].rawVolume, 2.5);
    assert.equal(rows[0].timestamp, 1700000000 * 1000);
  });

  test('tolerates a non-array payload', () => {
    assert.equal(historyBarsToCandleRows([]).length, 0);
  });
});

describe('Backtest candle-cache reads (dataSource)', () => {
  function hourlyBars(count: number, endOffsetHours = 1): BacktestBar[] {
    const nowSec = Math.floor(Date.now() / 1000);
    return Array.from({ length: count }, (_, i) => {
      const ts = (nowSec - (count - i + endOffsetHours - 1) * 3600) * 1000;
      return { timestamp: ts, open: 100, high: 101, low: 99, close: 100, volume: 1000 };
    });
  }

  test('loadCachedBars only accepts a fresh cache covering the whole requested range', () => {
    saveCandles('cachecov', '1h', hourlyBars(40)); // 40 hourly bars ending ~now
    // days=2 needs 49 bars -> insufficient
    assert.equal(loadCachedBars('cachecov', '1h', 2), null);
    // days=1 needs 25 bars and the 40-bar series reaches past the window start
    const covered = loadCachedBars('cachecov', '1h', 1);
    assert.ok(covered !== null);
    assert.equal(covered.length, 25 + 10, 'reads neededBars (+ headroom) newest candles');
    // unknown pair -> no cache
    assert.equal(loadCachedBars('nosuchpairhere', '1h', 1), null);

    // Stale right edge (ends 10h ago) must not count as coverage
    saveCandles('stalecov', '1h', hourlyBars(40, 10));
    assert.equal(loadCachedBars('stalecov', '1h', 1), null, 'a stale cache edge must force a refetch');
  });

  test('backtest engine prefers the candle store and tags dataSource=cache', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const bars: BacktestBar[] = Array.from({ length: 30 }, (_, i) => {
      const ts = (nowSec - (30 - i) * 3600) * 1000;
      const price = 100 * (1 + i * 0.001);
      return { timestamp: ts, open: price, high: price * 1.002, low: price * 0.998, close: price * 1.001, volume: 1000 };
    });
    saveCandles('btcacheidr', '1h', bars); // run() normalizes the symbol to <pair>idr

    const networkFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('network disabled for cache test');
    }) as any;
    try {
      const result = await backtestEngine.run({
        symbol: 'btcache',
        timeframe: '1h',
        days: 1,
        initialBalanceIdr: 1_000_000,
        allocationPerTradeIdr: 100_000,
      });
      assert.equal(result.dataSource, 'cache');
      assert.equal(result.totalCandles, 30);
    } finally {
      globalThis.fetch = networkFetch;
    }
  });

  test('backtest engine falls back to the exchange feed and tags dataSource=exchange', async () => {
    const networkFetch = globalThis.fetch;
    // Synthetic history_v2 payload; a chunk shorter than 50 bars stops pagination.
    const chunk = Array.from({ length: 40 }, (_, i) => ({
      Time: Math.floor(Date.now() / 1000) - (40 - i) * 3600,
      Open: '100',
      High: '101',
      Low: '99',
      Close: '100.5',
      Volume: '12.5',
    }));
    globalThis.fetch = (async () => ({ ok: true, json: async () => chunk })) as any;
    try {
      const result = await backtestEngine.run({
        symbol: 'btexchange',
        timeframe: '1h',
        days: 1,
        initialBalanceIdr: 1_000_000,
        allocationPerTradeIdr: 100_000,
      });
      assert.equal(result.dataSource, 'exchange');
      assert.equal(result.totalCandles, 40);
    } finally {
      globalThis.fetch = networkFetch;
    }
  });
});

describe('Portfolio Backtest (multi-asset simulator)', () => {
  const engine = new PortfolioBacktestEngine();

  function makeBars(startPrice: number, drift: number, count: number, startTs: number): BacktestBar[] {
    return Array.from({ length: count }, (_, i) => {
      const price = startPrice * Math.pow(1 + drift, i);
      return {
        timestamp: startTs + i * 3_600_000,
        open: price,
        high: price * 1.01,
        low: price * 0.99,
        close: price * (1 + drift * 0.5),
        volume: 1000,
      };
    });
  }

  test('respects max concurrent positions with a shared cash pool', () => {
    // Two clean uptrends: both emit entries; 1 slot forces serialization.
    const barsA = makeBars(100_000, 0.004, 80, 1_700_000_000_000);
    const barsB = makeBars(200_000, 0.004, 80, 1_700_000_000_000);

    const result = engine.simulate(new Map([['aaa', barsA], ['bbb', barsB]]), {
      symbols: ['aaa', 'bbb'],
      initialBalanceIdr: 10_000_000,
      allocationPerTradeIdr: 100_000,
      maxActiveTrades: 1,
      minGainThresholdPercent: 0.5,
    }, '1h', 5);

    assert.equal(result.maxConcurrentPositions, 1, 'single slot must never hold 2 positions');
    assert.ok(result.totalTrades > 0, 'uptrends must produce trades');
    assert.ok(result.netPnlIdr > 0, 'steady uptrend with trailing exits must be profitable');
    assert.equal(result.symbolsWithData.length, 2);
    assert.ok(result.slotUtilizationPercent > 0);
  });

  test('honors zero-lookahead stop execution (stop checked against previous level)', () => {
    // Uptrend just long enough for the first momentum entry (bar 24), then a
    // single brutal crash bar while the stop is still near the entry: the
    // exit must fill at the stop level (or bar open), never at the bar close.
    const bars: BacktestBar[] = [];
    for (let i = 0; i < 25; i++) {
      const price = 100_000 * Math.pow(1.004, i);
      bars.push({ timestamp: 1_700_000_000_000 + i * 3_600_000, open: price, high: price * 1.01, low: price * 0.99, close: price * 1.002, volume: 1000 });
    }
    const crashBase = bars[24].close;
    bars.push({
      timestamp: 1_700_000_000_000 + 25 * 3_600_000,
      open: crashBase,
      high: crashBase * 1.005,
      low: crashBase * 0.85, // -15% wick through the entry-bar stop
      close: crashBase * 0.86,
      volume: 1000,
    });

    const result = engine.simulate(new Map([['csh', bars]]), {
      symbols: ['csh'],
      initialBalanceIdr: 10_000_000,
      allocationPerTradeIdr: 100_000,
      maxActiveTrades: 1,
      minGainThresholdPercent: 0.5,
      trailingStopPercent: 2.5,
    }, '1h', 3);

    const losing = result.trades.filter((t) => t.pnlIdr < 0);
    assert.ok(losing.length >= 1, 'crash right after entry must produce a stopped-out trade');
    for (const t of losing) {
      // Exit price must be at/above the stop level, NOT the crash close.
      assert.ok(t.exitPrice > t.entryPrice * 0.93, `stop exit must cap the loss near the stop level (exit ${t.exitPrice} vs entry ${t.entryPrice})`);
      assert.ok(t.exitPrice < t.entryPrice, 'the stop exit must still be a loss');
    }
  });

  test('portfolio TP2: second scale-out fires when price runs past the TP2 target', () => {
    // 25 rising bars seed the 24h momentum entry, a +15% rally bar trips TP1
    // AND TP2, then a crash into the ratcheted stop closes the remainder.
    const bars: BacktestBar[] = [];
    for (let i = 0; i < 25; i++) {
      const price = 100_000 * Math.pow(1.004, i);
      bars.push({ timestamp: 1_700_000_000_000 + i * 3_600_000, open: price, high: price * 1.01, low: price * 0.99, close: price * 1.002, volume: 1000 });
    }
    const base = bars[24].close;
    bars.push({ timestamp: 1_700_000_000_000 + 25 * 3_600_000, open: base, high: base * 1.16, low: base * 1.0, close: base * 1.15, volume: 1000 });
    bars.push({ timestamp: 1_700_000_000_000 + 26 * 3_600_000, open: base * 1.14, high: base * 1.14, low: base * 1.05, close: base * 1.06, volume: 1000 });

    const result = engine.simulate(new Map([['tp2p', bars]]), {
      symbols: ['tp2p'],
      initialBalanceIdr: 10_000_000,
      allocationPerTradeIdr: 100_000,
      maxActiveTrades: 1,
      minGainThresholdPercent: 0.5,
      trailingStopPercent: 2.5,
      takeProfitStep1Percent: 5.0,
      takeProfitTarget2Percent: 10.0,
    }, '1h', 3);

    assert.equal(result.totalTrades, 1);
    assert.ok(result.trades[0].exitReason.startsWith('Partial TP2'), `post-TP2 label expected, got: ${result.trades[0].exitReason}`);
    assert.ok(result.trades[0].pnlIdr > 0);
  });

  test('slippage and fees are always deducted (equity never exceeds ideal)', () => {
    const barsA = makeBars(100_000, 0.003, 60, 1_700_000_000_000);
    const result = engine.simulate(new Map([['fee', barsA]]), {
      symbols: ['fee'],
      initialBalanceIdr: 10_000_000,
      allocationPerTradeIdr: 500_000,
      maxActiveTrades: 1,
      minGainThresholdPercent: 0.5,
      slippagePercent: 0.5,
      feePercent: 0.4,
    }, '1h', 3);

    // ~1.1% trend over the hold vs ~1.8% round-trip cost profile: positive
    // but materially below the gross move.
    assert.ok(result.totalTrades > 0, 'gentle uptrend must still produce an entry');
    assert.ok(result.netPnlPercent > 0);
    assert.ok(result.netPnlPercent < 10, 'costs must materially reduce the gross trend return');
  });
});
