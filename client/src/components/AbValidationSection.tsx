import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Ghost,
  RefreshCw,
  Sparkles,
  Award
} from 'lucide-react';
import { api } from '../services/api';
import { AbValidationMetrics } from '../types';

export const AbValidationSection: React.FC = () => {
  const [metrics, setMetrics] = useState<AbValidationMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'ghosts' | 'evaluations'>('overview');

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAbMetrics();
      setMetrics(data);
    } catch (err) {
      console.error('Failed to fetch A/B validation metrics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const timer = setInterval(fetchMetrics, 12000);
    return () => clearInterval(timer);
  }, [fetchMetrics]);

  if (!metrics) {
    return (
      <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-6 text-center text-slate-400 text-sm">
        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-400" />
        Memuat data telemetri validasi A/B & AI Alpha...
      </div>
    );
  }

  const { alpha, groupAWithAi, groupBCounterfactual, combinedWithoutAi, recentEvaluations, activeGhosts } = metrics;
  const isAlphaPositive = alpha.pnlAlphaIdr >= 0;
  const isWinRateAlphaPositive = alpha.winRateDeltaPercent >= 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-sm space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">
                Uji Efektivitas AI
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-950/40 text-indigo-300 font-mono">
                Bukti Empiris
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Validasi pembuktian nilai tambah (Alpha) layer AI Manajer Risiko vs sinyal mekanikal murni tanpa filter.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sub Navigation Pills */}
          <div className="flex bg-slate-900/80 border border-slate-800 p-1 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'overview' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Matriks Efektivitas
            </button>
            <button
              onClick={() => setActiveTab('ghosts')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'ghosts' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Ghost className="h-3.5 w-3.5" />
              Posisi Bayangan ({activeGhosts.length})
            </button>
            <button
              onClick={() => setActiveTab('evaluations')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'evaluations' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Log Evaluasi ({metrics.totalEvaluations})
            </button>
          </div>

          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Net Alpha IDR */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">Nilai Tambah AI (IDR)</span>
            {isAlphaPositive ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-400" />
            )}
          </div>
          <div className={`text-2xl font-bold font-mono ${isAlphaPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isAlphaPositive ? '+' : ''}Rp {Math.round(alpha.pnlAlphaIdr).toLocaleString('id-ID')}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 leading-snug">
            Nilai tambah bersih filter AI: Kerugian dihindari dikurangi peluang terlewat.
          </p>
        </div>

        {/* Card 2: Win Rate Delta */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">Selisih Win Rate</span>
            <Activity className="h-4 w-4 text-indigo-400" />
          </div>
          <div className={`text-2xl font-bold font-mono ${isWinRateAlphaPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isWinRateAlphaPositive ? '+' : ''}{alpha.winRateDeltaPercent.toFixed(1)}%
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 leading-snug">
            {groupAWithAi.winRatePercent.toFixed(1)}% (Dengan AI) vs {combinedWithoutAi.winRatePercent.toFixed(1)}% (Tanpa AI)
          </p>
        </div>

        {/* Card 3: Bullets Dodged (Loss Avoided) */}
        <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-300">Kerugian Terhindar</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {groupBCounterfactual.bulletsDodged} Sinyal
          </div>
          <p className="mt-1.5 text-[11px] text-emerald-300/80 leading-snug">
            Hemat <span className="font-semibold text-emerald-300">Rp {Math.round(groupBCounterfactual.savedCapitalIdr).toLocaleString('id-ID')}</span> dari posisi rugi yang ditolak AI.
          </p>
        </div>

        {/* Card 4: Opportunities Missed */}
        <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-amber-300">Peluang Terlewat</span>
            <ShieldAlert className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {groupBCounterfactual.opportunitiesMissed} Sinyal
          </div>
          <p className="mt-1.5 text-[11px] text-amber-300/80 leading-snug">
            Terlewat <span className="font-semibold text-amber-300">Rp {Math.round(groupBCounterfactual.missedProfitIdr).toLocaleString('id-ID')}</span> potensi profit pada koin yang ditolak.
          </p>
        </div>
      </div>

      {/* Tab 1: Overview & A/B Comparison Matrix */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                Matriks Komparasi Empiris: Grup A (Dengan AI) vs Grup B (Posisi Bayangan Sinyal Ditolak) vs Baseline (Tanpa AI)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Total Sinyal Dievaluasi: {metrics.totalEvaluations} ({metrics.approvalRatePercent.toFixed(1)}% Disetujui, {metrics.rejectionRatePercent.toFixed(1)}% Ditolak)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                    <th className="py-2.5 px-4 font-medium">Metrik Performa</th>
                    <th className="py-2.5 px-4 font-medium text-indigo-400">Grup A (Dengan Filter AI)</th>
                    <th className="py-2.5 px-4 font-medium text-amber-400">Grup B (Posisi Bayangan Ditolak)</th>
                    <th className="py-2.5 px-4 font-medium text-slate-300">Hipotetis (Tanpa Filter AI)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  <tr>
                    <td className="py-2.5 px-4 text-slate-400 font-sans">Total Eksekusi Selesai</td>
                    <td className="py-2.5 px-4 font-bold text-indigo-300">{groupAWithAi.totalTrades} Trade</td>
                    <td className="py-2.5 px-4 font-bold text-amber-300">{groupBCounterfactual.closedGhosts} Posisi Bayangan</td>
                    <td className="py-2.5 px-4 font-bold text-slate-300">{combinedWithoutAi.totalTrades} Trade Gabungan</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-slate-400 font-sans">Win Rate (%)</td>
                    <td className="py-2.5 px-4 font-bold text-emerald-400">{groupAWithAi.winRatePercent.toFixed(1)}%</td>
                    <td className="py-2.5 px-4 text-amber-300">{groupBCounterfactual.counterfactualWinRatePercent.toFixed(1)}%</td>
                    <td className="py-2.5 px-4 text-slate-300">{combinedWithoutAi.winRatePercent.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-slate-400 font-sans">Menang / Kalah</td>
                    <td className="py-2.5 px-4 text-slate-300">{groupAWithAi.wins} Win / {groupAWithAi.losses} Loss</td>
                    <td className="py-2.5 px-4 text-slate-300">{groupBCounterfactual.counterfactualWins} Win / {groupBCounterfactual.closedGhosts - groupBCounterfactual.counterfactualWins} Loss</td>
                    <td className="py-2.5 px-4 text-slate-300">{combinedWithoutAi.wins} Win / {combinedWithoutAi.losses} Loss</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-slate-400 font-sans">Total Realized PnL (IDR)</td>
                    <td className={`py-2.5 px-4 font-bold ${groupAWithAi.totalPnlIdr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {groupAWithAi.totalPnlIdr >= 0 ? '+' : ''}Rp {Math.round(groupAWithAi.totalPnlIdr).toLocaleString('id-ID')}
                    </td>
                    <td className={`py-2.5 px-4 font-bold ${groupBCounterfactual.counterfactualPnlIdr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {groupBCounterfactual.counterfactualPnlIdr >= 0 ? '+' : ''}Rp {Math.round(groupBCounterfactual.counterfactualPnlIdr).toLocaleString('id-ID')}
                    </td>
                    <td className={`py-2.5 px-4 font-bold ${combinedWithoutAi.totalPnlIdr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {combinedWithoutAi.totalPnlIdr >= 0 ? '+' : ''}Rp {Math.round(combinedWithoutAi.totalPnlIdr).toLocaleString('id-ID')}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-slate-400 font-sans">Efisiensi Proteksi (Rasio Kerugian Terhindar)</td>
                    <td className="py-2.5 px-4 font-bold text-indigo-300">—</td>
                    <td className="py-2.5 px-4 font-bold text-emerald-400">
                      {alpha.dodgedLossRatioPercent.toFixed(1)}% Kerugian Terhindar
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/30 text-xs text-slate-400 flex items-start gap-2.5">
            <Sparkles className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
            <p className="leading-relaxed font-sans">
              <strong className="text-slate-200">Bagaimana sistem membuktikan efektivitas AI: </strong> 
              Setiap kali sinyal pasar terdeteksi, AI Manajer Risiko memutuskan apakah akan masuk (Grup A) atau menolak (Grup B). Sinyal yang ditolak tidak menyentuh modal pengguna, namun dicatat sebagai <em>Posisi Bayangan (Simulasi)</em> dan disimulasikan menggunakan trailing stop identik dengan transaksi nyata. Jika sinyal yang ditolak berakhir rugi, ini tercatat sebagai <strong className="text-emerald-400">Kerugian Terhindar</strong> (modal terselamatkan).
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Active Ghost Positions */}
      {activeTab === 'ghosts' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Posisi Shadow (Ghost) yang sedang berjalan di background:</span>
            <span className="font-mono">{activeGhosts.length} koin aktif dipantau</span>
          </div>

          {activeGhosts.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-8 text-center text-xs text-slate-400 space-y-2">
              <Ghost className="h-6 w-6 mx-auto text-slate-600" />
              <p>Tidak ada Ghost Position yang sedang aktif saat ini.</p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Ketika AI Master Evaluator menolak sinyal entry dari koin kandidat, koin tersebut akan langsung muncul di sini dan trailing stop-nya disimulasikan secara real-time.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                    <th className="py-2.5 px-4 font-medium">Koin</th>
                    <th className="py-2.5 px-4 font-medium">Harga Masuk</th>
                    <th className="py-2.5 px-4 font-medium">Harga Live</th>
                    <th className="py-2.5 px-4 font-medium">Trailing Stop</th>
                    <th className="py-2.5 px-4 font-medium">Simulated PnL</th>
                    <th className="py-2.5 px-4 font-medium">Waktu Dibuka</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {activeGhosts.map((g) => {
                    const isProfit = (g.pnl_idr || 0) >= 0;
                    return (
                      <tr key={g.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 px-4 font-bold text-slate-100 flex items-center gap-1.5">
                          <Ghost className="h-3.5 w-3.5 text-amber-400" />
                          {g.symbol.toUpperCase()}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">
                          Rp {Math.round(g.entry_price).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-4 text-slate-200 font-semibold">
                          Rp {Math.round(g.current_price).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-4 text-rose-300 font-mono">
                          Rp {Math.round(g.trailing_stop_price).toLocaleString('id-ID')}
                        </td>
                        <td className={`py-2.5 px-4 font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}{(g.pnl_percent || 0).toFixed(2)}% (Rp {Math.round(g.pnl_idr || 0).toLocaleString('id-ID')})
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 font-sans">
                          {new Date(g.opened_at).toLocaleTimeString('id-ID')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Recent AI Evaluations Log */}
      {activeTab === 'evaluations' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>15 Keputusan Evaluasi Terakhir oleh AI Master Evaluator:</span>
            <span className="font-mono">Real-Time Audit</span>
          </div>

          {recentEvaluations.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-8 text-center text-xs text-slate-400">
              Belum ada evaluasi sinyal yang tercatat. Sinyal akan muncul saat bot memindai pasar.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
              {recentEvaluations.map((ev) => {
                const isApproved = ev.ai_verdict === 'APPROVED';
                return (
                  <div
                    key={ev.id}
                    className="p-3 rounded-lg border border-slate-800 bg-slate-900/40 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isApproved
                            ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-400'
                            : 'border-rose-500/30 bg-rose-950/40 text-rose-400'
                        }`}>
                          {ev.ai_verdict}
                        </span>
                        <span className="font-bold text-slate-100">{ev.symbol.toUpperCase()}</span>
                        <span className="text-slate-400 text-[11px]">
                          @ Rp {Math.round(ev.candidate_price).toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {ev.ghost_outcome && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 border ${
                            ev.ghost_outcome === 'BULLET_DODGED'
                              ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                              : 'border-amber-500/30 bg-amber-950/40 text-amber-300'
                          }`}>
                            {ev.ghost_outcome === 'BULLET_DODGED' ? (
                              <ShieldCheck className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <ShieldAlert className="h-3 w-3 text-amber-400" />
                            )}
                            {ev.ghost_outcome} ({ev.ghost_pnl_percent ? `${ev.ghost_pnl_percent.toFixed(1)}%` : ''})
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(ev.timestamp).toLocaleTimeString('id-ID')}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-300 space-y-1 font-sans">
                      <div>
                        <span className="text-slate-400 font-medium">Setup Sinyal: </span>
                        <span>{ev.technical_reason}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Pertimbangan AI: </span>
                        <span className="italic text-slate-300 font-mono text-[10px]">"{ev.ai_reasoning}"</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
