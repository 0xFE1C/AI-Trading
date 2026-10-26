import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.AI_TRADING_DATA_DIR) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-trading-test-'));
  process.env.AI_TRADING_DATA_DIR = tempDir;
  process.env.AI_TRADING_DB_PATH = path.join(tempDir, 'trading.db');

  process.once('exit', () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });
}

process.env.NODE_ENV = 'test';
