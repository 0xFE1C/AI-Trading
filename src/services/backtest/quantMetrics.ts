/**
 * Institutional Quantitative Performance Metrics & Monte Carlo Bootstrap Engine
 * 100% Deterministic, Zero External Dependencies, Seeded PRNG (Mulberry32) for Reproducibility.
 *
 * Computes:
 *  - Risk-Adjusted Ratios: Annualized Sharpe, Sortino (downside deviation only), Calmar, Ulcer Index
 *  - Trade Distribution Quality: Van Tharp's System Quality Number (SQN), Payoff Ratio (AvgWin/AvgLoss),
 *    Expectancy (% and IDR per trade), Kelly Criterion Fraction, Max Consecutive Wins & Losses
 *  - Monte Carlo Bootstrap Stress-Tester (1,000+ resampled trade paths with replacement):
 *    Median / P5 / P95 Terminal Equity, P95 Worst-Case Drawdown, 95% Value-at-Risk (VaR),
 *    95% Conditional Tail VaR (CVaR / Expected Shortfall), and Probability of Ruin / Drawdown Breach.
 */

export interface QuantTradeSample {
  pnlIdr: number;
  pnlPercent: number;
}

export interface InstitutionalQuantMetrics {
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  calmarRatio: number | null;
  sqn: number | null;              // Van Tharp System Quality Number: sqrt(N) * mean(R) / stdDev(R)
  sqnRating: 'INSUFFICIENT_DATA' | 'POOR' | 'AVERAGE' | 'GOOD' | 'EXCELLENT' | 'HOLY_GRAIL';
  expectancyIdr: number;           // Expected net IDR gained per trade
  expectancyPercent: number;       // Expected % return per trade
  payoffRatio: number | null;      // Avg winning % / |Avg losing %|
  avgWinIdr: number;
  avgLossIdr: number;
  avgWinPercent: number;
  avgLossPercent: number;
  kellyPercent: number;            // Optimal Kelly % (clamped 0..100 for display)
  ulcerIndex: number;              // Root-mean-square drawdown depth (pain index)
  recoveryFactor: number | null;   // Net Profit / Max Drawdown
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

export interface MonteCarloParams {
  trades: QuantTradeSample[];
  initialCapitalIdr: number;
  iterations?: number;        // default 1000, max 5000
  horizonTrades?: number;     // default = trades.length (min 10)
  ruinDrawdownPercent?: number; // default 20% drawdown threshold considered "ruin / kill-switch"
  seed?: number;              // default 42 for reproducible auditability
}

export interface MonteCarloResult {
  iterations: number;
  horizonTrades: number;
  sampleTradesCount: number;
  initialCapitalIdr: number;
  ruinThresholdPercent: number;
  terminalEquity: {
    p5: number;     // 5th percentile (95% worst-case terminal capital)
    p25: number;
    median: number; // 50th percentile expected path
    p75: number;
    p95: number;    // 95th percentile upside path
    mean: number;
  };
  netReturnPercent: {
    p5: number;
    median: number;
    p95: number;
  };
  maxDrawdownPercent: {
    median: number;
    p90: number;
    p95: number;    // 95% confidence worst-case max drawdown
    p99: number;
  };
  var95Percent: number;             // 95% Value-at-Risk (% loss from initial capital, >= 0)
  cvar95Percent: number;            // 95% Expected Shortfall / Tail Risk (% loss in worst 5% paths)
  probabilityOfProfitPercent: number; // % of simulated paths ending above initialCapitalIdr
  probabilityOfRuinPercent: number;   // % of paths breaching ruinDrawdownPercent
  fanChart: Array<{
    step: number;
    p5: number;
    p25: number;
    median: number;
    p75: number;
    p95: number;
  }>;
  verdict: 'INSTITUTIONAL_GRADE' | 'ROBUST' | 'FRAGILE' | 'HIGH_RUIN_RISK' | 'INSUFFICIENT_TRADES';
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Deterministic fast 32-bit PRNG (Mulberry32) so identical trade histories yield identical stress reports. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (p <= 0) return sortedAsc[0];
  if (p >= 100) return sortedAsc[sortedAsc.length - 1];
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

function classifySqn(sqn: number | null, tradesCount: number): InstitutionalQuantMetrics['sqnRating'] {
  if (sqn === null || tradesCount < 5) return 'INSUFFICIENT_DATA';
  if (sqn >= 5.0) return 'HOLY_GRAIL';
  if (sqn >= 3.0) return 'EXCELLENT';
  if (sqn >= 2.0) return 'GOOD';
  if (sqn >= 1.2) return 'AVERAGE';
  return 'POOR';
}

/**
 * Computes institutional quantitative performance & risk-adjusted metrics
 * from a chronological list of closed trades and optional equity curve.
 */
export function computeInstitutionalMetrics(args: {
  trades: QuantTradeSample[];
  initialCapitalIdr: number;
  effectiveDays?: number;
  maxDrawdownPercent?: number;
  equityCurve?: Array<{ equity: number }>;
}): InstitutionalQuantMetrics {
  const trades = args.trades || [];
  const n = trades.length;
  const initialCapital = Math.max(1, Number(args.initialCapitalIdr) || 10_000_000);
  const effectiveDays = Math.max(1, Number(args.effectiveDays) || 30);

  if (n === 0) {
    return {
      sharpeRatio: null,
      sortinoRatio: null,
      calmarRatio: null,
      sqn: null,
      sqnRating: 'INSUFFICIENT_DATA',
      expectancyIdr: 0,
      expectancyPercent: 0,
      payoffRatio: null,
      avgWinIdr: 0,
      avgLossIdr: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      kellyPercent: 0,
      ulcerIndex: 0,
      recoveryFactor: null,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
    };
  }

  const wins = trades.filter((t) => t.pnlIdr > 0);
  const losses = trades.filter((t) => t.pnlIdr < 0);

  const avgWinIdr = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlIdr, 0) / wins.length : 0;
  const avgLossIdr = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlIdr, 0) / losses.length) : 0;
  const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
  const avgLossPct = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length) : 0;

  const totalNetIdr = trades.reduce((s, t) => s + t.pnlIdr, 0);
  const expectancyIdr = totalNetIdr / n;
  const expectancyPct = trades.reduce((s, t) => s + t.pnlPercent, 0) / n;

  const payoffRatio = avgLossPct > 0 ? round2(avgWinPct / avgLossPct) : avgWinPct > 0 ? null : 0;

  // Kelly Criterion %
  const winProb = wins.length / n;
  let kellyPct = 0;
  if (avgLossPct > 0 && avgWinPct > 0) {
    const r = avgWinPct / avgLossPct;
    kellyPct = Math.max(0, Math.min(100, (winProb - (1 - winProb) / r) * 100));
  } else if (wins.length > 0 && losses.length === 0) {
    kellyPct = 25;
  }

  // Consecutive win/loss streaks
  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let curWins = 0;
  let curLosses = 0;
  for (const t of trades) {
    if (t.pnlIdr > 0) {
      curWins++;
      curLosses = 0;
      if (curWins > maxConsecWins) maxConsecWins = curWins;
    } else if (t.pnlIdr < 0) {
      curLosses++;
      curWins = 0;
      if (curLosses > maxConsecLosses) maxConsecLosses = curLosses;
    } else {
      curWins = 0;
      curLosses = 0;
    }
  }

  // Per-trade portfolio return series (pnlIdr / running equity) for Sharpe, Sortino, Ulcer Index
  const portfolioReturns: number[] = [];
  const drawdownSqSeries: number[] = [];
  let runningEq = initialCapital;
  let peakEq = initialCapital;
  let computedMaxDdPct = 0;

  for (const t of trades) {
    const baseEq = Math.max(1, runningEq);
    const ret = t.pnlIdr / baseEq;
    portfolioReturns.push(ret);
    runningEq += t.pnlIdr;
    if (runningEq > peakEq) peakEq = runningEq;
    const ddPct = peakEq > 0 ? ((peakEq - runningEq) / peakEq) * 100 : 0;
    if (ddPct > computedMaxDdPct) computedMaxDdPct = ddPct;
    drawdownSqSeries.push(ddPct * ddPct);
  }

  // If high-resolution equityCurve is supplied, compute Ulcer Index from it
  let ulcerIndex = 0;
  if (args.equityCurve && args.equityCurve.length >= 2) {
    let curvePeak = initialCapital;
    let sumSq = 0;
    for (const pt of args.equityCurve) {
      if (pt.equity > curvePeak) curvePeak = pt.equity;
      const dd = curvePeak > 0 ? ((curvePeak - pt.equity) / curvePeak) * 100 : 0;
      sumSq += dd * dd;
    }
    ulcerIndex = round2(Math.sqrt(sumSq / args.equityCurve.length));
  } else if (drawdownSqSeries.length > 0) {
    ulcerIndex = round2(Math.sqrt(drawdownSqSeries.reduce((a, b) => a + b, 0) / drawdownSqSeries.length));
  }

  const maxDdPct =
    typeof args.maxDrawdownPercent === 'number' && args.maxDrawdownPercent > 0
      ? args.maxDrawdownPercent
      : computedMaxDdPct;

  // Sharpe, Sortino & SQN require >= 3 trades for meaningful sample variance
  let sharpeRatio: number | null = null;
  let sortinoRatio: number | null = null;
  let sqn: number | null = null;

  if (n >= 3) {
    const meanRet = portfolioReturns.reduce((a, b) => a + b, 0) / n;
    const variance = portfolioReturns.reduce((acc, r) => acc + Math.pow(r - meanRet, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);

    // Annualization factor based on observed trade frequency over effectiveDays (crypto trades 365d/yr)
    const tradesPerYear = Math.max(1, (n / effectiveDays) * 365);
    const annualFactor = Math.sqrt(Math.min(tradesPerYear, 365 * 24));

    if (stdDev > 1e-9) {
      sharpeRatio = round2((meanRet / stdDev) * annualFactor);
    }

    // Downside deviation (MAR = 0)
    const downsideSq = portfolioReturns.reduce((acc, r) => acc + (r < 0 ? r * r : 0), 0) / n;
    const downsideDev = Math.sqrt(downsideSq);
    if (downsideDev > 1e-9) {
      sortinoRatio = round2((meanRet / downsideDev) * annualFactor);
    } else if (meanRet > 0) {
      sortinoRatio = sharpeRatio !== null ? round2(Math.max(sharpeRatio * 1.5, 3.0)) : 3.0;
    }

    // SQN over trade % returns (capped sqrt(N) at sqrt(100) per Van Tharp convention so N=500 doesn't inflate SQN)
    const pctReturns = trades.map((t) => t.pnlPercent);
    const meanPct = pctReturns.reduce((a, b) => a + b, 0) / n;
    const pctVar = pctReturns.reduce((acc, p) => acc + Math.pow(p - meanPct, 2), 0) / (n - 1);
    const pctStd = Math.sqrt(pctVar);
    if (pctStd > 1e-9) {
      const cappedRootN = Math.sqrt(Math.min(n, 100));
      sqn = round2((meanPct / pctStd) * cappedRootN);
    }
  }

  // Annualized return vs Max Drawdown for Calmar Ratio
  const totalReturnPct = (totalNetIdr / initialCapital) * 100;
  const annualizedReturnPct = totalReturnPct * (365 / Math.max(effectiveDays, 7));
  const calmarRatio = maxDdPct > 0.05 ? round2(annualizedReturnPct / maxDdPct) : null;
  const maxDdIdr = (maxDdPct / 100) * initialCapital;
  const recoveryFactor = maxDdIdr > 1 ? round2(totalNetIdr / maxDdIdr) : null;

  return {
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    sqn,
    sqnRating: classifySqn(sqn, n),
    expectancyIdr: Math.round(expectancyIdr),
    expectancyPercent: round2(expectancyPct),
    payoffRatio,
    avgWinIdr: Math.round(avgWinIdr),
    avgLossIdr: Math.round(avgLossIdr),
    avgWinPercent: round2(avgWinPct),
    avgLossPercent: round2(avgLossPct),
    kellyPercent: round2(kellyPct),
    ulcerIndex,
    recoveryFactor,
    maxConsecutiveWins: maxConsecWins,
    maxConsecutiveLosses: maxConsecLosses,
  };
}

/**
 * Runs a Monte Carlo Bootstrap Simulation by resampling historical trades with replacement.
 * Answers: "Even if the strategy was profitable historically, what happens if a cluster of
 * losing trades hits back-to-back? What is our 95% worst-case drawdown and ruin risk?"
 */
export function runMonteCarloSimulation(params: MonteCarloParams): MonteCarloResult {
  const trades = (params.trades || []).filter(
    (t) => Number.isFinite(t.pnlIdr) && Number.isFinite(t.pnlPercent)
  );
  const initialCapital = Math.max(10_000, Math.round(Number(params.initialCapitalIdr) || 10_000_000));
  const iterations = Math.max(100, Math.min(5000, Math.round(params.iterations || 1000)));
  const horizon = Math.max(5, Math.min(500, Math.round(params.horizonTrades || Math.max(trades.length, 20))));
  const ruinThreshold = Math.max(2, Math.min(95, Number(params.ruinDrawdownPercent) || 20));
  const rng = mulberry32(params.seed ?? 42);

  if (trades.length < 3) {
    return {
      iterations: 0,
      horizonTrades: 0,
      sampleTradesCount: trades.length,
      initialCapitalIdr: initialCapital,
      ruinThresholdPercent: ruinThreshold,
      terminalEquity: {
        p5: initialCapital,
        p25: initialCapital,
        median: initialCapital,
        p75: initialCapital,
        p95: initialCapital,
        mean: initialCapital,
      },
      netReturnPercent: { p5: 0, median: 0, p95: 0 },
      maxDrawdownPercent: { median: 0, p90: 0, p95: 0, p99: 0 },
      var95Percent: 0,
      cvar95Percent: 0,
      probabilityOfProfitPercent: 0,
      probabilityOfRuinPercent: 0,
      fanChart: [],
      verdict: 'INSUFFICIENT_TRADES',
    };
  }

  // Precompute each sample trade's fractional impact on account equity so compounding & drawdown scale realistically
  const tradeImpacts = trades.map((t) => {
    const frac = t.pnlIdr / initialCapital;
    return Math.max(-0.5, Math.min(2.0, frac));
  });

  const terminalEquities: number[] = [];
  const maxDrawdowns: number[] = [];
  let profitablePaths = 0;
  let ruinedPaths = 0;

  // Checkpoints for UI percentile fan chart (up to 20 steps)
  const fanStepStride = Math.max(1, Math.floor(horizon / 20));
  const checkpointIndices: number[] = [0];
  for (let s = fanStepStride; s < horizon; s += fanStepStride) {
    checkpointIndices.push(s);
  }
  if (checkpointIndices[checkpointIndices.length - 1] !== horizon) {
    checkpointIndices.push(horizon);
  }
  const fanBuckets: number[][] = checkpointIndices.map(() => []);

  for (let iter = 0; iter < iterations; iter++) {
    let eq = initialCapital;
    let peak = initialCapital;
    let maxDdPct = 0;
    let hitRuin = false;

    fanBuckets[0].push(eq);
    let nextCheckpointPtr = 1;

    for (let step = 1; step <= horizon; step++) {
      const idx = Math.floor(rng() * tradeImpacts.length);
      eq = Math.max(0, eq * (1 + tradeImpacts[idx]));
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
      if (dd > maxDdPct) maxDdPct = dd;
      if (dd >= ruinThreshold) hitRuin = true;

      if (nextCheckpointPtr < checkpointIndices.length && step === checkpointIndices[nextCheckpointPtr]) {
        fanBuckets[nextCheckpointPtr].push(eq);
        nextCheckpointPtr++;
      }
    }

    terminalEquities.push(eq);
    maxDrawdowns.push(maxDdPct);
    if (eq > initialCapital) profitablePaths++;
    if (hitRuin) ruinedPaths++;
  }

  const sortedEq = [...terminalEquities].sort((a, b) => a - b);
  const sortedDd = [...maxDrawdowns].sort((a, b) => a - b);

  const p5Eq = percentile(sortedEq, 5);
  const p25Eq = percentile(sortedEq, 25);
  const medianEq = percentile(sortedEq, 50);
  const p75Eq = percentile(sortedEq, 75);
  const p95Eq = percentile(sortedEq, 95);
  const meanEq = terminalEquities.reduce((a, b) => a + b, 0) / iterations;

  // VaR 95% & CVaR 95% (Expected Shortfall over worst 5% terminal paths)
  const var95LossPct = Math.max(0, ((initialCapital - p5Eq) / initialCapital) * 100);
  const tailCount = Math.max(1, Math.floor(iterations * 0.05));
  const tailMeanEq = sortedEq.slice(0, tailCount).reduce((a, b) => a + b, 0) / tailCount;
  const cvar95LossPct = Math.max(0, ((initialCapital - tailMeanEq) / initialCapital) * 100);

  const probProfit = round2((profitablePaths / iterations) * 100);
  const probRuin = round2((ruinedPaths / iterations) * 100);
  const p95Dd = round2(percentile(sortedDd, 95));

  const fanChart = checkpointIndices.map((step, idx) => {
    const sortedStep = [...fanBuckets[idx]].sort((a, b) => a - b);
    return {
      step,
      p5: Math.round(percentile(sortedStep, 5)),
      p25: Math.round(percentile(sortedStep, 25)),
      median: Math.round(percentile(sortedStep, 50)),
      p75: Math.round(percentile(sortedStep, 75)),
      p95: Math.round(percentile(sortedStep, 95)),
    };
  });

  let verdict: MonteCarloResult['verdict'] = 'ROBUST';
  if (probRuin >= 25 || medianEq < initialCapital) {
    verdict = 'HIGH_RUIN_RISK';
  } else if (probRuin >= 10 || probProfit < 60) {
    verdict = 'FRAGILE';
  } else if (probRuin <= 2 && probProfit >= 80 && p5Eq >= initialCapital * 0.95) {
    verdict = 'INSTITUTIONAL_GRADE';
  }

  return {
    iterations,
    horizonTrades: horizon,
    sampleTradesCount: trades.length,
    initialCapitalIdr: initialCapital,
    ruinThresholdPercent: ruinThreshold,
    terminalEquity: {
      p5: Math.round(p5Eq),
      p25: Math.round(p25Eq),
      median: Math.round(medianEq),
      p75: Math.round(p75Eq),
      p95: Math.round(p95Eq),
      mean: Math.round(meanEq),
    },
    netReturnPercent: {
      p5: round2(((p5Eq - initialCapital) / initialCapital) * 100),
      median: round2(((medianEq - initialCapital) / initialCapital) * 100),
      p95: round2(((p95Eq - initialCapital) / initialCapital) * 100),
    },
    maxDrawdownPercent: {
      median: round2(percentile(sortedDd, 50)),
      p90: round2(percentile(sortedDd, 90)),
      p95: p95Dd,
      p99: round2(percentile(sortedDd, 99)),
    },
    var95Percent: round2(var95LossPct),
    cvar95Percent: round2(cvar95LossPct),
    probabilityOfProfitPercent: probProfit,
    probabilityOfRuinPercent: probRuin,
    fanChart,
    verdict,
  };
}
