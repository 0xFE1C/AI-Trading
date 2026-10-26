import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { db, setSetting } from '../src/db/index.js';
import { apiRouter } from '../src/api/routes.js';
import { tradingEngine } from '../src/services/trading/index.js';

let server: http.Server;
let baseUrl = '';

test.before(async () => {
  setSetting('admin_access_token', 'metrics-admin-token');
  setSetting('trading_mode', 'live');
  setSetting('is_auto_trading_active', '1');
  setSetting('drawdown_halt_since', '123456');
  setSetting('circuit_breaker_triggered_at', '0');

  db.prepare(`
    INSERT INTO positions (
      id, symbol, base_currency, traded_currency, side, entry_price, current_price,
      amount, initial_cost_idr, highest_price, trailing_stop_price, take_profit_step,
      status, opened_at, mode, unprotected_since
    ) VALUES ('pos_metrics_1', 'mettestidr', 'idr', 'mettest', 'buy', 100000, 100000,
              1, 100000, 100000, 97500, 0, 'open', ?, 'live', ?)
  `).run(Date.now(), Date.now());
  db.prepare(`
    INSERT INTO order_intents (id, ts, symbol, side, kind, order_type, params_json, state)
    VALUES ('oi_metrics_1', ?, 'mettestidr', 'BUY', 'entry', 'MARKET', '{}', 'sent')
  `).run(Date.now());

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  db.prepare("DELETE FROM positions WHERE id = 'pos_metrics_1'").run();
  db.prepare("DELETE FROM order_intents WHERE id = 'oi_metrics_1'").run();
  setSetting('trading_mode', 'paper');
  setSetting('drawdown_halt_since', '0');
  setSetting('is_auto_trading_active', '0');
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('getEngineMetrics reports open positions, unprotected count, and pending intents', () => {
  const metrics = tradingEngine.getEngineMetrics();
  assert.equal(metrics.tradingMode, 'live');
  assert.equal(metrics.autoTradingActive, true);
  assert.equal(metrics.openPositionsLive, 1);
  assert.equal(metrics.unprotectedLivePositions, 1);
  assert.ok(metrics.pendingOrderIntents >= 1);
  assert.equal(metrics.drawdownHalt, 1);
  assert.equal(metrics.circuitBreakerActive, 0);
});

test('GET /api/metrics exposes Prometheus text format without secrets', async () => {
  const res = await fetch(`${baseUrl}/api/metrics`);
  assert.equal(res.status, 200);
  const contentType = res.headers.get('content-type') || '';
  assert.ok(contentType.includes('text/plain'), 'Prometheus exposition must be text/plain');

  const body = await res.text();
  for (const metric of [
    'ai_trading_open_positions{mode="live"} 1',
    'ai_trading_unprotected_live_positions 1',
    'ai_trading_drawdown_halt 1',
    'ai_trading_pending_order_intents',
    'ai_trading_market_ws_connected',
    'ai_trading_process_uptime_seconds',
  ]) {
    assert.ok(body.includes(metric), `metrics output must include ${metric}`);
  }

  // No credential material may ever appear in the exposition
  assert.ok(!body.toLowerCase().includes('secret'));
  assert.ok(!body.includes('admin_access_token'));
});

test('GET /api/trading/safety-status returns drawdown/guard telemetry for admins', async () => {
  const res = await fetch(`${baseUrl}/api/trading/safety-status`, {
    headers: { Authorization: 'Bearer metrics-admin-token' },
  });
  assert.equal(res.status, 200);
  const { data } = (await res.json()) as any;
  assert.equal(data.tradingMode, 'live');
  assert.equal(data.drawdownHalt, true);
  assert.equal(data.unprotectedPositions, 1);
  assert.ok(data.pendingOrderIntents >= 1);
  assert.equal(typeof data.peakEquityIdr, 'number');
  assert.equal(typeof data.maxDrawdownPercent, 'number');
  assert.equal(typeof data.requireProtectiveOrders, 'boolean');
  assert.equal(typeof data.exitFloorLimitEnabled, 'boolean');
  // No secrets may leak through the safety payload
  assert.ok(!JSON.stringify(data).includes('token'));
});

test('GET /api/trading/safety-status rejects unauthenticated requests', async () => {
  const res = await fetch(`${baseUrl}/api/trading/safety-status`);
  assert.equal(res.status, 401);
});
