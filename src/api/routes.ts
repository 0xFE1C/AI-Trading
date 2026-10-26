import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  db,
  getAllSettings,
  getSetting,
  setSetting,
  RISK_PROFILES,
  applyRiskProfile,
  getEntryGateDiagnostics24h,
  getAiCallStats24h,
} from '../db/index.js';
import { agentBus } from '../services/agents/bus.js';
import { aiClient } from '../services/ai/index.js';
import { indodax } from '../services/indodax/index.js';
import { agentSwarm, SUBAGENT_DEFINITIONS } from '../services/agents/index.js';
import { tradingEngine } from '../services/trading/index.js';
import { whatsappService } from '../services/whatsapp/index.js';
import { tunnelService } from '../services/tunnel/index.js';
import { buildAntigravityAuthUrl, exchangeCodeForTokens } from '../services/antigravity/oauth.js';
import { indodaxMarketStream } from '../services/indodax/marketStream.js';
import { backtestEngine } from '../services/backtest/index.js';
import { reportingService } from '../services/reports/index.js';
import { backupService } from '../services/backup/index.js';
import { telegramService } from '../services/telegram/index.js';
import { adminTokenService, isAuthenticatedAdminToken } from '../services/auth/tokenRotation.js';
import { calculateCapitalAllocation } from '../services/trading/riskGuard.js';
import {
  decryptProviderApiKeys,
  decryptProviderOAuth,
  encryptProviderApiKeys,
  encryptProviderOAuth,
} from '../services/security/secrets.js';

export const apiRouter = Router();

// --- 0. Admin Authentication Middleware & Rate Limiting ---

// In-Memory Rate Limiting for sensitive endpoints (G.5 #3, H.1 #10)
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimits = new Map<string, RateLimitRecord>();

function createRateLimiter(options: { max: number; windowMs: number; message: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();
    const entry = rateLimits.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimits.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (entry.count >= options.max) {
      const waitSec = Math.ceil((entry.resetAt - now) / 1000);
      return res.status(429).json({
        success: false,
        error: `${options.message} Silakan coba lagi dalam ${waitSec} detik.`,
        retryAfter: waitSec,
      });
    }

    entry.count++;
    return next();
  };
}

export const authRateLimiter = createRateLimiter({
  max: 10,
  windowMs: 60 * 1000,
  message: 'Terlalu banyak percobaan otentikasi.',
});

export const panicRateLimiter = createRateLimiter({
  max: 2,
  windowMs: 10 * 1000,
  message: 'Permintaan Panic Sell sedang diproses.',
});

export const tradingToggleLimiter = createRateLimiter({
  max: 5,
  windowMs: 10 * 1000,
  message: 'Terlalu sering mengubah status trading.',
});

export function checkIsAdmin(req: Request): boolean {
  const configuredToken = getSetting('admin_access_token', '').trim();
  if (!configuredToken) {
    // Fail-Closed: If no token configured, strictly deny admin access
    return false;
  }

  const authHeader = req.headers?.authorization || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const tokenFromCustom = ((req.headers?.['x-admin-token'] as string) || '').trim();

  // Query-string tokens are rejected on purpose: URLs leak through logs, history, and referrers.
  const providedToken = tokenFromHeader || tokenFromCustom;
  return isAuthenticatedAdminToken(configuredToken, providedToken);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (checkIsAdmin(req)) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Akses Ditolak: Tindakan ini memerlukan hak akses Administrator.',
    requiresAuth: true,
  });
}

// Authentication verification endpoints
apiRouter.get('/auth/status', (req, res) => {
  const configured = Boolean(getSetting('admin_access_token', '').trim());
  const isAdmin = checkIsAdmin(req);
  res.json({ success: true, requiresAuth: configured, isAdmin });
});

apiRouter.post('/auth/verify', authRateLimiter, (req, res) => {
  const configuredToken = getSetting('admin_access_token', '').trim();
  const { token } = req.body;

  if (isAuthenticatedAdminToken(configuredToken, token)) {
    return res.json({ success: true, message: 'Otentikasi berhasil.' });
  }

  return res.status(401).json({ success: false, error: 'Token akses tidak valid.' });
});

// Admin Token Rotation Endpoints
apiRouter.get('/auth/rotation-status', authMiddleware, (req, res) => {
  try {
    const config = adminTokenService.getConfig();
    res.json({
      success: true,
      data: config,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Gagal mengambil status rotasi token' });
  }
});

apiRouter.post('/auth/rotation-config', authMiddleware, (req, res) => {
  try {
    const { mode, intervalValue, intervalUnit } = req.body;
    const updated = adminTokenService.saveConfig({
      mode,
      intervalValue: intervalValue !== undefined ? Number(intervalValue) : undefined,
      intervalUnit,
    });
    res.json({
      success: true,
      message: 'Konfigurasi rotasi token berhasil diperbarui.',
      data: updated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Gagal menyimpan konfigurasi rotasi token' });
  }
});

apiRouter.post('/auth/rotate-token', authMiddleware, async (req, res) => {
  try {
    const reason = req.body?.reason || 'Rotasi Manual dari Web Dashboard';
    const result = await adminTokenService.rotateToken(reason, { sendAlerts: true });
    res.json({
      success: true,
      message: 'Admin access token berhasil dirotasi.',
      token: result.token,
      rotatedAt: result.rotatedAt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Gagal merotasi admin token' });
  }
});

// --- 1. Dashboard System Status (Public shell, portfolio details admin-only) ---
apiRouter.get('/status', async (req, res) => {
  try {
    const settings = getAllSettings();
    const isAdmin = checkIsAdmin(req);
    const mode = settings.trading_mode === 'live' ? 'live' : 'paper';
    const sentiment = agentSwarm.getAggregatedSentiment();
    const waStatus = whatsappService.getStatus();
    const openPositionsCount = (
      db.prepare("SELECT COUNT(*) as count FROM positions WHERE status = 'open' AND mode = ?").get(mode) as { count: number }
    ).count;

    if (!isAdmin) {
      return res.json({
        success: true,
        data: {
          isAutoTradingActive: settings.is_auto_trading_active === '1',
          mode,
          balanceIdr: null,
          openPositions: [],
          openPositionsCount,
          recentTrades: [],
          lessonsLearned: [],
          portfolioRedacted: true,
          sentiment,
          whatsapp: {
            connected: waStatus.connected,
            active: waStatus.active,
            qrCode: null,
            adminNumber: '',
            adminLid: '',
          },
          subagentsCount: SUBAGENT_DEFINITIONS.length,
          isAdmin: false,
        },
      });
    }

    const openPositions = db.prepare("SELECT * FROM positions WHERE status = 'open' AND mode = ?").all(mode);
    const recentTrades = db.prepare('SELECT * FROM trades_history WHERE mode = ? ORDER BY timestamp DESC LIMIT 15').all(mode);
    const lessons = db.prepare('SELECT * FROM lessons_learned ORDER BY timestamp DESC LIMIT 5').all();

    let balanceIdr: number | null = parseFloat(settings.paper_idr_balance || '10000000');
    let balanceError: string | null = null;
    if (mode === 'live') {
      try {
        const account = await indodax.getAccountInfo();
        if (!Array.isArray(account?.balances)) {
          throw new Error('Respons saldo Indodax tidak valid.');
        }
        balanceIdr = account.data?.balance?.idr ?? 0;
      } catch (err: any) {
        balanceIdr = null;
        balanceError = err?.message || 'Gagal mengambil saldo Indodax live.';
      }
    }

    res.json({
      success: true,
      data: {
        isAutoTradingActive: settings.is_auto_trading_active === '1',
        mode,
        balanceIdr,
        balanceError,
        openPositions,
        openPositionsCount: openPositions.length,
        recentTrades,
        lessonsLearned: lessons,
        portfolioRedacted: false,
        sentiment,
        whatsapp: waStatus,
        subagentsCount: SUBAGENT_DEFINITIONS.length,
        isAdmin: true,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 2. Settings Management (View-Only with Masked Secrets, Protected Mutations) ---
apiRouter.get('/settings', (req, res) => {
  const all = getAllSettings();
  const hasKey = Boolean(all.indodax_api_key && all.indodax_api_key.trim());
  const hasSecret = Boolean(all.indodax_secret_key && all.indodax_secret_key.trim());
  const hasNgrok = Boolean(all.ngrok_authtoken && all.ngrok_authtoken.trim());
  const hasTelegramToken = Boolean(all.telegram_bot_token && all.telegram_bot_token.trim());
  const isAdmin = checkIsAdmin(req);

  // Mask secrets and PII so sensitive keys and personal contact data are NEVER leaked across public tunnel
  const sanitized = {
    ...all,
    has_indodax_key: hasKey,
    indodax_api_key: isAdmin ? all.indodax_api_key : (hasKey ? '****************' : ''),
    has_indodax_secret: hasSecret,
    indodax_secret_key: hasSecret ? '********************************' : '',
    has_ngrok_token: hasNgrok,
    ngrok_authtoken: hasNgrok ? '****************' : '',
    has_telegram_token: hasTelegramToken,
    telegram_bot_token: isAdmin ? all.telegram_bot_token : (hasTelegramToken ? '****************' : ''),
    // Never echo the session credential; authenticated admins can use rotation-status.
    admin_access_token: '****************',
    whatsapp_admin_number: isAdmin ? all.whatsapp_admin_number : (all.whatsapp_admin_number ? '**********' : ''),
    whatsapp_admin_lid: isAdmin ? all.whatsapp_admin_lid : (all.whatsapp_admin_lid ? '****************@lid' : ''),
    telegram_chat_id: isAdmin ? all.telegram_chat_id : (all.telegram_chat_id ? '*********' : ''),
    isAdmin,
  };

  res.json({ success: true, data: sanitized });
});

apiRouter.post('/settings', authMiddleware, (req, res) => {
  try {
    const body = req.body;
    for (const [key, value] of Object.entries(body)) {
      // Prevent overwriting secrets or PII with masked asterisks or empty placeholder
      if (
        (key === 'indodax_secret_key' ||
          key === 'indodax_api_key' ||
          key === 'ngrok_authtoken' ||
          key === 'telegram_bot_token' ||
          key === 'admin_access_token' ||
          key === 'whatsapp_admin_number' ||
          key === 'whatsapp_admin_lid' ||
          key === 'telegram_chat_id') &&
        (String(value).includes('*') || !String(value).trim())
      ) {
        continue;
      }
      setSetting(key, String(value));
    }
    res.json({ success: true, message: 'Settings berhasil diperbarui.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 3. AI Providers Management & "Import Models" (View-Only Masked, Protected Mutations) ---
apiRouter.get('/providers', (req, res) => {
  try {
    const isAdmin = checkIsAdmin(req);
    const providers = db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as any[];
    const result = providers.map((p) => {
      const models = db.prepare('SELECT * FROM models WHERE provider_id = ?').all(p.id);
      const rawKeys = decryptProviderApiKeys(p.api_keys);
      const maskedKeys = rawKeys.map(k => k.length > 8 ? `${k.substring(0, 4)}...${k.substring(k.length - 4)}` : '****');

      const rawOAuth = decryptProviderOAuth<any>(p.oauth_data);
      const email = typeof rawOAuth?.email === 'string' ? rawOAuth.email : '';
      const maskedEmail = email.includes('@') ? `${email[0]}***@${email.split('@')[1]}` : undefined;
      const sanitizedOAuth = rawOAuth ? {
        email: isAdmin ? rawOAuth.email : maskedEmail,
        projectId: rawOAuth.projectId,
        has_refresh_token: Boolean(rawOAuth.refreshToken),
        expiresAt: rawOAuth.expiresAt,
      } : null;

      return {
        ...p,
        api_keys: maskedKeys,
        has_keys: rawKeys.length > 0,
        keys_count: rawKeys.length,
        oauth_data: sanitizedOAuth,
        models,
      };
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/providers', authMiddleware, (req, res) => {
  try {
    const { id, name, base_url, api_keys, alias, protocol, oauth_data } = req.body;
    if (!name || !base_url || !alias) {
      return res.status(400).json({ success: false, error: 'Nama, Base URL, dan Alias wajib diisi.' });
    }

    const providerId = id || `prov_${Date.now()}`;

    // If editing existing provider and api_keys is empty or contains masked values, preserve existing stored keys
    const existing = db.prepare('SELECT api_keys, oauth_data FROM providers WHERE id = ?').get(providerId) as any;
    let finalKeys: string[] = [];

    if (Array.isArray(api_keys)) {
      finalKeys = api_keys;
    } else if (typeof api_keys === 'string') {
      finalKeys = api_keys.split('\n').map((k: string) => k.trim()).filter(Boolean);
    }

    if (existing && finalKeys.some(k => k.includes('...'))) {
      finalKeys = decryptProviderApiKeys(existing.api_keys);
    }

    let finalOAuth = oauth_data ? encryptProviderOAuth(oauth_data) : null;
    if (existing && (!oauth_data || !oauth_data.refreshToken) && existing.oauth_data) {
      finalOAuth = existing.oauth_data;
    }

    db.prepare(`
      INSERT INTO providers (id, name, base_url, api_keys, alias, protocol, oauth_data, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        base_url = excluded.base_url,
        api_keys = excluded.api_keys,
        alias = excluded.alias,
        protocol = excluded.protocol,
        oauth_data = excluded.oauth_data
    `).run(
      providerId,
      name,
      base_url,
      encryptProviderApiKeys(finalKeys),
      alias,
      protocol || 'chat_completions',
      finalOAuth,
      Date.now()
    );

    res.json({ success: true, message: `Provider ${name} berhasil disimpan.`, providerId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ANTIGRAVITY GOOGLE OAUTH FLOW (From OmniRoute /dashboard/providers/antigravity) ---

apiRouter.get('/oauth/antigravity/authorize', authMiddleware, (req, res) => {
  try {
    const host = req.headers.host || 'localhost:3001';
    const port = host.split(':')[1] || '3001';
    const defaultRedirect = `http://127.0.0.1:${port}/callback`;
    const redirectUri = (req.query.redirect_uri as string) || defaultRedirect;

    const { authUrl, state } = buildAntigravityAuthUrl(redirectUri);
    res.json({ success: true, authUrl, state, redirectUri });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/oauth/antigravity/exchange', authMiddleware, async (req, res) => {
  try {
    const { code, url, redirectUri } = req.body;
    const codeOrUrl = url || code;
    if (!codeOrUrl) {
      return res.status(400).json({
        success: false,
        error: 'URL Callback atau Kode Otorisasi tidak boleh kosong. Silakan salin URL dari bilah browser setelah login.',
      });
    }

    const host = req.headers.host || 'localhost:3001';
    const port = host.split(':')[1] || '3001';
    const finalRedirectUri = redirectUri || `http://127.0.0.1:${port}/callback`;

    console.log(`[Antigravity OAuth] Menukarkan token dengan redirectUri: ${finalRedirectUri}...`);
    const oauthData = await exchangeCodeForTokens(codeOrUrl, finalRedirectUri);

    // Support Multiple Google Antigravity Accounts:
    // Cari apakah akun email ini sudah pernah terhubung
    const existingProviders = db.prepare('SELECT * FROM providers').all() as any[];
    const existingAgy = existingProviders.find((p) => {
      if (p.protocol !== 'antigravity') return false;
      const o = decryptProviderOAuth<any>(p.oauth_data);
      return Boolean(o?.email && oauthData.email && o.email.toLowerCase() === oauthData.email.toLowerCase());
    });

    let providerId: string;
    let alias: string;

    if (existingAgy) {
      // Re-authorisasi akun yang sama: perbarui token dan simpan ID & alias yang sama
      providerId = existingAgy.id;
      alias = existingAgy.alias;
    } else {
      // Akun Google baru (Multiple Account Support): buat ID dan alias unik baru
      const emailHandle = (oauthData.email || 'user')
        .split('@')[0]
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase();
      providerId = `prov_agy_${emailHandle}_${Date.now().toString(36)}`;

      const takenAliases = new Set(existingProviders.map((p) => (p.alias || '').toLowerCase()));
      if (!takenAliases.has('agy')) {
        alias = 'agy';
      } else {
        let candidate = `agy_${emailHandle}`;
        let counter = 2;
        while (takenAliases.has(candidate.toLowerCase())) {
          candidate = `agy_${emailHandle}_${counter++}`;
        }
        alias = candidate;
      }
    }

    const name = `Antigravity (${oauthData.email || 'Google Account'})`;
    const baseUrl = 'https://cloudcode-pa.googleapis.com';

    db.prepare(`
      INSERT INTO providers (id, name, base_url, api_keys, alias, protocol, oauth_data, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        base_url = excluded.base_url,
        alias = excluded.alias,
        protocol = excluded.protocol,
        oauth_data = excluded.oauth_data
    `).run(
      providerId,
      name,
      baseUrl,
      encryptProviderApiKeys([]),
      alias,
      'antigravity',
      encryptProviderOAuth(oauthData),
      Date.now()
    );

    // Otomatis mengimpor katalog model Antigravity real-time
    const importRes = await aiClient.importModels(providerId);

    res.json({
      success: true,
      message: `Akun Antigravity [${oauthData.email || 'Google'}] berhasil terhubung dengan alias [${alias}]!`,
      email: oauthData.email,
      projectId: oauthData.projectId,
      providerId,
      alias,
      modelsCount: importRes.count,
    });
  } catch (err: any) {
    console.error('[Antigravity OAuth Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Antigravity Quota Endpoints (Public View-Only, matches OmniRoute /dashboard/quota) ---

apiRouter.get('/providers/quota/all', authMiddleware, async (req, res) => {
  try {
    const reports = await aiClient.getAllAntigravityQuotas();
    res.json({ success: true, data: reports });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/providers/:id/quota', authMiddleware, async (req, res) => {
  try {
    const providerId = req.params.id as string;
    const report = await aiClient.getProviderQuota(providerId);
    res.json({ success: true, data: report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/providers/:id', authMiddleware, (req, res) => {
  try {
    const providerId = req.params.id as string;
    db.prepare('DELETE FROM providers WHERE id = ?').run(providerId);
    db.prepare('DELETE FROM models WHERE provider_id = ?').run(providerId);
    res.json({ success: true, message: 'Provider berhasil dihapus.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Import model endpoint
apiRouter.post('/providers/:id/import-models', authMiddleware, async (req, res) => {
  try {
    const providerId = req.params.id as string;
    const result = await aiClient.importModels(providerId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all imported models across all providers
apiRouter.get('/models', authMiddleware, (req, res) => {
  try {
    const models = db.prepare(`
      SELECT m.*, p.name as provider_name, p.alias as provider_alias
      FROM models m
      JOIN providers p ON m.provider_id = p.id
      ORDER BY m.imported_at DESC
    `).all();
    res.json({ success: true, data: models });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 4. Market Scanner & New Listing Radar (Public View-Only) ---
apiRouter.get('/scanner', async (req, res) => {
  try {
    const summaries = await indodax.getSummaries();
    const newAlerts = db.prepare('SELECT * FROM new_coin_alerts ORDER BY detected_at DESC LIMIT 10').all();

    const pairsList: any[] = [];
    for (const [key, t] of Object.entries(summaries.tickers || {})) {
      if (!key.endsWith('_idr')) continue;
      const low = parseFloat(t.low);
      const last = parseFloat(t.last);
      const high = parseFloat(t.high);
      const volIdr = parseFloat(t.vol_idr);
      const gain24h = low > 0 ? ((last - low) / low) * 100 : 0;

      pairsList.push({
        symbol: key.replace('_idr', ''),
        pair: key.replace('_', '/').toUpperCase(),
        name: t.name || key.replace('_idr', '').toUpperCase(),
        last,
        high,
        low,
        gain24h: parseFloat(gain24h.toFixed(2)),
        volIdr,
      });
    }

    pairsList.sort((a, b) => b.gain24h - a.gain24h);

    res.json({
      success: true,
      data: {
        topGainers: pairsList.slice(0, 15),
        newCoinAlerts: newAlerts,
        totalPairs: pairsList.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 5. Real-time Candlestick Chart Data directly from Indodax (Public View-Only) ---
apiRouter.get('/chart/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol as string) || 'btcidr';
    const timeframe = (req.query.timeframe as any) || '1h';
    const cleanPair = symbol.toLowerCase().replace('/', '').replace('_', '');
    indodaxMarketStream.subscribePair(cleanPair);
    const candles = await indodaxMarketStream.getRealCandles(cleanPair, timeframe);
    const tickerData = await indodax.getTicker(cleanPair);

    res.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        timeframe,
        candles,
        latestPrice: parseFloat(tickerData?.ticker?.last || '0'),
        high24h: parseFloat(tickerData?.ticker?.high || '0'),
        low24h: parseFloat(tickerData?.ticker?.low || '0'),
        volIdr: parseFloat(tickerData?.ticker?.vol_idr || '0'),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 6. Multi-Agent Logs & Swarm Activity (Public View-Only) ---
apiRouter.get('/subagents', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM subagent_logs ORDER BY timestamp DESC LIMIT 40').all() as any[];
    const formatted = logs.map((l) => ({
      ...l,
      coins_mentioned: JSON.parse(l.coins_mentioned || '[]'),
    }));
    const sentiment = agentSwarm.getAggregatedSentiment();

    res.json({
      success: true,
      data: {
        agents: SUBAGENT_DEFINITIONS,
        recentLogs: formatted,
        sentiment,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/subagents/run', authMiddleware, async (req, res) => {
  try {
    await agentSwarm.runCycle();
    res.json({ success: true, message: 'Subagents cycle selesai dijalankan.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 7. Positions & Trade History (Public View-Only) ---
apiRouter.get('/positions', authMiddleware, (req, res) => {
  try {
    const mode = getSetting('trading_mode', 'paper') === 'live' ? 'live' : 'paper';
    const open = db.prepare("SELECT * FROM positions WHERE status = 'open' AND mode = ?").all(mode);
    const history = db.prepare("SELECT * FROM positions WHERE status = 'closed' AND mode = ? ORDER BY closed_at DESC LIMIT 30").all(mode);
    res.json({ success: true, data: { open, history } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 8. WhatsApp Status & Controls ---
apiRouter.get('/whatsapp', (req, res) => {
  const status = whatsappService.getStatus();
  const isAdmin = checkIsAdmin(req);
  res.json({
    success: true,
    data: isAdmin
      ? status
      : {
          connected: status.connected,
          active: status.active,
          qrCode: null,
          adminNumber: '',
          adminLid: '',
        },
  });
});

apiRouter.post('/whatsapp/connect', authMiddleware, async (req, res) => {
  try {
    await whatsappService.start();
    res.json({ success: true, message: 'WhatsApp service dimulai. Silakan scan QR code.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/whatsapp/disconnect', authMiddleware, async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ success: true, message: 'WhatsApp service diputuskan.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 9. Web Public Tunneling ---
apiRouter.get('/tunnel', (req, res) => {
  res.json({ success: true, data: tunnelService.getStatus() });
});

apiRouter.post('/tunnel/start', authMiddleware, async (req, res) => {
  try {
    const { type, authtoken } = req.body;
    const status = await tunnelService.start(type || 'cloudflared', authtoken);
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/tunnel/stop', authMiddleware, async (req, res) => {
  try {
    const status = await tunnelService.stop();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 10. Trading Execution Controls & Setup Guard (Protected) ---
apiRouter.post('/trading/toggle', authMiddleware, tradingToggleLimiter, (req, res) => {
  const current = getSetting('is_auto_trading_active', '0') === '1';
  const next = current ? '0' : '1';

  // Setup Guard: do not allow starting if essential setup is not completed
  if (next === '1') {
    const providerCount = (db.prepare('SELECT COUNT(*) as c FROM providers').get() as { c: number }).c;
    const modelCount = (db.prepare('SELECT COUNT(*) as c FROM models').get() as { c: number }).c;
    const subagentModel = getSetting('subagent_model', '');
    const masterModel = getSetting('master_model', '');
    const mode = getSetting('trading_mode', 'paper');
    const indodaxApiKey = getSetting('indodax_api_key', '');
    const indodaxSecretKey = getSetting('indodax_secret_key', '');

    const missing: string[] = [];
    if (providerCount === 0) missing.push('AI Provider belum ditambahkan.');
    if (modelCount === 0) missing.push('Belum ada Model AI yang di-import.');
    if (!subagentModel) missing.push('Model untuk Subagents belum dipilih.');
    if (!masterModel) missing.push('Model untuk Master Evaluator belum dipilih.');
    if (mode === 'live' && (!indodaxApiKey || !indodaxSecretKey)) {
      missing.push('Kredensial Indodax API Key / Secret Key wajib diisi untuk Live Mode.');
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Setup Belum Lengkap: Tidak dapat mengaktifkan Auto Trading.\n\nDetail:\n- ${missing.join('\n- ')}\n\nSilakan lengkapi di tab Settings.`,
        missing,
      });
    }
  }

  setSetting('is_auto_trading_active', next);
  const mode = getSetting('trading_mode', 'paper');
  const risk = getSetting('risk_profile', 'balanced');
  if (next === '1') {
    whatsappService
      .sendAlert(
        `🟢 *[AUTO-TRADING DIAKTIFKAN]*\n\nAI Trading Engine telah diaktifkan dari Dashboard.\n• Mode: *${mode.toUpperCase()}*\n• Profil Risiko: *${risk.toUpperCase()}*\n• Bot aktif memantau 400+ pair Indodax 24/7.`
      )
      .catch(() => {});
  } else {
    whatsappService
      .sendAlert(
        `⏸️ *[AUTO-TRADING DIHENTIKAN]*\n\nAuto-trading telah dinonaktifkan sementara dari Dashboard. Bot tidak akan membuka posisi baru.`
      )
      .catch(() => {});
  }
  res.json({ success: true, isActive: next === '1' });
});

apiRouter.post('/trading/mode', authMiddleware, tradingToggleLimiter, (req, res) => {
  const current = getSetting('trading_mode', 'paper');
  const next = current === 'paper' ? 'live' : 'paper';
  setSetting('trading_mode', next);
  whatsappService
    .sendAlert(`🔄 *[MODE TRADING DIUBAH]*\n\nMode trading beralih ke: *${next.toUpperCase()} TRADING*.`)
    .catch(() => {});
  res.json({ success: true, mode: next });
});

apiRouter.post('/trading/panic', authMiddleware, panicRateLimiter, async (req, res) => {
  try {
    const count = await tradingEngine.panicSellAll();
    res.json({ success: true, message: `Emergency panic sell dieksekusi: ${count} posisi dijual ke IDR.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual reset of the drawdown kill switch (admin only). The equity peak is
// re-based to current equity so the switch measures from now, not an old peak.
apiRouter.post('/trading/drawdown-reset', authMiddleware, tradingToggleLimiter, async (req, res) => {
  try {
    const result = await tradingEngine.resetDrawdownKillSwitch();
    res.json({
      success: true,
      message: `Drawdown kill switch direset (mode ${result.mode.toUpperCase()}). Peak equity di-rebase ke Rp ${Math.round(result.equityIdr).toLocaleString('id-ID')}. Auto-trading tetap PAUSED — aktifkan manual dari dashboard bila siap.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 11. Risk Profile Presets (View-Only, Change Requires Admin) ---
apiRouter.get('/settings/profiles', (req, res) => {
  res.json({
    success: true,
    current: getSetting('risk_profile', 'balanced'),
    profiles: RISK_PROFILES,
  });
});

apiRouter.post('/settings/profile', authMiddleware, (req, res) => {
  try {
    const { profile } = req.body;
    if (!profile || !RISK_PROFILES[profile]) {
      return res.status(400).json({
        success: false,
        error: 'Profil risiko tidak valid. Pilihan: conservative, balanced, atau aggressive.',
      });
    }

    applyRiskProfile(profile);
    res.json({
      success: true,
      message: `Profil risiko berhasil diubah menjadi ${RISK_PROFILES[profile].name}.`,
      current: profile,
      profile: RISK_PROFILES[profile],
      settings: getAllSettings(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Calculate Capital Plan (Public Simulation/Preview)
apiRouter.get('/settings/calculate-capital', (req, res) => {
  try {
    const capital = parseFloat((req.query.capital as string) || '100000');
    const profile = ((req.query.profile as string) || 'balanced') as 'conservative' | 'balanced' | 'aggressive';
    const plan = calculateCapitalAllocation(capital, profile);
    res.json({ success: true, plan });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auto-Set Capital & Risk Allocation Parameters (Protected Mutation)
apiRouter.post('/settings/auto-set-capital', authMiddleware, (req, res) => {
  try {
    const { capital, profile } = req.body;
    const numCapital = parseFloat(capital);
    if (isNaN(numCapital) || numCapital < 10000) {
      return res.status(400).json({
        success: false,
        error: 'Jumlah modal minimal adalah Rp 10.000 (batas minimum order bursa Indodax).',
      });
    }

    const targetProfile = (profile || getSetting('risk_profile', 'balanced')) as 'conservative' | 'balanced' | 'aggressive';
    const plan = calculateCapitalAllocation(numCapital, targetProfile);

    // Persist all calculated parameters
    setSetting('risk_profile', plan.profile);
    setSetting('paper_idr_balance', String(plan.capitalIdr));
    setSetting('max_allocation_per_trade_idr', String(plan.maxAllocationPerTradeIdr));
    setSetting('max_active_trades', String(plan.maxActiveTrades));
    setSetting('trailing_stop_percent', String(plan.trailingStopPercent));
    setSetting('daily_loss_limit_percent', String(plan.dailyLossLimitPercent));
    setSetting('slippage_tolerance_percent', String(plan.slippageTolerancePercent));
    setSetting('take_profit_target_1_percent', String(plan.takeProfitStep1Percent));
    setSetting('allow_new_listings', plan.allowNewListings ? '1' : '0');
    setSetting('allowed_coins_only', plan.allowedCoinsOnly);
    setSetting('min_24h_volume_idr', String(plan.minVolumeIdr));

    whatsappService
      .sendAlert(
        `💰 *[MODAL & RISIKO BERHASIL DI-AUTO SET]*\n\n` +
        `• Total Modal: *Rp ${plan.capitalIdr.toLocaleString('id-ID')}*\n` +
        `• Profil: *${plan.profile.toUpperCase()}*\n` +
        `• Alokasi per Koin: *Rp ${plan.maxAllocationPerTradeIdr.toLocaleString('id-ID')}*\n` +
        `• Maksimal Posisi Aktif: *${plan.maxActiveTrades} Koin*\n` +
        `• Cadangan Kas: *Rp ${plan.cashBufferIdr.toLocaleString('id-ID')} (${plan.cashBufferPercent}%)*\n` +
        `• Trailing Stop Loss: *${plan.trailingStopPercent}%*\n` +
        `• Target Take Profit: *${plan.takeProfitStep1Percent}%*`
      )
      .catch(() => {});

    res.json({
      success: true,
      message: `Parameter berhasil dihitung otomatis untuk modal Rp ${plan.capitalIdr.toLocaleString('id-ID')} (${plan.profile.toUpperCase()}).`,
      plan,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 12. Strategy Backtest Engine (Simulation Compute) ---
apiRouter.post('/backtest/run', authMiddleware, async (req, res) => {
  try {
    const {
      symbol,
      timeframe,
      days,
      initialBalanceIdr,
      allocationPerTradeIdr,
      trailingStopPercent,
      takeProfitStep1Percent,
      minGainThresholdPercent,
    } = req.body;

    if (!symbol) {
      return res.status(400).json({ success: false, error: 'Simbol koin wajib diisi (contoh: BTCIDR atau SOL/IDR).' });
    }

    const result = await backtestEngine.run({
      symbol,
      timeframe: timeframe || '1h',
      days: Number(days) || 30,
      initialBalanceIdr: initialBalanceIdr ? Number(initialBalanceIdr) : undefined,
      allocationPerTradeIdr: allocationPerTradeIdr ? Number(allocationPerTradeIdr) : undefined,
      trailingStopPercent: trailingStopPercent ? Number(trailingStopPercent) : undefined,
      takeProfitStep1Percent: takeProfitStep1Percent ? Number(takeProfitStep1Percent) : undefined,
      minGainThresholdPercent: minGainThresholdPercent ? Number(minGainThresholdPercent) : undefined,
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 13. A/B Counterfactual AI Validation & Alpha Metrics (Admin Only) ---
apiRouter.get('/trading/ab-metrics', authMiddleware, (req, res) => {
  try {
    const metrics = tradingEngine.getAbValidationMetrics();
    res.json({ success: true, data: metrics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 14. Performance Reporting & Export (Admin Only) ---
apiRouter.get('/reports/summary', authMiddleware, (req, res) => {
  try {
    const daysRaw = req.query.days as string;
    const daysFilter = daysRaw === 'all' || !daysRaw ? 'all' : parseInt(daysRaw, 10);
    const summary = reportingService.getPerformanceReport(daysFilter);
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/reports/csv', authMiddleware, (req, res) => {
  try {
    const daysRaw = req.query.days as string;
    const daysFilter = daysRaw === 'all' || !daysRaw ? 'all' : parseInt(daysRaw, 10);
    const csvContent = reportingService.generateCsv(daysFilter);

    const filename = `AI_Trading_Report_${daysFilter === 'all' ? 'All_Time' : `${daysFilter}d`}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 15. Database Auto-Backup & Disaster Recovery ---
apiRouter.get('/backup/list', authMiddleware, (req, res) => {
  try {
    const backups = backupService.getBackups();
    res.json({ success: true, data: backups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/backup/create', authMiddleware, async (req, res) => {
  try {
    const backup = await backupService.createBackup();
    res.json({ success: true, message: 'Cadangan database berhasil dibuat.', data: backup });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 16. Telegram Notifier Integration ---
apiRouter.post('/telegram/test', authMiddleware, async (req, res) => {
  try {
    const { botToken, chatId } = req.body;
    const result = await telegramService.testConnection(botToken, chatId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 17. Server Health & Resource Monitoring ---
apiRouter.get('/system/health', (req, res) => {
  try {
    const mem = process.memoryUsage();
    const dbPath = db.name;
    let dbSizeBytes = 0;
    if (fs.existsSync(dbPath)) {
      dbSizeBytes = fs.statSync(dbPath).size;
    }

    res.json({
      success: true,
      data: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: parseFloat((mem.rss / 1024 / 1024).toFixed(1)),
        memoryHeapUsedMb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(1)),
        databaseSizeMb: parseFloat((dbSizeBytes / 1024 / 1024).toFixed(2)),
        nodeVersion: process.version,
        platform: `${process.platform} (${os.arch()})`,
        cpuCount: os.cpus().length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});




// --- 18. Entry Gate Diagnostics & AI Token Metering ---

apiRouter.get('/diagnostics/entry-gates', authMiddleware, (req, res) => {
  try {
    const data = getEntryGateDiagnostics24h();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/ai/metering', (req, res) => {
  try {
    const stats = getAiCallStats24h();
    const aiMode = getSetting('ai_mode', 'confirm');
    const isDegraded = aiClient.isDegradedMode();
    res.json({
      success: true,
      data: {
        ...stats,
        aiMode,
        isDegraded,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/signals/radar', (req, res) => {
  try {
    const recentShortlists = db.prepare(`
      SELECT * FROM opportunity_shortlist
      ORDER BY ts DESC
      LIMIT 10
    `).all() as any[];

    const recentRegimes = db.prepare(`
      SELECT * FROM regime_log
      ORDER BY ts DESC
      LIMIT 5
    `).all() as any[];

    const recentNews = db.prepare(`
      SELECT * FROM news_items
      ORDER BY fetched_at DESC
      LIMIT 15
    `).all() as any[];

    const sentimentData = agentSwarm.getAggregatedSentiment();

    res.json({
      success: true,
      data: {
        shortlists: recentShortlists.map((s) => ({
          ...s,
          breakdown: JSON.parse(s.breakdown || '{}'),
        })),
        regimes: recentRegimes.map((r) => ({
          ...r,
          reasons: JSON.parse(r.reasons || '[]'),
        })),
        news: recentNews.map((n) => ({
          ...n,
          matchedBullish: JSON.parse(n.matched_bullish || '[]'),
          matchedBearish: JSON.parse(n.matched_bearish || '[]'),
          mentionedCoins: JSON.parse(n.mentioned_coins || '[]'),
        })),
        activeThreats: sentimentData.activeThreats,
        threatCount: sentimentData.threatCount,
        averageSentiment: sentimentData.averageSentiment,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/agent-bus/messages', authMiddleware, (req, res) => {
  try {
    const topic = req.query.topic as any;
    const messages = agentBus.getRecentMessages(topic, 50);
    res.json({ success: true, data: messages });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
