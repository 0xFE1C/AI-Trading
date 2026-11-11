export interface MarketSummary {
  symbol: string;
  pair: string;
  last: number;
  high24h: number;
  low24h: number;
  volIdr24h: number;
  buyPrice: number;
  sellPrice: number;
  ts: number;
}

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  description: string;
  url?: string;
  publishedAt?: number;
  fetchedAt: number;
}

export interface CoinFeatures {
  symbol: string;
  ts?: number;
  close: number;
  high24h?: number;
  low24h?: number;
  volume24hIdr?: number;
  rsi14: number | null;
  ema9?: number | null;
  ema21: number | null;
  ema50?: number | null;
  atr14: number | null;
  macdHistogram?: number | null;
  adx14?: number | null;
  plusDi14?: number | null;
  minusDi14?: number | null;
  bbWidthPct?: number | null;
  bbPercentB?: number | null;
  vwap?: number | null;
  vwapDistancePct?: number | null;
  volumeZScore?: number | null;
  isSqueezeBreakout?: boolean;
  gain24hPct: number;
  dropFromHighPct: number;
  volumeSurgeRatio: number;
  spreadPct: number;
  depthImbalance: number;
  isBluechip: boolean;
}

export interface HeadlineSentiment {
  score: number; // -1.0 .. +1.0
  matchedBullish: string[];
  matchedBearish: string[];
  mentionedCoins: string[];
}

export type ThreatSeverity = 'critical' | 'high' | 'medium';

export interface ThreatSignal {
  coin: string | null; // null = global
  severity: ThreatSeverity;
  matchedRule: string;
  headline: string;
  detectedAt: number;
}

export type MarketRegime = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'CRASH';

export interface BtcRegimeInput {
  change1hPct: number;
  change4hPct: number;
  close: number;
  ema21_1h?: number | null;
  atrPercentile30d?: number;
}

export interface RegimeVerdict {
  regime: MarketRegime;
  allowNewEntries: boolean;
  reasons: string[];
}

export type Strategy = 'bluechip_pullback' | 'momentum' | 'volatility_squeeze' | 'new_listing';

export interface ScoreResult {
  symbol: string;
  strategy: Strategy;
  score: number; // 0..100
  breakdown: Record<string, number>;
}
