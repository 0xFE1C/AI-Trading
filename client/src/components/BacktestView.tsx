import React, { useState } from 'react';
import {
  TrendingUp,
  BarChart2,
  Calendar,
  Clock,
  DollarSign,
  Shield,
  Target,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Percent,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Sliders,
  Sparkles,
  X,
  PieChart,
} from 'lucide-react';
import { api } from '../services/api';
import { BacktestParams, BacktestResult, BacktestTrade, PortfolioBacktestResult } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

const POPULAR_PAIRS = ['BTCIDR', 'ETHIDR', 'SOLIDR', 'PEPEIDR', 'DOGEIDR', 'XRPIDR', 'BNBIDR'];

export const BacktestView: React.FC = () => {
  const { l, formatCurrency, formatNumber, language } = useLanguage();
  const [mode, setMode] = useState<'single' | 'portfolio'>('single');
  const [params, setParams] = useState<BacktestParams>({
    symbol: 'BTCIDR',
    timeframe: '1h',
    days: 30,
    initialBalanceIdr: 10000000,
    allocationPerTradeIdr: 100000,
    trailingStopPercent: 2.5,
    takeProfitStep1Percent: 5.0,
    minGainThresholdPercent: 1.5,
    slippagePercent: 0.2,
    strategyType: 'live_momentum',
  });

  // Portfolio mode state: concurrent multi-symbol simulation
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['BTCIDR', 'ETHIDR', 'SOLIDR']);
  const [customSymbol, setCustomSymbol] = useState('');
  const [maxActiveTrades, setMaxActiveTrades] = useState(3);
  const [portfolioResult, setPortfolioResult] = useState<PortfolioBacktestResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleSymbol = (pair: string) => {
    setSelectedSymbols((prev) =>
      prev.includes(pair) ? prev.filter((s) => s !== pair) : [...prev, pair].slice(0, 10)
    );
  };

  const addCustomSymbol = () => {
    const clean = customSymbol.trim().toUpperCase().replace('/', '').replace('_', '');
    if (!clean) return;
    const pair = clean.endsWith('IDR') ? clean : `${clean}IDR`;
    if (!selectedSymbols.includes(pair)) {
      setSelectedSymbols((prev) => [...prev, pair].slice(0, 10));
    }
    setCustomSymbol('');
  };

  const handleRunBacktest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'portfolio') {
        if (selectedSymbols.length === 0) {
          throw new Error(l('Select at least one symbol for the portfolio backtest.', 'Pilih minimal satu simbol untuk backtest portofolio.'));
        }
        const data = await api.runPortfolioBacktest({
          symbols: selectedSymbols,
          timeframe: params.timeframe,
          days: params.days,
          initialBalanceIdr: params.initialBalanceIdr,
          allocationPerTradeIdr: params.allocationPerTradeIdr,
          maxActiveTrades,
          trailingStopPercent: params.trailingStopPercent,
          takeProfitStep1Percent: params.takeProfitStep1Percent,
          minGainThresholdPercent: params.minGainThresholdPercent,
          slippagePercent: params.slippagePercent,
        });
        setResult(null);
        setPortfolioResult(data);
      } else {
        const data = await api.runBacktest(params);
        setPortfolioResult(null);
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message || l('Failed to execute backtest.', 'Gagal menjalankan backtest.'));
      setResult(null);
      setPortfolioResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl border border-slate-800 bg-gradient-to-r from-[#0b101b] via-[#0e1627] to-[#0b101b]">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs tracking-wider uppercase mb-1">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>{l('Quantitative Laboratory • Backtest Engine', 'Laboratorium Kuantitatif • Backtest Engine')}</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            {l('Indodax Strategy Quantitative Simulation', 'Simulasi Kuantitatif Strategi Indodax')}
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl mt-1">
            {mode === 'single'
              ? l(
                  'Test momentum algorithm performance, ratchet trailing stops, partial take-profits, and slippage modeling on real historical Indodax candlesticks (TradingView API) before running Live Trading.',
                  'Uji performa algoritma momentum, ratchet trailing stop, partial take-profit, dan pemodelan slippage pada candlestick historis Indodax nyata (TradingView API) sebelum menjalankan Live Trading.'
                )
              : l(
                  'Portfolio simulation: multiple symbols, concurrent position slots, and one shared cash pool — mirroring how the live engine actually trades.',
                  'Simulasi portofolio: banyak simbol, slot posisi konkuren, dan satu kas bersama — mencerminkan cara live engine benar-benar trading.'
                )}
          </p>
        </div>

        {/* Mode Toggle + Run Button */}
        <div className="flex flex-col gap-3 shrink-0">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl border border-slate-800 bg-[#070b13]">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'single' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              {l('Single Pair', 'Satu Pair')}
            </button>
            <button
              type="button"
              onClick={() => setMode('portfolio')}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'portfolio' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <PieChart className="w-3.5 h-3.5" />
              {l('Portfolio', 'Portofolio')}
            </button>
          </div>

          <button
            onClick={() => handleRunBacktest()}
            disabled={loading || (mode === 'portfolio' && selectedSymbols.length === 0)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-600/20 whitespace-nowrap"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{l('Processing Simulation...', 'Memproses Simulasi...')}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>{mode === 'portfolio' ? l('Run Portfolio Backtest', 'Jalankan Backtest Portofolio') : l('Run Backtest', 'Jalankan Backtest')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Methodology & Transparency Disclaimer Banner */}
      <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-950/20 text-slate-300 text-xs space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-blue-400 text-xs">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{l('Methodology Transparency: Technical Backtest vs Live Trading Bot', 'Transparansi Metodologi: Backtest Teknis vs Live Trading Bot')}</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {l(
            'This simulation stress-tests quantitative execution rules (market momentum, trailing stop ratchet, partial scale-out TP to breakeven, 0.2% orderbook slippage, and the configured Indodax all-in taker fee) on historical Indodax candles.',
            'Simulasi ini menguji aturan eksekusi kuantitatif (momentum pasar, trailing stop loss ratchet, scale-out partial TP ke breakeven, pemodelan slippage orderbook 0.2%, dan taker fee all-in Indodax yang dikonfigurasi) pada riwayat candlestick bursa Indodax.'
          )}
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          <strong>{l('Difference from Live Engine: ', 'Perbedaan dengan Live Engine: ')}</strong>
          {l(
            'Historical backtests omit minute-by-minute AI LLM confirmation and instant new coin listing detection. Use simulation results to validate risk management and drawdown resilience, not as guaranteed future profits.',
            'Backtest historis tidak menyertakan konfirmasi AI LLM menit-ke-menit (karena tidak ada arsip berita live per menit di masa lampau) atau deteksi listing koin baru instan. Gunakan hasil simulasi ini untuk memvalidasi ketahanan manajemen risiko dan ekspektasi drawdown, bukan sebagai jaminan profit pasti di masa depan.'
          )}
        </p>
        <p className="text-[11px] text-amber-300/90 font-medium pt-1 border-t border-blue-500/20">
          {l(
            '⚠️ Compliance & Education: Past performance does not guarantee future results. All figures are quantitative simulations based on historical price action.',
            '⚠️ Kepatuhan & Edukasi: Kinerja masa lalu tidak menjamin hasil masa depan. Seluruh angka adalah simulasi kuantitatif berdasarkan riwayat pergerakan harga.'
          )}
        </p>
      </div>

      {/* Input Parameters Card */}
      <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            <span>{l('Strategy Replay Parameters', 'Parameter Replay Strategi')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>{l('Auto-paginates up to 180 days of exchange history', 'Paginasi otomatis hingga 180 hari riwayat bursa')}</span>
          </div>
        </div>

        {/* 1-Click Scenario Presets */}
        <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-semibold text-slate-200">{l('Auto Scenario Presets:', 'Preset Skenario Otomatis:')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setParams({
                ...params,
                trailingStopPercent: 1.8,
                takeProfitStep1Percent: 3.5,
                minGainThresholdPercent: 1.5,
                timeframe: '1h',
              })}
              className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 font-medium transition-colors"
            >
              {l('🛡️ Test Conservative Profile', '🛡️ Uji Profil Konservatif')}
            </button>
            <button
              type="button"
              onClick={() => setParams({
                ...params,
                trailingStopPercent: 2.5,
                takeProfitStep1Percent: 5.0,
                minGainThresholdPercent: 1.5,
                timeframe: '1h',
              })}
              className="px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-950/40 hover:bg-blue-900/40 text-blue-300 font-medium transition-colors"
            >
              {l('⚖️ Test Balanced Profile', '⚖️ Uji Profil Seimbang')}
            </button>
            <button
              type="button"
              onClick={() => setParams({
                ...params,
                trailingStopPercent: 3.5,
                takeProfitStep1Percent: 7.5,
                minGainThresholdPercent: 2.0,
                timeframe: '1h',
              })}
              className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-950/40 hover:bg-amber-900/40 text-amber-300 font-medium transition-colors"
            >
              {l('🚀 Test Aggressive Profile', '🚀 Uji Profil Agresif')}
            </button>
          </div>
        </div>

        <form onSubmit={handleRunBacktest} className="space-y-4">
          {/* Strategy Mode Selector (single-pair mode only) */}
          {mode === 'single' && (
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              {l('Choose Strategy Rules / Engine:', 'Pilih Mesin / Aturan Strategi:')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setParams({ ...params, strategyType: 'live_momentum', minGainThresholdPercent: 1.5 })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  params.strategyType === 'live_momentum' || !params.strategyType
                    ? 'border-indigo-500 bg-indigo-950/30 text-indigo-200 shadow-md shadow-indigo-500/10'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between pb-1">
                  <span className="font-bold text-xs text-slate-200">
                    {l('24h Rolling Momentum (Live Engine Replay)', '24h Rolling Momentum (Replay Logika Live)')}
                  </span>
                  {(params.strategyType === 'live_momentum' || !params.strategyType) && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-600 text-white">
                      {l('Recommended', 'Rekomendasi')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  {l(
                    'Replicates live bot scanner: searches for coins with 24h rolling gains >= threshold (1.5% - 25%) with volume confirmation. Produces realistic trade frequency on major pairs (BTC/ETH).',
                    'Mereplikasi scanner bot live: mencari koin dengan kenaikan rolling 24 jam >= threshold (1.5% - 25%) dengan volume konfirmasi. Menghasilkan frekuensi trade realistis pada pair mayor (BTC/ETH).'
                  )}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setParams({ ...params, strategyType: 'candle_breakout', minGainThresholdPercent: 0.6 })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  params.strategyType === 'candle_breakout'
                    ? 'border-indigo-500 bg-indigo-950/30 text-indigo-200 shadow-md shadow-indigo-500/10'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between pb-1">
                  <span className="font-bold text-xs text-slate-200">
                    {l('Single Candlestick Breakout', 'Single Candlestick Breakout')}
                  </span>
                  {params.strategyType === 'candle_breakout' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-600 text-white">
                      {l('Active', 'Aktif')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  {l(
                    'Technical breakout based on a single bullish candle with rapid percentage surge per bar.',
                    'Breakout teknikal berbasis satu candle bullish dengan lonjakan persentase cepat per bar (sensitivitas adaptif otomatis per timeframe).'
                  )}
                </p>
              </button>
            </div>
          </div>
          )}

          {/* Portfolio Symbol Selection (portfolio mode only) */}
          {mode === 'portfolio' && (
          <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>{l('Portfolio Symbols (max 10)', 'Simbol Portofolio (maks 10)')}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {selectedSymbols.length}/10 {l('selected', 'dipilih')}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {selectedSymbols.map((pair) => (
                <span
                  key={pair}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-mono font-semibold"
                >
                  {pair.replace('IDR', '')}
                  <button
                    type="button"
                    onClick={() => toggleSymbol(pair)}
                    className="hover:bg-white/20 rounded p-0.5 transition-colors"
                    aria-label={`Remove ${pair}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {selectedSymbols.length === 0 && (
                <span className="text-[11px] text-slate-500">
                  {l('No symbols selected — pick at least one below.', 'Belum ada simbol — pilih minimal satu di bawah.')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {POPULAR_PAIRS.filter((p) => !selectedSymbols.includes(p)).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleSymbol(p)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  + {p.replace('IDR', '')}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="text"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomSymbol();
                    }
                  }}
                  placeholder={l('Add: SOL…', 'Tambah: SOL…')}
                  className="w-24 bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded px-2 py-1 text-[11px] text-slate-100 font-mono outline-none"
                />
                <button
                  type="button"
                  onClick={addCustomSymbol}
                  className="px-2 py-1 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  + {l('Add', 'Tambah')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {l('Max Concurrent Positions (Slots)', 'Maks Posisi Konkuren (Slot)')}
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxActiveTrades}
                  onChange={(e) => setMaxActiveTrades(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                  className="w-full bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono outline-none"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  {l('Mirrors the live engine max_active_trades setting', 'Mencerminkan setting max_active_trades di live engine')}
                </span>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-[11px] text-slate-400">
                {l(
                  'Entry rule is the same 24h rolling momentum scan as the live engine: top gainer enters when a slot and cash are free. Portfolio mode ignores the strategy selector above.',
                  'Aturan entry sama dengan scan momentum 24 jam live engine: gainer teratas masuk saat slot dan kas tersedia. Mode portofologi mengabaikan pemilih strategi di atas.'
                )}
              </div>
            </div>
          </div>
          )}

          <div className={`grid grid-cols-1 sm:grid-cols-2 ${mode === 'single' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 pt-2`}>
            {/* Symbol Selection (single-pair mode only) */}
            {mode === 'single' && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                {l('Pair / Crypto Asset', 'Pair / Aset Kripto')}
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  value={params.symbol}
                  onChange={(e) => setParams({ ...params, symbol: e.target.value.toUpperCase() })}
                  placeholder={l('Example: BTCIDR', 'Contoh: BTCIDR')}
                  className="w-full bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none"
                  required
                />
                <div className="flex flex-wrap gap-1">
                  {POPULAR_PAIRS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setParams({ ...params, symbol: p })}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        params.symbol === p
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p.replace('IDR', '')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            )}

            {/* Timeframe */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                {l('Candlestick Timeframe', 'Timeframe Candlestick')}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['15m', '1h', '4h', '1d'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setParams({ ...params, timeframe: tf })}
                    className={`py-2 rounded-lg text-xs font-semibold font-mono transition-all ${
                      params.timeframe === tf
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-[#070b13] border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-slate-500 block mt-1.5">
                {params.timeframe === '15m' && l('Rapid scalping (high-frequency)', 'Scalping cepat (high-frequency)')}
                {params.timeframe === '1h' && l('Intraday momentum (Recommended)', 'Intraday momentum (Rekomendasi)')}
                {params.timeframe === '4h' && l('Multi-day swing trading', 'Swing trading beberapa hari')}
                {params.timeframe === '1d' && l('Long-term macro trend', 'Trend makro jangka panjang')}
              </span>
            </div>

            {/* Days Duration */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                {l('Duration (Past Days)', 'Rentang Waktu (Hari Terakhir)')}
              </label>
              <select
                value={params.days}
                onChange={(e) => setParams({ ...params, days: parseInt(e.target.value, 10) })}
                className="w-full bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
              >
                <option value={7}>{l('Last 7 Days', '7 Hari Terakhir')}</option>
                <option value={14}>{l('Last 14 Days', '14 Hari Terakhir')}</option>
                <option value={30}>{l('Last 30 Days (1 Month)', '30 Hari Terakhir (1 Bulan)')}</option>
                <option value={60}>{l('Last 60 Days (2 Months)', '60 Hari Terakhir (2 Bulan)')}</option>
                <option value={90}>{l('Last 90 Days (3 Months)', '90 Hari Terakhir (3 Bulan)')}</option>
                <option value={180}>{l('Last 180 Days (6 Months)', '180 Hari Terakhir (6 Bulan)')}</option>
              </select>
              <span className="text-[10px] text-slate-500 block mt-1.5">
                {l('Automatically fetches multi-chunk data from exchange', 'Otomatis mengambil data multi-chunk dari bursa')}
              </span>
            </div>

            {/* Initial Balance */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                {l('Initial Simulation Capital (IDR)', 'Modal Awal Simulasi (IDR)')}
              </label>
              <input
                type="number"
                step="500000"
                value={params.initialBalanceIdr}
                onChange={(e) => setParams({ ...params, initialBalanceIdr: parseFloat(e.target.value) })}
                className="w-full bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono outline-none"
                required
              />
              <span className="text-[10px] text-slate-500 block mt-1.5">
                {formatCurrency(params.initialBalanceIdr || 0)}
              </span>
            </div>
          </div>

          {/* Strategy Fine-Tuning Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-800/80">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {l('Allocation per Trade (IDR)', 'Alokasi per Trade (IDR)')}
              </label>
              <input
                type="number"
                step="10000"
                value={params.allocationPerTradeIdr}
                onChange={(e) => setParams({ ...params, allocationPerTradeIdr: parseFloat(e.target.value) })}
                className="w-full bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono outline-none"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                {formatCurrency(params.allocationPerTradeIdr || 0)} {l('per position', 'per posisi')}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {l('Trailing Stop Loss (%)', 'Trailing Stop Loss (%)')}
              </label>
              <input
                type="number"
                step="0.1"
                value={params.trailingStopPercent}
                onChange={(e) => setParams({ ...params, trailingStopPercent: parseFloat(e.target.value) })}
                className="w-full bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono outline-none"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                {l('Profit ratchet buffer distance', 'Jarak ratchet pengunci profit')}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {l('Scale-Out Take-Profit (%)', 'Scale-Out Take-Profit (%)')}
              </label>
              <input
                type="number"
                step="0.5"
                value={params.takeProfitStep1Percent}
                onChange={(e) => setParams({ ...params, takeProfitStep1Percent: parseFloat(e.target.value) })}
                className="w-full bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono outline-none"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                {l('Sell 50% & lock breakeven SL', 'Jual 50% & geser SL ke Breakeven')}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {l('Momentum Trigger (%)', 'Trigger Momentum (%)')}
              </label>
              <input
                type="number"
                step="0.1"
                value={params.minGainThresholdPercent}
                onChange={(e) => setParams({ ...params, minGainThresholdPercent: parseFloat(e.target.value) })}
                className="w-full bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono outline-none"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                {params.strategyType === 'candle_breakout' ? l('Single-bar surge', 'Kenaikan single-bar') : l('24h rolling surge', 'Kenaikan 24h rolling')}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {l('Estimated Slippage (%)', 'Estimasi Slippage (%)')}
              </label>
              <input
                type="number"
                step="0.1"
                value={params.slippagePercent}
                onChange={(e) => setParams({ ...params, slippagePercent: parseFloat(e.target.value) })}
                className="w-full bg-[#070b13] border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono outline-none"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                {l('Realistic orderbook cut (def 0.2%)', 'Potongan realistis orderbook (def 0.2%)')}
              </span>
            </div>
          </div>
        </form>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-xs">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <div className="font-semibold">{l('Simulation Failed', 'Simulasi Gagal')}</div>
            <div className="text-rose-400/80">{error}</div>
          </div>
        </div>
      )}

      {/* Results Section (Single Pair) */}
      {mode === 'single' && result && (
        <div className="space-y-6">
          {/* Truncation Notification If Any */}
          {result.dataTruncated && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold">{l('Limited Exchange History: ', 'Histori Terbatas Bursa: ')}</span>
                <span>
                  {l(
                    `Indodax exchange provided ${result.totalCandles} candles (~${result.effectiveDays} days) out of ${result.days} days requested. Metrics below reflect the full available data range.`,
                    `Bursa Indodax menyediakan ${result.totalCandles} candle (~${result.effectiveDays} hari) dari ${result.days} hari yang diminta. Metrik di bawah dihitung berdasarkan seluruh rentang riwayat yang tersedia.`
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Strategy & Cost Header Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                {l('Strategy: ', 'Strategi: ')}{result.strategyUsed}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Data: {result.totalCandles} {l('candles', 'candle')} (~{result.effectiveDays} {l('days', 'hari')})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                {l('Costs: Slippage', 'Biaya: Slippage')} {result.slippagePercent}% + {l('Fee', 'Fee Indodax')} {result.feePercent}%
              </span>
            </div>
          </div>

          {/* Beginner Interpretation Card */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-200">
              <Info className="w-4 h-4 text-blue-400" />
              <span>{l('How to Interpret Backtest Results for Beginners:', 'Cara Membaca Hasil Backtest untuk Pemula:')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-[11px] text-slate-400">
              <p>
                • <strong className="text-slate-300">Win Rate: </strong> {l('Percentage of trades with positive net returns. Above 50% indicates healthy directional signals.', 'Persentase trade yang berhasil mencetak laba. Di atas 50% menunjukkan sinyal terarah baik.')}
              </p>
              <p>
                • <strong className="text-slate-300">Profit Factor: </strong> {l('Ratio of total gross gains over total losses. A score above 1.5x is considered strong.', 'Rasio perbandingan total laba dibagi total rugi. Angka di atas 1.5x tergolong sehat.')}
              </p>
              <p>
                • <strong className="text-slate-300">Max Drawdown: </strong> {l('Deepest peak-to-trough capital dip. Lower drawdown protects trader capital and psychology.', 'Penurunan modal terdalam dari titik puncak. Semakin kecil angkanya, semakin aman bagi psikologi trader.')}
              </p>
            </div>
          </div>

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Net PnL IDR */}
            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Net PnL (IDR)</span>
              <div className={`text-base font-bold font-mono ${result.netPnlIdr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.netPnlIdr >= 0 ? '+' : ''}{formatCurrency(result.netPnlIdr)}
              </div>
              <span className={`text-[10px] font-semibold font-mono ${result.netPnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.netPnlPercent >= 0 ? '+' : ''}{result.netPnlPercent}% return
              </span>
            </div>

            {/* Win Rate */}
            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Win Rate</span>
              <div className={`text-base font-bold font-mono ${result.winRatePercent >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {result.winRatePercent}%
              </div>
              <span className="text-[10px] text-slate-400">
                {result.winningTrades} {l('Wins', 'Menang')} / {result.losingTrades} {l('Losses', 'Kalah')}
              </span>
            </div>

            {/* Profit Factor */}
            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Profit Factor</span>
              <div className={`text-base font-bold font-mono ${result.profitFactor === null ? 'text-emerald-400' : result.profitFactor >= 1.5 ? 'text-emerald-400' : result.profitFactor >= 1.0 ? 'text-blue-400' : 'text-rose-400'}`}>
                {result.profitFactor !== null ? `${result.profitFactor}x` : (result.winningTrades > 0 ? `∞ (${l('Zero Loss', 'Tanpa Loss')})` : '0.00x')}
              </div>
              <span className="text-[10px] text-slate-400">
                {result.profitFactor === null ? '100% Win Rate' : result.profitFactor >= 1.5 ? l('Very Strong', 'Sangat Sehat') : result.profitFactor >= 1.0 ? l('Moderate', 'Moderat') : l('Needs Review', 'Perlu Evaluasi')}
              </span>
            </div>

            {/* Max Drawdown */}
            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Max Drawdown</span>
              <div className={`text-base font-bold font-mono ${result.maxDrawdownPercent <= 5 ? 'text-emerald-400' : result.maxDrawdownPercent <= 12 ? 'text-amber-400' : 'text-rose-400'}`}>
                -{result.maxDrawdownPercent}%
              </div>
              <span className="text-[10px] text-slate-400">
                Peak to trough drop
              </span>
            </div>

            {/* Total Trades */}
            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">{l('Total Trades', 'Total Transaksi')}</span>
              <div className="text-base font-bold font-mono text-slate-100">
                {result.totalTrades}
              </div>
              <span className="text-[10px] text-slate-400">
                {l('From', 'Dari')} {result.totalCandles} {l('candles', 'candle')}
              </span>
            </div>

            {/* Final Balance */}
            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">{l('Final Balance', 'Saldo Akhir')}</span>
              <div className="text-base font-bold font-mono text-slate-100">
                {formatCurrency(result.finalBalance)}
              </div>
              <span className="text-[10px] text-slate-500">
                {l('Initial Capital', 'Modal')} {formatCurrency(result.initialBalance)}
              </span>
            </div>
          </div>

          {/* Equity Curve SVG Chart */}
          {result.equityCurve.length > 1 && (
            <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>{l('Equity Growth Curve', 'Kurva Pertumbuhan Ekuitas (Equity Curve)')}</span>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  {result.symbol} &bull; {result.timeframe} &bull; ~{result.effectiveDays} {l('Days', 'Hari')} ({result.totalCandles} {l('candles', 'candle')})
                </div>
              </div>

              {/* Render Pure SVG Curve */}
              <div className="h-48 w-full relative">
                {(() => {
                  const values = result.equityCurve.map((c) => c.equity);
                  const min = Math.min(...values) * 0.995;
                  const max = Math.max(...values) * 1.005;
                  const range = max - min || 1;

                  const points = result.equityCurve
                    .map((c, idx) => {
                      const x = (idx / (result.equityCurve.length - 1)) * 1000;
                      const y = 180 - ((c.equity - min) / range) * 160;
                      return `${x},${y}`;
                    })
                    .join(' ');

                  const isProfitable = result.netPnlIdr >= 0;

                  return (
                    <svg viewBox="0 0 1000 200" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="eqGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor={isProfitable ? '#10b981' : '#f43f5e'} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={isProfitable ? '#10b981' : '#f43f5e'} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Area Fill */}
                      <polygon
                        points={`0,180 ${points} 1000,180`}
                        fill="url(#eqGrad)"
                      />

                      {/* Line */}
                      <polyline
                        points={points}
                        fill="none"
                        stroke={isProfitable ? '#10b981' : '#f43f5e'}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1">
                <span>{l('Start: ', 'Mulai: ')}{result.equityCurve[0]?.time}</span>
                <span>{l('Latest: ', 'Terakhir: ')}{result.equityCurve[result.equityCurve.length - 1]?.time}</span>
              </div>
            </div>
          )}

          {/* Trade History Table */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>{l('Backtest Trade Execution Log', 'Catatan Transaksi Backtest')} ({result.trades.length} {l('Trades', 'Trade')})</span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                {l('Average Return: ', 'Rata-rata Return: ')}{result.averageTradePnlPercent >= 0 ? '+' : ''}{result.averageTradePnlPercent}% / trade
              </div>
            </div>

            {result.trades.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                {l(
                  'No entry signals met momentum criteria in this dataset. Try using "24h Rolling Momentum" or lower timeframe.',
                  'Tidak ada sinyal entry yang memenuhi kriteria momentum pada rentang data ini. Coba gunakan strategi "24h Rolling Momentum" atau gunakan timeframe lebih rendah.'
                )}
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                        <th className="py-2.5 px-3">{l('Entry Time', 'Waktu Masuk')}</th>
                        <th className="py-2.5 px-3">{l('Exit Time', 'Waktu Keluar')}</th>
                        <th className="py-2.5 px-3">{l('Duration', 'Durasi')}</th>
                        <th className="py-2.5 px-3">{l('Entry Price', 'Harga Masuk')}</th>
                        <th className="py-2.5 px-3">{l('Exit Price', 'Harga Keluar')}</th>
                        <th className="py-2.5 px-3">{l('Exit Reason', 'Alasan Keluar')}</th>
                        <th className="py-2.5 px-3 text-right">PnL (IDR)</th>
                        <th className="py-2.5 px-3 text-right">Return</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {result.trades.map((trade) => {
                        const isWin = trade.pnlIdr > 0;
                        return (
                          <tr key={trade.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-2 px-3 text-slate-300">{trade.entryDate}</td>
                            <td className="py-2 px-3 text-slate-300">{trade.exitDate}</td>
                            <td className="py-2 px-3 text-slate-400">{trade.holdDurationHours} {l('h', 'jam')}</td>
                            <td className="py-2 px-3 text-slate-200">{formatCurrency(trade.entryPrice)}</td>
                            <td className="py-2 px-3 text-slate-200">{formatCurrency(trade.exitPrice)}</td>
                            <td className="py-2 px-3 text-slate-400">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                isWin ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'
                              }`}>
                                {trade.exitReason}
                              </span>
                            </td>
                            <td className={`py-2 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}{formatCurrency(trade.pnlIdr)}
                            </td>
                            <td className={`py-2 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}{trade.pnlPercent}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="md:hidden divide-y divide-slate-800/60 font-mono">
                  {result.trades.map((trade) => {
                    const isWin = trade.pnlIdr > 0;
                    return (
                      <div key={trade.id} className="py-3.5 space-y-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isWin ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700/60'
                          }`}>
                            {trade.exitReason}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500">{trade.holdDurationHours} {l('h', 'jam')}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              isWin ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
                            }`}>
                              {isWin ? '+' : ''}{trade.pnlPercent}%
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
                          <div>
                            <span className="text-[10px] text-slate-500 block">{l('ENTRY', 'MASUK')} ({trade.entryDate})</span>
                            <span className="text-slate-200 font-semibold">{formatCurrency(trade.entryPrice)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">{l('EXIT', 'KELUAR')} ({trade.exitDate})</span>
                            <span className="text-slate-200 font-semibold">{formatCurrency(trade.exitPrice)}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-0.5">
                          <span className="text-slate-400 text-[11px]">Net PnL (IDR):</span>
                          <span className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? '+' : ''}{formatCurrency(trade.pnlIdr)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Results Section (Portfolio) */}
      {mode === 'portfolio' && portfolioResult && (
        <div className="space-y-6">
          {/* Header badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                {l('Portfolio: ', 'Portofolio: ')}
                {portfolioResult.symbolsWithData.join(', ')}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {portfolioResult.totalCandles} {l('candles', 'candle')}
              </span>
              {portfolioResult.symbolsRequested.length !== portfolioResult.symbolsWithData.length && (
                <span className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-500/30">
                  {l('No data: ', 'Tanpa data: ')}
                  {portfolioResult.symbolsRequested.filter((s) => !portfolioResult.symbolsWithData.includes(s)).join(', ')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                {l('Costs: Slippage', 'Biaya: Slippage')} {portfolioResult.slippagePercent}% + {l('Fee', 'Fee Indodax')} {portfolioResult.feePercent}%
              </span>
            </div>
          </div>

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Net PnL (IDR)</span>
              <div className={`text-base font-bold font-mono ${portfolioResult.netPnlIdr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {portfolioResult.netPnlIdr >= 0 ? '+' : ''}{formatCurrency(portfolioResult.netPnlIdr)}
              </div>
              <span className={`text-[10px] font-semibold font-mono ${portfolioResult.netPnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {portfolioResult.netPnlPercent >= 0 ? '+' : ''}{portfolioResult.netPnlPercent}% return
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Win Rate</span>
              <div className={`text-base font-bold font-mono ${portfolioResult.winRatePercent >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {portfolioResult.winRatePercent}%
              </div>
              <span className="text-[10px] text-slate-400">
                {portfolioResult.winningTrades} {l('Wins', 'Menang')} / {portfolioResult.losingTrades} {l('Losses', 'Kalah')}
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Profit Factor</span>
              <div className={`text-base font-bold font-mono ${portfolioResult.profitFactor === null ? 'text-emerald-400' : portfolioResult.profitFactor >= 1.5 ? 'text-emerald-400' : portfolioResult.profitFactor >= 1.0 ? 'text-blue-400' : 'text-rose-400'}`}>
                {portfolioResult.profitFactor !== null ? `${portfolioResult.profitFactor}x` : (portfolioResult.winningTrades > 0 ? `∞ (${l('Zero Loss', 'Tanpa Loss')})` : '0.00x')}
              </div>
              <span className="text-[10px] text-slate-400">
                {portfolioResult.profitFactor === null ? '100% Win Rate' : portfolioResult.profitFactor >= 1.5 ? l('Very Strong', 'Sangat Sehat') : portfolioResult.profitFactor >= 1.0 ? l('Moderate', 'Moderat') : l('Needs Review', 'Perlu Evaluasi')}
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Max Drawdown</span>
              <div className={`text-base font-bold font-mono ${portfolioResult.maxDrawdownPercent <= 5 ? 'text-emerald-400' : portfolioResult.maxDrawdownPercent <= 12 ? 'text-amber-400' : 'text-rose-400'}`}>
                -{portfolioResult.maxDrawdownPercent}%
              </div>
              <span className="text-[10px] text-slate-400">
                {l('Peak to trough drop', 'Penurunan puncak ke lembah')}
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">{l('Max Concurrent Slots', 'Slot Konkuren Maks')}</span>
              <div className="text-base font-bold font-mono text-slate-100">
                {portfolioResult.maxConcurrentPositions}
              </div>
              <span className="text-[10px] text-slate-400">
                {l('Used avg', 'Rata-rata terpakai')}: {portfolioResult.slotUtilizationPercent}%
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b101b] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">{l('Final Balance', 'Saldo Akhir')}</span>
              <div className="text-base font-bold font-mono text-slate-100">
                {formatCurrency(portfolioResult.finalBalance)}
              </div>
              <span className="text-[10px] text-slate-500">
                {l('Initial Capital', 'Modal')} {formatCurrency(portfolioResult.initialBalance)}
              </span>
            </div>
          </div>

          {/* Equity Curve */}
          {portfolioResult.equityCurve.length > 1 && (
            <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>{l('Portfolio Equity Curve', 'Kurva Ekuitas Portofolio')}</span>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  {portfolioResult.symbolsWithData.length} {l('symbols', 'simbol')} &bull; {portfolioResult.timeframe} &bull; ~{portfolioResult.days} {l('Days', 'Hari')}
                </div>
              </div>

              <div className="h-48 w-full relative">
                {(() => {
                  const values = portfolioResult.equityCurve.map((c) => c.equity);
                  const min = Math.min(...values) * 0.995;
                  const max = Math.max(...values) * 1.005;
                  const range = max - min || 1;

                  const points = portfolioResult.equityCurve
                    .map((c, idx) => {
                      const x = (idx / (portfolioResult.equityCurve.length - 1)) * 1000;
                      const y = 180 - ((c.equity - min) / range) * 160;
                      return `${x},${y}`;
                    })
                    .join(' ');

                  const isProfitable = portfolioResult.netPnlIdr >= 0;

                  return (
                    <svg viewBox="0 0 1000 200" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="eqGradPortfolio" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor={isProfitable ? '#10b981' : '#f43f5e'} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={isProfitable ? '#10b981' : '#f43f5e'} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <polygon points={`0,180 ${points} 1000,180`} fill="url(#eqGradPortfolio)" />
                      <polyline
                        points={points}
                        fill="none"
                        stroke={isProfitable ? '#10b981' : '#f43f5e'}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1">
                <span>
                  {l('Start: ', 'Mulai: ')}
                  {new Date(portfolioResult.equityCurve[0]?.timestamp || Date.now()).toLocaleDateString('id-ID')}
                </span>
                <span>
                  {l('Latest: ', 'Terakhir: ')}
                  {new Date(portfolioResult.equityCurve[portfolioResult.equityCurve.length - 1]?.timestamp || Date.now()).toLocaleDateString('id-ID')}
                </span>
              </div>
            </div>
          )}

          {/* Per-Symbol Attribution */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200 pb-2 border-b border-slate-800">
              <PieChart className="w-4 h-4 text-indigo-400" />
              <span>{l('Per-Symbol Contribution', 'Kontribusi per Simbol')}</span>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                    <th className="py-2.5 px-3">{l('Symbol', 'Simbol')}</th>
                    <th className="py-2.5 px-3">{l('Candles', 'Candle')}</th>
                    <th className="py-2.5 px-3">{l('Trades', 'Trade')}</th>
                    <th className="py-2.5 px-3 text-right">Net PnL (IDR)</th>
                    <th className="py-2.5 px-3 text-right">{l('Share', 'Kontribusi')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {[...portfolioResult.perSymbol]
                    .sort((a, b) => b.netPnlIdr - a.netPnlIdr)
                    .map((s) => {
                      const totalPositive = portfolioResult.perSymbol.reduce((acc, x) => acc + Math.max(0, x.netPnlIdr), 0) || 1;
                      const share = s.netPnlIdr > 0 ? (s.netPnlIdr / totalPositive) * 100 : 0;
                      return (
                        <tr key={s.symbol} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-2 px-3 font-bold text-slate-200">{s.symbol}</td>
                          <td className="py-2 px-3 text-slate-400">{s.candles}</td>
                          <td className="py-2 px-3 text-slate-300">{s.trades}</td>
                          <td className={`py-2 px-3 text-right font-bold ${s.netPnlIdr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {s.netPnlIdr >= 0 ? '+' : ''}{formatCurrency(s.netPnlIdr)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-400">
                            {share > 0 ? `${share.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Portfolio Trade Log */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b101b] p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>{l('Portfolio Trade Log', 'Catatan Trade Portofolio')} ({portfolioResult.trades.length} {l('Trades', 'Trade')})</span>
              </div>
            </div>

            {portfolioResult.trades.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                {l(
                  'No entry signals met the momentum criteria across the selected symbols in this period.',
                  'Tidak ada sinyal entry yang memenuhi kriteria momentum pada simbol yang dipilih di periode ini.'
                )}
              </div>
            ) : (
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                      <th className="py-2.5 px-3">{l('Symbol', 'Simbol')}</th>
                      <th className="py-2.5 px-3">{l('Entry Time', 'Waktu Masuk')}</th>
                      <th className="py-2.5 px-3">{l('Exit Time', 'Waktu Keluar')}</th>
                      <th className="py-2.5 px-3">{l('Entry Price', 'Harga Masuk')}</th>
                      <th className="py-2.5 px-3">{l('Exit Price', 'Harga Keluar')}</th>
                      <th className="py-2.5 px-3">{l('Exit Reason', 'Alasan Keluar')}</th>
                      <th className="py-2.5 px-3 text-right">PnL (IDR)</th>
                      <th className="py-2.5 px-3 text-right">Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {portfolioResult.trades.slice(0, 50).map((trade, idx) => {
                      const isWin = trade.pnlIdr > 0;
                      return (
                        <tr key={`${trade.symbol}-${trade.entryTime}-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-2 px-3 font-bold text-slate-200">{trade.symbol}</td>
                          <td className="py-2 px-3 text-slate-300">{new Date(trade.entryTime).toLocaleString('id-ID')}</td>
                          <td className="py-2 px-3 text-slate-300">{new Date(trade.exitTime).toLocaleString('id-ID')}</td>
                          <td className="py-2 px-3 text-slate-200">{formatCurrency(trade.entryPrice)}</td>
                          <td className="py-2 px-3 text-slate-200">{formatCurrency(trade.exitPrice)}</td>
                          <td className="py-2 px-3 text-slate-400">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                              isWin ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'
                            }`}>
                              {trade.exitReason}
                            </span>
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? '+' : ''}{formatCurrency(trade.pnlIdr)}
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? '+' : ''}{trade.pnlPercent}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {portfolioResult.trades.length > 50 && (
                  <p className="text-[11px] text-slate-500 text-center pt-3">
                    {l('Showing the 50 most recent trades.', 'Menampilkan 50 trade terbaru.')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
