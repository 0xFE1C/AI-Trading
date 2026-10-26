import crypto from 'crypto';
import { db, getSetting, setSetting } from '../../db/index.js';

export interface IndodaxPair {
  id: string; // e.g. 'btcidr'
  symbol: string; // e.g. 'BTCIDR'
  base_currency: string; // e.g. 'idr'
  traded_currency: string; // e.g. 'btc'
  traded_currency_unit: string; // e.g. 'BTC'
  description: string;
  ticker_id: string;
  price_precision: number;
  trade_min_base_currency: number;
  trade_min_traded_currency: number;
  quantity_increment?: string | number;
  trade_fee_percent?: number;
  url_logo?: string;
  url_logo_png?: string;
}

export interface IndodaxSummaryTicker {
  name: string;
  last: string;
  high: string;
  low: string;
  vol_idr: string;
  vol_traded?: string;
  buy: string;
  sell: string;
  server_time: number;
}

export interface IndodaxDepth {
  buy: Array<[string, string]>; // [price, volume]
  sell: Array<[string, string]>;
}

export interface IndodaxOrderResponse {
  symbol: string;
  orderId: number | string;
  clientOrderId?: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  price?: string;
  origQty?: string;
  executedQty?: string;
  fullOrderId?: string;
}

export interface IndodaxFillInfo {
  orderId: string;
  status: string;
  executedQty: number;
  quoteQty: number;
  averagePrice: number;
  verified: boolean;
  isFinal: boolean;
}

const FINAL_ORDER_STATUSES = new Set(['FILLED', 'CANCELED', 'CANCELLED', 'REJECTED', 'EXPIRED']);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class IndodaxClient {
  private publicBaseUrl = 'https://indodax.com';
  private tradeBaseUrl = 'https://api.indodax.com';
  private tapiBaseUrl = 'https://indodax.com/tapi';
  private knownPairIds: Set<string> = new Set();
  private pairsCache: Map<string, IndodaxPair> = new Map();
  private pairsCacheTime = 0;
  private pairsInFlight: Promise<IndodaxPair[]> | null = null;
  private summariesCache: { tickers: Record<string, IndodaxSummaryTicker>; prices_24h: Record<string, string> } | null = null;
  private summariesCacheTime = 0;
  private summariesInFlight: Promise<{ tickers: Record<string, IndodaxSummaryTicker>; prices_24h: Record<string, string> }> | null = null;
  private summariesTtlMs = 6000; // 6s TTL cache to avoid ~6,000 redundant requests/day

  private depthCache: Map<string, { data: IndodaxDepth; time: number }> = new Map();
  private depthTtlMs = 4000; // 4s TTL cache for orderbook depth

  private onNewCoinCallback?: (coin: { symbol: string; name: string; price: number; volume: number }) => void;

  constructor() {
    this.loadKnownPairs();
  }

  public setNewCoinCallback(cb: (coin: { symbol: string; name: string; price: number; volume: number }) => void) {
    this.onNewCoinCallback = cb;
  }

  private loadKnownPairs() {
    try {
      // Migrate legacy alert rows so an upgrade never re-announces old listings
      db.prepare(
        'INSERT OR IGNORE INTO known_pairs (pair_id, first_seen_at) SELECT LOWER(symbol), detected_at FROM new_coin_alerts'
      ).run();

      const rows = db.prepare('SELECT pair_id FROM known_pairs').all() as Array<{ pair_id: string }>;
      for (const row of rows) {
        this.knownPairIds.add(row.pair_id.toLowerCase());
      }
    } catch (err) {
      console.warn('[Indodax] Gagal memuat known pairs registry:', err instanceof Error ? err.message : err);
    }
  }

  // --- Public REST API Methods ---

  /**
   * Parse respon JSON secara aman dengan perlindungan terhadap halaman error HTML 502/504 Cloudflare
   */
  private async safeParseResponse<T = any>(res: Response, endpointName: string): Promise<T> {
    const rawText = await res.text();
    if (!res.ok) {
      const cleanSnippet = rawText.slice(0, 150).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      throw new Error(`Indodax ${endpointName} gagal (${res.status} ${res.statusText}): ${cleanSnippet || 'Gateway/Cloudflare error'}`);
    }
    try {
      return JSON.parse(rawText) as T;
    } catch {
      const cleanSnippet = rawText.slice(0, 150).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      throw new Error(`Indodax ${endpointName} mengembalikan non-JSON response (${res.status}): ${cleanSnippet || 'Invalid JSON format'}`);
    }
  }

  public async getPairs(forceRefresh = false): Promise<IndodaxPair[]> {
    const now = Date.now();
    if (!forceRefresh && this.pairsCache.size > 0 && now - this.pairsCacheTime < 10 * 60 * 1000) {
      return Array.from(this.pairsCache.values());
    }
    if (this.pairsInFlight) {
      return this.pairsInFlight;
    }

    this.pairsInFlight = this.fetchAndTrackPairs();
    try {
      return await this.pairsInFlight;
    } finally {
      this.pairsInFlight = null;
    }
  }

  private async fetchAndTrackPairs(): Promise<IndodaxPair[]> {
    const res = await fetch(`${this.publicBaseUrl}/api/pairs`);
    const pairs = await this.safeParseResponse<IndodaxPair[]>(res, 'getPairs');

    // Filter only IDR base currency pairs
    const idrPairs = pairs.filter(p => p.base_currency.toLowerCase() === 'idr');

    this.pairsCache.clear();
    for (const p of idrPairs) {
      this.pairsCache.set(p.id.toLowerCase(), p);
      this.pairsCache.set(p.symbol.toUpperCase(), p);
    }
    this.pairsCacheTime = Date.now();

    await this.trackPairUniverse(idrPairs);
    return idrPairs;
  }

  /**
   * Persists the full pair universe. The first run after install/upgrade seeds the
   * registry silently; later runs only raise alerts for pairs never seen before.
   */
  private async trackPairUniverse(idrPairs: IndodaxPair[]) {
    try {
      const seeded = getSetting('known_pairs_seeded', '0') === '1';
      const insertKnown = db.prepare(
        'INSERT OR IGNORE INTO known_pairs (pair_id, first_seen_at) VALUES (?, ?)'
      );
      const newPairs: IndodaxPair[] = [];
      const now = Date.now();

      for (const pair of idrPairs) {
        const id = pair.id.toLowerCase();
        insertKnown.run(id, now);
        if (seeded && !this.knownPairIds.has(id)) {
          newPairs.push(pair);
        }
        this.knownPairIds.add(id);
      }

      if (!seeded) {
        setSetting('known_pairs_seeded', '1');
        console.log(`[Indodax] Registry pair awal disimpan (${idrPairs.length} pair), tanpa alert massal.`);
        return;
      }

      for (const pair of newPairs) {
        let lastPrice = 0;
        let volume24h = 0;
        try {
          const { ticker } = await this.getTicker(pair.id);
          lastPrice = parseFloat(ticker?.last || '0') || 0;
          volume24h = parseFloat(ticker?.vol_idr || '0') || 0;
        } catch {
          // Alert still matters; price will be shown as unavailable
        }
        this.recordNewCoinListing(pair, lastPrice, volume24h);
      }
    } catch (err) {
      console.warn('[Indodax] Gagal memperbarui registry pair:', err instanceof Error ? err.message : err);
    }
  }

  public getPairRules(symbol: string): IndodaxPair | undefined {
    const clean = symbol.toLowerCase().replace('/', '').replace('_', '');
    return this.pairsCache.get(clean) || this.pairsCache.get(clean.toUpperCase());
  }

  public formatQuantity(symbol: string, rawQuantity: number): string {
    const pair = this.getPairRules(symbol);
    const increment = pair?.quantity_increment ? String(pair.quantity_increment) : '0.00000001';
    const decimals = increment.includes('.') ? increment.split('.')[1].length : 0;
    const factor = Math.pow(10, decimals);
    // Always floor to avoid exceeding available balance
    const floored = Math.floor(rawQuantity * factor) / factor;
    return floored.toFixed(decimals);
  }

  public getMinTradeIdr(symbol: string): number {
    const pair = this.getPairRules(symbol);
    return pair?.trade_min_base_currency || 10000;
  }

  public async getSummaries(force = false): Promise<{ tickers: Record<string, IndodaxSummaryTicker>; prices_24h: Record<string, string> }> {
    const now = Date.now();
    if (!force && this.summariesCache && now - this.summariesCacheTime < this.summariesTtlMs) {
      return this.summariesCache;
    }
    if (this.summariesInFlight) {
      return this.summariesInFlight;
    }

    this.summariesInFlight = (async () => {
      try {
        const res = await fetch(`${this.publicBaseUrl}/api/summaries`);
        const data = await this.safeParseResponse<{ tickers: Record<string, IndodaxSummaryTicker>; prices_24h: Record<string, string> }>(res, 'getSummaries');
        this.summariesCache = data;
        this.summariesCacheTime = Date.now();
        return data;
      } finally {
        this.summariesInFlight = null;
      }
    })();

    return this.summariesInFlight;
  }

  public async getDepth(pairId: string, force = false): Promise<IndodaxDepth> {
    let clean = pairId.toLowerCase().replace('/', '').replace('_', '');
    if (!clean.endsWith('idr') && !clean.endsWith('usdt')) {
      clean = `${clean}idr`;
    }
    const now = Date.now();
    const cached = this.depthCache.get(clean);
    if (!force && cached && now - cached.time < this.depthTtlMs) {
      return cached.data;
    }

    const res = await fetch(`${this.publicBaseUrl}/api/depth/${clean}`);
    const data = await this.safeParseResponse<IndodaxDepth>(res, `getDepth(${clean})`);
    this.depthCache.set(clean, { data, time: Date.now() });
    return data;
  }

  public async getTicker(pairId: string): Promise<{ ticker: IndodaxSummaryTicker }> {
    let clean = pairId.toLowerCase().replace('/', '').replace('_', '');
    if (!clean.endsWith('idr') && !clean.endsWith('usdt')) {
      clean = `${clean}idr`;
    }
    const res = await fetch(`${this.publicBaseUrl}/api/ticker/${clean}`);
    return await this.safeParseResponse<{ ticker: IndodaxSummaryTicker }>(res, `getTicker(${clean})`);
  }

  // --- Slippage & Liquidity Protection ---

  public calculateSlippage(
    depth: IndodaxDepth,
    side: 'buy' | 'sell',
    totalIdr: number
  ): { averageFillPrice: number; bestPrice: number; slippagePercent: number; isSufficientLiquidity: boolean } {
    const book = side === 'buy' ? depth.sell : depth.buy;
    if (!book || book.length === 0) {
      return { averageFillPrice: 0, bestPrice: 0, slippagePercent: 100, isSufficientLiquidity: false };
    }

    const bestPrice = parseFloat(book[0][0]);
    let remainingIdr = totalIdr;
    let totalSpentIdr = 0;
    let totalTradedCurrency = 0;

    for (const [priceStr, volStr] of book) {
      const price = parseFloat(priceStr);
      const volumeTraded = parseFloat(volStr);
      const orderVolumeIdr = price * volumeTraded;

      if (remainingIdr <= orderVolumeIdr) {
        const tradedAmount = remainingIdr / price;
        totalTradedCurrency += tradedAmount;
        totalSpentIdr += remainingIdr;
        remainingIdr = 0;
        break;
      } else {
        totalTradedCurrency += volumeTraded;
        totalSpentIdr += orderVolumeIdr;
        remainingIdr -= orderVolumeIdr;
      }
    }

    if (remainingIdr > 0) {
      return {
        averageFillPrice: totalSpentIdr / (totalTradedCurrency || 1),
        bestPrice,
        slippagePercent: 999,
        isSufficientLiquidity: false,
      };
    }

    const averageFillPrice = totalSpentIdr / totalTradedCurrency;
    const slippagePercent = Math.abs((averageFillPrice - bestPrice) / bestPrice) * 100;

    return {
      averageFillPrice,
      bestPrice,
      slippagePercent,
      isSufficientLiquidity: true,
    };
  }

  /**
   * Menghitung Bid-Ask Spread (%) untuk menghindari jebakan likuiditas tipis (spread trap).
   */
  public calculateSpread(depth: IndodaxDepth): { bestBid: number; bestAsk: number; spreadPercent: number } {
    const bestBid = depth.buy && depth.buy[0] ? parseFloat(depth.buy[0][0]) : 0;
    const bestAsk = depth.sell && depth.sell[0] ? parseFloat(depth.sell[0][0]) : 0;
    if (bestBid <= 0 || bestAsk <= 0) {
      return { bestBid, bestAsk, spreadPercent: 100 };
    }
    const spreadPercent = Math.abs((bestAsk - bestBid) / bestAsk) * 100;
    return { bestBid, bestAsk, spreadPercent: Number(spreadPercent.toFixed(2)) };
  }

  /**
   * Menghitung rasio dominasi volume Bid vs Ask (Depth Imbalance Ratio) pada 10 layer teratas.
   * Rasio > 1.0 menandakan dinding beli (buying wall) lebih tebal dari dinding jual.
   */
  public calculateDepthImbalance(depth: IndodaxDepth, layers: number = 10): number {
    const bids = (depth.buy || []).slice(0, layers);
    const asks = (depth.sell || []).slice(0, layers);
    const bidVolIdr = bids.reduce((acc, [p, v]) => acc + parseFloat(p) * parseFloat(v), 0);
    const askVolIdr = asks.reduce((acc, [p, v]) => acc + parseFloat(p) * parseFloat(v), 0);
    if (askVolIdr <= 0) return bidVolIdr > 0 ? 2.0 : 1.0;
    return Number((bidVolIdr / askVolIdr).toFixed(2));
  }

  // --- Official Private Trade API 2.0 (HMAC-SHA256) ---

  private getAuthCredentials(): { apiKey: string; secretKey: string } {
    const apiKey = getSetting('indodax_api_key', '');
    const secretKey = getSetting('indodax_secret_key', '');
    return { apiKey, secretKey };
  }

  private generateHmacSha256(data: string, secretKey: string): string {
    return crypto.createHmac('sha256', secretKey).update(data).digest('hex');
  }

  private async callPrivateApi<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE',
    params: Record<string, string | number> = {}
  ): Promise<T> {
    const { apiKey, secretKey } = this.getAuthCredentials();
    if (!apiKey || !secretKey) {
      throw new Error('Indodax API Key / Secret Key belum dikonfigurasi di menu Settings.');
    }

    const timestamp = Date.now();
    const payload: Record<string, string | number> = {
      ...params,
      timestamp,
      recvWindow: 5000,
    };

    // Sort parameters alphabetically per TAPI v2 specification
    const sortedKeys = Object.keys(payload).sort();
    const queryString = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(payload[k])}`).join('&');
    const signature = this.generateHmacSha256(queryString, secretKey);

    const isGetOrDelete = method === 'GET' || method === 'DELETE';
    const url = `${this.tradeBaseUrl}${endpoint}${isGetOrDelete ? `?${queryString}&signature=${signature}` : ''}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-APIKEY': apiKey,
      Sign: signature,
    };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (method === 'POST') {
      options.body = queryString;
    }

    const res = await fetch(url, options);
    const data = await this.safeParseResponse<any>(res, `PrivateApi(${endpoint})`);

    if (data && typeof data.code === 'number' && data.code < 0) {
      throw new Error(`Indodax Trade API error: ${data.msg || res.statusText} (code: ${data.code})`);
    }

    return data as T;
  }

  // --- Official Endpoints per INDODAX-TradeAPI-2.md ---

  /**
   * GET /api/v2/account
   * Mengambil saldo akun (balances: [{ asset: 'IDR', free: '...', locked: '...' }])
   */
  public async getAccountInfo(): Promise<{
    canTrade: boolean;
    canWithdraw: boolean;
    accountType: string;
    balances: Array<{ asset: string; free: string; locked: string }>;
    data?: { balance: { idr: number } }; // backward compatibility
  }> {
    const result = await this.callPrivateApi<any>('/api/v2/account', 'GET', {});

    // Compute IDR free balance for convenience
    let idrFree = 0;
    if (Array.isArray(result?.balances)) {
      const idrEntry = result.balances.find((b: any) => String(b.asset).toUpperCase() === 'IDR');
      if (idrEntry) idrFree = parseFloat(idrEntry.free) || 0;
    }

    // Attach backward-compatible helper field
    result.data = { balance: { idr: idrFree } };
    return result;
  }

  public async getIdrBalance(): Promise<{ free: number; locked: number; total: number }> {
    try {
      const acc = await this.getAccountInfo();
      if (Array.isArray(acc?.balances)) {
        const idrEntry = acc.balances.find((b: any) => String(b.asset).toUpperCase() === 'IDR');
        if (idrEntry) {
          const free = parseFloat(idrEntry.free) || 0;
          const locked = parseFloat(idrEntry.locked) || 0;
          return { free, locked, total: free + locked };
        }
      }
      return { free: 0, locked: 0, total: 0 };
    } catch {
      return { free: 0, locked: 0, total: 0 };
    }
  }

  /**
   * POST /api/v2/order
   * Membuat order baru spot trading sesuai spesifikasi resmi INDODAX Trade API v2.0
   * 
   * Rules:
   * - MARKET BUY: Wajib menggunakan `quoteOrderQty` (IDR), tanpa `price` dan tanpa `quantity`.
   * - MARKET SELL: Menggunakan `quantity` (koin), tanpa `price` dan tanpa `quoteOrderQty`.
   * - LIMIT: Menggunakan `price`, `quantity`, dan `timeInForce: 'GTC'`.
   */
  public async createOrder(options: {
    symbol: string;
    side: 'BUY' | 'SELL' | 'buy' | 'sell';
    type: 'MARKET' | 'LIMIT' | 'market' | 'limit';
    quoteOrderQty?: number; // Nominal IDR untuk MARKET BUY
    quantity?: number; // Jumlah koin untuk MARKET SELL atau LIMIT
    price?: number; // Harga satuan koin untuk LIMIT
  }): Promise<IndodaxOrderResponse & { order_id?: string }> {
    const upperSymbol = options.symbol.toUpperCase().replace('/', '').replace('_', '');
    const upperSide = options.side.toUpperCase() as 'BUY' | 'SELL';
    const upperType = options.type.toUpperCase() as 'MARKET' | 'LIMIT';

    const params: Record<string, string | number> = {
      symbol: upperSymbol,
      side: upperSide,
      type: upperType,
    };

    if (upperType === 'MARKET') {
      if (upperSide === 'BUY') {
        if (!options.quoteOrderQty || options.quoteOrderQty <= 0) {
          throw new Error('MARKET BUY membutuhkan parameter quoteOrderQty (nominal IDR).');
        }
        // Round to whole rupiah
        params.quoteOrderQty = Math.floor(options.quoteOrderQty);
      } else {
        // MARKET SELL
        if (!options.quantity || options.quantity <= 0) {
          throw new Error('MARKET SELL membutuhkan parameter quantity (jumlah koin).');
        }
        params.quantity = this.formatQuantity(upperSymbol, options.quantity);
      }
    } else {
      // LIMIT order
      if (!options.price || options.price <= 0) throw new Error('LIMIT order membutuhkan harga (price).');
      if (!options.quantity || options.quantity <= 0) throw new Error('LIMIT order membutuhkan jumlah koin (quantity).');
      params.price = Math.floor(options.price);
      params.quantity = this.formatQuantity(upperSymbol, options.quantity);
      params.timeInForce = 'GTC';
    }

    const result = await this.callPrivateApi<any>('/api/v2/order', 'POST', params);

    // Normalize order response
    const orderId = result.orderId || result.order_id || String(Date.now());
    return {
      ...result,
      orderId,
      order_id: String(orderId), // For backward compatibility
    };
  }

  /**
   * DELETE /api/v2/order
   * Batalkan pending order berdasarkan symbol dan orderId
   */
  public async cancelOrder(symbol: string, orderId: string | number): Promise<any> {
    const upperSymbol = symbol.toUpperCase().replace('/', '').replace('_', '');
    return await this.callPrivateApi('/api/v2/order', 'DELETE', {
      symbol: upperSymbol,
      orderId: String(orderId),
    });
  }

  /**
   * GET /api/v2/openOrders
   * Ambil daftar order yang masih pending
   */
  public async getOpenOrders(symbol?: string): Promise<any[]> {
    const params: Record<string, string> = {};
    if (symbol) {
      params.symbol = symbol.toUpperCase().replace('/', '').replace('_', '');
    }
    return await this.callPrivateApi('/api/v2/openOrders', 'GET', params);
  }

  /**
   * GET /api/v2/order
   * Ambil detail status order
   */
  public async getOrder(symbol: string, orderId: string | number): Promise<any> {
    const upperSymbol = symbol.toUpperCase().replace('/', '').replace('_', '');
    return await this.callPrivateApi('/api/v2/order', 'GET', {
      symbol: upperSymbol,
      orderId: String(orderId),
    });
  }

  /**
   * Normalizes fill data across possible v2 response shapes. Never guesses a
   * fill quantity unless the order is explicitly FILLED and a fallback is known.
   */
  public extractOrderFill(
    raw: any,
    fallback: { requestedQty?: number; expectedPrice?: number } = {}
  ): IndodaxFillInfo {
    const src = raw?.data?.order ?? raw?.data ?? raw?.order ?? raw?.return ?? raw ?? {};
    const num = (value: any): number => {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const status = String(src.status ?? src.orderStatus ?? src.order_status ?? src.state ?? '').toUpperCase();
    let executedQty = num(
      src.executedQty ?? src.executed_qty ?? src.filledQty ?? src.filled_qty ?? src.executed ?? 0
    );
    let quoteQty = num(
      src.cummulativeQuoteQty ??
        src.cummulative_quote_qty ??
        src.quoteQty ??
        src.quote_qty ??
        src.total ??
        0
    );
    let averagePrice = num(src.avgPrice ?? src.averagePrice ?? src.avg_price ?? src.average ?? 0);

    if (status === 'FILLED' && executedQty <= 0) {
      if (fallback.requestedQty && fallback.requestedQty > 0) {
        executedQty = fallback.requestedQty;
      } else if (quoteQty > 0 && fallback.expectedPrice && fallback.expectedPrice > 0) {
        executedQty = quoteQty / fallback.expectedPrice;
      }
    }
    if (averagePrice <= 0 && executedQty > 0 && quoteQty > 0) {
      averagePrice = quoteQty / executedQty;
    }
    if (averagePrice <= 0 && executedQty > 0 && fallback.expectedPrice && fallback.expectedPrice > 0) {
      averagePrice = fallback.expectedPrice;
    }
    if (quoteQty <= 0 && executedQty > 0 && averagePrice > 0) {
      quoteQty = executedQty * averagePrice;
    }

    const explicitlyFilled = executedQty > 0 && num(
      src.executedQty ?? src.executed_qty ?? src.filledQty ?? src.filled_qty ?? src.executed ?? 0
    ) > 0;
    const verified = explicitlyFilled || (status === 'FILLED' && executedQty > 0);

    const isFinal =
      FINAL_ORDER_STATUSES.has(status) ||
      (!status &&
        fallback.requestedQty !== undefined &&
        executedQty >= fallback.requestedQty * 0.999999);

    return {
      orderId: String(src.orderId ?? src.order_id ?? src.id ?? raw?.orderId ?? raw?.order_id ?? ''),
      status: status || 'UNKNOWN',
      executedQty,
      quoteQty,
      averagePrice,
      verified,
      isFinal,
    };
  }

  public async waitForOrderFill(
    symbol: string,
    orderId: string | number,
    rawResponse?: any,
    fallback: { requestedQty?: number; expectedPrice?: number } = {},
    timeoutMs = 5000
  ): Promise<IndodaxFillInfo> {
    let fill = this.extractOrderFill(rawResponse ?? { orderId }, fallback);
    if (fill.isFinal) return fill;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(400);
      try {
        const order = await this.getOrder(symbol, orderId);
        fill = this.extractOrderFill(order, fallback);
        if (fill.isFinal) return fill;
      } catch {
        // Transient network/API issue: retry until the deadline
      }
    }
    return fill;
  }

  // --- Official Deadman Switch Heartbeat (Deadman-switch.md) ---
  // Protocol: POST https://indodax.com/tapi/countdownCancelAll
  // Authentication: HMAC-SHA512 with Header 'Key' and 'Sign'

  public async pingDeadmanSwitch(pairs: string[] = ['btc_idr']): Promise<boolean> {
    const enabled = getSetting('deadman_switch_enabled', '1') === '1';
    if (!enabled) return true;

    try {
      const { apiKey, secretKey } = this.getAuthCredentials();
      if (!apiKey || !secretKey) return false;

      const timestamp = Date.now();
      const pairString = pairs
        .map(p => {
          const clean = p.toLowerCase().replace('/', '');
          return clean.includes('_') ? clean : `${clean.replace('idr', '')}_idr`;
        })
        .join(',');

      const countdownTime = 60000; // 60 detik countdown
      const recvWindow = 5000;

      const payload = `pair=${encodeURIComponent(pairString)}&countdownTime=${countdownTime}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
      const sign = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');

      const res = await fetch(`${this.tapiBaseUrl}/countdownCancelAll`, {
        method: 'POST',
        headers: {
          'Key': apiKey,
          'Sign': sign,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload,
      });

      if (!res.ok) {
        return false;
      }

      const data = await this.safeParseResponse<any>(res, 'pingDeadmanSwitch');
      return data?.success === 1;
    } catch {
      return false;
    }
  }

  // Helper to cancel the deadman switch countdown when safely shutting down
  public async cancelDeadmanSwitch(pairs: string[] = ['btc_idr']): Promise<boolean> {
    try {
      const { apiKey, secretKey } = this.getAuthCredentials();
      if (!apiKey || !secretKey) return true;

      const timestamp = Date.now();
      const pairString = pairs
        .map(p => {
          const clean = p.toLowerCase().replace('/', '');
          return clean.includes('_') ? clean : `${clean.replace('idr', '')}_idr`;
        })
        .join(',');

      const payload = `pair=${encodeURIComponent(pairString)}&countdownTime=0&timestamp=${timestamp}&recvWindow=5000`;
      const sign = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');

      const res = await fetch(`${this.tapiBaseUrl}/countdownCancelAll`, {
        method: 'POST',
        headers: {
          'Key': apiKey,
          'Sign': sign,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload,
      });

      if (!res.ok) return false;
      const data = await this.safeParseResponse<any>(res, 'cancelDeadmanSwitch');
      return data?.success === 1;
    } catch {
      return false;
    }
  }

  // --- New Coin Detector Helper ---

  private recordNewCoinListing(pair: IndodaxPair, lastPrice: number, volume24h: number) {
    try {
      const result = db.prepare(`
        INSERT OR IGNORE INTO new_coin_alerts (id, symbol, name, initial_price, current_price, volume_24h, surge_percent, detected_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'monitoring')
      `).run(
        `alert_${pair.id}_${Date.now()}`,
        pair.id.toLowerCase(),
        pair.description,
        lastPrice,
        lastPrice,
        volume24h,
        Date.now()
      );

      if (result.changes === 0) return;

      console.log(`[Indodax] Listing baru terdeteksi: ${pair.description} (${pair.id.toUpperCase()}) @ ${lastPrice}`);

      if (this.onNewCoinCallback) {
        this.onNewCoinCallback({
          symbol: pair.id,
          name: pair.description,
          price: lastPrice,
          volume: volume24h,
        });
      }
    } catch (err) {
      console.error('Error recording new coin listing:', err);
    }
  }
}

export const indodax = new IndodaxClient();
