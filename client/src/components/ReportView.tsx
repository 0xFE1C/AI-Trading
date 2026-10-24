import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  Shield,
  Clock,
  Database,
  Server,
  Cpu,
  CheckCircle2,
  XCircle,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  Activity,
  HardDrive,
  Layers,
  ArrowDownToLine,
} from 'lucide-react';
import { api } from '../services/api';
import { PerformanceReport, BackupItem, SystemHealth } from '../types';
import { generatePdfReport } from '../utils/pdfGenerator';
import { Toast } from './Toast';

interface ReportViewProps {
  isAdmin?: boolean;
}

export const ReportView: React.FC<ReportViewProps> = ({ isAdmin = false }) => {
  const [timeframe, setTimeframe] = useState<number | 'all'>('all');
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Filter & Search inside Trade Journal
  const [searchSymbol, setSearchSymbol] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'win' | 'loss'>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const [reportData, healthData, backupData] = await Promise.all([
        api.getPerformanceReport(timeframe),
        api.getSystemHealth().catch(() => null),
        api.getBackupList().catch(() => []),
      ]);
      setReport(reportData);
      if (healthData) setHealth(healthData);
      setBackups(backupData);
    } catch (err: any) {
      console.error('Failed to load performance report', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeframe]);

  const handleDownloadPdf = async () => {
    if (!report) return;
    try {
      await generatePdfReport(report);
      setToast({ message: 'Laporan PDF resmi berhasil dibuat dan diunduh!', type: 'success' });
    } catch (err: any) {
      setToast({ message: `Gagal membuat dokumen PDF: ${err.message}`, type: 'error' });
    }
  };

  const handleExportCsv = () => {
    const url = api.getReportCsvUrl(timeframe);
    window.open(url, '_blank');
  };

  const handleCreateBackup = async () => {
    setBackingUp(true);
    try {
      const res = await api.createBackup();
      setToast({ message: `Cadangan database berhasil dibuat: ${res.data.filename} (${res.data.sizeFormatted})`, type: 'success' });
      const updated = await api.getBackupList();
      setBackups(updated);
    } catch (err: any) {
      setToast({ message: `Gagal membuat backup database: ${err.message}`, type: 'error' });
    } finally {
      setBackingUp(false);
    }
  };

  // Filtered trades
  const filteredTrades = (report?.tradesList || []).filter((t) => {
    const matchesSymbol = t.symbol.toLowerCase().includes(searchSymbol.toLowerCase().trim());
    if (!matchesSymbol) return false;
    if (statusFilter === 'win') return t.pnl_idr > 0;
    if (statusFilter === 'loss') return t.pnl_idr < 0;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-800 bg-[#0b101b] shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-inner">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Laporan Hasil Trading &amp; Analitika Performa</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                Audit Trail
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pantau metrik keuntungan bersih, unduh laporan PDF resmi, export data ke Excel/CSV, dan kelola cadangan database.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={!report || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Laporan PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!report || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Export CSV (Excel)</span>
          </button>

          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={backingUp}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 hover:bg-emerald-900/40 text-xs font-semibold text-emerald-300 transition-colors"
          >
            <Database className={`w-3.5 h-3.5 ${backingUp ? 'animate-spin' : ''}`} />
            <span>{backingUp ? 'Membackup...' : 'Backup DB'}</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
            title="Refresh Laporan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Timeframe Selector Filter */}
      <div className="flex items-center justify-between flex-wrap gap-2 p-1.5 rounded-2xl bg-[#090d16] border border-slate-800/80">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 font-mono pl-3 pr-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>Filter Periode:</span>
          </span>

          {[
            { label: '7 Hari', val: 7 },
            { label: '30 Hari', val: 30 },
            { label: '90 Hari', val: 90 },
            { label: 'Semua Waktu', val: 'all' as const },
          ].map((tf) => (
            <button
              key={tf.label}
              type="button"
              onClick={() => setTimeframe(tf.val)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all ${
                timeframe === tf.val
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {report && (
          <div className="text-xs text-slate-400 font-mono pr-3">
            <span>Mode: </span>
            <strong className={report.currentMode === 'LIVE' ? 'text-rose-400' : 'text-emerald-400'}>
              {report.currentMode} TRADING
            </strong>
          </div>
        )}
      </div>

      {/* Human-Friendly Narrative Summary Banner */}
      {report && (
        <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-950/20 text-xs text-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              <strong>Ringkasan Kinerja: </strong>
              Periode ini mencatat <strong>{report.totalTrades} transaksi</strong> ({report.winningTrades} profit, {report.losingTrades} rugi) dengan Win Rate <strong>{report.winRatePercent.toFixed(1)}%</strong> dan laba bersih <strong>Rp {report.netPnlIdr.toLocaleString('id-ID')}</strong>.
            </span>
          </div>
          <span className="text-[11px] font-mono text-blue-300 shrink-0">
            Rentang: {report.periodLabel}
          </span>
        </div>
      )}

      {/* 3. Executive KPI Cards */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Net PnL */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-[#0b101b] space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
              Net Realized PnL
            </span>
            <div className={`text-xl font-bold font-mono ${report.netPnlIdr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {report.netPnlIdr >= 0 ? '+' : ''}Rp {report.netPnlIdr.toLocaleString('id-ID')}
            </div>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className={`font-semibold ${report.netPnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {report.netPnlPercent >= 0 ? '+' : ''}{report.netPnlPercent.toFixed(2)}% Return
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Gross: Rp {(report.grossProfitIdr / 1000).toFixed(0)}k
              </span>
            </div>
          </div>

          {/* Card 2: Win Rate */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-[#0b101b] space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
              Win Rate %
            </span>
            <div className="text-xl font-bold font-mono text-slate-100">
              {report.winRatePercent.toFixed(1)}%
            </div>
            <div className="flex items-center justify-between text-xs pt-1 text-slate-400 font-mono">
              <span className="text-emerald-400">{report.winningTrades} Menang</span>
              <span className="text-rose-400">{report.losingTrades} Kalah</span>
              <span>{report.totalTrades} Total</span>
            </div>
          </div>

          {/* Card 3: Profit Factor */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-[#0b101b] space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
              Profit Factor
            </span>
            <div className="text-xl font-bold font-mono text-indigo-400">
              {report.profitFactor !== null ? report.profitFactor : 'N/A'}
            </div>
            <div className="flex items-center justify-between text-xs pt-1 text-slate-400 font-mono">
              <span>Loss: Rp {(report.grossLossIdr / 1000).toFixed(0)}k</span>
              <span className="text-[11px] text-slate-500">Rasio Untung/Rugi</span>
            </div>
          </div>

          {/* Card 4: Max Drawdown */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-[#0b101b] space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
              Max Drawdown
            </span>
            <div className={`text-xl font-bold font-mono ${report.maxDrawdownPercent > 8 ? 'text-amber-400' : 'text-slate-100'}`}>
              {report.maxDrawdownPercent.toFixed(2)}%
            </div>
            <div className="flex items-center justify-between text-xs pt-1 text-slate-400 font-mono">
              <span>Rp {report.maxDrawdownIdr.toLocaleString('id-ID')}</span>
              <span className="text-[11px] text-slate-500">Penurunan Terbesar</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. AI Swarm & Server Health Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: AI Swarm & A/B Validation Impact */}
        {report && (
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Perlindungan AI Terhadap Kerugian</span>
              </div>
              <span className="text-[10px] font-mono text-indigo-300 px-2 py-0.5 rounded bg-indigo-950 border border-indigo-500/30">
                A/B Alpha Validator
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 space-y-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Peluru Kerugian Dihindari</span>
                <div className="text-lg font-bold text-emerald-400 font-mono">
                  {report.aiEfficacy.bulletsDodged} Koin
                </div>
                <p className="text-[11px] text-slate-400">
                  Trade berbahaya yang ditolak AI dan terbukti anjlok.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 space-y-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Modal Terselamatkan</span>
                <div className="text-lg font-bold text-emerald-400 font-mono">
                  Rp {report.aiEfficacy.savedCapitalIdr.toLocaleString('id-ID')}
                </div>
                <p className="text-[11px] text-slate-400">
                  Uang yang tidak hilang berkat filter AI Swarm.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 space-y-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Rasio Persetujuan AI</span>
                <div className="text-base font-bold text-slate-200 font-mono">
                  {report.aiEfficacy.approvedCount} Disetujui / {report.aiEfficacy.rejectedCount} Ditolak
                </div>
                <p className="text-[11px] text-slate-400">
                  Total {report.aiEfficacy.evaluationsCount} sinyal teknikal diuji.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 space-y-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Rata-rata Durasi Hold</span>
                <div className="text-base font-bold text-slate-200 font-mono">
                  {report.avgHoldDurationMinutes} Menit
                </div>
                <p className="text-[11px] text-slate-400">
                  Waktu rata-rata posisi sebelum take profit / cut loss.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Right: Server Health & Resource Monitoring */}
        {health && (
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>Kesehatan Server &amp; Sumber Daya (Resource Health)</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 border border-emerald-500/30 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Optimal
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
                <span className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Server Uptime</span>
                <strong className="text-sm text-slate-200 font-mono block">
                  {Math.floor(health.uptimeSeconds / 3600)}j {Math.floor((health.uptimeSeconds % 3600) / 60)}m
                </strong>
                <span className="text-[10px] text-slate-500">Berjalan stabil tanpa restart</span>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
                <span className="text-[10px] text-slate-500 font-mono uppercase block mb-1">RAM (RSS)</span>
                <strong className="text-sm text-slate-200 font-mono block">
                  {health.memoryRssMb} MB
                </strong>
                <span className="text-[10px] text-slate-500">Heap: {health.memoryHeapUsedMb} MB</span>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60">
                <span className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Database Size</span>
                <strong className="text-sm text-slate-200 font-mono block">
                  {health.databaseSizeMb} MB
                </strong>
                <span className="text-[10px] text-slate-500">SQLite WAL Active</span>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 sm:col-span-3">
                <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                  <span>Node.js: {health.nodeVersion}</span>
                  <span>Platform: {health.platform}</span>
                  <span>CPU Cores: {health.cpuCount} Cores</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Breakdown Kinerja per Koin Table */}
      {report && report.coinBreakdown.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Breakdown Performa per Simbol Koin</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {report.coinBreakdown.length} Koin Diperdagangkan
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-mono text-[11px] uppercase">
                  <th className="py-2.5 px-3">Koin / Pair</th>
                  <th className="py-2.5 px-3">Total Trade</th>
                  <th className="py-2.5 px-3">Menang / Kalah</th>
                  <th className="py-2.5 px-3">Win Rate %</th>
                  <th className="py-2.5 px-3">Total PnL (IDR)</th>
                  <th className="py-2.5 px-3">Rata-rata PnL %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 font-mono">
                {report.coinBreakdown.map((c) => {
                  const isProfit = c.totalPnlIdr >= 0;
                  return (
                    <tr key={c.symbol} className="hover:bg-slate-850/40 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-200">{c.symbol}</td>
                      <td className="py-2.5 px-3 text-slate-300">{c.tradesCount}</td>
                      <td className="py-2.5 px-3 text-slate-400">{c.wins} / {c.losses}</td>
                      <td className="py-2.5 px-3 text-slate-200">{c.winRatePercent.toFixed(1)}%</td>
                      <td className={`py-2.5 px-3 font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? '+' : ''}Rp {c.totalPnlIdr.toLocaleString('id-ID')}
                      </td>
                      <td className={`py-2.5 px-3 ${c.avgPnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {c.avgPnlPercent >= 0 ? '+' : ''}{c.avgPnlPercent.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Full Interactive Trade Journal Log */}
      <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Jurnal Riwayat Transaksi Lengkap</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Daftar seluruh posisi tertutup dengan rincian harga masuk, harga keluar, durasi hold, dan alasan exit.
            </p>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value)}
                placeholder="Cari koin..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 w-32 sm:w-40"
              />
            </div>

            <div className="flex items-center p-0.5 rounded-lg border border-slate-700 bg-slate-900">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                  statusFilter === 'all' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('win')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                  statusFilter === 'win' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400'
                }`}
              >
                Untung
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('loss')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                  statusFilter === 'loss' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400'
                }`}
              >
                Rugi
              </button>
            </div>
          </div>
        </div>

        {filteredTrades.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl space-y-1">
            <p>Tidak ada transaksi yang cocok dengan filter.</p>
            <p className="text-[11px] text-slate-500">
              Coba ganti rentang waktu di atas atau bersihkan kata kunci pencarian.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-mono text-[11px] uppercase">
                    <th className="py-2.5 px-3">No</th>
                    <th className="py-2.5 px-3">Koin / Pair</th>
                    <th className="py-2.5 px-3">Tanggal Selesai</th>
                    <th className="py-2.5 px-3">Harga Beli</th>
                    <th className="py-2.5 px-3">Harga Jual</th>
                    <th className="py-2.5 px-3">Modal Awal</th>
                    <th className="py-2.5 px-3">Net PnL (IDR)</th>
                    <th className="py-2.5 px-3">PnL %</th>
                    <th className="py-2.5 px-3">Durasi</th>
                    <th className="py-2.5 px-3">Alasan Exit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {filteredTrades.map((t, idx) => {
                    const isProfit = t.pnl_idr >= 0;
                    const closeDate = t.closed_at ? new Date(t.closed_at).toLocaleDateString('id-ID') : '-';

                    return (
                      <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-100">{t.symbol}</td>
                        <td className="py-2.5 px-3 text-slate-400">{closeDate}</td>
                        <td className="py-2.5 px-3 text-slate-300">Rp {t.entry_price.toLocaleString('id-ID')}</td>
                        <td className="py-2.5 px-3 text-slate-300">Rp {t.exit_price.toLocaleString('id-ID')}</td>
                        <td className="py-2.5 px-3 text-slate-400">Rp {Math.round(t.initial_cost_idr).toLocaleString('id-ID')}</td>
                        <td className={`py-2.5 px-3 font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}Rp {Math.round(t.pnl_idr).toLocaleString('id-ID')}
                        </td>
                        <td className={`py-2.5 px-3 font-semibold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}{t.pnl_percent.toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-sans">{t.hold_minutes} mnt</td>
                        <td className="py-2.5 px-3 font-sans text-slate-300 text-[11px] max-w-xs truncate" title={t.exit_reason}>
                          {t.exit_reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout (< md screens) */}
            <div className="md:hidden space-y-3">
              {filteredTrades.map((t, idx) => {
                const isProfit = t.pnl_idr >= 0;
                const closeDate = t.closed_at ? new Date(t.closed_at).toLocaleDateString('id-ID') : '-';

                return (
                  <div key={t.id} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-mono">#{idx + 1}</span>
                        <span className="text-sm font-bold text-slate-100 font-mono">{t.symbol}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                          isProfit ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30' : 'bg-rose-950/60 text-rose-400 border-rose-500/30'
                        }`}>
                          {isProfit ? 'UNTUNG' : 'RUGI'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{closeDate} ({t.hold_minutes}m)</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/60">
                        <span className="text-[10px] text-slate-500 block">Beli / Masuk</span>
                        <span className="text-slate-300">Rp {t.entry_price.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/60">
                        <span className="text-[10px] text-slate-500 block">Jual / Keluar</span>
                        <span className="text-slate-300">Rp {t.exit_price.toLocaleString('id-ID')}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-mono">Modal Awal</span>
                        <span className="text-xs font-mono text-slate-300">Rp {Math.round(t.initial_cost_idr).toLocaleString('id-ID')}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block uppercase font-mono">Net PnL</span>
                        <span className={`text-sm font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? '+' : ''}Rp {Math.round(t.pnl_idr).toLocaleString('id-ID')}
                          <span className="text-xs font-normal ml-1">
                            ({isProfit ? '+' : ''}{t.pnl_percent.toFixed(2)}%)
                          </span>
                        </span>
                      </div>
                    </div>

                    {t.exit_reason && (
                      <div className="text-[11px] text-slate-400 bg-slate-950/40 p-1.5 rounded border border-slate-800/50 truncate" title={t.exit_reason}>
                        <span className="text-slate-500 mr-1 font-semibold">Alasan:</span> {t.exit_reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 7. Database Backups Manager */}
      <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-5 space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
            <HardDrive className="w-4 h-4 text-sky-400" />
            <span>Cadangan Database SQLite (Disaster Recovery Snapshots)</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {backups.length} Snapshot Tersimpan
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Sistem secara otomatis membuat snapshot database SQLite lokal setiap 24 jam sekali untuk mencegah hilangnya riwayat posisi jika server mati mendadak.
        </p>

        {backups.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-2">
            Belum ada snapshot cadangan. Klik tombol "Backup DB" di atas untuk membuat cadangan pertama.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {backups.slice(0, 6).map((b) => (
              <div
                key={b.filename}
                className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 font-mono text-xs flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <div className="text-slate-200 font-bold truncate text-[11px]">{b.filename}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{b.createdFormatted}</div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-sky-300 shrink-0">
                  {b.sizeFormatted}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};
