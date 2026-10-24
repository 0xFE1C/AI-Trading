import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateRSI, calculateEMA, calculateTrueATR } from '../src/utils/indicators.js';
import { indodax, IndodaxDepth } from '../src/services/indodax/index.js';

describe('Quantitative Indicators (RSI, EMA, True ATR) & Spread Mechanics', () => {
  test('calculateRSI accurately computes RSI for monotonic uptrend and downtrend', () => {
    // Uptrend closes: prices increasing steadily
    const uptrendCloses = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const rsiUp = calculateRSI(uptrendCloses, 14);
    assert.ok(rsiUp !== null);
    assert.strictEqual(rsiUp, 100); // 0 losses = 100 RSI

    // Downtrend closes: prices decreasing steadily
    const downtrendCloses = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    const rsiDown = calculateRSI(downtrendCloses, 14);
    assert.ok(rsiDown !== null);
    assert.strictEqual(rsiDown, 0); // 0 gains = 0 RSI

    // Insufficient data returns null
    assert.strictEqual(calculateRSI([10, 11], 14), null);
    assert.strictEqual(calculateRSI(uptrendCloses, 0), null);

    // Flat-line prices return 50 (neutral momentum, NOT 100)
    const flatCloses = [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500];
    const rsiFlat = calculateRSI(flatCloses, 14);
    assert.strictEqual(rsiFlat, 50);
  });

  test('calculateEMA accurately smooths price sequence with appropriate weighting', () => {
    const closes = [100, 102, 104, 103, 105, 107, 106, 108, 110, 109];
    const ema5 = calculateEMA(closes, 5);
    assert.ok(ema5 !== null);
    assert.ok(ema5 > 105 && ema5 < 110);
  });

  test('calculateTrueATR calculates average true range across gap wicks', () => {
    const candles = [
      { high: 105, low: 95, close: 100 },
      { high: 110, low: 98, close: 108 },
      { high: 112, low: 104, close: 106 },
      { high: 115, low: 105, close: 112 },
      { high: 118, low: 110, close: 115 },
      { high: 120, low: 112, close: 118 },
      { high: 122, low: 114, close: 120 },
      { high: 125, low: 118, close: 122 },
      { high: 128, low: 120, close: 125 },
      { high: 130, low: 122, close: 128 },
      { high: 132, low: 125, close: 130 },
      { high: 135, low: 128, close: 132 },
      { high: 138, low: 130, close: 135 },
      { high: 140, low: 132, close: 138 },
      { high: 142, low: 135, close: 140 },
      { high: 145, low: 138, close: 142 },
    ];
    const atr = calculateTrueATR(candles, 14);
    assert.ok(atr !== null);
    assert.ok(atr > 6 && atr < 12);
  });

  test('calculateSpread detects wide bid-ask spread traps accurately', () => {
    const tightDepth: IndodaxDepth = {
      buy: [['100000', '1.0'], ['99900', '2.0']],
      sell: [['100100', '1.0'], ['100200', '2.0']],
    };
    const tight = indodax.calculateSpread(tightDepth);
    assert.ok(tight.spreadPercent < 0.2); // ~0.1% spread

    const wideDepth: IndodaxDepth = {
      buy: [['100', '1000']],
      sell: [['120', '1000']], // 20% spread
    };
    const wide = indodax.calculateSpread(wideDepth);
    assert.strictEqual(wide.spreadPercent, 16.67);
  });

  test('calculateDepthImbalance computes buyer vs seller wall dominance', () => {
    const depth: IndodaxDepth = {
      buy: [
        ['100', '100'], // 10,000 IDR
        ['99', '200'],  // 19,800 IDR
      ],
      sell: [
        ['101', '50'],  // 5,050 IDR
        ['102', '50'],  // 5,100 IDR
      ],
    };
    const imbalance = indodax.calculateDepthImbalance(depth, 5);
    // Bids = 29,800, Asks = 10,150 -> Ratio ~ 2.94x
    assert.ok(imbalance > 2.5);
  });
});
