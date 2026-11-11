import { describe, test, expect } from 'vitest';
import { strategyKey, strategyLabel, strategyBadgeClass, formatClientExitPlanLine } from './strategy';

describe('strategy helpers (including volatility_squeeze)', () => {
  const lEn = (en: string, _id: string) => en;
  const lId = (_en: string, id: string) => id;

  test('recognizes volatility_squeeze alongside existing entry strategies', () => {
    expect(strategyKey('volatility_squeeze')).toBe('volatility_squeeze');
    expect(strategyLabel('volatility_squeeze', lEn)).toBe('Volatility Squeeze');
    expect(strategyLabel('volatility_squeeze', lId)).toBe('Squeeze Breakout');
    expect(strategyBadgeClass('volatility_squeeze')).toContain('emerald');
  });

  test('falls back safely to unknown for null/unrecognized strategies', () => {
    expect(strategyKey(null)).toBe('unknown');
    expect(strategyKey('random_algo')).toBe('unknown');
  });

  test('formatClientExitPlanLine formats valid adaptive JSON and rejects corrupt strings', () => {
    const valid = JSON.stringify({ tp1Pct: 7.5, tp2Pct: 15, trailingPct: 3.2, legacy: false });
    expect(formatClientExitPlanLine(valid)).toBe('TP1 7.5% · TP2 15% · Trail 3.2% · adaptif');
    expect(formatClientExitPlanLine('not-json')).toBeNull();
  });
});
