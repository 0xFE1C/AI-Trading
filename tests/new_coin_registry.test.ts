import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IndodaxClient } from '../src/services/indodax/index.js';
import { db, setSetting } from '../src/db/index.js';

interface MockPair {
  id: string;
  symbol: string;
  base_currency: string;
  traded_currency: string;
  description: string;
}

function pair(base: string): MockPair {
  return {
    id: `${base}idr`,
    symbol: `${base.toUpperCase()}IDR`,
    base_currency: 'idr',
    traded_currency: base,
    description: `${base.toUpperCase()} Token`,
  };
}

test('new coin registry seeds silently, alerts once, and survives restart', async (t) => {
  db.prepare('DELETE FROM new_coin_alerts').run();
  db.prepare('DELETE FROM known_pairs').run();
  setSetting('known_pairs_seeded', '0');

  let currentPairs: MockPair[] = [pair('alpha'), pair('beta')];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/pairs')) {
      return new Response(JSON.stringify(currentPairs), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/ticker/')) {
      const id = url.split('/api/ticker/')[1];
      return new Response(
        JSON.stringify({ ticker: { name: id, last: '1234', high: '1300', low: '1000', vol_idr: '56000000', buy: '1233', sell: '1235', server_time: Date.now() } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    db.prepare("DELETE FROM new_coin_alerts WHERE symbol IN ('gammaidr')").run();
    db.prepare("DELETE FROM known_pairs WHERE pair_id IN ('alphaidr', 'betaidr', 'gammaidr')").run();
  });

  const callbackSymbols: string[] = [];
  const first = new IndodaxClient();
  first.setNewCoinCallback((coin) => callbackSymbols.push(coin.symbol));

  await first.getPairs(true);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS c FROM new_coin_alerts').get<{ c: number }>()!.c,
    0,
    'first fetch must seed the universe silently'
  );
  assert.equal(callbackSymbols.length, 0);

  currentPairs = [...currentPairs, pair('gamma')];
  await first.getPairs(true);

  const alerts = db.prepare('SELECT symbol, initial_price, volume_24h FROM new_coin_alerts').all() as Array<{
    symbol: string;
    initial_price: number;
    volume_24h: number;
  }>;
  assert.equal(alerts.length, 1, 'exactly one alert for the newly listed pair');
  assert.equal(alerts[0].symbol, 'gammaidr');
  assert.equal(alerts[0].initial_price, 1234, 'alert stores the live ticker price, not the min trade size');
  assert.equal(alerts[0].volume_24h, 56000000);
  assert.deepEqual(callbackSymbols, ['gammaidr']);

  // Simulate a process restart: new client, same pair universe
  const second = new IndodaxClient();
  second.setNewCoinCallback((coin) => callbackSymbols.push(coin.symbol));
  await second.getPairs(true);

  assert.equal(
    db.prepare('SELECT COUNT(*) AS c FROM new_coin_alerts').get<{ c: number }>()!.c,
    1,
    'restart must not re-announce already-known pairs'
  );
  assert.deepEqual(callbackSymbols, ['gammaidr']);
});
