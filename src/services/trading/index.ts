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
  checkCircuitBreaker,
  checkExposure,
  checkBtcRegime,
  checkThreatScope,
  checkSlippageBudget,
  checkSpreadTrap,
  checkRsiGuard,
} from './riskGuard.js';
import { agentBus } from '../agents/bus.js';

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
  exit_reason: string | null;
  mode: 'paper' | 'live';
}

export class TradingEngine {
  private isRunning = false;
  private isProcessing = false; // In-flight guard
  private loopTimer: NodeJS.Timeout | null = null;
  private onTradeEventCallback?: (event: { type: 'BUY' | 'SELL' | 'ALERT'; data: any }) => void;
  private exitInProgress = new Set<string>();
  private openSymbolsSet = new Set<string>();
  private lastPruneTimestamp = 0;

  // Hoisted prepared statements to avoid SQL parsing overhead per realtime tick
  private stmtGetOpenPosByPair = db.prepare(`
    SELECT * FROM positions
    WHERE status = 'open' AND LOWER(REPLACE(REPLACE(symbol, '/', ''), '_', '')) = ?
  `);
  private stmtUpdatePosTick = db.prepare(`
    UPDATE positions SET
      current_price = ?,
      highest_price = ?,
      trailing_stop_price = ?,
      pnl_idr = ?,
      pnl_percent = ?
    WHERE id = ?
  `);
  private stmtUpdatePosTp1 = db.prepare(`
    UPDATE positions SET
      amount = ?,
      current_price = ?,
      highest_price = ?,
      trailing_stop_price = ?,
      take_profit_step = 1,
      pnl_idr = ?,
      pnl_percent = ?
    WHERE id = ?
  `);
  private stmtCountOpenPositions = db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'open'");

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
      if (this.exitInProgress.has(openPos.id)) return;

      const currentPrice = tick.price;
      const trailingStopPercent = parseFloat(getSetting('trailing_stop_percent', '2.5'));
      const targetTp1 = parseFloat(getSetting('take_profit_target_1_percent', '5.0'));

      let highestPrice = Math.max(openPos.highest_price, currentPrice);
      let trailingStopPrice = openPos.trailing_stop_price;
      let takeProfitStep = openPos.take_profit_step;

      // Ratchet Trailing Stop up (with post-TP1 decoupling)
      const computedTrailingStop = highestPrice * (1 - trailingStopPercent / 100);
      if (takeProfitStep >= 1) {
        const postTpFloor = Math.max(openPos.entry_price, computedTrailingStop);
        if (postTpFloor > trailingStopPrice) {
          trailingStopPrice = postTpFloor;
        }
      } else if (computedTrailingStop > trailingStopPrice) {
        trailingStopPrice = computedTrailingStop;
      }

      const pnlIdr = (currentPrice - openPos.entry_price) * openPos.amount;
      const pnlPercent = ((currentPrice - openPos.entry_price) / openPos.entry_price) * 100;

      // Sub-second Partial TP check
      if (pnlPercent >= targetTp1 && takeProfitStep === 0) {
        this.exitInProgress.add(openPos.id);
        try {
          const halfAmount = openPos.amount * 0.5;
          const sellOk = await this.executeSell(openPos, halfAmount, currentPrice, `Realtime Partial Take-Profit (+${targetTp1}% Target 1)`);
          if (sellOk) {
            trailingStopPrice = openPos.entry_price;
            highestPrice = currentPrice; // Decouple from pre-TP1 surge peak
            this.stmtUpdatePosTp1.run(halfAmount, currentPrice, highestPrice, trailingStopPrice, pnlIdr, pnlPercent, openPos.id);
          }
        } finally {
          this.exitInProgress.delete(openPos.id);
        }
        return;
      }

      // Sub-second Trailing Stop Loss check
      if (currentPrice <= trailingStopPrice) {
        this.exitInProgress.add(openPos.id);
        try {
          // Mark Price / Orderbook Confirmation Filter to prevent flash wick manipulation
          let confirmedExit = true;
          try {
            const depth = await indodax.getDepth(openPos.symbol);
            const bestBid = depth.buy && depth.buy[0] ? parseFloat(depth.buy[0][0]) : 0;
            if (bestBid > trailingStopPrice * 1.015) {
              console.log(`[Flash Wick Guard] Mengabaikan tick wick ${openPos.symbol} (Tick: Rp ${currentPrice.toLocaleString('id-ID')}, Best Bid: Rp ${bestBid.toLocaleString('id-ID')}). Trailing stop ditahan.`);
              confirmedExit = false;
            }
          } catch {
            // Default to confirm if depth unreachable
          }

          if (confirmedExit) {
            const exitReason = `⚡ Realtime Trailing Stop Loss tersentuh di Rp ${trailingStopPrice.toLocaleString('id-ID')} (PnL: ${pnlPercent.toFixed(2)}%)`;
            await this.closePosition(openPos, currentPrice, exitReason);
          }
        } finally {
          this.exitInProgress.delete(openPos.id);
        }
        return;
      }

      // Update highest price & trailing stop in database if price advanced
      if (highestPrice > openPos.highest_price || trailingStopPrice > openPos.trailing_stop_price) {
        this.stmtUpdatePosTick.run(currentPrice, highestPrice, trailingStopPrice, pnlIdr, pnlPercent, openPos.id);
      }
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
    const { coinSentiments } = agentSwarm.getAggregatedSentiment();

    for (const pos of positions) {
      if (this.exitInProgress.has(pos.id)) continue;

      try {
        let currentPrice = 0;
        try {
          const tickerData = await indodax.getTicker(pos.symbol);
          if (tickerData?.ticker?.last) {
            currentPrice = parseFloat(tickerData.ticker.last);
          }
        } catch {
          currentPrice = 0;
        }

        if (!currentPrice || currentPrice <= 0) continue;

        let highestPrice = Math.max(pos.highest_price, currentPrice);
        let trailingStopPrice = pos.trailing_stop_price;
        let takeProfitStep = pos.take_profit_step;

        // Recalculate dynamic trailing stop level (with post-TP1 decoupling)
        const computedTrailingStop = highestPrice * (1 - trailingStopPercent / 100);
        if (takeProfitStep >= 1) {
          const postTpFloor = Math.max(pos.entry_price, computedTrailingStop);
          if (postTpFloor > trailingStopPrice) {
            trailingStopPrice = postTpFloor;
          }
        } else if (computedTrailingStop > trailingStopPrice) {
          trailingStopPrice = computedTrailingStop;
        }

        const pnlIdr = (currentPrice - pos.entry_price) * pos.amount;
        const pnlPercent = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;

        // Scale-Out Partial Take-Profit (Target 1 threshold reached)
        const targetTp1 = parseFloat(getSetting('take_profit_target_1_percent', '5.0'));
        if (pnlPercent >= targetTp1 && takeProfitStep === 0) {
          this.exitInProgress.add(pos.id);
          try {
            const halfAmount = pos.amount * 0.5;
            const sellOk = await this.executeSell(pos, halfAmount, currentPrice, `Partial Take-Profit (+${targetTp1}% Target 1)`);

            if (!sellOk) {
              console.warn(`[Partial TP Aborted] Order jual parsial gagal di bursa untuk ${pos.symbol}. Posisi tidak diubah.`);
              continue;
            }

            // Move Stop Loss to breakeven (entry price) to ensure zero risk for remaining 50%
            trailingStopPrice = pos.entry_price;
            takeProfitStep = 1;
            highestPrice = currentPrice; // Decouple from pre-TP1 surge peak

            db.prepare(`
              UPDATE positions SET
                amount = ?,
                current_price = ?,
                highest_price = ?,
                trailing_stop_price = ?,
                take_profit_step = 1,
                pnl_idr = ?,
                pnl_percent = ?
              WHERE id = ?
            `).run(halfAmount, currentPrice, highestPrice, trailingStopPrice, pnlIdr, pnlPercent, pos.id);
            continue;
          } finally {
            this.exitInProgress.delete(pos.id);
          }
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
          this.exitInProgress.add(pos.id);
          try {
            await this.closePosition(pos, currentPrice, exitReason);
          } finally {
            this.exitInProgress.delete(pos.id);
          }
        } else {
          // Update position telemetry
          db.prepare(`
            UPDATE positions SET
              current_price = ?,
              highest_price = ?,
              trailing_stop_price = ?,
              pnl_idr = ?,
              pnl_percent = ?
            WHERE id = ?
          `).run(currentPrice, highestPrice, trailingStopPrice, pnlIdr, pnlPercent, pos.id);
        }
      } catch (err: any) {
        console.warn(`[Position Manager] Gagal memantau posisi ${pos.symbol}:`, err.message);
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

        // Account for realistic 0.4% round-trip taker fees (0.2% buy + 0.2% sell)
        const grossPnlIdr = (currentPrice - ghost.entry_price) * ghost.amount;
        const totalFeeIdr = (ghost.initial_cost_idr + (currentPrice * ghost.amount)) * 0.002;
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

    // 2. Open Position Slots
    const maxActive = parseInt(getSetting('max_active_trades', '3'), 10);
    const openCount = (this.stmtCountOpenPositions.get() as { count: number }).count;
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
    const mode = (getSetting('trading_mode', 'paper') as 'paper' | 'live');
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
          const sentiment = coinSentiments[symbol.toUpperCase()] ?? 0.0;
          const scoreRes = scoreOpportunity(features, sentiment, false, btcRegimeVerdict.regime, 'bluechip_pullback');

          db.prepare(`
            INSERT INTO opportunity_shortlist (id, ts, symbol, strategy, score, breakdown, consumed)
            VALUES (?, ?, ?, ?, ?, ?, 0)
          `).run(`opp_${Date.now()}_${symbol}`, Date.now(), symbol, 'bluechip_pullback', scoreRes.score, JSON.stringify(scoreRes.breakdown));

          agentBus.publish('opportunity.signal', 'scanner', { symbol, strategy: 'bluechip_pullback', score: scoreRes.score, features });

          const threshold = SCORE_THRESHOLDS.conservative;
          const passed = scoreRes.score >= threshold && (features.rsi14 === null || features.rsi14 <= 65);
          logEntryGate(symbol, 'candidate_filter', passed, {
            strategy: 'bluechip_pullback',
            score: scoreRes.score,
            threshold,
            breakdown: scoreRes.breakdown,
            rsi: features.rsi14,
          });

          if (passed) {
            if (!bestCandidate || scoreRes.score > bestCandidate.score) {
              bestCandidate = {
                symbol,
                score: scoreRes.score,
                reason: `Blue-Chip Pullback Konservatif (Skor: ${scoreRes.score}/100, RSI: ${features.rsi14 ?? 'N/A'}, Dip: ${features.dropFromHighPct}%)`,
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

    // Intraday Candlestick Indicators (15m Timeframe)
    let rsi15m: number | null = null;
    let ema20: number | null = null;
    try {
      const candles15m = await indodaxMarketStream.getRealCandles(candidateSymbol, '15m');
      if (candles15m && candles15m.length >= 15) {
        const closes = candles15m.map((c) => c.close);
        rsi15m = calculateRSI(closes, 14);
        ema20 = calculateEMA(closes, 20);

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
      }
    } catch {}

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
        }
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
   * Structured JSON evaluation with risk budget context and graceful deterministic degradation.
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
    }
  ): Promise<{ approved: boolean; reasoning: string }> {
    const aiMode = getSetting('ai_mode', 'confirm');
    if (aiMode === 'off') {
      return {
        approved: true,
        reasoning: 'Mode Deterministik (AI Off): Setup lolos seluruh konfirmasi kuantitatif deterministik.',
      };
    }

    try {
      if (!model) {
        if (aiMode === 'confirm') {
          console.log(`[AI Confirmation] Master Model AI belum dipilih di Settings, beralih ke deterministik (ai_mode: confirm).`);
          return { approved: true, reasoning: 'Master Model AI belum dipilih; setup dieksekusi secara deterministik.' };
        }
        return { approved: false, reasoning: 'Fail-closed: Master Model AI belum dipilih di Settings.' };
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
      if (aiMode === 'confirm') {
        console.warn(`[AI Confirmation Fallback] Error provider AI: ${err.message}. ai_mode: confirm beralih ke deterministik.`);
        return {
          approved: true,
          reasoning: `AI Offline fallback (ai_mode: confirm): ${err.message}`,
        };
      }
      console.warn(`[AI Confirmation Failed] Fail-closed diaktifkan, membatalkan entry ${symbol}:`, err.message);
      return {
        approved: false,
        reasoning: `Fail-closed trigger: ${err.message}`,
      };
    }
  }

  public async askAiEntryConfirmation(
    symbol: string,
    price: number,
    sentiment: number,
    reason: string,
    model: string
  ): Promise<boolean> {
    const result = await this.evaluateAiEntryConfluence(symbol, price, sentiment, reason, model);
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
    // Validate minimum trade amount per pair rules (e.g. min Rp 10.000)
    const minTradeIdr = indodax.getMinTradeIdr(symbol);
    if (totalIdr < minTradeIdr) {
      console.warn(`[Buy Aborted] Nominal order Rp ${totalIdr.toLocaleString('id-ID')} kurang dari batas minimum Indodax (Rp ${minTradeIdr.toLocaleString('id-ID')}) untuk ${symbol}.`);
      return false;
    }

    const feeIdr = totalIdr * 0.002; // 0.2% taker fee
    const totalRequired = totalIdr + feeIdr;
    let orderId = `paper_buy_${Date.now()}`;
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
        effectiveTotalIdr = Math.floor(paperBal / 1.002);
        if (effectiveTotalIdr < minTradeIdr) {
          console.warn(`[Paper Buy Aborted] Sisa saldo paper Rp ${paperBal.toLocaleString('id-ID')} kurang dari batas minimum Rp ${minTradeIdr.toLocaleString('id-ID')}`);
          return false;
        }
        effectiveAmount = effectiveTotalIdr / effectivePrice;
        console.log(`[Dynamic Capital Sizing] Alokasi paper disesuaikan dari Rp ${totalIdr.toLocaleString('id-ID')} ke sisa saldo Rp ${effectiveTotalIdr.toLocaleString('id-ID')}`);
      }

      const effectiveFeeIdr = effectiveTotalIdr * 0.002;
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
          effectiveTotalIdr = Math.floor(idrBal.free / 1.002);
          if (effectiveTotalIdr < minTradeIdr) {
            console.warn(`[Live Buy Aborted] Sisa saldo IDR bursa Rp ${idrBal.free.toLocaleString('id-ID')} kurang dari batas minimum Rp ${minTradeIdr.toLocaleString('id-ID')}`);
            return false;
          }
          effectiveAmount = effectiveTotalIdr / effectivePrice;
          console.log(`[Dynamic Capital Sizing] Alokasi live disesuaikan dari Rp ${totalIdr.toLocaleString('id-ID')} ke sisa saldo bursa Rp ${effectiveTotalIdr.toLocaleString('id-ID')}`);
        }

        totalIdr = effectiveTotalIdr;
        const liveOrder = await indodax.createOrder({
          symbol,
          side: 'BUY',
          type: 'MARKET',
          quoteOrderQty: Math.floor(totalIdr),
        });
        orderId = String(liveOrder.orderId || liveOrder.order_id || `live_buy_${Date.now()}`);

        // Reconcile actual execution values if returned by exchange
        if (liveOrder.executedQty && parseFloat(liveOrder.executedQty) > 0) {
          effectiveAmount = parseFloat(liveOrder.executedQty);
          effectivePrice = totalIdr / effectiveAmount;
        }
      } catch (err: any) {
        console.error(`[Live Order Failed] Gagal mengirim order beli ke Indodax: ${err.message}`);
        return false;
      }
    }

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
    reason: string
  ): Promise<boolean> {
    let orderId = `paper_sell_${Date.now()}`;
    const totalIdr = amountToSell * price;
    const feeIdr = totalIdr * 0.002;
    const netProceeds = totalIdr - feeIdr;

    if (pos.mode === 'paper') {
      // Credit paper balance
      const paperBal = parseFloat(getSetting('paper_idr_balance', '10000000'));
      setSetting('paper_idr_balance', String(Math.floor(paperBal + netProceeds)));
    } else {
      // Live Trading: Kirim order jual ke Indodax
      try {
        const liveOrder = await indodax.createOrder({
          symbol: pos.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: amountToSell,
        });
        orderId = String(liveOrder.orderId || liveOrder.order_id || `live_sell_${Date.now()}`);
      } catch (err: any) {
        // STRICT CRITICAL FIX: Jika order jual gagal di bursa, STOP!
        // Jangan catat database dan jangan tutup posisi agar koin tidak hilang kendali!
        console.error(`[Live Sell Failed] Gagal mengirim order jual ke Indodax untuk ${pos.symbol}: ${err.message}`);
        return false;
      }
    }

    db.prepare(`
      INSERT INTO trades_history (id, position_id, symbol, type, price, amount, total_idr, fee_idr, mode, order_id, reason, timestamp)
      VALUES (?, ?, ?, 'SELL', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `trade_${Date.now()}`,
      pos.id,
      pos.symbol,
      price,
      amountToSell,
      totalIdr,
      feeIdr,
      pos.mode,
      orderId,
      reason,
      Date.now()
    );

    if (this.onTradeEventCallback) {
      this.onTradeEventCallback({
        type: 'SELL',
        data: { symbol: pos.symbol, price, amount: amountToSell, totalIdr, mode: pos.mode, reason },
      });
    }

    return true;
  }

  public async closePosition(pos: PositionRecord, exitPrice: number, exitReason: string): Promise<boolean> {
    const sellOk = await this.executeSell(pos, pos.amount, exitPrice, exitReason);
    if (!sellOk) {
      console.error(`[Close Position Aborted] Order jual gagal dieksekusi di bursa. Posisi ${pos.symbol.toUpperCase()} tetap 'open' untuk dicoba kembali.`);
      return false;
    }

    const pnlIdr = (exitPrice - pos.entry_price) * pos.amount;
    const pnlPercent = ((exitPrice - pos.entry_price) / pos.entry_price) * 100;
    const holdDurationMinutes = Math.round((Date.now() - pos.opened_at) / 60000);

    const txClose = db.transaction(() => {
      db.prepare(`
        UPDATE positions SET
          status = 'closed',
          closed_at = ?,
          current_price = ?,
          pnl_idr = ?,
          pnl_percent = ?,
          exit_reason = ?
        WHERE id = ?
      `).run(Date.now(), exitPrice, pnlIdr, pnlPercent, exitReason, pos.id);
    });
    txClose();
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
    const openPositions = db.prepare("SELECT * FROM positions WHERE status = 'open'").all() as PositionRecord[];
    let closedCount = 0;

    for (const pos of openPositions) {
      try {
        const ticker = await indodax.getTicker(pos.symbol);
        const currentPrice = parseFloat(ticker.ticker.last) || pos.current_price;
        const closed = await this.closePosition(pos, currentPrice, 'EMERGENCY PANIC SELL TRIGGERED VIA COMMAND');
        if (closed) closedCount++;
      } catch (err) {
        console.error(`Gagal panic sell ${pos.symbol}:`, err);
      }
    }

    setSetting('is_auto_trading_active', '0'); // Pause trading after panic sell
    return closedCount;
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

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // 1. Realized Net PnL in IDR from closed trades today
    const realized = db.prepare(`
      SELECT COALESCE(SUM(pnl_idr), 0) as total_pnl_idr
      FROM positions
      WHERE status = 'closed' AND closed_at >= ?
    `).get(startOfDay.getTime()) as { total_pnl_idr: number };

    // 2. Floating Net PnL in IDR from active open positions
    const floating = db.prepare(`
      SELECT COALESCE(SUM(pnl_idr), 0) as floating_pnl_idr, COALESCE(SUM(initial_cost_idr), 0) as total_cost_idr
      FROM positions
      WHERE status = 'open'
    `).get() as { floating_pnl_idr: number; total_cost_idr: number };

    const totalPnlIdrToday = (realized.total_pnl_idr || 0) + (floating.floating_pnl_idr || 0);

    // 3. Compute baseline total equity using REAL live Indodax IDR balance in live mode
    const mode = getSetting('trading_mode', 'paper');
    let baselineBalance = parseFloat(getSetting('paper_idr_balance', '10000000'));

    if (mode === 'live') {
      try {
        const idrBal = await indodax.getIdrBalance();
        const liveTotalIdr = idrBal.free + idrBal.locked;
        if (liveTotalIdr > 0) {
          baselineBalance = liveTotalIdr;
        }
      } catch {
        // Fallback to paper balance if balance fetch failed
      }
    }

    const totalEquity = baselineBalance + (floating.total_cost_idr || 0);

    // If total net loss exceeds the configured percentage of portfolio
    if (totalPnlIdrToday < 0) {
      const lossPercent = (Math.abs(totalPnlIdrToday) / Math.max(totalEquity, 1000000)) * 100;

      if (lossPercent >= dailyLimitPercent) {
        console.warn(`[CIRCUIT BREAKER TRIGGERED] Akumulasi rugi hari ini: Rp ${Math.abs(totalPnlIdrToday).toLocaleString('id-ID')} (${lossPercent.toFixed(2)}% >= limit ${dailyLimitPercent}%). Menahan pembukaan posisi baru selama 24 jam.`);
        setSetting('circuit_breaker_triggered_at', String(now));

        if (this.onTradeEventCallback) {
          this.onTradeEventCallback({
            type: 'ALERT',
            data: {
              title: 'Daily Circuit Breaker Triggered (24h Cooldown)',
              message: `Trading otomatis dihentikan selama 24 jam karena akumulasi kerugian hari ini mencapai ${lossPercent.toFixed(2)}% (Rp ${Math.abs(totalPnlIdrToday).toLocaleString('id-ID')}). Modal Anda terlindungi.`,
            },
          });
        }
        return true;
      }
    }

    return false;
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
