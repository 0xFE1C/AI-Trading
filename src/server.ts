import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { db, initDatabase, getSetting, setSetting } from './db/index.js';
import { apiRouter } from './api/routes.js';
import { indodax } from './services/indodax/index.js';
import { aiClient } from './services/ai/index.js';
import { agentSwarm } from './services/agents/index.js';
import { tradingEngine } from './services/trading/index.js';
import { whatsappService } from './services/whatsapp/index.js';
import { telegramService } from './services/telegram/index.js';
import { backupService } from './services/backup/index.js';
import { tunnelService } from './services/tunnel/index.js';
import { indodaxMarketStream } from './services/indodax/marketStream.js';
import { adminTokenService, isAuthenticatedAdminToken } from './services/auth/tokenRotation.js';
import { installConsoleBridge } from './utils/logger.js';

import dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

dotenv.config();

// Structured logging (pino) console bridge: no-op unless
// AI_TRADING_STRUCTURED_LOGS=1 or LOG_FILE is set, and never in tests.
installConsoleBridge();

// 1. Initialize SQLite Database
initDatabase();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// CORS Hardening: allow local access and configured tunnels
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isTunnel =
      host.endsWith('.trycloudflare.com') ||
      host.endsWith('.ngrok-free.app') ||
      host.endsWith('.ngrok.app') ||
      host.endsWith('.ngrok.io');

    return isLocal || isTunnel;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Akses ditolak oleh CORS'));
    },
    credentials: true,
  })
);

// Standard HTTP Security Headers (H.1 #10)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(express.json());

// Extended WebSocket interface for heartbeat tracking
interface ExtWebSocket extends WebSocket {
  isAlive?: boolean;
}

// Track authenticated WebSocket connections
const authenticatedSockets = new WeakSet<WebSocket>();

// Broadcast helper to all connected WebSocket clients (Admin and View-Only observers)
function broadcast(type: string, data: any) {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {}
    }
  }
}

// Admin-only broadcast helper (never sends admin data to unauthenticated observer sockets)
function broadcastAdmin(type: string, data: any) {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && authenticatedSockets.has(client)) {
      try {
        client.send(message);
      } catch {}
    }
  }
}

// 2. Attach Cross-Service Integration Callbacks

// AI Key Failover Emergency: notify WhatsApp, Telegram & broadcast alert with graceful degradation
aiClient.setEmergencyCallback(async (providerName, errorSummary) => {
  broadcast('EMERGENCY_AI_FAILURE', { providerName, errorSummary });
  const currentAiMode = getSetting('ai_mode', 'confirm');
  const tradingMode = getSetting('trading_mode', 'paper');
  let msg = '';
  if (currentAiMode === 'off') {
    msg = `⚠️ *[AI PROVIDER OFFLINE]*\nSemua API Key untuk provider *${providerName}* habis kuota atau error!\n\n${errorSummary}\n\n🛡️ Mode trading saat ini *Deterministik Penuh*; entry dan exit tidak bergantung pada provider AI. Riset subagent AI berhenti sampai API Key diperbarui.`;
  } else if (currentAiMode === 'confirm' && tradingMode === 'paper') {
    msg = `⚠️ *[PERINGATAN - AI PROVIDER OFFLINE]*\nSemua API Key untuk provider *${providerName}* habis kuota atau error!\n\n${errorSummary}\n\nMode *Paper + Hybrid*: simulasi entry tetap berjalan dengan sinyal deterministik. Di mode Live, entry baru akan diblokir selama AI gagal.`;
  } else {
    msg = `🚨 *[EMERGENCY - AI ENGINE]*\nSemua API Key untuk provider *${providerName}* habis kuota atau gagal!\n\n${errorSummary}\n\nFail-closed aktif: entry baru diblokir sampai AI pulih. Posisi terbuka tetap dipantau dan trailing stop tetap berjalan. Perbarui API Key di Web Settings.`;
  }
  await whatsappService.sendAlert(msg);
  await telegramService.sendAlert(msg);
});

// New Coin Listing detected on Indodax: notify WhatsApp, Telegram & broadcast
indodax.setNewCoinCallback(async (coin) => {
  broadcast('NEW_COIN_ALERT', coin);
  const msg = `⚡ *[NEW COIN LISTING INDODAX]*\nKoin baru terdeteksi: *${coin.name} (${coin.symbol.toUpperCase()})*\nHarga Awal: Rp ${coin.price.toLocaleString('id-ID')}\nAI Subagents sedang memantau momentum pump awal!`;
  await whatsappService.sendAlert(msg);
  await telegramService.sendAlert(msg);
});

// Trade executed (BUY or SELL): notify WhatsApp, Telegram & broadcast to admins only
tradingEngine.setTradeCallback(async (event) => {
  broadcastAdmin('TRADE_EVENT', event);
  if (event.type === 'BUY') {
    const msg = `🟢 *[BUY ORDER EXECUTED]*\nPair: *${event.data.symbol.toUpperCase()}*\nHarga: Rp ${event.data.price.toLocaleString('id-ID')}\nTotal: Rp ${event.data.totalIdr.toLocaleString('id-ID')} (${event.data.mode.toUpperCase()})\nAlasan: ${event.data.reason}`;
    await whatsappService.sendAlert(msg);
    await telegramService.sendAlert(msg);
  } else if (event.type === 'SELL') {
    const msg = `🔴 *[SELL / EXIT EXECUTED]*\nPair: *${event.data.symbol.toUpperCase()}*\nHarga Jual: Rp ${event.data.price.toLocaleString('id-ID')}\nTotal: Rp ${event.data.totalIdr.toLocaleString('id-ID')} (${event.data.mode.toUpperCase()})\nAlasan: ${event.data.reason}`;
    await whatsappService.sendAlert(msg);
    await telegramService.sendAlert(msg);
  } else if (event.type === 'ALERT') {
    const msg = `⚠️ *[${event.data.title}]*\n${event.data.message}`;
    await whatsappService.sendAlert(msg);
    await telegramService.sendAlert(msg);
  }
});

// Wire Telegram 2-Way Remote Bot panic action and start polling
telegramService.setPanicHandler(async () => {
  const soldCount = await tradingEngine.panicSellAll();
  return { success: true, message: `${soldCount} posisi berhasil dilikuidasi darurat ke IDR.` };
});
if (process.env.NODE_ENV !== 'test' && !process.argv.some((arg) => arg.includes('test'))) {
  telegramService.startPolling();
}

// Subagent produce log: broadcast live to UI
agentSwarm.setLogCallback((log) => {
  broadcast('SUBAGENT_LOG', log);
});

// Admin Token Rotation: broadcast live to UI (NEVER broadcast raw token string to public sockets!)
adminTokenService.onRotate((newToken, reason) => {
  broadcast('ADMIN_TOKEN_ROTATED', { rotated: true, reason, timestamp: Date.now() });
});

// Real-time price ticks from Indodax WebSocket & Sub-second Trailing Stop Engine
indodaxMarketStream.setTickCallback((tick) => {
  broadcast('PRICE_TICK', tick);
  tradingEngine.handleRealtimeTick(tick);
});

// WhatsApp Baileys status & QR updates: broadcast live to UI & failover alert to Telegram
let wasWaConnected = false;
whatsappService.setCallbacks(
  (qrCodeDataUrl) => {
    // A pairing QR grants control of the WhatsApp session; admins only.
    broadcastAdmin('WHATSAPP_QR', { qrCode: qrCodeDataUrl });
  },
  async (status) => {
    broadcastAdmin('WHATSAPP_STATUS', status);
    if (status.connected) {
      wasWaConnected = true;
    } else if (wasWaConnected) {
      wasWaConnected = false;
      await telegramService.sendAlert(
        '⚠️ *[WHATSAPP BOT OFFLINE]*\nKoneksi WhatsApp Web terputus. AI Trading tetap aktif dan notifikasi darurat otomatis dialihkan ke Telegram.'
      );
    }
  }
);

// Start Indodax Live Market WebSocket
if (process.env.NODE_ENV !== 'test' && !process.argv.some((arg) => arg.includes('test'))) {
  indodaxMarketStream.startLiveSocket();
}

// 3. Mount API Routes
app.use('/api', apiRouter);

// OAuth Callback Route for Google / Antigravity OAuth Handshake
app.get('/callback', (req, res) => {
  const code = (req.query.code as string) || '';
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Otentikasi Google / Antigravity Selesai - AI Trading</title>
  <style>
    body {
      background: #070b14;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 32px 28px;
      max-width: 540px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 16px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #10b981;
      font-size: 24px;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 10px;
      color: #38bdf8;
    }
    p {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.6;
      margin: 0 0 20px;
    }
    .url-box {
      background: #020617;
      border: 1px solid #334155;
      padding: 12px 14px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 11px;
      word-break: break-all;
      color: #34d399;
      margin-bottom: 20px;
      text-align: left;
      user-select: all;
    }
    .btn {
      background: #2563eb;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #1d4ed8;
    }
    .status {
      font-size: 11px;
      color: #64748b;
      margin-top: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10003;</div>
    <h1>Otentikasi Antigravity Berhasil!</h1>
    <p>Otentikasi Google telah selesai. Jika jendela ini terbuka sebagai popup, token sedang otomatis ditransfer ke AI Trading. Jika Anda membuka di tab terpisah atau popup terblokir, silakan salin URL di bawah ini:</p>
    <div class="url-box" id="urlDisplay"></div>
    <button class="btn" onclick="copyAndClose()">Salin URL & Tutup</button>
    <div class="status" id="statusText">Mengirim otentikasi ke AI Trading...</div>
  </div>

  <script>
    const fullUrl = window.location.href;
    document.getElementById('urlDisplay').innerText = fullUrl;

    if (window.opener) {
      try {
        const targetOrigin = window.location.origin;
        window.opener.postMessage({
          type: 'ANTIGRAVITY_OAUTH_CALLBACK',
          url: fullUrl,
          code: ${JSON.stringify(code)}
        }, targetOrigin);
        document.getElementById('statusText').innerText = 'Berhasil ditransfer! Jendela akan ditutup otomatis...';
        setTimeout(() => {
          window.close();
        }, 1200);
      } catch (e) {
        console.error(e);
      }
    } else {
      document.getElementById('statusText').innerText = 'Silakan salin URL di atas dan tempelkan ke form verifikasi manual di AI Trading.';
    }

    function copyAndClose() {
      navigator.clipboard.writeText(fullUrl).then(() => {
        alert('URL Callback berhasil disalin! Silakan tempelkan ke kolom input di AI Trading.');
        if (window.opener) window.close();
      });
    }
  </script>
</body>
</html>`);
});

// Serve static frontend build if available
const clientDistPath = path.resolve(process.cwd(), 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    next();
  });
}

// 4. WebSocket connection lifecycle (Supports both Admin and Observer/View-Only)
let wsHeartbeatInterval: NodeJS.Timeout | null = null;
if (process.env.NODE_ENV !== 'test' && !process.argv.some((arg) => arg.includes('test'))) {
  wsHeartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      const extWs = client as ExtWebSocket;
      if (extWs.isAlive === false) {
        client.terminate();
        continue;
      }
      extWs.isAlive = false;
      client.ping();
    }
  }, 30000);
  if (wsHeartbeatInterval.unref) {
    wsHeartbeatInterval.unref();
  }
}

wss.on('connection', (ws: WebSocket, req) => {
  const extWs = ws as ExtWebSocket;
  extWs.isAlive = true;

  ws.on('pong', () => {
    extWs.isAlive = true;
  });

  const configuredToken = getSetting('admin_access_token', '').trim();

  // Never accept tokens in the URL: authenticate through an AUTH message after connect.
  ws.send(
    JSON.stringify({
      type: 'CONNECTED',
      authenticated: false,
      isAdmin: false,
      message: 'Connected to Realtime WebSocket (View-Only Observer)',
    })
  );

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'AUTH' && isAuthenticatedAdminToken(configuredToken, data.token)) {
        authenticatedSockets.add(ws);
        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', authenticated: true, isAdmin: true }));
      }
    } catch {}
  });
});

// 5. Start Background Engines & Graceful Shutdown
const PORT = process.env.PORT || 3001;

// Pairs cache refresh interval (seeds pair rules + new-listing radar detection)
let pairsRefreshInterval: NodeJS.Timeout | null = null;
let walCheckpointInterval: NodeJS.Timeout | null = null;
let advisoryInterval: NodeJS.Timeout | null = null;
let weeklyReportInterval: NodeJS.Timeout | null = null;

if (process.env.NODE_ENV !== 'test' && !process.argv.some((arg) => arg.includes('test'))) {
  server.listen(PORT, async () => {
    // Check and trigger admin token rotation on startup if configured ('on_startup')
    try {
      await adminTokenService.handleStartup();
    } catch (err: any) {
      console.warn('[Server] Gagal menjalankan rotasi token startup:', err?.message || err);
    }

    const adminToken = getSetting('admin_access_token', '');
    console.log(`\n======================================================`);
    console.log(`🚀 AI Trading Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);
    if (process.stdout.isTTY) {
      console.log(`🔐 ADMIN ACCESS TOKEN: ${adminToken || '(belum dikonfigurasi)'}`);
      console.log('   (Gunakan token ini untuk otentikasi dashboard & API)');
    } else {
      console.log('🔐 ADMIN ACCESS TOKEN: disembunyikan karena log non-interaktif.');
      console.log('   Jalankan `npm run admin:token` di server untuk menampilkan token.');
    }
    console.log(`======================================================\n`);

    // Reconcile live exchange state before any background engine starts.
    const safety = await tradingEngine.reconcileOnStartup();
    for (const issue of safety.issues) {
      console.warn(`[Startup Reconciliation] ${issue}`);
    }
    if (safety.issues.length > 0) {
      const msg = `⚠️ *[STARTUP RECONCILIATION]*\n${safety.issues.map((i) => `• ${i}`).join('\n')}\n\nAuto-trading tetap PAUSED sampai state diverifikasi.`;
      await Promise.allSettled([whatsappService.sendAlert(msg), telegramService.sendAlert(msg)]);
    }

    const wasAutoActive = getSetting('auto_trading_was_active_before_restart', '0') === '1';
    const autoResume = getSetting('auto_resume_on_startup', '0') === '1';
    if (autoResume && wasAutoActive && safety.safeToResume) {
      setSetting('is_auto_trading_active', '1');
      console.log('[Startup] Auto-resume diaktifkan: state aman dan auto_resume_on_startup=1.');
    } else if (wasAutoActive) {
      console.log('[Startup] Auto-trading tetap PAUSED (kebijakan aman / butuh rekonsiliasi).');
    }

    // Start background engines
    tradingEngine.start(15000);
    agentSwarm.start(60000);
    backupService.startAutoBackup();
    adminTokenService.start(15000);

    // Warm up Indodax pairs cache on boot: seeds pair rules (quantity increment,
    // min trade size) and primes the new-listing radar with the known pair set.
    indodax
      .getPairs()
      .then((pairs) => console.log(`[Indodax] Pairs cache siap: ${pairs.length} pair IDR terpantau. Radar koin baru aktif.`))
      .catch((err) => console.warn('[Indodax] Gagal memuat pairs cache saat startup:', err.message));

    // Refresh pairs every 5 minutes so new coin listings are detected promptly
    // (internal cache TTL is 10 minutes; alternate calls dedupe via cache).
    pairsRefreshInterval = setInterval(() => {
      indodax.getPairs().catch(() => {
        // Silent: transient network failures retry on the next interval
      });
    }, 5 * 60 * 1000);

    // Portfolio Advisor (read-only daily review) + Weekly Learning Report.
    // Both self-throttle; the advisory also runs on boot after the swarm warms up.
    const sendToAdminBots = async (msg: string) => {
      await Promise.allSettled([whatsappService.sendAlert(msg), telegramService.sendAlert(msg)]);
    };
    advisoryInterval = setInterval(() => {
      agentSwarm.runPortfolioAdvisory().catch(() => {});
    }, 6 * 3600 * 1000);
    if (advisoryInterval.unref) advisoryInterval.unref();
    let lastWeeklyReportAt = 0;
    weeklyReportInterval = setInterval(async () => {
      if (Date.now() - lastWeeklyReportAt < 7 * 24 * 3600 * 1000) return;
      lastWeeklyReportAt = Date.now();
      await agentSwarm.sendWeeklyLearningReport(sendToAdminBots);
    }, 24 * 3600 * 1000);
    if (weeklyReportInterval.unref) weeklyReportInterval.unref();
    // Kick the advisor once shortly after boot (models/settings are ready then)
    setTimeout(() => {
      agentSwarm.runPortfolioAdvisory().catch(() => {});
    }, 90 * 1000);

    // Periodic WAL Checkpoint every 10 minutes to prevent -wal file growth
    walCheckpointInterval = setInterval(() => {
      try {
        db.pragma('wal_checkpoint(PASSIVE)');
      } catch (err: any) {
        console.warn('[SQLite] WAL Passive Checkpoint error:', err?.message);
      }
    }, 10 * 60 * 1000);
    if (walCheckpointInterval.unref) {
      walCheckpointInterval.unref();
    }
  });
}

// Graceful Shutdown Handler (SIGINT / SIGTERM)
let isShuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Server] Sinyal ${signal} diterima. Menjalankan graceful shutdown...`);

  try {
    adminTokenService.stop();
    tradingEngine.stop();
    agentSwarm.stop();
    backupService.stopAutoBackup();
    telegramService.stopPolling();
    indodaxMarketStream.stop();
    await tunnelService.stop();
    if (pairsRefreshInterval) {
      clearInterval(pairsRefreshInterval);
      pairsRefreshInterval = null;
    }
    if (walCheckpointInterval) {
      clearInterval(walCheckpointInterval);
      walCheckpointInterval = null;
    }
    if (advisoryInterval) {
      clearInterval(advisoryInterval);
      advisoryInterval = null;
    }
    if (weeklyReportInterval) {
      clearInterval(weeklyReportInterval);
      weeklyReportInterval = null;
    }
    if (wsHeartbeatInterval) {
      clearInterval(wsHeartbeatInterval);
      wsHeartbeatInterval = null;
    }

    // Last warning while notifications are still connected: open live positions
    // lose all in-process exit protection (trailing stop) once this process stops.
    try {
      const openLive = db.prepare(
        "SELECT COUNT(*) as c FROM positions WHERE status = 'open' AND mode = 'live'"
      ).get() as { c: number };
      if (openLive.c > 0) {
        const msg = `🛑 *[BOT DIHENTIKAN DENGAN POSISI LIVE TERBUKA]*\n${openLive.c} posisi LIVE masih terbuka. Trailing stop & proteksi exit TIDAK aktif selama bot mati. Segera jalankan kembali server atau pantau posisi manual di Indodax.`;
        await Promise.allSettled([whatsappService.sendAlert(msg), telegramService.sendAlert(msg)]);
      }
    } catch {}

    await whatsappService.disconnect();
    await indodax.cancelDeadmanSwitch();

    wss.close();
    server.close(() => {
      console.log('[Server] Koneksi jaringan ditutup.');
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
        console.log('[Server] Database SQLite ditutup dengan aman.');
      } catch {}
      process.exit(0);
    });

    setTimeout(() => {
      console.warn('[Server] Timeout shutdown tercapai, keluar paksa.');
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch {}
      process.exit(0);
    }, 4000);
  } catch (err) {
    console.error('[Server] Kesalahan shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  // Last-chance notification while the bots may still be connected: an
  // uncaught exception leads to a full process restart, and restarts with
  // open live positions are exactly when operators must be woken up.
  try {
    const openLive = db.prepare("SELECT COUNT(*) as c FROM positions WHERE status = 'open' AND mode = 'live'").get() as { c: number };
    if (openLive.c > 0) {
      const msg = `🚨 *[UNCAUGHT EXCEPTION — BOT AKAN RESTART]*\n${err?.message || err}\n\n${openLive.c} posisi LIVE terbuka. Proses memulai graceful shutdown; pastikan auto-restart (Docker/systemd) aktif agar proteksi exit kembali jalan.`;
      Promise.allSettled([whatsappService.sendAlert(msg), telegramService.sendAlert(msg)]).finally(() => {
        gracefulShutdown('uncaughtException');
      });
      return;
    }
  } catch {}
  gracefulShutdown('uncaughtException');
});

let unhandledRejectionCount = 0;
let lastRejectionAlertAt = 0;
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  unhandledRejectionCount++;
  // Throttled visibility: rejections mean a bug, but must not spam the admin
  // channel — at most one alert per hour with a running total.
  const now = Date.now();
  if (now - lastRejectionAlertAt > 60 * 60 * 1000) {
    lastRejectionAlertAt = now;
    const msg = `⚠️ *[UNHANDLED REJECTION]*\nTotal sejak start: ${unhandledRejectionCount}\nTerakhir: ${String(reason instanceof Error ? reason.message : reason).slice(0, 300)}\n\nCek log server untuk stack trace lengkap.`;
    Promise.allSettled([whatsappService.sendAlert(msg), telegramService.sendAlert(msg)]).catch(() => {});
  }
});
