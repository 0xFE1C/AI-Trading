import util from 'util';
import pino from 'pino';

/**
 * Structured logging for the trading engine.
 *
 * - `logger` is the pino instance for new code (JSON to stdout, optionally
 *   tee'd to LOG_FILE for offline inspection).
 * - `installConsoleBridge()` patches console.log/warn/error to route through
 *   pino so the existing call sites across the codebase emit structured JSON
 *   without a mechanical rewrite. Active only outside tests and only when
 *   structured logging is enabled (AI_TRADING_STRUCTURED_LOGS=1 or
 *   LOG_FILE is set); console output stays the default for interactive use.
 */

const isTestEnv = process.env.NODE_ENV === 'test';
const structuredEnabled = process.env.AI_TRADING_STRUCTURED_LOGS === '1' || Boolean(process.env.LOG_FILE);
const level = process.env.LOG_LEVEL || (isTestEnv ? 'error' : 'info');

const REDACT_PATHS = [
  'apiKey', 'api_key', 'secretKey', 'secret_key', 'password', 'token',
  'admin_access_token', 'indodax_api_key', 'indodax_secret_key',
  'ngrok_authtoken', 'telegram_bot_token', '*.apiKey', '*.api_key',
];

function buildLogger(): pino.Logger {
  const options: pino.LoggerOptions = {
    level,
    base: { app: 'ai-trading' },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (process.env.LOG_FILE && !isTestEnv) {
    const { multistream } = pino;
    return pino(options, multistream([
      { level: level as any, stream: process.stdout },
      { level: level as any, stream: pino.destination({ dest: process.env.LOG_FILE, mkdir: true, append: true }) },
    ]));
  }
  return pino(options);
}

export const logger = buildLogger();

let bridgeInstalled = false;

/**
 * Routes console output through pino while preserving the original console
 * behavior. Idempotent; a no-op in tests and unless structured logging is on.
 */
export function installConsoleBridge(): void {
  if (bridgeInstalled || isTestEnv || !structuredEnabled) return;
  bridgeInstalled = true;

  // util.format mirrors console's interpolation (%s/%d/%j, Error stacks).
  const fmt = (args: unknown[]) => util.format(...(args as any[]));

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);
  const originalLog = console.log.bind(console);

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    logger.warn(fmt(args));
  };
  console.error = (...args: unknown[]) => {
    originalError(...args);
    logger.error(fmt(args));
  };
  console.log = (...args: unknown[]) => {
    originalLog(...args);
    logger.info(fmt(args));
  };
}
