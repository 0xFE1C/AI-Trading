import { describe, test, expect } from 'vitest';
import { computeReadiness, MIN_TRADES_FOR_LIVE } from './readiness';
import { PerformanceReport } from '../types';

// Minimal valid report factory — every field that computeReadiness reads can
// be overridden per scenario so the table stays readable.
function makeReport(overrides: Partial<PerformanceReport> = {}): PerformanceReport {
  return {
    periodLabel: 'all',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    currentMode: 'paper',
    totalTrades: 30,
    winningTrades: 15,
    losingTrades: 15,
    breakevenTrades: 0,
    winRatePercent: 50,
    totalVolumeIdr: 10000000,
    grossProfitIdr: 1000000,
    grossLossIdr: 500000,
    netPnlIdr: 500000,
    netPnlPercent: 5,
    profitFactor: 2.0,
    maxDrawdownPercent: 10,
    maxDrawdownIdr: 100000,
    avgHoldDurationMinutes: 120,
    bestTrade: null,
    worstTrade: null,
    coinBreakdown: [],
    aiEfficacy: {
      evaluationsCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      bulletsDodged: 0,
      savedCapitalIdr: 0,
      opportunitiesMissed: 0,
      missedProfitIdr: 0,
    },
    lessonsLearned: [],
    tradesList: [],
    ...overrides,
  };
}

const itemByKey = (result: ReturnType<typeof computeReadiness>, key: string) =>
  result.items.find((i) => i.key === key);

describe('computeReadiness', () => {
  test('null report → score 0, tier belum, all criteria failing with placeholders', () => {
    const result = computeReadiness(null, 'paper');

    expect(result.score).toBe(0);
    expect(result.tier).toBe('belum');
    expect(result.items).toHaveLength(5);
    expect(result.items.every((i) => !i.ok)).toBe(true);
    expect(itemByKey(result, 'trades')?.detail).toBe(`0/${MIN_TRADES_FOR_LIVE}`);
    expect(itemByKey(result, 'winRate')?.detail).toBe('—');
  });

  test('empty report object (0 trades, no history) → belum; only the drawdown rule trivially passes at 0%', () => {
    // Fresh-install backend response: everything zeroed, no profit factor.
    const result = computeReadiness(
      makeReport({ totalTrades: 0, winRatePercent: 0, netPnlIdr: 0, maxDrawdownPercent: 0, profitFactor: 0 }),
      'paper'
    );

    // The card layer shows its own onboarding state for zero-trade reports,
    // so this score never reaches beginners as a misleading number.
    expect(result.score).toBe(20); // drawdown 0% <= 15% technically passes
    expect(result.tier).toBe('belum');
    expect(itemByKey(result, 'trades')?.ok).toBe(false);
    expect(itemByKey(result, 'netPnl')?.ok).toBe(false);
    expect(itemByKey(result, 'drawdown')?.ok).toBe(true);
  });

  test('strong report (all criteria pass) → score 100, tier siap', () => {
    const result = computeReadiness(
      makeReport({
        totalTrades: 45,
        winRatePercent: 82.14,
        netPnlIdr: 3510000,
        maxDrawdownPercent: 2.45,
        profitFactor: 6.75,
      }),
      'paper'
    );

    expect(result.score).toBe(100);
    expect(result.tier).toBe('siap');
    expect(result.items.every((i) => i.ok)).toBe(true);
    expect(itemByKey(result, 'trades')?.detail).toBe('45/20');
    expect(itemByKey(result, 'profitFactor')?.detail).toBe('6.75');
  });

  test.each([
    {
      name: 'exactly 20 trades is a pass, 19 is not (boundary)',
      overrides: { totalTrades: 20 },
      key: 'trades',
      expected: true,
    },
    {
      name: '19 closed trades fails the trades criterion (boundary)',
      overrides: { totalTrades: 19 },
      key: 'trades',
      expected: false,
    },
    {
      name: 'winRate exactly 45% is a pass',
      overrides: { winRatePercent: 45 },
      key: 'winRate',
      expected: true,
    },
    {
      name: 'winRate 44.9% is a fail',
      overrides: { winRatePercent: 44.9 },
      key: 'winRate',
      expected: false,
    },
    {
      name: 'drawdown exactly 15% is a pass',
      overrides: { maxDrawdownPercent: 15 },
      key: 'drawdown',
      expected: true,
    },
    {
      name: 'drawdown 15.1% is a fail',
      overrides: { maxDrawdownPercent: 15.1 },
      key: 'drawdown',
      expected: false,
    },
    {
      name: 'profitFactor exactly 1.2 is a pass',
      overrides: { profitFactor: 1.2 },
      key: 'profitFactor',
      expected: true,
    },
    {
      name: 'profitFactor 1.19 is a fail',
      overrides: { profitFactor: 1.19 },
      key: 'profitFactor',
      expected: false,
    },
  ])('$name', ({ overrides, key, expected }) => {
    const result = computeReadiness(makeReport(overrides), 'paper');
    expect(itemByKey(result, key)?.ok).toBe(expected);
  });

  test('netPnl = 0 fails, negative fails, positive passes', () => {
    expect(itemByKey(computeReadiness(makeReport({ netPnlIdr: 0 }), 'paper'), 'netPnl')?.ok).toBe(false);
    expect(itemByKey(computeReadiness(makeReport({ netPnlIdr: -1 }), 'paper'), 'netPnl')?.ok).toBe(false);
    expect(itemByKey(computeReadiness(makeReport({ netPnlIdr: 1 }), 'paper'), 'netPnl')?.ok).toBe(true);
  });

  test('null profitFactor is treated as pass only with zero gross losses AND positive net PnL', () => {
    const cleanBook = computeReadiness(
      makeReport({ profitFactor: null, grossLossIdr: 0, netPnlIdr: 250000 }),
      'paper'
    );
    expect(itemByKey(cleanBook, 'profitFactor')?.ok).toBe(true);
    expect(itemByKey(cleanBook, 'profitFactor')?.detail).toBe('—');

    const nullFactorWithLosses = computeReadiness(
      makeReport({ profitFactor: null, grossLossIdr: 900000, netPnlIdr: 250000 }),
      'paper'
    );
    expect(itemByKey(nullFactorWithLosses, 'profitFactor')?.ok).toBe(false);

    const nullFactorNoProfit = computeReadiness(
      makeReport({ profitFactor: null, grossLossIdr: 0, netPnlIdr: 0 }),
      'paper'
    );
    expect(itemByKey(nullFactorNoProfit, 'profitFactor')?.ok).toBe(false);
  });

  test('borderline report with exactly 3 of 5 criteria → score 60, tier hampir', () => {
    // Passes: trades(20), winRate(47), netPnl>0. Fails: drawdown 22%, pf 0.9.
    const result = computeReadiness(
      makeReport({
        totalTrades: 20,
        winRatePercent: 47,
        netPnlIdr: 100000,
        maxDrawdownPercent: 22,
        profitFactor: 0.9,
      }),
      'paper'
    );

    expect(result.score).toBe(60);
    expect(result.tier).toBe('hampir');
  });

  test('2 of 5 criteria → score 40 (hampir), 1 of 5 → score 20 (belum)', () => {
    // Passes: trades(25) + drawdown(12%). Fails: winRate, netPnl, profitFactor.
    const twoOfFive = computeReadiness(
      makeReport({
        totalTrades: 25,
        winRatePercent: 30,
        netPnlIdr: -50000,
        maxDrawdownPercent: 12,
        profitFactor: 0.5,
      }),
      'paper'
    );
    expect(twoOfFive.score).toBe(40);
    expect(twoOfFive.tier).toBe('hampir');

    const oneOfFive = computeReadiness(
      makeReport({
        totalTrades: 25,
        winRatePercent: 10,
        netPnlIdr: -50000,
        maxDrawdownPercent: 30,
        profitFactor: 0.5,
      }),
      'paper'
    );
    expect(oneOfFive.score).toBe(20);
    expect(oneOfFive.tier).toBe('belum');
  });

  test('live mode is neutral: empty items, no score', () => {
    const result = computeReadiness(makeReport({ totalTrades: 45, winRatePercent: 90 }), 'live');

    expect(result.items).toHaveLength(0);
    expect(result.score).toBe(0);
    expect(result.tier).toBe('belum');
  });

  test('missing fields are tolerated (partial report object)', () => {
    const partial = { totalTrades: 22, winRatePercent: 50 } as unknown as PerformanceReport;
    const result = computeReadiness(partial, 'paper');

    expect(itemByKey(result, 'trades')?.ok).toBe(true);
    expect(itemByKey(result, 'winRate')?.ok).toBe(true);
    // Everything absent is treated as 0/null → fail.
    expect(itemByKey(result, 'netPnl')?.ok).toBe(false);
    expect(itemByKey(result, 'drawdown')?.ok).toBe(true); // 0 <= 15
    expect(itemByKey(result, 'profitFactor')?.ok).toBe(false); // null + netPnl 0
    expect(result.score).toBe(60);
    expect(result.tier).toBe('hampir');
  });
});
