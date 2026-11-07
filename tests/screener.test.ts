import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMarketBreadth,
  screenMarket,
  marketSummariesFromTickers,
  MarketBreadth,
  ScreenerCandidate,
} from '../src/services/signals/screener.js';
import { MarketSummary } from '../src/services/signals/index.js';
import { IndodaxSummaryTicker } from '../src/services/indodax/index.js';

// --- Helper: MarketSummary sintetis --------------------------------------

function mkSummary(
  symbol: string,
  volIdr24h: number,
  last: number,
  opts: { low?: number; high?: number; buy?: number; sell?: number } = {}
): MarketSummary {
  const low = opts.low ?? last * 0.95;
  const high = opts.high ?? last * 1.01;
  return {
    symbol,
    pair: `${symbol}_idr`,
    last,
    high24h: high,
    low24h: low,
    volIdr24h,
    buyPrice: opts.buy ?? last * 0.999,
    sellPrice: opts.sell ?? last * 1.001,
    ts: 0,
  };
}

function mkTicker(last: number, low: number, high: number, vol: number, buy?: number, sell?: number): IndodaxSummaryTicker {
  return {
    name: 'test',
    last: String(last),
    high: String(high),
    low: String(low),
    vol_idr: String(vol),
    buy: String(buy ?? last * 0.999),
    sell: String(sell ?? last * 1.001),
    server_time: 0,
  };
}

describe('computeMarketBreadth (matematika breadth pasar)', () => {
  test('semua naik → percent 100, advancing == sampleSize', () => {
    const summaries = Array.from({ length: 20 }, (_, i) => mkSummary(`c${i}`, 1e9 + i, 100));
    const prices24h: Record<string, number> = {};
    for (const s of summaries) prices24h[`${s.symbol}idr`] = 90; // 24j lalu 90, sekarang 100
    const b = computeMarketBreadth(summaries, prices24h);
    assert.equal(b.sampleSize, 20);
    assert.equal(b.advancing, 20);
    assert.equal(b.declining, 0);
    assert.equal(b.percent, 100);
  });

  test('semua turun → percent 0, declining == sampleSize', () => {
    const summaries = Array.from({ length: 20 }, (_, i) => mkSummary(`c${i}`, 1e9 + i, 100));
    const prices24h: Record<string, number> = {};
    for (const s of summaries) prices24h[`${s.symbol}idr`] = 120;
    const b = computeMarketBreadth(summaries, prices24h);
    assert.equal(b.sampleSize, 20);
    assert.equal(b.advancing, 0);
    assert.equal(b.declining, 20);
    assert.equal(b.percent, 0);
  });

  test('campuran 12 naik dari 20 → percent 60.0 (1 desimal)', () => {
    const summaries = Array.from({ length: 20 }, (_, i) => mkSummary(`c${i}`, 1e9 + i, 100));
    const prices24h: Record<string, number> = {};
    summaries.forEach((s, i) => {
      prices24h[`${s.symbol}idr`] = i < 12 ? 90 : 110; // 12 naik, 8 turun
    });
    const b = computeMarketBreadth(summaries, prices24h);
    assert.equal(b.advancing, 12);
    assert.equal(b.declining, 8);
    assert.equal(b.percent, 60);
  });

  test('prices24h kosong/missing → sampleSize 0 (kontrak fail-open)', () => {
    const summaries = [mkSummary('btc', 5e9, 100), mkSummary('eth', 4e9, 50)];
    const b1 = computeMarketBreadth(summaries, {});
    assert.equal(b1.sampleSize, 0);
    assert.equal(b1.percent, 0);
    assert.equal(b1.advancing, 0);
    assert.equal(b1.declining, 0);
    const b2 = computeMarketBreadth(summaries, undefined as any);
    assert.equal(b2.sampleSize, 0);
  });

  test('pasangan lebih sedikit dari topN → sampleSize mengikuti jumlah valid', () => {
    const summaries = [mkSummary('a', 5e9, 100), mkSummary('b', 4e9, 100), mkSummary('c', 3e9, 100)];
    const prices24h: Record<string, string> = { aidr: '90', bidr: '90', cidr: '110' };
    const b = computeMarketBreadth(summaries, prices24h);
    assert.equal(b.sampleSize, 3);
    assert.equal(b.advancing, 2);
    assert.equal(b.percent, 66.7);
  });

  test('last == harga 24j → netral (tidak advancing, tidak declining) tapi terhitung sampel', () => {
    const summaries = [mkSummary('a', 5e9, 100), mkSummary('b', 4e9, 100)];
    const prices24h: Record<string, string> = { aidr: '100', bidr: '90' };
    const b = computeMarketBreadth(summaries, prices24h);
    assert.equal(b.sampleSize, 2);
    assert.equal(b.advancing, 1);
    assert.equal(b.declining, 0);
    assert.equal(b.percent, 50);
  });

  test('topN: hanya pasangan paling likuid yang dihitung', () => {
    // 25 pasangan; 20 volume terbesar ditandai turun, 5 volume kecil naik.
    const summaries: MarketSummary[] = [];
    for (let i = 0; i < 20; i++) summaries.push(mkSummary(`big${i}`, 2e9, 100));
    for (let i = 0; i < 5; i++) summaries.push(mkSummary(`small${i}`, 1e6, 100));
    const prices24h: Record<string, number> = {};
    for (const s of summaries) prices24h[`${s.symbol}idr`] = s.symbol.startsWith('big') ? 110 : 50;
    const b = computeMarketBreadth(summaries, prices24h, 20);
    assert.equal(b.sampleSize, 20); // hanya big* (likuid) yang masuk sampel
    assert.equal(b.advancing, 0);
    assert.equal(b.percent, 0);
  });

  test('defensif: pasangan tanpa harga 24j dilewati; harga string/number sama', () => {
    const summaries = [mkSummary('a', 5e9, 100), mkSummary('b', 4e9, 100), mkSummary('c', 3e9, 100)];
    const prices24h: Record<string, string | number> = { aidr: '90', bidr: 'abc' }; // c tanpa kunci
    const b = computeMarketBreadth(summaries, prices24h);
    assert.equal(b.sampleSize, 1);
    assert.equal(b.advancing, 1);
    assert.equal(b.percent, 100);
  });

  test('varian kunci pair: btc_idr vs btcidr vs BTCIDR', () => {
    const summaries = [mkSummary('btc', 5e9, 100)];
    assert.equal(computeMarketBreadth(summaries, { btcidr: '90' }).sampleSize, 1);
    assert.equal(computeMarketBreadth(summaries, { btc_idr: '90' }).sampleSize, 1);
    assert.equal(computeMarketBreadth(summaries, { BTCIDR: '90' }).sampleSize, 1);
    assert.equal(computeMarketBreadth(summaries, { btc: '90' }).sampleSize, 1);
    assert.equal(computeMarketBreadth(summaries, { unknown: '90' }).sampleSize, 0);
  });
});

describe('screenMarket (ranking tahap-1 murah dari ticker)', () => {
  const baseOpts = { minVolumeIdr: 200_000_000 };

  test('rumus cheapScore terdokumentasi: 0.6*percentile + 0.4*bandPos', () => {
    // Pool 3 kandidat, gain eksak: 2% (bandPos 0), 11% (bandPos 0.5), 20% (bandPos 1)
    const a = mkSummary('aaa', 3e9, 102, { low: 100, high: 103 }); // vol terbesar, gain ~2%
    const b = mkSummary('bbb', 2e9, 111, { low: 100, high: 112 }); // vol tengah, gain ~11%
    const c = mkSummary('ccc', 1e9, 120, { low: 100, high: 121 }); // vol terkecil, gain ~20%
    const out = screenMarket([a, b, c], { ...baseOpts, maxSpreadPercent: 1.5 });
    assert.equal(out.length, 3);
    // percentile: aaa=1.0, bbb=0.5, ccc=0.0
    const aaa = out.find((c2) => c2.symbol === 'aaa')!;
    const bbb = out.find((c2) => c2.symbol === 'bbb')!;
    const ccc = out.find((c2) => c2.symbol === 'ccc')!;
    assert.equal(aaa.volumePercentile, 1);
    assert.equal(bbb.volumePercentile, 0.5);
    assert.equal(ccc.volumePercentile, 0);
    assert.equal(ccc.gainBandPosition, 1);
    assert.equal(bbb.gainBandPosition, 0.5);
    assert.equal(aaa.gainBandPosition, 0);
    assert.equal(aaa.cheapScore, 0.6 * 1.0 + 0.4 * 0);
    assert.equal(bbb.cheapScore, 0.6 * 0.5 + 0.4 * 0.5);
    assert.equal(ccc.cheapScore, 0.6 * 0 + 0.4 * 1);
    // Urutan: cheapScore desc → aaa, bbb, ccc
    assert.deepEqual(out.map((x) => x.symbol), ['aaa', 'bbb', 'ccc']);
  });

  test('filter volume: di bawah minimum disingkirkan', () => {
    const out = screenMarket(
      [mkSummary('aaa', 5e9, 105, { low: 100, high: 106 }), mkSummary('small', 1e8, 105, { low: 100, high: 106 })],
      baseOpts
    );
    assert.deepEqual(out.map((c) => c.symbol), ['aaa']);
  });

  test('pita gain: di bawah 2% dan di atas 20% disingkirkan', () => {
    const flat = mkSummary('flat', 5e9, 100.9, { low: 100, high: 101 }); // gain ~0.9%
    const pump = mkSummary('pump', 5e9, 125, { low: 100, high: 126 }); // gain ~25%
    const healthy = mkSummary('ok', 5e9, 105, { low: 100, high: 106 }); // gain ~5%
    const out = screenMarket([flat, pump, healthy], baseOpts);
    assert.deepEqual(out.map((c) => c.symbol), ['ok']);
  });

  test('drop dari pucuk > 5% disingkirkan', () => {
    const crashed = mkSummary('crash', 5e9, 90, { low: 85, high: 100 }); // drop 10%
    const near = mkSummary('near', 5e9, 97, { low: 92, high: 100 }); // drop 3%
    const out = screenMarket([crashed, near], baseOpts);
    assert.deepEqual(out.map((c) => c.symbol), ['near']);
  });

  test('spread top-of-book > 1.5% disingkirkan', () => {
    const wide = mkSummary('wide', 5e9, 100, { low: 95, high: 101, buy: 96, sell: 98 }); // ~2.04%
    const tight = mkSummary('tight', 5e9, 100, { low: 95, high: 101, buy: 99.9, sell: 100.1 });
    const out = screenMarket([wide, tight], baseOpts);
    assert.deepEqual(out.map((c) => c.symbol), ['tight']);
  });

  test('excludeSymbols: posisi/ghost/cooldown/threat tidak masuk kandidat', () => {
    const a = mkSummary('aaa', 5e9, 105, { low: 100, high: 106 });
    const b = mkSummary('bbb', 4e9, 105, { low: 100, high: 106 });
    const out = screenMarket([a, b], { ...baseOpts, excludeSymbols: ['aaa', 'AAA_IDR', 'ccc'] });
    assert.deepEqual(out.map((c) => c.symbol), ['bbb']);
  });

  test('maxCandidates membatasi hasil; default 12', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      mkSummary(`s${String(i).padStart(2, '0')}`, 5e9 - i * 1e8, 105, { low: 100, high: 106 })
    );
    assert.equal(screenMarket(many, baseOpts).length, 12);
    const capped3 = screenMarket(many, { ...baseOpts, maxCandidates: 3 });
    assert.equal(capped3.length, 3);
    // Volume terbesar mendapat percentile tertinggi → skor tertinggi.
    assert.equal(capped3[0].symbol, 's00');
    assert.ok(capped3[0].cheapScore >= capped3[1].cheapScore);
    assert.ok(capped3[1].cheapScore >= capped3[2].cheapScore);
  });

  test('reasons selalu non-kosong dan berbahasa Indonesia', () => {
    const a = mkSummary('aaa', 5e9, 105, { low: 100, high: 106, buy: 104.9, sell: 105.1 });
    const out = screenMarket([a], baseOpts);
    assert.equal(out.length, 1);
    assert.ok(out[0].reasons.length >= 1);
    assert.ok(out[0].reasons.includes('momentum sehat'));
    // spread 0.19% ≤ 0.5 → 'spread sempit'
    assert.ok(out[0].reasons.includes('spread sempit'));
    // vol tunggal → percentile 1.0 ≥ 0.75 → 'volume besar'
    assert.ok(out[0].reasons.includes('volume besar'));
    for (const c of out) {
      assert.equal(typeof c.cheapScore, 'number');
      assert.ok(c.cheapScore >= 0 && c.cheapScore <= 1);
    }
  });

  test('tie-break deterministik: cheapScore sama → volume desc', () => {
    // Persentil selalu unik per pool, jadi skor sama hanya lewat kombinasi
    // (percentile, bandPos) berbeda: top-vol + gain 6.5% (0.6+0.1) vs
    // mid-vol + gain 20% (0.3+0.4) → keduanya 0.7. Tie-break: volume desc.
    const topVolLowGain = mkSummary('aa_top', 3e9, 106.5, { low: 100, high: 107.6 });
    const midVolHighGain = mkSummary('bb_mid', 2e9, 120, { low: 100, high: 121.2 });
    const bottom = mkSummary('cc_bot', 1e9, 120, { low: 100, high: 121.2 });
    const out = screenMarket([midVolHighGain, bottom, topVolLowGain], baseOpts);
    assert.equal(out[0].cheapScore, out[1].cheapScore);
    assert.deepEqual(out.map((c) => c.symbol), ['aa_top', 'bb_mid', 'cc_bot']);
  });
});

describe('marketSummariesFromTickers (adapter ticker → MarketSummary)', () => {
  test('konversi defensif: hanya pair _idr dengan last valid', () => {
    const tickers: Record<string, IndodaxSummaryTicker> = {
      btc_idr: mkTicker(100, 95, 101, 5e9),
      ethusdt: mkTicker(50, 45, 55, 4e9), // bukan IDR → dilewati
      broken_idr: mkTicker(NaN, 1, 2, 3), // last tak valid → dilewati
    };
    const out = marketSummariesFromTickers(tickers);
    assert.equal(out.length, 1);
    assert.equal(out[0].symbol, 'btc');
    assert.equal(out[0].pair, 'btc_idr');
    assert.equal(out[0].last, 100);
    assert.equal(out[0].volIdr24h, 5e9);
    assert.equal(out[0].buyPrice, 99.9);
  });
});
