import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { indodax } from '../src/services/indodax/index.js';
import { TradingEngine, PositionRecord, tradingEngine } from '../src/services/trading/index.js';
import { checkMaxDrawdown, capAllocationByEquityPercent } from '../src/services/trading/riskGuard.js';
import { db, getSetting, setSetting } from '../src/db/index.js';

const engine = new TradingEngine();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertLivePosition(base: string, amount: number, price: number): PositionRecord {
  const pos: PositionRecord = {
    id: `pos_sh_${Math.random().toString(36).slice(2, 9)}`,
    symbol: `${base}idr`,
    base_currency: 'idr',
    traded_currency: base,
    side: 'buy',
    entry_price: price,
    current_price: price,
    amount,
    initial_cost_idr: amount * price,
    highest_price: price,
    trailing_stop_price: price * 0.975,
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
    pos.id, pos.symbol, pos.base_currency, pos.traded_currency, pos.side,
    pos.entry_price, pos.current_price, pos.amount, pos.initial_cost_idr,
    pos.highest_price, pos.trailing_stop_price, pos.take_profit_step,
    pos.status, pos.opened_at, pos.mode
  );

  return pos;
}

function cleanupPosition(id: string) {
  db.prepare('DELETE FROM positions WHERE id = ?').run(id);
  db.prepare('DELETE FROM trades_history WHERE position_id = ?').run(id);
  db.prepare('DELETE FROM order_intents WHERE position_id = ?').run(id);
}

interface RecordedOrder {
  symbol: string;
  side: string;
  type: string;
  quantity?: number;
  price?: number;
  quoteOrderQty?: number;
  newClientOrderId?: string;
}

/**
 * Swaps createOrder/waitForOrderFill with a scripted exchange. Each script
 * entry describes the fill an order of a given type should produce.
 */
function mockExchange(scripts: Array<{ type: string; executedQty: number; price: number }>) {
  const calls: RecordedOrder[] = [];
  const originalCreate = indodax.createOrder;
  const originalWait = indodax.waitForOrderFill;
  let scriptIndex = 0;

  indodax.createOrder = (async (options: any) => {
    calls.push({ ...options });
    const script = scripts[Math.min(scriptIndex, scripts.length - 1)];
    scriptIndex++;
    return {
      orderId: 9000 + scriptIndex,
      status: script.executedQty > 0 ? 'FILLED' : 'NEW',
      executedQty: String(script.executedQty),
      quoteQty: String(script.executedQty * script.price),
      avgPrice: String(script.price),
    };
  }) as any;

  indodax.waitForOrderFill = (async (_symbol: string, _orderId: string, rawResponse?: any) => {
    return indodax.extractOrderFill(rawResponse ?? {}, {});
  }) as any;

  return {
    calls,
    restore() {
      indodax.createOrder = originalCreate;
      indodax.waitForOrderFill = originalWait;
    },
  };
}

// ---------------------------------------------------------------------------
// Pure gates
// ---------------------------------------------------------------------------

describe('Max Drawdown Kill Switch Gate (pure)', () => {
  test('passes when equity is near the peak', () => {
    const gate = checkMaxDrawdown(950_000, 1_000_000, 15, 0);
    assert.equal(gate.passed, true);
  });

  test('fails when drawdown from peak exceeds the limit', () => {
    const gate = checkMaxDrawdown(800_000, 1_000_000, 15, 0);
    assert.equal(gate.passed, false);
    assert.ok(gate.reason.includes('20.00%'));
  });

  test('fails when equity is below the absolute floor', () => {
    const gate = checkMaxDrawdown(4_000_000, 5_000_000, 90, 5_000_000);
    assert.equal(gate.passed, false);
    assert.ok(gate.reason.includes('floor'));
  });

  test('is disabled when both limits are zero', () => {
    const gate = checkMaxDrawdown(1, 1_000_000, 0, 0);
    assert.equal(gate.passed, true);
  });

  test('handles an unset peak (fresh install) without triggering', () => {
    const gate = checkMaxDrawdown(10_000_000, 0, 15, 0);
    assert.equal(gate.passed, true);
  });
});

describe('Equity-Percent Allocation Cap (pure)', () => {
  test('caps allocation above the configured percent of equity', () => {
    const r = capAllocationByEquityPercent(500_000, 1_000_000, 20);
    assert.equal(r.capped, true);
    assert.equal(r.allocationIdr, 200_000);
  });

  test('passes allocation through when below the cap', () => {
    const r = capAllocationByEquityPercent(100_000, 1_000_000, 20);
    assert.equal(r.capped, false);
    assert.equal(r.allocationIdr, 100_000);
  });

  test('is disabled when percent is zero', () => {
    const r = capAllocationByEquityPercent(999_999, 1_000, 0);
    assert.equal(r.capped, false);
    assert.equal(r.allocationIdr, 999_999);
  });
});

// ---------------------------------------------------------------------------
// Floored exit execution
// ---------------------------------------------------------------------------

describe('Floored Limit Exit (live sell execution)', () => {
  test('fills fully on the exchange through a single LIMIT sell at the floor price', async () => {
    const pos = insertLivePosition('flooret', 10, 100_000);
    const mock = mockExchange([{ type: 'LIMIT', executedQty: 10, price: 97_500 }]);
    setSetting('exit_floor_limit_enabled', '1');

    try {
      const result = await engine.executeSell(pos, 10, 100_000, 'Trailing Stop', { floorPrice: 97_500 });
      assert.equal(result.ok, true);
      assert.equal(result.filledAmount, 10);
      assert.equal(mock.calls.length, 1, 'full limit fill must not spawn a market order');
      assert.equal(mock.calls[0].type, 'LIMIT');
      assert.equal(mock.calls[0].side, 'SELL');
      assert.equal(mock.calls[0].price, 97_500, 'limit price must equal the floor');
      assert.ok(mock.calls[0].newClientOrderId, 'clientOrderId must travel with the order');

      // Intent journaled and resolved
      const intent = db.prepare('SELECT * FROM order_intents WHERE client_order_id = ?').get(mock.calls[0].newClientOrderId) as any;
      assert.ok(intent, 'intent row must exist for the clientOrderId');
      assert.equal(intent.state, 'resolved');
    } finally {
      mock.restore();
      cleanupPosition(pos.id);
    }
  });

  test('sells the remainder via MARKET when the limit partially fills, combining both fills', async () => {
    const pos = insertLivePosition('flopart', 10, 100_000);
    const mock = mockExchange([
      { type: 'LIMIT', executedQty: 4, price: 97_500 },
      { type: 'MARKET', executedQty: 6, price: 97_000 },
    ]);

    try {
      const result = await engine.executeSell(pos, 10, 100_000, 'Trailing Stop', { floorPrice: 97_500 });
      assert.equal(result.ok, true);
      assert.equal(result.filledAmount, 10);
      assert.equal(mock.calls.length, 2);
      assert.equal(mock.calls[0].type, 'LIMIT');
      assert.equal(mock.calls[1].type, 'MARKET');
      assert.equal(mock.calls[1].quantity, 6, 'market remainder must be the unfilled part');

      // Combined proceeds: 4*97500 + 6*97000 = 972000 → avg 97200
      assert.equal(result.proceedsIdr, 972_000);
      assert.equal(result.averagePrice, 97_200);

      const history = db.prepare("SELECT amount, total_idr FROM trades_history WHERE position_id = ? AND type = 'SELL'").get(pos.id) as any;
      assert.ok(history);
      assert.equal(history.amount, 10);
      assert.equal(history.total_idr, 972_000);
    } finally {
      mock.restore();
      cleanupPosition(pos.id);
    }
  });

  test('flags a dust remainder below the exchange minimum as unprotected and still records the limit fill', async () => {
    const pos = insertLivePosition('flodust', 10, 100_000);
    const mock = mockExchange([
      { type: 'LIMIT', executedQty: 9.95, price: 97_500 },
      { type: 'MARKET', executedQty: 0, price: 97_000 }, // must never be called
    ]);

    try {
      const result = await engine.executeSell(pos, 10, 100_000, 'Trailing Stop', { floorPrice: 97_500 });
      assert.equal(result.ok, true);
      assert.equal(result.filledAmount, 9.95);
      assert.equal(result.fullyFilled, false);
      assert.equal(mock.calls.length, 1, 'dust remainder must not be sent as a market order');

      const history = db.prepare("SELECT amount FROM trades_history WHERE position_id = ? AND type = 'SELL'").get(pos.id) as any;
      assert.ok(history, 'the limit fill must still be recorded in trades_history');
      assert.equal(history.amount, 9.95);

      const row = db.prepare('SELECT amount, unprotected_since FROM positions WHERE id = ?').get(pos.id) as any;
      assert.ok(row.unprotected_since, 'dust position must be flagged unprotected');
    } finally {
      mock.restore();
      cleanupPosition(pos.id);
    }
  });

  test('closePosition refuses to retry a position whose total value is below the exchange minimum', async () => {
    const pos = insertLivePosition('flodust2', 0.05, 100_000); // Rp 5.000 < min Rp 10.000
    const mock = mockExchange([]);

    try {
      const sold = await engine.closePosition(pos, 100_000, 'Trailing Stop');
      assert.equal(sold, false);
      assert.equal(mock.calls.length, 0, 'no order may be sent for an unsellable dust position');

      const row = db.prepare('SELECT status, unprotected_since FROM positions WHERE id = ?').get(pos.id) as any;
      assert.equal(row.status, 'open');
      assert.ok(row.unprotected_since);
    } finally {
      mock.restore();
      cleanupPosition(pos.id);
    }
  });

  test('falls back to a blind MARKET sell when the limit placement throws (behavior parity with the old path)', async () => {
    const pos = insertLivePosition('flofall', 10, 100_000);
    const calls: RecordedOrder[] = [];
    const originalCreate = indodax.createOrder;
    const originalWait = indodax.waitForOrderFill;

    indodax.createOrder = (async (options: any) => {
      calls.push({ ...options });
      if (options.type === 'LIMIT') throw new Error('simulated limit rejection');
      return { orderId: 9500, status: 'FILLED', executedQty: '10', quoteQty: '970000', avgPrice: '97000' };
    }) as any;
    indodax.waitForOrderFill = (async (_s: string, _o: string, raw?: any) => indodax.extractOrderFill(raw ?? {}, {})) as any;

    try {
      const result = await engine.executeSell(pos, 10, 100_000, 'Trailing Stop', { floorPrice: 97_500 });
      assert.equal(result.ok, true);
      assert.equal(result.filledAmount, 10);
      assert.equal(mockExchangeLength(calls), 2);
      assert.equal(calls[1].type, 'MARKET');
    } finally {
      indodax.createOrder = originalCreate;
      indodax.waitForOrderFill = originalWait;
      cleanupPosition(pos.id);
    }
  });

  function mockExchangeLength(calls: RecordedOrder[]) {
    return calls.length;
  }
});

// ---------------------------------------------------------------------------
// Order intent journal & crash recovery
// ---------------------------------------------------------------------------

describe('Order Intent Journal (idempotency & crash recovery)', () => {
  // Isolate from leftovers of earlier suites in the same process: the
  // reconciler scans the whole journal, so every test here starts clean.
  function sealExistingIntents() {
    db.prepare("UPDATE order_intents SET state = 'resolved', resolved_at = ? WHERE state IN ('sent', 'ack')").run(Date.now());
  }

  test('live buy records an intent before sending, acks with the exchange id, and resolves after recording', async () => {
    sealExistingIntents();
    const originalAccount = indodax.getAccountInfo;
    const calls: RecordedOrder[] = [];
    const originalCreate = indodax.createOrder;
    const originalWait = indodax.waitForOrderFill;

    indodax.getAccountInfo = (async () => ({
      canTrade: true,
      canWithdraw: false,
      accountType: 'spot',
      balances: [{ asset: 'IDR', free: '10000000', locked: '0' }],
    })) as any;
    indodax.createOrder = (async (options: any) => {
      calls.push({ ...options });
      return { orderId: 777, status: 'FILLED', executedQty: '100', quoteQty: '100000', avgPrice: '1000' };
    }) as any;
    indodax.waitForOrderFill = (async (_s: string, _o: string, raw?: any) => indodax.extractOrderFill(raw ?? {}, {})) as any;

    try {
      const ok = await engine.executeBuy('itstbuy', 1000, 100, 100_000, 'live', 'test entry');
      assert.equal(ok, true);
      assert.equal(calls.length, 1);
      assert.ok(calls[0].newClientOrderId);

      const intent = db.prepare('SELECT * FROM order_intents WHERE client_order_id = ?').get(calls[0].newClientOrderId) as any;
      assert.ok(intent, 'intent must be journaled under the clientOrderId');
      assert.equal(intent.kind, 'entry');
      assert.equal(intent.side, 'BUY');
      assert.equal(intent.state, 'resolved', 'intent must resolve after the position is recorded');
      assert.equal(intent.exchange_order_id, '777');

      const pos = db.prepare("SELECT id FROM positions WHERE traded_currency = 'itstbuy' AND status = 'open'").get() as any;
      assert.ok(pos);
      cleanupPosition(pos.id);
    } finally {
      indodax.getAccountInfo = originalAccount;
      indodax.createOrder = originalCreate;
      indodax.waitForOrderFill = originalWait;
    }
  });

  test('reconcileUnresolvedIntents detects an order that FILLED while the process was down and halts', async () => {
    sealExistingIntents();
    setSetting('trading_mode', 'live');
    const id = `oi_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO order_intents (id, ts, symbol, side, kind, order_type, params_json, client_order_id, state, exchange_order_id)
      VALUES (?, ?, 'testcoinidr', 'BUY', 'entry', 'MARKET', '{}', 'itdentest1', 'ack', '4242')
    `).run(id, Date.now() - 120_000);

    const originalLookup = indodax.getOrderByClientOrderId;
    indodax.getOrderByClientOrderId = (async () => ({
      status: 'FILLED', executedQty: '100', quoteQty: '100000', avgPrice: '1000',
    })) as any;

    try {
      const result = await engine.reconcileUnresolvedIntents(1000);
      assert.equal(result.requiresHalt, true, 'a filled-but-unrecorded order must halt auto-trading');
      assert.ok(result.issues.some((i) => i.includes('TERNYATA TERISI')));

      const row = db.prepare('SELECT state FROM order_intents WHERE id = ?').get(id) as any;
      assert.equal(row.state, 'resolved');
    } finally {
      indodax.getOrderByClientOrderId = originalLookup;
      db.prepare('DELETE FROM order_intents WHERE id = ?').run(id);
      setSetting('trading_mode', 'paper');
    }
  });

  test('reconcileUnresolvedIntents marks an order that never reached the exchange as unresolved without halting', async () => {
    sealExistingIntents();
    setSetting('trading_mode', 'live');
    const id = `oi_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO order_intents (id, ts, symbol, side, kind, order_type, params_json, client_order_id, state)
      VALUES (?, ?, 'testcoinidr', 'SELL', 'exit', 'LIMIT', '{}', 'itdentest2', 'sent')
    `).run(id, Date.now() - 120_000);

    const originalLookup = indodax.getOrderByClientOrderId;
    indodax.getOrderByClientOrderId = (async () => ({})) as any; // unknown order

    try {
      const result = await engine.reconcileUnresolvedIntents(1000);
      assert.equal(result.requiresHalt, false);

      const row = db.prepare('SELECT state FROM order_intents WHERE id = ?').get(id) as any;
      assert.equal(row.state, 'unresolved');
    } finally {
      indodax.getOrderByClientOrderId = originalLookup;
      db.prepare('DELETE FROM order_intents WHERE id = ?').run(id);
      setSetting('trading_mode', 'paper');
    }
  });
});

// ---------------------------------------------------------------------------
// Drawdown kill switch end-to-end (through the daily breaker's equity read)
// ---------------------------------------------------------------------------

describe('Drawdown Kill Switch (end-to-end)', () => {
  const originalSnapshot = tradingEngine.getEquitySnapshot.bind(tradingEngine);

  test('halts on a 20% drawdown, de-risks by halving positions, and resets manually', async () => {
    const originalTradingMode = getSetting('trading_mode', 'paper');
    setSetting('trading_mode', 'live');
    setSetting('daily_loss_limit_percent', '100'); // isolate from the daily breaker
    setSetting('max_drawdown_percent', '15');
    setSetting('derisk_mode_on_drawdown', 'halve');
    setSetting('equity_peak_live', '1000000');
    setSetting('drawdown_halt_since', '0');
    setSetting('circuit_breaker_triggered_at', '0');
    setSetting('is_auto_trading_active', '1');

    const pos = insertLivePosition('ddhalve', 2, 100_000);
    const mock = mockExchange([{ type: 'LIMIT', executedQty: 1, price: 100_000 }]);

    // Equity fell to 800k from a 1M peak → 20% drawdown ≥ 15% limit
    tradingEngine.getEquitySnapshot = (async () => ({
      mode: 'live',
      cashIdr: 600_000,
      cashFreeIdr: 600_000,
      cashLockedIdr: 0,
      holdingsValueIdr: 200_000,
      equityIdr: 800_000,
      floatingPnlIdr: -200_000,
      openPositions: 1,
    })) as any;

    try {
      const blocked = await tradingEngine.checkDailyCircuitBreaker();
      assert.equal(blocked, true, 'drawdown breach must block new entries');

      assert.ok(parseInt(getSetting('drawdown_halt_since', '0'), 10) > 0, 'halt must be latched');
      assert.equal(getSetting('is_auto_trading_active'), '0', 'auto-trading must stop');

      const row = db.prepare('SELECT amount FROM positions WHERE id = ?').get(pos.id) as any;
      assert.equal(row.amount, 1, 'halve de-risk must sell 50% of the position');

      // Second evaluation is idempotent (no double de-risk)
      const callsAfterFirst = mock.calls.length;
      await tradingEngine.checkDailyCircuitBreaker();
      assert.equal(mock.calls.length, callsAfterFirst, 'latched halt must not re-run the de-risk');

      // Manual reset re-bases the peak to current equity
      const reset = await tradingEngine.resetDrawdownKillSwitch();
      assert.equal(reset.cleared, true);
      assert.equal(getSetting('drawdown_halt_since'), '0');
      assert.equal(getSetting('equity_peak_live'), '800000');
    } finally {
      tradingEngine.getEquitySnapshot = originalSnapshot;
      mock.restore();
      cleanupPosition(pos.id);
      setSetting('trading_mode', originalTradingMode);
      setSetting('daily_loss_limit_percent', '5');
      setSetting('derisk_mode_on_drawdown', 'halt');
      setSetting('equity_peak_live', '0');
      setSetting('equity_peak_paper', '0');
      setSetting('drawdown_halt_since', '0');
      setSetting('circuit_breaker_triggered_at', '0');
    }
  });

  test('does not trigger when equity is above the drawdown threshold', async () => {
    setSetting('max_drawdown_percent', '15');
    setSetting('equity_peak_live', '1000000');
    setSetting('drawdown_halt_since', '0');
    setSetting('circuit_breaker_triggered_at', '0');

    tradingEngine.getEquitySnapshot = (async () => ({
      mode: 'live',
      cashIdr: 900_000,
      cashFreeIdr: 900_000,
      cashLockedIdr: 0,
      holdingsValueIdr: 0,
      equityIdr: 900_000,
      floatingPnlIdr: 0,
      openPositions: 0,
    })) as any;

    try {
      const blocked = await tradingEngine.checkDailyCircuitBreaker();
      assert.equal(blocked, false);
      assert.equal(getSetting('drawdown_halt_since'), '0');
      assert.equal(getSetting('equity_peak_live'), '1000000', 'peak must not regress');
    } finally {
      tradingEngine.getEquitySnapshot = originalSnapshot;
      setSetting('equity_peak_live', '0');
    }
  });
});
