import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSetting, setSetting } from '../src/db/index.js';
import { TradingEngine } from '../src/services/trading/index.js';
import { OPTIMIZER_PRESET_RATIONALE } from '../src/services/optimizer/index.js';

/**
 * Test konsumsi preset optimizer di engine (profit-side SAJA):
 *  - preset segar + enabled → baseTp1/baseTp2 plan berasal dari preset
 *  - disabled / stale (>14 hari) / korup → setting user
 *  - trailing TIDAK PERNAH tersentuh preset (anchor risiko tetap user)
 *  - rasional preset ditambahkan ke plan sebelum persist
 */

const engine = new TradingEngine();

const SETTINGS_KEYS = [
  'optimizer_preset_enabled',
  'optimizer_preset_tp1',
  'optimizer_preset_tp2',
  'optimizer_preset_meta',
  'take_profit_target_1_percent',
  'take_profit_target_2_percent',
  'trailing_stop_percent',
  'adaptive_exit_enabled',
  'tp1_sell_fraction_percent',
  'tp2_sell_fraction_percent',
];
const snapshot: Record<string, string> = {};
for (const k of SETTINGS_KEYS) snapshot[k] = getSetting(k, '');

function writePreset(tp1: string, tp2: string, testedAt: number) {
  setSetting('optimizer_preset_tp1', tp1);
  setSetting('optimizer_preset_tp2', tp2);
  setSetting(
    'optimizer_preset_meta',
    JSON.stringify({ testedAt, symbols: ['BTCIDR', 'ETHIDR'], verdict: 'WALK_FORWARD_ROBUST', oosPfMedian: 1.24, oosPnlIdrTotal: 225900, tp1: parseFloat(tp1), tp2: parseFloat(tp2) })
  );
}

function clearPreset() {
  setSetting('optimizer_preset_tp1', '');
  setSetting('optimizer_preset_tp2', '');
  setSetting('optimizer_preset_meta', '');
}

// Input adaptif "netral": semua faktor adaptiveExit tepat 1.0
const NEUTRAL_ADAPTIVE = { atrPct: 2.0, regime: 'NEUTRAL', volumeSurgeRatio: null, depthImbalance: 0.5, isBluechip: false };
// Input tanpa sinyal adaptif sama sekali → jalur legacy
const LEGACY_INPUTS = { atrPct: null, regime: null, volumeSurgeRatio: null, depthImbalance: null, isBluechip: false };

describe('Konsumsi Preset Optimizer — buildAdaptiveExitPlan (profit-side saja)', () => {
  test('preset segar + enabled → TP plan dari preset + rasional preset + trailing tetap user', () => {
    const now = Date.now();
    setSetting('optimizer_preset_enabled', '1');
    setSetting('take_profit_target_1_percent', '5.0');
    setSetting('take_profit_target_2_percent', '10.0');
    setSetting('trailing_stop_percent', '2.5');
    setSetting('adaptive_exit_enabled', '1');
    writePreset('6.5', '13', now - 2 * 86400_000);

    try {
      // Jalur adaptif (faktor netral) → tp1 = clamp(6.5) = 6.5, tp2 = 2x = 13
      const plan = engine.buildAdaptiveExitPlan(NEUTRAL_ADAPTIVE);
      assert.equal(plan.tp1Pct, 6.5, `tp1 plan harus dari preset (6.5), dapat ${plan.tp1Pct}`);
      assert.equal(plan.tp2Pct, 13, 'tp2 plan harus 2x preset tp1');
      assert.equal(plan.trailingPct, 2.5, 'trailing TIDAK boleh tersentuh preset (tetap setting user)');
      assert.ok(plan.rationale.includes(OPTIMIZER_PRESET_RATIONALE), 'rasional preset harus ada di plan');
      assert.equal(plan.legacy, false);

      // Jalur legacy (tanpa sinyal adaptif) → preset TETAP dipakai sebagai base
      const legacyPlan = engine.buildAdaptiveExitPlan(LEGACY_INPUTS);
      assert.equal(legacyPlan.tp1Pct, 6.5);
      assert.equal(legacyPlan.tp2Pct, 13);
      assert.equal(legacyPlan.trailingPct, 2.5);
      assert.ok(legacyPlan.rationale.includes(OPTIMIZER_PRESET_RATIONALE));
    } finally {
      clearPreset();
      for (const [k, v] of Object.entries(snapshot)) setSetting(k, v);
    }
  });

  test('disabled (default 0) → setting user penuh, tanpa rasional preset', () => {
    setSetting('optimizer_preset_enabled', '0');
    setSetting('take_profit_target_1_percent', '5.0');
    setSetting('take_profit_target_2_percent', '10.0');
    setSetting('trailing_stop_percent', '2.5');
    setSetting('adaptive_exit_enabled', '1');
    writePreset('6.5', '13', Date.now() - 1000); // preset segar TAPI disabled

    try {
      const plan = engine.buildAdaptiveExitPlan(NEUTRAL_ADAPTIVE);
      assert.equal(plan.tp1Pct, 5.0, 'preset tidak boleh dipakai saat optimizer_preset_enabled=0');
      assert.equal(plan.tp2Pct, 10.0);
      assert.ok(!plan.rationale.includes(OPTIMIZER_PRESET_RATIONALE), 'tanpa rasional preset');
    } finally {
      clearPreset();
      for (const [k, v] of Object.entries(snapshot)) setSetting(k, v);
    }
  });

  test('preset stale (> 14 hari) diperlakukan TIDAK ADA → setting user', () => {
    setSetting('optimizer_preset_enabled', '1');
    setSetting('take_profit_target_1_percent', '5.0');
    setSetting('take_profit_target_2_percent', '10.0');
    setSetting('trailing_stop_percent', '2.5');
    setSetting('adaptive_exit_enabled', '1');
    writePreset('6.5', '13', Date.now() - 15 * 86400_000);

    try {
      const plan = engine.buildAdaptiveExitPlan(NEUTRAL_ADAPTIVE);
      assert.equal(plan.tp1Pct, 5.0, 'preset > 14 hari harus diabaikan');
      assert.equal(plan.tp2Pct, 10.0);
      assert.ok(!plan.rationale.includes(OPTIMIZER_PRESET_RATIONALE));
    } finally {
      clearPreset();
      for (const [k, v] of Object.entries(snapshot)) setSetting(k, v);
    }
  });

  test('preset dengan testedAt di masa depan (jam sistem melompat) diperlakukan TIDAK ADA → setting user', () => {
    setSetting('optimizer_preset_enabled', '1');
    setSetting('take_profit_target_1_percent', '5.0');
    setSetting('take_profit_target_2_percent', '10.0');
    setSetting('trailing_stop_percent', '2.5');
    setSetting('adaptive_exit_enabled', '1');
    writePreset('6.5', '13', Date.now() + 3 * 86400_000); // 3 hari di masa depan

    try {
      const plan = engine.buildAdaptiveExitPlan(NEUTRAL_ADAPTIVE);
      assert.equal(plan.tp1Pct, 5.0, 'testedAt masa depan harus ditolak (usia negatif)');
      assert.equal(plan.tp2Pct, 10.0);
      assert.ok(!plan.rationale.includes(OPTIMIZER_PRESET_RATIONALE));
    } finally {
      clearPreset();
      for (const [k, v] of Object.entries(snapshot)) setSetting(k, v);
    }
  });

  test('preset tanpa TP2 (kosong) → TP2 plan nonaktif, TP1 tetap dari preset', () => {
    setSetting('optimizer_preset_enabled', '1');
    setSetting('take_profit_target_1_percent', '5.0');
    setSetting('take_profit_target_2_percent', '10.0');
    setSetting('trailing_stop_percent', '2.5');
    setSetting('adaptive_exit_enabled', '1');
    setSetting('optimizer_preset_tp1', '6.5');
    setSetting('optimizer_preset_tp2', '');
    setSetting(
      'optimizer_preset_meta',
      JSON.stringify({ testedAt: Date.now(), symbols: ['BTCIDR'], verdict: 'WALK_FORWARD_ROBUST', oosPfMedian: 1.3, oosPnlIdrTotal: 50000, tp1: 6.5, tp2: 13 })
    );

    try {
      const plan = engine.buildAdaptiveExitPlan(LEGACY_INPUTS);
      assert.equal(plan.tp1Pct, 6.5);
      assert.equal(plan.tp2Pct, null, 'tp2 preset kosong → TP2 nonaktif untuk posisi berikutnya');
      assert.ok(plan.rationale.includes(OPTIMIZER_PRESET_RATIONALE));
    } finally {
      clearPreset();
      for (const [k, v] of Object.entries(snapshot)) setSetting(k, v);
    }
  });

  test('preset di-clamp adaptiveExit: preset ekstrem tetap dalam batas keras 2-25 / 4-50', () => {
    setSetting('optimizer_preset_enabled', '1');
    setSetting('trailing_stop_percent', '2.5');
    setSetting('adaptive_exit_enabled', '1');
    // Simulasi preset yang diedit manual menjadi ekstrem
    setSetting('optimizer_preset_tp1', '900');
    setSetting('optimizer_preset_tp2', '900');
    setSetting(
      'optimizer_preset_meta',
      JSON.stringify({ testedAt: Date.now(), symbols: ['BTCIDR'], verdict: 'WALK_FORWARD_ROBUST', oosPfMedian: 1.3, oosPnlIdrTotal: 50000, tp1: 900, tp2: 900 })
    );

    try {
      const plan = engine.buildAdaptiveExitPlan(NEUTRAL_ADAPTIVE);
      assert.equal(plan.tp1Pct, 25.0, 'tp1 harus ter-clamp ke batas keras TP1_MAX 25');
      assert.equal(plan.tp2Pct, 50.0, 'tp2 harus ter-clamp ke batas keras TP2_MAX 50');
      assert.equal(plan.trailingPct, 2.5);
    } finally {
      clearPreset();
      for (const [k, v] of Object.entries(snapshot)) setSetting(k, v);
    }
  });
});
