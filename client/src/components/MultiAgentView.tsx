import React, { useState, useEffect } from 'react';
import {
  Layers,
  Cpu,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Radio,
  FileText,
  TrendingUp,
  TrendingDown,
  Globe,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Sparkles,
  Info
} from 'lucide-react';
import { api } from '../services/api';
import { SubagentDef, SubagentLog } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

export const MultiAgentView: React.FC = () => {
  const { l, language } = useLanguage();
  const [agents, setAgents] = useState<SubagentDef[]>([]);
  const [logs, setLogs] = useState<SubagentLog[]>([]);
  const [sentiment, setSentiment] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [runningCycle, setRunningCycle] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'news' | 'market' | 'security'>('all');

  const loadSubagentsData = async () => {
    setLoading(true);
    try {
      const data = await api.getSubagents();
      setAgents(data.agents);
      setLogs(data.recentLogs);
      setSentiment(data.sentiment);
    } catch (e) {
      console.error('Error loading subagents data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubagentsData();
    const interval = setInterval(loadSubagentsData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRunCycle = async () => {
    setRunningCycle(true);
    try {
      await api.runSubagentsCycle();
      await loadSubagentsData();
    } catch (e) {
      console.error('Error triggering subagents cycle', e);
    } finally {
      setRunningCycle(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-[#0b101b]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>{l('AI Research Team (10 Analysts 24/7)', 'Tim Riset AI (10 Analis Bekerja 24 Jam)')}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-950/40 text-indigo-300 font-mono">
                {l('100+ Real-Time Sources', '100+ Sumber Real-Time')}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {l(
                '10 autonomous AI analysts continuously monitor global news, crypto tech stacks, on-chain whales, social sentiment, and exchange order books.',
                '10 Analis AI mandiri memantau berita global, ekosistem teknologi, whale on-chain, media sosial, dan sinyal bursa secara terus-menerus.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunCycle}
            disabled={runningCycle}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/20 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${runningCycle ? 'animate-spin' : ''}`} />
            <span>{runningCycle ? l('Running AI Research...', 'Menjalankan Riset AI...') : l('Run Research Now', 'Jalankan Riset Sekarang')}</span>
          </button>
        </div>
      </div>

      {/* Explanatory Context Bar */}
      <div className="p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-950/20 text-xs text-indigo-200 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-indigo-300 font-semibold">{l('How to Read Sentiment Scores: ', 'Cara Membaca Skor Sentimen: ')}</strong>
          <span>
            {l(
              'Scores range from -1.0 (High Caution / Risk Potential) to +1.0 (Highly Bullish / Opportunity). The bot only approves trades if sentiment is favorable and security checks report zero exploits or hacks.',
              'Skor berkisar dari -1.0 (Sangat Waspada / Potensi Risiko) sampai +1.0 (Sangat Bullish / Peluang). Bot hanya menyetujui transaksi jika sentimen berita mendukung dan Analis Keamanan memastikan nol indikasi exploit/hack.'
            )}
          </span>
        </div>
      </div>

      {/* Sentiment Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">
            {l('Aggregated Sentiment Score', 'Skor Sentimen Gabungan')}
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 flex items-center gap-2">
            <span>{sentiment?.averageSentiment > 0 ? `+${sentiment?.averageSentiment}` : sentiment?.averageSentiment || '0.00'}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-sans border ${
              (sentiment?.averageSentiment ?? 0) >= 0.2
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400'
                : (sentiment?.averageSentiment ?? 0) <= -0.2
                ? 'border-rose-500/40 bg-rose-950/40 text-rose-400'
                : 'border-slate-700 bg-slate-800 text-slate-300'
            }`}>
              {(sentiment?.averageSentiment ?? 0) >= 0.2 ? 'BULLISH' : (sentiment?.averageSentiment ?? 0) <= -0.2 ? 'BEARISH' : 'NEUTRAL'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {l('Calculated from 30 latest AI analyst reports (-1.0 to +1.0)', 'Dihitung dari 30 laporan analis AI terbaru (-1.0 s/d +1.0)')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">
            {l('Security Status & Threat Radar', 'Status Keamanan & Threat Radar')}
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 flex items-center gap-2">
            {(sentiment?.threatCount ?? 0) === 0 ? (
              <span className="text-emerald-400 flex items-center gap-1.5 text-base font-semibold">
                <ShieldCheck className="h-5 w-5" /> {l('Safe (0 Threats)', 'Aman (0 Ancaman)')}
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1.5 text-base font-semibold">
                <ShieldAlert className="h-5 w-5" /> {sentiment?.threatCount} {l('Hack/FUD Warnings', 'Peringatan Hack/FUD')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {l('Security analysts screen hacks, exploits, and delisting risks', 'Analis Keamanan memfilter hack, exploit, dan isu delisting')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">
            {l('Top Coin Sentiment', 'Sentimen Koin Teratas')}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {sentiment?.coinSentiments && Object.keys(sentiment.coinSentiments).length > 0 ? (
              Object.entries(sentiment.coinSentiments).slice(0, 5).map(([coin, score]: any) => (
                <span
                  key={coin}
                  className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                    score >= 0.2
                      ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-400'
                      : score <= -0.2
                      ? 'border-rose-500/30 bg-rose-950/40 text-rose-400'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  {coin}: {score > 0 ? `+${score}` : score}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">{l('No specific coin data yet.', 'Belum ada data koin spesifik.')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Grid of 10 Analyst Workers */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-indigo-400" />
            <span>{l('10 Autonomous AI Research Analysts', '10 Analis Riset AI Independen')}</span>
          </h3>

          {/* Category Filter Pills */}
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                categoryFilter === 'all' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {l('All', 'Semua')} ({agents.length})
            </button>
            <button
              onClick={() => setCategoryFilter('news')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                categoryFilter === 'news' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {l('News & Community', 'Berita & Komunitas')}
            </button>
            <button
              onClick={() => setCategoryFilter('market')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                categoryFilter === 'market' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {l('Market & Momentum', 'Pasar & Momentum')}
            </button>
            <button
              onClick={() => setCategoryFilter('security')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                categoryFilter === 'security' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {l('Security & Macro', 'Keamanan & Makro')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {agents
            .filter((agent, idx) => {
              if (categoryFilter === 'news') return idx <= 4;
              if (categoryFilter === 'market') return idx === 5 || idx === 9;
              if (categoryFilter === 'security') return idx >= 6 && idx <= 8;
              return true;
            })
            .map((agent) => (
              <div
                key={agent.id}
                className="p-3.5 rounded-xl border border-slate-800 bg-[#0b101b] space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 truncate">{agent.name}</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" title={l('Actively monitoring', 'Aktif memantau')} />
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{agent.role}</p>
                <div className="pt-2 border-t border-slate-800/60">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                    {l('Monitored Sources:', 'Sumber Pantauan:')}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {agent.sources.slice(0, 2).map((s, idx) => (
                      <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 truncate max-w-[120px]">
                        {s}
                      </span>
                    ))}
                    {agent.sources.length > 2 && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-900 text-slate-500">
                        +{agent.sources.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Live Stream of AI Intelligence Feed */}
      <div className="rounded-xl border border-slate-800 bg-[#0b101b] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              {l('Live AI Intelligence Stream (Real-Time Output)', 'Siaran Langsung Riset AI (Output Real-Time Stream)')}
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {logs.length} {l('Reports Available', 'Laporan Tersedia')}
          </span>
        </div>

        {logs.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            {l(
              'No analyst logs yet. Click "Run Research Now" to execute the first analysis.',
              'Belum ada log analis. Klik "Jalankan Riset Sekarang" untuk menjalankan analisa pertama.'
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50 max-h-[500px] overflow-y-auto">
            {logs.map((log) => {
              const isPositive = log.sentiment_score >= 0.1;
              const isNegative = log.sentiment_score <= -0.1;

              return (
                <div key={log.id} className="p-4 hover:bg-slate-800/20 transition-colors space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-indigo-300 font-mono text-[11px] px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-500/30">
                        {log.agent_name}
                      </span>
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {log.source_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        isPositive
                          ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-400'
                          : isNegative
                          ? 'border-rose-500/30 bg-rose-950/40 text-rose-400'
                          : 'border-slate-700 bg-slate-800 text-slate-300'
                      }`}>
                        Score: {log.sentiment_score > 0 ? `+${log.sentiment_score}` : log.sentiment_score}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString(language === 'id' ? 'id-ID' : 'en-US')}
                      </span>
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                    {log.is_threat === 1 && (
                      <span className="text-rose-400 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500/30 uppercase">
                        <AlertTriangle className="h-3 w-3" />
                        {l('Threat', 'Threat')}
                      </span>
                    )}
                    {log.title}
                  </h4>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">{log.summary}</p>

                  {log.coins_mentioned && log.coins_mentioned.length > 0 && (
                    <div className="flex items-center gap-1 pt-1">
                      <span className="text-[10px] text-slate-500 font-mono">{l('Related Coins:', 'Koin Terkait:')}</span>
                      {log.coins_mentioned.map((c, i) => (
                        <span key={i} className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
