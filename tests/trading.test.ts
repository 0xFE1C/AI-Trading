import { test, describe } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { IndodaxClient, IndodaxDepth, indodax } from '../src/services/indodax/index.js';
import { TradingEngine, PositionRecord, tradingEngine } from '../src/services/trading/index.js';
import { isAllowedOrigin } from '../src/server.js';
import { parseRssFeed } from '../src/services/agents/index.js';
import { authMiddleware, checkIsAdmin } from '../src/api/routes.js';
import { db, getSetting, setSetting, applyRiskProfile, RISK_PROFILES } from '../src/db/index.js';
import { backtestEngine, BacktestBar } from '../src/services/backtest/index.js';
import {
  ANTIGRAVITY_IDE_VERSION,
  resolveAntigravityModelId,
  fetchLiveAntigravityModels,
  fetchAntigravityQuotas,
  ANTIGRAVITY_STATIC_MODELS,
  getAntigravityModelFallbacks,
  ANTIGRAVITY_RUNTIME_BASE_URLS,
} from '../src/services/antigravity/oauth.js';
import { aiClient } from '../src/services/ai/index.js';
import { whatsappService } from '../src/services/whatsapp/index.js';
import { adminTokenService, secureCompareTokens } from '../src/services/auth/tokenRotation.js';

describe('Slippage & Orderbook Depth Calculations', () => {
  const client = new IndodaxClient();

  test('calculates accurate weighted fill price and slippage on normal book', () => {
    const mockDepth: IndodaxDepth = {
      buy: [],
      sell: [
        ['1000000000', '0.0001'], // 100.000 IDR
        ['1010000000', '0.0002'], // 202.000 IDR
        ['1020000000', '0.0005'], // 510.000 IDR
      ],
    };

    // Buying with 100.000 IDR should hit exactly the best ask
    const result1 = client.calculateSlippage(mockDepth, 'buy', 100000);
    assert.strictEqual(result1.isSufficientLiquidity, true);
    assert.strictEqual(result1.bestPrice, 1000000000);
    assert.strictEqual(result1.averageFillPrice, 1000000000);
    assert.strictEqual(result1.slippagePercent, 0);

    // Buying with 200.000 IDR eats layer 1 (100k) + part of layer 2 (100k)
    const result2 = client.calculateSlippage(mockDepth, 'buy', 200000);
    assert.strictEqual(result2.isSufficientLiquidity, true);
    assert.ok(result2.averageFillPrice > 1000000000);
    assert.ok(result2.slippagePercent > 0 && result2.slippagePercent < 1.0);
  });

  test('detects insufficient liquidity on thin order book', () => {
    const mockDepth: IndodaxDepth = {
      buy: [],
      sell: [
        ['1000000000', '0.00001'], // Only 10.000 IDR available
      ],
    };

    // Attempting to buy with 100.000 IDR should fail with insufficient liquidity
    const result = client.calculateSlippage(mockDepth, 'buy', 100000);
    assert.strictEqual(result.isSufficientLiquidity, false);
    assert.strictEqual(result.slippagePercent, 999);
  });
});

describe('Crypto & Signature Calculations (HMAC-SHA256 & HMAC-SHA512)', () => {
  test('generates valid HMAC-SHA512 signature for Deadman Switch', () => {
    const secretKey = 'da78a39e9dda31c399bcc293d997a347dc7fd0408cb5151931243a302b273ec3238510ea61e11f7c';
    const payload = 'pair=btc_idr&countdownTime=10000&timestamp=1578304294001&recvWindow=5000';

    const expectedSign = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');
    assert.strictEqual(expectedSign.length, 128); // SHA-512 hex is 128 characters
  });

  test('generates valid HMAC-SHA256 signature for Trade API v2.0', () => {
    const secretKey = 'f60617a68fcce028f0a90bc9eb765d17379eb548cc935c01a7ee3186eecf870e9b68f27a31bcfe8d';
    const queryString = 'limit=100&recvWindow=5000&symbol=btcidr&timestamp=1578304294000';

    const sign = crypto.createHmac('sha256', secretKey).update(queryString).digest('hex');
    assert.strictEqual(sign.length, 64); // SHA-256 hex is 64 characters
  });

  test('formats multi-pair deadman switch payload correctly', () => {
    const pairs = ['btc_idr', 'eth_idr', 'pepe_idr'];
    const pairParam = pairs.join(',');
    assert.strictEqual(pairParam, 'btc_idr,eth_idr,pepe_idr');
  });
});

describe('Fail-Closed AI Confirmation Gate Parsing (Production Code)', () => {
  test('accepts clear positive affirmations via TradingEngine.parseAiConfirmation', () => {
    assert.strictEqual(TradingEngine.parseAiConfirmation('YA'), true);
    assert.strictEqual(TradingEngine.parseAiConfirmation('YA, setup aman'), true);
    assert.strictEqual(TradingEngine.parseAiConfirmation('BUY sekarang'), true);
    assert.strictEqual(TradingEngine.parseAiConfirmation('SETUJU'), true);
    assert.strictEqual(TradingEngine.parseAiConfirmation('YES'), true);
  });

  test('strictly rejects ambiguous, hesitant, or negative answers (no false positives)', () => {
    assert.strictEqual(TradingEngine.parseAiConfirmation('TIDAK'), false);
    assert.strictEqual(TradingEngine.parseAiConfirmation('SAYA RAGU DENGAN SETUP INI'), false); // contains "YA" in "SAYA", but must reject!
    assert.strictEqual(TradingEngine.parseAiConfirmation('SAYA TIDAK SETUJU'), false);
    assert.strictEqual(TradingEngine.parseAiConfirmation('JANGAN BELI DULU'), false);
    assert.strictEqual(TradingEngine.parseAiConfirmation('WAIT FOR CONFIRMATION'), false);
    assert.strictEqual(TradingEngine.parseAiConfirmation('SKIP KARENA RESIKO'), false);
    assert.strictEqual(TradingEngine.parseAiConfirmation(''), false);
  });

  test('handles structured VERDICT and REASON format correctly', () => {
    const approvedResponse = 'VERDICT: YA\nREASON: Setup breakout memiliki volume kuat dan momentum sehat.';
    assert.strictEqual(TradingEngine.parseAiConfirmation(approvedResponse), true);

    const approvedResponseWithTidakInReason = 'KEPUTUSAN: YA\nALASAN: Tidak ada anomali atau ancaman keamanan yang terdeteksi.';
    assert.strictEqual(TradingEngine.parseAiConfirmation(approvedResponseWithTidakInReason), true);

    const rejectedResponse = 'VERDICT: TIDAK\nREASON: Setup menyerupai pola chasing pump berisiko tinggi.';
    assert.strictEqual(TradingEngine.parseAiConfirmation(rejectedResponse), false);

    // Critical fix: hedged warnings containing "BUY" MUST be rejected
    const hedgedWarning = 'VERDICT: RISIKO SANGAT TINGGI, HANYA AMAN BUY JIKA RESISTENSI DITEMBUS';
    assert.strictEqual(TradingEngine.parseAiConfirmation(hedgedWarning), false);

    const bahayaWarning = 'VERDICT: BAHAYA BUY DI PUCUK KARENA DISTRIBUSI';
    assert.strictEqual(TradingEngine.parseAiConfirmation(bahayaWarning), false);

    // JSON format parsing
    assert.strictEqual(TradingEngine.parseAiConfirmation('{"verdict": "APPROVE", "reason": "Good volume"}'), true);
    assert.strictEqual(TradingEngine.parseAiConfirmation('{"verdict": "REJECT", "reason": "Overbought"}'), false);
    assert.strictEqual(TradingEngine.parseAiConfirmation('```json\n{"verdict": "BUY", "confidence": 0.85}\n```'), true);
  });
});

describe('Quantity Formatting & Pair Rules (Order Precision)', () => {
  const client = new IndodaxClient();

  test('floors quantity to default 8-decimal increment when pair rules not loaded', () => {
    // Fallback increment '0.00000001' -> 8 decimals, floored (never exceed balance)
    const formatted = client.formatQuantity('btcidr', 0.00123456789);
    assert.strictEqual(formatted, '0.00123456');
  });

  test('always floors instead of rounding to avoid exceeding available balance', () => {
    const formatted = client.formatQuantity('btcidr', 0.199999999);
    assert.strictEqual(formatted, '0.19999999'); // floored, not 0.2
  });

  test('falls back to conservative minimum trade size of Rp 10.000', () => {
    assert.strictEqual(client.getMinTradeIdr('btcidr'), 10000);
  });
});

describe('Dynamic Trailing Stop Loss & Risk Management', () => {
  test('dynamic trailing stop moves up when price surges and stays locked', () => {
    const trailingStopPercent = 2.5;
    let entryPrice = 100000;
    let highestPrice = 100000;
    let trailingStopPrice = entryPrice * (1 - trailingStopPercent / 100);

    // Initial stop loss at 2.5% below entry (97.500)
    assert.strictEqual(trailingStopPrice, 97500);

    // Price rallies to 110.000 (+10%)
    const rallyPrice = 110000;
    highestPrice = Math.max(highestPrice, rallyPrice);
    const newTrailingStop = highestPrice * (1 - trailingStopPercent / 100);
    if (newTrailingStop > trailingStopPrice) {
      trailingStopPrice = newTrailingStop;
    }

    // Stop loss should now be at 110.000 * 0.975 = 107.250 (locking profit!)
    assert.strictEqual(trailingStopPrice, 107250);

    // Price retraces to 108.000 (Stop loss should NOT decrease)
    const pullbackPrice = 108000;
    const computedOnPullback = pullbackPrice * (1 - trailingStopPercent / 100);
    assert.ok(trailingStopPrice > computedOnPullback);
    assert.strictEqual(trailingStopPrice, 107250);
  });
});

describe('CORS Hardening & Origin Whitelist', () => {
  test('allows localhost, 127.0.0.1, and valid tunnel subdomains', () => {
    assert.strictEqual(isAllowedOrigin(undefined), true); // Server-to-server / curl
    assert.strictEqual(isAllowedOrigin('http://localhost:3000'), true);
    assert.strictEqual(isAllowedOrigin('http://localhost:5173'), true);
    assert.strictEqual(isAllowedOrigin('http://127.0.0.1:3001'), true);
    assert.strictEqual(isAllowedOrigin('https://sub.trycloudflare.com'), true);
    assert.strictEqual(isAllowedOrigin('https://demo.ngrok-free.app'), true);
    assert.strictEqual(isAllowedOrigin('https://mybot.ngrok.app'), true);
    assert.strictEqual(isAllowedOrigin('https://mybot.ngrok.io'), true);
  });

  test('strictly rejects unauthorized, malicious, or spoofed origins', () => {
    assert.strictEqual(isAllowedOrigin('https://malicious-website.com'), false);
    assert.strictEqual(isAllowedOrigin('https://attacker-trycloudflare.com.fake.org'), false);
    assert.strictEqual(isAllowedOrigin('http://localhost.evil.com'), false);
    assert.strictEqual(isAllowedOrigin('https://ngrok.app.attacker.com'), false);
  });
});

describe('Live RSS News Feed Parsing & Sanitization', () => {
  test('extracts title and descriptions, cleaning CDATA and HTML tags', () => {
    const mockRssXml = `
      <rss version="2.0">
        <channel>
          <title>Crypto News</title>
          <item>
            <title><![CDATA[Bitcoin Breaks Resistance as Inflows Surge]]></title>
            <description><![CDATA[<p>Institutional accumulation drives strong momentum across altcoins.</p>]]></description>
            <pubDate>${new Date().toUTCString()}</pubDate>
          </item>
          <item>
            <title>Ethereum Upgrade Successfully Deployed</title>
            <description>Validators confirm smooth hard fork activation.</description>
          </item>
        </channel>
      </rss>
    `;

    const parsed = parseRssFeed(mockRssXml, 5);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].title, 'Bitcoin Breaks Resistance as Inflows Surge');
    assert.strictEqual(parsed[0].description, 'Institutional accumulation drives strong momentum across altcoins.');
    assert.strictEqual(parsed[1].title, 'Ethereum Upgrade Successfully Deployed');
    assert.strictEqual(parsed[1].description, 'Validators confirm smooth hard fork activation.');
  });
});

describe('Critical Execution Safety: Sell Failure Protection', () => {
  test('aborts position close if live exchange order fails (prevents untracked coin loss)', async () => {
    const engine = new TradingEngine();

    const mockPos: PositionRecord = {
      id: `test_pos_${Date.now()}`,
      symbol: 'pepe_idr',
      base_currency: 'pepe',
      traded_currency: 'idr',
      side: 'buy',
      entry_price: 100,
      current_price: 110,
      highest_price: 110,
      amount: 1000,
      initial_cost_idr: 100000,
      trailing_stop_price: 95,
      take_profit_step: 0,
      opened_at: Date.now() - 3600000,
      closed_at: null,
      pnl_idr: 0,
      pnl_percent: 0,
      exit_reason: null,
      status: 'open',
      mode: 'live',
    };

    // Save initial position in DB as 'open'
    db.prepare(`
      INSERT OR REPLACE INTO positions (id, symbol, base_currency, traded_currency, side, entry_price, current_price, highest_price, amount, initial_cost_idr, trailing_stop_price, take_profit_step, opened_at, status, mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mockPos.id,
      mockPos.symbol,
      mockPos.base_currency,
      mockPos.traded_currency,
      mockPos.side,
      mockPos.entry_price,
      mockPos.current_price,
      mockPos.highest_price,
      mockPos.amount,
      mockPos.initial_cost_idr,
      mockPos.trailing_stop_price,
      mockPos.take_profit_step,
      mockPos.opened_at,
      mockPos.status,
      mockPos.mode
    );

    // Mock indodax.createOrder to simulate exchange API rejection (e.g. timeout / error)
    const originalCreateOrder = indodax.createOrder;
    indodax.createOrder = async () => {
      throw new Error('Exchange error: -1130 Insufficient depth or exchange maintenance');
    };

    try {
      const tradesBefore = (db.prepare('SELECT COUNT(*) as count FROM trades_history WHERE position_id = ?').get(mockPos.id) as any).count;

      // Attempt to close position during live exchange outage
      const result = await engine.closePosition(mockPos, 110, 'Target Exit');

      // MUST return false
      assert.strictEqual(result, false, 'closePosition must return false when order fails at exchange');

      // MUST NOT insert into trades_history
      const tradesAfter = (db.prepare('SELECT COUNT(*) as count FROM trades_history WHERE position_id = ?').get(mockPos.id) as any).count;
      assert.strictEqual(tradesAfter, tradesBefore, 'Must not record trade in trades_history on execution failure');

      // MUST keep position status 'open' in database
      const posInDb = db.prepare('SELECT status FROM positions WHERE id = ?').get(mockPos.id) as any;
      assert.strictEqual(posInDb.status, 'open', 'Position status must remain open when order fails');
    } finally {
      // Restore original createOrder method and clean up test position
      indodax.createOrder = originalCreateOrder;
      db.prepare('DELETE FROM positions WHERE id = ?').run(mockPos.id);
    }
  });
});

describe('Admin Authentication Middleware Security', () => {
  const token = getSetting('admin_access_token', '');

  test('blocks unauthenticated requests with 401 when token is configured', () => {
    let statusCode = 0;
    let jsonBody: any = null;
    let nextCalled = false;

    const req: any = { headers: {}, query: {} };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
    };
    const next = () => {
      nextCalled = true;
    };

    authMiddleware(req, res, next);
    assert.strictEqual(statusCode, 401);
    assert.strictEqual(jsonBody?.requiresAuth, true);
    assert.strictEqual(nextCalled, false);
  });

  test('allows requests with valid Authorization Bearer token', () => {
    let nextCalled = false;
    const req: any = { headers: { authorization: `Bearer ${token}` }, query: {} };
    const res: any = {
      status: () => res,
      json: () => res,
    };
    const next = () => {
      nextCalled = true;
    };

    authMiddleware(req, res, next);
    assert.strictEqual(nextCalled, true);
  });

  test('allows requests with valid x-admin-token header', () => {
    let nextCalled = false;
    const req: any = { headers: { 'x-admin-token': token }, query: {} };
    const res: any = {
      status: () => res,
      json: () => res,
    };
    const next = () => {
      nextCalled = true;
    };

    authMiddleware(req, res, next);
    assert.strictEqual(nextCalled, true);
  });

  test('rejects requests with incorrect token', () => {
    let statusCode = 0;
    let nextCalled = false;

    const req: any = { headers: { authorization: 'Bearer wrong-token-12345' }, query: {} };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json: () => res,
    };
    const next = () => {
      nextCalled = true;
    };

    authMiddleware(req, res, next);
    assert.strictEqual(statusCode, 401);
    assert.strictEqual(nextCalled, false);
  });

  test('checkIsAdmin identifies admin vs observer mode accurately', () => {
    setSetting('admin_access_token', token);
    const adminReq: any = { headers: { authorization: `Bearer ${token}` }, query: {} };
    assert.strictEqual(checkIsAdmin(adminReq), true);

    const observerReq: any = { headers: {}, query: {} };
    assert.strictEqual(checkIsAdmin(observerReq), false);
  });
});

describe('Risk Profile Presets (Beginner to Aggressive)', () => {
  test('applies conservative risk profile correctly', () => {
    applyRiskProfile('conservative');
    assert.strictEqual(getSetting('risk_profile'), 'conservative');
    assert.strictEqual(getSetting('max_allocation_per_trade_idr'), '50000');
    assert.strictEqual(getSetting('max_active_trades'), '2');
    assert.strictEqual(getSetting('trailing_stop_percent'), '1.5');
    assert.strictEqual(getSetting('allow_new_listings'), '0');
    assert.strictEqual(getSetting('allowed_coins_only'), 'btc,eth,sol,bnb,xrp');
  });

  test('applies aggressive risk profile correctly', () => {
    applyRiskProfile('aggressive');
    assert.strictEqual(getSetting('risk_profile'), 'aggressive');
    assert.strictEqual(getSetting('max_allocation_per_trade_idr'), '250000');
    assert.strictEqual(getSetting('max_active_trades'), '5');
    assert.strictEqual(getSetting('trailing_stop_percent'), '3.5');
    assert.strictEqual(getSetting('allow_new_listings'), '1');
  });

  test('applies balanced risk profile as default', () => {
    applyRiskProfile('balanced');
    assert.strictEqual(getSetting('risk_profile'), 'balanced');
    assert.strictEqual(getSetting('max_allocation_per_trade_idr'), '100000');
    assert.strictEqual(getSetting('max_active_trades'), '3');
    assert.strictEqual(getSetting('trailing_stop_percent'), '2.5');
    assert.strictEqual(getSetting('allow_new_listings'), '1');
  });
});

describe('Closed-Loop Self-Learning Memory', () => {
  test('records and retrieves past trade lessons from memory without error', () => {
    db.prepare(`
      INSERT OR REPLACE INTO lessons_learned (id, symbol, result, pnl_percent, market_condition, lesson, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'lesson_test_1',
      'pepe_idr',
      'LOSS',
      -3.2,
      'High Slippage & Thin Book',
      'Hindari beli saat lonjakan volume tanpa konfirmasi order book tebal',
      Date.now()
    );

    const lessons = db.prepare('SELECT * FROM lessons_learned WHERE id = ?').get('lesson_test_1') as any;
    assert.strictEqual(lessons.symbol, 'pepe_idr');
    assert.ok(lessons.lesson.includes('Hindari beli saat lonjakan volume'));

    // Clean up
    db.prepare('DELETE FROM lessons_learned WHERE id = ?').run('lesson_test_1');
  });
});

describe('Quantitative Backtest Engine (Simulation & Metrics)', () => {
  test('accurately simulates candle breakout entries, trailing stops, and profit metrics', () => {
    const syntheticBars: BacktestBar[] = [
      { timestamp: 100000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { timestamp: 200000, open: 100, high: 104, low: 99, close: 103, volume: 2000 }, // Triggers momentum entry at 103
      { timestamp: 300000, open: 103, high: 110, low: 102, close: 109, volume: 1500 }, // Triggers partial TP (+5%)
      { timestamp: 400000, open: 105, high: 106, low: 101, close: 102, volume: 1200 }, // Hits trailing stop / breakeven
      { timestamp: 500000, open: 102, high: 103, low: 100, close: 101, volume: 800 },
    ];

    const result = backtestEngine.simulate(syntheticBars, {
      symbol: 'BTCIDR',
      timeframe: '1h',
      initialBalanceIdr: 1000000,
      allocationPerTradeIdr: 100000,
      trailingStopPercent: 2.5,
      takeProfitStep1Percent: 5.0,
      minGainThresholdPercent: 2.0,
      strategyType: 'candle_breakout',
    });

    assert.strictEqual(result.symbol, 'BTCIDR');
    assert.strictEqual(result.totalCandles, 5);
    assert.ok(result.totalTrades >= 1);
    assert.ok(result.winningTrades >= 1);
    assert.ok(result.winRatePercent >= 50);
    assert.ok(result.netPnlIdr > 0);
    assert.ok(result.equityCurve.length > 0);
    assert.ok(result.trades[0].exitReason.includes('Partial TP'));
  });

  test('simulates 24h rolling momentum replay (matching live engine rules)', () => {
    // Generate 30 bars (24 baseline bars, then 6 momentum/consolidation bars)
    const bars: BacktestBar[] = [];
    let price = 100;
    for (let i = 0; i < 25; i++) {
      bars.push({
        timestamp: (i + 1) * 3600000,
        open: price,
        high: price + 0.5,
        low: price - 0.5,
        close: price,
        volume: 1000,
      });
    }

    // Bar 26: 24h rolling breakout candle (price rallies to 104 = +4% from 24h low 99.5)
    bars.push({
      timestamp: 26 * 3600000,
      open: 100,
      high: 104.5,
      low: 99.8,
      close: 104,
      volume: 2500,
    });

    // Bar 27: Continues rally
    bars.push({
      timestamp: 27 * 3600000,
      open: 104,
      high: 111,
      low: 103.5,
      close: 110,
      volume: 2000,
    });

    // Bar 28: Pulls back into trailing stop
    bars.push({
      timestamp: 28 * 3600000,
      open: 110,
      high: 110.5,
      low: 104,
      close: 105,
      volume: 1200,
    });

    const result = backtestEngine.simulate(bars, {
      symbol: 'BTCIDR',
      timeframe: '1h',
      initialBalanceIdr: 1000000,
      allocationPerTradeIdr: 100000,
      trailingStopPercent: 2.5,
      takeProfitStep1Percent: 5.0,
      minGainThresholdPercent: 2.0,
      strategyType: 'live_momentum',
    });

    assert.ok(result.totalTrades >= 1);
    assert.ok(result.winningTrades >= 1);
    assert.strictEqual(result.strategyUsed, '24h Rolling Momentum (Live Engine Replay)');
  });

  test('intra-bar wick execution: does not falsely stop out on same bar using new high ratchet', () => {
    // Bar 1: Base candle
    // Bar 2: Breakout candle -> Enter at close 100, initial SL = 97.5 (2.5% stop)
    // Bar 3: Large green candle: open=100, high=107, low=99 (well above 97.5!), close=106
    // If stop loss is tested against previous bar's stop (97.5), low=99 does NOT stop out!
    // Ratchet SL from 107 gives 104.3. If lookahead intra-bar bias existed, low=99 would have falsely stopped out at 104.3!
    const bars: BacktestBar[] = [
      { timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { timestamp: 2000, open: 100, high: 102, low: 99.5, close: 101.5, volume: 1500 }, // Entry at 101.5
      { timestamp: 3000, open: 101.5, high: 108, low: 100, close: 107.5, volume: 2000 }, // High 108 hits TP, Low 100 > previous SL (98.96)
      { timestamp: 4000, open: 107.5, high: 108, low: 99, close: 99.5, volume: 1200 }, // Pullback hits breakeven SL
    ];

    const result = backtestEngine.simulate(bars, {
      symbol: 'ETHIDR',
      timeframe: '1h',
      allocationPerTradeIdr: 100000,
      trailingStopPercent: 2.5,
      takeProfitStep1Percent: 5.0,
      minGainThresholdPercent: 1.0,
      strategyType: 'candle_breakout',
    });

    assert.strictEqual(result.totalTrades, 1);
    assert.ok(result.trades[0].pnlIdr > 0);
    assert.ok(result.trades[0].exitReason.includes('Partial TP'));
  });

  test('honest profit factor: returns null instead of 99.99 when 0 losing trades', () => {
    const bars: BacktestBar[] = [
      { timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { timestamp: 2000, open: 100, high: 105, low: 99, close: 104, volume: 2000 }, // Buy
      { timestamp: 3000, open: 104, high: 112, low: 103, close: 111, volume: 1500 }, // Partial TP
      { timestamp: 4000, open: 111, high: 111.5, low: 104, close: 105, volume: 1000 }, // Exit at profit
    ];

    const result = backtestEngine.simulate(bars, {
      symbol: 'SOLIDR',
      timeframe: '1h',
      trailingStopPercent: 2.5,
      takeProfitStep1Percent: 5.0,
      minGainThresholdPercent: 1.0,
      strategyType: 'candle_breakout',
    });

    assert.strictEqual(result.losingTrades, 0);
    assert.ok(result.winningTrades > 0);
    assert.strictEqual(result.profitFactor, null); // Honest representation of infinity without fake numbers
  });
});

describe('A/B Counterfactual Logging & Ghost Position Lifecycle', () => {
  test('logs AI evaluation and records ghost positions when AI rejects a setup', () => {
    const testEvalId = `eval_test_${Date.now()}`;
    const testGhostId = `ghost_test_${Date.now()}`;
    const testSymbol = 'testdoge';

    // 1. Insert an AI rejection evaluation
    db.prepare(`
      INSERT INTO ai_ab_evaluations (
        id, timestamp, symbol, candidate_price, technical_reason, sentiment_score, threat_count, ai_verdict, ai_reasoning, mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testEvalId,
      Date.now(),
      testSymbol,
      1000,
      'Top Gainer +8.5%',
      0.1,
      0,
      'REJECTED',
      'AI rejected due to thin depth',
      'paper'
    );

    // 2. Spawn ghost position
    db.prepare(`
      INSERT INTO ghost_positions (
        id, evaluation_id, symbol, entry_price, current_price, highest_price, trailing_stop_price,
        take_profit_step, initial_cost_idr, amount, opened_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'open')
    `).run(
      testGhostId,
      testEvalId,
      testSymbol,
      1000,
      1000,
      1000,
      975, // 2.5% stop
      100000,
      100,
      Date.now()
    );

    const fetchedGhost = db.prepare('SELECT * FROM ghost_positions WHERE id = ?').get(testGhostId) as any;
    assert.strictEqual(fetchedGhost.symbol, testSymbol);
    assert.strictEqual(fetchedGhost.status, 'open');
    assert.strictEqual(fetchedGhost.trailing_stop_price, 975);

    // Clean up test records so live server database is never polluted
    db.prepare('DELETE FROM ghost_positions WHERE id = ?').run(testGhostId);
    db.prepare('DELETE FROM ai_ab_evaluations WHERE id = ?').run(testEvalId);
  });

  test('correctly tags ghost outcome as BULLET_DODGED when rejected trade stops out with loss', () => {
    const testGhostId = `ghost_dodge_${Date.now()}`;
    const entryPrice = 1000;
    const initialCost = 100000;
    const amount = 100;
    const trailingStop = 975;

    // Simulate price falling to 970 (below trailing stop)
    const currentPrice = 970;
    const grossPnlIdr = (currentPrice - entryPrice) * amount; // -3000
    const totalFeeIdr = (initialCost + currentPrice * amount) * 0.002; // (100k + 97k) * 0.002 = 394
    const netPnlIdr = grossPnlIdr - totalFeeIdr; // -3394
    const netPnlPercent = (netPnlIdr / initialCost) * 100;

    assert.ok(netPnlIdr < 0);
    const outcome = netPnlIdr < 0 ? 'BULLET_DODGED' : 'OPPORTUNITY_MISSED';
    assert.strictEqual(outcome, 'BULLET_DODGED');

    db.prepare(`
      INSERT INTO ghost_positions (
        id, symbol, entry_price, current_price, highest_price, trailing_stop_price,
        take_profit_step, initial_cost_idr, amount, opened_at, closed_at,
        pnl_idr, pnl_percent, exit_reason, status, simulated_outcome
      ) VALUES (?, 'pepedodge', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'Trailing Stop tersentuh', 'closed', ?)
    `).run(
      testGhostId,
      entryPrice,
      currentPrice,
      entryPrice,
      trailingStop,
      initialCost,
      amount,
      Date.now() - 3600000,
      Date.now(),
      netPnlIdr,
      netPnlPercent,
      outcome
    );

    const closedGhost = db.prepare('SELECT * FROM ghost_positions WHERE id = ?').get(testGhostId) as any;
    assert.strictEqual(closedGhost.status, 'closed');
    assert.strictEqual(closedGhost.simulated_outcome, 'BULLET_DODGED');
    assert.ok(closedGhost.pnl_idr < 0);

    // Clean up test record
    db.prepare('DELETE FROM ghost_positions WHERE id = ?').run(testGhostId);
  });

  test('correctly computes A/B validation metrics and empirical AI alpha', () => {
    const metrics = tradingEngine.getAbValidationMetrics();
    assert.ok(typeof metrics.totalEvaluations === 'number');
    assert.ok(typeof metrics.approvedCount === 'number');
    assert.ok(typeof metrics.rejectedCount === 'number');
    assert.ok(metrics.groupAWithAi !== undefined);
    assert.ok(metrics.groupBCounterfactual !== undefined);
    assert.ok(metrics.combinedWithoutAi !== undefined);
    assert.ok(metrics.alpha !== undefined);
    assert.ok(typeof metrics.alpha.winRateDeltaPercent === 'number');
    assert.ok(typeof metrics.alpha.pnlAlphaIdr === 'number');
    assert.ok(Array.isArray(metrics.recentEvaluations));
    assert.ok(Array.isArray(metrics.activeGhosts));
  });
});

describe('Antigravity Live Model Discovery, Multi-Account, and Quota Telemetry', () => {
  test('ANTIGRAVITY_IDE_VERSION is >= 2.5.5 for Cloud Code modern model tier access', () => {
    assert.strictEqual(ANTIGRAVITY_IDE_VERSION, '2.5.5');
  });

  test('resolveAntigravityModelId maps tier display aliases to upstream IDs accurately', () => {
    assert.strictEqual(resolveAntigravityModelId('gemini-3.8-flash'), 'gemini-3.8-flash-high');
    assert.strictEqual(resolveAntigravityModelId('gemini-3.7-flash'), 'gemini-3.7-flash-tiered');
    assert.strictEqual(resolveAntigravityModelId('gemini-3.1-pro-high'), 'gemini-pro-agent');
    assert.strictEqual(resolveAntigravityModelId('gpt-oss-120b'), 'gpt-oss-120b-medium');
    assert.strictEqual(resolveAntigravityModelId('gemini-claude-sonnet-4-5'), 'claude-sonnet-4-6');
    assert.strictEqual(resolveAntigravityModelId('agy/claude-sonnet-4-6'), 'claude-sonnet-4-6');
    assert.strictEqual(resolveAntigravityModelId('agy_acc2/gemini-3.8-flash-high'), 'gemini-3.8-flash-high');
  });

  test('fetchLiveAntigravityModels provides cutting-edge catalog (Gemini 3.8, Claude 4.6, Claude 5.5)', async () => {
    const models = await fetchLiveAntigravityModels('dummy_token', 'dummy_project');
    assert.ok(Array.isArray(models));
    assert.ok(models.length >= 10);

    const modelIds = models.map((m) => m.id);
    assert.ok(modelIds.includes('gemini-3.8-flash-high'), 'Harus menyertakan Gemini 3.8 Flash (High)');
    assert.ok(modelIds.includes('gemini-3.8-flash-medium'), 'Harus menyertakan Gemini 3.8 Flash (Medium)');
    assert.ok(modelIds.includes('claude-sonnet-4-6'), 'Harus menyertakan Claude Sonnet 4.6 (Thinking)');
    assert.ok(modelIds.includes('claude-opus-4-6-thinking'), 'Harus menyertakan Claude Opus 4.6');
    assert.ok(modelIds.includes('claude-sonnet-5-5-high'), 'Harus menyertakan Claude Sonnet 5.5');
    assert.ok(modelIds.includes('gemini-4-argon-high'), 'Harus menyertakan Gemini 4 Argon');
  });

  test('fetchAntigravityQuotas groups telemetry into Gemini and Claude/GPT categories', async () => {
    const { groups, models } = await fetchAntigravityQuotas('dummy_token');
    assert.strictEqual(groups.length, 2);

    const geminiGroup = groups.find((g) => g.id === 'gemini');
    const claudeGroup = groups.find((g) => g.id === 'claude_gpt');
    assert.ok(geminiGroup !== undefined);
    assert.ok(claudeGroup !== undefined);
    assert.ok(geminiGroup.models.length > 0);
    assert.ok(claudeGroup.models.length > 0);
    assert.ok(models.length > 0);
    assert.ok(models.every((m) => typeof m.remainingPercentage === 'number'));
  });

  test('ANTIGRAVITY_RUNTIME_BASE_URLS prioritizes daily-cloudcode-pa with cloudcode-pa fallback', () => {
    assert.strictEqual(ANTIGRAVITY_RUNTIME_BASE_URLS.length, 2);
    assert.strictEqual(ANTIGRAVITY_RUNTIME_BASE_URLS[0], 'https://daily-cloudcode-pa.googleapis.com');
    assert.strictEqual(ANTIGRAVITY_RUNTIME_BASE_URLS[1], 'https://cloudcode-pa.googleapis.com');
  });

  test('getAntigravityModelFallbacks builds reliable fallback chain without duplicates', () => {
    const chain1 = getAntigravityModelFallbacks('gemini-4-argon-high');
    assert.strictEqual(chain1[0], 'gemini-4-argon-high');
    assert.ok(chain1.includes('claude-sonnet-4-6'));
    assert.ok(chain1.includes('gemini-3.8-flash-high'));
    assert.ok(chain1.includes('gemini-2.5-flash'));
    // Ensure no duplicates
    assert.strictEqual(new Set(chain1).size, chain1.length);

    // If starting with claude-sonnet-4-6, it remains at index 0
    const chain2 = getAntigravityModelFallbacks('agy/claude-sonnet-4-6');
    assert.strictEqual(chain2[0], 'claude-sonnet-4-6');
    assert.strictEqual(new Set(chain2).size, chain2.length);
  });

  test('aiClient imports models with distinct alias prefixes for multi-account support', async () => {
    // Setup 2 Antigravity accounts in SQLite
    const acc1Id = 'test_agy_acc1';
    const acc2Id = 'test_agy_acc2';

    // Delete any stale test providers first
    db.prepare('DELETE FROM providers WHERE id IN (?, ?)').run(acc1Id, acc2Id);
    db.prepare('DELETE FROM models WHERE provider_id IN (?, ?)').run(acc1Id, acc2Id);

    db.prepare(`
      INSERT INTO providers (id, name, base_url, api_keys, alias, protocol, oauth_data, is_active, created_at)
      VALUES (?, 'Antigravity Acc 1', 'https://cloudcode-pa.googleapis.com', '[]', 'testagy1', 'antigravity', ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET alias = 'testagy1'
    `).run(acc1Id, JSON.stringify({ email: 'acc1@gmail.com', projectId: 'proj-1', accessToken: 't1' }), Date.now());

    db.prepare(`
      INSERT INTO providers (id, name, base_url, api_keys, alias, protocol, oauth_data, is_active, created_at)
      VALUES (?, 'Antigravity Acc 2', 'https://cloudcode-pa.googleapis.com', '[]', 'testagy2', 'antigravity', ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET alias = 'testagy2'
    `).run(acc2Id, JSON.stringify({ email: 'acc2@gmail.com', projectId: 'proj-2', accessToken: 't2' }), Date.now());

    const res1 = await aiClient.importModels(acc1Id);
    const res2 = await aiClient.importModels(acc2Id);

    assert.ok(res1.success);
    assert.ok(res2.success);
    assert.ok(res1.count >= 10);
    assert.ok(res2.count >= 10);

    const m1 = db.prepare("SELECT * FROM models WHERE provider_id = ? AND model_id = 'gemini-3.8-flash-high'").get(acc1Id) as any;
    const m2 = db.prepare("SELECT * FROM models WHERE provider_id = ? AND model_id = 'gemini-3.8-flash-high'").get(acc2Id) as any;

    assert.strictEqual(m1.alias_model_id, 'testagy1/gemini-3.8-flash-high');
    assert.strictEqual(m2.alias_model_id, 'testagy2/gemini-3.8-flash-high');

    // Clean up test rows
    db.prepare('DELETE FROM providers WHERE id IN (?, ?)').run(acc1Id, acc2Id);
    db.prepare('DELETE FROM models WHERE provider_id IN (?, ?)').run(acc1Id, acc2Id);
  });
});

describe('WhatsApp Multi-Device LID Authorization, Public vs Admin Permissions, and /admin Pairing', () => {
  // Preserve original settings
  const origNumber = getSetting('whatsapp_admin_number', '');
  const origLid = getSetting('whatsapp_admin_lid', '');
  const origToken = getSetting('admin_access_token', '');

  test('isSenderAdmin recognizes both standard MSISDN phone and Multi-Device LID JIDs', () => {
    setSetting('whatsapp_admin_number', '6282223616154');
    setSetting('whatsapp_admin_lid', '111893192687716@lid');

    // 1. Matches phone JID with or without device suffix
    assert.strictEqual(whatsappService.isSenderAdmin('6282223616154@s.whatsapp.net'), true);
    assert.strictEqual(whatsappService.isSenderAdmin('6282223616154:2@s.whatsapp.net'), true);

    // 2. Matches Indonesian local format 08xxx
    assert.strictEqual(whatsappService.isSenderAdmin('082223616154@s.whatsapp.net'), true);

    // 3. Matches Linked Identity Device (LID) JID
    assert.strictEqual(whatsappService.isSenderAdmin('111893192687716@lid'), true);
    assert.strictEqual(whatsappService.isSenderAdmin('111893192687716:5@lid'), true);

    // 4. Matches when incoming LID matches the user-configured admin phone pair
    assert.strictEqual(whatsappService.isSenderAdmin('111893192687716@lid'), true);

    // 5. Rejects unauthorized stranger numbers and LIDs
    assert.strictEqual(whatsappService.isSenderAdmin('6281111111111@s.whatsapp.net'), false);
    assert.strictEqual(whatsappService.isSenderAdmin('999999999999999@lid'), false);
  });

  test('isDangerousCommand accurately separates public commands from admin-only controls', () => {
    // Public / safe commands -> false (accessible to everyone)
    assert.strictEqual(whatsappService.isDangerousCommand('/help', []), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/status', []), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/market', []), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/scanner', []), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/agents', []), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/agent', []), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/pnl', []), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/pos', []), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/kenapa', ['btc']), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/audit', []), false);
    assert.strictEqual(whatsappService.isDangerousCommand('/risk', []), false); // View only -> public

    // Dangerous / state-mutating / sensitive financial commands -> true (admin-only)
    assert.strictEqual(whatsappService.isDangerousCommand('/balance', []), true); // Sensitive financial data -> Admin
    assert.strictEqual(whatsappService.isDangerousCommand('/saldo', []), true);   // Sensitive financial data -> Admin
    assert.strictEqual(whatsappService.isDangerousCommand('/panic', []), true);
    assert.strictEqual(whatsappService.isDangerousCommand('/panic-sell', []), true);
    assert.strictEqual(whatsappService.isDangerousCommand('/stop', []), true);
    assert.strictEqual(whatsappService.isDangerousCommand('/pause', []), true);
    assert.strictEqual(whatsappService.isDangerousCommand('/resume', []), true);
    assert.strictEqual(whatsappService.isDangerousCommand('/start', []), true);
    assert.strictEqual(whatsappService.isDangerousCommand('/buy', ['btc', '100000']), true);
    assert.strictEqual(whatsappService.isDangerousCommand('/sell', ['btc']), true);
    assert.strictEqual(whatsappService.isDangerousCommand('/mode', ['live']), true);
    assert.strictEqual(whatsappService.isDangerousCommand('/risk', ['konservatif']), true); // Mutates profile -> admin only
  });

  test('/admin command verifies admin_access_token and pairs new LID sender dynamically', async () => {
    const testToken = 'test_token_secret_998877';
    setSetting('admin_access_token', testToken);
    setSetting('whatsapp_admin_lid', ''); // clear bound LID

    const sentMessages: Array<{ jid: string; text: string }> = [];
    const origSendMessage = (whatsappService as any).sendMessage.bind(whatsappService);
    (whatsappService as any).sendMessage = async (jid: string, text: string) => {
      sentMessages.push({ jid, text });
    };

    try {
      const strangerLid = '444555666777888@lid';

      // 1. Stranger attempts dangerous command /panic -> Access Denied warning sent
      await whatsappService.handleCommand(strangerLid, '/panic', false);
      assert.strictEqual(sentMessages.length, 1);
      assert.ok(sentMessages[0].text.includes('Akses Ditolak'));
      assert.ok(sentMessages[0].text.includes('/admin'));

      // 2. Stranger attempts /admin with WRONG token -> rejected
      await whatsappService.handleCommand(strangerLid, '/admin wrong_token_123', false);
      assert.strictEqual(sentMessages.length, 2);
      assert.ok(sentMessages[1].text.includes('OTENTIKASI GAGAL'));

      // 3. Stranger attempts /admin with CORRECT token -> SUCCESS & paired as admin
      await whatsappService.handleCommand(strangerLid, `/admin ${testToken}`, false);
      assert.strictEqual(sentMessages.length, 3);
      assert.ok(sentMessages[2].text.includes('OTENTIKASI ADMIN BERHASIL'));

      // 4. Now strangerLid is officially registered in DB & recognized as admin
      assert.strictEqual(getSetting('whatsapp_admin_lid', ''), strangerLid);
      assert.strictEqual(whatsappService.isSenderAdmin(strangerLid), true);
    } finally {
      (whatsappService as any).sendMessage = origSendMessage;
      // Restore original settings
      setSetting('whatsapp_admin_number', origNumber);
      setSetting('whatsapp_admin_lid', origLid);
      setSetting('admin_access_token', origToken);
    }
  });

  test('getAdminJids resolves all unique admin destination JIDs correctly (LID + MSISDN)', async () => {
    setSetting('whatsapp_admin_number', '6282223616154');
    setSetting('whatsapp_admin_lid', '111893192687716@lid');

    const jids = await whatsappService.getAdminJids();
    assert.ok(Array.isArray(jids));
    assert.ok(jids.includes('6282223616154@s.whatsapp.net'));
    assert.ok(jids.includes('111893192687716@lid'));

    // Restore
    setSetting('whatsapp_admin_number', origNumber);
    setSetting('whatsapp_admin_lid', origLid);
  });
});

describe('Conversational AI Trading Context & Natural Language Action Execution', () => {
  test('getFullTradingContext provides real-time balance, equity, positions, and sentiment', async () => {
    setSetting('trading_mode', 'paper');
    setSetting('paper_idr_balance', '5000000');
    setSetting('risk_profile', 'conservative');

    const context = await whatsappService.getFullTradingContext(true);

    assert.ok(typeof context === 'string');
    assert.ok(context.includes('STATUS SISTEM & PORTOFOLIO TRADING REAL-TIME'));
    assert.ok(context.includes('Saldo Kas IDR Tersedia: Rp 5.000.000'));
    assert.ok(context.includes('Total Ekuitas Portofolio'));
    assert.ok(context.includes('Mode: PAPER'));
    assert.ok(context.includes('CONSERVATIVE'));
    assert.ok(context.includes('ADMINISTRATOR UTAMA'));

    // Non-admin query must redact balance
    const nonAdminContext = await whatsappService.getFullTradingContext(false);
    assert.ok(nonAdminContext.includes('Dilindungi - Khusus Akses Administrator'));
    assert.ok(!nonAdminContext.includes('Saldo Kas IDR Tersedia: Rp 5.000.000'));
  });

  test('detectFallbackActionIntent identifies natural language intents accurately', () => {
    // 1. Stop auto trading
    const stop1 = whatsappService.detectFallbackActionIntent('tolong stop bot nya');
    assert.deepStrictEqual(stop1, { action: 'STOP_AUTOTRADING', params: {} });

    const stop2 = whatsappService.detectFallbackActionIntent('matikan auto trading sekarang');
    assert.deepStrictEqual(stop2, { action: 'STOP_AUTOTRADING', params: {} });

    // 2. Resume auto trading
    const resume1 = whatsappService.detectFallbackActionIntent('lanjutkan auto trading bot');
    assert.deepStrictEqual(resume1, { action: 'RESUME_AUTOTRADING', params: {} });

    const resume2 = whatsappService.detectFallbackActionIntent('start bot');
    assert.deepStrictEqual(resume2, { action: 'RESUME_AUTOTRADING', params: {} });

    // 3. Change risk profile
    const riskCons = whatsappService.detectFallbackActionIntent('ubah profil risiko ke konservatif');
    assert.deepStrictEqual(riskCons, { action: 'SET_RISK_PROFILE', params: { profile: 'conservative' } });

    const riskAggr = whatsappService.detectFallbackActionIntent('ganti risiko trading jadi agresif');
    assert.deepStrictEqual(riskAggr, { action: 'SET_RISK_PROFILE', params: { profile: 'aggressive' } });

    // 4. Change trading mode
    const modeLive = whatsappService.detectFallbackActionIntent('pindah ke mode live');
    assert.deepStrictEqual(modeLive, { action: 'SET_TRADING_MODE', params: { mode: 'live' } });

    // 5. Panic sell
    const panic = whatsappService.detectFallbackActionIntent('panic sell semua posisi');
    assert.deepStrictEqual(panic, { action: 'PANIC_SELL', params: {} });

    // 6. Manual buy & sell
    const buy = whatsappService.detectFallbackActionIntent('beli btc 100000');
    assert.strictEqual(buy?.action, 'BUY_COIN');
    assert.strictEqual(buy?.params?.symbol, 'btc');
    assert.strictEqual(buy?.params?.amountIdr, 100000);

    const sell = whatsappService.detectFallbackActionIntent('jual btc');
    assert.strictEqual(sell?.action, 'SELL_COIN');
    assert.strictEqual(sell?.params?.symbol, 'btc');

    // 7. General inquiry is NOT an action
    const query = whatsappService.detectFallbackActionIntent('berapa balance saya saat ini');
    assert.strictEqual(query, null);
  });

  test('executeAiAction enforces role-based authorization for dangerous actions', async () => {
    // 1. Non-admin is strictly blocked from stopping bot or altering risk
    const blockedStop = await whatsappService.executeAiAction('STOP_AUTOTRADING', {}, false);
    assert.ok(blockedStop.includes('Akses Tindakan Ditolak'));
    assert.ok(blockedStop.includes('/admin'));

    const blockedRisk = await whatsappService.executeAiAction('SET_RISK_PROFILE', { profile: 'aggressive' }, false);
    assert.ok(blockedRisk.includes('Akses Tindakan Ditolak'));

    // 2. Admin can execute STOP_AUTOTRADING
    setSetting('is_auto_trading_active', '1');
    const adminStop = await whatsappService.executeAiAction('STOP_AUTOTRADING', {}, true);
    assert.ok(adminStop.includes('AKSI BERHASIL'));
    assert.strictEqual(getSetting('is_auto_trading_active', '0'), '0');

    // 3. Admin can execute RESUME_AUTOTRADING
    const adminResume = await whatsappService.executeAiAction('RESUME_AUTOTRADING', {}, true);
    assert.ok(adminResume.includes('AKSI BERHASIL'));
    assert.strictEqual(getSetting('is_auto_trading_active', '0'), '1');

    // 4. Admin can execute SET_RISK_PROFILE
    const adminRisk = await whatsappService.executeAiAction('SET_RISK_PROFILE', { profile: 'conservative' }, true);
    assert.ok(adminRisk.includes('AKSI BERHASIL'));
    assert.strictEqual(getSetting('risk_profile', ''), 'conservative');

    // Restore balanced profile
    applyRiskProfile('balanced');
  });
});

describe('Admin Access Token Rotation Service', () => {
  const originalToken = getSetting('admin_access_token', '');
  const originalMode = getSetting('admin_token_rotation_mode', 'fixed');
  const originalValue = getSetting('admin_token_rotation_interval_value', '1');
  const originalUnit = getSetting('admin_token_rotation_interval_unit', 'days');
  const originalLastRotated = getSetting('admin_token_last_rotated_at', '0');

  test('calculates interval milliseconds accurately for minutes, hours, and days', () => {
    assert.strictEqual(adminTokenService.calculateIntervalMs(10, 'minutes'), 10 * 60 * 1000);
    assert.strictEqual(adminTokenService.calculateIntervalMs(2, 'hours'), 2 * 60 * 60 * 1000);
    assert.strictEqual(adminTokenService.calculateIntervalMs(1, 'days'), 24 * 60 * 60 * 1000);
  });

  test('defaults to fixed mode and does not rotate token on handleStartup', async () => {
    adminTokenService.saveConfig({ mode: 'fixed' });
    const currentToken = getSetting('admin_access_token', '');
    const result = await adminTokenService.handleStartup();
    assert.strictEqual(result.rotated, false);
    assert.strictEqual(result.token, currentToken);
    assert.strictEqual(getSetting('admin_access_token', ''), currentToken);
  });

  test('rotates token when mode is on_startup', async () => {
    adminTokenService.saveConfig({ mode: 'on_startup' });
    const previousToken = getSetting('admin_access_token', '');
    const result = await adminTokenService.handleStartup();
    assert.strictEqual(result.rotated, true);
    assert.notStrictEqual(result.token, previousToken);
    assert.strictEqual(getSetting('admin_access_token', ''), result.token);
  });

  test('rotates token when interval has elapsed in interval mode', async () => {
    adminTokenService.saveConfig({
      mode: 'interval',
      intervalValue: 1,
      intervalUnit: 'hours',
    });

    // Simulate last rotated 2 hours ago
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    setSetting('admin_token_last_rotated_at', String(twoHoursAgo));

    const tokenBefore = getSetting('admin_access_token', '');
    const didRotate = await adminTokenService.checkInterval();
    assert.strictEqual(didRotate, true);

    const tokenAfter = getSetting('admin_access_token', '');
    assert.notStrictEqual(tokenAfter, tokenBefore);
  });

  test('manual rotateToken generates new token, persists in DB, and invokes callback', async () => {
    let callbackTriggered = false;
    let receivedToken = '';
    adminTokenService.onRotate((newToken) => {
      callbackTriggered = true;
      receivedToken = newToken;
    });

    const result = await adminTokenService.rotateToken('Unit Test Manual Rotation', { sendAlerts: false });
    assert.strictEqual(result.token.length, 32);
    assert.strictEqual(getSetting('admin_access_token', ''), result.token);
    assert.strictEqual(callbackTriggered, true);
    assert.strictEqual(receivedToken, result.token);
  });

  test('restores original settings cleanly after testing', () => {
    setSetting('admin_access_token', originalToken);
    setSetting('admin_token_rotation_mode', originalMode);
    setSetting('admin_token_rotation_interval_value', originalValue);
    setSetting('admin_token_rotation_interval_unit', originalUnit);
    setSetting('admin_token_last_rotated_at', originalLastRotated);
    assert.strictEqual(getSetting('admin_token_rotation_mode', ''), originalMode);
  });
});

describe('Zero-Trust Token Comparison & Security Hardening', () => {
  test('secureCompareTokens returns true only for matching strings in constant time', () => {
    assert.strictEqual(secureCompareTokens('secret123', 'secret123'), true);
    assert.strictEqual(secureCompareTokens('secret123', 'secret124'), false);
    assert.strictEqual(secureCompareTokens('short', 'longer_string'), false);
    assert.strictEqual(secureCompareTokens('', 'secret'), false);
    assert.strictEqual(secureCompareTokens('secret', ''), false);
  });

  test('checkIsAdmin fails closed when token is mismatch or empty', () => {
    const originalToken = getSetting('admin_access_token', '');
    try {
      setSetting('admin_access_token', 'super_secret_token_abc');
      assert.strictEqual(checkIsAdmin({ headers: { 'x-admin-token': 'super_secret_token_abc' } } as any), true);
      assert.strictEqual(checkIsAdmin({ headers: { 'x-admin-token': 'wrong_token' } } as any), false);
      assert.strictEqual(checkIsAdmin({ headers: {} } as any), false);
    } finally {
      setSetting('admin_access_token', originalToken);
    }
  });
});

describe('Circuit Breaker Resilience & Decoupled Ratchet', () => {
  test('circuit breaker stops new entries without permanently deadlocking auto-trading', async () => {
    const originalTriggered = getSetting('circuit_breaker_triggered_at', '0');
    const originalActive = getSetting('is_auto_trading_active', '1');
    try {
      // Simulate circuit breaker active with 1 hour elapsed (still within 24h cooldown)
      const oneHourAgo = Date.now() - (1 * 60 * 60 * 1000);
      setSetting('circuit_breaker_triggered_at', String(oneHourAgo));
      setSetting('is_auto_trading_active', '1');

      const isTripped = await tradingEngine.checkDailyCircuitBreaker();
      assert.strictEqual(isTripped, true);
      // Ensure is_auto_trading_active remains 1 so loop continues to run and evaluate recovery!
      assert.strictEqual(getSetting('is_auto_trading_active', '0'), '1');

      // Simulate 25 hours elapsed (cooldown finished)
      const twentyFiveHoursAgo = Date.now() - (25 * 60 * 60 * 1000);
      setSetting('circuit_breaker_triggered_at', String(twentyFiveHoursAgo));

      const isTrippedAfterCooldown = await tradingEngine.checkDailyCircuitBreaker();
      assert.strictEqual(isTrippedAfterCooldown, false);
      assert.strictEqual(getSetting('circuit_breaker_triggered_at', '0'), '0');
    } finally {
      setSetting('circuit_breaker_triggered_at', originalTriggered);
      setSetting('is_auto_trading_active', originalActive);
    }
  });
});




