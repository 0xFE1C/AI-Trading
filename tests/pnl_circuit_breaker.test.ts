import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { TradingEngine, PositionRecord } from '../src/services/trading/index.js';

function insertPosition(overrides: Partial<PositionRecord> = {}): PositionRecord {
  const pos: PositionRecord = {
    id: overrides.id || `pos_pnl_${Math.random().toString(36).slice(2, 10)}`,
    symbol: overrides.symbol || 'pnltestidr',
    base_currency: 'idr',
    traded_currency: 'pnltest',
    side: 'buy',
    entry_price: 100,
    current_price: 100,
    amount: 1000,
    initial_cost_idr: 100000,
    highest_price: 100,
    trailing_stop_price: 80,
    take_profit_step: 0,
    status: 'open',
    opened_at: Date.now() - 3600000,
    closed_at: null,
    pnl_idr: 0,
    pnl_percent: 0,
    realized_pnl_idr: 0,
    exit_reason: null,
    mode: 'paper',
    ...overrides,
  };

  db.prepare(`
    INSERT INTO positions (
      id, symbol, base_currency, traded_currency, side, entry_price, current_price,
      amount, initial_cost_idr, highest_price, trailing_stop_price, take_profit_step,
      status, opened_at, closed_at, pnl_idr, pnl_percent, realized_pnl_idr, exit_reason, mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pos.id,
    pos.symbol,
    pos.base_currency,
    pos.traded_currency,
    pos.side,
    pos.entry_price,
    pos.current_price,
    pos.amount,
    pos.initial_cost_idr,
    pos.highest_price,
    pos.trailing_stop_price,
    pos.take_profit_step,
    pos.status,
    pos.opened_at,
    pos.closed_at,
    pos.pnl_idr,
    pos.pnl_percent,
    pos.realized_pnl_idr,
    pos.exit_reason,
    pos.mode
  );

  return pos;
}

function restore(key: string, value: string) {
  if (value === '') {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  } else {
    setSetting(key, value);
  }
}

test('paper fills record fees from the configured rate and closed PnL nets them out', async (t) => {
  const originalFee = getSetting('trading_fee_percent', '');
  const originalBalance = getSetting('paper_idr_balance', '');
  const originalMode = getSetting('trading_mode', '');
  const symbol = 'feeprofitidr';

  setSetting('trading_fee_percent', '1');
  setSetting('paper_idr_balance', '1000000');
  setSetting('trading_mode', 'paper');

  t.after(() => {
    db.prepare('DELETE FROM trades_history WHERE symbol = ?').run(symbol);
    db.prepare('DELETE FROM positions WHERE symbol = ?').run(symbol);
    restore('trading_fee_percent', originalFee);
    restore('paper_idr_balance', originalBalance);
    restore('trading_mode', originalMode);
  });

  const engine = new TradingEngine();
  const bought = await engine.executeBuy(symbol, 1000, 100, 100000, 'paper', 'fee test');
  assert.equal(bought, true);

  const open = db.prepare('SELECT * FROM positions WHERE symbol = ? AND status = ?').get(symbol, 'open') as PositionRecord;
  assert.equal(open.initial_cost_idr, 100000);
  assert.equal(open.amount, 100);
  assert.equal(Number(getSetting('paper_idr_balance')), 899000, 'paper balance pays 1% entry fee');

  const buyFlow = db.prepare("SELECT total_idr, fee_idr FROM trades_history WHERE position_id = ? AND type = 'BUY'").get(open.id) as any;
  assert.equal(buyFlow.total_idr, 100000);
  assert.equal(buyFlow.fee_idr, 1000);

  const closed = await engine.closePosition(open, 1100, 'fee exit');
  assert.equal(closed, true);

  const closedPos = db.prepare('SELECT * FROM positions WHERE id = ?').get(open.id) as PositionRecord;
  assert.equal(closedPos.status, 'closed');
  assert.equal(closedPos.pnl_idr, 7900, 'PnL = 108,900 net proceeds - 101,000 cost incl. entry fee');
  assert.ok(Math.abs(closedPos.pnl_percent - 7.821782) < 0.001);
  assert.equal(Number(getSetting('paper_idr_balance')), 1007900);

  const sellFlow = db.prepare("SELECT total_idr, fee_idr FROM trades_history WHERE position_id = ? AND type = 'SELL'").get(open.id) as any;
  assert.equal(sellFlow.total_idr, 110000);
  assert.equal(sellFlow.fee_idr, 1100);
});

test('equity snapshot is mode-scoped and includes realized partial TP PnL', async (t) => {
  const originalFee = getSetting('trading_fee_percent', '');
  const originalBalance = getSetting('paper_idr_balance', '');

  setSetting('trading_fee_percent', '1');
  setSetting('paper_idr_balance', '1000000');

  const paper = insertPosition({
    id: 'pos_snapshot_paper',
    symbol: 'snapshotpaperidr',
    realized_pnl_idr: 2000,
    current_price: 110,
  });
  const live = insertPosition({
    id: 'pos_snapshot_live',
    symbol: 'snapshotliveidr',
    mode: 'live',
    amount: 5000,
    initial_cost_idr: 500000,
    entry_price: 100,
    current_price: 80,
  });

  t.after(() => {
    db.prepare('DELETE FROM positions WHERE id IN (?, ?)').run(paper.id, live.id);
    restore('trading_fee_percent', originalFee);
    restore('paper_idr_balance', originalBalance);
  });

  const engine = new TradingEngine();
  const snapshot = await engine.getEquitySnapshot('paper');

  assert.equal(snapshot.mode, 'paper');
  assert.equal(snapshot.cashIdr, 1000000);
  assert.equal(snapshot.openPositions, 1, 'live positions must not leak into paper equity');
  assert.equal(snapshot.holdingsValueIdr, 108900, '1,000 units at 110 less 1% exit fee');
  assert.equal(snapshot.equityIdr, 1108900);
  // Unrealized: 110,000 - 1,100 exit fee - 101,000 cost incl. entry fee = 7,900.
  // Plus 2,000 realized partial profit.
  assert.equal(snapshot.floatingPnlIdr, 9900);
});

test('circuit breaker only counts PnL of the active mode', async (t) => {
  const originalMode = getSetting('trading_mode', '');
  const originalBalance = getSetting('paper_idr_balance', '');
  const originalTriggered = getSetting('circuit_breaker_triggered_at', '');
  const originalLimit = getSetting('daily_loss_limit_percent', '');

  setSetting('trading_mode', 'paper');
  setSetting('paper_idr_balance', '1000000');
  setSetting('circuit_breaker_triggered_at', '0');
  setSetting('daily_loss_limit_percent', '5');

  const paperLoss = insertPosition({
    id: 'pos_cb_paper_loss',
    symbol: 'cbpaperlossidr',
    status: 'closed',
    closed_at: Date.now(),
    pnl_idr: -60000,
    pnl_percent: -6,
  });
  const liveLoss = insertPosition({
    id: 'pos_cb_live_loss',
    symbol: 'cblivelossidr',
    status: 'closed',
    closed_at: Date.now(),
    pnl_idr: -400000,
    pnl_percent: -6,
    mode: 'live',
  });

  t.after(() => {
    db.prepare('DELETE FROM positions WHERE id IN (?, ?)').run(paperLoss.id, liveLoss.id);
    restore('trading_mode', originalMode);
    restore('paper_idr_balance', originalBalance);
    restore('circuit_breaker_triggered_at', originalTriggered);
    restore('daily_loss_limit_percent', originalLimit);
  });

  const engine = new TradingEngine();
  const tripped = await engine.checkDailyCircuitBreaker();
  assert.equal(tripped, true, 'a 6% paper loss must trip the 5% limit');
  assert.notEqual(getSetting('circuit_breaker_triggered_at', '0'), '0');

  // Remove the paper loss and reset: the much larger live loss must NOT trip
  // the breaker while the active mode is paper.
  db.prepare("UPDATE positions SET status = 'closed', pnl_idr = 0 WHERE id = ?").run(paperLoss.id);
  setSetting('circuit_breaker_triggered_at', '0');
  const trippedAfter = await engine.checkDailyCircuitBreaker();
  assert.equal(trippedAfter, false, 'live PnL must not affect the paper circuit breaker');
  assert.equal(getSetting('circuit_breaker_triggered_at', '0'), '0');
});

test('live circuit breaker fails closed when balances cannot be read', async (t) => {
  const originalMode = getSetting('trading_mode', '');
  const originalKey = getSetting('indodax_api_key', '');
  const originalSecret = getSetting('indodax_secret_key', '');
  const originalTriggered = getSetting('circuit_breaker_triggered_at', '');

  setSetting('trading_mode', 'live');
  setSetting('indodax_api_key', '');
  setSetting('indodax_secret_key', '');
  setSetting('circuit_breaker_triggered_at', '0');

  t.after(() => {
    restore('trading_mode', originalMode);
    restore('indodax_api_key', originalKey);
    restore('indodax_secret_key', originalSecret);
    restore('circuit_breaker_triggered_at', originalTriggered);
  });

  const engine = new TradingEngine();
  const blocked = await engine.checkDailyCircuitBreaker();
  assert.equal(blocked, true, 'no live balance means no new entries');
  assert.equal(getSetting('circuit_breaker_triggered_at', '0'), '0', 'fail-closed is not a loss trigger');
});

test('partial take-profit records realized profit separately and stays fee-aware', async (t) => {
  const originalFee = getSetting('trading_fee_percent', '');
  const originalBalance = getSetting('paper_idr_balance', '');
  const originalTarget = getSetting('take_profit_target_1_percent', '');
  const originalMode = getSetting('trading_mode', '');

  setSetting('trading_fee_percent', '1');
  setSetting('paper_idr_balance', '1000000');
  setSetting('take_profit_target_1_percent', '5.0');
  setSetting('trading_mode', 'paper');

  const pos = insertPosition({
    id: 'pos_partial_fee',
    symbol: 'partialfeeidr',
    entry_price: 100,
    current_price: 100,
    amount: 1000,
    initial_cost_idr: 100000,
    trailing_stop_price: 80,
  });

  t.after(() => {
    db.prepare('DELETE FROM trades_history WHERE position_id = ?').run(pos.id);
    db.prepare('DELETE FROM positions WHERE id = ?').run(pos.id);
    restore('trading_fee_percent', originalFee);
    restore('paper_idr_balance', originalBalance);
    restore('take_profit_target_1_percent', originalTarget);
    restore('trading_mode', originalMode);
  });

  const engine = new TradingEngine();
  await engine.handleRealtimeTick({ pair: 'PARTIALFEEIDR', price: 110, volume: 1, timestamp: Date.now() });

  const dbPos = db.prepare('SELECT * FROM positions WHERE id = ?').get(pos.id) as PositionRecord;
  assert.equal(dbPos.amount, 500);
  assert.equal(dbPos.initial_cost_idr, 50000);
  assert.equal(dbPos.take_profit_step, 1);
  assert.equal(dbPos.realized_pnl_idr, 3950, 'net proceeds 54,450 - cost 50,500');
  assert.equal(dbPos.pnl_idr, 3950, 'remaining half marked at 110 after fees');

  const sell = db.prepare("SELECT total_idr, fee_idr FROM trades_history WHERE position_id = ? AND type = 'SELL'").get(pos.id) as any;
  assert.equal(sell.total_idr, 55000);
  assert.equal(sell.fee_idr, 550);
  assert.equal(Number(getSetting('paper_idr_balance')), 1054450);

  const snapshot = await engine.getEquitySnapshot('paper');
  assert.equal(snapshot.floatingPnlIdr, 7900, 'banked partial profit + net unrealized on the remainder');
});
