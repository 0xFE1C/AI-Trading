import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { TradingEngine, PositionRecord } from '../src/services/trading/index.js';
import { getTakerFeeRate } from '../src/services/trading/fees.js';

function insertPosition(overrides: Partial<PositionRecord> = {}): PositionRecord {
  const pos: PositionRecord = {
    id: overrides.id || `pos_race_${Math.random().toString(36).slice(2, 8)}`,
    symbol: overrides.symbol || 'racetestidr',
    base_currency: 'idr',
    traded_currency: 'racetest',
    side: 'buy',
    entry_price: 100,
    current_price: 100,
    amount: 1000,
    initial_cost_idr: 100000,
    highest_price: 100,
    trailing_stop_price: 90,
    take_profit_step: 0,
    status: 'open',
    opened_at: Date.now() - 3600000,
    closed_at: null,
    pnl_idr: 0,
    pnl_percent: 0,
    exit_reason: null,
    mode: 'paper',
    ...overrides,
  };

  db.prepare(`
    INSERT INTO positions (
      id, symbol, base_currency, traded_currency, side, entry_price, current_price,
      amount, initial_cost_idr, highest_price, trailing_stop_price, take_profit_step,
      status, opened_at, mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    pos.mode
  );

  return pos;
}

function cleanup(pos: PositionRecord, originalBalance: string) {
  db.prepare('DELETE FROM trades_history WHERE position_id = ?').run(pos.id);
  db.prepare('DELETE FROM positions WHERE id = ?').run(pos.id);
  setSetting('paper_idr_balance', originalBalance);
}

test('concurrent full exits sell exactly once', async (t) => {
  const originalBalance = getSetting('paper_idr_balance', '10000000');
  const pos = insertPosition();
  const engine = new TradingEngine();

  t.after(() => cleanup(pos, originalBalance));

  const [first, second] = await Promise.all([
    engine.closePosition(pos, 110, 'concurrent exit A'),
    engine.closePosition(pos, 110, 'concurrent exit B'),
  ]);

  assert.equal([first, second].filter(Boolean).length, 1, 'only one close may win the claim');

  const sells = db
    .prepare("SELECT COUNT(*) AS c FROM trades_history WHERE position_id = ? AND type = 'SELL'")
    .get(pos.id) as { c: number };
  assert.equal(sells.c, 1, 'exchange/paper sell must be recorded exactly once');

  const dbPos = db.prepare('SELECT status, exit_claimed_at FROM positions WHERE id = ?').get(pos.id) as {
    status: string;
    exit_claimed_at: number | null;
  };
  assert.equal(dbPos.status, 'closed');
  assert.equal(dbPos.exit_claimed_at, null);

  const expected = Math.floor(Number(originalBalance) + 1000 * 110 * (1 - getTakerFeeRate()));
  assert.equal(Number(getSetting('paper_idr_balance')), expected, 'paper balance credited exactly once');
});

test('concurrent realtime ticks trigger a single partial take-profit', async (t) => {
  const originalBalance = getSetting('paper_idr_balance', '10000000');
  setSetting('take_profit_target_1_percent', '5.0');

  const pos = insertPosition({
    symbol: 'racetestidr',
    entry_price: 100,
    current_price: 100,
    amount: 1000,
    initial_cost_idr: 100000,
    highest_price: 100,
    trailing_stop_price: 80,
  });
  const engine = new TradingEngine();

  t.after(() => cleanup(pos, originalBalance));

  const tick = { pair: 'RACETESTIDR', price: 110, volume: 1, timestamp: Date.now() };
  await Promise.all([engine.handleRealtimeTick(tick), engine.handleRealtimeTick(tick)]);

  const sells = db
    .prepare("SELECT COUNT(*) AS c FROM trades_history WHERE position_id = ? AND type = 'SELL'")
    .get(pos.id) as { c: number };
  assert.equal(sells.c, 1, 'partial TP must execute exactly once');

  const dbPos = db.prepare('SELECT amount, take_profit_step, exit_claimed_at FROM positions WHERE id = ?').get(pos.id) as {
    amount: number;
    take_profit_step: number;
    exit_claimed_at: number | null;
  };
  assert.equal(dbPos.amount, 500, 'half the position was sold');
  assert.equal(dbPos.take_profit_step, 1);
  assert.equal(dbPos.exit_claimed_at, null);
});
