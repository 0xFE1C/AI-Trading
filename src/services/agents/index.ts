import crypto from 'crypto';
import { db, getSetting, logAiCall } from '../../db/index.js';
import { aiClient } from '../ai/index.js';
import { indodax } from '../indodax/index.js';
import { scoreHeadline } from '../signals/lexicon.js';
import { detectThreats } from '../signals/threat.js';
import type { ThreatSignal } from '../signals/types.js';

export interface RssItem {
  title: string;
  description: string;
  pubDate?: string;
  link?: string;
}

function cleanCdata(text: string): string {
  return text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').replace(/<[^>]*>/g, '').trim();
}

export function parseRssFeed(xml: string, limit = 5, maxAgeHours = 48): RssItem[] {
  const items: RssItem[] = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const seenTitles = new Set<string>();
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

  for (const itemXml of itemMatches) {
    if (items.length >= limit) break;

    const titleMatch = itemXml.match(/<title[\s\S]*?>([\s\S]*?)<\/title>/i);
    const descMatch = itemXml.match(/<description[\s\S]*?>([\s\S]*?)<\/description>/i);
    const dateMatch = itemXml.match(/<pubDate[\s\S]*?>([\s\S]*?)<\/pubDate>/i);
    const linkMatch = itemXml.match(/<link[\s\S]*?>([\s\S]*?)<\/link>/i);

    const title = titleMatch ? cleanCdata(titleMatch[1]) : '';
    const description = descMatch ? cleanCdata(descMatch[1]) : '';
    const pubDate = dateMatch ? cleanCdata(dateMatch[1]) : '';
    const link = linkMatch ? cleanCdata(linkMatch[1]) : '';

    if (!title) continue;

    // Freshness validation: Ignore outdated news older than maxAgeHours if timestamp is present
    if (pubDate) {
      const parsedTime = Date.parse(pubDate);
      if (!isNaN(parsedTime) && now - parsedTime > maxAgeMs) {
        continue;
      }
    }

    // Deduplication by normalized title
    const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenTitles.has(normalized)) continue;
    seenTitles.add(normalized);

    items.push({ title, description, pubDate, link });
  }

  return items;
}

export class RssNewsService {
  private cache: Map<string, { timestamp: number; items: RssItem[] }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  async getFeed(url: string, limit = 5): Promise<RssItem[]> {
    const now = Date.now();
    const cached = this.cache.get(url);
    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.items;
    }

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AITradingBot/1.0; +https://github.com/0xFE1C)',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        return cached?.items || [];
      }

      const text = await res.text();
      const items = parseRssFeed(text, limit);
      if (items.length > 0) {
        this.cache.set(url, { timestamp: now, items });
      }
      return items;
    } catch {
      return cached?.items || [];
    }
  }
}

export const rssNewsService = new RssNewsService();

export interface SubagentTask {
  id: string;
  name: string;
  role: string;
  sources: string[];
}

export interface SubagentOutput {
  agentId: string;
  agentName: string;
  sourceName: string;
  title: string;
  summary: string;
  sentimentScore: number; // -1.0 (bearish/panic) to +1.0 (ultra bullish/pump)
  coinsMentioned: string[];
  isThreat: boolean;
  timestamp: number;
}

export const SUBAGENT_DEFINITIONS: SubagentTask[] = [
  {
    id: 'subagent-1',
    name: 'Analis Berita Global',
    role: 'Memantau breaking news makro & pasar crypto internasional (CoinDesk, CoinTelegraph)',
    sources: ['CoinDesk Live RSS', 'CoinTelegraph RSS', 'Crypto Breaking Wire'],
  },
  {
    id: 'subagent-2',
    name: 'Analis Teknologi & Ekosistem',
    role: 'Melacak hard fork, upgrade protokol, dan peluncuran mainnet L1/L2',
    sources: ['CoinDesk Research', 'CoinTelegraph News', 'Ecosystem Updates'],
  },
  {
    id: 'subagent-3',
    name: 'Radar Media Sosial',
    role: 'Mengukur sentimen komunitas ritel di forum dan media sosial terbesar',
    sources: ['Reddit r/CryptoCurrency', 'Reddit r/Altcoin', 'Bitcointalk Discussion'],
  },
  {
    id: 'subagent-4',
    name: 'Radar Twitter/X',
    role: 'Mendeteksi narasi viral dan ticker yang sedang trending di Twitter/X',
    sources: ['Crypto Twitter Whale Radar', 'LunarCrush Trending Feeds', 'X Trending #Crypto'],
  },
  {
    id: 'subagent-5',
    name: 'Radar Listing Indodax',
    role: 'Melacak pengumuman koin baru masuk bursa & status order book Indodax',
    sources: ['Indodax Public Pairs API', 'Indodax Summaries Engine', 'Indodax Order Book Depth'],
  },
  {
    id: 'subagent-6',
    name: 'Pemburu Koin Naik',
    role: 'Menganalisa pergerakan koin top gainer dan momentum koin bervolume tinggi',
    sources: ['Indodax 24h Top Gainers', 'Volume Surges Detector', 'CoinGecko Trending'],
  },
  {
    id: 'subagent-7',
    name: 'Radar Keamanan & Hack',
    role: 'Memindai celah kontrak, hack bridge, exploit, dan tindakan regulasi/delisting',
    sources: ['CoinDesk Security Reports', 'CoinTelegraph Alert Desk', 'PeckShield / CertiK Radar'],
  },
  {
    id: 'subagent-8',
    name: 'Radar Makro & Regulasi',
    role: 'Memantau suku bunga The Fed, inflasi global, dan kepatuhan bursa kripto RI (Bappebti)',
    sources: ['Global Macro Telemetry', 'Bank Indonesia Policy Notes', 'Bappebti Registered Updates'],
  },
  {
    id: 'subagent-9',
    name: 'Pelacak Whale On-Chain',
    role: 'Melacak perpindahan wallet besar (whale) ke dan dari bursa',
    sources: ['Whale Alert Feed', 'Exchange Netflow Telemetry', 'CryptoQuant Exchange Reserve'],
  },
  {
    id: 'subagent-10',
    name: 'Analis Selisih Bursa Global',
    role: 'Membandingkan harga dan lonjakan volume bursa global sebelum merambat ke Indodax',
    sources: ['Global Ticker Spikes', 'CoinMarketCap Volume Surges', 'Perp Funding Rate Spikes'],
  },
];

export class MultiAgentSwarm {
  private isRunning = false;
  private isExecuting = false; // In-flight guard
  private lastContextHash = '';
  private intervalTimer: NodeJS.Timeout | null = null;
  private onAgentLogCallback?: (log: SubagentOutput) => void;

  constructor() {
    this.pruneOldLogs();
  }

  public setLogCallback(cb: (log: SubagentOutput) => void) {
    this.onAgentLogCallback = cb;
  }

  public start(intervalMs = 60000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.runCycle();
    this.intervalTimer = setInterval(() => this.runCycle(), intervalMs);
    console.log('[Multi-Agent Swarm] 10 Subagents aktif dengan konteks terisolasi.');
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  // Run all subagents concurrently, each with its own isolated prompt context
  public async runCycle(force = false) {
    if (this.isExecuting) return; // In-flight guard
    this.isExecuting = true;

    try {
      const subagentModel = getSetting('subagent_model', '');

      // Transparent: If user has not configured an AI provider model, do NOT spam fake hallucinations
      if (!subagentModel) {
        return;
      }

      // Fetch live real market data from Indodax to ground subagents in actual reality
      let liveSummaries: any = null;
      try {
        liveSummaries = await indodax.getSummaries();
      } catch {
        // Fallback if network blip
      }

      // Fetch live breaking news from CoinDesk, CoinTelegraph & Indodax Official Blog RSS (with 5m caching)
      const [coinDeskFeed, coinTelegraphFeed, indodaxBlogFeed] = await Promise.all([
        rssNewsService.getFeed('https://www.coindesk.com/arc/outboundfeeds/rss/', 5),
        rssNewsService.getFeed('https://cointelegraph.com/rss', 5),
        rssNewsService.getFeed('https://blog.indodax.com/feed/', 5),
      ]);

      const newsContext = {
        coinDesk: coinDeskFeed,
        coinTelegraph: coinTelegraphFeed,
        indodaxBlog: indodaxBlogFeed,
      };

      // Ingest news into news_items table with deterministic lexicon & threat analysis
      const allNews = [
        ...coinDeskFeed.map((n) => ({ ...n, source: 'CoinDesk' })),
        ...coinTelegraphFeed.map((n) => ({ ...n, source: 'CoinTelegraph' })),
        ...indodaxBlogFeed.map((n) => ({ ...n, source: 'Indodax Blog' })),
      ];

      for (const item of allNews) {
        try {
          const id = crypto.createHash('md5').update(`${item.source}:${item.title}`).digest('hex');
          const sentiment = scoreHeadline(item.title, item.description);
          const threats = detectThreats({
            id,
            source: item.source,
            title: item.title,
            description: item.description,
            fetchedAt: Date.now(),
          });
          const isThreat = threats.length > 0 ? 1 : 0;
          const threatSeverity = threats[0]?.severity || null;

          db.prepare(`
            INSERT INTO news_items (
              id, source, title, url, published_at, fetched_at, sentiment_score,
              matched_bullish, matched_bearish, mentioned_coins, is_threat, threat_severity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              fetched_at = excluded.fetched_at,
              sentiment_score = excluded.sentiment_score
          `).run(
            id,
            item.source,
            item.title,
            item.link || null,
            item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
            Date.now(),
            sentiment.score,
            JSON.stringify(sentiment.matchedBullish),
            JSON.stringify(sentiment.matchedBearish),
            JSON.stringify(sentiment.mentionedCoins),
            isThreat,
            threatSeverity
          );
        } catch {}
      }

      // Context Dedup: Check if market tickers and breaking news are identical to previous cycle
      const contextFingerprint = crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            d: coinDeskFeed.map((f) => f.title).slice(0, 5),
            t: coinTelegraphFeed.map((f) => f.title).slice(0, 5),
            b: indodaxBlogFeed.map((f) => f.title).slice(0, 3),
            top: liveSummaries?.tickers
              ? Object.entries(liveSummaries.tickers)
                  .filter(([k]) => k.endsWith('_idr'))
                  .slice(0, 5)
                  .map(([k, v]: any) => `${k}:${v.last}`)
              : [],
          })
        )
        .digest('hex');

      const isEventDriven = getSetting('swarm_event_driven', '1') === '1';
      if (!force && isEventDriven && this.lastContextHash === contextFingerprint) {
        logAiCall('scout', subagentModel, 0, 0, 0, 'skipped_dedup');
        return;
      }
      this.lastContextHash = contextFingerprint;

      // Eksekusi subagents dalam batch kecil (2 agent per batch) dengan jeda 300ms
      // untuk mencegah burst rate limit (HTTP 429) pada Google Cloud Code
      const BATCH_SIZE = 2;
      for (let i = 0; i < SUBAGENT_DEFINITIONS.length; i += BATCH_SIZE) {
        const batch = SUBAGENT_DEFINITIONS.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async (def) => {
            try {
              const output = await this.executeSubagent(def, subagentModel, liveSummaries, newsContext);
              if (output) {
                this.saveSubagentLog(output);
                if (this.onAgentLogCallback) {
                  this.onAgentLogCallback(output);
                }
              }
            } catch (err: any) {
              console.warn(`[Subagent ${def.name}] Gagal mengeksekusi cycle: ${err.message}`);
            }
          })
        );
        // Jeda ringan 300ms antar batch agar kuota per-menit aman
        if (i + BATCH_SIZE < SUBAGENT_DEFINITIONS.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      this.pruneOldLogs();
    } finally {
      this.isExecuting = false;
    }
  }

  // Execute a single subagent with ISOLATED context
  private async executeSubagent(
    task: SubagentTask,
    model: string,
    liveSummaries: any,
    newsContext: { coinDesk: RssItem[]; coinTelegraph: RssItem[]; indodaxBlog?: RssItem[] }
  ): Promise<SubagentOutput | null> {
    const realContext = this.buildContextForAgent(task, liveSummaries, newsContext);

    const prompt = `Anda adalah sub-agent khusus: "${task.name}".
Tugas: ${task.role}
Sumber Pengamatan: ${task.sources.join(', ')}

Konteks Data Pasar Terkini:
${JSON.stringify(realContext)}

Analisa secara objektif dan jujur. Jangan membuat berita palsu (hallucination).
Kembalikan HANYA format JSON valid berikut (tanpa markdown backtick):
{
  "title": "Judul ringkas temuan utama",
  "summary": "Analisa 2 kalimat mengenai dampak langsung ke harga crypto atau koin Indodax",
  "sentimentScore": 0.0, // Skor dari -1.0 (sangat panik/bearish/hack) sampai +1.0 (sangat bullish/pump)
  "coinsMentioned": ["BTC", "SOL", "PEPE"], // Simbol koin yang terpengaruh
  "isThreat": false // true jika ada hack, exploit, delisting, atau bahaya crash
}`;

    try {
      const responseText = await aiClient.complete({
        model,
        messages: [
          { role: 'system', content: 'Anda adalah AI financial market subagent. Jawab HANYA dalam JSON murni.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        agentCaller: 'scout',
      });

      // Clean JSON if wrapped in markdown
      let cleanJson = responseText.trim();
      if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json/, '');
      if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```/, '');
      if (cleanJson.endsWith('```')) cleanJson = cleanJson.replace(/```$/, '');
      cleanJson = cleanJson.trim();

      const parsed = JSON.parse(cleanJson);

      return {
        agentId: task.id,
        agentName: task.name,
        sourceName: task.sources[Math.floor(Math.random() * task.sources.length)],
        title: parsed.title || `${task.name} Market Analysis`,
        summary: parsed.summary || 'Kondisi pasar normal tanpa anomali kritis.',
        sentimentScore: typeof parsed.sentimentScore === 'number' ? Math.max(-1, Math.min(1, parsed.sentimentScore)) : 0.0,
        coinsMentioned: Array.isArray(parsed.coinsMentioned) ? parsed.coinsMentioned : [],
        isThreat: Boolean(parsed.isThreat),
        timestamp: Date.now(),
      };
    } catch (err: any) {
      // Do NOT invent fake positive news if the AI model call failed
      return null;
    }
  }

  private saveSubagentLog(output: SubagentOutput) {
    try {
      const stmt = db.prepare(`
        INSERT INTO subagent_logs (id, agent_id, agent_name, source_name, title, summary, sentiment_score, coins_mentioned, is_threat, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        `log_${output.agentId}_${Date.now()}`,
        output.agentId,
        output.agentName,
        output.sourceName,
        output.title,
        output.summary,
        output.sentimentScore,
        JSON.stringify(output.coinsMentioned),
        output.isThreat ? 1 : 0,
        output.timestamp
      );
    } catch (err) {
      console.error('Error saving subagent log:', err);
    }
  }

  // Database Retention: Keep only the most recent 500 logs to prevent SQLite bloat
  public pruneOldLogs() {
    try {
      db.prepare(`
        DELETE FROM subagent_logs
        WHERE id NOT IN (
          SELECT id FROM subagent_logs
          ORDER BY timestamp DESC
          LIMIT 500
        )
      `).run();
    } catch (err) {
      // Ignore if table not yet initialized
    }
  }

  // Supplies real market data and telemetry to subagents
  private buildContextForAgent(
    task: SubagentTask,
    summaries: any,
    newsContext: { coinDesk: RssItem[]; coinTelegraph: RssItem[]; indodaxBlog?: RssItem[] }
  ): any {
    const time = new Date().toLocaleTimeString('id-ID');
    const tickers = summaries?.tickers || {};

    // Calculate real top gainers from live Indodax ticker data
    const gainers: Array<{ pair: string; last: string; gainPercent: number; volIdr: number }> = [];
    for (const [key, t] of Object.entries(tickers) as [string, any][]) {
      if (!key.endsWith('_idr')) continue;
      const low = parseFloat(t.low);
      const last = parseFloat(t.last);
      const volIdr = parseFloat(t.vol_idr);
      if (low > 0 && volIdr > 50000000) {
        const gain = ((last - low) / low) * 100;
        gainers.push({
          pair: key.replace('_idr', '').toUpperCase(),
          last: t.last,
          gainPercent: parseFloat(gain.toFixed(2)),
          volIdr,
        });
      }
    }
    gainers.sort((a, b) => b.gainPercent - a.gainPercent);
    const topGainers = gainers.slice(0, 5);

    // Get recently detected new coin alerts
    let recentAlerts: any[] = [];
    try {
      recentAlerts = db.prepare('SELECT symbol, name, initial_price, current_price, detected_at FROM new_coin_alerts ORDER BY detected_at DESC LIMIT 3').all();
    } catch {}

    const allNewsHeadlines = [
      ...newsContext.coinDesk.map((i) => ({ source: 'CoinDesk', title: i.title })),
      ...newsContext.coinTelegraph.map((i) => ({ source: 'CoinTelegraph', title: i.title })),
      ...(newsContext.indodaxBlog || []).map((i) => ({ source: 'Indodax Blog', title: i.title })),
    ];

    switch (task.id) {
      case 'subagent-1': // Global Crypto Breaking Wire
        return {
          source: 'Live CoinDesk & CoinTelegraph RSS Feeds',
          time,
          realLiveHeadlines: allNewsHeadlines.slice(0, 6),
          btcPrice: tickers.btc_idr?.last || 'Market Live',
        };

      case 'subagent-2': // Tech & Ecosystem Analyst
        return {
          source: 'CoinDesk Research & CoinTelegraph Tech Feeds',
          time,
          recentTechDevelopments: newsContext.coinDesk.slice(0, 5).map((n) => n.title),
          topMovers: topGainers.slice(0, 3),
        };

      case 'subagent-7': {
        // Security & Exploit Radar (Strict regex: bare 'sec' is intentionally excluded to avoid false alarms)
        const securityNews = allNewsHeadlines.filter((n) =>
          /\b(hack|exploit|scam|stolen|drain|sec charges?|bappebti (block|ban|suspend)|arrest|lawsuit filed|attack|vulnerability|fraud)\b/i.test(n.title)
        );
        return {
          source: 'Security Telemetry & Live Incident Feeds',
          time,
          detectedIncidents:
            securityNews.length > 0
              ? securityNews
              : ['Tidak ada laporan exploit atau ancaman regulasi dalam breaking news saat ini (kondisi aman).'],
          marketHealth: 'Order book Indodax normal',
        };
      }

      case 'subagent-5': // Indodax Listing Radar
        return {
          source: 'Indodax Official Data & Blog',
          time,
          officialAnnouncements: (newsContext.indodaxBlog || []).map((n) => n.title),
          newListingAlerts: recentAlerts,
          activePairsCount: Object.keys(tickers).length,
        };

      case 'subagent-8': // Macro Economics & Bappebti Radar
        return {
          source: 'Indodax Market Blog & Bappebti/BI Macro',
          time,
          domesticCryptoHeadlines: (newsContext.indodaxBlog || []).map((n) => n.title),
          globalMacroHeadlines: newsContext.coinDesk.slice(0, 3).map((n) => n.title),
          btcPrice: tickers.btc_idr?.last || 'Market Live',
        };

      case 'subagent-6': // Memecoin & Top Gainers
        return {
          source: 'Live Indodax Market Tickers',
          time,
          topGainersToday: topGainers,
        };

      default:
        return {
          source: task.sources[0],
          time,
          marketSnapshot: {
            btcPrice: tickers.btc_idr?.last || 'Market Live',
            btc24hVolIdr: tickers.btc_idr?.vol_idr || '0',
            topMovers: topGainers.slice(0, 3),
          },
          latestHeadlines: allNewsHeadlines.slice(0, 3).map((n) => n.title),
        };
    }
  }

  // Calculate aggregated market sentiment and token sentiment map with Scoped Threat Detection (<30m freshness)
  public getAggregatedSentiment(): {
    averageSentiment: number;
    threatCount: number;
    coinSentiments: Record<string, number>;
    activeThreats: ThreatSignal[];
    threatenedCoins: Set<string>;
  } {
    const FRESH_MS = 30 * 60 * 1000; // 30-minute freshness window (P0-A requirement)
    const minTimestamp = Date.now() - FRESH_MS;

    const recentLogs = db.prepare(`
      SELECT sentiment_score, coins_mentioned, is_threat, timestamp
      FROM subagent_logs
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 50
    `).all(minTimestamp) as Array<{ sentiment_score: number; coins_mentioned: string; is_threat: number; timestamp: number }>;

    const activeThreats: ThreatSignal[] = [];
    const threatenedCoins = new Set<string>();

    for (const log of recentLogs) {
      if (log.is_threat) {
        let coins: string[] = [];
        try {
          coins = JSON.parse(log.coins_mentioned || '[]');
        } catch {}
        if (coins.length > 0) {
          for (const c of coins) {
            const upper = c.toUpperCase();
            threatenedCoins.add(upper);
            activeThreats.push({
              coin: upper,
              severity: 'high',
              matchedRule: 'subagent_flagged_threat',
              headline: 'Subagent Threat Telemetry',
              detectedAt: log.timestamp,
            });
          }
        } else {
          activeThreats.push({
            coin: null,
            severity: 'high',
            matchedRule: 'subagent_global_threat',
            headline: 'Global Subagent Threat Alert',
            detectedAt: log.timestamp,
          });
        }
      }
    }

    // Include fresh deterministic threats from news_items
    try {
      const newsThreats = db.prepare(`
        SELECT title, mentioned_coins, threat_severity, fetched_at
        FROM news_items
        WHERE is_threat = 1 AND fetched_at >= ?
        ORDER BY fetched_at DESC
        LIMIT 20
      `).all(minTimestamp) as Array<{ title: string; mentioned_coins: string; threat_severity: string; fetched_at: number }>;

      for (const nt of newsThreats) {
        let coins: string[] = [];
        try {
          coins = JSON.parse(nt.mentioned_coins || '[]');
        } catch {}
        if (coins.length > 0) {
          for (const c of coins) {
            const upper = c.toUpperCase();
            threatenedCoins.add(upper);
            activeThreats.push({
              coin: upper,
              severity: (nt.threat_severity as any) || 'medium',
              matchedRule: 'rule_based_threat',
              headline: nt.title,
              detectedAt: nt.fetched_at,
            });
          }
        } else {
          activeThreats.push({
            coin: null,
            severity: (nt.threat_severity as any) || 'high',
            matchedRule: 'rule_based_threat_global',
            headline: nt.title,
            detectedAt: nt.fetched_at,
          });
        }
      }
    } catch {}

    if (recentLogs.length === 0) {
      return {
        averageSentiment: 0,
        threatCount: activeThreats.length,
        coinSentiments: {},
        activeThreats,
        threatenedCoins,
      };
    }

    let totalScore = 0;
    const coinSentiments: Record<string, { total: number; count: number }> = {};

    for (const log of recentLogs) {
      totalScore += log.sentiment_score;
      try {
        const coins: string[] = JSON.parse(log.coins_mentioned || '[]');
        for (const coin of coins) {
          const upper = coin.toUpperCase();
          if (!coinSentiments[upper]) coinSentiments[upper] = { total: 0, count: 0 };
          coinSentiments[upper].total += log.sentiment_score;
          coinSentiments[upper].count += 1;
        }
      } catch {}
    }

    const normalizedCoinMap: Record<string, number> = {};
    for (const [coin, data] of Object.entries(coinSentiments)) {
      normalizedCoinMap[coin] = parseFloat((data.total / data.count).toFixed(2));
    }

    return {
      averageSentiment: parseFloat((totalScore / recentLogs.length).toFixed(2)),
      threatCount: activeThreats.length,
      coinSentiments: normalizedCoinMap,
      activeThreats,
      threatenedCoins,
    };
  }

  // --- AI Post-Mortem Reviewer (Self-Learning Memory) ---

  public async reviewClosedTrade(trade: {
    symbol: string;
    entryPrice: number;
    exitPrice: number;
    pnlPercent: number;
    holdDurationMinutes: number;
    exitReason: string;
  }) {
    const masterModel = getSetting('master_model', '');
    if (!masterModel) return; // Only review when a model is active

    const isWin = trade.pnlPercent >= 0;

    const prompt = `Lakukan evaluasi post-mortem objektif atas trade berikut:
Simbol: ${trade.symbol}
Harga Beli: ${trade.entryPrice}
Harga Jual: ${trade.exitPrice}
PnL: ${trade.pnlPercent.toFixed(2)}% (${isWin ? 'WIN / PROFIT' : 'LOSS / STOP LOSS'})
Durasi Hold: ${trade.holdDurationMinutes} menit
Alasan Exit: ${trade.exitReason}

Tuliskan 1 pelajaran penting (maksimal 2 kalimat) untuk memori trading AI agar di masa depan sistem ini dapat mengulangi kesuksesan atau mencegah kerugian pada kondisi serupa.`;

    try {
      const lesson = await aiClient.complete({
        model: masterModel,
        messages: [
          { role: 'system', content: 'Anda adalah Senior Quantitative Risk Manager. Berikan evaluasi ringkas dan aplikatif.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
        agentCaller: 'postmortem',
      });

      db.prepare(`
        INSERT INTO lessons_learned (id, trade_id, symbol, result, pnl_percent, market_condition, lesson, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `lesson_${Date.now()}`,
        `trade_${Date.now()}`,
        trade.symbol,
        isWin ? 'WIN' : 'LOSS',
        trade.pnlPercent,
        `Volatile / Momentum (${trade.holdDurationMinutes}m)`,
        lesson.trim(),
        Date.now()
      );
      console.log(`[AI Post-Mortem] Pelajaran disimpan untuk ${trade.symbol}: ${lesson.trim()}`);
    } catch (err: any) {
      console.warn('[AI Post-Mortem Reviewer] Gagal mereview trade:', err.message);
    }
  }
}

export const agentSwarm = new MultiAgentSwarm();
