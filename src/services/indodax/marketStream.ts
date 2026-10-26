import WebSocket from 'ws';
import { saveCandles } from '../candles/store.js';

export interface RealCandle {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // Volume in IDR
  rawVolume?: number; // Volume in traded coin
}

export interface IndodaxTrade {
  date: string; // timestamp in seconds
  price: string;
  amount: string;
  tid: string;
  type: 'buy' | 'sell';
}

export class IndodaxMarketStream {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private subscribedPairs: Set<string> = new Set(['btcidr', 'ethidr', 'solidr', 'pepeidr', 'dogeidr', 'xrpidr']);
  private staticToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE5NDY2MTg0MTV9.UR1lBM6Eqh0yWz-PVirw1uPCxe60FdchR8eNVdsskeo';
  private pingInterval: NodeJS.Timeout | null = null;
  private highFreqPollInterval: NodeJS.Timeout | null = null;
  private lastTradeTidMap: Map<string, string> = new Map();
  private lastPriceMap: Map<string, number> = new Map();
  private onTickCallback?: (tick: { pair: string; price: number; volume: number; timestamp: number; high24h?: number; low24h?: number; side?: 'buy' | 'sell' }) => void;

  public setTickCallback(cb: (tick: { pair: string; price: number; volume: number; timestamp: number; high24h?: number; low24h?: number; side?: 'buy' | 'sell' }) => void) {
    this.onTickCallback = cb;
  }

  /**
   * Mengambil Data Candlestick Resmi dari Indodax TradingView UDF Engine (history_v2)
   * DAN menggabungkan candle berjalan (forming candle) secara real-time dengan transaksi terbaru!
   */
  public async getRealCandles(pairId: string, timeframe: '15m' | '1h' | '4h' | '1d' = '1h'): Promise<RealCandle[]> {
    const cleanPair = pairId.toLowerCase().replace('/', '').replace('_', '');
    const cleanSymbol = cleanPair.toUpperCase();
    const to = Math.floor(Date.now() / 1000);

    let tfParam = '60';
    let rangeSec = 86400 * 7; // default 1h: 7 hari = ~168 candle

    if (timeframe === '15m') {
      tfParam = '15';
      rangeSec = 86400 * 2; // 2 hari = ~192 candle
    } else if (timeframe === '1h') {
      tfParam = '60';
      rangeSec = 86400 * 7;
    } else if (timeframe === '4h') {
      tfParam = '240';
      rangeSec = 86400 * 25; // 25 hari = ~150 candle
    } else if (timeframe === '1d') {
      tfParam = '1D';
      rangeSec = 86400 * 90; // 90 hari = ~90 candle
    }

    const from = to - rangeSec;
    const historyUrl = `https://indodax.com/tradingview/history_v2?from=${from}&to=${to}&tf=${tfParam}&symbol=${cleanSymbol}`;

    let candles: RealCandle[] = [];

    // 1. Ambil data historis dari history_v2
    try {
      const res = await fetch(historyUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Trading/1.0',
        },
      });

      if (res.ok) {
        const rawBars = await res.json();
        if (Array.isArray(rawBars) && rawBars.length > 0) {
          candles = rawBars.map((b: any) => {
            const timeSec = typeof b.Time === 'number' ? b.Time : parseInt(b.Time, 10);
            const open = typeof b.Open === 'number' ? b.Open : parseFloat(b.Open);
            const high = typeof b.High === 'number' ? b.High : parseFloat(b.High);
            const low = typeof b.Low === 'number' ? b.Low : parseFloat(b.Low);
            const close = typeof b.Close === 'number' ? b.Close : parseFloat(b.Close);
            const rawVol = typeof b.Volume === 'number' ? b.Volume : parseFloat(b.Volume || '0');
            const volIdr = rawVol * close;

            return {
              time: timeframe === '1d'
                ? new Date(timeSec * 1000).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })
                : new Date(timeSec * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              timestamp: timeSec * 1000,
              open,
              high,
              low,
              close,
              volume: Math.round(volIdr),
              rawVolume: rawVol,
            };
          });

          this.persistCandlesThrottled(cleanPair, timeframe, rawBars);
        }
      }
    } catch (err: any) {
      console.warn(`[IndodaxMarketStream] history_v2 gagal untuk ${cleanSymbol}:`, err.message);
    }

    // Jika history_v2 kosong, ambil fallback dari trades
    if (candles.length === 0) {
      candles = await this.getCandlesFromTradesFallback(cleanPair, timeframe);
    }

    // 2. INTEGRASI FORMING CANDLE REAL-TIME:
    // history_v2 memiliki cache CDN ~60 detik. Kita gabungkan transaksi & ticker terkini
    // agar candle terakhir SELALU BERDETAK dan bila waktu berganti, membentuk candle baru seketika!
    try {
      const bucketSec =
        timeframe === '15m' ? 15 * 60 : timeframe === '1h' ? 60 * 60 : timeframe === '4h' ? 4 * 3600 : 86400;
      const currentBucketSec = Math.floor(to / bucketSec) * bucketSec;
      const currentBucketMs = currentBucketSec * 1000;

      const [tickerRes, tradesRes] = await Promise.all([
        fetch(`https://indodax.com/api/ticker/${cleanPair}`),
        fetch(`https://indodax.com/api/trades/${cleanPair}`),
      ]);

      const tickerData: any = tickerRes.ok ? await tickerRes.json() : null;
      const tradesData: any = tradesRes.ok ? await tradesRes.json() : [];

      const liveLastPrice = parseFloat(tickerData?.ticker?.last || '0');

      if (liveLastPrice > 0 && candles.length > 0) {
        const lastCandle = candles[candles.length - 1];

        // Kumpulkan semua transaksi yang terjadi di dalam bucket interval saat ini
        const bucketTrades = Array.isArray(tradesData)
          ? tradesData.filter((t: any) => parseInt(t.date, 10) >= currentBucketSec)
          : [];

        let bucketVolIdr = 0;
        let bucketHigh = liveLastPrice;
        let bucketLow = liveLastPrice;

        for (const t of bucketTrades) {
          const p = parseFloat(t.price);
          const a = parseFloat(t.amount);
          bucketVolIdr += p * a;
          bucketHigh = Math.max(bucketHigh, p);
          bucketLow = Math.min(bucketLow, p);
        }

        if (lastCandle.timestamp === currentBucketMs) {
          // Update candle aktif saat ini dengan harga dan transaksi detik ini
          lastCandle.close = liveLastPrice;
          lastCandle.high = Math.max(lastCandle.high, bucketHigh);
          lastCandle.low = Math.min(lastCandle.low, bucketLow);
          if (bucketVolIdr > 0) lastCandle.volume = Math.max(lastCandle.volume, Math.round(bucketVolIdr));
        } else if (lastCandle.timestamp < currentBucketMs) {
          // WAKTU TELAH BERGANTI KE INTERVAL BARU! BUAT CANDLE BARU OTOMATIS!
          const newTimeStr = timeframe === '1d'
            ? new Date(currentBucketMs).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })
            : new Date(currentBucketMs).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

          candles.push({
            time: newTimeStr,
            timestamp: currentBucketMs,
            open: lastCandle.close,
            high: Math.max(lastCandle.close, bucketHigh),
            low: Math.min(lastCandle.close, bucketLow),
            close: liveLastPrice,
            volume: Math.round(bucketVolIdr),
          });
        }
      }
    } catch {}

    return candles;
  }

  // Fallback agregasi dari /api/trades/:pair
  private async getCandlesFromTradesFallback(cleanPair: string, timeframe: string): Promise<RealCandle[]> {
    try {
      const res = await fetch(`https://indodax.com/api/trades/${cleanPair}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const trades = (await res.json()) as IndodaxTrade[];

      const tickerRes = await fetch(`https://indodax.com/api/ticker/${cleanPair}`);
      const tickerData: any = tickerRes.ok ? await tickerRes.json() : null;
      const lastTickerPrice = parseFloat(tickerData?.ticker?.last || '0');

      if (!Array.isArray(trades) || trades.length === 0) {
        return this.generateFallbackFromTicker(lastTickerPrice, timeframe);
      }

      trades.sort((a, b) => parseInt(a.date, 10) - parseInt(b.date, 10));

      const bucketSeconds =
        timeframe === '15m'
          ? 15 * 60
          : timeframe === '1h'
          ? 60 * 60
          : timeframe === '4h'
          ? 4 * 60 * 60
          : 24 * 60 * 60;

      const candleMap = new Map<number, RealCandle>();

      for (const t of trades) {
        const timeSec = parseInt(t.date, 10);
        const bucketTime = Math.floor(timeSec / bucketSeconds) * bucketSeconds;
        const price = parseFloat(t.price);
        const amount = parseFloat(t.amount);
        const volIdr = price * amount;

        if (!candleMap.has(bucketTime)) {
          candleMap.set(bucketTime, {
            time: new Date(bucketTime * 1000).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            timestamp: bucketTime * 1000,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: volIdr,
          });
        } else {
          const c = candleMap.get(bucketTime)!;
          c.high = Math.max(c.high, price);
          c.low = Math.min(c.low, price);
          c.close = price;
          c.volume += volIdr;
        }
      }

      const candles = Array.from(candleMap.values());
      return candles.length > 0 ? candles : this.generateFallbackFromTicker(lastTickerPrice, timeframe);
    } catch {
      return [];
    }
  }

  /**
   * Subscribe pasangan koin baru secara dinamis ke WebSocket dan Poller
   */
  public subscribePair(pairId: string) {
    const cleanPair = pairId.toLowerCase().replace('/', '').replace('_', '');
    if (this.subscribedPairs.has(cleanPair)) return;

    this.subscribedPairs.add(cleanPair);

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 1,
        params: { channel: `chart:tick-${cleanPair}` },
        id: Math.floor(Math.random() * 10000),
      }));
      this.ws.send(JSON.stringify({
        method: 1,
        params: { channel: `market:trade-activity-${cleanPair}` },
        id: Math.floor(Math.random() * 10000),
      }));
    }
  }

  private isPolling = false;
  private lastWsMessageTime = 0;

  /**
   * Gentle Rate-Limit-Safe Poller (setiap 5 detik):
   * Menggunakan 1 panggilan tunggal ke /api/summaries untuk memantau SEMUA pasangan koin sekaligus,
   * sehingga konsumsi request hanya ~12-15 req/menit (jauh di bawah batas 180 req/menit Indodax).
   */
  private startGentlePoller() {
    if (this.highFreqPollInterval) clearInterval(this.highFreqPollInterval);

    this.highFreqPollInterval = setInterval(async () => {
      if (this.isPolling) return; // In-flight guard: cegah request tumpang tindih
      this.isPolling = true;

      try {
        const res = await fetch('https://indodax.com/api/summaries', {
          headers: { 'Accept': 'application/json' },
        });

        if (res.ok) {
          const data: any = await res.json();
          const tickers = data?.tickers || {};

          for (const pair of this.subscribedPairs) {
            const tickerKey = `${pair.toLowerCase().replace('idr', '')}_idr`;
            const tData = tickers[tickerKey] || tickers[pair.toLowerCase()];
            if (!tData) continue;

            const currentPrice = parseFloat(tData.last || '0');
            const high24h = parseFloat(tData.high || '0');
            const low24h = parseFloat(tData.low || '0');
            const volIdr = parseFloat(tData.vol_idr || '0');

            const lastPrice = this.lastPriceMap.get(pair);
            const hasPriceMoved = currentPrice > 0 && currentPrice !== lastPrice;

            if (hasPriceMoved) {
              this.lastPriceMap.set(pair, currentPrice);

              if (this.onTickCallback && currentPrice > 0) {
                this.onTickCallback({
                  pair,
                  price: currentPrice,
                  volume: volIdr,
                  high24h,
                  low24h,
                  side: 'buy',
                  timestamp: Date.now(),
                });
              }
            }
          }
        }
      } catch (err: any) {
        // Silently catch network blip
      } finally {
        this.isPolling = false;
      }
    }, 5000);
  }

  /**
   * Connect ke Official Indodax Market Data WebSocket (Marketdata-websocket.md)
   * Base URL: wss://ws3.indodax.com/ws/
   */
  public startLiveSocket() {
    // Jalankan Gentle Poller sebagai pendamping aman rate limit
    this.startGentlePoller();

    if (this.isConnected || this.ws) return;

    try {
      this.ws = new WebSocket('wss://ws3.indodax.com/ws/');

      this.ws.on('open', () => {
        this.isConnected = true;
        console.log('[IndodaxMarketStream] Terhubung ke Official Market Data WebSocket (wss://ws3.indodax.com/ws/)');

        // 1. Authenticate dengan static token resmi Indodax
        this.ws?.send(
          JSON.stringify({
            params: { token: this.staticToken },
            id: 1,
          })
        );

        // 2. Setup Ping/Pong keep-alive setiap 20 detik (Marketdata-websocket.md - Ping/Pong method 7)
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ method: 7, id: 999 }));
          }
        }, 20000);
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          // A. Respon autentikasi berhasil -> Subscribe channel utama
          if (msg.id === 1 && msg.result?.client) {
            console.log(`[IndodaxMarketStream] Autentikasi WebSocket berhasil. Client ID: ${msg.result.client}`);

            // Subscribe ke market summary 24 jam (semua koin sekaligus secara real-time)
            this.ws?.send(
              JSON.stringify({
                method: 1,
                params: { channel: 'market:summary-24h' },
                id: 10,
              })
            );

            // Subscribe ke chart tick & trade activity untuk setiap pair terpilih
            let reqId = 20;
            for (const pair of this.subscribedPairs) {
              this.ws?.send(
                JSON.stringify({
                  method: 1,
                  params: { channel: `chart:tick-${pair}` },
                  id: reqId++,
                })
              );
              this.ws?.send(
                JSON.stringify({
                  method: 1,
                  params: { channel: `market:trade-activity-${pair}` },
                  id: reqId++,
                })
              );
            }
          }

          // B. Event Streaming: Market Summary 24 Jam (Real-time updates untuk seluruh koin)
          else if (msg.result?.channel === 'market:summary-24h') {
            const summaryData = msg.result.data?.data;
            if (Array.isArray(summaryData)) {
              for (const item of summaryData) {
                // Format: [pair, timestamp, last, low, high, price24hAgo, idrVol, coinVol]
                if (Array.isArray(item) && item.length >= 7) {
                  const [pair, epoch, last, low, high, , idrVol] = item;
                  if (this.onTickCallback && typeof last === 'number') {
                    this.onTickCallback({
                      pair: String(pair).toLowerCase(),
                      price: last,
                      volume: parseFloat(idrVol || '0'),
                      high24h: typeof high === 'number' ? high : parseFloat(high),
                      low24h: typeof low === 'number' ? low : parseFloat(low),
                      timestamp: (typeof epoch === 'number' ? epoch : parseInt(epoch, 10)) * 1000,
                    });
                  }
                }
              }
            }
          }

          // C. Event Streaming: Chart Tick Spesifik (chart:tick-<pair>)
          else if (msg.result?.channel?.startsWith('chart:tick-')) {
            const pair = msg.result.channel.replace('chart:tick-', '');
            const tickArray = msg.result.data?.data?.[0];
            if (Array.isArray(tickArray)) {
              const [epoch, , price, volStr] = tickArray;
              if (this.onTickCallback) {
                this.onTickCallback({
                  pair: pair.toLowerCase(),
                  price: parseFloat(price),
                  volume: parseFloat(volStr || '0'),
                  timestamp: (typeof epoch === 'number' ? epoch : parseInt(epoch, 10)) * 1000,
                });
              }
            }
          }

          // D. Event Streaming: Trade Activity (market:trade-activity-<pair>)
          else if (msg.result?.channel?.startsWith('market:trade-activity-')) {
            const tradeArray = msg.result.data?.data?.[0];
            if (Array.isArray(tradeArray)) {
              const [pair, epoch, , side, filledPrice, idrVol] = tradeArray;
              if (this.onTickCallback) {
                this.onTickCallback({
                  pair: String(pair).toLowerCase(),
                  price: parseFloat(filledPrice),
                  volume: parseFloat(idrVol || '0'),
                  side: side === 'sell' ? 'sell' : 'buy',
                  timestamp: (typeof epoch === 'number' ? epoch : parseInt(epoch, 10)) * 1000,
                });
              }
            }
          }
        } catch {}
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        this.ws = null;
        if (this.pingInterval) clearInterval(this.pingInterval);
        setTimeout(() => this.startLiveSocket(), 5000);
      });

      this.ws.on('error', (err) => {
        this.isConnected = false;
        this.ws?.close();
      });
    } catch (err) {
      console.warn('[IndodaxMarketStream] Gagal inisialisasi:', err);
    }
  }

  /**
   * Fail-Closed Guard: Jika candlestick resmi dan riwayat trades bursa tidak tersedia,
   * kembalikan data flat harga aktual saat ini tanpa kurva sinus sintetis (Math.sin).
   * Mencegah kalkulasi indikator teknikal (RSI, EMA, ATR) dari data halusinasi.
   */
  private generateFallbackFromTicker(basePrice: number, _timeframe: string): RealCandle[] {
    if (!basePrice || basePrice <= 0) return [];

    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return [
      {
        time: timeStr,
        timestamp: now,
        open: basePrice,
        high: basePrice,
        low: basePrice,
        close: basePrice,
        volume: 0,
      },
    ];
  }

  public stop() {
    if (this.highFreqPollInterval) {
      clearInterval(this.highFreqPollInterval);
      this.highFreqPollInterval = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /** Observability: live feed connection state for /api/metrics. */
  public getLiveStatus(): { connected: boolean } {
    return { connected: this.isConnected && this.ws?.readyState === WebSocket.OPEN };
  }

  private lastPersistAt = new Map<string, number>();

  /**
   * Write-through research cache: closed candles land in SQLite so backtests
   * and walk-forward runs stop depending on the undocumented history_v2
   * endpoint. Throttled to one write per pair/timeframe per 5 minutes.
   */
  private persistCandlesThrottled(pair: string, timeframe: string, rawBars: any[]) {
    const key = `${pair}:${timeframe}`;
    const now = Date.now();
    if (now - (this.lastPersistAt.get(key) || 0) < 5 * 60 * 1000) return;
    this.lastPersistAt.set(key, now);

    try {
      saveCandles(
        pair,
        timeframe,
        rawBars.map((b: any) => ({
          timestamp: (typeof b.Time === 'number' ? b.Time : parseInt(b.Time, 10)) * 1000,
          open: typeof b.Open === 'number' ? b.Open : parseFloat(b.Open),
          high: typeof b.High === 'number' ? b.High : parseFloat(b.High),
          low: typeof b.Low === 'number' ? b.Low : parseFloat(b.Low),
          close: typeof b.Close === 'number' ? b.Close : parseFloat(b.Close),
          volume: typeof b.Volume === 'number' ? b.Volume : parseFloat(b.Volume || '0'),
        }))
      );
    } catch {
      // Best-effort; saveCandles already logs and swallows.
    }
  }
}

export const indodaxMarketStream = new IndodaxMarketStream();
