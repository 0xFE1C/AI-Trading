import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { allowsDeterministicFallback } from '../src/services/trading/aiPolicy.js';

describe('AI failure policy', () => {
  test('paper + confirm may use deterministic fallback', () => {
    assert.strictEqual(allowsDeterministicFallback('confirm', 'paper'), true);
  });

  test('live + confirm must fail closed', () => {
    assert.strictEqual(allowsDeterministicFallback('confirm', 'live'), false);
  });

  test('required mode never falls back to deterministic entries', () => {
    assert.strictEqual(allowsDeterministicFallback('required', 'paper'), false);
    assert.strictEqual(allowsDeterministicFallback('required', 'live'), false);
  });

  test('off mode is not treated as a failure fallback', () => {
    assert.strictEqual(allowsDeterministicFallback('off', 'paper'), false);
    assert.strictEqual(allowsDeterministicFallback('off', 'live'), false);
  });
});
