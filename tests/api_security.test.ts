import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { apiRouter } from '../src/api/routes.js';
import {
  encryptProviderApiKeys,
  encryptProviderOAuth,
} from '../src/services/security/secrets.js';

const ADMIN_TOKEN = 'integration-admin-token-for-tests';

let server: http.Server;
let baseUrl = '';
let providerId = '';

test.before(async () => {
  setSetting('admin_access_token', ADMIN_TOKEN);
  setSetting('trading_mode', 'paper');
  setSetting('whatsapp_admin_number', '628111222333');
  setSetting('whatsapp_admin_lid', '999999999999@lid');

  providerId = `prov_api_security_${Date.now()}`;
  db.prepare(`
    INSERT INTO providers (id, name, base_url, api_keys, alias, protocol, oauth_data, is_active, created_at)
    VALUES (?, 'Security Test Provider', 'https://example.com/v1', ?, ?, 'antigravity', ?, 1, ?)
  `).run(
    providerId,
    encryptProviderApiKeys(['provider-key-one']),
    `sec_test_${Date.now()}`,
    encryptProviderOAuth({ email: 'secret@example.com', projectId: 'proj-1', accessToken: 'access' }),
    Date.now()
  );

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
  db.prepare('DELETE FROM providers WHERE id = ?').run(providerId);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function getJson(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { status: res.status, body: (await res.json()) as any };
}

test('observer status hides balance, positions, trades, and WhatsApp identity', async () => {
  const { status, body } = await getJson('/api/status');

  assert.equal(status, 200);
  assert.equal(body.data.isAdmin, false);
  assert.equal(body.data.portfolioRedacted, true);
  assert.equal(body.data.balanceIdr, null);
  assert.deepEqual(body.data.openPositions, []);
  assert.deepEqual(body.data.recentTrades, []);
  assert.deepEqual(body.data.lessonsLearned, []);
  assert.equal(body.data.whatsapp.adminNumber, '');
  assert.equal(body.data.whatsapp.adminLid, '');
});

test('authenticated status returns portfolio details for the active mode', async () => {
  const { status, body } = await getJson('/api/status', ADMIN_TOKEN);

  assert.equal(status, 200);
  assert.equal(body.data.isAdmin, true);
  assert.equal(body.data.portfolioRedacted, false);
  assert.equal(typeof body.data.balanceIdr, 'number');
  assert.equal(body.data.mode, 'paper');
  assert.equal(body.data.whatsapp.adminNumber, '628111222333');
});

test('admin tokens in the query string are not accepted', async () => {
  const { body } = await getJson(`/api/status?token=${encodeURIComponent(ADMIN_TOKEN)}`);
  assert.equal(body.data.isAdmin, false);
  assert.equal(body.data.portfolioRedacted, true);
});

test('portfolio, reporting, diagnostics, and quota endpoints require admin authentication', async () => {
  for (const path of [
    '/api/positions',
    '/api/providers/quota/all',
    '/api/reports/summary',
    '/api/reports/csv',
    '/api/trading/ab-metrics',
    '/api/diagnostics/entry-gates',
    '/api/agent-bus/messages',
  ]) {
    assert.equal((await getJson(path)).status, 401, `${path} must reject observers`);
  }
  assert.equal((await getJson('/api/positions', ADMIN_TOKEN)).status, 200);
});

test('credentials are masked for observers and the admin token is never echoed', async () => {
  const observer = await getJson('/api/settings');
  assert.equal(observer.body.data.admin_access_token, '****************');
  assert.equal(observer.body.data.indodax_secret_key, '');
  assert.equal(observer.body.data.whatsapp_admin_number, '**********');

  const admin = await getJson('/api/settings', ADMIN_TOKEN);
  assert.equal(admin.body.data.admin_access_token, '****************');

  const providers = await getJson('/api/providers');
  assert.equal(providers.status, 200);
  assert.equal(providers.body.data[0].oauth_data.email, 's***@example.com');
  assert.ok(!JSON.stringify(providers.body.data).includes('provider-key-one'));
  assert.ok(!JSON.stringify(providers.body.data).includes('access'));

  const providersAdmin = await getJson('/api/providers', ADMIN_TOKEN);
  assert.equal(providersAdmin.body.data[0].oauth_data.email, 'secret@example.com');
});

test('the configured admin token is stored encrypted at rest', () => {
  const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_access_token') as { value: string };
  assert.ok(raw.value.startsWith('enc:v1:'));
  assert.equal(getSetting('admin_access_token'), ADMIN_TOKEN);
});
