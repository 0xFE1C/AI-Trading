import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  UTCTimestamp,
  CandlestickData,
  HistogramData,
  LineData,
  CrosshairMode,
} from 'lightweight-charts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Radio,
  Search,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  BarChart3,
  LineChart,
  Eye,
  EyeOff,
  X,
  ChevronsUpDown,
  Clock,
  Zap,
} from 'lucide-react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';

// Perhitungan Exponential Moving Average (EMA) matematis presisi
function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const emaValues: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    const val = prices[i] * k + emaValues[i - 1] * (1 - k);
    emaValues.push(val);
  }
  return emaValues;
}

// Daftar Lengkap Koin Populer Indodax untuk Dropdown Pencarian
const POPULAR_INDODAX_PAIRS = [
  { symbol: 'BTC/IDR', name: 'Bitcoin', category: 'Major' },
  { symbol: 'ETH/IDR', name: 'Ethereum', category: 'Major' },
  { symbol: 'SOL/IDR', name: 'Solana', category: 'Major' },
  { symbol: 'XRP/IDR', name: 'Ripple', category: 'Major' },
  { symbol: 'DOGE/IDR', name: 'Dogecoin', category: 'Meme' },
  { symbol: 'PEPE/IDR', name: 'Pepe', category: 'Meme' },
  { symbol: 'SHIB/IDR', name: 'Shiba Inu', category: 'Meme' },
  { symbol: 'SUI/IDR', name: 'Sui', category: 'Layer 1' },
  { symbol: 'TON/IDR', name: 'The Open Network', category: 'Layer 1' },
  { symbol: 'ADA/IDR', name: 'Cardano', category: 'Layer 1' },
  { symbol: 'BNB/IDR', name: 'BNB', category: 'Major' },
  { symbol: 'TRX/IDR', name: 'TRON', category: 'Layer 1' },
  { symbol: 'AVAX/IDR', name: 'Avalanche', category: 'Layer 1' },
  { symbol: 'NEAR/IDR', name: 'Near Protocol', category: 'Layer 1' },
  { symbol: 'RENDER/IDR', name: 'Render Token', category: 'AI & DePIN' },
  { symbol: 'FET/IDR', name: 'Artificial Superintelligence', category: 'AI & DePIN' },
];

export const CryptoChart: React.FC<{ selectedSymbol?: string }> = ({ selectedSymbol = 'BTC/IDR' }) => {
  const { l, formatCurrency, language } = useLanguage();
  // --- 1. Symbol & Timeframe State ---
  const [activePair, setActivePair] = useState(selectedSymbol);
  const [timeframe, setTimeframe] = useState<'15m' | '1h' | '4h' | '1d'>('15m');
  const [chartType, setChartType] = useState<'candles' | 'line'>('candles');

  // --- 2. Indicators & Display Controls ---
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [chartHeightPreset, setChartHeightPreset] = useState<'normal' | 'tall'>('normal');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- 3. Search & Pair Modal State ---
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [customInput, setCustomInput] = useState('');

  // --- 4. Market Data State ---
  const [isLoading, setIsLoading] = useState(true);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [liveMetrics, setLiveMetrics] = useState({
    latestPrice: 0,
    open24h: 0,
    high24h: 0,
    low24h: 0,
    volIdr: 0,
  });

  const [barCountdown, setBarCountdown] = useState<string>('00:00');
  const [lastTickAgo, setLastTickAgo] = useState<number>(0);
  const [recentTrades, setRecentTrades] = useState<
    Array<{ price: number; type: 'buy' | 'sell'; time: string; amount: string }>
  >([]);

  const [hoveredOHLC, setHoveredOHLC] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
  } | null>(null);

  // Canvas Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const lastBarRef = useRef<CandlestickData<UTCTimestamp> | null>(null);
  const loadedPairRef = useRef<string>(activePair);
  const lastTickTimeRef = useRef<number>(Date.now());

  // Selalu sinkronkan loadedPairRef dengan activePair
  useEffect(() => {
    loadedPairRef.current = activePair;
  }, [activePair]);

  // --- 1. Inisialisasi TradingView Lightweight Charts Engine ---
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const height = isFullscreen
      ? window.innerHeight - 130
      : chartHeightPreset === 'tall'
      ? (isMobile ? 420 : 620)
      : (isMobile ? 340 : 490);

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#070b14' },
        textColor: '#64748b',
        fontFamily: 'monospace',
      },
      grid: {
        vertLines: { color: '#0f172a' },
        horzLines: { color: '#0f172a' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#475569',
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: '#475569',
          width: 1,
          style: 3,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    // 2. Area Series (Garis)
    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(59, 130, 246, 0.4)',
      bottomColor: 'rgba(59, 130, 246, 0.0)',
      lineColor: '#3b82f6',
      lineWidth: 2,
      visible: chartType === 'line',
    });

    // 3. Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#334155',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      visible: showVolume,
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.80,
        bottom: 0,
      },
    });

    // 4. Indikator EMA 9 & EMA 21
    const ema9Series = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      visible: showEMA9,
      crosshairMarkerVisible: false,
    });

    const ema21Series = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      visible: showEMA21,
      crosshairMarkerVisible: false,
    });

    // 5. Crosshair Hover Tracker
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoveredOHLC(null);
        return;
      }

      const candle = param.seriesData.get(candleSeries) as CandlestickData<UTCTimestamp> | undefined;
      if (candle) {
        const timeStr = typeof param.time === 'number'
          ? new Date(param.time * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : String(param.time);

        const change = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;

        setHoveredOHLC({
          time: timeStr,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          change,
        });
      }
    });

    chartInstanceRef.current = chart;
    candlestickSeriesRef.current = candleSeries;
    areaSeriesRef.current = areaSeries;
    volumeSeriesRef.current = volumeSeries;
    ema9SeriesRef.current = ema9Series;
    ema21SeriesRef.current = ema21Series;

    const handleResize = () => {
      if (container && chartInstanceRef.current) {
        const isMobile = window.innerWidth < 640;
        const targetHeight = isFullscreen
          ? window.innerHeight - 130
          : chartHeightPreset === 'tall'
          ? (isMobile ? 420 : 620)
          : (isMobile ? 340 : 490);
        chartInstanceRef.current.applyOptions({
          width: container.clientWidth,
          height: targetHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartInstanceRef.current = null;
    };
  }, [chartHeightPreset, isFullscreen]);

  // Update visibility saat toggle indikator diklik
  useEffect(() => {
    candlestickSeriesRef.current?.applyOptions({ visible: chartType === 'candles' });
    areaSeriesRef.current?.applyOptions({ visible: chartType === 'line' });
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
    ema9SeriesRef.current?.applyOptions({ visible: showEMA9 });
    ema21SeriesRef.current?.applyOptions({ visible: showEMA21 });
  }, [chartType, showVolume, showEMA9, showEMA21]);

  // --- 2. Load Data Koin dengan Proteksi Anti-Gepeng & Anti-Tercampur ---
  const loadPairData = useCallback(async (pair: string, tf: '15m' | '1h' | '4h' | '1d') => {
    loadedPairRef.current = pair;
    setIsLoading(true);

    // BERSIHKAN DATA LAMA SECARA INSTAN! (Mencegah lilin gepeng dan kebocoran harga)
    candlestickSeriesRef.current?.setData([]);
    areaSeriesRef.current?.setData([]);
    volumeSeriesRef.current?.setData([]);
    ema9SeriesRef.current?.setData([]);
    ema21SeriesRef.current?.setData([]);
    lastBarRef.current = null;
    setRecentTrades([]);

    try {
      const data = await api.getChartData(pair, tf);

      // Proteksi Race Condition: Jika user sudah berganti pair sebelum request selesai, abaikan data lama!
      if (loadedPairRef.current !== pair) return;

      if (data && data.candles && data.candles.length > 0) {
        const candlesMap = new Map<number, CandlestickData<UTCTimestamp>>();
        const volumeMap = new Map<number, HistogramData<UTCTimestamp>>();
        const areaData: LineData<UTCTimestamp>[] = [];

        for (const c of data.candles) {
          const timeSec = Math.floor(c.timestamp / 1000) as UTCTimestamp;
          if (!candlesMap.has(timeSec)) {
            candlesMap.set(timeSec, {
              time: timeSec,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            });

            const isCandleUp = c.close >= c.open;
            volumeMap.set(timeSec, {
              time: timeSec,
              value: c.volume,
              color: isCandleUp ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
            });

            areaData.push({ time: timeSec, value: c.close });
          }
        }

        const sortedCandles = Array.from(candlesMap.values()).sort((a, b) => Number(a.time) - Number(b.time));
        const sortedVolumes = Array.from(volumeMap.values()).sort((a, b) => Number(a.time) - Number(b.time));

        const closePrices = sortedCandles.map((c) => c.close);
        const ema9Vals = calculateEMA(closePrices, 9);
        const ema21Vals = calculateEMA(closePrices, 21);

        const ema9Data: LineData<UTCTimestamp>[] = sortedCandles.map((c, i) => ({
          time: c.time,
          value: ema9Vals[i],
        }));

        const ema21Data: LineData<UTCTimestamp>[] = sortedCandles.map((c, i) => ({
          time: c.time,
          value: ema21Vals[i],
        }));

        candlestickSeriesRef.current?.setData(sortedCandles);
        areaSeriesRef.current?.setData(areaData);
        volumeSeriesRef.current?.setData(sortedVolumes);
        ema9SeriesRef.current?.setData(ema9Data);
        ema21SeriesRef.current?.setData(ema21Data);

        // Paksa autoScale dan fitContent agar skala grafik normal dan tidak gepeng
        chartInstanceRef.current?.priceScale('right').applyOptions({ autoScale: true });
        chartInstanceRef.current?.timeScale().fitContent();

        lastBarRef.current = sortedCandles[sortedCandles.length - 1];

        const first = sortedCandles[0];
        const latestPrice = data.latestPrice || sortedCandles[sortedCandles.length - 1].close;

        setLiveMetrics({
          latestPrice,
          open24h: first ? first.open : latestPrice,
          high24h: data.high24h || Math.max(...sortedCandles.map((c) => c.high)),
          low24h: data.low24h || Math.min(...sortedCandles.map((c) => c.low)),
          volIdr: data.volIdr || 0,
        });
      }
    } catch (err) {
      console.warn('[CryptoChart] Gagal memuat data:', err);
    } finally {
      if (loadedPairRef.current === pair) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadPairData(activePair, timeframe);
  }, [activePair, timeframe, loadPairData]);

  // --- 3. Real-Time Millisecond Tick Ingestion via WebSocket (Dengan Triple-Lock Guard) ---
  useEffect(() => {
    let isClosed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectLiveWs = () => {
      if (isClosed) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
          if (isClosed) return;
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'PRICE_TICK' && payload.data) {
              const tick = payload.data;
              const expectedPair = loadedPairRef.current.toLowerCase().replace('/', '').replace('_', '');

              // LOCK 1: Tolak jika nama pair tidak sesuai dengan koin aktif di layar
              if (!tick.pair || tick.pair.toLowerCase() !== expectedPair) return;

              // LOCK 2: Tolak jika harga tidak valid atau negatif
              if (!tick.price || tick.price <= 0) return;

              // LOCK 3: SANITY CHECK ANTI-GEPENG!
              // Jika selisih harga tick lebih dari 80% dari harga candle terakhir, tolak keras!
              // (Mencegah harga koin lain seperti XRP Rp 23k masuk ke chart BTC Rp 1.4B)
              if (lastBarRef.current && lastBarRef.current.close > 0) {
                const ratio = tick.price / lastBarRef.current.close;
                if (ratio < 0.25 || ratio > 4.0) {
                  console.warn(`[Chart Guard] Menolak tick anomali ${tick.price} untuk ${expectedPair} (terakhir: ${lastBarRef.current.close})`);
                  return;
                }
              }

              lastTickTimeRef.current = Date.now();
              setLastTickAgo(0);

              setLiveMetrics((prev) => {
                const isTickUp = tick.price >= (prev.latestPrice || tick.price);
                setFlash(isTickUp ? 'up' : 'down');
                setTimeout(() => setFlash(null), 600);

                return {
                  ...prev,
                  latestPrice: tick.price,
                  high24h: tick.high24h || Math.max(prev.high24h, tick.price),
                  low24h: tick.low24h || (prev.low24h > 0 ? Math.min(prev.low24h, tick.price) : tick.price),
                  volIdr: tick.volume > 0 ? tick.volume : prev.volIdr,
                };
              });

              // UPDATE FORMING CANDLE SECARA INSTAN
              const bucketSec =
                timeframe === '15m' ? 15 * 60 : timeframe === '1h' ? 60 * 60 : timeframe === '4h' ? 4 * 3600 : 86400;
              const nowSec = Math.floor(Date.now() / 1000);
              const currentBucket = (Math.floor(nowSec / bucketSec) * bucketSec) as UTCTimestamp;

              if (lastBarRef.current) {
                if (lastBarRef.current.time === currentBucket) {
                  const updatedBar: CandlestickData<UTCTimestamp> = {
                    time: currentBucket,
                    open: lastBarRef.current.open,
                    high: Math.max(lastBarRef.current.high, tick.price),
                    low: Math.min(lastBarRef.current.low, tick.price),
                    close: tick.price,
                  };
                  lastBarRef.current = updatedBar;
                  candlestickSeriesRef.current?.update(updatedBar);
                  areaSeriesRef.current?.update({ time: currentBucket, value: tick.price });
                } else if (currentBucket > lastBarRef.current.time) {
                  // LAHIRKAN CANDLE BARU
                  const newBar: CandlestickData<UTCTimestamp> = {
                    time: currentBucket,
                    open: tick.price,
                    high: tick.price,
                    low: tick.price,
                    close: tick.price,
                  };
                  lastBarRef.current = newBar;
                  candlestickSeriesRef.current?.update(newBar);
                  areaSeriesRef.current?.update({ time: currentBucket, value: tick.price });
                }
              }

              // Catat riwayat recent trades
              setRecentTrades((prev) => [
                {
                  price: tick.price,
                  type: tick.side || 'buy',
                  time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  amount: tick.volume ? (tick.volume / tick.price).toFixed(4) : '0.001',
                },
                ...prev.slice(0, 3),
              ]);
            }
          } catch {}
        };

        socket.onclose = () => {
          if (!isClosed) {
            reconnectTimer = setTimeout(connectLiveWs, 3000);
          }
        };
      } catch {}
    };

    connectLiveWs();

    return () => {
      isClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [activePair, timeframe]);

  // --- 4. Bar Countdown Timer (TradingView Pro Feature) ---
  useEffect(() => {
    const timer = setInterval(() => {
      const bucketSec =
        timeframe === '15m' ? 15 * 60 : timeframe === '1h' ? 60 * 60 : timeframe === '4h' ? 4 * 3600 : 86400;
      const nowSec = Math.floor(Date.now() / 1000);
      const currentBucket = Math.floor(nowSec / bucketSec) * bucketSec;
      const secondsRemaining = Math.max(0, currentBucket + bucketSec - nowSec);

      const m = Math.floor(secondsRemaining / 60);
      const s = secondsRemaining % 60;
      setBarCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);

      const secAgo = Math.floor((Date.now() - lastTickTimeRef.current) / 1000);
      setLastTickAgo(secAgo);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeframe]);

  // Navigasi & Zoom Handlers
  const handleZoomIn = () => {
    const timeScale = chartInstanceRef.current?.timeScale();
    const range = timeScale?.getVisibleLogicalRange();
    if (timeScale && range) {
      const step = Math.max(2, Math.round((range.to - range.from) * 0.15));
      timeScale.setVisibleLogicalRange({ from: range.from + step, to: range.to });
    }
  };

  const handleZoomOut = () => {
    const timeScale = chartInstanceRef.current?.timeScale();
    const range = timeScale?.getVisibleLogicalRange();
    if (timeScale && range) {
      const step = Math.max(2, Math.round((range.to - range.from) * 0.15));
      timeScale.setVisibleLogicalRange({ from: range.from - step, to: range.to });
    }
  };

  const handleResetView = () => {
    chartInstanceRef.current?.priceScale('right').applyOptions({ autoScale: true });
    chartInstanceRef.current?.timeScale().fitContent();
  };

  // Pilih koin baru dari dropdown search
  const selectPair = (symbol: string) => {
    if (symbol === activePair) return;
    setActivePair(symbol);
    setIsSearchOpen(false);
    setSearchQuery('');
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    let formatted = customInput.trim().toUpperCase();
    if (!formatted.includes('/') && !formatted.endsWith('IDR')) {
      formatted = `${formatted}/IDR`;
    } else if (!formatted.includes('/') && formatted.endsWith('IDR')) {
      formatted = `${formatted.slice(0, -3)}/IDR`;
    }
    selectPair(formatted);
    setCustomInput('');
  };

  const filteredPairs = POPULAR_INDODAX_PAIRS.filter(
    (p) =>
      p.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const priceChange = liveMetrics.latestPrice - liveMetrics.open24h;
  const percentChange = liveMetrics.open24h > 0 ? (priceChange / liveMetrics.open24h) * 100 : 0;
  const isUp = priceChange >= 0;

  return (
    <div
      className={`rounded-xl border border-slate-800 bg-[#070b14] shadow-2xl transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none p-5 overflow-hidden flex flex-col bg-[#060a12]' : 'w-full'
      }`}
    >
      {/* ======================================================== */}
      {/* TIER 1: ASSET HUB & REALTIME TICKER BAR                  */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/40">
        {/* Left: Dropdown Pemilih Koin Eksklusif (Tab Cepat Dihapus Sesuai Permintaan) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 hover:border-blue-500 hover:bg-slate-900 transition-all shadow-md group"
            >
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-mono font-bold text-sm text-slate-100 group-hover:text-blue-400 transition-colors">
                {activePair}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-500/30 text-blue-300 font-mono">
                Cari Koin
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-200" />
            </button>

            {/* Dropdown Modal dengan Fitur Search Lengkap */}
            {isSearchOpen && (
              <div className="absolute top-full left-0 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-950/95 backdrop-blur-xl shadow-2xl z-50 p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <span className="text-xs font-semibold text-slate-300">{l('Select Indodax Coin Pair', 'Pilih Pasangan Koin Indodax')}</span>
                  <button onClick={() => setIsSearchOpen(false)} className="text-slate-400 hover:text-slate-200">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder={l('Search BTC, SOL, PEPE, SUI, XRP...', 'Cari BTC, SOL, PEPE, SUI, XRP...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 rounded-lg text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {filteredPairs.map((p) => (
                    <button
                      key={p.symbol}
                      onClick={() => selectPair(p.symbol)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors text-left ${
                        activePair === p.symbol
                          ? 'bg-blue-600 text-white font-bold'
                          : 'hover:bg-slate-800/70 text-slate-300'
                      }`}
                    >
                      <div>
                        <div>{p.symbol}</div>
                        <div className="text-[10px] opacity-60 font-sans">{p.name}</div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">
                        {p.category}
                      </span>
                    </button>
                  ))}
                </div>

                <form onSubmit={handleCustomSubmit} className="pt-2 mt-2 border-t border-slate-800 flex gap-1.5">
                  <input
                    type="text"
                    placeholder={l('Other coin (e.g. ADA)', 'Koin lain (e.g. ADA)')}
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 px-2 py-1 rounded text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold font-mono"
                  >
                    Load
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Live Price Display & 24h Change */}
          <div className="flex items-baseline gap-2.5 pl-2 border-l border-slate-800">
            <span
              className={`text-xl sm:text-2xl font-bold font-mono tracking-tight transition-all duration-300 ${
                flash === 'up'
                  ? 'text-emerald-300 scale-105 drop-shadow-[0_0_12px_rgba(16,185,129,0.8)]'
                  : flash === 'down'
                  ? 'text-rose-300 scale-105 drop-shadow-[0_0_12px_rgba(244,63,94,0.8)]'
                  : 'text-slate-100'
              }`}
            >
              {formatCurrency(liveMetrics.latestPrice)}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-0.5 font-mono ${
                isUp
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
              }`}
            >
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? '+' : ''}
              {percentChange.toFixed(2)}%
            </span>
          </div>

          {/* Bar Countdown Timer */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs">
            <Clock className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[10px] text-slate-500 uppercase">{l('Bar Close:', 'Tutup Bar:')}</span>
            <span className="font-bold text-amber-400">{barCountdown}</span>
          </div>
        </div>

        {/* Right: Key Ticker Stats & Realtime Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-slate-400 pr-3 border-r border-slate-800">
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">24h High</span>
              <span className="text-emerald-400 font-semibold">
                Rp {liveMetrics.high24h > 0 ? liveMetrics.high24h.toLocaleString('id-ID') : '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">24h Low</span>
              <span className="text-rose-400 font-semibold">
                Rp {liveMetrics.low24h > 0 ? liveMetrics.low24h.toLocaleString('id-ID') : '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Volume IDR</span>
              <span className="text-slate-200 font-semibold">
                Rp {(liveMetrics.volIdr / 1e9).toFixed(2)} M
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border border-emerald-500/30 bg-emerald-950/40 text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>TradingView Engine</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border border-blue-500/30 bg-blue-950/40 text-blue-300">
              <Radio className="h-3 w-3 text-blue-400 animate-pulse" />
              <span>ws3.indodax.com</span>
              <span className="text-[10px] text-blue-400/90 font-mono">({lastTickAgo}s)</span>
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TIER 2: PROFESSIONAL CONTROL TOOLSTRIP (RIBBON)          */}
      {/* ======================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b border-slate-800/60 bg-slate-950/50">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Timeframe Selector */}
          <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800 text-xs font-mono">
            {(['15m', '1h', '4h', '1d'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Chart Type Toggle */}
          <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setChartType('candles')}
              title={l('TradingView Candlestick Chart', 'Grafik Candlestick TradingView')}
              className={`p-1.5 rounded transition-colors ${
                chartType === 'candles' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setChartType('line')}
              title={l('Area Line Chart', 'Grafik Garis Area (Line)')}
              className={`p-1.5 rounded transition-colors ${
                chartType === 'line' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LineChart className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Indicators Toggle */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <button
              onClick={() => setShowEMA9(!showEMA9)}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors ${
                showEMA9
                  ? 'border-blue-500/40 bg-blue-950/30 text-blue-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-500'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span>EMA 9</span>
              {showEMA9 ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>

            <button
              onClick={() => setShowEMA21(!showEMA21)}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors ${
                showEMA21
                  ? 'border-amber-500/40 bg-amber-950/30 text-amber-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-500'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>EMA 21</span>
              {showEMA21 ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>

            <button
              onClick={() => setShowVolume(!showVolume)}
              className={`hidden sm:flex px-2.5 py-1 rounded-lg border items-center gap-1.5 transition-colors ${
                showVolume
                  ? 'border-slate-700 bg-slate-900 text-slate-200'
                  : 'border-slate-800 bg-slate-900/50 text-slate-500'
              }`}
            >
              <span>Volume</span>
              {showVolume ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
            <button
              onClick={handleZoomIn}
              title={l('Zoom In Candles', 'Perbesar Tampilan Candle (Zoom In)')}
              className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              title={l('Zoom Out Candles', 'Perkecil Tampilan Candle (Zoom Out)')}
              className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleResetView}
              title="Reset Tampilan TradingView (Auto-fit)"
              className="px-2 py-1 rounded text-xs font-mono text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {!isFullscreen && (
            <button
              onClick={() => setChartHeightPreset(chartHeightPreset === 'normal' ? 'tall' : 'normal')}
              title={chartHeightPreset === 'normal' ? 'Tingkatkan Tinggi Kanvas' : 'Tinggi Standar'}
              className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition-colors ${
                chartHeightPreset === 'tall'
                  ? 'border-blue-500/40 bg-blue-950/40 text-blue-300 font-bold'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {chartHeightPreset === 'normal' ? l('Expand', 'Perluas') : l('Compact', 'Rapatkan')}
            </button>
          )}

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? l('Exit Fullscreen', 'Keluar Fullscreen') : l('Fullscreen Mode', 'Mode Layar Penuh')}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5 text-blue-400" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TIER 3: OHLCV INSPECTOR HUD & LIVE TRADES STRIP          */}
      {/* ======================================================== */}
      <div className="px-5 py-2 bg-slate-950/70 border-b border-slate-800/40 flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 text-xs font-mono text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{l('Time', 'Waktu')}: {hoveredOHLC ? hoveredOHLC.time : 'LIVE'}</span>
          </div>
          <div>
            O: <strong className="text-slate-100 font-mono">{formatCurrency(hoveredOHLC ? hoveredOHLC.open : liveMetrics.latestPrice)}</strong>
          </div>
          <div>
            H: <strong className="text-emerald-400 font-mono">{formatCurrency(hoveredOHLC ? hoveredOHLC.high : liveMetrics.high24h)}</strong>
          </div>
          <div>
            L: <strong className="text-rose-400 font-mono">{formatCurrency(hoveredOHLC ? hoveredOHLC.low : liveMetrics.low24h)}</strong>
          </div>
          <div>
            C:{' '}
            <strong className={`font-mono ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
              Rp {(hoveredOHLC ? hoveredOHLC.close : liveMetrics.latestPrice).toLocaleString('id-ID')}
            </strong>
          </div>
          <div>
            {l('Change', 'Perubahan')}:{' '}
            <strong className={isUp ? 'text-emerald-400' : 'text-rose-400'}>
              {isUp ? '+' : ''}
              {(hoveredOHLC ? hoveredOHLC.change : percentChange).toFixed(2)}%
            </strong>
          </div>
        </div>

        {recentTrades.length > 0 && (
          <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono">
            <span className="text-slate-500 uppercase flex items-center gap-1">
              <Zap className="h-3 w-3 text-amber-400" /> {l('Indodax Trades:', 'Transaksi Indodax:')}
            </span>
            {recentTrades.map((t, idx) => (
              <span
                key={idx}
                className={`px-1.5 py-0.5 rounded border text-[10px] ${
                  t.type === 'buy'
                    ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-950/40 text-rose-300'
                }`}
              >
                {t.type.toUpperCase()} {formatCurrency(t.price)} ({t.time})
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* TIER 4: TRADINGVIEW LIGHTWEIGHT CHARTS CANVAS            */}
      {/* ======================================================== */}
      <div className="relative w-full overflow-hidden bg-[#070b14]">
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070b14]/80 backdrop-blur-sm">
            <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-2" />
            <span className="text-xs font-mono text-slate-300">{l(`Loading Official ${activePair} Candlestick...`, `Memuat Candlestick Resmi ${activePair}...`)}</span>
          </div>
        )}

        <div
          ref={chartContainerRef}
          className="w-full"
          style={{
            height: isFullscreen
              ? 'calc(100vh - 140px)'
              : typeof window !== 'undefined' && window.innerWidth < 640
              ? chartHeightPreset === 'tall' ? '420px' : '340px'
              : chartHeightPreset === 'tall' ? '620px' : '490px',
          }}
        />
      </div>
    </div>
  );
};
