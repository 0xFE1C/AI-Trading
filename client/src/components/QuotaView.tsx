import React, { useState, useEffect, useCallback } from 'react';
import {
  Gauge,
  RefreshCw,
  Sparkles,
  Layers,
  Clock,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Search,
  Filter,
  Cpu,
  ShieldCheck,
  ChevronRight,
  Zap,
  Lock
} from 'lucide-react';
import { api } from '../services/api';
import { AntigravityAccountQuota, AntigravityModelQuota, AntigravityQuotaGroup, AiMeteringStats } from '../types';

interface QuotaViewProps {
  onOpenConnectModal?: () => void;
  isAdmin?: boolean;
}

export const QuotaView: React.FC<QuotaViewProps> = ({ onOpenConnectModal, isAdmin = false }) => {
  const [quotas, setQuotas] = useState<AntigravityAccountQuota[]>([]);
  const [metering, setMetering] = useState<AiMeteringStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [familyFilter, setFamilyFilter] = useState<'all' | 'gemini' | 'claude' | 'gpt'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(180); // Default 180s (same as OmniRoute)

  const fetchQuotas = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError(null);
    try {
      const [quotaData, meteringData] = await Promise.all([
        api.getAllAntigravityQuotas(),
        api.getAiMetering(),
      ]);
      setQuotas(quotaData);
      setMetering(meteringData);
    } catch (err: any) {
      console.error('Error fetching Antigravity quotas:', err);
      setError(err.message || 'Gagal mengambil data kuota Antigravity.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotas();
  }, [fetchQuotas]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      fetchQuotas(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, fetchQuotas]);

  // Filter accounts
  const displayedAccounts = selectedAccountId === 'all'
    ? quotas
    : quotas.filter((q) => q.providerId === selectedAccountId);

  // Collect all models based on displayed accounts
  const allModelsWithAccount: Array<{ account: AntigravityAccountQuota; model: AntigravityModelQuota }> = [];
  displayedAccounts.forEach((acc) => {
    acc.models.forEach((m) => {
      allModelsWithAccount.push({ account: acc, model: m });
    });
  });

  // Filter models by family and search
  const filteredModels = allModelsWithAccount.filter(({ model }) => {
    const matchesFamily = familyFilter === 'all' || model.family === familyFilter;
    const matchesSearch =
      searchQuery === '' ||
      model.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFamily && matchesSearch;
  });

  const getBarColor = (pct: number) => {
    if (pct > 50) return 'bg-emerald-500';
    if (pct >= 20) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getBadgeColor = (pct: number) => {
    if (pct > 50) return 'border-emerald-500/30 bg-emerald-950/40 text-emerald-400';
    if (pct >= 20) return 'border-amber-500/30 bg-amber-950/40 text-amber-400';
    return 'border-rose-500/30 bg-rose-950/40 text-rose-400';
  };

  const formatCountdown = (isoString: string | null) => {
    if (!isoString) return null;
    const target = new Date(isoString).getTime();
    const now = Date.now();
    const diff = target - now;
    if (diff <= 0) return 'Tereset';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} hari ${hours % 24} jam`;
    }
    return `${hours} jam ${mins} mnt`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl border border-slate-800 bg-[#0b101b] shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Kuota Provider AI &amp; Rate Limits</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Monitoring live sisa kuota, window reset periodik, dan multi-account load distribution
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Auto Refresh Selector */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-xs font-mono text-slate-300">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">Auto:</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={0} className="bg-slate-900">Off</option>
              <option value={30} className="bg-slate-900">30s</option>
              <option value={60} className="bg-slate-900">60s</option>
              <option value={180} className="bg-slate-900">180s (Default)</option>
              <option value={300} className="bg-slate-900">5m</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchQuotas()}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>{refreshing ? 'Memperbarui...' : 'Refresh Kuota'}</span>
          </button>

          {/* Add Another Antigravity Account */}
          {onOpenConnectModal && (
            <button
              onClick={onOpenConnectModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-semibold text-white transition-all shadow-md group"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-200 group-hover:scale-110 transition-transform" />
              <span>+ Hubungkan Akun Google Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
          <div>
            <div className="font-semibold">Gagal memuat kuota Antigravity:</div>
            <div className="text-[11px] text-rose-200/80 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl space-y-3">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-400" />
          <p>Memeriksa kuota model Antigravity &amp; Google Cloud Code API...</p>
        </div>
      ) : quotas.length === 0 ? (
        /* Empty State: No Antigravity Accounts Connected */
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-[#0b101b] space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 mx-auto">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">Belum Ada Akun Antigravity Terhubung</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Hubungkan akun Google Antigravity Anda untuk mengaktifkan pemantauan kuota real-time dan akses model AI seperti Gemini 3.8 Flash dan Claude 4.6.
            </p>
          </div>
          {onOpenConnectModal && (
            <button
              onClick={onOpenConnectModal}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-md transition-colors"
            >
              Hubungkan Antigravity Sekarang
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 2. Multi-Account Switcher & Account Summary Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="uppercase tracking-wider font-semibold text-[11px]">
                Akun Terhubung ({quotas.length}):
              </span>
              <span>Multiple Account Auto-Failover Aktif</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* "Semua Akun" selector pill */}
              <div
                onClick={() => setSelectedAccountId('all')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  selectedAccountId === 'all'
                    ? 'border-blue-500 bg-blue-950/30 shadow-md shadow-blue-500/10'
                    : 'border-slate-800 bg-[#0b101b] hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-200">Semua Akun Antigravity</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {quotas.length} Akun
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
                  <span>Total Model:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {quotas.reduce((acc, q) => acc + q.totalModels, 0)} Model
                  </span>
                </div>
              </div>

              {/* Individual Account Cards */}
              {quotas.map((acc) => (
                <div
                  key={acc.providerId}
                  onClick={() => setSelectedAccountId(acc.providerId)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    selectedAccountId === acc.providerId
                      ? 'border-blue-500 bg-blue-950/30 shadow-md shadow-blue-500/10'
                      : 'border-slate-800 bg-[#0b101b] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-emerald-400 truncate max-w-[180px]" title={acc.email}>
                      {acc.email}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                      {acc.alias}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-2 space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Project:</span>
                      <span className="font-mono text-slate-300 truncate max-w-[140px]">{acc.projectId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Model:</span>
                      <span className="font-mono font-bold text-slate-200">{acc.totalModels} Terdaftar</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Token Metering & Dedup Telemetry Card (Section 9 Engine) */}
          {metering && (
            <div className="p-5 rounded-xl border border-slate-800 bg-[#0b101b] space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-600/15 border border-emerald-500/30 text-emerald-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <span>Efisiensi Pemakaian AI &amp; Deduplikasi</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 font-mono">
                        Penghemat Token
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Monitoring konsumsi token riil, deduplikasi konteks berita, dan latensi per agen
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono border ${
                    metering.isDegraded
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {metering.isDegraded ? 'Mode Hemat: AI dibatasi, bot tetap jalan dengan analisa teknikal' : 'Status: Optimal (Normal)'}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-mono border bg-blue-500/10 text-blue-400 border-blue-500/30">
                    Mode: {(metering.aiMode || 'confirm').toUpperCase()}
                  </span>
                </div>
              </div>

              {/* 4 Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/40 space-y-1">
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Total Panggilan AI</span>
                  <div className="text-lg font-bold font-mono text-slate-100">{metering.totalCalls.toLocaleString()}</div>
                  <span className="text-[10px] text-slate-400 block font-mono">Latensi: ~{metering.avgLatencyMs} ms</span>
                </div>

                <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/40 space-y-1">
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Token Masuk (Input)</span>
                  <div className="text-lg font-bold font-mono text-blue-400">{metering.totalInputTokens.toLocaleString()}</div>
                  <span className="text-[10px] text-slate-400 block font-mono">Konteks &amp; Prompt</span>
                </div>

                <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-900/40 space-y-1">
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Token Keluar (Output)</span>
                  <div className="text-lg font-bold font-mono text-indigo-400">{metering.totalOutputTokens.toLocaleString()}</div>
                  <span className="text-[10px] text-slate-400 block font-mono">Respon Terstruktur JSON</span>
                </div>

                <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-950/20 space-y-1">
                  <span className="text-[10px] uppercase font-mono text-emerald-400/80 block">Dihemat Sistem Deduplikasi</span>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {metering.byStatus?.skipped_dedup || 0} Panggilan
                  </div>
                  <span className="text-[10px] text-emerald-300/80 block font-mono">
                    ~{Math.round(((metering.byStatus?.skipped_dedup || 0) * 850)).toLocaleString()} token terselamatkan
                  </span>
                </div>
              </div>

              {/* By Agent Breakdown */}
              {metering.byAgent && Object.keys(metering.byAgent).length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Distribusi Beban Menurut Peran Agen:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {Object.entries(metering.byAgent).map(([agentRole, usage]) => (
                      <div
                        key={agentRole}
                        className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/30 flex items-center justify-between text-xs font-mono"
                      >
                        <div>
                          <span className="font-bold text-slate-200 capitalize block">
                            {agentRole === 'scout'
                              ? 'Tim Analis Berita'
                              : agentRole === 'master'
                              ? 'Manajer Risiko AI'
                              : agentRole === 'postmortem'
                              ? 'AI Reviewer PnL'
                              : agentRole === 'whatsapp'
                              ? 'WhatsApp Chat'
                              : agentRole}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {usage.inputTokens + usage.outputTokens} token total
                          </span>
                        </div>
                        <span className="font-bold text-blue-400 px-2 py-0.5 rounded bg-slate-800">
                          {usage.calls}x
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. OmniRoute-Style Quota Groups Overview (Gemini Models & Claude/GPT Models) */}
          <div className="p-5 rounded-xl border border-slate-800 bg-[#0b101b] space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-400" />
                  <span>Ringkasan Kuota Per-Family (Antigravity Quota Groups)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Batas sesi 5 jam dan kuota mingguan yang dibagikan antar model dalam satu family
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Gemini Models Group Card */}
              {displayedAccounts.map((acc) => {
                const geminiGroup = acc.groups.find((g) => g.id === 'gemini');
                const claudeGroup = acc.groups.find((g) => g.id === 'claude_gpt');
                const pctG = geminiGroup?.remainingPercentage ?? 100;
                const pctC = claudeGroup?.remainingPercentage ?? 100;
                const countdownG = formatCountdown(geminiGroup?.resetAt || null);
                const countdownC = formatCountdown(claudeGroup?.resetAt || null);

                return (
                  <React.Fragment key={acc.providerId}>
                    {/* Gemini Group */}
                    <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-blue-400" />
                          <span className="font-bold text-xs text-slate-200">Gemini Models Group</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getBadgeColor(pctG)}`}>
                          {pctG}% SISA
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                          <span>Sesi 5-Jam &amp; Mingguan</span>
                          <span>{pctG}% tersisa</span>
                        </div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${getBarColor(pctG)}`}
                            style={{ width: `${pctG}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>Reset: {countdownG || 'Sesi Aktif'}</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">
                          {acc.email}
                        </span>
                      </div>
                    </div>

                    {/* Claude & GPT Group */}
                    <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-amber-400" />
                          <span className="font-bold text-xs text-slate-200">Claude &amp; GPT Models Group</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getBadgeColor(pctC)}`}>
                          {pctC}% SISA
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                          <span>Sesi 5-Jam &amp; Mingguan</span>
                          <span>{pctC}% tersisa</span>
                        </div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${getBarColor(pctC)}`}
                            style={{ width: `${pctC}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>Reset: {countdownC || 'Sesi Aktif'}</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">
                          {acc.email}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* 4. Detailed Per-Model Quota Grid */}
          <div className="p-5 rounded-xl border border-slate-800 bg-[#0b101b] space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-emerald-400" />
                  <span>Katalog Sisa Kuota Per-Model ({filteredModels.length})</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Termasuk Gemini 3.8 Flash, Claude 4.6, Claude 5.5, Gemini 4 Argon, dan GPT-OSS
                </p>
              </div>

              {/* Filter Tabs & Search */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Family filter pills */}
                <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/60 p-0.5 text-xs">
                  <button
                    onClick={() => setFamilyFilter('all')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      familyFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    onClick={() => setFamilyFilter('gemini')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      familyFilter === 'gemini' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Gemini
                  </button>
                  <button
                    onClick={() => setFamilyFilter('claude')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      familyFilter === 'claude' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Claude
                  </button>
                  <button
                    onClick={() => setFamilyFilter('gpt')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      familyFilter === 'gpt' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    GPT
                  </button>
                </div>

                {/* Search input */}
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari model..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-36 sm:w-44"
                  />
                </div>
              </div>
            </div>

            {/* Models Grid */}
            {filteredModels.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs italic">
                Tidak ada model yang cocok dengan kriteria pencarian "{searchQuery}".
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredModels.map(({ account, model }) => {
                  const pct = model.remainingPercentage;
                  const countdown = formatCountdown(model.resetAt);

                  return (
                    <div
                      key={`${account.providerId}-${model.id}`}
                      className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/30 hover:bg-slate-900/60 transition-colors space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-xs text-slate-100 leading-snug">
                            {model.displayName}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] text-blue-400">
                              {account.alias}/{model.id}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getBadgeColor(
                            pct
                          )}`}
                        >
                          {pct}% SISA
                        </span>
                      </div>

                      {/* Quota Meter Bar */}
                      <div className="space-y-1">
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 rounded-full ${getBarColor(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Footer Details */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/60 font-mono">
                        <span className="flex items-center gap-1 text-slate-500">
                          <Clock className="h-3 w-3" />
                          <span>{countdown ? `Reset: ${countdown}` : 'Tersedia'}</span>
                        </span>

                        <span className="text-slate-500 truncate max-w-[100px]" title={account.email}>
                          {account.email.split('@')[0]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
