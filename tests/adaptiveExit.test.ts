import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  computeExitPlan,
  buildLegacyPlan,
  resolveEntryExitPlan,
  parseStoredExitPlan,
  formatExitPlanLine,
  formatStoredExitPlanLine,
  ExitPlanInput,
} from '../src/services/trading/adaptiveExit.js';

// Base input tanpa sinyal sama sekali (legacy murni)
const legacyInput: ExitPlanInput = {
  atrPct: null,
  regime: null,
  volumeSurgeRatio: null,
  depthImbalance: null,
  isBluechip: false,
  baseTp1Pct: 5.0,
  baseTp2Pct: 10.0,
  baseTrailingPct: 2.5,
};

describe('Adaptive Exit Engine — pure math (computeExitPlan)', () => {
  test('missing data returns EXACT legacy values with empty rationale and legacy flag', () => {
    const plan = computeExitPlan(legacyInput);
    assert.strictEqual(plan.tp1Pct, 5.0);
    assert.strictEqual(plan.tp2Pct, 10.0);
    assert.strictEqual(plan.trailingPct, 2.5);
    assert.strictEqual(plan.legacy, true);
    assert.deepStrictEqual(plan.rationale, []);
    assert.strictEqual(plan.atrPct, null);
    assert.strictEqual(plan.regime, null);
  });

  test('high ATR widens both TP and trailing (vol factor up to 2.0x)', () => {
    const plan = computeExitPlan({ ...legacyInput, atrPct: 6.0 });
    // volFactor = clamp(6/2, 0.7, 2) = 2 → tp1 = 5*2 = 10; trailing = min(clamp(2.5*2), 2*2.5) = 5
    assert.strictEqual(plan.tp1Pct, 10);
    assert.strictEqual(plan.tp2Pct, 20);
    assert.strictEqual(plan.trailingPct, 5);
    assert.strictEqual(plan.legacy, false);
    assert.ok(plan.rationale.some((r) => r.includes('ATR 6%') && r.includes('diperlebar')), plan.rationale.join(' | '));
  });

  test('low ATR tightens both TP and trailing (vol factor floor 0.7)', () => {
    const plan = computeExitPlan({ ...legacyInput, atrPct: 1.0 });
    // volFactor = clamp(0.5, 0.7, 2) = 0.7 → tp1 = 3.5; trailing = 2.5*0.7 = 1.75
    assert.strictEqual(plan.tp1Pct, 3.5);
    assert.strictEqual(plan.tp2Pct, 7);
    assert.strictEqual(plan.trailingPct, 1.75);
    assert.ok(plan.rationale.some((r) => r.includes('ATR 1%') && r.includes('dirapatkan')), plan.rationale.join(' | '));
  });

  test('non-positive / non-finite ATR behaves exactly like missing data', () => {
    for (const badAtr of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const plan = computeExitPlan({ ...legacyInput, atrPct: badAtr });
      assert.strictEqual(plan.tp1Pct, 5.0, `atrPct=${badAtr}`);
      assert.strictEqual(plan.trailingPct, 2.5, `atrPct=${badAtr}`);
    }
  });

  test('RISK_ON loosens targets (1.25x) and slightly widens trailing (1.15x)', () => {
    const plan = computeExitPlan({ ...legacyInput, regime: 'RISK_ON' });
    assert.strictEqual(plan.tp1Pct, 6.25);
    assert.strictEqual(plan.tp2Pct, 12.5);
    assert.strictEqual(plan.trailingPct, 2.88); // round2(2.5 * 1.15)
    assert.ok(plan.rationale.some((r) => r.includes('Regime RISK_ON') && r.includes('profit berlari')));
  });

  test('RISK_OFF accelerates targets (0.8x) and tightens trailing (0.85x)', () => {
    const plan = computeExitPlan({ ...legacyInput, regime: 'RISK_OFF' });
    assert.strictEqual(plan.tp1Pct, 4);
    assert.strictEqual(plan.trailingPct, 2.13); // round2(2.5 * 0.85)
    assert.ok(plan.rationale.some((r) => r.includes('Regime RISK_OFF')));
  });

  test('CRASH accelerates targets (0.7x) and tightens trailing hard (0.75x)', () => {
    const plan = computeExitPlan({ ...legacyInput, regime: 'CRASH' });
    assert.strictEqual(plan.tp1Pct, 3.5);
    assert.strictEqual(plan.trailingPct, 1.88); // round2(2.5 * 0.75)
    assert.ok(plan.rationale.some((r) => r.includes('Regime CRASH') && r.includes('dipercepat')));
  });

  test('momentum boost requires volume surge >= 1.5 AND depth imbalance >= 1.2', () => {
    const boosted = computeExitPlan({ ...legacyInput, atrPct: 2.0, regime: 'NEUTRAL', volumeSurgeRatio: 1.6, depthImbalance: 1.3 });
    assert.strictEqual(boosted.tp1Pct, 6); // 5 * 1.0 * 1.0 * 1.2
    assert.ok(boosted.rationale.some((r) => r.includes('Lonjakan volume + bid wall kuat')));

    // Surge tanpa bid wall → tanpa boost
    const noDepth = computeExitPlan({ ...legacyInput, atrPct: 2.0, volumeSurgeRatio: 1.6, depthImbalance: null });
    assert.strictEqual(noDepth.tp1Pct, 5);
    const weakDepth = computeExitPlan({ ...legacyInput, atrPct: 2.0, volumeSurgeRatio: 1.6, depthImbalance: 1.0 });
    assert.strictEqual(weakDepth.tp1Pct, 5);

    // Volume surut memangkas target 0.85x
    const weak = computeExitPlan({ ...legacyInput, atrPct: 2.0, volumeSurgeRatio: 0.5 });
    assert.strictEqual(weak.tp1Pct, 4.25);
    assert.ok(weak.rationale.some((r) => r.includes('Volume melemah')));
  });

  test('blue-chip stabilizer marginally tightens TP (0.97x) and trailing (0.95x)', () => {
    // ATR netral (volFactor 1.0) agar jalur adaptif aktif, bukan branch legacy
    const plan = computeExitPlan({ ...legacyInput, atrPct: 2.0, isBluechip: true });
    assert.strictEqual(plan.tp1Pct, 4.85); // round2(5 * 1.0 * 0.97)
    assert.strictEqual(plan.trailingPct, 2.38); // round2(2.5 * 1.0 * 0.95)
    assert.ok(plan.rationale.some((r) => r.includes('Blue-chip')));
  });

  test('hard clamps respected: TP1 capped at 25, TP2 at 50, trailing within 1..8', () => {
    const plan = computeExitPlan({
      ...legacyInput,
      atrPct: 100, // volFactor → 2 (cap)
      regime: 'RISK_ON',
      baseTp1Pct: 30,
      baseTp2Pct: 60,
      baseTrailingPct: 6,
    });
    // tp1 = clamp(round2(30*2*1.25), 2, 25) = 25
    assert.strictEqual(plan.tp1Pct, 25);
    // tp2 = clamp(round2(50), 4, 50) = 50
    assert.strictEqual(plan.tp2Pct, 50);
    // trailing = min(clamp(round2(6*2*1.15)=13.8 → 8), 6*2=12) = 8
    assert.strictEqual(plan.trailingPct, 8);
  });

  test('trailing NEVER exceeds 2x the user base even with maximal widening signals', () => {
    const plan = computeExitPlan({
      ...legacyInput,
      atrPct: 50, // volFactor 2
      regime: 'RISK_ON', // trail 1.15
      baseTrailingPct: 2.5,
    });
    // raw = 2.5 * 2 * 1.15 = 5.75 tapi cap 2x base = 5.0
    assert.strictEqual(plan.trailingPct, 5);
    assert.ok(plan.trailingPct <= 2 * 2.5);
  });

  test('baseTp2 <= 0 or null disables TP2 regardless of the adaptive factors', () => {
    assert.strictEqual(computeExitPlan({ ...legacyInput, baseTp2Pct: 0, atrPct: 4 }).tp2Pct, null);
    assert.strictEqual(computeExitPlan({ ...legacyInput, baseTp2Pct: -1, atrPct: 4 }).tp2Pct, null);
    assert.strictEqual(computeExitPlan({ ...legacyInput, baseTp2Pct: null, atrPct: 4 }).tp2Pct, null);
  });

  test('legacy flag requires BOTH atr and regime to be absent', () => {
    assert.strictEqual(computeExitPlan({ ...legacyInput, atrPct: null, regime: 'NEUTRAL' }).legacy, false);
    assert.strictEqual(computeExitPlan({ ...legacyInput, atrPct: 2, regime: null }).legacy, false);
    assert.strictEqual(computeExitPlan({ ...legacyInput, atrPct: null, regime: null }).legacy, true);
  });

  test('rationale is non-empty whenever an adaptive signal is present and neutral otherwise', () => {
    const neutral = computeExitPlan({ ...legacyInput, atrPct: 2, regime: 'NEUTRAL', volumeSurgeRatio: 1.0, depthImbalance: 1.0 });
    assert.deepStrictEqual(neutral.rationale, []);

    const adaptive = computeExitPlan({ ...legacyInput, atrPct: 4, regime: 'RISK_ON', volumeSurgeRatio: 2.0, depthImbalance: 1.5, isBluechip: true });
    assert.ok(adaptive.rationale.length >= 3);
  });

  test('sell fractions pass through clamped to 1..100 (defaults 50)', () => {
    const passthrough = computeExitPlan({ ...legacyInput, tp1SellFractionPct: 75, tp2SellFractionPct: 30 });
    assert.strictEqual(passthrough.tp1Fraction, 75);
    assert.strictEqual(passthrough.tp2Fraction, 30);

    const invalid = computeExitPlan({ ...legacyInput, tp1SellFractionPct: 500, tp2SellFractionPct: 0 });
    assert.strictEqual(invalid.tp1Fraction, 50);
    assert.strictEqual(invalid.tp2Fraction, 50);

    const defaults = computeExitPlan(legacyInput);
    assert.strictEqual(defaults.tp1Fraction, 50);
    assert.strictEqual(defaults.tp2Fraction, 50);
  });
});

describe('Adaptive Exit Engine — legacy fallback guarantee', () => {
  test('buildLegacyPlan returns EXACT user settings (no adaptive clamping)', () => {
    const plan = buildLegacyPlan({ baseTp1Pct: 5.0, baseTp2Pct: 10.0, baseTrailingPct: 2.5 });
    assert.deepStrictEqual(
      { tp1: plan.tp1Pct, tp2: plan.tp2Pct, trail: plan.trailingPct, legacy: plan.legacy, rationale: plan.rationale },
      { tp1: 5.0, tp2: 10.0, trail: 2.5, legacy: true, rationale: [] }
    );
  });

  test('resolveEntryExitPlan with adaptive disabled IGNORES all adaptive signals', () => {
    const plan = resolveEntryExitPlan({
      ...legacyInput,
      atrPct: 8,
      regime: 'RISK_ON',
      volumeSurgeRatio: 3,
      depthImbalance: 2,
      adaptiveEnabled: false,
    });
    assert.strictEqual(plan.tp1Pct, 5.0);
    assert.strictEqual(plan.tp2Pct, 10.0);
    assert.strictEqual(plan.trailingPct, 2.5);
    assert.strictEqual(plan.legacy, true);
  });

  test('resolveEntryExitPlan with adaptive enabled computes the adaptive plan', () => {
    const plan = resolveEntryExitPlan({ ...legacyInput, atrPct: 6, regime: 'RISK_ON', adaptiveEnabled: true });
    assert.strictEqual(plan.tp1Pct, 12.5);
    assert.strictEqual(plan.legacy, false);
  });
});

describe('Adaptive Exit Engine — defensive stored-plan parsing & formatting', () => {
  const sample: ExitPlanInput = { ...legacyInput, atrPct: 3, regime: 'RISK_ON' };

  test('valid stored JSON round-trips', () => {
    const plan = computeExitPlan(sample);
    const parsed = parseStoredExitPlan(JSON.stringify(plan));
    assert.ok(parsed);
    assert.strictEqual(parsed!.tp1Pct, plan.tp1Pct);
    assert.strictEqual(parsed!.tp2Pct, plan.tp2Pct);
    assert.strictEqual(parsed!.trailingPct, plan.trailingPct);
    assert.strictEqual(parsed!.legacy, plan.legacy);
  });

  test('missing, corrupt, or non-object JSON returns null (caller falls back to settings)', () => {
    assert.strictEqual(parseStoredExitPlan(null), null);
    assert.strictEqual(parseStoredExitPlan(undefined), null);
    assert.strictEqual(parseStoredExitPlan(''), null);
    assert.strictEqual(parseStoredExitPlan('{{{not json'), null);
    assert.strictEqual(parseStoredExitPlan('"just a string"'), null);
    assert.strictEqual(parseStoredExitPlan('[1,2,3]'), null);
    assert.strictEqual(parseStoredExitPlan('123'), null);
  });

  test('plans with unusable tp1/trailing numbers are rejected entirely', () => {
    assert.strictEqual(parseStoredExitPlan('{"tp1Pct": -3, "trailingPct": 2.5}'), null);
    assert.strictEqual(parseStoredExitPlan('{"tp1Pct": 5, "trailingPct": 0}'), null);
    assert.strictEqual(parseStoredExitPlan('{"tp1Pct": "x", "trailingPct": 2.5}'), null);
    assert.strictEqual(parseStoredExitPlan('{"trailingPct": 2.5}'), null);
  });

  test('tp2Pct invalid is neutralized to null (TP2 off) while the rest of the plan survives', () => {
    const parsed = parseStoredExitPlan('{"tp1Pct": 7.5, "trailingPct": 3.75, "tp2Pct": 0, "rationale": ["ATR"]}');
    assert.ok(parsed);
    assert.strictEqual(parsed!.tp1Pct, 7.5);
    assert.strictEqual(parsed!.tp2Pct, null);
    assert.deepStrictEqual(parsed!.rationale, ['ATR']);
  });

  test('formatExitPlanLine labels adaptif vs standar and handles disabled TP2', () => {
    const adaptive = computeExitPlan(sample);
    assert.strictEqual(formatExitPlanLine(adaptive), `Exit Plan: TP1 ${adaptive.tp1Pct}% · TP2 ${adaptive.tp2Pct}% · Trail ${adaptive.trailingPct}% (adaptif)`);

    const legacy = buildLegacyPlan({ baseTp1Pct: 5.0, baseTp2Pct: 10.0, baseTrailingPct: 2.5 });
    assert.strictEqual(formatExitPlanLine(legacy), 'Exit Plan: TP1 5% · TP2 10% · Trail 2.5% (standar)');

    const noTp2 = parseStoredExitPlan('{"tp1Pct": 7.5, "trailingPct": 3, "tp2Pct": null}');
    assert.ok(formatExitPlanLine(noTp2)!.includes('TP2 off'));

    assert.strictEqual(formatExitPlanLine(null), null);
    assert.strictEqual(formatStoredExitPlanLine('corrupt'), null);
  });
});
