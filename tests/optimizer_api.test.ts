import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { db, getSetting, setSetting } from '../src/db/index.js';
import { apiRouter } from '../src/api/routes.js';
import { saveCandles } from '../src/services/candles/store.js';
import type { BacktestBar } from '../src/services/backtest/index.js';

/**
 * Test endpoint optimizer:
 *  - GET/POST /api/optimizer/* butuh admin (observer → 401)
 *  - POST /api/optimizer/run menjalankan optimasi offline (bar sintetis di
 *    candle store) dan melaporkan apakah preset ditulis
 *  - rate limit 1 run / 10 menit → POST kedua → 429
 *  - GET /api/optimizer/status memuat 10 run terakhir + preset + flag settings
 */

const ADMIN_TOKEN = 'optimizer-api-admin-token';

// --- Bar sintetis trending (identik dgn generator test optimizer_service) ---

const HOUR = 3_600_000;
const LAST_BUCKET = Math.floor(Date.now() / HOUR) * HOUR;

type Phase = Array<{ hours: number; pct: number }>;

function runPhases(phases: Phase[]): number[] {
  const closes: number[] = [];
  let price = 1000;
  for (const p of phases) {
    for (let h = 0; h < p.hours; h++) {
      price *= 1 + p.pct / 100;
      closes.push(price);
    }
  }
  return closes;
}

function trendCloses(cycles: number): number[] {
  const phases: Phase = [];
  for (let i = 0; i < cycles; i++) {
    const cycle: Phase =
      i % 2 === 0
        ? [{ hours: 1, pct: 4 }, { hours: 27, pct: 1.0 }, { hours: 20, pct: -1.3 }]
        : [{ hours: 1, pct: 4 }, { hours: 3, pct: -4 }, { hours: 44, pct: -0.05 }];
    phases.push(...cycle);
  }
  return runPhases(phases);
}

function buildBars(closes: number[]): BacktestBar[] {
  return closes.map((c, i) => {
    const prev = i === 0 ? c : closes[i - 1];
    return {
      timestamp: LAST_BUCKET - (closes.length - 1 - i) * HOUR,
      open: prev,
      high: Math.max(prev, c) * 1.001,
      low: Math.min(prev, c) * 0.999,
      close: c,
      volume: 1000 + (i % 5) * 200,
    };
  });
}

// --- Fetch global offline: fallback fetch optimizer tidak boleh menyentuh
// network. Request HTTP milik test sendiri memakai realFetch yang sudah
// diselamatkan SEBELUM stub dipasang. --------------------------------------

const realFetch = globalThis.fetch.bind(globalThis);
(globalThis as any).fetch = async () => {
  throw new Error('offline-stub: test API optimizer tidak boleh network');
};

// --- Server HTTP kecil -------------------------------------------------------

let server: http.Server;
let baseUrl = '';

test.before(async () => {
  setSetting('admin_access_token', ADMIN_TOKEN);
  setSetting('optimizer_preset_enabled', '0');
  setSetting('optimizer_auto_run', '0');
  setSetting('optimizer_preset_tp1', '');
  setSetting('optimizer_preset_tp2', '');
  setSetting('optimizer_preset_meta', '');

  // 44 siklus x 48 jam = 2112 bar (~88 hari) → menutup jendela days=85.
  const saved = saveCandles('apiopt', '1h', buildBars(trendCloses(44)));
  assert.ok(saved > 0, 'seed candle store untuk API test');

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
  db.prepare("DELETE FROM candles WHERE pair = 'apiopt'").run();
  db.prepare("DELETE FROM optimizer_runs WHERE symbol = 'APIOPT'").run();
  setSetting('optimizer_preset_tp1', '');
  setSetting('optimizer_preset_tp2', '');
  setSetting('optimizer_preset_meta', '');
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function getJson(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await realFetch(`${baseUrl}${path}`, { headers });
  return { status: res.status, body: (await res.json()) as any };
}

async function postJson(path: string, payload: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await realFetch(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(payload) });
  return { status: res.status, body: (await res.json()) as any };
}

describe('API Optimizer — auth, run, status', () => {
  test('observer ditolak 401 untuk run dan status', async () => {
    assert.equal((await getJson('/api/optimizer/status')).status, 401);
    assert.equal((await postJson('/api/optimizer/run', {})).status, 401);
  });

  test('POST /optimizer/run (admin) menjalankan walk-forward offline & menulis preset', async () => {
    const { status, body } = await postJson('/api/optimizer/run', { symbols: ['APIOPT'], timeframe: '1h', days: 85 }, ADMIN_TOKEN);
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.ok, true);
    assert.equal(body.data.days, 85);
    assert.equal(body.data.symbols.length, 1);
    assert.equal(body.data.symbols[0].symbol, 'APIOPT');
    assert.equal(body.data.symbols[0].dataSource, 'cache', 'harus memakai candle store, bukan network');
    assert.equal(body.data.symbols[0].walkForward.verdict, 'WALK_FORWARD_ROBUST');
    assert.equal(body.data.presetWritten, true);
    assert.ok(body.data.preset.tp1 > 0);
    assert.ok(body.data.preset.tp2 === body.data.preset.tp1 * 2);
    assert.ok(/preset/i.test(body.message), 'pesan harus melaporkan status preset');
    assert.ok(getSetting('optimizer_preset_tp1', '') !== '', 'settings preset harus tertulis');
  });

  test('POST /optimizer/run kedua dalam 10 menit ditolak rate limiter (429)', async () => {
    const { status, body } = await postJson('/api/optimizer/run', { symbols: ['APIOPT'] }, ADMIN_TOKEN);
    assert.equal(status, 429);
    assert.equal(body.success, false);
    assert.ok(body.retryAfter > 0);
  });

  test('GET /optimizer/status (admin) memuat runs, preset, dan flag settings', async () => {
    const { status, body } = await getJson('/api/optimizer/status', ADMIN_TOKEN);
    assert.equal(status, 200);
    assert.equal(body.success, true);
    const data = body.data;
    assert.equal(typeof data.isOptimizing, 'boolean');
    assert.equal(data.isOptimizing, false);
    assert.ok(Array.isArray(data.runs));
    assert.ok(data.runs.length >= 1, 'run test sebelumnya harus tercatat');
    assert.equal(data.runs[0].symbol, 'APIOPT');
    assert.ok(data.runs.length <= 10, 'maksimal 10 run terakhir');
    assert.ok(data.preset, 'preset harus tampil');
    assert.equal(data.preset.fresh, true);
    assert.equal(data.preset.meta.verdict, 'WALK_FORWARD_ROBUST');
    assert.equal(data.autoRun, false);
    assert.equal(data.presetEnabled, false);
    assert.equal(typeof data.lastRunAt, 'number');
  });
});
