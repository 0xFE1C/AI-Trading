/**
 * Offline AI prompt eval harness.
 *
 * Runs the versioned master-entry prompt against a golden scenario set and
 * compares the model verdict with the expected outcome. This measures REAL
 * model agreement — unlike tests/ai_evals.test.ts, which pins invariants that
 * must hold regardless of model. Use it after any prompt version bump:
 *
 *   npm run ai:eval                 # uses master_model from settings
 *   MODEL=hrbr/deepseek-v3 npm run ai:eval
 */

import { aiClient } from '../src/services/ai/index.js';
import { TradingEngine } from '../src/services/trading/index.js';
import { buildMasterEntryPrompt, PROMPT_VERSIONS } from '../src/services/ai/prompts.js';

interface EvalScenario {
  name: string;
  expected: boolean;
  ctx: {
    symbol: string;
    price: number;
    riskProfile: string;
    trailingStopPercent: number;
    targetTp1: number;
    setupReason: string;
    telemetryLine?: string;
    sentimentLabel: string;
    lessonsContext: string;
  };
}

const GOLDEN_SCENARIOS: EvalScenario[] = [
  {
    name: 'healthy momentum pullback should be approved',
    expected: true,
    ctx: {
      symbol: 'sol',
      price: 250_000,
      riskProfile: 'balanced',
      trailingStopPercent: 2.5,
      targetTp1: 5.0,
      setupReason: 'Blue-Chip Pullback (Skor: 78/100, RSI: 48.2, Dip: 3.1%)',
      telemetryLine: 'RSI(15m): 48.2 | Drop dr High 24j: 3.1% | Rasio Bid/Ask Depth: 1.4x | Spread: 0.15%',
      sentimentLabel: '+0.35 (Bullish)',
      lessonsContext: '1. [SOL] Hasil: WIN (+6.1%) | Evaluasi: pullback di EMA21 dengan volume sehat cenderung lanjut naik',
    },
  },
  {
    name: 'overbought blow-off top should be rejected',
    expected: false,
    ctx: {
      symbol: 'pepe',
      price: 42,
      riskProfile: 'aggressive',
      trailingStopPercent: 3.5,
      targetTp1: 8.0,
      setupReason: 'Top Momentum Gainer (+18.4%, Volume: Rp 850 Jt)',
      telemetryLine: 'RSI(15m): 82.4 | Drop dr High 24j: 0.2% | Rasio Bid/Ask Depth: 0.6x | Spread: 0.9%',
      sentimentLabel: '+0.10 (Bullish)',
      lessonsContext: '1. [PEPE] Hasil: LOSS (-3.4%) | Evaluasi: membeli setelah vertikal +18% hampir selalu koreksi dalam 1-2 jam',
    },
  },
  {
    name: 'thin book with wide spread should be rejected',
    expected: false,
    ctx: {
      symbol: 'xyz',
      price: 1_200,
      riskProfile: 'balanced',
      trailingStopPercent: 2.5,
      targetTp1: 5.0,
      setupReason: 'Koin Baru Listing Indodax - Momentum Pump Awal',
      telemetryLine: 'RSI(15m): 61.0 | Rasio Bid/Ask Depth: 0.4x | Spread: 2.4%',
      sentimentLabel: '0.0 (Netral / Tanpa berita spesifik)',
      lessonsContext: '1. [XYZ] Hasil: LOSS (-5.1%) | Evaluasi: spread >2% pada listing baru berarti likuiditas dangkal',
    },
  },
  {
    name: 'bearish sentiment reversal on a laggard should be rejected',
    expected: false,
    ctx: {
      symbol: 'bnb',
      price: 14_500_000,
      riskProfile: 'conservative',
      trailingStopPercent: 1.5,
      targetTp1: 3.0,
      setupReason: 'Blue-Chip Pullback (Skor: 66/100, RSI: 58.0, Dip: 4.8%)',
      telemetryLine: 'RSI(15m): 58.0 | Drop dr High 24j: 4.8% | Spread: 0.2%',
      sentimentLabel: '-0.62 (Bearish)',
      lessonsContext: '1. [BNB] Hasil: LOSS (-2.9%) | Evaluasi: jangan melawan sentimen berita negatif meski teknikal membaik',
    },
  },
];

async function main() {
  const requestedModel = process.env.MODEL || undefined;
  console.log(`Eval dimulai (prompt master_entry ${PROMPT_VERSIONS.master_entry}).\n`);

  let approved = 0;
  let mismatches = 0;

  for (const scenario of GOLDEN_SCENARIOS) {
    const { prompt, version } = buildMasterEntryPrompt(scenario.ctx);
    try {
      const response = await aiClient.complete({
        model: requestedModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 80,
        agentCaller: 'master',
        promptVersion: version,
      });
      const verdict = TradingEngine.parseAiConfirmation(response);
      const match = verdict === scenario.expected;
      if (match) approved++; else mismatches++;

      console.log(`${match ? '✔' : '✖'} ${scenario.name}`);
      console.log(`   expected=${scenario.expected ? 'APPROVE' : 'REJECT'} got=${verdict ? 'APPROVE' : 'REJECT'}`);
      console.log(`   model: ${response.trim().slice(0, 160).replace(/\n/g, ' ')}\n`);
    } catch (err: any) {
      mismatches++;
      console.log(`✖ ${scenario.name} — gagal memanggil model: ${err.message}\n`);
    }
  }

  const accuracy = ((approved / GOLDEN_SCENARIOS.length) * 100).toFixed(1);
  console.log(`Agreement: ${approved}/${GOLDEN_SCENARIOS.length} (${accuracy}%).`);
  if (mismatches > 0) {
    console.log('Terdapat ketidaksesuaian — review versi prompt sebelum dipakai live.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Eval gagal:', err.message);
  process.exit(1);
});
