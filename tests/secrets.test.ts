import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  db,
  DATA_DIR,
  getSetting,
  setSetting,
  getAllSettings,
  migrateSecretsAtRest,
} from '../src/db/index.js';
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  isSensitiveSettingKey,
  decryptProviderApiKeys,
  decryptProviderOAuth,
} from '../src/services/security/secrets.js';
import { isAuthenticatedAdminToken } from '../src/services/auth/tokenRotation.js';

test('AES-256-GCM round-trip hides plaintext and supports legacy plaintext values', () => {
  const plaintext = 'super-secret-api-key-123';
  const ciphertext = encryptSecret(plaintext);

  assert.ok(isEncrypted(ciphertext));
  assert.ok(ciphertext.startsWith('enc:v1:'));
  assert.ok(!ciphertext.includes(plaintext));
  assert.equal(decryptSecret(ciphertext), plaintext);
  assert.equal(decryptSecret(plaintext), plaintext);
  assert.equal(encryptSecret(ciphertext), ciphertext, 'already encrypted values are not double-encrypted');
});

test('sensitive settings are encrypted at rest and read back transparently', () => {
  const key = 'test_sensitive_secret_key';
  const plaintext = 'indodax-secret-value';

  try {
    setSetting(key, plaintext);

    const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string };
    assert.ok(isEncrypted(raw.value), 'raw SQLite value must be ciphertext');
    assert.ok(!raw.value.includes(plaintext));

    assert.equal(getSetting(key), plaintext);
    assert.equal(getAllSettings()[key], plaintext);
  } finally {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
});

test('non-sensitive settings remain readable plaintext at rest', () => {
  const key = 'test_plain_setting';
  try {
    setSetting(key, 'balanced');
    const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string };
    assert.equal(raw.value, 'balanced');
    assert.equal(isSensitiveSettingKey(key), false);
  } finally {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
});

test('startup migration encrypts legacy plaintext settings and provider credentials', () => {
  const settingKey = 'test_legacy_api_key';
  const providerId = `prov_secret_test_${Date.now()}`;
  const alias = `secret_test_${Date.now()}`;

  try {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(
      settingKey,
      'legacy-plain-secret',
      'legacy-plain-secret'
    );
    db.prepare(`
      INSERT INTO providers (id, name, base_url, api_keys, alias, protocol, oauth_data, is_active, created_at)
      VALUES (?, 'Secret Test', 'https://example.com/v1', ?, ?, 'chat_completions', ?, 1, ?)
    `).run(
      providerId,
      JSON.stringify(['provider-key-plain']),
      alias,
      JSON.stringify({ refreshToken: 'refresh-plain', email: 'secret@example.com' }),
      Date.now()
    );

    migrateSecretsAtRest();

    const settingRaw = db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey) as { value: string };
    assert.ok(isEncrypted(settingRaw.value));
    assert.equal(getSetting(settingKey), 'legacy-plain-secret');

    const providerRaw = db.prepare('SELECT api_keys, oauth_data FROM providers WHERE id = ?').get(providerId) as {
      api_keys: string;
      oauth_data: string;
    };
    assert.ok(isEncrypted(providerRaw.api_keys));
    assert.ok(isEncrypted(providerRaw.oauth_data));
    assert.deepEqual(decryptProviderApiKeys(providerRaw.api_keys), ['provider-key-plain']);
    assert.deepEqual(decryptProviderOAuth(providerRaw.oauth_data), {
      refreshToken: 'refresh-plain',
      email: 'secret@example.com',
    });
  } finally {
    db.prepare('DELETE FROM settings WHERE key = ?').run(settingKey);
    db.prepare('DELETE FROM providers WHERE id = ?').run(providerId);
  }
});

test('admin authentication is fail-closed when no token is configured', () => {
  assert.equal(isAuthenticatedAdminToken('', 'anything'), false);
  assert.equal(isAuthenticatedAdminToken(undefined, 'anything'), false);
  assert.equal(isAuthenticatedAdminToken('   ', '   '), false);
  assert.equal(isAuthenticatedAdminToken('configured-token', 'configured-token'), true);
  assert.equal(isAuthenticatedAdminToken(' configured-token ', 'configured-token'), true);
  assert.equal(isAuthenticatedAdminToken('configured-token', 'wrong-token'), false);
  assert.equal(isAuthenticatedAdminToken('configured-token', ''), false);
});

test('sensitive key detection covers credentials and PII', () => {
  for (const key of [
    'admin_access_token',
    'indodax_api_key',
    'indodax_secret_key',
    'telegram_bot_token',
    'ngrok_authtoken',
    'whatsapp_admin_number',
    'whatsapp_admin_lid',
    'telegram_chat_id',
  ]) {
    assert.equal(isSensitiveSettingKey(key), true, `${key} should be encrypted at rest`);
  }
  for (const key of ['paper_idr_balance', 'trading_mode', 'risk_profile', 'master_model']) {
    assert.equal(isSensitiveSettingKey(key), false, `${key} should remain plain`);
  }
});

test('generated encryption key file is private', () => {
  if (process.env.AI_TRADING_ENCRYPTION_KEY) return;
  const keyPath = path.join(DATA_DIR, '.encryption-key');
  assert.ok(fs.existsSync(keyPath));
  if (process.platform !== 'win32') {
    const mode = fs.statSync(keyPath).mode & 0o777;
    assert.equal(mode, 0o600);
  }
});
