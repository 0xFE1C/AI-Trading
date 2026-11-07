import fs from 'fs';
import path from 'path';
import {
  aggregateResults,
  getGitCommit,
  OPTIMIZER_CONFIGURATIONS,
  runWalkForwardOptimization,
  type SplitResult,
  type SymbolRunResult,
  type WalkForwardFold,
  type WalkForwardVerdict,
} from '../src/services/optimizer/index.js';

/**
 * CLI Optimizer (thin wrapper): seluruh metode verdict & sumber data kini
 * hidup di src/services/optimizer/index.ts (dipakai juga oleh API auto-run).
 * Script ini hanya: menjalankan run, mencetak laporan konsol (Part 1-3),
 * dan menulis audit trail data/optimizer_audit.json.
 */

async function main() {
  const timestampIso = new Date().toISOString();
  const gitCommit = getGitCommit();

  console.log('========================================================================================');
  console.log('       QUANTITATIVE STRATEGY OPTIMIZER & OUT-OF-SAMPLE SPLIT BENCHMARK                  ');
  console.log(`       Run Timestamp : ${timestampIso} (Commit: ${gitCommit})                          `);
  console.log('========================================================================================\n');

  const summary = await runWalkForwardOptimization({ includeFeeComparison: true });
  if (!summary.ok) {
    console.error(`[Optimizer] Run gagal: ${summary.error}`);
    process.exitCode = 1;
    return;
  }

  const symbolResults = summary.symbols;
  const symbols = symbolResults.map((s) => s.symbol);

  console.log(`Mengunduh ${summary.days} hari data lilin per jam (Indodax API / cache lokal)...`);
  for (const s of symbolResults) {
    const daysCovered = s.barCount >= 2 ? `~${s.coveredDays} hari` : 'n/a';
    const sourceLabel = s.dataSource === 'cache' ? 'cache lokal' : 'history_v2';
    console.log(`- ${s.symbol}: ${s.barCount} candle (${daysCovered}) via ${sourceLabel}`);
  }

  console.log('\n========================================================================================');
  console.log('       BAGIAN 1: TRAIN (60 HARI IN-SAMPLE) VS TEST (30 HARI OUT-OF-SAMPLE)               ');
  console.log('========================================================================================');
  console.log('Split: Train = Day 0 s/d 60 (lilin 0 s/d 1440), Test = Day 60 s/d 90 (lilin 1440+)\n');

  // Agregasi lintas simbol per konfigurasi (evaluasi per simbol tersedia di result)
  for (const cfg of OPTIMIZER_CONFIGURATIONS) {
    const trainResults: SplitResult[] = [];
    const testResults: SplitResult[] = [];
    const fullResults: SplitResult[] = [];
    const statuses: string[] = [];

    for (const sr of symbolResults) {
      const evalRow = sr.evaluations.find((e) => e.config.id === cfg.id);
      if (!evalRow) continue;
      trainResults.push(evalRow.inSample);
      testResults.push(evalRow.outOfSample);
      fullResults.push(evalRow.full);
      statuses.push(`${sr.symbol}:${evalRow.status}`);
    }

    const aggTrain = aggregateResults(trainResults);
    const aggTest = aggregateResults(testResults);
    const aggFull = aggregateResults(fullResults);

    const pfTrainStr = aggTrain.profitFactor !== null ? `${aggTrain.profitFactor.toFixed(2)}x` : 'N/A';
    const pfTestStr = aggTest.profitFactor !== null ? `${aggTest.profitFactor.toFixed(2)}x` : 'N/A';
    const pfFullStr = aggFull.profitFactor !== null ? `${aggFull.profitFactor.toFixed(2)}x` : 'N/A';

    console.log(`[CONFIG] ${cfg.name}`);
    console.log(`  Formula     : ${cfg.strategyType} | TP: +${cfg.takeProfitPercent}% | SL: -${cfg.trailingStopPercent}% | SMA50: ${cfg.useSmaTrendFilter}`);
    console.log(`  Train (60d) : ${aggTrain.trades} trades | Win: ${aggTrain.winRate}% | PF: ${pfTrainStr} | PnL: Rp ${aggTrain.netPnlIdr.toLocaleString('id-ID')}`);
    console.log(`  Test (30d)  : ${aggTest.trades} trades | Win: ${aggTest.winRate}% | PF: ${pfTestStr} | PnL: Rp ${aggTest.netPnlIdr.toLocaleString('id-ID')} (verdict per simbol: ${statuses.join(', ')})`);
    console.log(`  Full (90d)  : ${aggFull.trades} trades | Win: ${aggFull.winRate}% | PF: ${pfFullStr} | PnL: Rp ${aggFull.netPnlIdr.toLocaleString('id-ID')} (MaxDD: -${aggFull.maxDrawdown}%)\n`);
  }

  console.log('========================================================================================');
  console.log('       BAGIAN 2: EVALUASI EFEK BIAYA (TAKER FEE 0.4% VS MAKER FEE 0.15%)                ');
  console.log('========================================================================================');
  console.log('Perbandingan dampak langsung jika eksekusi beralih dari Market Order ke Limit Order:\n');

  for (const row of summary.feeComparison) {
    const aggTaker = row.taker;
    const aggMaker = row.maker;
    const feeSavedIdr = aggMaker.netPnlIdr - aggTaker.netPnlIdr;
    const pfTakerStr = aggTaker.profitFactor !== null ? `${aggTaker.profitFactor.toFixed(2)}x` : 'N/A';
    const pfMakerStr = aggMaker.profitFactor !== null ? `${aggMaker.profitFactor.toFixed(2)}x` : 'N/A';

    console.log(`CONFIG: ${row.configName}`);
    console.log(`  Taker (0.4% RT) : PnL Rp ${aggTaker.netPnlIdr.toLocaleString('id-ID').padStart(10)} | PF: ${pfTakerStr.padStart(6)} | Win: ${aggTaker.winRate}%`);
    console.log(`  Maker (0.15% RT): PnL Rp ${aggMaker.netPnlIdr.toLocaleString('id-ID').padStart(10)} | PF: ${pfMakerStr.padStart(6)} | Win: ${aggMaker.winRate}%`);
    console.log(`  Penghematan     : +Rp ${feeSavedIdr.toLocaleString('id-ID')} dari pemotongan biaya spread & komisi\n`);
  }

  console.log('========================================================================================');
  console.log('       BAGIAN 3: WALK-FORWARD ANALYSIS (JENDELA BERGULIR EKSPANSIF)                     ');
  console.log('========================================================================================');
  console.log('Dua lipatan: (train 30d -> test 30d) lalu (train 60d -> test 30d). Sama seperti');
  console.log('trader nyata: model diuji ulang pada data yang TIDAK PERNAH dilihat saat optimasi.');
  console.log('Config hanya layak live bila OOS-nya konsisten profit di kedua lipatan.\n');

  // Agregasi lintas simbol per konfigurasi dari lipatan per-simbol (verdict math
  // identik dengan versi asli: semua lipatan OOS semua simbol harus profit).
  for (const cfg of OPTIMIZER_CONFIGURATIONS) {
    const allFolds: WalkForwardFold[] = [];
    for (const sr of symbolResults) {
      const evalRow = sr.evaluations.find((e) => e.config.id === cfg.id);
      if (!evalRow) continue;
      allFolds.push(...evalRow.walkForward.folds, ...evalRow.walkForward.inSampleFolds);
    }

    const oosFolds = allFolds.filter((f) => f.testDays > 0);
    const isFolds = allFolds.filter((f) => f.testDays === 0);
    const aggregateOosPnlIdr = oosFolds.reduce((s, f) => s + f.netPnlIdr, 0);
    const positiveOosPnl = oosFolds.reduce((s, f) => s + Math.max(0, f.netPnlIdr), 0);
    const negativeOosPnl = Math.abs(oosFolds.reduce((s, f) => s + Math.min(0, f.netPnlIdr), 0));
    const aggregateOosProfitFactor = negativeOosPnl === 0 ? (positiveOosPnl > 0 ? null : 0) : parseFloat((positiveOosPnl / negativeOosPnl).toFixed(2));
    const inSamplePnlIdr = isFolds.reduce((s, f) => s + f.netPnlIdr, 0);
    const oosToIsRatio = inSamplePnlIdr > 0 ? parseFloat((aggregateOosPnlIdr / inSamplePnlIdr).toFixed(2)) : null;

    let verdict: WalkForwardVerdict = 'OVERFIT';
    const profitableFolds = oosFolds.filter((f) => f.netPnlIdr > 0).length;
    if (aggregateOosPnlIdr > 0 && profitableFolds === oosFolds.length) {
      verdict = 'WALK_FORWARD_ROBUST';
    } else if (aggregateOosPnlIdr > 0) {
      verdict = 'WALK_FORWARD_WEAK';
    }

    const pfStr = aggregateOosProfitFactor !== null ? `${aggregateOosProfitFactor.toFixed(2)}x` : 'N/A';
    const ratioStr = oosToIsRatio !== null ? oosToIsRatio.toFixed(2) : 'N/A';
    console.log(`[WALK-FORWARD] ${cfg.name}`);
    for (const fold of oosFolds) {
      const foldPf = fold.profitFactor !== null ? `${fold.profitFactor.toFixed(2)}x` : 'N/A';
      console.log(`  Fold (train ${fold.trainDays}d / test ${fold.testDays}d): OOS PnL Rp ${fold.netPnlIdr.toLocaleString('id-ID')} | PF: ${foldPf} | ${fold.trades} trades`);
    }
    console.log(`  Agregat OOS : Rp ${aggregateOosPnlIdr.toLocaleString('id-ID')} | PF: ${pfStr} | Rasio OOS/IS: ${ratioStr} -> [${verdict}]\n`);
  }

  // Ringkasan konfigurasi terpilih per simbol (dasar preset profit-side)
  console.log('========================================================================================');
  console.log('       KONFIGURASI TERPILIH PER SIMBOL (DASAR PRESET PROFIT-SIDE)                       ');
  console.log('========================================================================================\n');
  for (const sr of symbolResults) {
    console.log(`[CHOSEN] ${sr.symbol}: ${sr.chosenConfig.name}`);
    console.log(`  Verdict: ${sr.verdict} | IS PF: ${sr.inSamplePF ?? 'N/A'} | OOS PF: ${sr.outSamplePF ?? 'N/A'} | OOS PnL: Rp ${sr.oosPnlIdr.toLocaleString('id-ID')}`);
    console.log(`  Walk-Forward: ${sr.walkForward.verdict} | OOS PnL: Rp ${sr.walkForward.oosPnlIdr.toLocaleString('id-ID')} | Rasio OOS/IS: ${sr.walkForward.oosToIsRatio ?? 'N/A'}\n`);
  }
  if (summary.preset) {
    console.log(`[PRESET] Profit-side preset DITULIS: TP1 ${summary.preset.tp1}% / TP2 ${summary.preset.tp2}% (median ${summary.preset.symbols.length} simbol robust: ${summary.preset.symbols.join(', ')}).`);
    console.log('[PRESET] Trailing stop TIDAK diubah — anchor risiko tetap milik user.\n');
  } else {
    console.log('[PRESET] Tidak ada simbol robust yang lolos gerbang — preset TIDAK ditulis.\n');
  }

  // Save full audit log to JSON
  const auditPath = path.resolve(process.cwd(), 'data', 'optimizer_audit.json');
  const auditBySymbol = (sr: SymbolRunResult) => ({
    symbol: sr.symbol,
    dataSource: sr.dataSource,
    candles: sr.barCount,
    chosenConfig: sr.chosenConfig,
    inSamplePF: sr.inSamplePF,
    outSamplePF: sr.outSamplePF,
    oosPnlIdr: sr.oosPnlIdr,
    verdict: sr.verdict,
    walkForward: sr.walkForward,
    evaluations: sr.evaluations.map((e) => ({
      config: e.config,
      inSample: e.inSample,
      outOfSample: e.outOfSample,
      full: e.full,
      status: e.status,
      walkForward: e.walkForward,
    })),
  });
  fs.writeFileSync(
    auditPath,
    JSON.stringify(
      {
        timestamp: timestampIso,
        gitCommit,
        symbols,
        days: summary.days,
        timeframe: summary.timeframe,
        candleCounts: Object.fromEntries(symbolResults.map((s) => [s.symbol, s.barCount])),
        preset: summary.preset,
        perSymbol: symbolResults.map(auditBySymbol),
      },
      null,
      2
    )
  );

  console.log(`[Audit Trail] Log audit lengkap berhasil disimpan ke: data/optimizer_audit.json`);
}

main();
