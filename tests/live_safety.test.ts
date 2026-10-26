import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { indodax } from '../src/services/indodax/index.js';
import { TradingEngine, PositionRecord } from '../src/services/trading/index.js';

const originalSettings = {
  trading_mode: getSetting('trading_mode', 'paper'),
  indodax_api_key: getSetting('indodax_api_key', ''),
  indodax_secret_key: getSetting('indodax_secret_key', ''),
};

function restoreSettings() {
  setSetting('trading_mode', originalSettings.trading_mode);
  setSetting('indodax_api_key', originalSettings.indodax_api_key);
  setSetting('indodax_secret_key', originalSettings.indodax_secret_key);
}

function insertLivePosition(base: string, amount: number): PositionRecord {
  const pos: PositionRecord = {
    id: `pos_live_${Math.random().toString(36).slice(2, 8)}`,
    symbol: `${base}idr`,
    base_currency: 'idr',
    traded_currency: base,
    side: 'buy',
    entry_price: 100000,
    current_price: 100000,
    amount,
    initial_cost_idr: amount * 100000,
    highest_price: 100000,
    trailing_stop_price: 97500,
    take_profit_step: 0,
    status: 'open',
    opened_at: Date.now() - 3600000,
    closed_at: null,
    pnl_idr: 0,
    pnl_percent: 0,
    exit_reason: null,
    mode: 'live',
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

test('startup reconciliation releases stale paper exit claims', async (t) => {
  setSetting('trading_mode', 'paper');
  t.after(restoreSettings);

  const pos = insertLivePosition('racept', 10);
  db.prepare("UPDATE positions SET mode = 'paper', exit_claimed_at = ? WHERE id = ?").run(Date.now(), pos.id);
  const engine = new TradingEngine();

  const result = await engine.reconcileOnStartup();
  assert.equal(result.safeToResume, true);

  const row = db.prepare('SELECT exit_claimed_at FROM positions WHERE id = ?').get(pos.id) as {
    exit_claimed_at: number | null;
  };
  assert.equal(row.exit_claimed_at, null);

  db.prepare('DELETE FROM positions WHERE id = ?').run(pos.id);
});

test('startup reconciliation fails closed in live mode without API keys', async (t) => {
  setSetting('trading_mode', 'live');
  setSetting('indodax_api_key', '');
  setSetting('indodax_secret_key', '');
  t.after(restoreSettings);

  const engine = new TradingEngine();
  const result = await engine.reconcileOnStartup();

  assert.equal(result.safeToResume, false);
  assert.ok(result.issues.some((issue) => issue.includes('API key')));
});

test('startup reconciliation corrects live position size to exchange balance', async (t) => {
  setSetting('trading_mode', 'live');
  setSetting('indodax_api_key', 'test-key');
  setSetting('indodax_secret_key', 'test-secret');
  t.after(restoreSettings);

  const pos = insertLivePosition('recobtc', 1000);
  const originalGetAccountInfo = indodax.getAccountInfo;
  const originalGetOpenOrders = indodax.getOpenOrders;

  indodax.getAccountInfo = async () => ({
    canTrade: true,
    canWithdraw: false,
    accountType: 'spot',
    balances: [{ asset: 'recobtc', free: '400', locked: '0' }],
  });
  indodax.getOpenOrders = async () => [];

  t.after(() => {
    indodax.getAccountInfo = originalGetAccountInfo;
    indodax.getOpenOrders = originalGetOpenOrders;
    db.prepare('DELETE FROM positions WHERE id = ?').run(pos.id);
  });

  const engine = new TradingEngine();
  const result = await engine.reconcileOnStartup();

  assert.equal(result.safeToResume, false);
  assert.ok(result.issues.some((issue) => issue.includes('dikoreksi')));

  const row = db.prepare('SELECT amount, initial_cost_idr FROM positions WHERE id = ?').get(pos.id) as {
    amount: number;
    initial_cost_idr: number;
  };
  assert.equal(row.amount, 400);
  assert.equal(row.initial_cost_idr, 400 * 100000);
});

test('startup reconciliation allows resume when exchange state matches', async (t) => {
  setSetting('trading_mode', 'live');
  setSetting('indodax_api_key', 'test-key');
  setSetting('indodax_secret_key', 'test-secret');
  t.after(restoreSettings);

  const pos = insertLivePosition('receth', 1000);
  const originalGetAccountInfo = indodax.getAccountInfo;
  const originalGetOpenOrders = indodax.getOpenOrders;

  indodax.getAccountInfo = async () => ({
    canTrade: true,
    canWithdraw: false,
    accountType: 'spot',
    balances: [{ asset: 'receth', free: '1000', locked: '0' }],
  });
  indodax.getOpenOrders = async () => [];

  t.after(() => {
    indodax.getAccountInfo = originalGetAccountInfo;
    indodax.getOpenOrders = originalGetOpenOrders;
    db.prepare('DELETE FROM positions WHERE id = ?').run(pos.id);
  });

  const engine = new TradingEngine();
  const result = await engine.reconcileOnStartup();

  assert.equal(result.safeToResume, true);
  assert.equal(result.issues.length, 0);
});

test('order fill extraction handles filled, partial, and missing data', () => {
  const filled = indodax.extractOrderFill({
    status: 'FILLED',
    executedQty: '0.5',
    cummulativeQuoteQty: '55000',
  });
  assert.equal(filled.executedQty, 0.5);
  assert.equal(filled.averagePrice, 110000);
  assert.equal(filled.verified, true);
  assert.equal(filled.isFinal, true);

  const partial = indodax.extractOrderFill({
    status: 'PARTIALLY_FILLED',
    executedQty: '0.2',
    quoteQty: '22000',
  });
  assert.equal(partial.executedQty, 0.2);
  assert.equal(partial.isFinal, false);

  const unknown = indodax.extractOrderFill({ order_id: 'abc' });
  assert.equal(unknown.executedQty, 0);
  assert.equal(unknown.isFinal, false);

  const nested = indodax.extractOrderFill({
    data: { order: { status: 'FILLED', executedQty: '2', cummulativeQuoteQty: '200000' } },
  });
  assert.equal(nested.executedQty, 2);
  assert.equal(nested.averagePrice, 100000);
});
