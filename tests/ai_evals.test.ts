import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TradingEngine } from '../src/services/trading/index.js';
import {
  PROMPT_VERSIONS,
  buildMasterEntryPrompt,
  buildPostmortemPrompt,
  buildPortfolioReviewPrompt,
  buildWhatsappSystemPrompt,
} from '../src/services/ai/prompts.js';

describe('Prompt Version Registry', () => {
  test('every prompt kind has a non-empty version with a v<digit> prefix', () => {
    for (const [kind, version] of Object.entries(PROMPT_VERSIONS)) {
      assert.match(version, /^v\d/, `${kind} version must look like v1.0 (got ${version})`);
    }
  });

  test('builders return the registered version for their kind', () => {
    const master = buildMasterEntryPrompt({
      symbol: 'btc',
      price: 1_000_000_000,
      riskProfile: 'balanced',
      trailingStopPercent: 2.5,
      targetTp1: 5,
      setupReason: 'test',
      sentimentLabel: '0.0 (Netral)',
      lessonsContext: '-',
    });
    assert.equal(master.version, PROMPT_VERSIONS.master_entry);

    const postmortem = buildPostmortemPrompt({
      symbol: 'btc', entryPrice: 1, exitPrice: 1, pnlPercent: 0, holdDurationMinutes: 5, exitReason: 'test',
    });
    assert.equal(postmortem.version, PROMPT_VERSIONS.postmortem);

    const portfolio = buildPortfolioReviewPrompt({
      mode: 'paper', equityIdr: 10_000_000, openPositions: [],
      recentPerformance: { winRatePercent: 0, totalPnl7dIdr: 0, closedTrades7d: 0 },
      regime: 'NEUTRAL', threatCount: 0,
    });
    assert.equal(portfolio.version, PROMPT_VERSIONS.portfolio_review);

    const wa = buildWhatsappSystemPrompt('konteks');
    assert.equal(wa.version, PROMPT_VERSIONS.whatsapp_chat);
  });
});

describe('Master Entry Prompt Invariants', () => {
  const ctx = {
    symbol: 'btc',
    price: 1_000_000_000,
    riskProfile: 'balanced',
    trailingStopPercent: 2.5,
    targetTp1: 5.0,
    setupReason: 'Top Momentum Gainer (+4.2%)',
    telemetryLine: 'RSI(15m): 55.3 | Spread: 0.12%',
    sentimentLabel: '+0.42 (Bullish)',
    lessonsContext: '1. [ETH] Hasil: WIN (+5.2%) | Evaluasi: hold lebih lama',
  };

  test('mandates a strict single-line JSON verdict (machine-parseable)', () => {
    const { prompt } = buildMasterEntryPrompt(ctx);
    assert.ok(prompt.includes('{"verdict"'), 'must show the exact JSON shape');
    assert.ok(prompt.includes('HANYA dalam format JSON'), 'must forbid free-form answers');
  });

  test('carries the risk budget and telemetry into the prompt', () => {
    const { prompt } = buildMasterEntryPrompt(ctx);
    assert.ok(prompt.includes('SL -2.5%'));
    assert.ok(prompt.includes('TP1 +5%'));
    assert.ok(prompt.includes('RSI(15m): 55.3'));
    assert.ok(prompt.includes('+0.42 (Bullish)'));
  });

  test('includes the self-learning memory block', () => {
    const { prompt } = buildMasterEntryPrompt(ctx);
    assert.ok(prompt.includes('MEMORI BELAJAR'));
    assert.ok(prompt.includes('hold lebih lama'));
  });
});

describe('Portfolio & WhatsApp Prompt Safety Invariants', () => {
  test('portfolio reviewer prompt enforces READ-ONLY behavior', () => {
    const { prompt } = buildPortfolioReviewPrompt({
      mode: 'live',
      equityIdr: 100_000_000,
      openPositions: [{ symbol: 'btcidr', entryPrice: 900_000_000, currentPrice: 1_000_000_000, pnlPercent: 11.1, holdMinutes: 120, trailingStopPercent: 2.5 }],
      recentPerformance: { winRatePercent: 60, totalPnl7dIdr: 1_500_000, closedTrades7d: 5 },
      regime: 'RISK_ON',
      threatCount: 0,
    });
    assert.ok(prompt.toLowerCase().includes('read-only'));
    assert.ok(prompt.includes('jangan mencoba mengeksekusi'));
  });

  test('whatsapp system prompt documents the two-step confirmation policy', () => {
    const { prompt } = buildWhatsappSystemPrompt('konteks');
    assert.ok(prompt.includes('KONFIRMASI DUA LANGKAH'));
    assert.ok(prompt.includes('PANIC_SELL'));
  });
});

describe('AI Verdict Parser (golden edge cases)', () => {
  const parse = TradingEngine.parseAiConfirmation.bind(TradingEngine);

  test('approves explicit JSON verdicts', () => {
    assert.equal(parse('{"verdict": "YA", "confidence": 0.9, "reason": "ok"}'), true);
    assert.equal(parse('{"verdict": "TIDAK", "confidence": 0.9, "reason": "risky"}'), false);
  });

  test('rejects hedging or risk words even inside affirmative sentences', () => {
    assert.equal(parse('YA, tetapi ada risiko tinggi sekarang'), false);
    assert.equal(parse('Verdict: YA, namun saya ragu'), false);
    assert.equal(parse('YA — tunggu konfirmasi candle berikutnya'), false);
  });

  test('rejects verbose non-answers that lack a first-line verdict', () => {
    assert.equal(parse('Analisis saya: harga sedang konsolidasi dan volume menurun.'), false);
  });

  test('accepts a clean first-line verdict', () => {
    assert.equal(parse('VERDICT: YA\nAlasan: momentum sehat'), true);
  });

  test('fails closed on empty or malformed input', () => {
    assert.equal(parse(''), false);
    assert.equal(parse('   '), false);
  });
});
