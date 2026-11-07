import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setAllowLocalFetchAllowed, validateOutboundUrl } from '../src/services/security/urlGuard.js';
import { resolveAntigravityCredentials } from '../src/services/antigravity/oauth.js';
import { db, setSetting, getSetting } from '../src/db/index.js';

describe('Web-first configuration (tanpa .env)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const grab = (k: string) => {
    savedEnv[k] = process.env[k];
  };
  const restore = () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };

  it('setting web `allow_local_fetch=1` mengizinkan hostname lokal lewat setter', () => {
    grab('AI_TRADING_ALLOW_LOCAL_FETCH');
    delete process.env.AI_TRADING_ALLOW_LOCAL_FETCH;
    try {
      // Default: localhost ditolak (anti-SSRF).
      assert.equal(validateOutboundUrl('http://127.0.0.1:11434/v1/models').ok, false);
      // Setter di-inject dari server boot + disegarkan saat setting diubah via API.
      setAllowLocalFetchAllowed(true);
      const result = validateOutboundUrl('http://127.0.0.1:11434/v1/models');
      assert.equal(result.ok, true, 'setter web harus mengizinkan localhost');
      assert.equal(getSetting('allow_local_fetch', '0'), '0');
    } finally {
      setAllowLocalFetchAllowed(false);
      restore();
    }
  });

  it('setting antigravity_client_id/secret menimpa env dan baked default', () => {
    grab('ANTIGRAVITY_CLIENT_ID');
    grab('ANTIGRAVITY_CLIENT_SECRET');
    process.env.ANTIGRAVITY_CLIENT_ID = 'env-client-id';
    process.env.ANTIGRAVITY_CLIENT_SECRET = 'env-client-secret';
    const before = resolveAntigravityCredentials();
    assert.equal(before.clientId, 'env-client-id', 'tanpa setting web, env dipakai');

    setSetting('antigravity_client_id', 'web-client-id');
    setSetting('antigravity_client_secret', 'web-client-secret');
    try {
      const after = resolveAntigravityCredentials();
      assert.equal(after.clientId, 'web-client-id', 'setting web menang atas env');
      assert.equal(after.clientSecret, 'web-client-secret');
    } finally {
      // Hapus setting supaya test lain melihat default.
      db.prepare('DELETE FROM settings WHERE key IN (?, ?)').run('antigravity_client_id', 'antigravity_client_secret');
      restore();
    }
  });

  it('guard tetap menolak skema non-http meski izin lokal aktif', () => {
    setAllowLocalFetchAllowed(true);
    try {
      assert.equal(validateOutboundUrl('file:///etc/passwd').ok, false);
      assert.equal(validateOutboundUrl('ftp://127.0.0.1/x').ok, false);
    } finally {
      setAllowLocalFetchAllowed(false);
    }
  });
});
