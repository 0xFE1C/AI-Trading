import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  isSensitiveSettingKey,
} from '../services/security/secrets.js';

const dbPathEnv = process.env.AI_TRADING_DB_PATH;
export const DATA_DIR = process.env.AI_TRADING_DATA_DIR
  ? path.resolve(process.env.AI_TRADING_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DB_PATH = dbPathEnv ? path.resolve(dbPathEnv) : path.join(DATA_DIR, 'trading.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable WAL mode and production performance PRAGMAs for concurrent reliability
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -64000');
db.pragma('temp_store = MEMORY');

let isDatabaseInitialized = false;

export function initDatabase() {
  if (isDatabaseInitialized) return;
  isDatabaseInitialized = true;

  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_keys TEXT NOT NULL, -- JSON array of strings
      alias TEXT NOT NULL UNIQUE,
      protocol TEXT NOT NULL DEFAULT 'chat_completions', -- 'chat_completions' | 'messages' | 'antigravity'
      oauth_data TEXT, -- JSON object of OAuth tokens & metadata for Antigravity
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      alias_model_id TEXT NOT NULL UNIQUE, -- e.g. hrbr/deepseek-v3
      display_name TEXT NOT NULL,
      context_length INTEGER DEFAULT 128000,
      imported_at INTEGER NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      base_currency TEXT NOT NULL,
      traded_currency TEXT NOT NULL,
      side TEXT NOT NULL DEFAULT 'buy',
      entry_price REAL NOT NULL,
      current_price REAL NOT NULL,
      amount REAL NOT NULL,
      initial_cost_idr REAL NOT NULL,
      highest_price REAL NOT NULL,
      trailing_stop_price REAL NOT NULL,
      take_profit_step INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
      opened_at INTEGER NOT NULL,
      closed_at INTEGER,
      pnl_idr REAL DEFAULT 0,
      pnl_percent REAL DEFAULT 0,
      realized_pnl_idr REAL NOT NULL DEFAULT 0, -- net PnL already banked from partial exits
      exit_reason TEXT,
      mode TEXT NOT NULL DEFAULT 'paper' -- 'paper' | 'live'
    );

    CREATE TABLE IF NOT EXISTS trades_history (
      id TEXT PRIMARY KEY,
      position_id TEXT,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL, -- 'BUY' | 'SELL'
      price REAL NOT NULL,
      amount REAL NOT NULL,
      total_idr REAL NOT NULL,
      fee_idr REAL NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'paper',
      order_id TEXT,
      reason TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subagent_logs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      source_name TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      coins_mentioned TEXT, -- JSON array
      is_threat INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lessons_learned (
      id TEXT PRIMARY KEY,
      trade_id TEXT,
      symbol TEXT NOT NULL,
      result TEXT NOT NULL, -- 'WIN' | 'LOSS'
      pnl_percent REAL NOT NULL,
      market_condition TEXT NOT NULL,
      lesson TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS new_coin_alerts (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      initial_price REAL NOT NULL,
      current_price REAL NOT NULL,
      volume_24h REAL NOT NULL,
      surge_percent REAL NOT NULL DEFAULT 0,
      detected_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'monitoring' -- 'monitoring' | 'entered' | 'ignored'
    );

    -- Persistent registry of every Indodax IDR pair ever observed.
    -- New-listing detection must compare against this, not against alert rows.
    CREATE TABLE IF NOT EXISTS known_pairs (
      pair_id TEXT PRIMARY KEY,
      first_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_ab_evaluations (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      candidate_price REAL NOT NULL,
      technical_reason TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      threat_count INTEGER NOT NULL DEFAULT 0,
      ai_verdict TEXT NOT NULL, -- 'APPROVED' | 'REJECTED'
      ai_reasoning TEXT,
      mode TEXT NOT NULL DEFAULT 'paper'
    );

    CREATE TABLE IF NOT EXISTS ghost_positions (
      id TEXT PRIMARY KEY,
      evaluation_id TEXT,
      symbol TEXT NOT NULL,
      entry_price REAL NOT NULL,
      current_price REAL NOT NULL,
      highest_price REAL NOT NULL,
      trailing_stop_price REAL NOT NULL,
      take_profit_step INTEGER NOT NULL DEFAULT 0,
      initial_cost_idr REAL NOT NULL,
      amount REAL NOT NULL,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER,
      pnl_idr REAL DEFAULT 0,
      pnl_percent REAL DEFAULT 0,
      exit_reason TEXT,
      status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
      simulated_outcome TEXT, -- 'BULLET_DODGED' | 'OPPORTUNITY_MISSED'
      FOREIGN KEY (evaluation_id) REFERENCES ai_ab_evaluations (id) ON DELETE SET NULL
    );

    -- Entry Gate Diagnostics (Answers: "Mengapa bot belum trading?")
    CREATE TABLE IF NOT EXISTS entry_gate_logs (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      gate_name TEXT NOT NULL, -- 'circuit_breaker' | 'exposure' | 'threat_scope' | 'btc_regime' | 'candidate_filter' | 'slippage' | 'spread' | 'rsi' | 'ai_gate' | 'score_threshold'
      passed INTEGER NOT NULL, -- 0 | 1
      values_json TEXT
    );

    -- AI Token Metering & Observability
    CREATE TABLE IF NOT EXISTS ai_call_logs (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      agent TEXT NOT NULL, -- 'scout' | 'analyst' | 'master' | 'postmortem' | 'whatsapp'
      model TEXT,
      est_input_tokens INTEGER NOT NULL DEFAULT 0,
      est_output_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL -- 'ok' | 'error' | 'skipped_dedup' | 'skipped_quota'
    );

    -- Structured News & Lexicon Scored Headlines
    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY, -- hash(source + title)
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      published_at INTEGER,
      fetched_at INTEGER NOT NULL,
      sentiment_score REAL NOT NULL DEFAULT 0,
      matched_bullish TEXT,
      matched_bearish TEXT,
      mentioned_coins TEXT,
      is_threat INTEGER NOT NULL DEFAULT 0,
      threat_severity TEXT
    );

    -- Market Regime Audit Log
    CREATE TABLE IF NOT EXISTS regime_log (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      regime TEXT NOT NULL,
      btc_change_1h_pct REAL,
      btc_change_4h_pct REAL,
      reasons TEXT
    );

    -- Opportunity Shortlist
    CREATE TABLE IF NOT EXISTS opportunity_shortlist (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      strategy TEXT NOT NULL,
      score REAL NOT NULL,
      breakdown TEXT,
      consumed INTEGER NOT NULL DEFAULT 0
    );

    -- Multi-Agent Blackboard Bus Outbox
    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      correlation_id TEXT,
      ts INTEGER NOT NULL,
      ttl_ms INTEGER NOT NULL,
      payload TEXT NOT NULL,
      consumed_by TEXT
    );

    -- Order Intent Journal (idempotency & crash recovery).
    -- Every live order writes an intent BEFORE the request is sent so a crash
    -- between "order sent" and "position recorded" can be resolved by querying
    -- the exchange with the client_order_id instead of guessing from balances.
    CREATE TABLE IF NOT EXISTS order_intents (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL, -- 'BUY' | 'SELL'
      kind TEXT NOT NULL, -- 'entry' | 'exit' | 'partial_tp' | 'panic' | 'derisk'
      order_type TEXT NOT NULL, -- 'MARKET' | 'LIMIT'
      params_json TEXT NOT NULL,
      position_id TEXT,
      client_order_id TEXT,
      state TEXT NOT NULL DEFAULT 'sent', -- 'sent' | 'ack' | 'resolved' | 'unresolved'
      exchange_order_id TEXT,
      resolved_at INTEGER,
      detail TEXT
    );

    -- High-Performance Secondary Indexes
    CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
    CREATE INDEX IF NOT EXISTS idx_positions_symbol_status ON positions(symbol, status);
    CREATE INDEX IF NOT EXISTS idx_positions_closed_at ON positions(closed_at);
    CREATE INDEX IF NOT EXISTS idx_ghost_positions_status ON ghost_positions(status);
    CREATE INDEX IF NOT EXISTS idx_trades_history_timestamp ON trades_history(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_subagent_logs_timestamp ON subagent_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_lessons_learned_timestamp ON lessons_learned(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_new_coin_alerts_status ON new_coin_alerts(status, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
    CREATE INDEX IF NOT EXISTS idx_gate_logs_ts_sym ON entry_gate_logs(ts DESC, symbol);
    CREATE INDEX IF NOT EXISTS idx_gate_logs_gate ON entry_gate_logs(gate_name, passed);
    CREATE INDEX IF NOT EXISTS idx_ai_calls_ts ON ai_call_logs(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_news_fetched ON news_items(fetched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_news_threat ON news_items(is_threat, fetched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_regime_ts ON regime_log(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_shortlist ON opportunity_shortlist(ts DESC, consumed);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_topic ON agent_messages(topic, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_order_intents_state ON order_intents(state, ts DESC);
  `);

  // Safe migration for existing sqlite database: add oauth_data column if missing
  try {
    db.exec('ALTER TABLE providers ADD COLUMN oauth_data TEXT;');
  } catch {
    // Column already exists
  }

  // Exit claim prevents two concurrent flows (realtime tick, polling, panic sell)
  // from selling the same position twice.
  try {
    db.exec('ALTER TABLE positions ADD COLUMN exit_claimed_at INTEGER;');
  } catch {
    // Column already exists
  }

  try {
    db.exec('ALTER TABLE positions ADD COLUMN realized_pnl_idr REAL NOT NULL DEFAULT 0;');
  } catch {
    // Column already exists
  }

  // Timestamp when the position lost a guaranteed exit plan (sell failure,
  // balance ambiguity). NULL = protected (engine is actively managing an exit).
  try {
    db.exec('ALTER TABLE positions ADD COLUMN unprotected_since INTEGER;');
  } catch {
    // Column already exists
  }

  // Prompt version audit trail: which wording of a prompt produced this call.
  try {
    db.exec('ALTER TABLE ai_call_logs ADD COLUMN prompt_version TEXT;');
  } catch {
    // Column already exists
  }

  // Default configuration settings
  const defaultSettings: Record<string, string> = {
    trading_mode: 'paper', // default safe paper trading mode
    is_auto_trading_active: '0', // Default PAUSED as requested by user
    risk_profile: 'balanced', // 'conservative' | 'balanced' | 'aggressive'
    ai_mode: 'confirm', // 'off' (100% deterministic) | 'confirm' (concise 1x AI check) | 'required' (legacy)
    swarm_event_driven: '1', // '1' (adaptive cadence & context dedup) | '0' (fixed 60s)
    indodax_api_key: '',
    indodax_secret_key: '',
    max_allocation_per_trade_idr: '100000', // Rp 100.000 per trade default
    max_active_trades: '3',
    daily_loss_limit_percent: '5', // 5% daily circuit breaker
    // Indodax market orders are taker orders. Default is the published all-in
    // taker rate (trading fee + VAT + CFX) for IDR pairs; verify your own tier
    // via Indodax -> Account Settings -> Trading Fee and adjust if different.
    trading_fee_percent: '0.3322',
    slippage_tolerance_percent: '0.8',
    trailing_stop_percent: '2.5',
    take_profit_target_1_percent: '5.0',
    allow_new_listings: '1',
    allowed_coins_only: '',
    min_24h_volume_idr: '200000000',
    btc_regime_max_drop_percent: '-4.0',
    subagent_model: '',
    master_model: '',
    whatsapp_model: '',
    whatsapp_admin_number: '',
    whatsapp_admin_lid: '',
    paper_idr_balance: '10000000', // Rp 10.000.000 initial paper trading balance
    deadman_switch_enabled: '1',
    auto_resume_on_startup: '0', // '1' resumes auto-trading after a clean restart/reconciliation
    auto_trading_was_active_before_restart: '0',
    // --- Institutional safety layer (Phase 1 hardening) ---
    max_drawdown_percent: '15', // peak-to-trough equity kill switch; '0' disables
    equity_floor_idr: '0', // absolute equity floor in IDR; '0' disables
    derisk_mode_on_drawdown: 'halt', // 'halt' (stop entries only) | 'halve' (sell 50% each) | 'flatten' (liquidate all)
    max_allocation_percent: '0', // per-trade cap as % of current equity; '0' = use IDR setting only
    price_collar_percent: '1.0', // max acceptable deviation between expected and actual fill price
    exit_floor_limit_enabled: '1', // live exits first place a LIMIT SELL at a floor price (anti-slippage)
    limit_exit_timeout_ms: '3000', // how long the floored limit sell may rest before cancel+market remainder
    require_protective_orders: '1', // block new live entries while any live position lacks an exit plan
    tp1_sell_fraction_percent: '50', // fraction of the position sold at TP1 (100 = full exit, no unprotected remainder)
    drawdown_halt_since: '0', // timestamp when the drawdown kill switch fired; '0' = clear (manual reset via API)
    equity_peak_live: '0', // runtime-tracked peak live equity for drawdown math
    equity_peak_paper: '0', // runtime-tracked peak paper equity for drawdown math
    ngrok_authtoken: '',
    known_pairs_seeded: '0', // '1' after the initial pair universe has been recorded without alerts
    admin_token_rotation_mode: 'fixed', // 'fixed' (default) | 'on_startup' | 'interval'
    admin_token_rotation_interval_value: '1',
    admin_token_rotation_interval_unit: 'days', // 'minutes' | 'hours' | 'days'
    admin_token_last_rotated_at: String(Date.now()),
  };

  const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, value] of Object.entries(defaultSettings)) {
    if (!getStmt.get(key)) {
      setStmt.run(key, value);
    }
  }

  // Encrypt legacy plaintext secrets/providers before any of them are read.
  migrateSecretsAtRest();

  // Ensure random secure admin_access_token exists for security
  const currentToken = getStmt.get('admin_access_token') as { value: string } | undefined;
  if (!currentToken || !currentToken.value) {
    const generatedToken = crypto.randomBytes(16).toString('hex');
    setSetting('admin_access_token', generatedToken);
  }

  // Remember whether auto-trading was active, then always start paused. The
  // server may re-enable it only if auto_resume_on_startup=1 AND reconciliation passes.
  const wasAutoActive = (getStmt.get('is_auto_trading_active') as { value: string } | undefined)?.value || '0';
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('auto_trading_was_active_before_restart', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(wasAutoActive);

  // Ensure is_auto_trading_active is reset to paused on every boot (fail-safe default)
  db.prepare("UPDATE settings SET value = '0' WHERE key = 'is_auto_trading_active'").run();
}

export interface RiskProfileConfig {
  name: string;
  description: string;
  max_allocation_per_trade_idr: string;
  max_active_trades: string;
  trailing_stop_percent: string;
  daily_loss_limit_percent: string;
  slippage_tolerance_percent: string;
  allow_new_listings: string;
  allowed_coins_only: string;
  min_24h_volume_idr: string;
  take_profit_target_1_percent: string;
}

export const RISK_PROFILES: Record<string, RiskProfileConfig> = {
  conservative: {
    name: 'Konservatif',
    description: 'Fokus keamanan modal untuk pemula. Hanya koin likuid terbesar (BTC, ETH, SOL, BNB, XRP), tanpa koin baru listing/memecoin.',
    max_allocation_per_trade_idr: '50000',
    max_active_trades: '2',
    trailing_stop_percent: '1.5',
    daily_loss_limit_percent: '3.0',
    slippage_tolerance_percent: '0.4',
    allow_new_listings: '0',
    allowed_coins_only: 'btc,eth,sol,bnb,xrp',
    min_24h_volume_idr: '1000000000',
    take_profit_target_1_percent: '3.0',
  },
  balanced: {
    name: 'Seimbang',
    description: 'Profil standar seimbang. Mengincar momentum koin likuid dengan trailing stop terukur dan scale-out take-profit.',
    max_allocation_per_trade_idr: '100000',
    max_active_trades: '3',
    trailing_stop_percent: '2.5',
    daily_loss_limit_percent: '5.0',
    slippage_tolerance_percent: '0.8',
    allow_new_listings: '1',
    allowed_coins_only: '',
    min_24h_volume_idr: '200000000',
    take_profit_target_1_percent: '5.0',
  },
  aggressive: {
    name: 'Agresif',
    description: 'Profil agresif untuk menangkap early listing pump & memecoin gainers dengan alokasi dan trailing stop lebih lebar.',
    max_allocation_per_trade_idr: '250000',
    max_active_trades: '5',
    trailing_stop_percent: '3.5',
    daily_loss_limit_percent: '8.0',
    slippage_tolerance_percent: '1.2',
    allow_new_listings: '1',
    allowed_coins_only: '',
    min_24h_volume_idr: '50000000',
    take_profit_target_1_percent: '8.0',
  },
};

export function applyRiskProfile(profileKey: 'conservative' | 'balanced' | 'aggressive'): boolean {
  const config = RISK_PROFILES[profileKey];
  if (!config) return false;

  setSetting('risk_profile', profileKey);
  setSetting('max_allocation_per_trade_idr', config.max_allocation_per_trade_idr);
  setSetting('max_active_trades', config.max_active_trades);
  setSetting('trailing_stop_percent', config.trailing_stop_percent);
  setSetting('daily_loss_limit_percent', config.daily_loss_limit_percent);
  setSetting('slippage_tolerance_percent', config.slippage_tolerance_percent);
  setSetting('allow_new_listings', config.allow_new_listings);
  setSetting('allowed_coins_only', config.allowed_coins_only);
  setSetting('min_24h_volume_idr', config.min_24h_volume_idr);
  setSetting('take_profit_target_1_percent', config.take_profit_target_1_percent);

  return true;
}

export function migrateSecretsAtRest() {
  const migrate = db.transaction(() => {
    const settingRows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const updateSetting = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    for (const row of settingRows) {
      if (!row.value || isEncrypted(row.value) || !isSensitiveSettingKey(row.key)) continue;
      updateSetting.run(encryptSecret(row.value), row.key);
    }

    const providers = db
      .prepare('SELECT id, api_keys, oauth_data FROM providers')
      .all() as Array<{ id: string; api_keys: string | null; oauth_data: string | null }>;
    const updateProvider = db.prepare('UPDATE providers SET api_keys = ?, oauth_data = ? WHERE id = ?');
    for (const provider of providers) {
      const apiKeys = provider.api_keys || '[]';
      const oauth = provider.oauth_data;
      const nextKeys = isEncrypted(apiKeys) ? apiKeys : encryptSecret(apiKeys);
      const nextOAuth = !oauth || isEncrypted(oauth) ? oauth : encryptSecret(oauth);
      if (nextKeys !== provider.api_keys || nextOAuth !== provider.oauth_data) {
        updateProvider.run(nextKeys, nextOAuth, provider.id);
      }
    }
  });

  migrate();
}

export function getSetting(key: string, defaultValue = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return defaultValue;
  return isSensitiveSettingKey(key) ? decryptSecret(row.value) : row.value;
}

export function setSetting(key: string, value: string) {
  const stored = isSensitiveSettingKey(key) ? encryptSecret(value) : value;
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, stored, stored);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = isSensitiveSettingKey(row.key) ? decryptSecret(row.value) : row.value;
  }
  return result;
}

export interface AiAbEvaluationRecord {
  id: string;
  timestamp: number;
  symbol: string;
  candidate_price: number;
  technical_reason: string;
  sentiment_score: number;
  threat_count: number;
  ai_verdict: 'APPROVED' | 'REJECTED';
  ai_reasoning: string | null;
  mode: 'paper' | 'live';
}

export interface GhostPositionRecord {
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

export interface EntryGateLogRecord {
  id: string;
  ts: number;
  symbol: string;
  gate_name: string;
  passed: number;
  values_json: string;
}

export interface AiCallLogRecord {
  id: string;
  ts: number;
  agent: string;
  model: string | null;
  est_input_tokens: number;
  est_output_tokens: number;
  latency_ms: number;
  status: string;
}

export function logEntryGate(
  symbol: string,
  gateName: string,
  passed: boolean,
  values: Record<string, any> = {}
) {
  try {
    const id = `gate_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO entry_gate_logs (id, ts, symbol, gate_name, passed, values_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, Date.now(), symbol.toLowerCase(), gateName, passed ? 1 : 0, JSON.stringify(values));
  } catch (err) {
    // Non-fatal logging
  }
}

export function logAiCall(
  agent: string,
  model: string | null,
  estInputTokens: number,
  estOutputTokens: number,
  latencyMs: number,
  status: string,
  promptVersion?: string
) {
  try {
    const id = `aicall_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO ai_call_logs (id, ts, agent, model, est_input_tokens, est_output_tokens, latency_ms, status, prompt_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, Date.now(), agent, model || 'unknown', estInputTokens, estOutputTokens, latencyMs, status, promptVersion || null);
  } catch (err) {
    // Non-fatal logging
  }
}

export function getEntryGateDiagnostics24h(): {
  totalEvaluated: number;
  gates: Record<string, { passed: number; failed: number }>;
  recentRejections: Array<{ ts: number; symbol: string; gate_name: string; values: any }>;
} {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT gate_name, passed, COUNT(*) as count
    FROM entry_gate_logs
    WHERE ts >= ?
    GROUP BY gate_name, passed
  `).all(since) as Array<{ gate_name: string; passed: number; count: number }>;

  const gates: Record<string, { passed: number; failed: number }> = {};
  let totalEvaluated = 0;

  for (const r of rows) {
    if (!gates[r.gate_name]) gates[r.gate_name] = { passed: 0, failed: 0 };
    if (r.passed === 1) {
      gates[r.gate_name].passed += r.count;
    } else {
      gates[r.gate_name].failed += r.count;
    }
    totalEvaluated += r.count;
  }

  const recentRejectionsRaw = db.prepare(`
    SELECT ts, symbol, gate_name, values_json
    FROM entry_gate_logs
    WHERE passed = 0
    ORDER BY ts DESC
    LIMIT 20
  `).all() as Array<{ ts: number; symbol: string; gate_name: string; values_json: string }>;

  const recentRejections = recentRejectionsRaw.map((r) => {
    let parsedValues = {};
    try {
      parsedValues = JSON.parse(r.values_json || '{}');
    } catch {}
    return {
      ts: r.ts,
      symbol: r.symbol,
      gate_name: r.gate_name,
      values: parsedValues,
    };
  });

  return { totalEvaluated, gates, recentRejections };
}

export function getAiCallStats24h(): {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgLatencyMs: number;
  byAgent: Record<string, { calls: number; inputTokens: number; outputTokens: number }>;
  byStatus: Record<string, number>;
} {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT agent, status, est_input_tokens, est_output_tokens, latency_ms
    FROM ai_call_logs
    WHERE ts >= ?
  `).all(since) as Array<{ agent: string; status: string; est_input_tokens: number; est_output_tokens: number; latency_ms: number }>;

  let totalCalls = rows.length;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalLatency = 0;
  const byAgent: Record<string, { calls: number; inputTokens: number; outputTokens: number }> = {};
  const byStatus: Record<string, number> = {};

  for (const r of rows) {
    totalInputTokens += r.est_input_tokens;
    totalOutputTokens += r.est_output_tokens;
    totalLatency += r.latency_ms;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;

    if (!byAgent[r.agent]) {
      byAgent[r.agent] = { calls: 0, inputTokens: 0, outputTokens: 0 };
    }
    byAgent[r.agent].calls++;
    byAgent[r.agent].inputTokens += r.est_input_tokens;
    byAgent[r.agent].outputTokens += r.est_output_tokens;
  }

  return {
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    avgLatencyMs: totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0,
    byAgent,
    byStatus,
  };
}

// Schema must exist before any module creates prepared statements at import time.
initDatabase();

