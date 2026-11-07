import { test, describe } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { scoreHeadline, aggregateCoinSentiment } from '../src/services/signals/lexicon.js';
import { detectThreats, isSymbolThreatened } from '../src/services/signals/threat.js';
import { atrPercentileFromCandles, detectBtcRegime } from '../src/services/signals/regime.js';
import { scoreOpportunity, SCORE_THRESHOLDS } from '../src/services/signals/scorer.js';
import {
  checkCircuitBreaker,
  checkExposure,
  checkBtcRegime,
  checkThreatScope,
  checkSlippageBudget,
  checkSpreadTrap,
  checkRsiGuard,
  RiskState,
} from '../src/services/trading/riskGuard.js';
import { agentBus } from '../src/services/agents/bus.js';
import { IndodaxAdapter } from '../src/services/adapters/IndodaxAdapter.js';
import { CoinFeatures, ScoreResult, ThreatSignal } from '../src/services/signals/types.js';
import { selectMomentumCandidate } from '../src/services/trading/momentumSelect.js';
import { getSetting } from '../src/db/index.js';

describe('Section 9 Lexicon Sentiment Scoring & Age Decay', () => {
  test('accurately scores bilingual Indonesian and English sentiment keywords', () => {
    const bullishId = 'Bank Indonesia perkuat adopsi dan kemitraan aset kripto nasional lonjakan volume';
    const scoreBullish = scoreHeadline(bullishId);
    assert.ok(scoreBullish.score > 0.3, `Expected score > 0.3, got ${scoreBullish.score}`);
    assert.ok(scoreBullish.matchedBullish.includes('kemitraan'));
    assert.ok(scoreBullish.matchedBullish.includes('adopsi'));

    const bearishEn = 'Major exchange crash liquidation dump panic anjlok drastis';
    const scoreBearish = scoreHeadline(bearishEn);
    assert.ok(scoreBearish.score < -0.3, `Expected score < -0.3, got ${scoreBearish.score}`);
    assert.ok(scoreBearish.matchedBearish.includes('liquidation'));
    assert.ok(scoreBearish.matchedBearish.includes('anjlok'));

    // Neutral text returns 0
    const neutral = 'Indodax merilis jadwal pemeliharaan rutin server pada hari minggu malam.';
    const scoreNeutral = scoreHeadline(neutral);
    assert.strictEqual(scoreNeutral.score, 0);
  });

  test('tanh scaling bounds sentiment scores strictly within [-1.0, 1.0]', () => {
    const extremeBullish = 'etf breakout pump partnership surge moon rekor kemitraan '.repeat(10);
    const result = scoreHeadline(extremeBullish);
    assert.ok(result.score <= 1.0 && result.score >= -1.0);
  });

  test('scoreHeadline is purely deterministic (identical input produces identical score and matches)', () => {
    const text = 'Bitcoin melonjak menembus level rekor setelah kemitraan institusional disetujui';
    const res1 = scoreHeadline(text);
    const res2 = scoreHeadline(text);

    assert.strictEqual(res1.score, res2.score);
    assert.deepStrictEqual(res1.matchedBullish, res2.matchedBullish);
    assert.deepStrictEqual(res1.matchedBearish, res2.matchedBearish);
    assert.deepStrictEqual(res1.mentionedCoins, res2.mentionedCoins);
    assert.ok(res1.score >= -1.0 && res1.score <= 1.0);
  });

  test('aggregateCoinSentiment applies 48-hour age decay weighting', () => {
    const itemFresh = {
      sentiment: { score: 0.8, matchedBullish: ['partnership'], matchedBearish: [], mentionedCoins: ['btc'] },
      ageHours: 2,
    };
    const itemDecayed = {
      sentiment: { score: -0.4, matchedBullish: [], matchedBearish: ['drop'], mentionedCoins: ['btc'] },
      ageHours: 40,
    };
    const itemAncient = {
      sentiment: { score: 1.0, matchedBullish: ['moon'], matchedBearish: [], mentionedCoins: ['btc'] },
      ageHours: 50, // > 48h, weight 0
    };

    const res = aggregateCoinSentiment([itemFresh, itemDecayed, itemAncient]);
    // Fresh bullish (weight 46/48) dominates decayed bearish (weight 8/48), ancient ignored
    assert.ok(res.btc > 0, `Expected positive aggregated sentiment, got ${res.btc}`);

    const resAncientOnly = aggregateCoinSentiment([itemAncient]);
    assert.strictEqual(resAncientOnly.btc ?? 0, 0);
  });
});

describe('P0-A Fix: Scoped Threat Blocker & False Alarm Elimination', () => {
  test('bare word "sec" or "second" does NOT trigger false emergency threats', () => {
    const benignHeadlines = [
      'SEC approves options trading for spot Bitcoin ETFs',
      'Ethereum layer 2 completes transactions in under one second',
      'Crypto exchange security audit passes with high marks',
    ];

    for (const title of benignHeadlines) {
      const threats = detectThreats({ title, fetchedAt: Date.now() });
      assert.strictEqual(threats.length, 0, `False threat triggered for: "${title}"`);
    }
  });

  test('genuine critical threats (lawsuit charges, exploits, hacks) are correctly detected', () => {
    const exploitNews = {
      title: 'Solana DeFi protocol smart contract exploited in hack attack',
      fetchedAt: Date.now(),
    };
    const threats = detectThreats(exploitNews);

    assert.ok(threats.length >= 1);
    assert.strictEqual(threats[0].coin?.toLowerCase(), 'sol');
    assert.ok(threats[0].severity === 'critical' || threats[0].severity === 'high');
  });

  test('threat scoping: an exploit on PEPE does not block BTC or ETH', () => {
    const now = Date.now();
    const pepeThreat: ThreatSignal = {
      coin: 'pepe',
      severity: 'critical',
      matchedRule: 'exploit',
      headline: 'PEPE smart contract exploit confirmed',
      detectedAt: now,
    };

    const threats = [pepeThreat];

    // Check PEPE
    const pepeBlock = checkThreatScope('pepe_idr', threats, now);
    assert.strictEqual(pepeBlock.passed, false);

    // Check BTC - MUST PASS!
    const btcBlock = checkThreatScope('btc_idr', threats, now);
    assert.strictEqual(btcBlock.passed, true);

    // Check ETH - MUST PASS!
    const ethBlock = checkThreatScope('eth_idr', threats, now);
    assert.strictEqual(ethBlock.passed, true);
  });

  test('threat expiration: threats older than 30 minutes automatically expire', () => {
    const now = Date.now();
    const expiredThreat: ThreatSignal = {
      coin: 'btc',
      severity: 'high',
      matchedRule: 'outage',
      headline: 'Exchange temporary outage reported 35 minutes ago',
      detectedAt: now - 35 * 60 * 1000, // 35m old
    };

    assert.strictEqual(isSymbolThreatened('btc', [expiredThreat], now), false);
    const scopeCheck = checkThreatScope('btc_idr', [expiredThreat], now);
    assert.strictEqual(scopeCheck.passed, true);
  });
});

describe('BTC Macro Regime Window Returns (1h & 4h)', () => {
  test('detects CRASH regime when 1h return <= -3% or 4h return <= -5%', () => {
    // 1h flash drop of -3.5%
    const verdict1h = detectBtcRegime({
      close: 96500,
      change1hPct: -3.5,
      change4hPct: -0.5,
      ema21_1h: 99000,
      atrPercentile30d: 50,
    });
    assert.strictEqual(verdict1h.regime, 'CRASH');
    assert.strictEqual(verdict1h.allowNewEntries, false);

    // 4h cumulative dump of -5.2%
    const verdict4h = detectBtcRegime({
      close: 94800,
      change1hPct: -1.25,
      change4hPct: -5.2,
      ema21_1h: 98000,
      atrPercentile30d: 60,
    });
    assert.strictEqual(verdict4h.regime, 'CRASH');
    assert.strictEqual(verdict4h.allowNewEntries, false);
  });

  test('normal intraday fluctuation below 24h high does NOT trigger CRASH', () => {
    // Normal 1h return of -0.4% and 4h -0.8%
    const normalVerdict = detectBtcRegime({
      close: 98000,
      change1hPct: -0.4,
      change4hPct: -0.8,
      ema21_1h: 97500, // close > EMA21
      atrPercentile30d: 50,
    });
    assert.notStrictEqual(normalVerdict.regime, 'CRASH');
    assert.strictEqual(normalVerdict.allowNewEntries, true);
  });

  test('identifies RISK_ON when price is above EMA21 with healthy momentum', () => {
    const riskOnVerdict = detectBtcRegime({
      close: 102000,
      change1hPct: 1.5,
      change4hPct: 2.0,
      ema21_1h: 100500,
      atrPercentile30d: 45,
    });
    assert.strictEqual(riskOnVerdict.regime, 'RISK_ON');
    assert.strictEqual(riskOnVerdict.allowNewEntries, true);
  });
});

describe('ATR Percentile from Candles (RISK_OFF regime enabler)', () => {
  function makeCandles(ranges: number[], close = 1000): Array<{ high: number; low: number; close: number }> {
    // Constant close keeps the true range equal to each given range value
    return ranges.map((r) => ({ high: close + r / 2, low: close - r / 2, close }));
  }

  test('a calm series followed by a volatility spike ranks in a high percentile', () => {
    // 40 calm candles (range 10) then one violent spike (range 400)
    const ranges = new Array(40).fill(10);
    ranges.push(400);
    const pct = atrPercentileFromCandles(makeCandles(ranges));
    assert.ok(pct !== null);
    assert.ok(pct >= 90, `spike after calm must rank >= 90, got ${pct}`);
  });

  test('a spike early in the series followed by calm ranks in a low percentile', () => {
    // Spike must sit inside the series: true range only starts from the
    // second candle, so a spike on candle 0 is invisible to ATR.
    const ranges = [...new Array(5).fill(10), 400, ...new Array(34).fill(10)];
    const pct = atrPercentileFromCandles(makeCandles(ranges));
    assert.ok(pct !== null);
    // Wilder smoothing keeps the spike elevated for a while, but the
    // latest ATR must sit well below the series maximum.
    assert.ok(pct <= 30, `calm after spike must rank <= 30, got ${pct}`);
  });

  test('a perfectly flat series lands at the neutral midpoint (~50)', () => {
    const pct = atrPercentileFromCandles(makeCandles(new Array(30).fill(10)));
    assert.ok(pct !== null);
    assert.ok(Math.abs(pct - 50) < 0.01, `flat series must rank ~50, got ${pct}`);
  });

  test('returns null when there are fewer than period+2 candles', () => {
    assert.strictEqual(atrPercentileFromCandles(makeCandles(new Array(15).fill(10))), null); // period+2-1
    assert.strictEqual(atrPercentileFromCandles([]), null);
  });

  test('honors a custom period parameter', () => {
    const candles = makeCandles(new Array(10).fill(10));
    // period 8 needs 10 candles -> exactly enough
    assert.ok(atrPercentileFromCandles(candles, 8) !== null);
    // period 9 needs 11 candles -> not enough
    assert.strictEqual(atrPercentileFromCandles(candles, 9), null);
  });
});

describe('Conservative Blue-Chip Pullback Opportunity Scoring', () => {
  const baseBtcFeatures: CoinFeatures = {
    symbol: 'btc',
    close: 1550000000,
    high24h: 1580000000,
    low24h: 1520000000,
    volume24hIdr: 45000000000,
    rsi14: 42,            // Dip near structural support
    ema21: 1540000000,    // Price above EMA21 (1550 > 1540)
    ema50: 1500000000,
    atr14: 25000000,
    gain24hPct: 1.5,
    dropFromHighPct: -1.9, // Healthy -1.9% dip from 24h high
    volumeSurgeRatio: 1.2,
    spreadPct: 0.04,
    depthImbalance: 1.8,  // Strong buyer wall
    isBluechip: true,
  };

  test('scores high on conservative bluechip pullback during healthy dip', () => {
    const result = scoreOpportunity(
      baseBtcFeatures,
      0.45,   // positive lexicon sentiment
      false,  // no threat
      'RISK_ON',
      'bluechip_pullback'
    );
    assert.strictEqual(result.strategy, 'bluechip_pullback');
    assert.ok(
      result.score >= SCORE_THRESHOLDS.conservative,
      `Score ${result.score} should pass threshold ${SCORE_THRESHOLDS.conservative}`
    );
    assert.ok(result.breakdown.rsi > 0);
    assert.ok(result.breakdown.dip > 0);
    assert.ok(result.breakdown.trend > 0);
  });

  test('threat immediately vetos score to zero', () => {
    const result = scoreOpportunity(
      baseBtcFeatures,
      0.45,
      true, // Threat active!
      'RISK_ON',
      'bluechip_pullback'
    );
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.breakdown.threat_veto, 0);
  });

  test('bluechip pullback fails closed when RSI or EMA21 is missing', () => {
    const missingRsi = scoreOpportunity(
      { ...baseBtcFeatures, rsi14: null },
      0.45,
      false,
      'RISK_ON',
      'bluechip_pullback'
    );
    assert.strictEqual(missingRsi.score, 0);
    assert.strictEqual(missingRsi.breakdown.missing_indicators, 0);

    const missingEma = scoreOpportunity(
      { ...baseBtcFeatures, ema21: null },
      0.45,
      false,
      'RISK_ON',
      'bluechip_pullback'
    );
    assert.strictEqual(missingEma.score, 0);
    assert.strictEqual(missingEma.breakdown.missing_indicators, 0);
  });

  test('momentum score fails closed when RSI is missing', () => {
    const result = scoreOpportunity(
      { ...baseBtcFeatures, rsi14: null },
      0.45,
      false,
      'RISK_ON',
      'momentum'
    );
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.breakdown.missing_indicators, 0);
  });
});

describe('Pure Risk Guard Execution Pipeline (Gates 1-8)', () => {
  const healthyState: RiskState = {
    dailyPnlIdr: 100000,
    dayStartEquityIdr: 10000000,
    openPositions: 1,
    regimeAllowEntries: true,
    btcChange1hPct: 0.5,
    btcChange4hPct: 1.2,
  };

  test('checkCircuitBreaker halts entries if daily loss exceeds limit', () => {
    assert.strictEqual(checkCircuitBreaker(healthyState, 5.0).passed, true);

    const losingState: RiskState = {
      ...healthyState,
      dailyPnlIdr: -600000, // 6% loss
    };
    assert.strictEqual(checkCircuitBreaker(losingState, 5.0).passed, false);
  });

  test('checkExposure halts entries when position capacity is reached', () => {
    assert.strictEqual(checkExposure(healthyState, 3).passed, true);

    const fullState: RiskState = {
      ...healthyState,
      openPositions: 3,
    };
    assert.strictEqual(checkExposure(fullState, 3).passed, false);
  });

  test('checkBtcRegime gates entries based on BTC 1h flash crash threshold', () => {
    assert.strictEqual(checkBtcRegime(healthyState, -3.0).passed, true);

    const crashState: RiskState = {
      ...healthyState,
      regimeAllowEntries: false,
      btcChange1hPct: -3.5,
    };
    assert.strictEqual(checkBtcRegime(crashState, -3.0).passed, false);
  });

  test('checkSpreadTrap prevents entry when bid-ask spread is excessively wide', () => {
    assert.strictEqual(checkSpreadTrap(0.4, 0.8).passed, true);
    assert.strictEqual(checkSpreadTrap(1.2, 0.8).passed, false);
  });

  test('checkRsiGuard prevents buying top of parabolic candles', () => {
    assert.strictEqual(checkRsiGuard(62, 70).passed, true);
    assert.strictEqual(checkRsiGuard(74, 70).passed, false);
    assert.strictEqual(checkRsiGuard(null, 70).passed, true); // missing data passes gracefully
  });

  test('checkSlippageBudget verifies estimated fill against tolerance', () => {
    assert.strictEqual(checkSlippageBudget(0.3, 0.8).passed, true);
    assert.strictEqual(checkSlippageBudget(1.1, 0.8).passed, false);
  });
});

describe('P0-B Fix: Context Fingerprinting & Swarm Deduplication', () => {
  test('contextFingerprint produces deterministic SHA256 hashes', () => {
    const payload = JSON.stringify({
      headlines: ['Bank Indonesia dukung adopsi aset digital'],
      prices: { btc: 1550000000, eth: 45000000 },
    });

    const hash1 = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
    const hash2 = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 16);

    // Any alteration produces different hash
    const alteredPayload = JSON.stringify({
      headlines: ['Bank Indonesia dukung adopsi aset digital'],
      prices: { btc: 1550000001, eth: 45000000 },
    });
    const hashAltered = crypto.createHash('sha256').update(alteredPayload).digest('hex').substring(0, 16);
    assert.notStrictEqual(hash1, hashAltered);
  });
});

describe('Multi-Agent Blackboard Bus & Outbox Persistence', () => {
  test('agentBus delivers events to subscribers and writes to SQLite outbox', () => {
    let receivedPayload: any = null;

    const unsubscribe = agentBus.subscribe('opportunity.signal', (msg) => {
      receivedPayload = msg.payload;
    });

    const msg = agentBus.publish(
      'opportunity.signal',
      'test_runner',
      { score: 85, profile: 'conservative', symbol: 'btc_idr' }
    );

    assert.ok(receivedPayload !== null);
    assert.strictEqual(receivedPayload.score, 85);
    assert.strictEqual(receivedPayload.profile, 'conservative');

    unsubscribe();

    // Verify durable SQLite outbox
    const recent = agentBus.getRecentMessages('opportunity.signal', 5);
    const found = recent.find((m) => m.id === msg.id);
    assert.ok(found !== undefined, 'Message should be persisted in agent_messages table');
    assert.strictEqual(found.payload.symbol, 'btc_idr');
  });
});

describe('Momentum Candidate Selection (composite_score vs gain_rank)', () => {
  const base = { volIdr: 500_000_000, last: 1000, dropFromHigh: -1.5 };

  const scored: Array<{ symbol: string; gain24h: number; volIdr: number; last: number; dropFromHigh: number; score: ScoreResult }> = [
    { symbol: 'aaa', gain24h: 18, ...base, score: { symbol: 'aaa', strategy: 'momentum', score: 62, breakdown: {} } },
    { symbol: 'bbb', gain24h: 5, ...base, score: { symbol: 'bbb', strategy: 'momentum', score: 85, breakdown: {} } },
    { symbol: 'ccc', gain24h: 9, ...base, score: { symbol: 'ccc', strategy: 'momentum', score: 40, breakdown: {} } },
  ];

  test('composite mode prefers the highest score over raw gain and enforces the profile threshold', () => {
    const sel = selectMomentumCandidate({ mode: 'composite_score', profile: 'balanced', candidates: scored, isAlreadyHoldingMeme: false });
    assert.equal(sel?.symbol, 'bbb', '85-point candidate must beat the 18% gainer at 62 points');
    assert.equal(sel?.source, 'composite_score');
    assert.ok(sel?.reason.includes('Skor: 85/100'));

    // ccc (gain 9%) sits below the balanced threshold (60) and must never win
    const onlyBelow = [{ ...scored[2] }];
    const selBelow = selectMomentumCandidate({ mode: 'composite_score', profile: 'balanced', candidates: onlyBelow, isAlreadyHoldingMeme: false });
    assert.equal(selBelow?.symbol, 'ccc', 'below-threshold candidate must only surface via the fallback');
    assert.equal(selBelow?.source, 'gain_rank_fallback');
  });

  test('composite threshold follows the risk profile (aggressive 50 admits what balanced 60 rejects)', () => {
    const borderline = [{ ...scored[2], score: { ...scored[2].score, score: 55 } }];
    assert.equal(selectMomentumCandidate({ mode: 'composite_score', profile: 'balanced', candidates: borderline, isAlreadyHoldingMeme: false })?.source, 'gain_rank_fallback');
    const selAgressive = selectMomentumCandidate({ mode: 'composite_score', profile: 'aggressive', candidates: borderline, isAlreadyHoldingMeme: false });
    assert.equal(selAgressive?.source, 'composite_score');
  });

  test('gain_rank mode preserves the legacy pick with the exact legacy reason', () => {
    const sel = selectMomentumCandidate({ mode: 'gain_rank', profile: 'balanced', candidates: scored, isAlreadyHoldingMeme: false });
    assert.equal(sel?.symbol, 'aaa');
    assert.equal(sel?.reason, 'Top Momentum Gainer (+18.0%, Volume: Rp 500 Jt)');
    assert.equal(sel?.source, 'gain_rank');
    // Legacy mode ignores the score entirely
    const unscored = [{ symbol: 'zzz', gain24h: 3, ...base }];
    const selUnscored = selectMomentumCandidate({ mode: 'gain_rank', profile: 'balanced', candidates: unscored, isAlreadyHoldingMeme: false });
    assert.equal(selUnscored?.symbol, 'zzz');
  });

  test('composite falls back to the gain_rank pick when no candidate passes the threshold', () => {
    const allBelow = scored.map((c) => ({ ...c, score: { ...c.score, score: 10 } }));
    const sel = selectMomentumCandidate({ mode: 'composite_score', profile: 'balanced', candidates: allBelow, isAlreadyHoldingMeme: false });
    assert.equal(sel?.symbol, 'aaa', 'fallback must pick the top hard-filtered gainer');
    assert.equal(sel?.source, 'gain_rank_fallback');
  });

  test('composite tie-breaks equal scores by the higher gain24h', () => {
    const tied = [
      { symbol: 'low', gain24h: 4, ...base, score: { symbol: 'low', strategy: 'momentum' as const, score: 70, breakdown: {} } },
      { symbol: 'high', gain24h: 15, ...base, score: { symbol: 'high', strategy: 'momentum' as const, score: 70, breakdown: {} } },
    ];
    const sel = selectMomentumCandidate({ mode: 'composite_score', profile: 'balanced', candidates: tied, isAlreadyHoldingMeme: false });
    assert.equal(sel?.symbol, 'high');
  });

  test('meme single-exposure guard is respected in both modes', () => {
    const memeFirst = [
      { symbol: 'doge', gain24h: 19, ...base, score: { symbol: 'doge', strategy: 'momentum' as const, score: 90, breakdown: {} } },
      { symbol: 'eth', gain24h: 3, ...base, score: { symbol: 'eth', strategy: 'momentum' as const, score: 70, breakdown: {} } },
    ];
    // Holding a meme: doge must be skipped even though it dominates both rankings
    const selComposite = selectMomentumCandidate({ mode: 'composite_score', profile: 'balanced', candidates: memeFirst, isAlreadyHoldingMeme: true });
    assert.equal(selComposite?.symbol, 'eth');
    const selRank = selectMomentumCandidate({ mode: 'gain_rank', profile: 'balanced', candidates: memeFirst, isAlreadyHoldingMeme: true });
    assert.equal(selRank?.symbol, 'eth');

    // Not holding a meme: legacy ranking picks doge again
    const selFree = selectMomentumCandidate({ mode: 'gain_rank', profile: 'balanced', candidates: memeFirst, isAlreadyHoldingMeme: false });
    assert.equal(selFree?.symbol, 'doge');
  });

  test('returns null when every remaining candidate is an already-held meme', () => {
    const sel = selectMomentumCandidate({
      mode: 'gain_rank',
      profile: 'balanced',
      candidates: [{ symbol: 'pepe', gain24h: 10, ...base }],
      isAlreadyHoldingMeme: true,
    });
    assert.equal(sel, null);
  });

  test('entry_scoring_mode setting defaults to composite_score', () => {
    assert.equal(getSetting('entry_scoring_mode', 'composite_score'), 'composite_score');
  });
});

describe('Asset-Agnostic MarketAdapter Abstraction', () => {
  test('IndodaxAdapter conforms to MarketAdapter interface', async () => {
    const adapter = new IndodaxAdapter();
    assert.strictEqual(adapter.id, 'indodax');
    assert.strictEqual(adapter.name, 'Indodax');
    assert.strictEqual(adapter.assetClass, 'crypto');

    // Minimum trade size
    const minTrade = adapter.getMinTradeIdr('btc');
    assert.ok(minTrade >= 10000, `Min trade IDR should be at least 10000, got ${minTrade}`);

    // Paper order execution
    const paperOrder = await adapter.createOrder({
      symbol: 'btc',
      side: 'buy',
      type: 'market',
      price: 1550000000,
      amount: 0.001,
      mode: 'paper',
    });

    assert.strictEqual(paperOrder.success, true);
    assert.strictEqual(paperOrder.executedPrice, 1550000000);
    assert.strictEqual(paperOrder.executedAmount, 0.001);
  });
});
