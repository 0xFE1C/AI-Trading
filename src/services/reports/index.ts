import { db, getSetting } from '../../db/index.js';

export interface PerformanceSummary {
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

export class ReportingService {
  /**
   * Menghasilkan ringkasan laporan performa komprehensif untuk rentang waktu tertentu.
   */
  public getPerformanceReport(daysFilter: number | 'all' = 'all'): PerformanceSummary {
    const now = Date.now();
    let startTime = 0;
    let periodLabel = 'Semua Waktu';

    if (daysFilter !== 'all' && typeof daysFilter === 'number') {
      startTime = now - daysFilter * 24 * 60 * 60 * 1000;
      periodLabel = `${daysFilter} Hari Terakhir`;
    }

    // Ambil semua posisi yang ditutup dalam periode
    const query = startTime > 0
      ? db.prepare("SELECT * FROM positions WHERE status = 'closed' AND closed_at >= ? ORDER BY closed_at ASC")
      : db.prepare("SELECT * FROM positions WHERE status = 'closed' ORDER BY closed_at ASC");

    const positions = (startTime > 0 ? query.all(startTime) : query.all()) as any[];

    let totalVolumeIdr = 0;
    let grossProfitIdr = 0;
    let grossLossIdr = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let breakevenTrades = 0;
    let totalHoldMinutes = 0;

    let bestTrade: PerformanceSummary['bestTrade'] = null;
    let worstTrade: PerformanceSummary['worstTrade'] = null;

    // Track running equity curve for drawdown calculation
    let cumulativePnlIdr = 0;
    let peakCumulativePnlIdr = 0;
    let maxDrawdownIdr = 0;
    let maxDrawdownPercent = 0;

    const coinMap = new Map<string, {
      tradesCount: number;
      wins: number;
      losses: number;
      totalPnlIdr: number;
      sumPnlPercent: number;
    }>();

    const formattedTrades = positions.map((pos) => {
      const pnlIdr = pos.pnl_idr || 0;
      const pnlPct = pos.pnl_percent || 0;
      const holdMin = pos.closed_at ? Math.max(1, Math.round((pos.closed_at - pos.opened_at) / 60000)) : 0;
      totalHoldMinutes += holdMin;

      const tradeCost = pos.initial_cost_idr || 0;
      totalVolumeIdr += tradeCost * 2; // estimasi buy + sell volume

      if (pnlIdr > 0) {
        winningTrades++;
        grossProfitIdr += pnlIdr;
      } else if (pnlIdr < 0) {
        losingTrades++;
        grossLossIdr += Math.abs(pnlIdr);
      } else {
        breakevenTrades++;
      }

      // Best & Worst trade detection
      const closeDateStr = pos.closed_at ? new Date(pos.closed_at).toLocaleDateString('id-ID') : '-';
      if (!bestTrade || pnlIdr > bestTrade.pnlIdr) {
        bestTrade = {
          symbol: pos.symbol.toUpperCase(),
          pnlIdr,
          pnlPercent: pnlPct,
          date: closeDateStr,
        };
      }
      if (!worstTrade || pnlIdr < worstTrade.pnlIdr) {
        worstTrade = {
          symbol: pos.symbol.toUpperCase(),
          pnlIdr,
          pnlPercent: pnlPct,
          date: closeDateStr,
        };
      }

      // Cumulative Equity & Drawdown Tracker
      cumulativePnlIdr += pnlIdr;
      if (cumulativePnlIdr > peakCumulativePnlIdr) {
        peakCumulativePnlIdr = cumulativePnlIdr;
      }
      const currentDrawdownIdr = peakCumulativePnlIdr - cumulativePnlIdr;
      if (currentDrawdownIdr > maxDrawdownIdr) {
        maxDrawdownIdr = currentDrawdownIdr;
        const baseCapital = parseFloat(getSetting('paper_idr_balance', '10000000'));
        maxDrawdownPercent = (maxDrawdownIdr / (baseCapital + peakCumulativePnlIdr)) * 100;
      }

      // Per-coin aggregation
      const sym = pos.symbol.toUpperCase();
      const existingCoin = coinMap.get(sym) || { tradesCount: 0, wins: 0, losses: 0, totalPnlIdr: 0, sumPnlPercent: 0 };
      existingCoin.tradesCount++;
      if (pnlIdr > 0) existingCoin.wins++;
      else if (pnlIdr < 0) existingCoin.losses++;
      existingCoin.totalPnlIdr += pnlIdr;
      existingCoin.sumPnlPercent += pnlPct;
      coinMap.set(sym, existingCoin);

      return {
        id: pos.id,
        symbol: pos.symbol.toUpperCase(),
        entry_price: pos.entry_price,
        exit_price: pos.current_price,
        initial_cost_idr: pos.initial_cost_idr,
        amount: pos.amount,
        opened_at: pos.opened_at,
        closed_at: pos.closed_at,
        pnl_idr: pnlIdr,
        pnl_percent: pnlPct,
        exit_reason: pos.exit_reason || 'Manual Exit',
        hold_minutes: holdMin,
        mode: pos.mode,
      };
    });

    const totalTrades = positions.length;
    const netPnlIdr = grossProfitIdr - grossLossIdr;
    const winRatePercent = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const profitFactor = grossLossIdr === 0 ? (grossProfitIdr > 0 ? null : 0) : parseFloat((grossProfitIdr / grossLossIdr).toFixed(2));
    const avgHoldDurationMinutes = totalTrades > 0 ? Math.round(totalHoldMinutes / totalTrades) : 0;

    const baseBalance = parseFloat(getSetting('paper_idr_balance', '10000000'));
    const netPnlPercent = baseBalance > 0 ? (netPnlIdr / baseBalance) * 100 : 0;

    // Convert Coin Map to Sorted Array
    const coinBreakdown = Array.from(coinMap.entries())
      .map(([symbol, c]) => ({
        symbol,
        tradesCount: c.tradesCount,
        wins: c.wins,
        losses: c.losses,
        winRatePercent: c.tradesCount > 0 ? parseFloat(((c.wins / c.tradesCount) * 100).toFixed(1)) : 0,
        totalPnlIdr: Math.round(c.totalPnlIdr),
        avgPnlPercent: c.tradesCount > 0 ? parseFloat((c.sumPnlPercent / c.tradesCount).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.totalPnlIdr - a.totalPnlIdr);

    // AI Swarm Efficacy Metrics
    const evalQuery = startTime > 0
      ? db.prepare("SELECT ai_verdict FROM ai_ab_evaluations WHERE timestamp >= ?").all(startTime) as any[]
      : db.prepare("SELECT ai_verdict FROM ai_ab_evaluations").all() as any[];

    const evaluationsCount = evalQuery.length;
    const approvedCount = evalQuery.filter((e) => e.ai_verdict === 'APPROVED').length;
    const rejectedCount = evalQuery.filter((e) => e.ai_verdict === 'REJECTED').length;

    const ghostQuery = startTime > 0
      ? db.prepare("SELECT * FROM ghost_positions WHERE status = 'closed' AND closed_at >= ?").all(startTime) as any[]
      : db.prepare("SELECT * FROM ghost_positions WHERE status = 'closed'").all() as any[];

    let bulletsDodged = 0;
    let savedCapitalIdr = 0;
    let opportunitiesMissed = 0;
    let missedProfitIdr = 0;

    for (const g of ghostQuery) {
      if (g.simulated_outcome === 'BULLET_DODGED') {
        bulletsDodged++;
        savedCapitalIdr += Math.abs(g.pnl_idr || 0);
      } else if (g.simulated_outcome === 'OPPORTUNITY_MISSED') {
        opportunitiesMissed++;
        missedProfitIdr += g.pnl_idr || 0;
      }
    }

    // AI Lessons Learned
    const lessonsRaw = (
      startTime > 0
        ? db.prepare("SELECT * FROM lessons_learned WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 10").all(startTime)
        : db.prepare("SELECT * FROM lessons_learned ORDER BY timestamp DESC LIMIT 10").all()
    ) as any[];

    const lessonsLearned = lessonsRaw.map((l) => ({
      id: l.id,
      symbol: l.symbol.toUpperCase(),
      result: l.result,
      pnl_percent: l.pnl_percent,
      lesson: l.lesson,
      date: new Date(l.timestamp).toLocaleDateString('id-ID'),
    }));

    return {
      periodLabel,
      startDate: startTime > 0 ? new Date(startTime).toLocaleDateString('id-ID') : 'Awal',
      endDate: new Date(now).toLocaleDateString('id-ID'),
      currentMode: getSetting('trading_mode', 'paper').toUpperCase(),
      totalTrades,
      winningTrades,
      losingTrades,
      breakevenTrades,
      winRatePercent: parseFloat(winRatePercent.toFixed(1)),
      totalVolumeIdr: Math.round(totalVolumeIdr),
      grossProfitIdr: Math.round(grossProfitIdr),
      grossLossIdr: Math.round(grossLossIdr),
      netPnlIdr: Math.round(netPnlIdr),
      netPnlPercent: parseFloat(netPnlPercent.toFixed(2)),
      profitFactor,
      maxDrawdownPercent: parseFloat(maxDrawdownPercent.toFixed(2)),
      maxDrawdownIdr: Math.round(maxDrawdownIdr),
      avgHoldDurationMinutes,
      bestTrade,
      worstTrade,
      coinBreakdown,
      aiEfficacy: {
        evaluationsCount,
        approvedCount,
        rejectedCount,
        bulletsDodged,
        savedCapitalIdr: Math.round(savedCapitalIdr),
        opportunitiesMissed,
        missedProfitIdr: Math.round(missedProfitIdr),
      },
      lessonsLearned,
      tradesList: formattedTrades.reverse(), // Urutkan yang terbaru di atas
    };
  }

  /**
   * Menghasilkan teks CSV mentah siap unduh untuk Microsoft Excel / Google Sheets.
   */
  public generateCsv(daysFilter: number | 'all' = 'all'): string {
    const report = this.getPerformanceReport(daysFilter);
    const headers = [
      'No',
      'ID Posisi',
      'Waktu Beli',
      'Waktu Jual',
      'Simbol',
      'Harga Beli (IDR)',
      'Harga Jual (IDR)',
      'Modal Awal (IDR)',
      'Net Profit/Loss (IDR)',
      'Profit/Loss (%)',
      'Durasi (Menit)',
      'Alasan Exit',
      'Mode',
    ];

    const rows = report.tradesList.map((t, idx) => {
      const openDate = new Date(t.opened_at).toLocaleString('id-ID').replace(',', '');
      const closeDate = t.closed_at ? new Date(t.closed_at).toLocaleString('id-ID').replace(',', '') : '-';
      return [
        idx + 1,
        `"${t.id}"`,
        `"${openDate}"`,
        `"${closeDate}"`,
        `"${t.symbol}"`,
        t.entry_price,
        t.exit_price,
        Math.round(t.initial_cost_idr),
        Math.round(t.pnl_idr),
        t.pnl_percent.toFixed(2),
        t.hold_minutes,
        `"${t.exit_reason.replace(/"/g, '""')}"`,
        `"${t.mode.toUpperCase()}"`,
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
  }
}

export const reportingService = new ReportingService();
