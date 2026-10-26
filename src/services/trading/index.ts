import { db, getSetting, setSetting, logEntryGate, GhostPositionRecord, AiAbEvaluationRecord } from '../../db/index.js';
import { indodax, IndodaxPair, IndodaxSummaryTicker, IndodaxDepth } from '../indodax/index.js';
import { indodaxMarketStream } from '../indodax/marketStream.js';
import { agentSwarm } from '../agents/index.js';
import { aiClient } from '../ai/index.js';
import { calculateRSI, calculateEMA, calculateTrueATR } from '../../utils/indicators.js';
import {
  detectBtcRegime,
  extractFeatures,
  scoreOpportunity,
  SCORE_THRESHOLDS,
  RegimeVerdict,
  CoinFeatures,
  ScoreResult,
  MarketSummary,
} from '../signals/index.js';
import {
  checkExposure,
  checkBtcRegime,
  checkThreatScope,
  checkSlippageBudget,
  checkSpreadTrap,
  checkRsiGuard,
  checkMaxDrawdown,
  capAllocationByEquityPercent,
  GateResult,
} from './riskGuard.js';
import { agentBus } from '../agents/bus.js';
import { getTakerFeeRate } from './fees.js';
import { allowsDeterministicFallback } from './aiPolicy.js';

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
    ai_verdict: string;
    ai_reasoning: string;
    mode: string;
    ghost_status?: string | null;
    ghost_outcome?: string | null;
    ghost_pnl_percent?: number | null;
    ghost_pnl_idr?: number | null;
  }>;

  activeGhosts: GhostPositionRecord[];
}

export interface PositionRecord {
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
  realized_pnl_idr?: number;
  exit_reason: string | null;
  mode: 'paper' | 'live';
  exit_claimed_at?: number | null;
  unprotected_since?: number | null;
}

export interface EquitySnapshot {
  mode: 'paper' | 'live';
  cashIdr: number;
  cashFreeIdr: number;
  cashLockedIdr: number;
  holdingsValueIdr: number;
  equityIdr: number;
  floatingPnlIdr: number;
  openPositions: number;
}

const POSITION_BUSY = Symbol('position-busy');
const ENTRY_LOCK_KEY = '__entry__';

interface SellExecutionResult {
  ok: boolean;
  filledAmount: number;
  proceedsIdr: number;
  averagePrice: number;
  fullyFilled: boolean;
  pendingReview: boolean;
  historyRecorded: boolean;
}

const failedSell = (pendingReview = false): SellExecutionResult => ({
  ok: false,
  filledAmount: 0,
  proceedsIdr: 0,
  averagePrice: 0,
  fullyFilled: false,
  pendingReview,
  historyRecorded: false,
});

/**
 * Net unrealized PnL on the remaining position: exit fee is deducted and the
 * entry fee is allocated to the remaining cost basis. Realized partial-exit
 * PnL lives in positions.realized_pnl_idr and is added separately.
 */
function markToMarket(
  pos: Pick<PositionRecord, 'entry_price' | 'amount' | 'initial_cost_idr'>,
  currentPrice: number,
  feeRate: number
): { pnlIdr: number; pnlPercent: number } {
  const remainingCost = pos.initial_cost_idr > 0 ? pos.initial_cost_idr : pos.entry_price * pos.amount;
  const costWithFee = remainingCost * (1 + feeRate);
  const liquidationValue = currentPrice * pos.amount * (1 - feeRate);
  const pnlIdr = liquidationValue - costWithFee;
  const pnlPercent = costWithFee > 0 ? (pnlIdr / costWithFee) * 100 : 0;
  return { pnlIdr, pnlPercent };
}

export class TradingEngine {
  private isRunning = false;
  private isProcessing = false; // In-flight guard
  private loopTimer: NodeJS.Timeout | null = null;
  private onTradeEventCallback?: (event: { type: 'BUY' | 'SELL' | 'ALERT'; data: any }) => void;
  private positionLocks = new Map<string, Promise<void>>();
  private openSymbolsSet = new Set<string>();
  private lastPruneTimestamp = 0;
  private lastEquityFailureAlertAt = 0;
  private lastUnprotectedAlertAt = 0;

  // Hoisted prepared statements to avoid SQL parsing overhead per realtime tick
  private stmtGetOpenPosByPair = db.prepare(`
    SELECT * FROM positions
    WHERE status = 'open' AND exit_claimed_at IS NULL
      AND LOWER(REPLACE(REPLACE(symbol, '/', ''), '_', '')) = ?
  `);
  private stmtUpdatePosTick = db.prepare(`
    UPDATE positions SET
      current_price = ?,
      highest_price = ?,
      trailing_stop_price = ?,
      pnl_idr = ?,
      pnl_percent = ?
    WHERE id = ? AND status = 'open' AND exit_claimed_at IS NULL
  `);
  private stmtUpdatePosTp1 = db.prepare(`
    UPDATE positions SET
      amount = ?,
      initial_cost_idr = ?,
      current_price = ?,
      highest_price = ?,
      trailing_stop_price = ?,
      take_profit_step = 1,
      pnl_idr = ?,
      pnl_percent = ?,
      realized_pnl_idr = COALESCE(realized_pnl_idr, 0) + ?,
      exit_claimed_at = NULL
    WHERE id = ? AND status = 'open'
  `);
  private stmtCountOpenPositionsByMode = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'open' AND mode = ?");

  constructor() {
    // Initial consumer on Agent Bus: listens for opportunity signals from scouts/scanners
    agentBus.subscribe('opportunity.signal', (msg) => {
      // Future expansion / audit consumer
    });
  }

  public setTradeCallback(cb: (event: { type: 'BUY' | 'SELL' | 'ALERT'; data: any }) => void) {
    this.onTradeEventCallback = cb;
  }

  public refreshOpenSymbols() {
    try {
      const rows = db.prepare("SELECT symbol FROM positions WHERE status = 'open'").all() as Array<{ symbol: string }>;
      this.openSymbolsSet.clear();
      for (const row of rows) {
        const clean = row.symbol.toLowerCase().replace('/', '').replace('_', '');
        this.openSymbolsSet.add(clean);
      }
    } catch {}
  }

  public start(intervalMs = 15000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.refreshOpenSymbols();
    this.runLoop();
    this.loopTimer = setInterval(() => this.runLoop(), intervalMs);
    console.log('[Trading Engine] Berjalan secara otomatis.');
  }

  public stop() {
    this.isRunning = false;
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  /**
   * Startup safety check. Live mode compares database positions against the
   * exchange account/balances and blocks auto-resume when state is ambiguous.
   */
  public async reconcileOnStartup(): Promise<{ safeToResume: boolean; issues: string[] }> {
    const issues: string[] = [];
    const mode = getSetting('trading_mode', 'paper');

    if (mode !== 'live') {
      // Paper exits are synchronous; a leftover claim can only be a crash artifact.
      db.prepare("UPDATE positions SET exit_claimed_at = NULL WHERE status = 'open' AND mode = 'paper'").run();
      const liveOpen = db.prepare("SELECT COUNT(*) AS c FROM positions WHERE status = 'open' AND mode = 'live'").get() as { c: number };
      if (liveOpen.c > 0) {
        issues.push(`${liveOpen.c} posisi LIVE masih terbuka meskipun mode saat ini paper. Posisi tetap dipantau oleh engine.`);
      }
      return { safeToResume: true, issues };
    }

    const apiKey = getSetting('indodax_api_key', '');
    const secretKey = getSetting('indodax_secret_key', '');
    if (!apiKey || !secretKey) {
      return { safeToResume: false, issues: ['Mode live aktif tetapi Indodax API key/secret belum dikonfigurasi.'] };
    }

    try {
      const account = await indodax.getAccountInfo();
      const balanceMap = new Map<string, number>();
      for (const balance of account.balances || []) {
        const asset = String(balance.asset || '').toUpperCase();
        if (!asset) continue;
        const amount = (parseFloat(balance.free) || 0) + (parseFloat(balance.locked) || 0);
        balanceMap.set(asset, (balanceMap.get(asset) || 0) + amount);
      }

      const openOrders = await indodax.getOpenOrders();
      if (Array.isArray(openOrders) && openOrders.length > 0) {
        issues.push(`${openOrders.length} open order masih aktif di bursa. Auto-resume diblokir sampai order ditinjau.`);
      }

      // Resolve order intents orphaned by a crash between send and record
      const intentRecovery = await this.reconcileUnresolvedIntents();
      for (const intentIssue of intentRecovery.issues) {
        issues.push(`[Order Intent] ${intentIssue}`);
      }

      // Resolve stale exit claims created by a crash mid-exit
      const claimed = db.prepare("SELECT * FROM positions WHERE status = 'open' AND exit_claimed_at IS NOT NULL").all() as PositionRecord[];
      for (const pos of claimed) {
        const available = this.getExchangeBaseBalance(balanceMap, pos);
        if (available >= pos.amount * 0.98) {
          db.prepare("UPDATE positions SET exit_claimed_at = NULL WHERE id = ? AND status = 'open'").run(pos.id);
          console.log(`[Reconciliation] Claim keluar basi dilepas untuk ${pos.symbol.toUpperCase()} (koin masih ada di bursa).`);
        } else {
          issues.push(`Posisi ${pos.symbol.toUpperCase()} memiliki claim keluar basi dan saldo bursa (${available}) < jumlah DB (${pos.amount}). Periksa manual.`);
        }
      }

      // Align live position amounts with the actual exchange balance
      const livePositions = db.prepare("SELECT * FROM positions WHERE status = 'open' AND mode = 'live'").all() as PositionRecord[];
      for (const pos of livePositions) {
        if (pos.exit_claimed_at) continue;
        const available = this.getExchangeBaseBalance(balanceMap, pos);

        if (available <= 0) {
          this.markPositionUnprotected(pos.id, 'Saldo koin tidak ditemukan di bursa saat rekonsiliasi startup');
          issues.push(`Saldo ${pos.traded_currency.toUpperCase()} tidak ditemukan di bursa untuk posisi ${pos.symbol.toUpperCase()}. Mungkin sudah dijual manual atau tertahan order pending.`);
          continue;
        }

        if (available < pos.amount * 0.98) {
          const correctedCost = pos.initial_cost_idr * (available / pos.amount);
          db.prepare("UPDATE positions SET amount = ?, initial_cost_idr = ? WHERE id = ? AND status = 'open'").run(
            available,
            correctedCost,
            pos.id
          );
          if (available * pos.current_price < indodax.getMinTradeIdr(pos.symbol)) {
            this.markPositionUnprotected(pos.id, `Sisa saldo ${available} di bawah minimum order setelah koreksi`);
          }
          issues.push(`Jumlah posisi ${pos.symbol.toUpperCase()} dikoreksi dari ${pos.amount} ke ${available} mengikuti saldo bursa.`);
        } else if (available > pos.amount * 1.02) {
          console.warn(`[Reconciliation] Saldo ${pos.symbol.toUpperCase()} di bursa (${available}) lebih besar dari catatan posisi (${pos.amount}). Mungkin ada pembelian manual yang belum tercatat.`);
        }
      }

      // Exchange and database now agree: any earlier unprotected flag from a
      // transient condition (e.g. a sell that actually landed) is cleared.
      if (issues.length === 0) {
        const staleUnprotected = db.prepare(
          "SELECT id, symbol FROM positions WHERE status = 'open' AND mode = 'live' AND unprotected_since IS NOT NULL"
        ).all() as Array<{ id: string; symbol: string }>;
        for (const pos of staleUnprotected) {
          this.clearPositionUnprotected(pos.id);
          console.log(`[Reconciliation] Posisi ${pos.symbol.toUpperCase()} kembali terlindungi (state bursa konsisten).`);
        }
      }

      if (issues.length > 0) {
        setSetting('is_auto_trading_active', '0');
        return { safeToResume: false, issues };
      }

      console.log('[Reconciliation] State bursa dan database konsisten.');
      return { safeToResume: true, issues };
    } catch (err: any) {
      setSetting('is_auto_trading_active', '0');
      return { safeToResume: false, issues: [`Rekonsiliasi bursa gagal: ${err?.message || err}`] };
    }
  }

  private getExchangeBaseBalance(balanceMap: Map<string, number>, pos: PositionRecord): number {
    const candidates = [
      pos.traded_currency?.toUpperCase(),
      pos.symbol.toUpperCase().replace(/(IDR|USDT)$/, ''),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (balanceMap.has(candidate)) return balanceMap.get(candidate) || 0;
    }
    return 0;
  }

  /**
   * Serializes every mutation of a position (realtime tick, polling, panic/manual sell).
   * Realtime ticks use the non-blocking variant so a slow exit never queues stale ticks.
   */
  private async withPositionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.positionLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.positionLocks.set(id, tail);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.positionLocks.get(id) === tail) {
        this.positionLocks.delete(id);
      }
    }
  }

  private async tryWithPositionLock<T>(id: string, fn: () => Promise<T>): Promise<T | typeof POSITION_BUSY> {
    if (this.positionLocks.has(id)) return POSITION_BUSY;
    return this.withPositionLock(id, fn);
  }

  private getOpenPosition(id: string): PositionRecord | undefined {
    return db.prepare("SELECT * FROM positions WHERE id = ? AND status = 'open'").get(id) as
      | PositionRecord
      | undefined;
  }

  /**
   * Atomically reserves a position for an exit/partial-exit. Returns null when another
   * flow already owns it or it is no longer open.
   */
  private claimPositionForExit(id: string): PositionRecord | null {
    const result = db
      .prepare(
        "UPDATE positions SET exit_claimed_at = ? WHERE id = ? AND status = 'open' AND exit_claimed_at IS NULL"
      )
      .run(Date.now(), id);
    if (result.changes !== 1) return null;
    return db.prepare('SELECT * FROM positions WHERE id = ?').get(id) as PositionRecord;
  }

  private releasePositionClaim(id: string) {
    db.prepare("UPDATE positions SET exit_claimed_at = NULL WHERE id = ? AND status = 'open'").run(id);
  }

  /**
   * Flags a live position as lacking a guaranteed exit plan (dust remainder,
   * sell failure, balance ambiguity). While any live position is flagged and
   * require_protective_orders=1, the engine refuses to open new positions.
   */
  private markPositionUnprotected(id: string, reason: string) {
    try {
      db.prepare("UPDATE positions SET unprotected_since = ? WHERE id = ? AND status = 'open' AND unprotected_since IS NULL").run(
        Date.now(),
        id
      );
      const row = db.prepare('SELECT symbol, unprotected_since FROM positions WHERE id = ?').get(id) as any;
      if (row?.unprotected_since) {
        console.warn(`[Exit Guard] Posisi ${String(row.symbol).toUpperCase()} ditandai TANPA exit plan: ${reason}`);
      }
    } catch {}
  }

  private clearPositionUnprotected(id: string) {
    try {
      db.prepare("UPDATE positions SET unprotected_since = NULL WHERE id = ?").run(id);
    } catch {}
  }

  // --- Order Intent Journal (idempotency & crash recovery) ---

  /**
   * Writes an intent row BEFORE the order request leaves the process and
   * derives a durable clientOrderId from it. The official Indodax Trade API v2
   * accepts a 36-char `newClientOrderId` and supports lookup via
   * `origClientOrderId`, so a crash between send and DB-write is recoverable
   * by querying the exchange with this id instead of guessing from balances.
   */
  private recordOrderIntent(
    kind: 'entry' | 'exit' | 'partial_tp' | 'panic' | 'derisk',
    symbol: string,
    side: 'BUY' | 'SELL',
    orderType: 'MARKET' | 'LIMIT',
    params: Record<string, any>,
    positionId?: string
  ): { localId: string; clientOrderId: string } {
    const localId = `oi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // alphanumeric + _ - only, max 36 chars (official v2 constraint)
    const clientOrderId = `itd${kind.slice(0, 3)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 36);
    try {
      db.prepare(`
        INSERT INTO order_intents (id, ts, symbol, side, kind, order_type, params_json, position_id, client_order_id, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')
      `).run(
        localId,
        Date.now(),
        symbol.toLowerCase(),
        side,
        kind,
        orderType,
        JSON.stringify(params),
        positionId || null,
        clientOrderId
      );
    } catch (err: any) {
      // Journaling must never block trading; the clientOrderId still travels
      // with the order so the exchange itself can be queried afterwards.
      console.warn(`[Order Intent] Gagal mencatat intent: ${err?.message}`);
    }
    return { localId, clientOrderId };
  }

  private ackOrderIntent(localId: string, exchangeOrderId: string, clientOrderId?: string) {
    try {
      db.prepare("UPDATE order_intents SET state = 'ack', exchange_order_id = ? WHERE id = ?").run(
        String(exchangeOrderId || ''),
        localId
      );
    } catch {}
    if (clientOrderId && !exchangeOrderId) {
      console.warn(`[Order Intent] ${localId} ack tanpa orderId bursa; pemulihan memakai clientOrderId ${clientOrderId}.`);
    }
  }

  private resolveOrderIntent(localId: string, detail?: string) {
    try {
      db.prepare("UPDATE order_intents SET state = 'resolved', resolved_at = ?, detail = COALESCE(?, detail) WHERE id = ?").run(
        Date.now(),
        detail || null,
        localId
      );
    } catch {}
  }

  private failOrderIntent(localId: string, error: string) {
    try {
      db.prepare("UPDATE order_intents SET state = 'unresolved', detail = ? WHERE id = ? AND state != 'resolved'").run(
        error.slice(0, 500),
        localId
      );
    } catch {}
  }

  /**
   * Resolves journal rows stuck in 'sent'/'ack' (a crash happened between
   * sending and recording the fill). Each unresolved row is queried on the
   * exchange by its clientOrderId. `requiresHalt` is true when a finding
   * implies the database may disagree with the exchange (a filled order that
   * was never recorded, or an order we failed to cancel) — auto-trading must
   * pause until that is resolved. Transient query failures do NOT halt.
   */
  public async reconcileUnresolvedIntents(maxAgeMs = 60_000): Promise<{ issues: string[]; requiresHalt: boolean }> {
    const issues: string[] = [];
    let requiresHalt = false;
    let rows: Array<{
      id: string;
      ts: number;
      symbol: string;
      side: string;
      kind: string;
      client_order_id: string | null;
      state: string;
      exchange_order_id: string | null;
    }> = [];
    try {
      rows = db.prepare(`
        SELECT id, ts, symbol, side, kind, client_order_id, state, exchange_order_id
        FROM order_intents
        WHERE state IN ('sent', 'ack') AND ts < ?
        ORDER BY ts ASC
        LIMIT 25
      `).all(Date.now() - maxAgeMs) as any[];
    } catch {
      return { issues, requiresHalt };
    }

    const liveMode = getSetting('trading_mode', 'paper') === 'live';
    if (!liveMode) {
      // Paper intents never reach an exchange; nothing to recover.
      for (const row of rows) this.resolveOrderIntent(row.id, 'paper mode cleanup');
      return { issues, requiresHalt };
    }

    for (const row of rows) {
      try {
        if (row.state === 'sent' && !row.client_order_id) {
          this.failOrderIntent(row.id, 'intent tanpa clientOrderId (sebelum upgrade jurnal)');
          issues.push(`Order intent ${row.id} (${row.kind} ${row.symbol.toUpperCase()}) tidak dapat dilacak. Periksa riwayat order manual di Indodax.`);
          requiresHalt = true;
          continue;
        }

        const raw = await indodax.getOrderByClientOrderId(row.symbol, row.client_order_id!);
        const fill = indodax.extractOrderFill(raw, {});
        const status = fill.status.toUpperCase();

        if (fill.executedQty > 0 || status === 'FILLED') {
          this.resolveOrderIntent(row.id, `Recovered via clientOrderId: ${status}, executedQty=${fill.executedQty}`);
          issues.push(
            `Order intent ${row.id} (${row.kind} ${row.side} ${row.symbol.toUpperCase()}) TERNYATA TERISI di bursa (${fill.executedQty} @ ~Rp ${Math.round(fill.averagePrice).toLocaleString('id-ID')}) tetapi tidak sempat dicatat. Verifikasi posisi/saldo.`
          );
          requiresHalt = true;
        } else if (['CANCELED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(status)) {
          this.resolveOrderIntent(row.id, `Recovered via clientOrderId: ${status}`);
        } else if (status === 'NEW' || status === 'OPEN' || status === 'PARTIALLY_FILLED') {
          // Still resting on the exchange. The engine does not manage orders it
          // cannot see in the positions table: cancel it to avoid an orphan.
          try {
            if (row.exchange_order_id) {
              await indodax.cancelOrder(row.symbol, row.exchange_order_id);
              this.resolveOrderIntent(row.id, `Order resting dibatalkan saat pemulihan (${status})`);
              issues.push(`Order intent ${row.id} (${row.kind} ${row.symbol.toUpperCase()}) masih resting di bursa dan telah dibatalkan.`);
            } else {
              this.failOrderIntent(row.id, `Masih resting (${status}) tanpa exchange_order_id`);
              issues.push(`Order intent ${row.id} (${row.kind} ${row.symbol.toUpperCase()}) masih resting di bursa tanpa orderId. Periksa manual.`);
              requiresHalt = true;
            }
          } catch (cancelErr: any) {
            this.failOrderIntent(row.id, `Gagal membatalkan order resting: ${cancelErr?.message}`);
            issues.push(`Order intent ${row.id} (${row.kind} ${row.symbol.toUpperCase()}) resting di bursa dan gagal dibatalkan: ${cancelErr?.message}`);
            requiresHalt = true;
          }
        } else if (!status || status === 'UNKNOWN') {
          // extractOrderFill normalizes a missing status to 'UNKNOWN'; the v2
          // API always returns a status for orders that exist, so an unknown
          // order never reached the exchange.
          this.failOrderIntent(row.id, 'Order tidak ditemukan di bursa (kemungkinan gagal terkirim)');
        } else {
          this.resolveOrderIntent(row.id, `Recovered status: ${status}`);
        }
      } catch (err: any) {
        // Transient query failure: leave the row for the next cycle. This must
        // NOT halt trading — the next loop retries the lookup.
        issues.push(`Order intent ${row.id} belum terkonfirmasi (akan dicoba ulang): ${err?.message}`);
      }
    }

    return { issues, requiresHalt };
  }

  /**
   * Pemrosesan Tick Real-Time Sub-Detik dari Indodax WebSocket:
   * Menggeser trailing stop naik seketika saat harga melonjak,
   * dan mengeksekusi trailing stop keluar dalam milidetik tanpa menunggu polling timer 15 detik!
   */
  public async handleRealtimeTick(tick: { pair: string; price: number; volume: number; timestamp: number }) {
    if (!tick || !tick.price || tick.price <= 0) return;
    const cleanPair = tick.pair.toLowerCase().replace('/', '').replace('_', '');

    // High performance in-memory check to avoid database polling on every tick
    if (this.openSymbolsSet.size > 0 && !this.openSymbolsSet.has(cleanPair)) return;

    try {
      const openPos = this.stmtGetOpenPosByPair.get(cleanPair) as PositionRecord | undefined;

      if (!openPos) {
        this.openSymbolsSet.delete(cleanPair);
        return;
      }

      await this.tryWithPositionLock(openPos.id, async () => {
        const pos = this.getOpenPosition(openPos.id);
        if (!pos || pos.exit_claimed_at) {
          if (!pos) this.openSymbolsSet.delete(cleanPair);
          return;
        }

        const currentPrice = tick.price;
        const trailingStopPercent = parseFloat(getSetting('trailing_stop_percent', '2.5'));
        const targetTp1 = parseFloat(getSetting('take_profit_target_1_percent', '5.0'));

        const highestPrice = Math.max(pos.highest_price, currentPrice);
        let trailingStopPrice = pos.trailing_stop_price;

        // Ratchet Trailing Stop up (with post-TP1 decoupling)
        const computedTrailingStop = highestPrice * (1 - trailingStopPercent / 100);
        if (pos.take_profit_step >= 1) {
          const postTpFloor = Math.max(pos.entry_price, computedTrailingStop);
          if (postTpFloor > trailingStopPrice) {
            trailingStopPrice = postTpFloor;
          }
        } else if (computedTrailingStop > trailingStopPrice) {
          trailingStopPrice = computedTrailingStop;
        }

        const feeRate = getTakerFeeRate();
        const grossPnlPercent = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
        const { pnlIdr, pnlPercent } = markToMarket(pos, currentPrice, feeRate);

        // Sub-second Partial TP check (threshold is a gross price move)
        if (grossPnlPercent >= targetTp1 && pos.take_profit_step === 0) {
          await this.executePartialTakeProfit(pos, currentPrice, targetTp1);
          return;
        }

        // Sub-second Trailing Stop Loss check
        if (currentPrice <= trailingStopPrice) {
          // Mark Price / Orderbook Confirmation Filter to prevent flash wick manipulation
          let confirmedExit = true;
          try {
            const depth = await indodax.getDepth(pos.symbol);
            const bestBid = depth.buy && depth.buy[0] ? parseFloat(depth.buy[0][0]) : 0;
            if (bestBid > trailingStopPrice * 1.015) {
              console.log(`[Flash Wick Guard] Mengabaikan tick wick ${pos.symbol} (Tick: Rp ${currentPrice.toLocaleString('id-ID')}, Best Bid: Rp ${bestBid.toLocaleString('id-ID')}). Trailing stop ditahan.`);
              confirmedExit = false;
            }
          } catch {
            // Default to confirm if depth unreachable
          }

          if (confirmedExit) {
            const exitReason = `⚡ Realtime Trailing Stop Loss tersentuh di Rp ${trailingStopPrice.toLocaleString('id-ID')} (PnL: ${pnlPercent.toFixed(2)}%)`;
            await this.closePositionUnlocked(pos, currentPrice, exitReason, { floorPrice: trailingStopPrice });
          }
          return;
        }

        // Update highest price & trailing stop in database if price advanced
        if (highestPrice > pos.highest_price || trailingStopPrice > pos.trailing_stop_price) {
          this.stmtUpdatePosTick.run(currentPrice, highestPrice, trailingStopPrice, pnlIdr, pnlPercent, pos.id);
        }
      });
    } catch (err: any) {
      console.warn(`[handleRealtimeTick Error] ${tick.pair}:`, err.message);
    }
  }

  // --- Main Autonomous Engine Loop ---

  public async runLoop() {
    if (this.isProcessing) return; // In-flight guard prevents overlapping loops
    this.isProcessing = true;

    try {
      // 0. Periodic data maintenance (once per 24 hours)
      const now = Date.now();
      if (now - this.lastPruneTimestamp > 24 * 3600 * 1000) {
        this.pruneOldData();
        this.lastPruneTimestamp = now;
      }

      // 1. Ping Indodax Deadman Switch Heartbeat covering ALL active open positions
      const openPositions = db.prepare("SELECT symbol FROM positions WHERE status = 'open'").all() as Array<{ symbol: string }>;
      const openSymbols = openPositions.map(p => p.symbol);
      const pairsToProtect = Array.from(new Set(['btc_idr', ...openSymbols]));
      await indodax.pingDeadmanSwitch(pairsToProtect);

      // 2. CRITICAL PROTECTION: ALWAYS monitor and manage active open positions (Dynamic Exit / Trailing SL)
      // Even if circuit breaker is triggered or auto-trading is paused, open positions MUST be protected!
      await this.manageOpenPositions();

      // 2.5. Monitor and manage ghost positions (A/B Counterfactual Shadow Trades)
      await this.manageGhostPositions();

      // 2.6. Recover order intents orphaned by a crash between "order sent"
      // and "fill recorded". A critical finding pauses auto-trading.
      try {
        const intentRecovery = await this.reconcileUnresolvedIntents();
        for (const issue of intentRecovery.issues) {
          console.warn(`[Order Intent Recovery] ${issue}`);
        }
        if (intentRecovery.requiresHalt) {
          setSetting('is_auto_trading_active', '0');
          if (this.onTradeEventCallback) {
            this.onTradeEventCallback({
              type: 'ALERT',
              data: {
                title: 'Order Intent Recovery: Auto-Trading Dijeda',
                message: `Ada order yang tidak sinkron dengan database (kemungkinan terisi di bursa saat crash). Auto-trading dijeda. Detail di log server. Verifikasi posisi lalu aktifkan kembali.`,
              },
            });
          }
        }
      } catch {}

      // 3. New Entry Gates: Check if Auto-Trading is active
      const isAutoActive = getSetting('is_auto_trading_active', '0') === '1';
      if (!isAutoActive) return;

      // 4. Check Circuit Breaker (Halts NEW entries for 24h if loss limit exceeded)
      if (await this.checkDailyCircuitBreaker()) {
        console.log('[Circuit Breaker] Menahan pembukaan posisi baru karena batas rugi harian tercapai.');
        return;
      }

      // 5. Scan Market for New Opportunities (New Listings, Memecoins, Major Momentum)
      await this.scanAndExecuteEntries();
    } catch (err: any) {
      console.error('[Trading Engine Error]', err.message);
    } finally {
      this.isProcessing = false;
    }
  }

  // --- Manage Open Positions (Dynamic Exit - NO FIXED TIME) ---

  private async manageOpenPositions() {
    const positions = db.prepare("SELECT * FROM positions WHERE status = 'open'").all() as PositionRecord[];
    if (positions.length === 0) return;

    const trailingStopPercent = parseFloat(getSetting('trailing_stop_percent', '2.5'));
    const targetTp1 = parseFloat(getSetting('take_profit_target_1_percent', '5.0'));
    const { coinSentiments } = agentSwarm.getAggregatedSentiment();

    for (const snapshot of positions) {
      try {
        let currentPrice = 0;
        try {
          const tickerData = await indodax.getTicker(snapshot.symbol);
          if (tickerData?.ticker?.last) {
            currentPrice = parseFloat(tickerData.ticker.last);
          }
        } catch {
          currentPrice = 0;
        }

        if (!currentPrice || currentPrice <= 0) continue;

        await this.withPositionLock(snapshot.id, async () => {
          // Re-read inside the lock: a realtime tick or manual sell may have closed it
          // while the ticker request was in flight.
          const pos = this.getOpenPosition(snapshot.id);
          if (!pos || pos.exit_claimed_at) return;

          const highestPrice = Math.max(pos.highest_price, currentPrice);
          let trailingStopPrice = pos.trailing_stop_price;

          // Recalculate dynamic trailing stop level (with post-TP1 decoupling)
          const computedTrailingStop = highestPrice * (1 - trailingStopPercent / 100);
          if (pos.take_profit_step >= 1) {
            const postTpFloor = Math.max(pos.entry_price, computedTrailingStop);
            if (postTpFloor > trailingStopPrice) {
              trailingStopPrice = postTpFloor;
            }
          } else if (computedTrailingStop > trailingStopPrice) {
            trailingStopPrice = computedTrailingStop;
          }

          const feeRate = getTakerFeeRate();
          const grossPnlPercent = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
          const { pnlIdr, pnlPercent } = markToMarket(pos, currentPrice, feeRate);

          // Scale-Out Partial Take-Profit (Target 1 threshold reached)
          if (grossPnlPercent >= targetTp1 && pos.take_profit_step === 0) {
            const sellOk = await this.executePartialTakeProfit(pos, currentPrice, targetTp1);
            if (!sellOk) {
              console.warn(`[Partial TP Aborted] Order jual parsial gagal atau posisi sudah diproses untuk ${pos.symbol}.`);
            }
            return;
          }

          // Check Dynamic Exit Conditions
          let shouldExit = false;
          let exitReason = '';

          // 1. Trailing Stop Loss hit
          if (currentPrice <= trailingStopPrice) {
            shouldExit = true;
            exitReason = `Trailing Stop Loss tersentuh di Rp ${trailingStopPrice.toLocaleString('id-ID')} (PnL: ${pnlPercent.toFixed(2)}%)`;
          }

          // 2. Sudden negative sentiment or security threat detected by subagents
          const tokenSymbol = pos.traded_currency.toUpperCase();
          const tokenSentiment = coinSentiments[tokenSymbol];
          if (tokenSentiment !== undefined && tokenSentiment < -0.35) {
            shouldExit = true;
            exitReason = `Pembalikan sentimen negatif terdeteksi oleh Subagents (${tokenSentiment})`;
          }

          if (shouldExit) {
            // Trailing-stop exits protect the stop level as a floor; sentiment
            // exits use the collar default (price minus price_collar_percent).
            await this.closePositionUnlocked(pos, currentPrice, exitReason, {
              floorPrice: exitReason.startsWith('Trailing Stop Loss') ? trailingStopPrice : undefined,
            });
          } else {
            // Update position telemetry
            this.stmtUpdatePosTick.run(currentPrice, highestPrice, trailingStopPrice, pnlIdr, pnlPercent, pos.id);
          }
        });
      } catch (err: any) {
        console.warn(`[Position Manager] Gagal memantau posisi ${snapshot.symbol}:`, err.message);
      }
    }
  }

  // --- Manage Ghost Positions (Counterfactual Shadow Trades for A/B Alpha Validation) ---

  public async manageGhostPositions() {
    const ghostPositions = db.prepare("SELECT * FROM ghost_positions WHERE status = 'open'").all() as GhostPositionRecord[];
    if (ghostPositions.length === 0) return;

    const trailingStopPercent = parseFloat(getSetting('trailing_stop_percent', '2.5'));
    const targetTp1 = parseFloat(getSetting('take_profit_target_1_percent', '5.0'));

    let summaries: { tickers: Record<string, IndodaxSummaryTicker> } | null = null;
    try {
      summaries = await indodax.getSummaries();
    } catch {}

    const updates: Array<{ isClosed: boolean; params: any[] }> = [];

    for (const ghost of ghostPositions) {
      try {
        let currentPrice = 0;
        const cleanSymbol = ghost.symbol.toLowerCase().replace('/', '').replace('_', '');
        const summaryTicker = summaries?.tickers?.[`${cleanSymbol}_idr`] || summaries?.tickers?.[cleanSymbol];
        if (summaryTicker && summaryTicker.last) {
          currentPrice = parseFloat(summaryTicker.last);
        } else {
          try {
            const tickerData = await indodax.getTicker(ghost.symbol);
            if (tickerData?.ticker?.last) {
              currentPrice = parseFloat(tickerData.ticker.last);
            }
          } catch {
            currentPrice = 0;
          }
        }

        if (!currentPrice || currentPrice <= 0) {
          // If this is a test or mock symbol left in the database, close it gracefully to avoid log spam
          if (ghost.symbol.toLowerCase().startsWith('test') || ghost.symbol.toLowerCase().includes('mock')) {
            db.prepare("UPDATE ghost_positions SET status = 'closed', exit_reason = 'Test pair cleaned up', closed_at = ? WHERE id = ?").run(Date.now(), ghost.id);
            console.log(`[Ghost Manager] Membersihkan ghost position uji coba: ${ghost.symbol}`);
          }
          continue;
        }

        let highestPrice = Math.max(ghost.highest_price, currentPrice);
        let trailingStopPrice = ghost.trailing_stop_price;
        let takeProfitStep = ghost.take_profit_step;

        // Recalculate trailing stop ratchet
        const computedTrailingStop = highestPrice * (1 - trailingStopPercent / 100);
        if (computedTrailingStop > trailingStopPrice) {
          trailingStopPrice = computedTrailingStop;
        }

        // Scale-out TP1 ratchet to breakeven
        const grossPnlPercent = ((currentPrice - ghost.entry_price) / ghost.entry_price) * 100;
        if (grossPnlPercent >= targetTp1 && takeProfitStep === 0) {
          trailingStopPrice = Math.max(trailingStopPrice, ghost.entry_price);
          takeProfitStep = 1;
        }

        // Entry + exit taker fees at the configured exchange rate
        const feeRate = getTakerFeeRate();
        const grossPnlIdr = (currentPrice - ghost.entry_price) * ghost.amount;
        const totalFeeIdr = (ghost.initial_cost_idr + (currentPrice * ghost.amount)) * feeRate;
        const netPnlIdr = grossPnlIdr - totalFeeIdr;
        const netPnlPercent = (netPnlIdr / ghost.initial_cost_idr) * 100;

        if (currentPrice <= trailingStopPrice) {
          // Trailing stop reached: simulate trade closure!
          const outcome = netPnlIdr < 0 ? 'BULLET_DODGED' : 'OPPORTUNITY_MISSED';
          const exitReason = `Trailing Stop tersentuh di Rp ${trailingStopPrice.toLocaleString('id-ID')} (PnL: ${netPnlPercent.toFixed(2)}%)`;

          updates.push({
            isClosed: true,
            params: [
              currentPrice,
              highestPrice,
              trailingStopPrice,
              takeProfitStep,
              Date.now(),
              netPnlIdr,
              netPnlPercent,
              exitReason,
              outcome,
              ghost.id,
            ],
          });

          console.log(`[A/B Ghost Closed] ${ghost.symbol.toUpperCase()} exit: ${outcome} (PnL: ${netPnlPercent.toFixed(2)}%, Rp ${Math.round(netPnlIdr).toLocaleString('id-ID')})`);
        } else {
          // Update live floating telemetry for dashboard
          updates.push({
            isClosed: false,
            params: [
              currentPrice,
              highestPrice,
              trailingStopPrice,
              takeProfitStep,
              netPnlIdr,
              netPnlPercent,
              ghost.id,
            ],
          });
        }
      } catch (err: any) {
        console.warn(`[Ghost Manager] Gagal memantau ghost posisi ${ghost.symbol}:`, err.message);
      }
    }

    // Execute SQLite updates in a single batch transaction to avoid I/O bottlenecks
    if (updates.length > 0) {
      const runTx = db.transaction((rows: typeof updates) => {
        const closeStmt = db.prepare(`
          UPDATE ghost_positions SET
            current_price = ?,
            highest_price = ?,
            trailing_stop_price = ?,
            take_profit_step = ?,
            closed_at = ?,
            pnl_idr = ?,
            pnl_percent = ?,
            exit_reason = ?,
            status = 'closed',
            simulated_outcome = ?
          WHERE id = ?
        `);
        const updateStmt = db.prepare(`
          UPDATE ghost_positions SET
            current_price = ?,
            highest_price = ?,
            trailing_stop_price = ?,
            take_profit_step = ?,
            pnl_idr = ?,
            pnl_percent = ?
          WHERE id = ?
        `);

        for (const row of rows) {
          if (row.isClosed) {
            closeStmt.run(...row.params);
          } else {
            updateStmt.run(...row.params);
          }
        }
      });
      runTx(updates);
    }
  }

  /**
   * Pembersihan berkala data lama (A/B evaluations dan ghost positions > 30 hari)
   * agar SQLite tetap cepat dan ukuran file database tetap ramping.
   */
  public pruneOldData() {
    try {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 3600 * 1000);
      const sevenDaysAgo = Date.now() - (7 * 24 * 3600 * 1000);

      db.prepare("DELETE FROM ghost_positions WHERE status = 'closed' AND closed_at < ?").run(thirtyDaysAgo);
      db.prepare("DELETE FROM ai_ab_evaluations WHERE timestamp < ? AND id NOT IN (SELECT evaluation_id FROM ghost_positions WHERE status = 'open')").run(thirtyDaysAgo);
      
      // Retensi 7 hari untuk tabel telemetri & log sinyal Section 9
      db.prepare("DELETE FROM entry_gate_logs WHERE ts < ?").run(sevenDaysAgo);
      db.prepare("DELETE FROM ai_call_logs WHERE ts < ?").run(sevenDaysAgo);
      db.prepare("DELETE FROM news_items WHERE fetched_at < ?").run(sevenDaysAgo);
      db.prepare("DELETE FROM regime_log WHERE ts < ?").run(sevenDaysAgo);
      db.prepare("DELETE FROM opportunity_shortlist WHERE ts < ?").run(sevenDaysAgo);
      db.prepare("DELETE FROM agent_messages WHERE ts < ?").run(sevenDaysAgo);

      console.log('[Maintenance] Pembersihan berkala database selesai (30 hari posisi, 7 hari log sinyal & AI).');
    } catch (err: any) {
      console.warn('[Data Pruning] Error:', err.message);
    }
  }

  // --- Market Scanner & Entry Decision ---

  private async scanAndExecuteEntries() {
    // 0. Auto-Trading State Verification
    const isActive = getSetting('is_auto_trading_active', '0') === '1';
    if (!isActive) return;

    // 1. Daily Circuit Breaker Check
    const dailyLimit = parseFloat(getSetting('daily_loss_limit_percent', '5.0'));
    const isCircuitBreaker = await this.checkDailyCircuitBreaker();
    if (isCircuitBreaker) {
      logEntryGate('*', 'circuit_breaker', false, { limitPercent: dailyLimit });
      return;
    }
    logEntryGate('*', 'circuit_breaker', true, { limitPercent: dailyLimit });

    // 1.5 Drawdown kill-switch hard gate (also evaluated in the run loop; a
    // breach stays latched here until the manual /trading/drawdown-reset).
    if (parseInt(getSetting('drawdown_halt_since', '0'), 10) > 0) {
      logEntryGate('*', 'drawdown_kill_switch', false, { reason: 'Halt aktif, menunggu reset manual' });
      return;
    }

    // 1.6 Exit-guard: never open new live positions while an existing one has
    // no guaranteed exit plan (dust remainder, sell failure, balance doubt).
    const entryMode: 'paper' | 'live' = getSetting('trading_mode', 'paper') === 'live' ? 'live' : 'paper';
    if (entryMode === 'live' && getSetting('require_protective_orders', '1') === '1') {
      const unprotectedRow = db.prepare(
        "SELECT COUNT(*) as c FROM positions WHERE status = 'open' AND mode = 'live' AND unprotected_since IS NOT NULL"
      ).get() as { c: number };
      if (unprotectedRow.c > 0) {
        logEntryGate('*', 'exit_guard', false, { unprotectedPositions: unprotectedRow.c });
        if (Date.now() - this.lastUnprotectedAlertAt > 15 * 60 * 1000) {
          this.lastUnprotectedAlertAt = Date.now();
          console.warn(`[Exit Guard] ${unprotectedRow.c} posisi live tanpa exit plan. Entry baru ditahan.`);
          if (this.onTradeEventCallback) {
            this.onTradeEventCallback({
              type: 'ALERT',
              data: {
                title: 'Exit Guard: Entry Ditahan',
                message: `${unprotectedRow.c} posisi live tidak memiliki exit plan terjamin (unprotected). Entry baru ditahan sampai posisi tersebut diselesaikan atau dilindungi. Periksa dashboard.`,
              },
            });
          }
        }
        return;
      }
    }

    // 2. Open Position Slots (active mode only; paper and live exposure never mix)
    const mode: 'paper' | 'live' = getSetting('trading_mode', 'paper') === 'live' ? 'live' : 'paper';
    const maxActive = parseInt(getSetting('max_active_trades', '3'), 10);
    const openCount = (this.stmtCountOpenPositionsByMode.get(mode) as { count: number }).count;
    const exposureCheck = checkExposure(
      {
        openPositions: openCount,
        dailyPnlIdr: 0,
        dayStartEquityIdr: 0,
        regimeAllowEntries: true,
        btcChange1hPct: 0,
      },
      maxActive
    );
    logEntryGate('*', 'exposure', exposureCheck.passed, exposureCheck.values);
    if (!exposureCheck.passed) return;

    // 3. Scoped Threat Blocker: Global systemic threats block all pairs; coin-specific threats block only that coin
    const { threatCount, coinSentiments, activeThreats } = agentSwarm.getAggregatedSentiment();
    const globalThreat = activeThreats.find((t) => t.coin === null);
    if (globalThreat) {
      logEntryGate('*', 'threat_scope', false, {
        severity: globalThreat.severity,
        headline: globalThreat.headline,
      });
      console.log(`[Entry Blocked] Terdeteksi ancaman sistemik aktif: ${globalThreat.headline}. Pembukaan posisi baru dibekukan.`);
      return;
    }

    const summaries = await indodax.getSummaries();
    if (!summaries || !summaries.tickers) return;

    // 4. Macro BTC Regime Filter (1h and 4h window returns - P0-A 3.3.2 Fix)
    let btcRegimeVerdict: RegimeVerdict = { regime: 'NEUTRAL', allowNewEntries: true, reasons: [] };
    let btcChange1h = 0;
    let btcChange4h = 0;

    try {
      const btcCandles = await indodaxMarketStream.getRealCandles('btc_idr', '15m');
      if (btcCandles && btcCandles.length >= 16) {
        const curClose = btcCandles[btcCandles.length - 1].close;
        const close1hAgo = btcCandles[btcCandles.length - 5].close;
        const close4hAgo = btcCandles[btcCandles.length - 17]?.close || btcCandles[0].close;
        btcChange1h = close1hAgo > 0 ? ((curClose - close1hAgo) / close1hAgo) * 100 : 0;
        btcChange4h = close4hAgo > 0 ? ((curClose - close4hAgo) / close4hAgo) * 100 : 0;
        const closes = btcCandles.map((c) => c.close);
        const ema21 = calculateEMA(closes, 21);

        btcRegimeVerdict = detectBtcRegime({
          change1hPct: btcChange1h,
          change4hPct: btcChange4h,
          close: curClose,
          ema21_1h: ema21,
        });

        db.prepare(`
          INSERT INTO regime_log (id, ts, regime, btc_change_1h_pct, btc_change_4h_pct, reasons)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `regime_${Date.now()}`,
          Date.now(),
          btcRegimeVerdict.regime,
          btcChange1h,
          btcChange4h,
          JSON.stringify(btcRegimeVerdict.reasons)
        );
      }
    } catch {}

    const btcGate = checkBtcRegime({
      dailyPnlIdr: 0,
      dayStartEquityIdr: 0,
      openPositions: openCount,
      regimeAllowEntries: btcRegimeVerdict.allowNewEntries,
      btcChange1hPct: btcChange1h,
      btcChange4hPct: btcChange4h,
    });
    logEntryGate('btc', 'btc_regime', btcGate.passed, btcGate.values);

    if (!btcGate.passed) {
      console.log(`[Entry Blocked] Rezim pasar Bitcoin sedang dump: ${btcGate.reason}. Menunda entry demi proteksi modal.`);
      return;
    }

    const baseAllocationIdr = parseFloat(getSetting('max_allocation_per_trade_idr', '100000'));
    const slippageTolerance = parseFloat(getSetting('slippage_tolerance_percent', '0.8'));
    const minVolumeIdr = parseFloat(getSetting('min_24h_volume_idr', '200000000'));
    const allowNewListings = getSetting('allow_new_listings', '1') === '1';
    const allowedCoinsRaw = getSetting('allowed_coins_only', '').trim().toLowerCase();
    const allowedCoins = allowedCoinsRaw
      ? allowedCoinsRaw.split(',').map((s) => s.trim().replace('_idr', ''))
      : [];
    const riskProfile = (getSetting('risk_profile', 'balanced') as 'conservative' | 'balanced' | 'aggressive');

    let candidateSymbol: string | null = null;
    let candidateAlertId: string | null = null;
    let candidateReason = '';
    let candidateScore: ScoreResult | null = null;

    // Candidate 1: NEW COIN ALERTS (Pump hunter - disabled for Conservative profile)
    if (allowNewListings && riskProfile !== 'conservative' && allowedCoins.length === 0) {
      const newAlerts = db.prepare(`
        SELECT * FROM new_coin_alerts
        WHERE status = 'monitoring'
        ORDER BY detected_at DESC
        LIMIT 3
      `).all() as Array<{ id: string; symbol: string; name: string }>;

      for (const alert of newAlerts) {
        const threatCheck = checkThreatScope(alert.symbol, activeThreats);
        logEntryGate(alert.symbol, 'threat_scope', threatCheck.passed, threatCheck.values);
        if (!threatCheck.passed) continue;

        const tickerKey = `${alert.symbol}_idr`;
        const ticker = summaries.tickers[tickerKey];
        if (ticker) {
          const vol = parseFloat(ticker.vol_idr || '0');
          if (vol >= 50000000) {
            candidateSymbol = alert.symbol;
            candidateAlertId = alert.id;
            candidateReason = `Koin Baru Listing Indodax (${alert.name}) - Momentum Pump Awal`;
            break;
          }
        }
      }
    }

    // Candidate 2: Profile-driven Strategy
    if (!candidateSymbol) {
      if (riskProfile === 'conservative') {
        // --- CONSERVATIVE: Blue-Chip Pullback Strategy (P0-A 3.3.3) ---
        const conservativeCoins = allowedCoins.length > 0 ? allowedCoins : ['btc', 'eth', 'sol', 'bnb', 'xrp'];
        let bestCandidate: { symbol: string; score: number; reason: string; scoreRes: ScoreResult } | null = null;

        for (const symbol of conservativeCoins) {
          const threatCheck = checkThreatScope(symbol, activeThreats);
          logEntryGate(symbol, 'threat_scope', threatCheck.passed, threatCheck.values);
          if (!threatCheck.passed) continue;

          // Check if already holding this coin
          const existing = db.prepare("SELECT id FROM positions WHERE symbol = ? AND status = 'open'").get(symbol);
          if (existing) continue;
          const existingGhost = db.prepare("SELECT id FROM ghost_positions WHERE symbol = ? AND status = 'open'").get(symbol);
          if (existingGhost) continue;

          const tickerKey = `${symbol}_idr`;
          const ticker = summaries.tickers[tickerKey];
          if (!ticker) continue;

          const vol = parseFloat(ticker.vol_idr || '0');
          if (vol < minVolumeIdr) {
            logEntryGate(symbol, 'candidate_filter', false, { reason: 'Volume kurang', vol, minVolumeIdr });
            continue;
          }

          let candles15m: any[] = [];
          try {
            candles15m = (await indodaxMarketStream.getRealCandles(symbol, '15m')) || [];
          } catch {}

          const summaryItem: MarketSummary = {
            symbol,
            pair: tickerKey,
            last: parseFloat(ticker.last) || 0,
            high24h: parseFloat(ticker.high) || 0,
            low24h: parseFloat(ticker.low) || 0,
            volIdr24h: vol,
            buyPrice: parseFloat(ticker.buy) || 0,
            sellPrice: parseFloat(ticker.sell) || 0,
            ts: Date.now(),
          };

          const features = extractFeatures(summaryItem, candles15m);
          const rsi14 = features.rsi14;
          const ema21 = features.ema21;
          if (rsi14 === null || ema21 === null) {
            logEntryGate(symbol, 'candidate_filter', false, {
              strategy: 'bluechip_pullback',
              reason: 'Indikator 15m belum lengkap',
              candles: candles15m.length,
              rsi: rsi14,
              ema21,
            });
            continue;
          }
          const sentiment = coinSentiments[symbol.toUpperCase()] ?? 0.0;
          const scoreRes = scoreOpportunity(features, sentiment, false, btcRegimeVerdict.regime, 'bluechip_pullback');

          db.prepare(`
            INSERT INTO opportunity_shortlist (id, ts, symbol, strategy, score, breakdown, consumed)
            VALUES (?, ?, ?, ?, ?, ?, 0)
          `).run(`opp_${Date.now()}_${symbol}`, Date.now(), symbol, 'bluechip_pullback', scoreRes.score, JSON.stringify(scoreRes.breakdown));

          agentBus.publish('opportunity.signal', 'scanner', { symbol, strategy: 'bluechip_pullback', score: scoreRes.score, features });

          const threshold = SCORE_THRESHOLDS.conservative;
          const passed = scoreRes.score >= threshold && rsi14 <= 65;
          logEntryGate(symbol, 'candidate_filter', passed, {
            strategy: 'bluechip_pullback',
            score: scoreRes.score,
            threshold,
            breakdown: scoreRes.breakdown,
            rsi: rsi14,
          });

          if (passed) {
            if (!bestCandidate || scoreRes.score > bestCandidate.score) {
              bestCandidate = {
                symbol,
                score: scoreRes.score,
                reason: `Blue-Chip Pullback Konservatif (Skor: ${scoreRes.score}/100, RSI: ${rsi14}, Dip: ${features.dropFromHighPct}%)`,
                scoreRes,
              };
            }
          }
        }

        if (bestCandidate) {
          candidateSymbol = bestCandidate.symbol;
          candidateReason = bestCandidate.reason;
          candidateScore = bestCandidate.scoreRes;
        }
      } else {
        // --- BALANCED & AGGRESSIVE: Momentum Band Strategy ---
        const eligibleTickers: Array<{ symbol: string; gain24h: number; volIdr: number; last: number; dropFromHigh: number }> = [];

        for (const [key, ticker] of Object.entries(summaries.tickers)) {
          if (!key.endsWith('_idr')) continue;
          const symbol = key.replace('_idr', '');
          const last = parseFloat(ticker.last);
          const low = parseFloat(ticker.low);
          const high = parseFloat(ticker.high);
          const volIdr = parseFloat(ticker.vol_idr);

          if (volIdr < minVolumeIdr) continue;
          if (allowedCoins.length > 0 && !allowedCoins.includes(symbol)) continue;

          const threatCheck = checkThreatScope(symbol, activeThreats);
          if (!threatCheck.passed) {
            logEntryGate(symbol, 'threat_scope', false, threatCheck.values);
            continue;
          }

          const gain24h = low > 0 ? ((last - low) / low) * 100 : 0;
          const dropFromHigh = high > 0 ? ((high - last) / high) * 100 : 0;

          if (dropFromHigh > 5.0) {
            logEntryGate(symbol, 'candidate_filter', false, { reason: 'Pucuk retracement > 5%', dropFromHigh });
            continue;
          }

          const existing = db.prepare("SELECT id FROM positions WHERE symbol = ? AND status = 'open'").get(symbol);
          if (existing) continue;
          const existingGhost = db.prepare("SELECT id FROM ghost_positions WHERE symbol = ? AND status = 'open'").get(symbol);
          if (existingGhost) continue;

          if (gain24h >= 2.0 && gain24h <= 20.0) {
            eligibleTickers.push({ symbol, gain24h, volIdr, last, dropFromHigh });
          }
        }

        const MEME_TOKENS = new Set(['doge', 'pepe', 'shib', 'floki', 'bonk', 'wif', 'bome', 'neiro', 'pnut', 'turb']);
        const openSymbols = (db.prepare("SELECT symbol FROM positions WHERE status = 'open'").all() as Array<{ symbol: string }>).map((p) =>
          p.symbol.toLowerCase().replace('_idr', '')
        );
        const isAlreadyHoldingMeme = openSymbols.some((s) => MEME_TOKENS.has(s));

        eligibleTickers.sort((a, b) => b.gain24h - a.gain24h);
        for (const t of eligibleTickers) {
          if (isAlreadyHoldingMeme && MEME_TOKENS.has(t.symbol.toLowerCase())) {
            continue;
          }
          candidateSymbol = t.symbol;
          candidateReason = `Top Momentum Gainer (+${t.gain24h.toFixed(1)}%, Volume: Rp ${(t.volIdr / 1e6).toFixed(0)} Jt)`;
          logEntryGate(t.symbol, 'candidate_filter', true, { gain24h: t.gain24h, volIdr: t.volIdr });
          break;
        }
      }
    }

    if (!candidateSymbol) return;

    // Fractional Kelly Sizing
    let maxAllocationIdr = baseAllocationIdr;
    try {
      const pastTrades = db.prepare("SELECT pnl_idr FROM positions WHERE status = 'closed' ORDER BY closed_at DESC LIMIT 20").all() as Array<{ pnl_idr: number }>;
      if (pastTrades.length >= 6) {
        const wins = pastTrades.filter((t) => t.pnl_idr > 0).length;
        const winRate = wins / pastTrades.length;
        if (winRate < 0.35) {
          maxAllocationIdr = Math.round(baseAllocationIdr * 0.6);
        } else if (winRate >= 0.65) {
          maxAllocationIdr = Math.round(baseAllocationIdr * 1.2);
        }
      }
    } catch {}

    // Volatility Sizing
    const volatilitySizing = getSetting('volatility_sizing_enabled', '1') === '1';
    if (volatilitySizing && candidateSymbol) {
      const tickerObj = summaries.tickers[`${candidateSymbol}_idr`];
      if (tickerObj) {
        const h = parseFloat(tickerObj.high);
        const l = parseFloat(tickerObj.low);
        const cur = parseFloat(tickerObj.last);
        const rangePct = cur > 0 ? ((h - l) / cur) * 100 : 0;
        if (rangePct > 20.0) {
          maxAllocationIdr = Math.max(10000, Math.round(maxAllocationIdr * 0.6));
        } else if (rangePct > 10.0) {
          maxAllocationIdr = Math.max(10000, Math.round(maxAllocationIdr * 0.8));
        }
      }
    }

    // Depth & Slippage Check
    const depth = await indodax.getDepth(candidateSymbol);

    // Equity-percent allocation cap: the absolute max_allocation_per_trade_idr
    // does not scale with account growth; max_allocation_percent (>0) caps the
    // per-trade budget relative to CURRENT equity before slippage math runs.
    const maxAllocPct = parseFloat(getSetting('max_allocation_percent', '0'));
    if (maxAllocPct > 0) {
      try {
        const equitySnap = await this.getEquitySnapshot(mode);
        const capResult = capAllocationByEquityPercent(maxAllocationIdr, equitySnap.equityIdr, maxAllocPct);
        if (capResult.capped) {
          logEntryGate(candidateSymbol, 'allocation_cap', true, {
            requested: maxAllocationIdr,
            cappedTo: capResult.allocationIdr,
            maxAllocationPercent: maxAllocPct,
            equityIdr: Math.round(equitySnap.equityIdr),
          });
          maxAllocationIdr = capResult.allocationIdr;
        }
      } catch (err: any) {
        // Fail-open for the cap only: the absolute IDR allocation still applies
        // and an unreadable equity must not silently change position sizing.
        console.warn(`[Allocation Cap] Equity tidak terbaca, cap % dilewati: ${err?.message}`);
      }
    }

    const slippageCheck = indodax.calculateSlippage(depth, 'buy', maxAllocationIdr);
    const slippageGate = checkSlippageBudget(slippageCheck.slippagePercent, slippageTolerance);
    logEntryGate(candidateSymbol, 'slippage', slippageGate.passed, slippageGate.values);

    if (!slippageCheck.isSufficientLiquidity || !slippageGate.passed) {
      console.log(`[Entry Ignored] Slippage untuk ${candidateSymbol} terlalu tinggi (${slippageCheck.slippagePercent.toFixed(2)}% > toleransi ${slippageTolerance}%).`);
      return;
    }

    // Spread Trap Gate
    const spreadCheck = indodax.calculateSpread(depth);
    const spreadGate = checkSpreadTrap(spreadCheck.spreadPercent, 0.8);
    logEntryGate(candidateSymbol, 'spread', spreadGate.passed, spreadGate.values);
    if (!spreadGate.passed) {
      console.log(`[Entry Ignored] Spread ${candidateSymbol} terlalu lebar (${spreadCheck.spreadPercent}% > toleransi 0.8%). Menghindari jebakan spread.`);
      return;
    }

    const depthImbalance = indodax.calculateDepthImbalance(depth, 10);

    // Intraday Candlestick Indicators (15m Timeframe) — mandatory for every entry.
    let rsi15m: number | null = null;
    let candles15m: Array<{ open: number; high: number; low: number; close: number; volume: number }> = [];
    try {
      candles15m = (await indodaxMarketStream.getRealCandles(candidateSymbol, '15m')) || [];
    } catch {}
    if (candles15m.length < 15) {
      logEntryGate(candidateSymbol, 'indicators', false, {
        reason: 'Data candle 15m tidak cukup',
        candles: candles15m.length,
        required: 15,
      });
      console.log(`[Entry Ignored] Data candle 15m ${candidateSymbol} tidak cukup (${candles15m.length}/15). Entry diblokir.`);
      return;
    }
    rsi15m = calculateRSI(candles15m.map((c) => c.close), 14);
    if (rsi15m === null) {
      logEntryGate(candidateSymbol, 'indicators', false, { reason: 'RSI 15m tidak tersedia' });
      console.log(`[Entry Ignored] RSI 15m ${candidateSymbol} tidak tersedia. Entry diblokir.`);
      return;
    }

    const rsiGate = checkRsiGuard(rsi15m, 70);
    logEntryGate(candidateSymbol, 'rsi', rsiGate.passed, rsiGate.values);
    if (!rsiGate.passed) {
      console.log(`[Entry Ignored] ${candidateSymbol} overbought pada 15m (RSI ${rsi15m} > 70). Menghindari beli di pucuk.`);
      return;
    }

    if (volatilitySizing) {
      const trueAtr = calculateTrueATR(candles15m, 14);
      if (trueAtr !== null && trueAtr > 0) {
        const atrPct = (trueAtr / slippageCheck.averageFillPrice) * 100;
        if (atrPct > 4.0) {
          maxAllocationIdr = Math.max(10000, Math.round(baseAllocationIdr * 0.6));
        } else if (atrPct > 2.5) {
          maxAllocationIdr = Math.max(10000, Math.round(baseAllocationIdr * 0.8));
        }
      }
    }

    // AI Master Evaluation (Hybrid: 'off' | 'confirm' | 'required')
    const masterModel = getSetting('master_model', '');
    const sentiment = coinSentiments[candidateSymbol.toUpperCase()] ?? 0.0;
    const tickerObj = summaries.tickers[`${candidateSymbol}_idr`];
    const candidateDrop = tickerObj ? ((parseFloat(tickerObj.high) - parseFloat(tickerObj.last)) / parseFloat(tickerObj.high)) * 100 : null;
    const aiMode = getSetting('ai_mode', 'confirm');

    let evalResult = { approved: false, reasoning: '' };
    if (aiMode === 'off') {
      evalResult = {
        approved: true,
        reasoning: 'Mode Deterministik (AI Off): Lolos seluruh filter & skor risiko kuantitatif deterministik.',
      };
      logEntryGate(candidateSymbol, 'ai_gate', true, { mode: 'off', score: candidateScore?.score });
    } else {
      evalResult = await this.evaluateAiEntryConfluence(
        candidateSymbol,
        slippageCheck.averageFillPrice,
        sentiment,
        candidateReason,
        masterModel,
        {
          rsi: rsi15m,
          dropFromHigh: candidateDrop,
          depthImbalance,
          spreadPercent: spreadCheck.spreadPercent,
        },
        mode
      );
      logEntryGate(candidateSymbol, 'ai_gate', evalResult.approved, {
        mode: aiMode,
        reasoning: evalResult.reasoning,
      });
    }

    // Record evaluation in ai_ab_evaluations table
    const evalId = `eval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO ai_ab_evaluations (
        id, timestamp, symbol, candidate_price, technical_reason, sentiment_score, threat_count, ai_verdict, ai_reasoning, mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evalId,
      Date.now(),
      candidateSymbol,
      slippageCheck.averageFillPrice,
      candidateReason,
      sentiment,
      threatCount,
      evalResult.approved ? 'APPROVED' : 'REJECTED',
      evalResult.reasoning,
      mode
    );

    if (!evalResult.approved) {
      // Counterfactual Ghost Position (Group B: Signal rejected by AI)
      const trailingStopPercent = parseFloat(getSetting('trailing_stop_percent', '2.5'));
      const buyPrice = slippageCheck.averageFillPrice;
      const amount = maxAllocationIdr / buyPrice;
      const initialTrailingStop = buyPrice * (1 - trailingStopPercent / 100);
      const ghostId = `ghost_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      db.prepare(`
        INSERT INTO ghost_positions (
          id, evaluation_id, symbol, entry_price, current_price, highest_price, trailing_stop_price,
          take_profit_step, initial_cost_idr, amount, opened_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'open')
      `).run(
        ghostId,
        evalId,
        candidateSymbol,
        buyPrice,
        buyPrice,
        buyPrice,
        initialTrailingStop,
        maxAllocationIdr,
        amount,
        Date.now()
      );

      console.log(`[A/B Counterfactual] Entry ${candidateSymbol.toUpperCase()} ditolak AI. Ghost Position dicatat (${ghostId}) untuk tracking validasi alpha.`);
      return;
    }

    // Execute Buy Order!
    if (getSetting('is_auto_trading_active', '0') !== '1') {
      console.log(`[Entry Aborted] Auto-trading dinonaktifkan sebelum order ${candidateSymbol.toUpperCase()} dikirim.`);
      return;
    }

    const buyPrice = slippageCheck.averageFillPrice;
    const amount = maxAllocationIdr / buyPrice;

    const buySuccess = await this.executeBuy(candidateSymbol, buyPrice, amount, maxAllocationIdr, mode, candidateReason);

    if (buySuccess) {
      logEntryGate(candidateSymbol, 'order_executed', true, { price: buyPrice, amount, totalIdr: maxAllocationIdr });
      agentBus.publish('trade.proposal', 'executor', { symbol: candidateSymbol, side: 'BUY', price: buyPrice, amount });

      if (candidateAlertId) {
        db.prepare("UPDATE new_coin_alerts SET status = 'entered' WHERE id = ?").run(candidateAlertId);
      }
    }
  }

  /**
   * AI Confirmation Gate:
   * Structured JSON evaluation with risk budget context. Paper simulations may
   * fall back to deterministic signals in 'confirm' mode; live mode fails closed.
   */
  public async evaluateAiEntryConfluence(
    symbol: string,
    price: number,
    sentiment: number,
    reason: string,
    model: string,
    telemetry?: {
      rsi?: number | null;
      dropFromHigh?: number | null;
      depthImbalance?: number | null;
      spreadPercent?: number | null;
    },
    executionMode: 'paper' | 'live' = 'live'
  ): Promise<{ approved: boolean; reasoning: string }> {
    const aiMode = getSetting('ai_mode', 'confirm');
    if (aiMode === 'off') {
      return {
        approved: true,
        reasoning: 'Mode Deterministik (AI Off): Setup lolos seluruh konfirmasi kuantitatif deterministik.',
      };
    }
    const deterministicFallback = allowsDeterministicFallback(aiMode, executionMode);

    try {
      if (!model) {
        if (deterministicFallback) {
          console.log(`[AI Confirmation] Master Model AI belum dipilih; mode paper memakai sinyal deterministik.`);
          return { approved: true, reasoning: 'Paper mode: Master Model AI belum dipilih; simulasi entry memakai sinyal deterministik.' };
        }
        return { approved: false, reasoning: `Fail-closed (${executionMode}): Master Model AI belum dipilih di Settings.` };
      }

      // Lessons learned context
      let lessonsContext = 'Belum ada catatan evaluasi trade sebelumnya.';
      try {
        const specificLessons = db.prepare(`
          SELECT symbol, result, lesson, pnl_percent, market_condition
          FROM lessons_learned
          WHERE LOWER(symbol) = LOWER(?)
          ORDER BY timestamp DESC
          LIMIT 3
        `).all(symbol) as Array<{ symbol: string; result: string; lesson: string; pnl_percent: number; market_condition: string }>;

        const needed = 5 - specificLessons.length;
        let genericLessons: Array<{ symbol: string; result: string; lesson: string; pnl_percent: number; market_condition: string }> = [];
        if (needed > 0) {
          genericLessons = db.prepare(`
            SELECT symbol, result, lesson, pnl_percent, market_condition
            FROM lessons_learned
            WHERE LOWER(symbol) != LOWER(?)
            ORDER BY timestamp DESC
            LIMIT ?
          `).all(symbol, needed) as Array<{ symbol: string; result: string; lesson: string; pnl_percent: number; market_condition: string }>;
        }

        const combined = [...specificLessons, ...genericLessons];
        if (combined.length > 0) {
          lessonsContext = combined
            .map((l, i) => `${i + 1}. [${l.symbol.toUpperCase()}] Hasil: ${l.result} (${l.pnl_percent >= 0 ? '+' : ''}${l.pnl_percent.toFixed(1)}%) | Evaluasi: ${l.lesson} | Kondisi: ${l.market_condition}`)
            .join('\n');
        }
      } catch {}

      const sentimentLabel = sentiment === 0 ? '0.0 (Netral / Tanpa berita spesifik)' : sentiment > 0 ? `+${sentiment.toFixed(2)} (Bullish)` : `${sentiment.toFixed(2)} (Bearish)`;
      const rsiInfo = telemetry?.rsi !== undefined && telemetry?.rsi !== null ? `RSI(15m): ${telemetry.rsi}` : '';
      const dropInfo = telemetry?.dropFromHigh !== undefined && telemetry?.dropFromHigh !== null ? `Drop dr High 24j: ${telemetry.dropFromHigh.toFixed(1)}%` : '';
      const imbalanceInfo = telemetry?.depthImbalance !== undefined && telemetry?.depthImbalance !== null ? `Rasio Bid/Ask Depth: ${telemetry.depthImbalance}x` : '';
      const spreadInfo = telemetry?.spreadPercent !== undefined && telemetry?.spreadPercent !== null ? `Spread: ${telemetry.spreadPercent}%` : '';
      const telemetryLine = [rsiInfo, dropInfo, imbalanceInfo, spreadInfo].filter(Boolean).join(' | ');

      const riskProfile = getSetting('risk_profile', 'balanced');
      const trailingStopPercent = parseFloat(getSetting('trailing_stop_percent', '2.5'));
      const targetTp1 = parseFloat(getSetting('take_profit_target_1_percent', '5.0'));

      const prompt = `Anda adalah AI Quantitative Risk Manager.
Evaluasi apakah aman membuka posisi BUY dengan menguji potensi profit vs skenario risiko:
Koin: ${symbol.toUpperCase()} | Harga: Rp ${price.toLocaleString('id-ID')}
Profil Risiko: ${riskProfile.toUpperCase()} (Risk Budget: SL -${trailingStopPercent}%, TP1 +${targetTp1}%)
Setup Kuantitatif: ${reason}${telemetryLine ? `\nMikro-Struktur Pasar: ${telemetryLine}` : ''}
Sentimen Berita: ${sentimentLabel}

MEMORI BELAJAR (SELF-LEARNING LOOP):
${lessonsContext}

Jawab HANYA dalam format JSON valid (tanpa markdown backtick):
{"verdict": "YA", "confidence": 0.85, "reason": "Satu kalimat ringkas alasan evaluasi risiko"}`;

      const response = await aiClient.complete({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 80,
        agentCaller: 'master',
      });

      const approved = TradingEngine.parseAiConfirmation(response);
      return {
        approved,
        reasoning: response.trim() || (approved ? 'AI Approved setup' : 'AI Rejected setup'),
      };
    } catch (err: any) {
      if (deterministicFallback) {
        console.warn(`[AI Confirmation Fallback] Error provider AI: ${err.message}. Mode paper + ai_mode confirm memakai sinyal deterministik.`);
        return {
          approved: true,
          reasoning: `Paper fallback deterministik (ai_mode: confirm): ${err.message}`,
        };
      }
      console.warn(`[AI Confirmation Failed] Fail-closed (${executionMode}), entry ${symbol} dibatalkan:`, err.message);
      return {
        approved: false,
        reasoning: `Fail-closed (${executionMode}): ${err.message}`,
      };
    }
  }

  public async askAiEntryConfirmation(
    symbol: string,
    price: number,
    sentiment: number,
    reason: string,
    model: string,
    executionMode: 'paper' | 'live' = 'live'
  ): Promise<boolean> {
    const result = await this.evaluateAiEntryConfluence(symbol, price, sentiment, reason, model, undefined, executionMode);
    return result.approved;
  }

  public static parseAiConfirmation(response: string): boolean {
    if (!response) return false;
    const raw = response.trim();
    if (!raw) return false;

    // 1. Try parsing structured JSON if returned
    try {
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
        if (typeof parsed.approved === 'boolean') return parsed.approved;
        if (typeof parsed.verdict === 'string') {
          const v = parsed.verdict.trim().toUpperCase();
          return /^(YA|BUY|SETUJU|YES|APPROVE)$/i.test(v);
        }
        if (typeof parsed.decision === 'string') {
          const d = parsed.decision.trim().toUpperCase();
          return /^(BUY|APPROVE|YES)$/i.test(d);
        }
      }
    } catch {
      // Not JSON, continue to text evaluation
    }

    // 2. Structured VERDICT / KEPUTUSAN line check
    const verdictMatch = raw.match(/(?:VERDICT|KEPUTUSAN)\s*:\s*([^\n\r]+)/i);
    let candidateText = '';
    if (verdictMatch) {
      candidateText = verdictMatch[1].trim();
    } else {
      // If no explicit header, check the first line only to prevent explanatory text matching
      const firstLine = raw.split(/[\r\n]+/)[0].trim();
      candidateText = firstLine;
    }

    const clean = candidateText.toUpperCase();

    // Rejection qualifiers: if ANY of these words exist in the verdict clause, reject!
    const hasRejectQualifier = /\b(TIDAK|RAGU|JANGAN|SKIP|NO|WAIT|TUNGGU|REJECT|RISIKO|RESIKO|BAHAYA|HANYA|BELUM|DELAY|DROP)\b/i.test(clean);
    if (hasRejectQualifier) {
      return false;
    }

    // Must have a clear affirmative word at word boundary
    const isAffirmative = /\b(YA|BUY|SETUJU|YES|APPROVE)\b/i.test(clean);
    return isAffirmative;
  }

  // --- Order Execution (Paper & Live) ---

  public async executeBuy(
    symbol: string,
    price: number,
    amount: number,
    totalIdr: number,
    mode: 'paper' | 'live',
    reason: string
  ): Promise<boolean> {
    // Serialize entries so concurrent manual/AI buys cannot race the balance
    // read-modify-write or both pass the same exposure snapshot.
    return this.withPositionLock(ENTRY_LOCK_KEY, () =>
      this.executeBuyUnlocked(symbol, price, amount, totalIdr, mode, reason)
    );
  }

  private async executeBuyUnlocked(
    symbol: string,
    price: number,
    amount: number,
    totalIdr: number,
    mode: 'paper' | 'live',
    reason: string
  ): Promise<boolean> {
    // Validate minimum trade amount per pair rules (e.g. min Rp 10.000)
    const minTradeIdr = indodax.getMinTradeIdr(symbol);
    if (totalIdr < minTradeIdr) {
      console.warn(`[Buy Aborted] Nominal order Rp ${totalIdr.toLocaleString('id-ID')} kurang dari batas minimum Indodax (Rp ${minTradeIdr.toLocaleString('id-ID')}) untuk ${symbol}.`);
      return false;
    }

    const feeRate = getTakerFeeRate();
    const totalRequired = totalIdr * (1 + feeRate);
    let orderId = `paper_buy_${Date.now()}`;
    let buyIntentLocalId: string | null = null;
    let effectivePrice = price;
    let effectiveAmount = amount;

    // Balance verification & dynamic budget adaptation
    if (mode === 'paper') {
      const paperBal = parseFloat(getSetting('paper_idr_balance', '10000000'));
      if (paperBal < minTradeIdr) {
        console.warn(`[Paper Buy Aborted] Saldo paper tidak cukup (Rp ${paperBal.toLocaleString('id-ID')} < batas minimum Rp ${minTradeIdr.toLocaleString('id-ID')})`);
        return false;
      }

      let effectiveTotalIdr = totalIdr;
      if (paperBal < totalRequired) {
        effectiveTotalIdr = Math.floor(paperBal / (1 + feeRate));
        if (effectiveTotalIdr < minTradeIdr) {
          console.warn(`[Paper Buy Aborted] Sisa saldo paper Rp ${paperBal.toLocaleString('id-ID')} kurang dari batas minimum Rp ${minTradeIdr.toLocaleString('id-ID')}`);
          return false;
        }
        effectiveAmount = effectiveTotalIdr / effectivePrice;
        console.log(`[Dynamic Capital Sizing] Alokasi paper disesuaikan dari Rp ${totalIdr.toLocaleString('id-ID')} ke sisa saldo Rp ${effectiveTotalIdr.toLocaleString('id-ID')}`);
      }

      const effectiveFeeIdr = effectiveTotalIdr * feeRate;
      const actualDeduction = effectiveTotalIdr + effectiveFeeIdr;
      setSetting('paper_idr_balance', String(Math.max(0, Math.floor(paperBal - actualDeduction))));
      totalIdr = effectiveTotalIdr;
    } else {
      // Live Trading: Verifikasi saldo IDR resmi Indodax
      try {
        const idrBal = await indodax.getIdrBalance();
        if (idrBal.free < minTradeIdr) {
          console.warn(`[Live Buy Aborted] Saldo IDR resmi Indodax tidak cukup (Rp ${idrBal.free.toLocaleString('id-ID')} < batas minimum Rp ${minTradeIdr.toLocaleString('id-ID')})`);
          return false;
        }

        let effectiveTotalIdr = totalIdr;
        if (idrBal.free < totalRequired) {
          effectiveTotalIdr = Math.floor(idrBal.free / (1 + feeRate));
          if (effectiveTotalIdr < minTradeIdr) {
            console.warn(`[Live Buy Aborted] Sisa saldo IDR bursa Rp ${idrBal.free.toLocaleString('id-ID')} kurang dari batas minimum Rp ${minTradeIdr.toLocaleString('id-ID')}`);
            return false;
          }
          effectiveAmount = effectiveTotalIdr / effectivePrice;
          console.log(`[Dynamic Capital Sizing] Alokasi live disesuaikan dari Rp ${totalIdr.toLocaleString('id-ID')} ke sisa saldo bursa Rp ${effectiveTotalIdr.toLocaleString('id-ID')}`);
        }

        totalIdr = effectiveTotalIdr;
        const buyIntent = this.recordOrderIntent('entry', symbol, 'BUY', 'MARKET', { quoteOrderQty: Math.floor(totalIdr), expectedPrice: effectivePrice });
        let liveOrder: any;
        try {
          liveOrder = await indodax.createOrder({
            symbol,
            side: 'BUY',
            type: 'MARKET',
            quoteOrderQty: Math.floor(totalIdr),
            newClientOrderId: buyIntent.clientOrderId,
          });
        } catch (orderErr: any) {
          this.failOrderIntent(buyIntent.localId, `createOrder gagal: ${orderErr?.message}`);
          throw orderErr;
        }
        this.ackOrderIntent(buyIntent.localId, String(liveOrder.orderId || liveOrder.order_id || ''), buyIntent.clientOrderId);
        buyIntentLocalId = buyIntent.localId;
        orderId = String(liveOrder.orderId || liveOrder.order_id || buyIntent.clientOrderId || `live_buy_${Date.now()}`);

        let fill = await indodax.waitForOrderFill(
          symbol,
          orderId,
          liveOrder,
          { expectedPrice: effectivePrice },
          5000
        );

        if (fill.executedQty <= 0 && !fill.isFinal) {
          // Market order still unconfirmed after polling: cancel before giving up.
          console.warn(`[Live Buy Pending] Order ${orderId} ${symbol.toUpperCase()} belum terkonfirmasi (status ${fill.status}). Mencoba membatalkan.`);
          try {
            await indodax.cancelOrder(symbol, orderId);
          } catch (cancelErr: any) {
            console.error(`[Live Buy CRITICAL] Order ${orderId} ${symbol.toUpperCase()} tidak dapat dikonfirmasi maupun dibatalkan: ${cancelErr.message}. Auto-trading dihentikan untuk verifikasi manual.`);
            setSetting('is_auto_trading_active', '0');
            return false;
          }
          fill = await indodax.waitForOrderFill(
            symbol,
            orderId,
            undefined,
            { expectedPrice: effectivePrice },
            1500
          );
        }

        if (fill.executedQty <= 0) {
          console.error(`[Live Buy Not Filled] Order ${orderId} ${symbol.toUpperCase()} tidak terisi (status ${fill.status}). Tidak ada posisi yang dibuat.`);
          this.resolveOrderIntent(buyIntentLocalId!, `Order tidak terisi (status ${fill.status})`);
          return false;
        }

        // Use actual exchange execution values instead of the requested budget
        effectiveAmount = fill.executedQty;
        const actualSpent =
          fill.quoteQty > 0
            ? fill.quoteQty
            : Math.min(totalIdr, fill.executedQty * (fill.averagePrice || effectivePrice));
        totalIdr = actualSpent;
        effectivePrice = fill.averagePrice > 0 ? fill.averagePrice : actualSpent / effectiveAmount;

        if (!fill.verified) {
          console.warn(`[Live Buy Unverified] Order ${orderId} tidak menyertakan executedQty/status final; memakai estimasi fill (${effectiveAmount} @ Rp ${effectivePrice}).`);
        } else if (fill.executedQty < amount * 0.999) {
          console.warn(`[Live Buy Partial] Permintaan ${amount.toFixed(8)} ${symbol.toUpperCase()}, terisi ${fill.executedQty.toFixed(8)}. Posisi dicatat sesuai fill aktual.`);
        }
      } catch (err: any) {
        console.error(`[Live Order Failed] Gagal mengirim order beli ke Indodax: ${err.message}`);
        return false;
      }
    }

    // Fee is computed on the actual spend (live fills may differ from the request).
    const feeIdr = totalIdr * feeRate;

    const trailingStopPercent = parseFloat(getSetting('trailing_stop_percent', '2.5'));
    const initialTrailingStop = effectivePrice * (1 - trailingStopPercent / 100);

    const positionId = `pos_${symbol}_${Date.now()}`;
    const txBuy = db.transaction(() => {
      db.prepare(`
        INSERT INTO positions (
          id, symbol, base_currency, traded_currency, side, entry_price, current_price,
          amount, initial_cost_idr, highest_price, trailing_stop_price, take_profit_step,
          status, opened_at, mode
        ) VALUES (?, ?, 'idr', ?, 'buy', ?, ?, ?, ?, ?, ?, 0, 'open', ?, ?)
      `).run(
        positionId,
        symbol,
        symbol.replace('idr', ''),
        effectivePrice,
        effectivePrice,
        effectiveAmount,
        totalIdr,
        effectivePrice,
        initialTrailingStop,
        Date.now(),
        mode
      );

      // Record trade history
      db.prepare(`
        INSERT INTO trades_history (id, position_id, symbol, type, price, amount, total_idr, fee_idr, mode, order_id, reason, timestamp)
        VALUES (?, ?, ?, 'BUY', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `trade_${Date.now()}`,
        positionId,
        symbol,
        effectivePrice,
        effectiveAmount,
        totalIdr,
        feeIdr,
        mode,
        orderId,
        reason,
        Date.now()
      );
    });
    txBuy();
    if (buyIntentLocalId) this.resolveOrderIntent(buyIntentLocalId);
    this.refreshOpenSymbols();

    console.log(`[BUY EXECUTED] ${symbol.toUpperCase()} | Harga: Rp ${effectivePrice.toLocaleString('id-ID')} | Total: Rp ${totalIdr.toLocaleString('id-ID')} (${mode})`);

    if (this.onTradeEventCallback) {
      this.onTradeEventCallback({
        type: 'BUY',
        data: { symbol, price: effectivePrice, amount: effectiveAmount, totalIdr, mode, reason },
      });
    }

    return true;
  }

  public async executeSell(
    pos: PositionRecord,
    amountToSell: number,
    price: number,
    reason: string,
    opts: { floorPrice?: number; intentKind?: 'exit' | 'partial_tp' | 'panic' | 'derisk' } = {}
  ): Promise<SellExecutionResult> {
    if (!(amountToSell > 0) || !(price > 0)) {
      console.warn(`[Sell Aborted] Jumlah/harga tidak valid untuk ${pos.symbol}: amount=${amountToSell}, price=${price}`);
      return failedSell();
    }

    let orderId = `paper_sell_${Date.now()}`;
    let filledAmount = amountToSell;
    let proceedsIdr = amountToSell * price;
    let averagePrice = price;
    let pendingReview = false;
    let historyRecorded = false;
    const feeRate = getTakerFeeRate();
    const intentKind = opts.intentKind || 'exit';

    if (pos.mode === 'paper') {
      // Credit paper balance net of the configured taker fee
      const feeIdr = proceedsIdr * feeRate;
      const paperBal = parseFloat(getSetting('paper_idr_balance', '10000000'));
      setSetting('paper_idr_balance', String(Math.floor(paperBal + proceedsIdr - feeIdr)));
    } else {
      // Live Trading: Kirim order jual ke Indodax
      try {
        // Exit execution with a price floor: a LIMIT SELL resting at the floor
        // can never fill below it. Normally it crosses the book instantly at
        // the best bid; if the book collapses mid-flight the order rests until
        // the timeout, then the remainder is cancelled and market-sold (the
        // same outcome as a blind market order, but never worse on thin books).
        const floorEnabled = getSetting('exit_floor_limit_enabled', '1') === '1';
        const limitTimeoutMs = Math.max(500, parseInt(getSetting('limit_exit_timeout_ms', '3000'), 10) || 3000);
        const collarPct = Math.max(0.1, parseFloat(getSetting('price_collar_percent', '1.0')) || 1.0);
        const floorPrice = opts.floorPrice && opts.floorPrice > 0
          ? opts.floorPrice
          : price * (1 - collarPct / 100);

        const exitIntent = this.recordOrderIntent(
          intentKind,
          pos.symbol,
          'SELL',
          'LIMIT',
          { quantity: amountToSell, floorPrice, reason },
          pos.id
        );

        let limitExecuted = 0;
        let limitQuote = 0;
        let limitAvg = 0;
        let remainder = amountToSell;

        if (floorEnabled && floorPrice > 0) {
          try {
            const limitOrder = await indodax.createOrder({
              symbol: pos.symbol,
              side: 'SELL',
              type: 'LIMIT',
              quantity: amountToSell,
              price: Math.floor(floorPrice),
              newClientOrderId: exitIntent.clientOrderId,
            });
            const limitOrderId = String(limitOrder.orderId || limitOrder.order_id || '');
            this.ackOrderIntent(exitIntent.localId, limitOrderId, exitIntent.clientOrderId);
            orderId = limitOrderId || exitIntent.clientOrderId;

            let fill = await indodax.waitForOrderFill(
              pos.symbol,
              limitOrderId,
              limitOrder,
              { requestedQty: amountToSell, expectedPrice: floorPrice },
              limitTimeoutMs
            );

            if (fill.executedQty > 0 && !fill.isFinal) {
              // Still working when the timeout hit: cancel the remainder, then
              // re-read the order to capture the final executed quantity.
              try {
                await indodax.cancelOrder(pos.symbol, limitOrderId);
              } catch (cancelErr: any) {
                console.error(`[Live Sell CRITICAL] Limit sell ${limitOrderId} ${pos.symbol.toUpperCase()} tidak dapat dibatalkan: ${cancelErr.message}. Posisi dikunci untuk verifikasi manual.`);
                setSetting('is_auto_trading_active', '0');
                this.failOrderIntent(exitIntent.localId, `Cancel limit sell gagal: ${cancelErr.message}`);
                return failedSell(true);
              }
              fill = await indodax.waitForOrderFill(
                pos.symbol,
                limitOrderId,
                undefined,
                { requestedQty: amountToSell, expectedPrice: floorPrice },
                1500
              );
            }

            limitExecuted = Math.min(fill.executedQty, amountToSell);
            limitQuote = fill.quoteQty > 0 ? fill.quoteQty : limitExecuted * (fill.averagePrice || floorPrice);
            limitAvg = fill.averagePrice > 0 ? fill.averagePrice : (limitExecuted > 0 ? limitQuote / limitExecuted : 0);
            remainder = amountToSell - limitExecuted;

            if (limitExecuted > 0) {
              console.log(`[Floored Exit] ${pos.symbol.toUpperCase()} limit sell terisi ${limitExecuted.toFixed(8)} @ ~Rp ${Math.round(limitAvg).toLocaleString('id-ID')} (lantai Rp ${Math.floor(floorPrice).toLocaleString('id-ID')}).`);
            }
          } catch (limitErr: any) {
            // Limit placement failed entirely: fall back to the market path so
            // the exit still happens (identical to pre-collar behavior).
            console.warn(`[Floored Exit Fallback] Limit sell gagal untuk ${pos.symbol.toUpperCase()}: ${limitErr.message}. Melanjutkan dengan MARKET SELL.`);
            this.failOrderIntent(exitIntent.localId, `Limit sell gagal, fallback market: ${limitErr.message}`);
            remainder = amountToSell;
          }
        } else {
          this.failOrderIntent(exitIntent.localId, 'Floored exit disabled; market sell langsung');
          remainder = amountToSell;
        }

        // Market-sell whatever the floored limit could not fill.
        if (remainder > 0) {
          const minTradeIdr = indodax.getMinTradeIdr(pos.symbol);
          const remainderValue = remainder * Math.max(price, 1);
          if (limitExecuted > 0 && remainderValue < minTradeIdr) {
            // Dust remainder below the exchange minimum can never be sold.
            // Keep the (already reduced) position open and flag it for review;
            // the shared accounting below still records the limit fill.
            console.warn(`[Live Sell Dust] Sisa ${remainder.toFixed(8)} ${pos.symbol.toUpperCase()} bernilai di bawah minimum bursa. Sisa posisi ditandai untuk review manual.`);
            this.markPositionUnprotected(pos.id, `Dust remainder ${remainder.toFixed(8)} di bawah minimum order bursa`);
            this.resolveOrderIntent(exitIntent.localId, `Limit terisi ${limitExecuted.toFixed(8)}; sisa ${remainder.toFixed(8)} dust di bawah minimum`);
            filledAmount = limitExecuted;
            proceedsIdr = limitQuote;
            averagePrice = limitAvg || price;
          } else {
            const marketIntent = this.recordOrderIntent(
              intentKind,
              pos.symbol,
              'SELL',
              'MARKET',
              { quantity: remainder, reason: `${reason} (market remainder)` },
              pos.id
            );
            let marketOrder: any;
            try {
              marketOrder = await indodax.createOrder({
                symbol: pos.symbol,
                side: 'SELL',
                type: 'MARKET',
                quantity: remainder,
                newClientOrderId: marketIntent.clientOrderId,
              });
            } catch (orderErr: any) {
              this.failOrderIntent(marketIntent.localId, `createOrder gagal: ${orderErr?.message}`);
              throw orderErr;
            }
            const marketOrderId = String(marketOrder.orderId || marketOrder.order_id || '');
            this.ackOrderIntent(marketIntent.localId, marketOrderId, marketIntent.clientOrderId);
            if (!limitExecuted) orderId = marketOrderId || marketIntent.clientOrderId;

            let fill = await indodax.waitForOrderFill(
              pos.symbol,
              marketOrderId,
              marketOrder,
              { requestedQty: remainder, expectedPrice: price },
              5000
            );

            if (fill.executedQty <= 0 && !fill.isFinal) {
              console.warn(`[Live Sell Pending] Order ${marketOrderId} ${pos.symbol.toUpperCase()} belum terkonfirmasi (status ${fill.status}). Mencoba membatalkan.`);
              try {
                await indodax.cancelOrder(pos.symbol, marketOrderId);
              } catch (cancelErr: any) {
                console.error(`[Live Sell CRITICAL] Order ${marketOrderId} ${pos.symbol.toUpperCase()} tidak dapat dikonfirmasi maupun dibatalkan: ${cancelErr.message}. Posisi dikunci untuk verifikasi manual.`);
                setSetting('is_auto_trading_active', '0');
                this.failOrderIntent(marketIntent.localId, `Cancel market sell gagal: ${cancelErr.message}`);
                this.resolveOrderIntent(exitIntent.localId, `Limit terisi ${limitExecuted.toFixed(8)} sebelum market remainder gagal`);
                return failedSell(true);
              }
              fill = await indodax.waitForOrderFill(
                pos.symbol,
                marketOrderId,
                undefined,
                { requestedQty: remainder, expectedPrice: price },
                1500
              );
            }

            if (fill.executedQty <= 0 && limitExecuted <= 0) {
              console.error(`[Live Sell Not Filled] Order ${marketOrderId} ${pos.symbol.toUpperCase()} tidak terisi (status ${fill.status}). Posisi tetap terbuka.`);
              this.resolveOrderIntent(marketIntent.localId, `Order tidak terisi (status ${fill.status})`);
              return failedSell(!fill.isFinal);
            }

            // The limit portion is final even if the market remainder failed.
            if (fill.executedQty <= 0) {
              this.resolveOrderIntent(exitIntent.localId, `Limit terisi ${limitExecuted.toFixed(8)}; market remainder tidak terisi`);
            }

            const marketFilled = Math.min(fill.executedQty, remainder);
            const marketQuote = fill.quoteQty > 0 ? fill.quoteQty : marketFilled * (fill.averagePrice || price);
            filledAmount = limitExecuted + marketFilled;
            proceedsIdr = limitQuote + marketQuote;
            averagePrice = filledAmount > 0 ? proceedsIdr / filledAmount : price;
            this.resolveOrderIntent(exitIntent.localId, `Limit terisi ${limitExecuted.toFixed(8)} + market ${marketFilled.toFixed(8)}`);
            this.resolveOrderIntent(marketIntent.localId, `Market remainder terisi ${marketFilled.toFixed(8)}`);

            if (!fill.verified && marketFilled > 0) {
              console.warn(`[Live Sell Unverified] Order ${marketOrderId} tidak menyertakan executedQty/status final; memakai estimasi fill (${marketFilled.toFixed(8)} @ Rp ${fill.averagePrice || price}).`);
            } else if (marketFilled < remainder * 0.999) {
              console.warn(`[Live Sell Partial] Diminta ${remainder.toFixed(8)} ${pos.symbol.toUpperCase()}, terisi ${marketFilled.toFixed(8)}.`);
            }
          }
        } else {
          filledAmount = limitExecuted;
          proceedsIdr = limitQuote;
          averagePrice = limitAvg || price;
          this.resolveOrderIntent(exitIntent.localId, `Limit sell terisi penuh ${limitExecuted.toFixed(8)}`);
        }

        if (filledAmount <= 0) {
          console.error(`[Live Sell Not Filled] ${pos.symbol.toUpperCase()} tidak terisi sama sekali. Posisi tetap terbuka.`);
          return failedSell(true);
        }
      } catch (err: any) {
        // STRICT: Jika order jual gagal di bursa, jangan tutup posisi.
        console.error(`[Live Sell Failed] Gagal mengirim order jual ke Indodax untuk ${pos.symbol}: ${err.message}`);
        return failedSell();
      }
    }

    const feeIdr = proceedsIdr * feeRate;
    try {
      db.prepare(`
        INSERT INTO trades_history (id, position_id, symbol, type, price, amount, total_idr, fee_idr, mode, order_id, reason, timestamp)
        VALUES (?, ?, ?, 'SELL', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `trade_${Date.now()}`,
        pos.id,
        pos.symbol,
        averagePrice,
        filledAmount,
        proceedsIdr,
        feeIdr,
        pos.mode,
        orderId,
        reason,
        Date.now()
      );
      historyRecorded = true;
    } catch (err: any) {
      // The exchange order already executed; failing to persist history must never
      // trigger a second sell attempt on the next tick.
      console.error(`[CRITICAL] Order jual ${pos.symbol} sudah dieksekusi tetapi gagal dicatat di trades_history:`, err?.message);
    }

    if (this.onTradeEventCallback) {
      this.onTradeEventCallback({
        type: 'SELL',
        data: { symbol: pos.symbol, price: averagePrice, amount: filledAmount, totalIdr: proceedsIdr, mode: pos.mode, reason },
      });
    }

    return {
      ok: true,
      filledAmount,
      proceedsIdr,
      averagePrice,
      fullyFilled: filledAmount >= amountToSell * 0.999999,
      pendingReview,
      historyRecorded,
    };
  }

  /**
   * Sells `fraction` of an ALREADY EXIT-CLAIMED position and updates the
   * remainder in place. Shared by the TP1 scale-out and the drawdown de-risk
   * path. Returns true when the sell executed (fully or partially).
   */
  private async sellPositionFraction(
    claimed: PositionRecord,
    fraction: number,
    currentPrice: number,
    reason: string,
    intentKind: 'partial_tp' | 'derisk' = 'partial_tp'
  ): Promise<boolean> {
    const sellAmount = claimed.amount * fraction;

    if (fraction >= 0.999999) {
      return this.closePositionUnlocked(claimed, currentPrice, reason, { intentKind: intentKind === 'partial_tp' ? 'partial_tp' : 'derisk' });
    }

    // A fraction below the exchange minimum would fail forever and leave the
    // position unhandled; exit the whole position instead.
    if (sellAmount * currentPrice < indodax.getMinTradeIdr(claimed.symbol)) {
      console.warn(`[Partial Exit] Fraksi posisi ${claimed.symbol.toUpperCase()} di bawah minimum bursa. Menutup seluruh posisi.`);
      return this.closePositionUnlocked(
        claimed,
        currentPrice,
        `${reason} (nilai parsial di bawah minimum bursa — ditutup penuh)`,
        { intentKind: intentKind === 'partial_tp' ? 'partial_tp' : 'derisk' }
      );
    }

    let sold = false;
    let keepClaim = false;
    try {
      const sell = await this.executeSell(
        claimed,
        sellAmount,
        currentPrice,
        reason,
        { intentKind }
      );

      if (!sell.ok) {
        keepClaim = sell.pendingReview;
        if (keepClaim) {
          console.error(`[Partial Exit CRITICAL] Order parsial ${claimed.symbol.toUpperCase()} belum final. Claim dipertahankan agar tidak terjadi jual ganda.`);
        }
        return false;
      }
      sold = true;

      const remainingAmount = claimed.amount - sell.filledAmount;
      const epsilon = claimed.amount * 1e-8;

      if (remainingAmount <= epsilon) {
        return this.finalizeClosedPosition(
          claimed,
          sell.averagePrice || currentPrice,
          reason,
          sell.proceedsIdr,
          sell.historyRecorded
        );
      }

      if (remainingAmount * currentPrice < indodax.getMinTradeIdr(claimed.symbol)) {
        this.markPositionUnprotected(claimed.id, `Sisa ${remainingAmount.toFixed(8)} di bawah minimum order bursa setelah partial exit`);
      }

      const feeRate = getTakerFeeRate();
      const soldFraction = claimed.amount > 0 ? sell.filledAmount / claimed.amount : 0;
      const soldCost = claimed.initial_cost_idr * soldFraction;
      const remainingCost = claimed.initial_cost_idr - soldCost;
      const realizedDelta = Math.round(
        (sell.proceedsIdr - sell.proceedsIdr * feeRate) - (soldCost * (1 + feeRate))
      );

      const markPrice = sell.averagePrice || currentPrice;
      const { pnlIdr, pnlPercent } = markToMarket(
        { entry_price: claimed.entry_price, amount: remainingAmount, initial_cost_idr: remainingCost },
        markPrice,
        feeRate
      );
      this.stmtUpdatePosTp1.run(
        remainingAmount,
        remainingCost,
        markPrice,
        Math.max(currentPrice, markPrice),
        claimed.entry_price,
        pnlIdr,
        pnlPercent,
        realizedDelta,
        claimed.id
      );
      return true;
    } finally {
      if (!sold && !keepClaim) this.releasePositionClaim(claimed.id);
    }
  }

  /**
   * Partial take-profit. The exit claim guarantees only one flow can scale out.
   * The claim is retained if the post-sell DB update fails, so a retry cannot
   * double-sell; startup reconciliation resolves any leftover claim.
   */
  private async executePartialTakeProfit(
    pos: PositionRecord,
    currentPrice: number,
    targetTp1: number
  ): Promise<boolean> {
    const claimed = this.claimPositionForExit(pos.id);
    if (!claimed) return false;

    // TP1 scale-out fraction: 50 (default) banks half and rides the rest to
    // the breakeven stop; 100 exits everything at TP1 (no remainder to
    // protect). Values outside 1..100 fall back to 50.
    const fractionPct = parseFloat(getSetting('tp1_sell_fraction_percent', '50'));
    const fraction = Number.isFinite(fractionPct) && fractionPct >= 1 && fractionPct <= 100
      ? fractionPct / 100
      : 0.5;

    return this.sellPositionFraction(
      claimed,
      fraction,
      currentPrice,
      `Partial Take-Profit (+${targetTp1}% Target 1, jual ${(fraction * 100).toFixed(0)}%)`,
      'partial_tp'
    );
  }

  public async closePosition(pos: PositionRecord, exitPrice: number, exitReason: string, opts: { intentKind?: 'exit' | 'partial_tp' | 'panic' | 'derisk' } = {}): Promise<boolean> {
    return this.withPositionLock(pos.id, () => this.closePositionUnlocked(pos, exitPrice, exitReason, { intentKind: opts.intentKind || 'exit' }));
  }

  private async closePositionUnlocked(
    pos: PositionRecord,
    exitPrice: number,
    exitReason: string,
    opts: { floorPrice?: number; intentKind?: 'exit' | 'partial_tp' | 'panic' | 'derisk' } = {}
  ): Promise<boolean> {
    const claimed = this.claimPositionForExit(pos.id);
    if (!claimed) {
      // Already closed or another flow owns the exit
      return false;
    }

    // A position worth less than the exchange minimum can never be sold whole;
    // retrying every loop would only spam failed orders. Flag it for manual
    // review instead of entering a permanent failure loop.
    if (claimed.mode === 'live' && claimed.amount * exitPrice < indodax.getMinTradeIdr(claimed.symbol)) {
      this.releasePositionClaim(claimed.id);
      this.markPositionUnprotected(claimed.id, `Nilai posisi Rp ${Math.round(claimed.amount * exitPrice).toLocaleString('id-ID')} di bawah minimum order bursa`);
      console.warn(`[Close Position Skipped] ${claimed.symbol.toUpperCase()} bernilai di bawah minimum bursa. Posisi ditandai untuk review manual.`);
      return false;
    }

    let sold = false;
    let keepClaim = false;
    try {
      const sell = await this.executeSell(claimed, claimed.amount, exitPrice, exitReason, {
        floorPrice: opts.floorPrice,
        intentKind: opts.intentKind || 'exit',
      });

      if (!sell.ok) {
        keepClaim = sell.pendingReview;
        if (keepClaim) {
          console.error(`[Close Position CRITICAL] Order jual ${claimed.symbol.toUpperCase()} belum final. Claim dipertahankan agar tidak terjadi jual ganda.`);
        } else {
          console.error(`[Close Position Aborted] Order jual gagal dieksekusi di bursa. Posisi ${claimed.symbol.toUpperCase()} tetap 'open' untuk dicoba kembali.`);
        }
        return false;
      }
      sold = true;

      if (!sell.fullyFilled) {
        const remainingAmount = claimed.amount - sell.filledAmount;
        const epsilon = claimed.amount * 1e-8;

        if (remainingAmount <= epsilon) {
          return this.finalizeClosedPosition(
            claimed,
            sell.averagePrice || exitPrice,
            exitReason,
            sell.proceedsIdr,
            sell.historyRecorded
          );
        }

        const feeRate = getTakerFeeRate();
        const soldFraction = claimed.amount > 0 ? sell.filledAmount / claimed.amount : 0;
        const soldCost = claimed.initial_cost_idr * soldFraction;
        const remainingCost = claimed.initial_cost_idr - soldCost;
        const realizedDelta = Math.round(
          (sell.proceedsIdr - sell.proceedsIdr * feeRate) - (soldCost * (1 + feeRate))
        );

        db.prepare(`
          UPDATE positions SET
            amount = ?,
            initial_cost_idr = ?,
            current_price = ?,
            realized_pnl_idr = COALESCE(realized_pnl_idr, 0) + ?,
            exit_claimed_at = NULL
          WHERE id = ? AND status = 'open'
        `).run(remainingAmount, remainingCost, sell.averagePrice || exitPrice, realizedDelta, claimed.id);

        console.warn(`[Close Position Partial] ${claimed.symbol.toUpperCase()} hanya terisi ${sell.filledAmount.toFixed(8)} dari ${claimed.amount.toFixed(8)}. Sisa ${remainingAmount.toFixed(8)} tetap dikelola.`);
        return false;
      }

      return this.finalizeClosedPosition(
        claimed,
        sell.averagePrice || exitPrice,
        exitReason,
        sell.proceedsIdr,
        sell.historyRecorded
      );
    } finally {
      if (!sold && !keepClaim) this.releasePositionClaim(claimed.id);
    }
  }

  /**
   * Marks a position closed using the actual sale proceeds. Net PnL is derived
   * from all recorded BUY/SELL cash flows (including fees) when available.
   */
  private finalizeClosedPosition(
    pos: PositionRecord,
    exitPrice: number,
    exitReason: string,
    proceedsIdr?: number,
    historyRecorded = true
  ): boolean {
    const flows = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'SELL' THEN total_idr - fee_idr ELSE 0 END), 0) AS sell_net,
        COALESCE(SUM(CASE WHEN type = 'BUY' THEN total_idr + fee_idr ELSE 0 END), 0) AS buy_cost
      FROM trades_history
      WHERE position_id = ?
    `).get(pos.id) as { sell_net: number; buy_cost: number };

    let costBasis = flows.buy_cost;
    let netProceeds = flows.sell_net;

    if (costBasis <= 0) {
      // Legacy/test positions without a recorded BUY: fall back to position data
      const feeRate = getTakerFeeRate();
      costBasis = pos.initial_cost_idr * (1 + feeRate);
      const gross = proceedsIdr && proceedsIdr > 0 ? proceedsIdr : exitPrice * pos.amount;
      netProceeds = gross * (1 - feeRate);
    } else if (!historyRecorded && proceedsIdr && proceedsIdr > 0) {
      // The final sell executed but its history row failed to persist. Keep PnL
      // accurate using actual proceeds instead of reporting a phantom loss.
      netProceeds += proceedsIdr * (1 - getTakerFeeRate());
    }

    const pnlIdr = Math.round(netProceeds - costBasis);
    const pnlPercent = costBasis > 0 ? (pnlIdr / costBasis) * 100 : 0;
    const holdDurationMinutes = Math.round((Date.now() - pos.opened_at) / 60000);

    const result = db.prepare(`
      UPDATE positions SET
        status = 'closed',
        closed_at = ?,
        current_price = ?,
        pnl_idr = ?,
        pnl_percent = ?,
        exit_reason = ?,
        exit_claimed_at = NULL
      WHERE id = ? AND status = 'open'
    `).run(Date.now(), exitPrice, pnlIdr, pnlPercent, exitReason, pos.id);

    if (result.changes !== 1) {
      console.error(`[CRITICAL] Posisi ${pos.symbol.toUpperCase()} sudah dijual tetapi gagal difinalisasi di database. Claim dipertahankan untuk rekonsiliasi.`);
    }

    this.refreshOpenSymbols();

    console.log(`[POSITION CLOSED] ${pos.symbol.toUpperCase()} | PnL: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% (Rp ${pnlIdr.toLocaleString('id-ID')}) | Alasan: ${exitReason}`);

    // Trigger AI Post-Mortem Reviewer (Self-Learning Memory Loop)
    agentSwarm.reviewClosedTrade({
      symbol: pos.symbol,
      entryPrice: pos.entry_price,
      exitPrice,
      pnlPercent,
      holdDurationMinutes,
      exitReason,
    });

    return true;
  }

  // --- Panic Sell All Positions Immediately ---

  public async panicSellAll(): Promise<number> {
    // Stop new entries before liquidating so the scanner cannot open a fresh
    // position while panic selling is in progress.
    setSetting('is_auto_trading_active', '0');

    const openPositions = db.prepare("SELECT * FROM positions WHERE status = 'open'").all() as PositionRecord[];
    let closedCount = 0;

    for (const pos of openPositions) {
      try {
        const ticker = await indodax.getTicker(pos.symbol);
        const currentPrice = parseFloat(ticker.ticker.last) || pos.current_price;
        const closed = await this.closePosition(pos, currentPrice, 'EMERGENCY PANIC SELL TRIGGERED VIA COMMAND', { intentKind: 'panic' });
        if (closed) closedCount++;
      } catch (err) {
        console.error(`Gagal panic sell ${pos.symbol}:`, err);
      }
    }

    return closedCount;
  }

  /**
   * Mode-scoped equity snapshot. Only positions opened by this engine in the
   * requested mode are counted; paper and live exposure are never mixed.
   * Live cash is read from Indodax and any API failure is surfaced so callers
   * can fail closed instead of silently substituting the paper balance.
   */
  public async getEquitySnapshot(mode?: 'paper' | 'live'): Promise<EquitySnapshot> {
    const activeMode: 'paper' | 'live' =
      mode ?? (getSetting('trading_mode', 'paper') === 'live' ? 'live' : 'paper');
    const feeRate = getTakerFeeRate();

    const positions = db.prepare(
      "SELECT * FROM positions WHERE status = 'open' AND mode = ?"
    ).all(activeMode) as PositionRecord[];

    let cashFreeIdr: number;
    let cashLockedIdr: number;
    if (activeMode === 'live') {
      const account = await indodax.getAccountInfo();
      if (!Array.isArray(account?.balances)) {
        throw new Error('Indodax account response did not include balances');
      }
      const idrEntry = account.balances.find((b: any) => String(b.asset).toUpperCase() === 'IDR');
      cashFreeIdr = idrEntry ? parseFloat(idrEntry.free) || 0 : 0;
      cashLockedIdr = idrEntry ? parseFloat(idrEntry.locked) || 0 : 0;
    } else {
      cashFreeIdr = parseFloat(getSetting('paper_idr_balance', '10000000'));
      cashLockedIdr = 0;
      if (!Number.isFinite(cashFreeIdr)) {
        throw new Error('Paper balance setting is invalid');
      }
    }
    const cashIdr = cashFreeIdr + cashLockedIdr;

    let holdingsValueIdr = 0;
    let floatingPnlIdr = 0;
    for (const pos of positions) {
      const markPrice = pos.current_price > 0 ? pos.current_price : pos.entry_price;
      holdingsValueIdr += markPrice * pos.amount * (1 - feeRate);
      const { pnlIdr } = markToMarket(pos, markPrice, feeRate);
      floatingPnlIdr += pnlIdr + (pos.realized_pnl_idr || 0);
    }

    return {
      mode: activeMode,
      cashIdr,
      cashFreeIdr,
      cashLockedIdr,
      holdingsValueIdr,
      equityIdr: cashIdr + holdingsValueIdr,
      floatingPnlIdr,
      openPositions: positions.length,
    };
  }

  // --- Mathematically Sound Circuit Breaker Protection ---

  public async checkDailyCircuitBreaker(): Promise<boolean> {
    const dailyLimitPercent = parseFloat(getSetting('daily_loss_limit_percent', '5.0'));
    const triggeredAtStr = getSetting('circuit_breaker_triggered_at', '0');
    const triggeredAt = parseInt(triggeredAtStr, 10);
    const now = Date.now();

    // Check if 24 hours cooldown has passed
    if (triggeredAt > 0) {
      const hoursElapsed = (now - triggeredAt) / (1000 * 60 * 60);
      if (hoursElapsed < 24) {
        console.log(`[Circuit Breaker Active] Cooldown 24 jam masih berjalan (${(24 - hoursElapsed).toFixed(1)} jam tersisa). Auto-trading ditahan.`);
        return true;
      } else {
        // 24 hours passed, reset cooldown
        setSetting('circuit_breaker_triggered_at', '0');
        console.log(`[Circuit Breaker Reset] Cooldown 24 jam selesai. Memeriksa kembali kondisi portofolio.`);
      }
    }

    const mode: 'paper' | 'live' = getSetting('trading_mode', 'paper') === 'live' ? 'live' : 'paper';
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let snapshot: EquitySnapshot;
    try {
      snapshot = await this.getEquitySnapshot(mode);
    } catch (err: any) {
      // Fail closed: without a trustworthy live equity reading, new entries
      // must not proceed. Never substitute the paper balance for live funds.
      console.error(`[Circuit Breaker] Gagal membaca equity ${mode.toUpperCase()}: ${err?.message}. Pembukaan posisi baru diblokir (fail-closed).`);
      if (now - this.lastEquityFailureAlertAt > 15 * 60 * 1000) {
        this.lastEquityFailureAlertAt = now;
        if (this.onTradeEventCallback) {
          this.onTradeEventCallback({
            type: 'ALERT',
            data: {
              title: 'Circuit Breaker Check Failed (Fail-Closed)',
              message: `Equity ${mode.toUpperCase()} tidak dapat diverifikasi (${err?.message}). Bot menahan semua entry baru sampai saldo dapat dibaca kembali.`,
            },
          });
        }
      }
      return true;
    }

    // 1. Realized net PnL from positions closed today in THIS mode
    const realized = db.prepare(`
      SELECT COALESCE(SUM(pnl_idr), 0) as total_pnl_idr
      FROM positions
      WHERE status = 'closed' AND closed_at >= ? AND mode = ?
    `).get(startOfDay.getTime(), mode) as { total_pnl_idr: number };

    // 2. Floating net PnL (including already-banked partial TP profits) is
    // computed from current marks in getEquitySnapshot, not from stale rows.
    const totalPnlIdrToday = (realized.total_pnl_idr || 0) + snapshot.floatingPnlIdr;

    // 3. Day-start equity is today's equity minus all PnL accrued today.
    const dayStartEquity = Math.max(snapshot.equityIdr - totalPnlIdrToday, 1);

    if (totalPnlIdrToday < 0) {
      const lossPercent = (Math.abs(totalPnlIdrToday) / dayStartEquity) * 100;

      if (lossPercent >= dailyLimitPercent) {
        console.warn(`[CIRCUIT BREAKER TRIGGERED] Akumulasi rugi hari ini (${mode}): Rp ${Math.abs(totalPnlIdrToday).toLocaleString('id-ID')} (${lossPercent.toFixed(2)}% >= limit ${dailyLimitPercent}%). Menahan pembukaan posisi baru selama 24 jam.`);
        setSetting('circuit_breaker_triggered_at', String(now));

        if (this.onTradeEventCallback) {
          this.onTradeEventCallback({
            type: 'ALERT',
            data: {
              title: 'Daily Circuit Breaker Triggered (24h Cooldown)',
              message: `Trading otomatis (${mode.toUpperCase()}) dihentikan selama 24 jam karena akumulasi kerugian hari ini mencapai ${lossPercent.toFixed(2)}% (Rp ${Math.abs(totalPnlIdrToday).toLocaleString('id-ID')}). Modal Anda terlindungi.`,
            },
          });
        }
        return true;
      }
    }

    // 4. Drawdown kill switch (peak-to-trough) + absolute equity floor.
    // Unlike the daily breaker this catches a slow multi-day bleed and only
    // resets via the manual /api/trading/drawdown-reset endpoint.
    await this.evaluateDrawdownKillSwitch(mode, snapshot);
    if (parseInt(getSetting('drawdown_halt_since', '0'), 10) > 0) {
      return true;
    }

    return false;
  }

  /**
   * Tracks the mode-scoped equity peak and evaluates the drawdown kill switch.
   * On breach: auto-trading halts, an alert fires, and the configured de-risk
   * mode runs ('halt' entries only, 'halve' sells 50% of every position,
   * 'flatten' liquidates everything). Reset is manual via the dashboard API.
   */
  private async evaluateDrawdownKillSwitch(mode: 'paper' | 'live', snapshot: EquitySnapshot): Promise<void> {
    const now = Date.now();
    const maxDdPct = parseFloat(getSetting('max_drawdown_percent', '15'));
    const equityFloor = parseFloat(getSetting('equity_floor_idr', '0'));
    const peakKey = mode === 'live' ? 'equity_peak_live' : 'equity_peak_paper';
    let peak = parseFloat(getSetting(peakKey, '0'));
    if (!Number.isFinite(peak) || peak < 0) peak = 0;

    if (snapshot.equityIdr > peak) {
      setSetting(peakKey, String(Math.round(snapshot.equityIdr)));
      peak = snapshot.equityIdr;
    }

    const ddGate = checkMaxDrawdown(snapshot.equityIdr, peak, maxDdPct, equityFloor);
    if (ddGate.passed) {
      logEntryGate('*', 'drawdown_kill_switch', true, ddGate.values);
      return;
    }

    const haltSince = parseInt(getSetting('drawdown_halt_since', '0'), 10);
    if (haltSince > 0) {
      // Already halted; the alert and de-risk ran when it first tripped.
      logEntryGate('*', 'drawdown_kill_switch', false, ddGate.values);
      return;
    }

    console.error(`[DRAWDOWN KILL SWITCH] ${ddGate.reason} (${mode.toUpperCase()}). Auto-trading dihentikan sampai reset manual.`);
    setSetting('drawdown_halt_since', String(now));
    setSetting('is_auto_trading_active', '0');
    logEntryGate('*', 'drawdown_kill_switch', false, ddGate.values);

    const deriskMode = getSetting('derisk_mode_on_drawdown', 'halt');
    let deriskNote = 'Posisi terbuka tetap dikelola trailing stop.';
    try {
      if (deriskMode === 'flatten') {
        const closed = await this.panicSellAll();
        deriskNote = `Semua posisi dilikuidasi (${closed} posisi ditutup) sesuai mode de-risk flatten.`;
      } else if (deriskMode === 'halve') {
        await this.deriskHalvePositions(mode);
        deriskNote = 'Setiap posisi dikurangi 50% sesuai mode de-risk halve.';
      }
    } catch (err: any) {
      deriskNote = `De-risk gagal dijalankan: ${err?.message}. Posisi tetap dikelola trailing stop.`;
    }

    if (this.onTradeEventCallback) {
      this.onTradeEventCallback({
        type: 'ALERT',
        data: {
          title: 'Drawdown Kill Switch Triggered (Reset Manual)',
          message: `${ddGate.reason} (${mode.toUpperCase()}). Auto-trading dihentikan. ${deriskNote} Reset manual: dashboard → POST /api/trading/drawdown-reset.`,
        },
      });
    }
  }

  /**
   * De-risk 'halve': sells 50% of every open position in the given mode so a
   * drawdown breach actively reduces exposure instead of only blocking entries.
   */
  private async deriskHalvePositions(mode: 'paper' | 'live'): Promise<void> {
    const positions = db.prepare("SELECT * FROM positions WHERE status = 'open' AND mode = ?").all(mode) as PositionRecord[];
    for (const snapshot of positions) {
      try {
        await this.withPositionLock(snapshot.id, async () => {
          const fresh = this.getOpenPosition(snapshot.id);
          if (!fresh || fresh.exit_claimed_at) return;
          const claimed = this.claimPositionForExit(fresh.id);
          if (!claimed) return;
          const mark = fresh.current_price > 0 ? fresh.current_price : fresh.entry_price;
          const ok = await this.sellPositionFraction(claimed, 0.5, mark, 'De-Risk Drawdown: posisi dikurangi 50%', 'derisk');
          if (!ok) {
            console.warn(`[Drawdown De-Risk] Pengurangan 50% ${fresh.symbol.toUpperCase()} belum selesai; akan dicoba ulang pada reset berikutnya.`);
          }
        });
      } catch (err: any) {
        console.warn(`[Drawdown De-Risk] Gagal memproses ${snapshot.symbol}:`, err?.message);
      }
    }
  }

  /**
   * Manual reset of the drawdown kill switch (admin endpoint). The equity peak
   * is re-based to the current equity so the kill switch measures from today,
   * not from an old peak that would instantly re-trigger.
   */
  public async resetDrawdownKillSwitch(): Promise<{ cleared: boolean; mode: 'paper' | 'live'; equityIdr: number }> {
    const mode: 'paper' | 'live' = getSetting('trading_mode', 'paper') === 'live' ? 'live' : 'paper';
    const snapshot = await this.getEquitySnapshot(mode);
    setSetting('drawdown_halt_since', '0');
    setSetting(mode === 'live' ? 'equity_peak_live' : 'equity_peak_paper', String(Math.round(snapshot.equityIdr)));
    console.log(`[Drawdown Kill Switch] Reset manual. Peak equity ${mode.toUpperCase()} di-rebase ke Rp ${Math.round(snapshot.equityIdr).toLocaleString('id-ID')}.`);
    return { cleared: true, mode, equityIdr: snapshot.equityIdr };
  }

  // --- A/B Counterfactual AI Validation Metrics ---

  public getAbValidationMetrics(): AbValidationMetrics {
    const evalCountRow = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ai_verdict = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN ai_verdict = 'REJECTED' THEN 1 ELSE 0 END) as rejected
      FROM ai_ab_evaluations
    `).get() as { total: number; approved: number | null; rejected: number | null };

    const totalEvaluations = evalCountRow?.total || 0;
    const approvedCount = evalCountRow?.approved || 0;
    const rejectedCount = evalCountRow?.rejected || 0;
    const approvalRatePercent = totalEvaluations > 0 ? (approvedCount / totalEvaluations) * 100 : 0;
    const rejectionRatePercent = totalEvaluations > 0 ? (rejectedCount / totalEvaluations) * 100 : 0;

    // Group A: Real/Paper positions executed with AI approval (status = 'closed')
    const groupARow = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pnl_idr > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN pnl_idr < 0 THEN 1 ELSE 0 END) as losses,
        SUM(pnl_idr) as totalPnlIdr,
        AVG(pnl_percent) as avgPnlPercent
      FROM positions
      WHERE status = 'closed'
    `).get() as { total: number; wins: number | null; losses: number | null; totalPnlIdr: number | null; avgPnlPercent: number | null };

    const aTotal = groupARow?.total || 0;
    const aWins = groupARow?.wins || 0;
    const aLosses = groupARow?.losses || 0;
    const aPnl = groupARow?.totalPnlIdr || 0;
    const aAvgPnl = groupARow?.avgPnlPercent || 0;
    const aWinRate = aTotal > 0 ? (aWins / aTotal) * 100 : 0;

    // Group B: Counterfactual ghost trades from rejected signals
    const ghostCountRow = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as openCount,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closedCount,
        SUM(CASE WHEN simulated_outcome = 'BULLET_DODGED' THEN 1 ELSE 0 END) as bulletsDodged,
        SUM(CASE WHEN simulated_outcome = 'OPPORTUNITY_MISSED' THEN 1 ELSE 0 END) as opportunitiesMissed,
        SUM(CASE WHEN simulated_outcome = 'BULLET_DODGED' THEN ABS(pnl_idr) ELSE 0 END) as savedCapitalIdr,
        SUM(CASE WHEN simulated_outcome = 'OPPORTUNITY_MISSED' THEN pnl_idr ELSE 0 END) as missedProfitIdr,
        SUM(CASE WHEN status = 'closed' AND pnl_idr > 0 THEN 1 ELSE 0 END) as ghostWins,
        SUM(CASE WHEN status = 'closed' THEN pnl_idr ELSE 0 END) as counterfactualPnlIdr
      FROM ghost_positions
    `).get() as {
      total: number;
      openCount: number | null;
      closedCount: number | null;
      bulletsDodged: number | null;
      opportunitiesMissed: number | null;
      savedCapitalIdr: number | null;
      missedProfitIdr: number | null;
      ghostWins: number | null;
      counterfactualPnlIdr: number | null;
    };

    const bTotal = ghostCountRow?.total || 0;
    const bOpen = ghostCountRow?.openCount || 0;
    const bClosed = ghostCountRow?.closedCount || 0;
    const bulletsDodged = ghostCountRow?.bulletsDodged || 0;
    const opportunitiesMissed = ghostCountRow?.opportunitiesMissed || 0;
    const savedCapitalIdr = ghostCountRow?.savedCapitalIdr || 0;
    const missedProfitIdr = ghostCountRow?.missedProfitIdr || 0;
    const ghostWins = ghostCountRow?.ghostWins || 0;
    const counterfactualPnlIdr = ghostCountRow?.counterfactualPnlIdr || 0;
    const bWinRate = bClosed > 0 ? (ghostWins / bClosed) * 100 : 0;

    // Combined: Mechanical baseline if AI filter didn't exist
    const combinedTotal = aTotal + bClosed;
    const combinedWins = aWins + ghostWins;
    const combinedLosses = combinedTotal - combinedWins;
    const combinedWinRate = combinedTotal > 0 ? (combinedWins / combinedTotal) * 100 : 0;
    const combinedPnlIdr = aPnl + counterfactualPnlIdr;

    // Alpha metrics
    const winRateDeltaPercent = aTotal > 0 && combinedTotal > 0 ? aWinRate - combinedWinRate : 0;
    const pnlAlphaIdr = aPnl - combinedPnlIdr; // equals savedCapitalIdr - missedProfitIdr
    const dodgedLossRatioPercent = (bulletsDodged + opportunitiesMissed) > 0
      ? (bulletsDodged / (bulletsDodged + opportunitiesMissed)) * 100
      : 0;

    // Recent 15 evaluations with ghost position outcome joined
    const recentEvaluations = db.prepare(`
      SELECT
        e.*,
        g.status as ghost_status,
        g.simulated_outcome as ghost_outcome,
        g.pnl_percent as ghost_pnl_percent,
        g.pnl_idr as ghost_pnl_idr
      FROM ai_ab_evaluations e
      LEFT JOIN ghost_positions g ON g.evaluation_id = e.id
      ORDER BY e.timestamp DESC
      LIMIT 15
    `).all() as any[];

    const activeGhosts = db.prepare(`
      SELECT * FROM ghost_positions WHERE status = 'open' ORDER BY opened_at DESC
    `).all() as GhostPositionRecord[];

    return {
      totalEvaluations,
      approvedCount,
      rejectedCount,
      approvalRatePercent,
      rejectionRatePercent,
      groupAWithAi: {
        totalTrades: aTotal,
        wins: aWins,
        losses: aLosses,
        winRatePercent: aWinRate,
        totalPnlIdr: aPnl,
        avgPnlPercent: aAvgPnl,
      },
      groupBCounterfactual: {
        totalGhosts: bTotal,
        openGhosts: bOpen,
        closedGhosts: bClosed,
        bulletsDodged,
        savedCapitalIdr,
        opportunitiesMissed,
        missedProfitIdr,
        counterfactualWins: ghostWins,
        counterfactualWinRatePercent: bWinRate,
        counterfactualPnlIdr,
      },
      combinedWithoutAi: {
        totalTrades: combinedTotal,
        wins: combinedWins,
        losses: combinedLosses,
        winRatePercent: combinedWinRate,
        totalPnlIdr: combinedPnlIdr,
      },
      alpha: {
        winRateDeltaPercent,
        pnlAlphaIdr,
        dodgedLossRatioPercent,
      },
      recentEvaluations,
      activeGhosts,
    };
  }
}

export const tradingEngine = new TradingEngine();
