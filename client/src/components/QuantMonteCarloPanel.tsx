import React from 'react';
import { Shield, Zap, Activity, AlertTriangle, TrendingUp } from 'lucide-react';
import { InstitutionalQuantMetrics, MonteCarloResult } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface QuantMonteCarloPanelProps {
  quantMetrics?: InstitutionalQuantMetrics;
  monteCarlo?: MonteCarloResult;
}

export const QuantMonteCarloPanel: React.FC<QuantMonteCarloPanelProps> = ({
  quantMetrics,
  monteCarlo,
}) => {
  const { l, formatCurrency } = useLanguage();

  if (!quantMetrics && !monteCarlo) return null;

  const verdictBadge = (verdict: MonteCarloResult['verdict']) => {
    switch (verdict) {
      case 'INSTITUTIONAL_GRADE':
        return {
          cls: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
          label: l('INSTITUTIONAL GRADE', 'STANDAR INSTITUSIONAL'),
        };
      case 'ROBUST':
        return {
          cls: 'bg-blue-950/60 text-blue-300 border-blue-500/40',
          label: l('ROBUST EDGE', 'EDGE ROBUST'),
        };
      case 'FRAGILE':
        return {
          cls: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
          label: l('FRAGILE / VARIANCE SENSITIVE', 'RENTAN VARIANSI'),
        };
      case 'HIGH_RUIN_RISK':
        return {
          cls: 'bg-rose-950/60 text-rose-300 border-rose-500/40',
          label: l('HIGH DRAWDOWN / RUIN RISK', 'RISIKO DRAWDOWN TINGGI'),
        };
      default:
        return {
          cls: 'bg-slate-900 text-slate-400 border-slate-700',
          label: l('NEEDS 3+ TRADES', 'BUTUH MIN 3 TRADE'),
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Institutional Risk-Adjusted Quant Ratios */}
      {quantMetrics && (
        <div className="rounded-2xl border border-indigo-500/25 bg-[#0b101b] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span>
                {l(
                  'Institutional Risk-Adjusted Ratios (Sharpe • Sortino • Calmar • SQN)',
                  'Rasio Risiko-Terkoreksi Institusional (Sharpe • Sortino • Calmar • SQN)'
                )}
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
              SQN Rating: {quantMetrics.sqnRating}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs font-mono">
            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-sans block">Sharpe Ratio</span>
              <div className={`text-sm font-bold ${(quantMetrics.sharpeRatio ?? 0) >= 1.5 ? 'text-emerald-400' : (quantMetrics.sharpeRatio ?? 0) >= 0.8 ? 'text-blue-400' : 'text-slate-300'}`}>
                {quantMetrics.sharpeRatio !== null ? quantMetrics.sharpeRatio.toFixed(2) : '—'}
              </div>
              <span className="text-[9px] text-slate-500 font-sans block">{l('Annualized', 'Tahunan')}</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-sans block">Sortino Ratio</span>
              <div className={`text-sm font-bold ${(quantMetrics.sortinoRatio ?? 0) >= 2.0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                {quantMetrics.sortinoRatio !== null ? quantMetrics.sortinoRatio.toFixed(2) : '—'}
              </div>
              <span className="text-[9px] text-slate-500 font-sans block">{l('Downside Risk', 'Risiko Turun')}</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-sans block">Calmar Ratio</span>
              <div className="text-sm font-bold text-slate-200">
                {quantMetrics.calmarRatio !== null ? quantMetrics.calmarRatio.toFixed(2) : '—'}
              </div>
              <span className="text-[9px] text-slate-500 font-sans block">CAGR / MaxDD</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-sans block">SQN (Van Tharp)</span>
              <div className={`text-sm font-bold ${(quantMetrics.sqn ?? 0) >= 2.0 ? 'text-emerald-400' : (quantMetrics.sqn ?? 0) >= 1.2 ? 'text-amber-400' : 'text-slate-300'}`}>
                {quantMetrics.sqn !== null ? quantMetrics.sqn.toFixed(2) : '—'}
              </div>
              <span className="text-[9px] text-slate-500 font-sans block">{quantMetrics.sqnRating}</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-sans block">{l('Payoff Ratio', 'Rasio Payoff')}</span>
              <div className="text-sm font-bold text-indigo-300">
                {quantMetrics.payoffRatio !== null ? `${quantMetrics.payoffRatio}x` : '∞'}
              </div>
              <span className="text-[9px] text-slate-500 font-sans block">
                +{quantMetrics.avgWinPercent}% / -{quantMetrics.avgLossPercent}%
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-sans block">{l('Expectancy', 'Ekspektasi')}</span>
              <div className={`text-sm font-bold ${quantMetrics.expectancyIdr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {quantMetrics.expectancyPercent >= 0 ? '+' : ''}{quantMetrics.expectancyPercent}%
              </div>
              <span className="text-[9px] text-slate-500 font-sans block">
                {formatCurrency(quantMetrics.expectancyIdr)}/trade
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-sans block">Ulcer Index</span>
              <div className="text-sm font-bold text-slate-200">
                {quantMetrics.ulcerIndex.toFixed(2)}
              </div>
              <span className="text-[9px] text-slate-500 font-sans block">{l('Optimal Kelly', 'Kelly')}: {quantMetrics.kellyPercent}%</span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-sans block">{l('Win/Loss Streak', 'Streak M/K')}</span>
              <div className="text-sm font-bold text-slate-200">
                <span className="text-emerald-400">{quantMetrics.maxConsecutiveWins}W</span>
                {' / '}
                <span className="text-rose-400">{quantMetrics.maxConsecutiveLosses}L</span>
              </div>
              <span className="text-[9px] text-slate-500 font-sans block">{l('Max consecutive', 'Beruntun maks')}</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Monte Carlo 1,000-Path Bootstrap Stress Test & Fan Chart */}
      {monteCarlo && monteCarlo.verdict !== 'INSUFFICIENT_TRADES' && (
        <div className="rounded-2xl border border-emerald-500/20 bg-[#0b101b] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>
                {l(
                  `Monte Carlo Bootstrap Stress-Test (${monteCarlo.iterations.toLocaleString()} Paths × ${monteCarlo.horizonTrades} Trades)`,
                  `Uji Stres Bootstrap Monte Carlo (${monteCarlo.iterations.toLocaleString()} Skenario × ${monteCarlo.horizonTrades} Trade)`
                )}
              </span>
            </div>
            <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border ${verdictBadge(monteCarlo.verdict).cls}`}>
              {verdictBadge(monteCarlo.verdict).label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs font-mono">
            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50">
              <span className="text-[10px] text-slate-400 font-sans block">{l('Median Terminal Equity', 'Ekuitas Median (P50)')}</span>
              <div className="text-sm font-bold text-emerald-400">
                {formatCurrency(monteCarlo.terminalEquity.median)}
              </div>
              <span className="text-[10px] text-slate-500">
                {monteCarlo.netReturnPercent.median >= 0 ? '+' : ''}{monteCarlo.netReturnPercent.median}%
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50">
              <span className="text-[10px] text-slate-400 font-sans block">{l('Worst 5% Floor (P5)', 'Batas Bawah 5% (P5)')}</span>
              <div className={`text-sm font-bold ${monteCarlo.terminalEquity.p5 >= monteCarlo.initialCapitalIdr ? 'text-emerald-300' : 'text-amber-400'}`}>
                {formatCurrency(monteCarlo.terminalEquity.p5)}
              </div>
              <span className="text-[10px] text-slate-500">
                {monteCarlo.netReturnPercent.p5 >= 0 ? '+' : ''}{monteCarlo.netReturnPercent.p5}%
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50">
              <span className="text-[10px] text-slate-400 font-sans block">{l('Upside 95% (P95)', 'Skenario Atas (P95)')}</span>
              <div className="text-sm font-bold text-indigo-300">
                {formatCurrency(monteCarlo.terminalEquity.p95)}
              </div>
              <span className="text-[10px] text-slate-500">
                +{monteCarlo.netReturnPercent.p95}%
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50">
              <span className="text-[10px] text-slate-400 font-sans block">{l('P95 Worst Drawdown', 'Drawdown Terburuk P95')}</span>
              <div className={`text-sm font-bold ${monteCarlo.maxDrawdownPercent.p95 <= 12 ? 'text-emerald-400' : 'text-amber-400'}`}>
                -{monteCarlo.maxDrawdownPercent.p95}%
              </div>
              <span className="text-[10px] text-slate-500 font-sans">
                Median DD: -{monteCarlo.maxDrawdownPercent.median}%
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50">
              <span className="text-[10px] text-slate-400 font-sans block">VaR 95% / CVaR 95%</span>
              <div className="text-sm font-bold text-slate-200">
                -{monteCarlo.var95Percent}% / -{monteCarlo.cvar95Percent}%
              </div>
              <span className="text-[10px] text-slate-500 font-sans">
                {l('Tail Expected Shortfall', 'Risiko Ekor Ekstrem')}
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50">
              <span className="text-[10px] text-slate-400 font-sans block">{l('Profit Prob / Ruin Risk', 'Peluang Profit / Ruin')}</span>
              <div className="text-sm font-bold">
                <span className="text-emerald-400">{monteCarlo.probabilityOfProfitPercent}%</span>
                {' / '}
                <span className={monteCarlo.probabilityOfRuinPercent > 5 ? 'text-rose-400' : 'text-slate-300'}>
                  {monteCarlo.probabilityOfRuinPercent}%
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-sans">
                Ruin &ge; {monteCarlo.ruinThresholdPercent}% DD
              </span>
            </div>
          </div>

          {/* Monte Carlo Confidence Fan Chart (P5-P95 & P25-P75 Shaded Cone + P50 Median) */}
          {monteCarlo.fanChart.length >= 2 && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  {l('Probability Cone (P5–P95 Outer Band • P25–P75 Core • P50 Median)', 'Kerucut Probabilitas Ekuitas (Pita P5–P95 • Inti P25–P75 • Median P50)')}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {monteCarlo.sampleTradesCount} {l('historical trades resampled', 'trade historis di-resample')}
                </span>
              </div>

              <div className="h-40 w-full relative">
                {(() => {
                  const pts = monteCarlo.fanChart;
                  const allVals = pts.flatMap((p) => [p.p5, p.p95]);
                  const minV = Math.min(...allVals) * 0.995;
                  const maxV = Math.max(...allVals) * 1.005;
                  const span = maxV - minV || 1;
                  const xOf = (idx: number) => (idx / (pts.length - 1)) * 1000;
                  const yOf = (val: number) => 150 - ((val - minV) / span) * 135;

                  const outerTop = pts.map((p, i) => `${xOf(i)},${yOf(p.p95)}`).join(' ');
                  const outerBot = [...pts].reverse().map((p, i) => `${xOf(pts.length - 1 - i)},${yOf(p.p5)}`).join(' ');
                  const innerTop = pts.map((p, i) => `${xOf(i)},${yOf(p.p75)}`).join(' ');
                  const innerBot = [...pts].reverse().map((p, i) => `${xOf(pts.length - 1 - i)},${yOf(p.p25)}`).join(' ');
                  const medianLine = pts.map((p, i) => `${xOf(i)},${yOf(p.median)}`).join(' ');
                  const baseY = yOf(monteCarlo.initialCapitalIdr);

                  return (
                    <svg viewBox="0 0 1000 160" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                      <polygon points={`${outerTop} ${outerBot}`} fill="#10b981" fillOpacity="0.10" />
                      <polygon points={`${innerTop} ${innerBot}`} fill="#10b981" fillOpacity="0.20" />
                      <line x1="0" y1={baseY} x2="1000" y2={baseY} stroke="#64748b" strokeDasharray="4 4" strokeWidth="1" />
                      <polyline
                        points={medianLine}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
