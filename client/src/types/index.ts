export interface Position {
  id: string;
  symbol: string;
  base_currency: string;
  traded_currency: string;
  side: string;
  entry_price: number;
  current_price: number;
  amount: number;
  initial_cost_idr: number;
  highest_price: number;
  trailing_stop_price: number;
  take_profit_step: number;
  status: string;
  opened_at: number;
  closed_at: number | null;
  pnl_idr: number;
  pnl_percent: number;
  exit_reason: string | null;
  mode: 'paper' | 'live';
}

export interface TradeHistory {
  id: string;
  position_id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  price: number;
  amount: number;
  total_idr: number;
  fee_idr: number;
  mode: 'paper' | 'live';
  order_id: string;
  reason: string;
  timestamp: number;
}

export interface LessonLearned {
  id: string;
  trade_id: string;
  symbol: string;
  result: 'WIN' | 'LOSS';
  pnl_percent: number;
  market_condition: string;
  lesson: string;
  timestamp: number;
}

export interface SubagentDef {
  id: string;
  name: string;
  role: string;
  sources: string[];
}

export interface SubagentLog {
  id: string;
  agent_id: string;
  agent_name: string;
  source_name: string;
  title: string;
  summary: string;
  sentiment_score: number;
  coins_mentioned: string[];
  is_threat: number;
  timestamp: number;
}

export interface MarketTicker {
  symbol: string;
  pair: string;
  name: string;
  last: number;
  high: number;
  low: number;
  gain24h: number;
  volIdr: number;
}

export interface NewCoinAlert {
  id: string;
  symbol: string;
  name: string;
  initial_price: number;
  current_price: number;
  volume_24h: number;
  surge_percent: number;
  detected_at: number;
  status: string;
}

export interface AIProvider {
  id: string;
  name: string;
  base_url: string;
  api_keys: string[];
  alias: string;
  protocol: 'chat_completions' | 'messages' | 'antigravity';
  oauth_data?: {
    email?: string;
    projectId?: string;
    expiresAt?: number;
  } | null;
  is_active: number;
  created_at: number;
  has_keys?: boolean;
  keys_count?: number;
  models?: AIModel[];
}

export interface AIModel {
  id: string;
  provider_id: string;
  model_id: string;
  alias_model_id: string;
  display_name: string;
  context_length: number;
  imported_at: number;
}

export interface TunnelStatus {
  active: boolean;
  type: 'cloudflared' | 'ngrok' | null;
  url: string | null;
  error?: string | null;
}

export interface SystemStatus {
  isAutoTradingActive: boolean;
  mode: 'paper' | 'live';
  balanceIdr: number;
  openPositions: Position[];
  recentTrades: TradeHistory[];
  lessonsLearned: LessonLearned[];
  sentiment: {
    averageSentiment: number;
    threatCount: number;
    coinSentiments: Record<string, number>;
  };
  whatsapp: {
    connected: boolean;
    active: boolean;
    qrCode: string | null;
    adminNumber: string;
  };
  subagentsCount: number;
  isAdmin?: boolean;
}

export type RiskProfileKey = 'conservative' | 'balanced' | 'aggressive';

export interface RiskProfileInfo {
  name: string;
  description: string;
  max_allocation_per_trade_idr: number;
  max_active_trades: number;
  trailing_stop_percent: number;
  take_profit_target_1_percent: number;
  btc_regime_max_drop_percent: number;
  allow_new_listings: boolean;
  allowed_coins_only: string | null;
  min_24h_volume_idr: number;
}

export interface BacktestParams {
  symbol: string;
  timeframe: '15m' | '1h' | '4h' | '1d';
  days?: number;
  initialBalanceIdr?: number;
  allocationPerTradeIdr?: number;
  trailingStopPercent?: number;
  takeProfitStep1Percent?: number;
  minGainThresholdPercent?: number;
  slippagePercent?: number;
  strategyType?: 'live_momentum' | 'candle_breakout';
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  entryTime: number;
  exitTime: number;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  highestPrice: number;
  amount: number;
  totalCostIdr: number;
  pnlIdr: number;
  pnlPercent: number;
  exitReason: string;
  holdDurationHours: number;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  days: number;
  effectiveDays: number;
  dataTruncated: boolean;
  totalCandles: number;
  initialBalance: number;
  finalBalance: number;
  netPnlIdr: number;
  netPnlPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  profitFactor: number | null;
  maxDrawdownPercent: number;
  averageTradePnlPercent: number;
  slippagePercent: number;
  feePercent: number;
  strategyUsed: string;
  trades: BacktestTrade[];
  equityCurve: Array<{ time: string; timestamp: number; equity: number }>;
}

export interface GhostPosition {
  id: string;
  evaluation_id: string | null;
  symbol: string;
  entry_price: number;
  current_price: number;
  highest_price: number;
  trailing_stop_price: number;
  take_profit_step: number;
  initial_cost_idr: number;
  amount: number;
  opened_at: number;
  closed_at: number | null;
  pnl_idr: number;
  pnl_percent: number;
  exit_reason: string | null;
  status: 'open' | 'closed';
  simulated_outcome: 'BULLET_DODGED' | 'OPPORTUNITY_MISSED' | null;
}

export interface AbValidationMetrics {
  totalEvaluations: number;
  approvedCount: number;
  rejectedCount: number;
  approvalRatePercent: number;
  rejectionRatePercent: number;
  groupAWithAi: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRatePercent: number;
    totalPnlIdr: number;
    avgPnlPercent: number;
  };
  groupBCounterfactual: {
    totalGhosts: number;
    openGhosts: number;
    closedGhosts: number;
    bulletsDodged: number;
    savedCapitalIdr: number;
    opportunitiesMissed: number;
    missedProfitIdr: number;
    counterfactualWins: number;
    counterfactualWinRatePercent: number;
    counterfactualPnlIdr: number;
  };
  combinedWithoutAi: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRatePercent: number;
    totalPnlIdr: number;
  };
  alpha: {
    winRateDeltaPercent: number;
    pnlAlphaIdr: number;
    dodgedLossRatioPercent: number;
  };
  recentEvaluations: Array<{
    id: string;
    timestamp: number;
    symbol: string;
    candidate_price: number;
    technical_reason: string;
    sentiment_score: number;
    threat_count: number;
    ai_verdict: 'APPROVED' | 'REJECTED';
    ai_reasoning: string;
    mode: string;
    ghost_status?: string | null;
    ghost_outcome?: 'BULLET_DODGED' | 'OPPORTUNITY_MISSED' | null;
    ghost_pnl_percent?: number | null;
    ghost_pnl_idr?: number | null;
  }>;
  activeGhosts: GhostPosition[];
}

export interface AntigravityModelQuota {
  id: string;
  displayName: string;
  family: 'gemini' | 'claude' | 'gpt' | 'other';
  remainingPercentage: number;
  remainingFraction: number;
  resetAt: string | null;
  limited: boolean;
}

export interface AntigravityQuotaGroup {
  id: string;
  displayName: string;
  remainingPercentage: number;
  resetAt: string | null;
  models: string[];
}

export interface AntigravityAccountQuota {
  providerId: string;
  providerName: string;
  email: string;
  projectId: string;
  alias: string;
  updatedAt: number;
  totalModels: number;
  groups: AntigravityQuotaGroup[];
  models: AntigravityModelQuota[];
}

export interface PerformanceReport {
  periodLabel: string;
  startDate: string;
  endDate: string;
  currentMode: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRatePercent: number;
  totalVolumeIdr: number;
  grossProfitIdr: number;
  grossLossIdr: number;
  netPnlIdr: number;
  netPnlPercent: number;
  profitFactor: number | null;
  maxDrawdownPercent: number;
  maxDrawdownIdr: number;
  avgHoldDurationMinutes: number;
  bestTrade: {
    symbol: string;
    pnlIdr: number;
    pnlPercent: number;
    date: string;
  } | null;
  worstTrade: {
    symbol: string;
    pnlIdr: number;
    pnlPercent: number;
    date: string;
  } | null;
  coinBreakdown: Array<{
    symbol: string;
    tradesCount: number;
    wins: number;
    losses: number;
    winRatePercent: number;
    totalPnlIdr: number;
    avgPnlPercent: number;
  }>;
  aiEfficacy: {
    evaluationsCount: number;
    approvedCount: number;
    rejectedCount: number;
    bulletsDodged: number;
    savedCapitalIdr: number;
    opportunitiesMissed: number;
    missedProfitIdr: number;
  };
  lessonsLearned: Array<{
    id: string;
    symbol: string;
    result: string;
    pnl_percent: number;
    lesson: string;
    date: string;
  }>;
  tradesList: Array<{
    id: string;
    symbol: string;
    entry_price: number;
    exit_price: number;
    initial_cost_idr: number;
    amount: number;
    opened_at: number;
    closed_at: number;
    pnl_idr: number;
    pnl_percent: number;
    exit_reason: string;
    hold_minutes: number;
    mode: string;
  }>;
}

export interface BackupItem {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: number;
  createdFormatted: string;
}

export interface SystemHealth {
  uptimeSeconds: number;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  databaseSizeMb: number;
  nodeVersion: string;
  platform: string;
  cpuCount: number;
}

export type TokenRotationMode = 'fixed' | 'on_startup' | 'interval';
export type TokenRotationUnit = 'minutes' | 'hours' | 'days';

export interface TokenRotationStatus {
  mode: TokenRotationMode;
  intervalValue: number;
  intervalUnit: TokenRotationUnit;
  lastRotatedAt: number;
  nextRotationAt: number | null;
  currentToken: string;
}




export interface EntryGateDiagnostics {
  totalEvaluated: number;
  gates: Record<string, { passed: number; failed: number }>;
  recentRejections: Array<{
    ts: number;
    symbol: string;
    gate_name: string;
    values: any;
  }>;
}

export interface AiMeteringStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgLatencyMs: number;
  byAgent: Record<string, { calls: number; inputTokens: number; outputTokens: number }>;
  byStatus: Record<string, number>;
  aiMode?: string;
  isDegraded?: boolean;
}

export interface SignalsRadarData {
  shortlists: Array<{
    id: number;
    ts: number;
    symbol: string;
    profile: string;
    strategy: string;
    score: number;
    threshold: number;
    passed: number;
    breakdown: any;
  }>;
  regimes: Array<{
    id: number;
    ts: number;
    regime: string;
    ret_1h: number;
    ret_4h: number;
    atr_ratio: number;
    reasons: string[];
  }>;
  news: Array<{
    id: string;
    headline: string;
    source: string;
    sentiment_score: number;
    matchedBullish: string[];
    matchedBearish: string[];
    mentionedCoins: string[];
    fetched_at: number;
  }>;
  activeThreats: any[];
  threatCount: number;
  averageSentiment: number;
}
