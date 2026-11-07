import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Gauge, CheckCircle2, XCircle, Info, Sparkles } from 'lucide-react';
import { PerformanceReport } from '../types';
import { api, authStorage } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { computeReadiness, ReadinessResult } from '../utils/readiness';

interface LiveReadinessCardProps {
  /** Current trading mode ('paper' | 'live') from SystemStatus. */
  mode: string;
  className?: string;
}

const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * "Skor Kesiapan Live" — beginner-friendly checklist telling the user whether
 * their paper-trading track record justifies considering live mode.
 * Data is fetched ONCE on mount plus a manual refresh; deliberately no polling.
 */
export const LiveReadinessCard: React.FC<LiveReadinessCardProps> = ({ mode, className = '' }) => {
  const { l } = useLanguage();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchFailed, setFetchFailed] = useState<boolean>(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPerformanceReport('all');
      setReport(data);
      setFetchFailed(false);
    } catch {
      // Silent: keep whatever we had; the card degrades to the onboarding state.
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Observer (tanpa token admin): endpoint laporan bersifat admin-only.
    // Mem-fetch-nya akan memicu 401 + modal login global untuk pengunjung
    // yang sedang melihat-lihat — lewati saja dan tampilkan state onboarding.
    if (!authStorage.getToken()) {
      setLoading(false);
      return;
    }
    fetchReport();
  }, [fetchReport]);

  const result: ReadinessResult = computeReadiness(report, mode);

  // Neutral info state once the user is already trading real funds.
  if (mode === 'live') {
    return (
      <div className={`rounded-2xl border border-slate-800/80 bg-[#0b101b] p-4 sm:p-5 shadow-sm ${className}`}>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-100">{l('Live Readiness Score', 'Skor Kesiapan Live')}</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              <span>
                {l(
                  'You are already in live mode — this card is for preparing your paper trading results before going live.',
                  'Anda sudah berada di mode live — kartu ini untuk mempersiapkan hasil paper trading sebelum masuk mode live.'
                )}
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const scoreTone =
    result.score >= 70
      ? { text: 'text-emerald-400', stroke: '#34d399', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
      : result.score >= 40
      ? { text: 'text-amber-400', stroke: '#fbbf24', bg: 'bg-amber-500/10', border: 'border-amber-500/30' }
      : { text: 'text-rose-400', stroke: '#fb7185', bg: 'bg-rose-500/10', border: 'border-rose-500/30' };

  const tierLabel =
    result.tier === 'siap'
      ? l('Ready to consider', 'Siap dipertimbangkan')
      : result.tier === 'hampir'
      ? l('Almost ready', 'Hampir siap')
      : l('Not yet ready', 'Belum siap');

  const hasNoHistory = !report || !report.totalTrades;

  // Per-criterion bilingual copy (keyed off the readiness item key).
  const copy: Record<ReadinessResult['items'][number]['key'], { label: string; pass: string; fail: string }> = {
    trades: {
      label: l('Closed trades', 'Trade tertutup'),
      pass: l('Enough closed trades to judge the bot fairly.', 'Data trade tertutup sudah cukup untuk menilai bot secara adil.'),
      fail: l('Keep paper trading — at least 20 closed trades are needed.', 'Lanjutkan paper trading — butuh minimal 20 trade tertutup.'),
    },
    winRate: {
      label: l('Win rate', 'Tingkat kemenangan'),
      pass: l('Wins consistently outweigh losses (target 45%+).', 'Kemenangan konsisten lebih banyak dari kerugian (target 45%+).'),
      fail: l('Win rate is still below the 45% safety line.', 'Win rate masih di bawah garis aman 45%.'),
    },
    netPnl: {
      label: l('Net profit / loss', 'Profit / rugi bersih'),
      pass: l('Overall the track record is in profit.', 'Secara keseluruhan catatan trading sedang profit.'),
      fail: l('Overall result is not yet profitable.', 'Hasil keseluruhan belum profit.'),
    },
    drawdown: {
      label: l('Max drawdown', 'Penurunan maksimal'),
      pass: l('Equity dips stayed within the 15% safety limit.', 'Penurunan equity masih dalam batas aman 15%.'),
      fail: l('Equity once dropped more than 15% — too volatile for live.', 'Equity pernah turun lebih dari 15% — terlalu berisiko untuk live.'),
    },
    profitFactor: {
      label: l('Profit vs loss ratio', 'Rasio profit vs rugi'),
      pass: l('Profits clearly outweigh losses (target 1.2+).', 'Profit jelas lebih besar dari kerugian (target 1.2+).'),
      fail: l('Profits do not yet outweigh losses (target 1.2+).', 'Profit belum melebihi kerugian (target 1.2+).'),
    },
  };

  return (
    <div className={`rounded-2xl border ${scoreTone.border} bg-[#0b101b] p-4 sm:p-5 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl border ${scoreTone.bg} ${scoreTone.border} ${scoreTone.text} shrink-0`}>
            <Gauge className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-100">{l('Live Readiness Score', 'Skor Kesiapan Live')}</h3>
            <p className="text-[11px] text-slate-400 truncate">
              {l('Based on your all-time paper trading results.', 'Berdasarkan seluruh hasil paper trading Anda sejauh ini.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchReport}
          disabled={loading}
          aria-label={l('Refresh readiness score', 'Segarkan skor kesiapan')}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
          <span>{l('Refresh', 'Segarkan')}</span>
        </button>
      </div>

      {/* Onboarding state: no measurable history yet */}
      {hasNoHistory ? (
        <div className="pt-4 pb-1 flex flex-col sm:flex-row items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/30 text-blue-300 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="text-xs text-slate-300 leading-relaxed text-center sm:text-left">
            {fetchFailed
              ? l(
                  'Readiness data could not be loaded right now. Please refresh in a moment.',
                  'Data kesiapan belum dapat dimuat saat ini. Coba segarkan beberapa saat lagi.'
                )
              : l(
                  'No closed trades yet. Run paper trading for a few days and your readiness score will appear here automatically.',
                  'Belum ada trade yang selesai. Jalankan paper trading beberapa hari, skor kesiapan akan muncul di sini.'
                )}
          </p>
        </div>
      ) : (
        <div className="pt-4 flex flex-col md:flex-row gap-5">
          {/* Score ring */}
          <div className="flex items-center gap-4 shrink-0 mx-auto md:mx-0">
            <div className="relative w-[84px] h-[84px]" role="img" aria-label={`${l('Readiness score', 'Skor kesiapan')}: ${result.score}/100`}>
              <svg className="w-full h-full -rotate-90" viewBox="0 0 84 84">
                <circle cx="42" cy="42" r={RING_RADIUS} fill="none" stroke="#1e293b" strokeWidth="7" />
                <circle
                  cx="42"
                  cy="42"
                  r={RING_RADIUS}
                  fill="none"
                  stroke={scoreTone.stroke}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - result.score / 100)}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-extrabold font-mono ${scoreTone.text} leading-none`}>{result.score}</span>
                <span className="text-[9px] text-slate-500 font-mono">/100</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${scoreTone.bg} ${scoreTone.border} ${scoreTone.text}`}>
                {tierLabel}
              </span>
              <p className="text-[11px] text-slate-400">
                {result.items.filter((i) => i.ok).length}/5 {l('criteria met', 'kriteria terpenuhi')}
              </p>
            </div>
          </div>

          {/* Checklist */}
          <div className="flex-1 min-w-0 space-y-2.5">
            {result.items.map((item) => {
              const c = copy[item.key];
              return (
                <div key={item.key} className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {item.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400/80 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-200">{c.label}</span>
                      <p className="text-[11px] text-slate-400 leading-snug">{item.ok ? c.pass : c.fail}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-300 shrink-0 mt-0.5">{item.detail}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer note */}
      <p className="pt-3 mt-3 border-t border-slate-800/60 text-[10px] text-slate-500 leading-relaxed">
        {l(
          'Live mode should only be considered after this score is green. Past performance does not guarantee future results.',
          'Mode live sebaiknya dipertimbangkan hanya setelah skor ini hijau. Kinerja masa lalu tidak menjamin hasil masa depan.'
        )}
      </p>
    </div>
  );
};
