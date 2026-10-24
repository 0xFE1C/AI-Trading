import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Layers,
  RefreshCw,
  HelpCircle,
  Clock,
  Sparkles,
  Cpu,
  BarChart2,
  Filter,
} from 'lucide-react';
import { api } from '../services/api';
import { EntryGateDiagnostics, SignalsRadarData } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface GateMeta {
  key: string;
  name: string;
  category: 'risk' | 'macro' | 'liquidity' | 'strategy' | 'ai';
  description: string;
}

export const EntryDiagnosticsSection: React.FC = () => {
  const { l, language } = useLanguage();
  const [diagnostics, setDiagnostics] = useState<EntryGateDiagnostics | null>(null);
  const [radar, setRadar] = useState<SignalsRadarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'gates' | 'radar'>('gates');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const gateMetas = useMemo<GateMeta[]>(() => [
    {
      key: 'circuit_breaker',
      name: l('1. Daily Circuit Breaker', '1. Circuit Breaker Harian'),
      category: 'risk',
      description: l(
        'Halts trading if cumulative daily loss limit is reached (capital protection).',
        'Menyetop trading jika batas rugi harian akumulatif tercapai (proteksi modal).'
      ),
    },
    {
      key: 'exposure',
      name: l('2. Exposure & Position Capacity', '2. Batas Eksposur & Slot Posisi'),
      category: 'risk',
      description: l(
        'Ensures open positions do not exceed diversification capacity.',
        'Memastikan jumlah posisi terbuka tidak melebihi kapasitas diversifikasi.'
      ),
    },
    {
      key: 'btc_regime',
      name: l('3. BTC Macro Regime', '3. BTC Macro Regime'),
      category: 'macro',
      description: l(
        'Detects market flash dumps via rolling 1h (<= -3%) & 4h (<= -5%) BTC returns.',
        'Mendeteksi flash dump pasar melalui return 1h (<= -3%) & 4h (<= -5%) BTC.'
      ),
    },
    {
      key: 'threat_scope',
      name: l('4. Scoped Threat Blocker', '4. Scoped Threat Blocker'),
      category: 'risk',
      description: l(
        'Detects critical threats (exploits, delistings, hacks) specific to the target coin.',
        'Mendeteksi ancaman kritis (hacks, delisting, exploit) yang spesifik terhadap koin.'
      ),
    },
    {
      key: 'slippage',
      name: l('5. Liquidity & Slippage Budget', '5. Likuiditas & Slippage Budget'),
      category: 'liquidity',
      description: l(
        'Estimates orderbook fill slippage before any buy order is executed.',
        'Menghitung estimasi slippage pada order book sebelum order beli dieksekusi.'
      ),
    },
    {
      key: 'spread',
      name: l('6. Spread Trap Guard', '6. Spread Trap Guard'),
      category: 'liquidity',
      description: l(
        'Prevents entering thin orderbooks with wide bid-ask spread traps.',
        'Mencegah pembelian pada order book tipis dengan bid-ask spread melebar.'
      ),
    },
    {
      key: 'candidate_filter',
      name: l('7. Strategy Opportunity Scorer', '7. Algoritma Peluang / Scorer'),
      category: 'strategy',
      description: l(
        'Scores technical signals (EMA, RSI, Depth) against your selected risk profile.',
        'Menilai sinyal teknikal (EMA, RSI, Depth) sesuai profil risiko Anda.'
      ),
    },
    {
      key: 'rsi',
      name: l('8. Momentum & RSI Overbought Guard', '8. Filter Momentum & RSI Guard'),
      category: 'strategy',
      description: l(
        'Prevents buying coins in overbought territory (RSI > 70/80).',
        'Mencegah pembelian koin di area jenuh beli (overbought RSI > 70/80).'
      ),
    },
    {
      key: 'ai_gate',
      name: l('9. AI Evaluator Verification', '9. Verifikasi AI Evaluator'),
      category: 'ai',
      description: l(
        'Sanity check from AI model (or automatically bypassed in deterministic mode).',
        'Sanity check 1x model AI (atau otomatis bypass jika mode deterministik aktif).'
      ),
    },
  ], [l]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [diagData, radarData] = await Promise.all([
        api.getEntryGateDiagnostics(),
        api.getSignalsRadar(),
      ]);
      setDiagnostics(diagData);
      setRadar(radarData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch entry diagnostics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalEvaluated = diagnostics?.totalEvaluated || 0;
  const gates = diagnostics?.gates || {};
  const recentRejections = diagnostics?.recentRejections || [];

  // Calculate overall pass rate across all evaluations
  const aiPassed = gates['ai_gate']?.passed ?? (gates['candidate_filter']?.passed || 0);
  const passRatePercent = totalEvaluated > 0 ? ((aiPassed / totalEvaluated) * 100).toFixed(1) : '0.0';

  const formatRejectionReason = (gateName: string, values: any) => {
    if (!values) return l('Threshold criteria not satisfied.', 'Kriteria ambang batas tidak terpenuhi.');
    if (typeof values === 'string') return values;

    if (gateName === 'rsi' && values.rsi !== undefined) {
      return l(
        `RSI (${values.rsi.toFixed(1)}) exceeds safety threshold (${values.maxRsi || 70})`,
        `RSI (${values.rsi.toFixed(1)}) melebihi batas pengaman (${values.maxRsi || 70})`
      );
    }
    if (gateName === 'spread' && values.spreadPct !== undefined) {
      return l(
        `Bid-ask spread (${values.spreadPct.toFixed(2)}%) too wide (> ${values.maxSpread || 1.0}%)`,
        `Spread bid-ask (${values.spreadPct.toFixed(2)}%) terlalu lebar (> ${values.maxSpread || 1.0}%)`
      );
    }
    if (gateName === 'slippage' && values.slippagePct !== undefined) {
      return l(
        `Orderbook slippage (${values.slippagePct.toFixed(2)}%) > tolerance (${values.maxSlippage || 0.8}%)`,
        `Slippage order book (${values.slippagePct.toFixed(2)}%) > batas toleransi (${values.maxSlippage || 0.8}%)`
      );
    }
    if (gateName === 'btc_regime' && values.ret1h !== undefined) {
      return l(
        `BTC flash dump active: 1h return ${values.ret1h.toFixed(2)}%, 4h return ${values.ret4h?.toFixed(2) || '0'}%`,
        `BTC mengalami flash dump: 1h return ${values.ret1h.toFixed(2)}%, 4h return ${values.ret4h?.toFixed(2) || '0'}%`
      );
    }
    if (gateName === 'threat_scope') {
      return l(
        `Security threat alert: ${values.reason || values.headline || 'Active threat'}`,
        `Terdeteksi ancaman berita: ${values.reason || values.headline || 'Ancaman aktif'}`
      );
    }
    if (gateName === 'candidate_filter') {
      return values.reason || l(
        `Strategy score (${values.score ?? 0}) below threshold (${values.threshold ?? 60})`,
        `Skor strategi (${values.score ?? 0}) berada di bawah batas ambang (${values.threshold ?? 60})`
      );
    }
    if (gateName === 'circuit_breaker') {
      return l(
        `Daily loss limit (${values.dailyLossPct ?? 0}%) reached`,
        `Batas rugi harian (${values.dailyLossPct ?? 0}%) telah tercapai`
      );
    }
    if (gateName === 'exposure') {
      return l(
        `Position capacity full (${values.openTrades ?? 0}/${values.maxTrades ?? 0})`,
        `Slot posisi terbuka penuh (${values.openTrades ?? 0}/${values.maxTrades ?? 0})`
      );
    }
    if (gateName === 'ai_gate') {
      return values.reasoning || values.reason || l(
        'AI Evaluator recommends awaiting further momentum confirmation',
        'AI Evaluator menyarankan menunggu momentum lebih terkonfirmasi'
      );
    }

    return JSON.stringify(values);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-5 shadow-sm space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 text-blue-400 border border-blue-500/30">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                {l('9 Market Entry Defense Gates & Opportunity Radar', 'Diagnostik 9 Gerbang Masuk Pasar & Radar Peluang')}
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              {l(
                'Selection logic transparency — Answers "Why has or hasn\'t the bot entered a position yet?"',
                'Transparansi logika seleksi koin — Menjawab "Mengapa bot belum atau sedang melakukan pembelian?"'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
            <span>{l('Refresh', 'Segarkan')}</span>
          </button>
          <span className="text-[10px] text-slate-500 font-mono">
            {lastUpdated.toLocaleTimeString(language === 'id' ? 'id-ID' : 'en-US')}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('gates')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'gates'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{l('9 Entry Gates Status', 'Status 9 Gerbang Masuk')}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900/60 font-mono ml-1">
              {totalEvaluated} {l('evals', 'evaluasi')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('radar')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'radar'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>{l('Opportunity & News Radar', 'Radar Peluang & Berita')}</span>
            {radar && radar.shortlists.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-mono ml-1">
                {radar.shortlists.length} {l('candidates', 'kandidat')}
              </span>
            )}
          </button>
        </div>

        {/* Quick Health Summary Pill */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="text-slate-400">{l('Pass Rate:', 'Tingkat Lolos Sinyal:')}</span>
          <span className="font-bold font-mono text-emerald-400">{passRatePercent}%</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: 9 ENTRY GATES GRID & RECENT REJECTIONS                             */}
      {/* ========================================================================= */}
      {activeTab === 'gates' && (
        <div className="space-y-5">
          {/* Status Explanation Card */}
          <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-950/20 text-xs text-blue-200 flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-slate-100 block">
                {l('How the 9 Defense Gates Work', 'Bagaimana 9 Gerbang Pengaman Bekerja?')}
              </span>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {l(
                  'Every 15 seconds, the engine scans candidate assets through all 9 sequential gates below. An order is ONLY executed if it clears all 9 gates with zero risk violations.',
                  'Setiap 15 detik, mesin memindai seluruh aset kripto melalui 9 lapis filter ketat di bawah ini secara sekuensial. Sebuah order hanya dieksekusi jika berhasil melewati seluruh 9 gerbang tanpa ada satu pun pelanggaran risiko.'
                )}
              </p>
            </div>
          </div>

          {/* 9 Gates Visual Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {gateMetas.map((meta) => {
              const stat = gates[meta.key] || { passed: 0, failed: 0 };
              const total = stat.passed + stat.failed;
              const passPct = total > 0 ? Math.round((stat.passed / total) * 100) : 100;
              const hasFails = stat.failed > 0;

              return (
                <div
                  key={meta.key}
                  className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 transition-all space-y-2 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-200 truncate" title={meta.name}>
                        {meta.name}
                      </span>
                      {hasFails ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-400 border border-amber-500/30">
                          {stat.failed} {l('held', 'ditahan')}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> {l('100% Safe', '100% Aman')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug line-clamp-2" title={meta.description}>
                      {meta.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="text-emerald-400">{stat.passed} {l('passed', 'lolos')}</span>
                      <span className={hasFails ? 'text-amber-400' : 'text-slate-500'}>
                        {stat.failed} {l('rejected', 'ditolak')} ({passPct}%)
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full transition-all"
                        style={{ width: `${passPct}%` }}
                      />
                      <div
                        className="bg-amber-500 h-full transition-all"
                        style={{ width: `${100 - passPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent Rejections Log */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                  {l('Recent Rejection Logs — Why Weren\'t Coins Entered?', 'Log Penolakan Terakhir — Mengapa Koin Belum Dibeli?')}
                </h4>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {recentRejections.length} {l('logged rejections', 'penolakan tercatat')}
              </span>
            </div>

            {recentRejections.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                <p>{l('No gate rejection logs recorded in the last 24 hours.', 'Belum ada rekaman penolakan gerbang 24 jam terakhir.')}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {l('Market signals are stable and meet defined criteria.', 'Sinyal pasar stabil dan memenuhi parameter yang ditentukan.')}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {recentRejections.map((rej, idx) => {
                  const gateInfo = gateMetas.find((g) => g.key === rej.gate_name);
                  const gateTitle = gateInfo ? gateInfo.name : rej.gate_name;

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-start sm:items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-slate-200 bg-slate-800 border border-slate-700 shrink-0">
                          {rej.symbol.toUpperCase()}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-amber-300">
                              {gateTitle}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                            {formatRejectionReason(rej.gate_name, rej.values)}
                          </p>
                        </div>
                      </div>

                      <div className="text-[10px] font-mono text-slate-500 shrink-0 self-end sm:self-auto">
                        {new Date(rej.ts).toLocaleTimeString(language === 'id' ? 'id-ID' : 'en-US')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SECTION 9 RADAR & REGIME INSIGHTS                                  */}
      {/* ========================================================================= */}
      {activeTab === 'radar' && radar && (
        <div className="space-y-5">
          {/* Macro Regime Banner */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <BarChart2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 uppercase font-mono">{l('BTC Macro Regime Status:', 'Status Rezim Makro BTC:')}</span>
                  <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded border ${
                    radar.regimes[0]?.regime === 'RISK_ON'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                      : radar.regimes[0]?.regime === 'CRASH'
                      ? 'bg-rose-950 text-rose-300 border-rose-500/40'
                      : 'bg-amber-950 text-amber-300 border-amber-500/40'
                  }`}>
                    {radar.regimes[0]?.regime || 'NEUTRAL'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  1h return: <strong className="text-slate-200 font-mono">{(radar.regimes[0]?.ret_1h ?? 0) >= 0 ? '+' : ''}{(radar.regimes[0]?.ret_1h ?? 0).toFixed(2)}%</strong>
                  {' | '}
                  4h return: <strong className="text-slate-200 font-mono">{(radar.regimes[0]?.ret_4h ?? 0) >= 0 ? '+' : ''}{(radar.regimes[0]?.ret_4h ?? 0).toFixed(2)}%</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block uppercase">{l('Lexicon Sentiment', 'Sentimen Lexicon')}</span>
                <span className={`font-bold ${(radar.averageSentiment ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(radar.averageSentiment ?? 0) >= 0 ? '+' : ''}{(radar.averageSentiment ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block uppercase">{l('Active Threats', 'Ancaman Aktif')}</span>
                <span className={`font-bold ${radar.threatCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {radar.threatCount} Scoped
                </span>
              </div>
            </div>
          </div>

          {/* Shortlisted Opportunities */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>{l('Radar Opportunity Shortlist', 'Daftar Koin Terpilih Radar (Opportunity Shortlist)')}</span>
            </h4>

            {radar.shortlists.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 text-center text-xs text-slate-400">
                <p>{l('No coins met the threshold score on the last scan cycle.', 'Belum ada koin yang memenuhi skor ambang batas pada pemindaian terakhir.')}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {l('The radar automatically evaluates every 15-second market cycle.', 'Radar otomatis menilai setiap siklus tick pasar (15 detik).')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {radar.shortlists.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold font-mono text-slate-100">
                          {item.symbol.toUpperCase()}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/50 text-blue-300 border border-blue-500/30">
                          {item.strategy}
                        </span>
                      </div>
                      <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                        item.passed === 1
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                          : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                      }`}>
                        {l('Score:', 'Skor:')} {item.score} / {item.threshold}
                      </span>
                    </div>

                    {/* Breakdown Details */}
                    {item.breakdown && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-[10px] font-mono">
                        <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/80">
                          <span className="text-slate-500 block">{l('EMA Structure', 'Struktur EMA')}</span>
                          <span className="text-slate-200 font-bold">+{item.breakdown.trendEma ?? 0}</span>
                        </div>
                        <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/80">
                          <span className="text-slate-500 block">{l('RSI Dip', 'RSI Dip')}</span>
                          <span className="text-slate-200 font-bold">+{item.breakdown.rsiPullback ?? 0}</span>
                        </div>
                        <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/80">
                          <span className="text-slate-500 block">{l('Order Book', 'Order Book')}</span>
                          <span className="text-slate-200 font-bold">+{item.breakdown.orderBookSupport ?? 0}</span>
                        </div>
                        <div className="bg-slate-950/50 p-1.5 rounded border border-slate-800/80">
                          <span className="text-slate-500 block">{l('Lexicon Bonus', 'Lexicon Bonus')}</span>
                          <span className="text-slate-200 font-bold">+{item.breakdown.sentimentBonus ?? 0}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
