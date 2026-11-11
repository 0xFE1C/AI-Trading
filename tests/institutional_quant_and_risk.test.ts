import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateADX,
  calculateBollingerBands,
  calculateVWAP,
  calculateReturnCorrelation,
} from '../src/utils/indicators.js';
import { extractFeatures, detectSqueezeBreakout } from '../src/services/signals/features.js';
import { scoreOpportunity, SCORE_THRESHOLDS } from '../src/services/signals/scorer.js';
import {
  classifyCoinSector,
  checkPortfolioCorrelation,
  computePortfolioHeat,
} from '../src/services/trading/portfolioRisk.js';
import { computeContinuousKelly } from '../src/services/trading/strategyKelly.js';
import {
  computeInstitutionalMetrics,
  runMonteCarloSimulation,
} from '../src/services/backtest/quantMetrics.js';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { TradingEngine } from '../src/services/trading/index.js';
import { indodax } from '../src/services/indodax/index.js';
import { indodaxMarketStream } from '../src/services/indodax/marketStream.js';

describe('Institutional Quantitative Indicators (ADX, VWAP, Bollinger %B, Return Correlation)', () => {
  test('calculateADX detects strong directional uptrend (+DI > -DI, ADX >= 25) vs flat chop', () => {
    const trending = Array.from({ length: 40 }, (_, i) => {
      const base = 100 + i * 3;
      return { high: base + 2, low: base - 1, close: base + 1.5 };
    });
    const adxUp = calculateADX(trending, 14);
    assert.ok(adxUp !== null);
    assert.ok(adxUp.adx >= 40, `Expected strong ADX >= 40 on linear uptrend, got ${adxUp.adx}`);
    assert.ok(adxUp.plusDi > adxUp.minusDi, `Expected +DI (${adxUp.plusDi}) > -DI (${adxUp.minusDi})`);

    // Insufficient candles (< 28) returns null cleanly
    assert.equal(calculateADX(trending.slice(0, 20), 14), null);
  });

  test('calculateBollingerBands computes %B breakout (>1.0) and tight squeeze width', () => {
    const coiledThenBreakout = [
      ...new Array(19).fill(100).map((v, i) => v + (i % 2 === 0 ? 0.2 : -0.2)),
      103.5, // sharp breakout above upper band
    ];
    const bb = calculateBollingerBands(coiledThenBreakout, 20, 2);
    assert.ok(bb !== null);
    assert.ok(bb.percentB > 1.0, `Breakout candle must sit above upper band (%B > 1.0), got ${bb.percentB}`);
    assert.ok(bb.upper > bb.middle && bb.middle > bb.lower);
  });

  test('calculateVWAP weights typical price by volume and prefers rawVolume when present', () => {
    const candles = [
      { high: 100, low: 100, close: 100, volume: 10000, rawVolume: 100 },
      { high: 200, low: 200, close: 200, volume: 60000, rawVolume: 300 },
    ];
    // Weighted by rawVolume (100 @ 100, 300 @ 200) -> (10,000 + 60,000) / 400 = 175
    const vwap = calculateVWAP(candles, 24);
    assert.equal(vwap, 175);
  });

  test('calculateReturnCorrelation distinguishes identical (+1), inverse (-1), and short series (null)', () => {
    const seriesA = Array.from({ length: 20 }, (_, i) => 100 * Math.pow(1.01 + (i % 3) * 0.005, i));
    const seriesSame = seriesA.map((v) => v * 2.5);
    assert.equal(calculateReturnCorrelation(seriesA, seriesSame, 32, 10), 1);

    // Construct exact opposite percentage returns
    const rets = [0.02, -0.01, 0.03, -0.02, 0.015, -0.025, 0.01, 0.02, -0.015, 0.025, -0.01, 0.02];
    const pA = [100];
    const pB = [100];
    for (const r of rets) {
      pA.push(pA[pA.length - 1] * (1 + r));
      pB.push(pB[pB.length - 1] * (1 - r));
    }
    const corrInv = calculateReturnCorrelation(pA, pB, 32, 10);
    assert.ok(corrInv !== null && corrInv <= -0.99, `Expected ~ -1.0 inverse correlation, got ${corrInv}`);

    assert.equal(calculateReturnCorrelation([100, 102, 104], [200, 204, 208], 32, 10), null);
  });
});

describe('Volatility Squeeze Breakout Detection & Multi-Factor Opportunity Scoring', () => {
  test('extractFeatures & scoreOpportunity trigger volatility_squeeze on tight coil expansion', () => {
    const candles = Array.from({ length: 36 }, (_, i) => {
      if (i < 35) {
        const c = 1000 + (i % 2 === 0 ? 3 : -3);
        return { open: c - 1, high: c + 4, low: c - 4, close: c, volume: 100 };
      }
      // Bar 35: high-volume breakout from tight Bollinger coil
      return { open: 1000, high: 1022, low: 999, close: 1018, volume: 650 };
    });

    const features = extractFeatures(
      {
        symbol: 'sui',
        pair: 'sui_idr',
        last: 1018,
        high24h: 1022,
        low24h: 996,
        volIdr24h: 850_000_000,
        buyPrice: 1017,
        sellPrice: 1019,
        ts: Date.now(),
      },
      candles
    );

    assert.equal(features.isSqueezeBreakout, true, 'Coiled series breaking upper band with volume surge must flag squeeze');
    assert.ok(features.bbWidthPct !== null && features.bbPercentB !== null);
    assert.ok(features.vwap !== null);
    assert.ok(features.volumeZScore !== null && features.volumeZScore > 2.0);

    const scoreRes = scoreOpportunity(features, 0.25, false, 'RISK_ON', 'volatility_squeeze');
    assert.equal(scoreRes.strategy, 'volatility_squeeze');
    assert.ok(
      scoreRes.score >= SCORE_THRESHOLDS.balanced,
      `Expected volatility_squeeze score >= ${SCORE_THRESHOLDS.balanced}, got ${scoreRes.score}`
    );
    assert.equal(scoreRes.breakdown.squeeze_confirmed, 8);
  });

  test('detectSqueezeBreakout rejects wide chaotic bands or weak volume', () => {
    const wideVolatile = Array.from({ length: 26 }, (_, i) => (i % 2 === 0 ? 80 : 120));
    assert.equal(detectSqueezeBreakout(wideVolatile, 0.95, 38.0, 2.5, 2.0), false);
    const tightNoVol = Array.from({ length: 26 }, () => 100);
    assert.equal(detectSqueezeBreakout(tightNoVol, 0.95, 2.0, 0.1, 0.9), false);
  });
});

describe('Portfolio Sector Taxonomy, Correlation Guard & Portfolio Heat Engine', () => {
  test('classifyCoinSector maps major narratives accurately', () => {
    assert.equal(classifyCoinSector('btc_idr'), 'btc_macro');
    assert.equal(classifyCoinSector('SOL/IDR'), 'smart_contract_l1');
    assert.equal(classifyCoinSector('pepe'), 'meme');
    assert.equal(classifyCoinSector('fet_idr'), 'ai_compute');
    assert.equal(classifyCoinSector('aave'), 'defi');
  });

  test('checkPortfolioCorrelation blocks 3rd smart_contract_l1 or 2nd meme or >0.85 return correlation', () => {
    // 2 L1s already open -> 3rd L1 blocked
    const sectorBlocked = checkPortfolioCorrelation({
      candidateSymbol: 'avax',
      openPositions: [{ symbol: 'eth' }, { symbol: 'sol' }],
      maxSameSector: 2,
    });
    assert.equal(sectorBlocked.passed, false);
    assert.ok(sectorBlocked.reason.includes('smart_contract_l1'));

    // 1 meme already open -> 2nd meme blocked
    const memeBlocked = checkPortfolioCorrelation({
      candidateSymbol: 'bonk',
      openPositions: [{ symbol: 'pepe' }],
    });
    assert.equal(memeBlocked.passed, false);

    // Uncorrelated different sectors with low return correlation -> passes
    const basePrices = [100, 102, 101, 104, 103, 106, 105, 108, 107, 110, 109, 112, 111, 115];
    const clonedPrices = basePrices.map((p) => p * 3); // r = 1.000!
    const corrBlocked = checkPortfolioCorrelation({
      candidateSymbol: 'uni', // defi
      candidateCloses: clonedPrices,
      openPositions: [{ symbol: 'fet', closes: basePrices }], // ai_compute
      maxReturnCorrelation: 0.85,
    });
    assert.equal(corrBlocked.passed, false);
    assert.ok(corrBlocked.reason.includes('FET'));
  });

  test('computePortfolioHeat distinguishes at-risk positions vs ratcheted free-roll positions', () => {
    const snap = computePortfolioHeat({
      equityIdr: 10_000_000,
      feeRate: 0.002,
      openPositions: [
        {
          // Free-roll: bought @ 100, now 120, trailing stop @ 110 -> locked profit, 0 heat!
          symbol: 'btc_idr',
          entry_price: 100,
          current_price: 120,
          amount: 10_000,
          initial_cost_idr: 1_000_000,
          trailing_stop_price: 110,
        },
        {
          // Fresh position: bought @ 100, now 101, stop @ 97 -> ~3.4% at risk (~Rp 33,940)
          symbol: 'sol_idr',
          entry_price: 100,
          current_price: 101,
          amount: 10_000,
          initial_cost_idr: 1_000_000,
          trailing_stop_price: 97,
        },
      ],
    });

    assert.equal(snap.freeRollPositions, 1);
    assert.equal(snap.totalPositions, 2);
    assert.ok(snap.lockedProfitIdr > 90_000, `BTC ratcheted stop should lock >90k IDR profit, got ${snap.lockedProfitIdr}`);
    assert.ok(snap.totalAtRiskIdr > 30_000 && snap.totalAtRiskIdr < 40_000, `Only SOL should contribute downside heat, got ${snap.totalAtRiskIdr}`);
    assert.ok(snap.portfolioHeatPercent > 0.3 && snap.portfolioHeatPercent < 0.45);
  });
});

describe('Payoff-Aware Continuous Half-Kelly & Institutional Monte Carlo Engine', () => {
  test('computeContinuousKelly rewards asymmetric 3:1 payoff even at 45% win rate', () => {
    // 9 wins of +9%, 11 losses of -3% (45% WR, 3:1 payoff -> positive expectancy +2.4%/trade)
    const asymmetricRunner = [
      ...new Array(9).fill({ pnlPercent: 9.0 }),
      ...new Array(11).fill({ pnlPercent: -3.0 }),
    ];
    const kelly = computeContinuousKelly(asymmetricRunner);
    assert.equal(kelly.payoffRatio, 3);
    assert.ok(kelly.expectancyPct > 2.0);
    assert.ok(kelly.fullKellyFraction > 0.2);
    assert.ok(kelly.halfKellyMultiplier >= 1.15);
  });

  test('computeInstitutionalMetrics & runMonteCarloSimulation produce deterministic ratios and percentiles', () => {
    const trades = [
      { pnlIdr: 85_000, pnlPercent: 8.5 },
      { pnlIdr: -25_000, pnlPercent: -2.5 },
      { pnlIdr: 62_000, pnlPercent: 6.2 },
      { pnlIdr: 45_000, pnlPercent: 4.5 },
      { pnlIdr: -20_000, pnlPercent: -2.0 },
      { pnlIdr: 90_000, pnlPercent: 9.0 },
      { pnlIdr: 55_000, pnlPercent: 5.5 },
      { pnlIdr: -18_000, pnlPercent: -1.8 },
    ];

    const metrics = computeInstitutionalMetrics({
      trades,
      initialCapitalIdr: 10_000_000,
      effectiveDays: 30,
      maxDrawdownPercent: 0.45,
    });

    assert.ok(metrics.sharpeRatio !== null && metrics.sharpeRatio > 1.5);
    assert.ok(metrics.sortinoRatio !== null && metrics.sortinoRatio > 2.0);
    assert.ok(metrics.sqn !== null && metrics.sqn > 1.5);
    assert.ok(metrics.payoffRatio !== null && metrics.payoffRatio > 3.0);
    assert.equal(metrics.maxConsecutiveWins, 2);
    assert.equal(metrics.maxConsecutiveLosses, 1);

    const mc1 = runMonteCarloSimulation({
      trades,
      initialCapitalIdr: 10_000_000,
      iterations: 500,
      horizonTrades: 30,
      seed: 12345,
    });
    const mc2 = runMonteCarloSimulation({
      trades,
      initialCapitalIdr: 10_000_000,
      iterations: 500,
      horizonTrades: 30,
      seed: 12345,
    });

    // Deterministic reproducibility
    assert.deepEqual(mc1.terminalEquity, mc2.terminalEquity);
    assert.ok(mc1.terminalEquity.p95 > mc1.terminalEquity.median);
    assert.ok(mc1.terminalEquity.median > mc1.terminalEquity.p5);
    assert.ok(mc1.probabilityOfProfitPercent > 90);
    assert.equal(mc1.verdict, 'INSTITUTIONAL_GRADE');
    assert.ok(mc1.fanChart.length >= 5);
  });
});

describe('Tactical Single-Position Controls & ATR Volatility Sizing Fix', () => {
  const engine = new TradingEngine();

  test('lockPositionBreakeven raises stop to fee-adjusted breakeven and closeSinglePositionById exits cleanly', async () => {
    const posId = `pos_tactical_${Date.now()}`;
    const prevPaperBal = getSetting('paper_idr_balance', '10000000');
    setSetting('paper_idr_balance', '10000000');

    const origTicker = indodax.getTicker;
    (indodax as any).getTicker = async () => ({ ticker: { last: '1120' } });

    db.prepare(`
      INSERT INTO positions (
        id, symbol, base_currency, traded_currency, side, entry_price, current_price,
        amount, initial_cost_idr, highest_price, trailing_stop_price, take_profit_step,
        status, opened_at, mode
      ) VALUES (?, 'tactidr', 'idr', 'tact', 'buy', 1000, 1120, 100, 100000, 1120, 975, 0, 'open', ?, 'paper')
    `).run(posId, Date.now() - 120_000);

    try {
      const lockRes = await engine.lockPositionBreakeven(posId);
      assert.equal(lockRes.ok, true);
      assert.ok(lockRes.newStopPrice! > 1000, `Fee-adjusted breakeven stop must exceed raw entry 1000, got ${lockRes.newStopPrice}`);

      const closeRes = await engine.closeSinglePositionById(posId);
      assert.equal(closeRes.ok, true);

      const row = db.prepare('SELECT status, pnl_idr FROM positions WHERE id = ?').get(posId) as any;
      assert.equal(row.status, 'closed');
      assert.ok(row.pnl_idr > 0, `Closing @ 1120 from 1000 entry should record positive net PnL, got ${row.pnl_idr}`);
    } finally {
      indodax.getTicker = origTicker;
      setSetting('paper_idr_balance', prevPaperBal);
      db.prepare('DELETE FROM trades_history WHERE position_id = ?').run(posId);
      db.prepare('DELETE FROM positions WHERE id = ?').run(posId);
    }
  });

  test('ATR > 4% volatility sizing compounds with Kelly throttling instead of resetting to baseAllocationIdr', async () => {
    // Regression guard for bug in scanAndExecuteEntries where high ATR (>4%) multiplied
    // baseAllocationIdr instead of maxAllocationIdr, wiping out Strategy/Global Kelly reductions.
    const origSummaries = indodax.getSummaries;
    const origDepth = indodax.getDepth;
    const origCandles = indodaxMarketStream.getRealCandles;

    const snap: Record<string, string> = {};
    const keys = [
      'trading_mode', 'is_auto_trading_active', 'ai_mode', 'risk_profile',
      'max_allocation_per_trade_idr', 'volatility_sizing_enabled', 'strategy_kelly_enabled',
      'market_breadth_min_percent', 'reentry_cooldown_hours', 'correlation_guard_enabled',
    ];
    for (const k of keys) snap[k] = getSetting(k, '');

    // Seed 20 losing trades so global Kelly = 0.6x and strategy Kelly = 0.6x -> 100,000 * 0.6 * 0.6 = 36,000
    const seedIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const sid = `atr_kelly_seed_${Date.now()}_${i}`;
      seedIds.push(sid);
      db.prepare(`
        INSERT INTO positions (id, symbol, base_currency, traded_currency, side, entry_price, current_price,
          amount, initial_cost_idr, highest_price, trailing_stop_price, take_profit_step, status, opened_at,
          closed_at, pnl_idr, pnl_percent, entry_strategy, mode)
        VALUES (?, 'seedidr', 'idr', 'seed', 'buy', 100, 95, 1000, 100000, 100, 95, 0, 'closed', ?, ?, -5000, -5, 'momentum', 'paper')
      `).run(sid, Date.now() - 300_000 - i * 1000, Date.now() - 60_000 - i * 1000);
    }

    setSetting('trading_mode', 'paper');
    setSetting('is_auto_trading_active', '1');
    setSetting('ai_mode', 'off');
    setSetting('risk_profile', 'balanced');
    setSetting('max_allocation_per_trade_idr', '100000');
    setSetting('volatility_sizing_enabled', '1');
    setSetting('strategy_kelly_enabled', '1');
    setSetting('market_breadth_min_percent', '0');
    setSetting('reentry_cooldown_hours', '0');
    setSetting('correlation_guard_enabled', '0');

    // Ticker range is calm (high 106, low 98 -> 8% range, so ticker range sizing does not trigger),
    // BUT 15m candle wicks have ATR > 5% so candle ATR sizing triggers 0.6x -> 36,000 * 0.6 = 21,600!
    (indodax as any).getSummaries = async () => ({
      tickers: {
        atrx_idr: {
          name: 'ATRX',
          last: '105',
          high: '106',
          low: '98',
          vol_idr: '600000000',
          buy: '104.9',
          sell: '105.0',
          server_time: Date.now(),
        },
      },
      prices_24h: {},
    });
    (indodax as any).getDepth = async () => ({
      buy: [['104.9', '500000']],
      sell: [['105.0', '500000']],
    });
    (indodaxMarketStream as any).getRealCandles = async (_pair: string, tf: string) => {
      if (tf !== '15m') return [];
      return Array.from({ length: 30 }, (_, i) => {
        const c = i % 2 === 0 ? 105 : 103;
        return {
          timestamp: Date.now() - (30 - i) * 900_000,
          open: c - 1,
          high: c + 4.5, // ~8.5% candle true range -> ATR > 4%
          low: c - 4.5,
          close: c,
          volume: i >= 26 ? 900 : 120,
        };
      });
    };

    try {
      await (engine as any).scanAndExecuteEntries();
      const pos = db.prepare("SELECT id, initial_cost_idr FROM positions WHERE symbol = 'atrx' ORDER BY opened_at DESC LIMIT 1").get() as any;
      assert.ok(pos, 'Expected position on atrx');
      // Previously buggy code set maxAllocationIdr = 100000 * 0.6 = 60000 (ignoring Kelly 36000!).
      // Fixed code scales 36000 * 0.6 = 21600.
      assert.equal(pos.initial_cost_idr, 21600, `Expected compounded Kelly+ATR sizing 21600, got ${pos.initial_cost_idr}`);
    } finally {
      indodax.getSummaries = origSummaries;
      indodax.getDepth = origDepth;
      indodaxMarketStream.getRealCandles = origCandles;
      for (const sid of seedIds) db.prepare('DELETE FROM positions WHERE id = ?').run(sid);
      const created = db.prepare("SELECT id FROM positions WHERE symbol = 'atrx'").all() as Array<{ id: string }>;
      for (const r of created) {
        db.prepare('DELETE FROM trades_history WHERE position_id = ?').run(r.id);
        db.prepare('DELETE FROM positions WHERE id = ?').run(r.id);
      }
      for (const [k, v] of Object.entries(snap)) setSetting(k, v);
    }
  });
});
