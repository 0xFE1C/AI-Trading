import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const KEY_FILE_NAME = '.encryption-key';

const SENSITIVE_SETTING_KEY_PATTERN =
  /(^|_)(api_?key|secret|token|password|passphrase|authtoken|private_?key)($|_)/i;

const PII_SETTING_KEYS = new Set(['whatsapp_admin_number', 'whatsapp_admin_lid', 'telegram_chat_id']);

let cachedKey: Buffer | null = null;
let warnedDecryptFailure = false;

function resolveKeyDirectory(): string {
  if (process.env.AI_TRADING_DATA_DIR) {
    return path.resolve(process.env.AI_TRADING_DATA_DIR);
  }
  if (process.env.AI_TRADING_DB_PATH) {
    return path.dirname(path.resolve(process.env.AI_TRADING_DB_PATH));
  }
  return path.resolve(process.cwd(), 'data');
}

function parseKey(raw: string, source: string): Buffer {
  const value = raw.trim();
  const isHex = /^[0-9a-fA-F]{64}$/.test(value);
  const key = isHex ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(`${source} must be a 32-byte key (64 hex characters or base64).`);
  }
  return key;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envKey = process.env.AI_TRADING_ENCRYPTION_KEY?.trim();
  if (envKey) {
    cachedKey = parseKey(envKey, 'AI_TRADING_ENCRYPTION_KEY');
    return cachedKey;
  }

  const keyDir = resolveKeyDirectory();
  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
  }
  const keyPath = path.join(keyDir, KEY_FILE_NAME);

  try {
    fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('hex'), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
  } catch (err: any) {
    if (err?.code !== 'EEXIST') throw err;
  }

  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {}

  const stored = fs.readFileSync(keyPath, 'utf8');
  cachedKey = parseKey(stored, keyPath);
  return cachedKey;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext || isEncrypted(plaintext)) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  if (!value || !isEncrypted(value)) return value;

  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    if (!warnedDecryptFailure) {
      warnedDecryptFailure = true;
      console.error('[Secrets] Nilai terenkripsi memiliki format yang tidak valid; nilai diabaikan.');
    }
    return '';
  }

  try {
    const [ivB64, tagB64, ciphertextB64] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    if (!warnedDecryptFailure) {
      warnedDecryptFailure = true;
      console.error(
        '[Secrets] Gagal mendekripsi nilai. Pastikan AI_TRADING_ENCRYPTION_KEY / data/.encryption-key sesuai dengan database.'
      );
    }
    return '';
  }
}

export function isSensitiveSettingKey(key: string): boolean {
  return SENSITIVE_SETTING_KEY_PATTERN.test(key) || PII_SETTING_KEYS.has(key);
}

export function decryptProviderApiKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const plaintext = decryptSecret(raw);
  try {
    const parsed = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key): key is string => typeof key === 'string' && key.trim().length > 0);
  } catch {
    return [];
  }
}

export function encryptProviderApiKeys(keys: string[]): string {
  return encryptSecret(JSON.stringify(keys));
}

export function decryptProviderOAuth<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const plaintext = decryptSecret(raw);
  try {
    const parsed = JSON.parse(plaintext);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function encryptProviderOAuth(data: unknown): string {
  return encryptSecret(JSON.stringify(data));
}
