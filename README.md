# 🚀 AI Trading Terminal — Autonomous Spot Trading & Multi-Agent Swarm for Indodax

![AI Trading Terminal Banner](docs/assets/system-banner.svg)

<div align="center">

[![Language: English](https://img.shields.io/badge/Language-English-38bdf8?style=for-the-badge)](README.md)
[![Dokumentasi: Bahasa Indonesia](https://img.shields.io/badge/Dokumentasi-Bahasa%20Indonesia-10b981?style=for-the-badge)](docs/PANDUAN_PENGGUNA.md)
[![Tests](https://img.shields.io/badge/Unit%20Tests-306%2F306%20PASS%20(100%25)-10b981?style=for-the-badge&logo=jest)](tests/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x%20Strict-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2022.12.0-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19%20%2B%20Vite%20%2B%20Tailwind-61dafb?style=for-the-badge&logo=react)](client/)
[![Indodax](https://img.shields.io/badge/Exchange-Indodax%20API%20v2-0284c7?style=for-the-badge)](https://indodax.com)
[![Bots](https://img.shields.io/badge/Remote%20Bots-WhatsApp%20%2B%20Telegram-25d366?style=for-the-badge&logo=whatsapp)](client/src/components/BotsView.tsx)
[![Security](https://img.shields.io/badge/Security-Zero--Trust%20Token-e11d48?style=for-the-badge)](src/services/auth/)
[![License](https://img.shields.io/badge/License-Proprietary%20%2F%20Commercial-7c3aed?style=for-the-badge)](LICENSE)

**Unified Autonomous Cryptocurrency Spot Trading Platform for Indodax Exchange**  
*Unifying High-Speed Deterministic Section 9 Signals (0 Token Cost), 10 Specialized AI Research Sub-Agents, a 9-Gate Pure Risk Guard Pipeline wrapped in an Institutional Protection Layer (drawdown kill switch, exit guard, floored exits, order-intent crash recovery), and Unified Remote Bots via WhatsApp &amp; Telegram.*

[Key Features](#-key-features--advantages) • [System Architecture](#-end-to-end-system-architecture) • [9 Risk Gates Pipeline](#-pure-risk-guard-9-sequential-defense-gates) • [AI Swarm Research](#-multi-agent-ai-research-swarm-10-analytical-lenses) • [Quickstart Guide](#-quickstart-guide-1-click-launchers) • [Remote Bots](#-unified-remote-bots-whatsapp--telegram) • [Capital Auto-Set](#-intelligent-capital-allocation-auto-set-engine)

📄 **Dokumentasi:** [Panduan Pengguna (Bahasa Indonesia)](docs/PANDUAN_PENGGUNA.md) • [Laporan Implementasi](docs/LAPORAN-IMPLEMENTASI.md) • [Verifikasi](docs/VERIFIKASI.md) • [Galeri Screenshot](docs/assets/screenshots/README.md)

</div>

---

## 📑 Table of Contents

- [1. Executive Summary & Design Philosophy](#-executive-summary--design-philosophy)
- [2. Key Features & Advantages](#-key-features--advantages)
- [📸 App Screenshots (Tampilan Aplikasi)](#-app-screenshots-tampilan-aplikasi)
- [3. End-to-End System Architecture](#-end-to-end-system-architecture)
- [4. Deterministic Section 9 Signal Engine](#-deterministic-section-9-signal-engine)
- [5. Pure Risk Guard: 9 Sequential Defense Gates](#-pure-risk-guard-9-sequential-defense-gates)
- [6. Multi-Agent AI Research Swarm (10 Analytical Lenses)](#-multi-agent-ai-research-swarm-10-analytical-lenses)
- [7. Counterfactual A/B Testing & Ghost Position Engine](#-counterfactual-ab-testing--ghost-position-engine)
- [8. Intelligent Capital Allocation (Auto-Set Engine)](#-intelligent-capital-allocation-auto-set-engine)
- [9. Investment Risk Profiles (Conservative, Balanced, Aggressive)](#-investment-risk-profiles)
- [10. Simulation Mode (Paper) vs Real Mode (Live Indodax)](#-simulation-mode-paper-vs-real-mode-live-indodax)
- [11. Unified Remote Bots: WhatsApp & Telegram](#-unified-remote-bots-whatsapp--telegram)
- [12. Zero-Trust Security & Resilient Infrastructure](#-zero-trust-security--resilient-infrastructure)
- [13. Quickstart Guide: 1-Click Launchers](#-quickstart-guide-1-click-launchers)
- [14. Production Deployment via Docker](#-production-deployment-via-docker)
- [15. Project Directory Architecture](#-project-directory-architecture)
- [16. Quality Assurance & Test Suite (306/306 Passing)](#-quality-assurance--test-suite)
- [17. Frequently Asked Questions (FAQ) & Troubleshooting](#-frequently-asked-questions-faq--troubleshooting)
- [18. Financial Risk Disclaimer](#-financial-risk-disclaimer)

---

## 💡 Executive Summary & Design Philosophy

Manual cryptocurrency trading is frequently plagued by emotional exhaustion, psychological biases (**FOMO** at market tops and **Panic Selling** at local bottoms), and the human inability to continuously monitor hundreds of trading pairs across 24/7 market cycles.

**AI Trading Terminal** is engineered around one foundational principle:
> 🛡️ **"Capital Preservation First, Profit Generation Second"**  
> *It is significantly better to miss a speculative entry than to suffer an irrecoverable drawdown on a careless trade.*

### Why AI Trading Terminal is Different:
1. **Decoupled Quantitative Architecture:** Large Language Models (LLMs) excel at processing global news and qualitative sentiment, but are far too slow, expensive, and unpredictable for high-frequency price analysis. We decouple these responsibilities:
   - **Deterministic Section 9:** Calculates pure mathematical technical indicators (Wilder's RSI, EMA, True ATR, Depth Imbalance) in **< 2 milliseconds** with **zero token cost** (`0 Token Cost`).
   - **AI Research Swarm:** Operates in the background analyzing macro narratives and exploit headlines from CoinDesk/CoinTelegraph/Indodax Blog RSS plus live Indodax tickers, using SHA-256 context deduplication to skip AI calls when the news and market fingerprint is unchanged.
2. **9 Pure Risk Defense Gates + Institutional Protection Layer:** Every prospective buy signal **must pass 100% of all 9 sequential safety gates** before any order is submitted to Indodax — and every open position stays wrapped in a drawdown kill switch, an exit guard, and floored limit exits that can never fill below the stop level.
3. **Mathematical Trailing Stop Ratchet:** As an asset's market price increases, profit protection thresholds are monotonically ratcheted upward and **locked one-way**. If the trend abruptly reverses, the bot immediately locks in accumulated gains.
4. **Zero-Configuration 1-Click Launchers:** Pre-packaged scripts for Windows (`start.bat`), PowerShell (`start.ps1`), and Linux/macOS (`start.sh`), accompanied by full bidirectional remote control via WhatsApp and Telegram.

---

## ✨ Key Features & Advantages

| Category | Highlighted Capability | Architectural Impact & Benefits |
| :--- | :--- | :--- |
| **Speed & Efficiency** | **Section 9 Engine** | Pure mathematical signal pipeline, sub-millisecond execution, 0 token expenditure. |
| **Market Intelligence** | **10 AI Sub-Agents** | Ten analytical lenses over verified inputs: CoinDesk/CoinTelegraph/Indodax Blog RSS, Indodax tickers, and a deterministic threat scanner. No Twitter/X, Reddit, or on-chain scraping is claimed. |
| **Capital Defense** | **9 Risk Defense Gates + Institutional Protection Layer** | Daily circuit breaker, bid-ask spread trap filter, anti-FOMO RSI guard, and BTC flash crash veto — wrapped in a drawdown kill switch, exit guard, and floored exit execution. |
| **Financial Sizing** | **Capital Auto-Set** | Intelligent dynamic position sizing scaled to available balance (from micro IDR 10,000 up to tens of millions), with an optional max-allocation-per-trade cap as a percentage of current equity. |
| **Profit Locking** | **Trailing Ratchet** | Dynamic monotonic stop-loss escalation prevents open profits from turning into catastrophic losses. Live exits use **floored limit orders** so they can never fill below the stop level. |
| **Profit Locking** | **Second Scale-Out (TP2)** | After TP1 banks the first 50%, a second take-profit rung (default 10%, per profile 7/10/15%) sells a configurable fraction of the *remainder* while preserving the ratcheted breakeven-or-better stop (`take_profit_target_2_percent`, `tp2_sell_fraction_percent`). |
| **Entry Strategy** | **Composite Entry Scoring** | Momentum candidates (balanced/aggressive) are ranked with the deterministic `scoreOpportunity` engine over extracted 15m features instead of raw 24h gain alone (`entry_scoring_mode=composite_score`); the legacy `gain_rank` ordering remains available as an exact toggle. |
| **UI Observability** | **Entry Diagnostics** | Transparent live observability table explaining why coins were approved or vetoed at each gate. |
| **UI Observability** | **Guided Setup Wizard & Live-Readiness Score** | A 6-step first-run onboarding wizard ("Panduan Setup") plus a dashboard readiness card (0–100) that scores paper-trading performance across 5 beginner-friendly criteria before considering live mode. |
| **Market Intelligence** | **Whole-Market Radar (0 Token)** | Deterministic screener ranks every liquid Indodax pair each cycle (volume percentile + momentum band), a market-breadth gate reads the advancing share of the top-20 pairs to pause altcoin entries on weak tape, and re-entry cooldowns force rotation instead of chasing the same coin. |
| **Exit Intelligence** | **Adaptive Exit Engine** | Per-position exit plans computed at entry from ATR volatility, BTC regime, and momentum strength — profit targets stretch in healthy trends while the trailing (loss side) stays anchored to the user's own setting (never more than 2×); stagnant positions are rotated out after a configurable hold window. |
| **Ops Observability** | **Prometheus Metrics & Watchdog** | `GET /api/metrics` exposition (positions, drawdown state, pending order intents, loop latency), structured pino logging, and an external uptime-watchdog ping (`WATCHDOG_URL`). |
| **Remote Control** | **Unified Bots View** | Centralized bot management for WhatsApp & Telegram with 4 modes: *Both*, *WhatsApp Only*, *Telegram Only*, or *Disabled*. Conversational AI actions are guarded by a two-step confirmation code. |
| **Zero-Trust Security** | **Admin Access Token** | Constant-time token verification (`crypto.timingSafeEqual`) with automated background rotation schedules. |
| **AI Validation** | **A/B Ghost Positions** | Real-time counterfactual simulation benchmarking AI vetoes against market prices to compute empirical AI Alpha. |
| **Strategy Research** | **Portfolio Backtest & Walk-Forward** | Multi-symbol backtester with concurrent position slots and a shared cash pool, a 90-day local candle cache, and walk-forward optimization with an explicit OVERFIT verdict. |
| **Strategy Research** | **Backtest Candle Cache** | Both backtest engines read the local candle store first (with count, edge-freshness and contiguity checks) and report `dataSource: 'cache'` vs `'exchange'` so every result discloses where its candles came from; the portfolio engine warns about dropped symbols. |
| **Self-Optimization** | **Walk-Forward Presets & Strategy Kelly** | A built-in optimizer (candle-cache first) runs in/out-of-sample plus expanding walk-forward per symbol; only `WALK_FORWARD_ROBUST` runs with OOS profit factor ≥ 1.0 may write a **profit-side** preset (TP1/TP2 — trailing is never machine-written) consumed opt-in via `optimizer_preset_enabled`; a per-strategy Kelly governor scales allocation by each `entry_strategy`'s last-20 win rate. Zero LLM tokens. |
| **Web-First Configuration** | **Zero .env Required** | Every runtime setting — log level, watchdog URL, extra research RSS, Antigravity OAuth client, local-endpoint permission — is managed from the Settings tab (the server port is fixed at 3001 and intentionally not web-changeable) and stored encrypted in the local database; a `.env` file is never required (environment variables remain optional overrides). |
| **Internationalization** | **Multi-Language (i18n)** | Full bilingual English (default) and Indonesian support across UI, tables, and reporting. |
| **Portability** | **PWA & Offline Shell** | Installable Progressive Web App (PWA) with responsive mobile layouts and modern dark mode styling. |

---

## 📸 App Screenshots (Tampilan Aplikasi)

Tangkapan layar asli aplikasi (mode PAPER, bahasa Indonesia). Semua gambar tersimpan di
[`docs/assets/screenshots/`](docs/assets/screenshots/) — **untuk memakai screenshot Anda sendiri,
cukup timpa file dengan nama yang sama**, tidak perlu mengubah README. Panduan lengkap:
[docs/assets/screenshots/README.md](docs/assets/screenshots/README.md).

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/screenshots/dashboard.png" alt="Dashboard Terminal Trading" />
      <br><sub><b>Dashboard</b> — KPI modal, Proteksi Modal berlapis, Skor Kesiapan Live</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/screenshots/scanner-radar.png" alt="Radar Pasar Deterministik" />
      <br><sub><b>Radar Pasar (0 token)</b> — market breadth + ranking seluruh pair Indodax</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/screenshots/setup-wizard.png" alt="Panduan Setup" />
      <br><sub><b>Panduan Setup</b> — wizard 6 langkah dengan pratinjau alokasi real-time</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/screenshots/backtest.png" alt="Backtest Strategi" />
      <br><sub><b>Backtest Strategi</b> — single & portofolio, Exit Adaptif, sumber data cache/bursa</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/assets/screenshots/bots.png" alt="Bots WhatsApp dan Telegram" />
      <br><sub><b>Bots</b> — WhatsApp & Telegram terpadu, 4 mode kanal, konfirmasi 2 langkah</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/assets/screenshots/reports.png" alt="Laporan dan Kinerja" />
      <br><sub><b>Laporan & Kinerja</b> — KPI eksekutif, Atribusi Strategi, ekspor CSV/PDF</sub>
    </td>
  </tr>
</table>

---

## 🏛️ End-to-End System Architecture

Below is the comprehensive architectural blueprint of the **AI Trading Terminal**:

![System Architecture](docs/assets/architecture-diagram.svg)

### End-to-End System Data Flow:
```mermaid
flowchart TD
    subgraph Ingestion [1. Market Data Ingestion Layer]
        IdxREST[Indodax REST API v2] --> InFlightCache[6s In-Flight TTL Cache & Dedup Promise]
        IdxWS[Indodax WebSocket Feed] --> BatchTicker[Batch Ticker & 5-Depth Order Book]
        IdxBook[Indodax Order Book & Spreads] --> Sec9
    end

    InFlightCache --> Sec9
    BatchTicker --> Sec9

    subgraph Sec9 [2. Deterministic Section 9 Engine - Zero Token]
        Feat[features.ts: RSI14, EMA21, True ATR, Depth Imbalance]
        Lex[lexicon.ts: Bilingual ID/EN Financial Lexicon + Tanh Scaling]
        Threat[threat.ts: Scoped Threat Blocker 30m Freshness]
        Regime[regime.ts: BTC Macro Window 1h & 4h Drop Returns + ATR Percentile]
        Scorer[scorer.ts: Blue-Chip Pullback & Momentum Scoring]
    end

    Sec9 --> BlackboardBus

    subgraph AIResearch [3. AI Swarm Research - 10 Analytical Lenses]
        BlackboardBus[Blackboard Event Bus SQLite Outbox]
        NewsAgent[Global News & Regulatory RSS]
        SentimentAgent[News Sentiment & Market Narrative]
        SecurityAgent[Exploit Headline Scanner & Liquidity Lens]
        ListingAgent[New Indodax Listing Detector]
        DedupEngine[SHA256 Context Dedup - Skips Unchanged Calls]
        AntigravityAPI[Antigravity Live Model API: Gemini 3.8 / Claude 4.6]
        
        BlackboardBus --> DedupEngine --> AntigravityAPI
        AntigravityAPI --> NewsAgent & SentimentAgent & SecurityAgent & ListingAgent
    end

    Sec9 --> RiskPipeline
    AIResearch -.->|Confirmation / Veto| RiskPipeline

    subgraph RiskPipeline [4. Pure Risk Guard - 9 Defense Gates]
        G1[G1: Daily Circuit Breaker] --> G2[G2: Portfolio Exposure Cap]
        G2 --> G3[G3: BTC Crash Veto]
        G3 --> G4[G4: Bid-Ask Spread Trap]
        G4 --> G5[G5: RSI Overbought Guard]
        G5 --> G6[G6: Scoped Threat Blocker]
        G6 --> G7[G7: Slippage Liquidity Depth]
        G7 --> G8[G8: Technical Score Threshold]
        G8 --> G9[G9: Indodax IDR 10,000 Min Floor]
    end

    RiskPipeline -->|100% Passed| ExecLayer
    RiskPipeline -.->|Any Single Veto| GhostLog[Log Veto in entry_gate_logs & Simulate Ghost Position]

    subgraph ExecLayer [5. Execution & Position Management]
        OrderEngine[Order Dispatcher: Paper Trading / Live Indodax]
        RatchetEngine[Trailing Stop Ratchet Engine]
        AutoSetEngine[Capital Allocation Auto-Set Engine]
        PanicEngine[Panic Sell Sub-Second Liquidator]
        ProtectionLayer[Institutional Protection: Drawdown Kill Switch + Exit Guard + Floored Exits + Order Intent Journal]
    end

    subgraph UI_Bots [6. Observability, Bots & Client UI]
        SQLiteDB[(SQLite Database WAL Mode)]
        UnifiedBots[Unified Bots: WhatsApp Baileys + Telegram Bot API]
        ReactUI[React 19 Dashboard + Tailwind CSS + PWA]
        PDFReport[Executive PDF Report (client-side jsPDF) & Tax CSV Export]
        MetricsEndpoint[Prometheus /api/metrics + External Watchdog Ping]
    end

    ExecLayer --> SQLiteDB
    ExecLayer --> UnifiedBots
    ExecLayer --> ReactUI
    SQLiteDB --> PDFReport
```

---

## ⚡ Deterministic Section 9 Signal Engine

Unlike conventional cryptocurrency bots that exhaust costly LLM tokens on every price tick, AI Trading Terminal utilizes the **Deterministic Section 9 Pipeline** located in [`src/services/signals/`](src/services/signals/). This pipeline executes directly in local system memory:

1. **Quantitative Feature Extraction ([`features.ts`](src/services/signals/features.ts)):**
   - **RSI(14) with Wilder's Smoothing:** Calculates momentum across candles with zero drift.
   - **Exponential Moving Average (EMA 21):** Evaluates trend alignment and dynamic support floors.
   - **True Average True Range (True ATR):** Captures true volatility by incorporating candle gap wicks.
   - **Depth Imbalance:** Analyzes bid-wall versus ask-wall pressure across the top 5 levels of the Indodax orderbook.
   - **Bid-Ask Spread Analysis:** Calculates real-time spread percentages to ensure fair execution.
2. **Bilingual Financial Sentiment Lexicon ([`lexicon.ts`](src/services/signals/lexicon.ts)):**
   - Curated dictionary of hundreds of financial terms in both English and Indonesian (*surge, partnership, hack, lawsuit, delisting, exploit*).
   - Utilizes the **Hyperbolic Tangent (`tanh`)** scaling function to strictly bound sentiment values between `[-1.0, +1.0]`.
   - Applies a **48-Hour Age Decay Curve**: Fresh news carries maximum weight, while older reports exponentially decay.
3. **Scoped Threat Blocker ([`threat.ts`](src/services/signals/threat.ts)):**
   - Scopes security threats per individual coin symbol. A security scare on an obscure token will never freeze entries for Bitcoin or Ethereum.
   - Discards common benign substrings such as `"sec"` (seconds) or `"second"`.
   - Features a **30-Minute Freshness Window**, ensuring markets do not remain permanently blocked after false alarms clear.
4. **BTC Macro Regime Window Returns ([`regime.ts`](src/services/signals/regime.ts)):**
   - Tracks Bitcoin price velocity across rolling **1-hour (`<= -3%`)** and **4-hour (`<= -5%`)** windows.
   - Includes an **ATR-percentile volatility input** (computed over the available 15m candle window) — a close below the 1h EMA21 combined with top-quintile volatility (percentile ≥ 80) yields the **RISK_OFF** verdict, which applies the scorer's −10 penalty instead of only blocking on raw price drops.
   - Accurately detects acute flash dumps without interrupting trades during normal sideways consolidations.
5. **Conservative Blue-Chip Pullback Scorer ([`scorer.ts`](src/services/signals/scorer.ts)):**
   - Enables Conservative profiles to safely capture high-cap assets (BTC, ETH, SOL) during healthy pullbacks to the EMA21 support line when RSI is in cool territory (< 48).

---

## 🛡️ Pure Risk Guard (9 Sequential Defense Gates)

Every prospective trade signal must sequentially pass the rigorous **9 Defense Gates** in [`src/services/trading/riskGuard.ts`](src/services/trading/riskGuard.ts):

![9 Risk Gates Pipeline](docs/assets/risk-gates-pipeline.svg)

```mermaid
graph TD
    Cand[Prospective Coin Buy Signal] --> G1{Gate 1: Circuit Breaker?}
    G1 -- Daily Loss &gt; Limit --> V1[VETO: Daily Circuit Breaker 24h Cooldown]
    G1 -- Passed --> G2{Gate 2: Portfolio Exposure?}
    G2 -- Max Positions Reached --> V2[VETO: Portfolio Capacity Full]
    G2 -- Passed --> G3{Gate 3: BTC Flash Crash?}
    G3 -- BTC 1h/4h Dump --> V3[VETO: Hazardous Macro Regime]
    G3 -- Passed --> G4{Gate 4: Bid-Ask Spread?}
    G4 -- Spread &gt; Limit --> V4[VETO: Illiquid Spread Trap]
    G4 -- Passed --> G5{Gate 5: RSI Overbought?}
    G5 -- RSI &gt; 70-75 --> V5[VETO: Top FOMO Candle]
    G5 -- Passed --> G6{Gate 6: Scoped Threat?}
    G6 -- Exploit / Hack Detected --> V6[VETO: Coin Security Threat]
    G6 -- Passed --> G7{Gate 7: Slippage Budget?}
    G7 -- Depth Slippage &gt; tolerance --> V7[VETO: Orderbook Slippage Exceeded]
    G7 -- Passed --> G8{Gate 8: Tech & Setup Score?}
    G8 -- Score &lt; threshold --> V8[VETO: Setup Score Sub-Threshold]
    G8 -- Passed --> G9{Gate 9: Min IDR 10,000 Floor?}
    G9 -- Order &lt; 10k IDR --> V9[VETO: Below Indodax Minimum Size]
    G9 -- Passed --> ACC[✓ 100% PASSED: ORDER DISPATCHED TO EXCHANGE]
```

### Gate-by-Gate Specification:
1. **Gate 1 — Daily Circuit Breaker:** Sums total realized losses for the day. If losses exceed the risk profile limit (e.g., 5%), auto-trading is immediately halted for 24 hours. Employs decoupled state ratcheting to prevent execution deadlocks.
2. **Gate 2 — Portfolio Exposure Limit:** Enforces concurrency limits on active positions (2 to 3 coins based on risk profile and capital tier — see the [Risk Profiles](#-investment-risk-profiles) table).
3. **Gate 3 — BTC Macro Regime:** Vetoes all buy entries across the board if Bitcoin experiences an acute flash dump (> 3% drop in 1 hour or > 5% in 4 hours). Without a crash, a close below the 1h EMA21 combined with top-quintile ATR-percentile volatility yields **RISK_OFF** — entries stay technically allowed, but the scorer applies a −10 penalty.
4. **Gate 4 — Spread Trap Guard:** Rejects assets with excessive bid-ask spreads (> 0.8%, a hard-coded tolerance applied to all profiles), safeguarding capital against illiquid traps.
5. **Gate 5 — RSI Guard (Anti-Top FOMO):** Prevents entering tokens whose 14-period RSI is already overbought (> 70-75).
6. **Gate 6 — Scoped Threat Scoping:** Confirms the specific target coin has had zero exploit disclosures, contract hacks, or delisting announcements within the past 30 minutes.
7. **Gate 7 — Slippage Budget:** Simulates full order execution against the top 5 levels of the Indodax orderbook, ensuring effective slippage does not exceed the `slippage_tolerance_percent` setting (default 0.8%; the conservative profile applies 0.5%).
8. **Gate 8 — Technical Score Threshold:** Mandates that the composite technical setup score meets or exceeds the required threshold (per profile: 65 conservative / 60 balanced / 50 aggressive).
9. **Gate 9 — Indodax Minimum Floor:** Verifies that after subtracting cash reserves, the net order value is **at least IDR 10,000**, fully satisfying Indodax exchange regulations.

### Institutional Protection Layer (wraps the 9 gates)

The 9 gates decide *whether to enter*. A second, independent layer protects capital *around and after* every entry — critical because the Indodax Trade API v2 cannot host stop orders (`STOP_LIMIT` is rejected by `POST /api/v2/order`; verified against the official docs), so downside protection lives in this process:

1. **Drawdown Kill Switch:** Tracks the mode-scoped equity peak. If equity falls `max_drawdown_percent` (default 15%) below its peak, or below the absolute `equity_floor_idr`, auto-trading halts and the configured de-risk mode runs: `halt` (entries only), `halve` (sell 50% of every position), or `flatten` (liquidate all). There is **no automatic reset** — clearing it requires the manual `POST /api/trading/drawdown-reset` endpoint (or the Dashboard protection card), which re-bases the equity peak.
2. **Exit Guard:** While any live position lacks a guaranteed exit plan (dust remainder below the exchange minimum, a sell failure, or balance ambiguity), new live entries are refused (`require_protective_orders=1`). Flags clear automatically after a clean reconciliation.
3. **Floored Limit Exits:** Live sells first place a `LIMIT SELL` at the trailing-stop level (or collar price), so they can never fill below the floor; the unfilled remainder is cancelled and market-sold after `limit_exit_timeout_ms`. A remainder too small for the exchange minimum is flagged for manual review instead of retrying forever.
4. **Order-Intent Journal & Crash Recovery:** Every live order is journaled in `order_intents` with an official `newClientOrderId` **before** the request leaves the process. After a crash between "order sent" and "fill recorded", the engine recovers the truth by querying the exchange with `origClientOrderId`; critical findings pause auto-trading and alert the admin.
5. **Resilient API access:** Private GET/DELETE calls retry with exponential backoff honoring `Retry-After` (POSTs are never blindly retried — order intents cover crash recovery instead), and account reads are deduplicated to respect rate limits.
6. **Shutdown warning:** If the process stops while live positions are open, admins receive a WhatsApp/Telegram warning that exit protection is offline until restart.

---

### Rotation & Market-Health Gates (Deterministic, 0 Token)

Three newer gates govern *how the bot rotates across the whole market*, all pure math on data the engine already holds:

1. **Market Breadth (`market_breadth`):** the advancing share of the 20 most liquid pairs (last price vs 24h-ago, from `prices_24h` the summaries API already returns). Below `market_breadth_min_percent` (default 30), *momentum* and *new-listing* entries pause for the cycle while blue-chip pullbacks stay available. Fails open when the data is absent.
2. **Re-Entry Cooldown (`reentry_cooldown`):** a just-closed symbol cannot be re-bought for `reentry_cooldown_hours` (default 4) — **doubled after a losing trade** — so the bot rotates to fresh opportunities instead of chasing what it just sold.
3. **Multi-Timeframe Alignment (`mtf_alignment`):** a 15m setup is only tradable when the 1h trend agrees (close ≥ EMA21 with a non-falling EMA). Candle-store first; at most 8 bounded fetches per cycle; missing data → pass with a warning, never a block.

The whole-market ranking behind these gates is published live at `GET /api/market/radar` and rendered as the "Radar Pasar (Deterministik)" card in the Scanner tab — the dashboard's entry diagnostics now shows **12 gate cards** with plain-language explainers.

---

## 🤖 Multi-Agent AI Research Swarm (10 Analytical Lenses)

Located in the **AI Research** tab, 10 analytical lenses in [`src/services/agents/`](src/services/agents/) run on the same grounded context:

- **News:** CoinDesk RSS, CoinTelegraph RSS, and Indodax Blog RSS (5-minute cache).
- **Market:** Indodax public tickers, top gainers, 24h volume, top-of-book spreads, and BTC reference prices.
- **Deterministic context:** headline sentiment lexicon and a threat keyword scanner.
- **Optional feeds:** set `AI_TRADING_EXTRA_RSS_FEEDS` to add up to 5 public RSS URLs (for example a Reddit RSS feed). No direct Twitter/X, on-chain wallet, CoinGecko, The Fed, Bank Indonesia, or Bappebti feed is integrated by default.

1. **Global News Analyst:** Summarizes breaking crypto headlines from CoinDesk and CoinTelegraph RSS.
2. **Tech & Ecosystem Analyst:** Screens the same headlines for protocol upgrades, hard forks, and ecosystem news.
3. **News Sentiment Analyst:** Compares deterministic lexicon scores of headlines with Indodax market moves.
4. **Market Narrative Radar:** Identifies dominant narratives across headlines, Indodax Blog, and tickers.
5. **Indodax Listing Radar:** Reads the official Indodax Blog and new-coin alerts; no direct exchange announcement API beyond those sources.
6. **Momentum Hunter:** Analyzes Indodax top gainers and 24h volume.
7. **Security Radar:** Screens headlines for hack/exploit/delisting keywords. This is not a smart-contract audit.
8. **Macro & Regulatory Radar:** Highlights macro/regulatory headlines available in RSS; it does not have direct central-bank or regulator feeds.
9. **Liquidity & Spread Analyst:** Reviews top-of-book bid/ask spreads and volume on Indodax.
10. **BTC Correlation Analyst:** Compares BTC direction with top altcoin gainers on Indodax.

### Token Optimization & Failure Policy
- **SHA-256 Fingerprint Deduplication:** Generates cryptographic hashes of news headlines and market state. If the context has not fundamentally changed, AI calls are **automatically skipped** (`skipped_dedup`). Actual token savings depend on how frequently the underlying news and market context changes.
- **Compact Payload Formatting:** System prompts are minimized into single-line JSON structures with redundant whitespace eliminated.
- **Mode-aware fail-closed policy:** In paper `confirm` mode, a failed AI confirmation can fall back to deterministic signals for simulation. In **live mode** (and every `required` mode), AI failure blocks new entries until the provider recovers; open positions continue to be monitored by the exit engine.

### Portfolio Advisor, Prompt Versioning & Self-Learning
- **Portfolio Advisor (read-only):** A daily review role that inspects open positions, equity, 7-day performance, and the BTC regime, then publishes up to 3 advisory recommendations to the AI Research tab. It **cannot execute anything** — the output is advisory text only.
- **Versioned prompts (`src/services/ai/prompts.ts`):** Every LLM role's prompt carries an explicit version, recorded per call in `ai_call_logs.prompt_version` for a full audit trail. Any behavior-affecting wording change requires a version bump.
- **Eval harness:** `tests/ai_evals.test.ts` pins prompt invariants (JSON-only verdict format, risk budget present, read-only constraints, confirmation policy), and `npm run ai:eval` runs a golden-scenario set against a real model to measure verdict agreement after any prompt change.
- **Weekly learning report:** A 7-day digest (win rate, net PnL, profit factor, top post-mortem lessons) is sent to the admin bots. Post-mortem lessons are enriched with the BTC regime they were taken in, and condition future entry prompts.

---

## 🔬 Counterfactual A/B Testing & Ghost Position Engine

How do you verify whether AI vetoes genuinely protect capital rather than discard lucrative opportunities?

AI Trading Terminal includes a built-in **A/B Counterfactual Testing Engine**:
- Whenever the AI swarm or risk gates veto a prospective buy signal, a virtual **Ghost Position** is registered in the database table [`ghost_positions`](src/db/index.ts).
- The system monitors this shadow position against real-time Indodax market prices as if the trade had actually executed.
- Outcomes are categorized into empirical performance groups:
  - 🛡️ **`BULLET_DODGED`:** The vetoed trade subsequently collapsed or hit the virtual stop-loss, indicating the veto avoided a loss in that sample.
  - ⚠️ **`MISSED_OPPORTUNITY`:** The vetoed trade subsequently met the take-profit target.
  - ⚖️ **`NEUTRAL`:** The vetoed trade broke even within the tracking window.
- The dashboard reports a counterfactual **AI Alpha** estimate: the simulated net percentage of portfolio capital that vetoed trades would have gained or lost.

---

## 💰 Intelligent Capital Allocation (Auto-Set Engine)

The **Capital Allocation Auto-Set Engine** in [`src/services/trading/index.ts`](src/services/trading/index.ts) dynamically sizes trades based on available wallet balance:

![Capital Allocation Auto-Set](docs/assets/capital-auto-set.svg)

### Dynamic Capital Allocation Matrix:

| Balance Bracket (IDR) | Tier Classification | Maximum Positions | Allocation per Position | Safety Cash Reserve | Operational Behavior |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **< IDR 100,000** | **Micro** | **1 Coin** | Single allocation | 15% | Guarantees orders remain strictly above the **IDR 10,000** exchange floor. |
| **IDR 100k - 1M** | **Small** | **2 - 3 Coins** | 28% - 42.5% | 15% | Balanced split between core assets and top momentum setups. |
| **IDR 1M - 10M** | **Medium** | **3 - 5 Coins** | 17% - 28% | 15% - 20% | Full multi-coin diversification with deep orderbook slippage budgeting. |
| **> IDR 10,000,000** | **Large** | **5 Coins** | Risk-adjusted | 20% - 25% | Prioritizes deep liquidity pools and EMA21 structural support pullbacks. |

> 💡 **Instant Remote Adjustment:** Capital limits and risk profiles can be updated on the fly via the Web Dashboard or by messaging the bot: `/modal 500000 seimbang` (Indonesian shorthand such as `500k` or `1.5jt` is accepted).

---

## 🎯 Investment Risk Profiles

Tailor the bot's execution style with a single click in **Settings &rarr; Risk Profile**:

![3 Investment Risk Profiles](docs/assets/risk-profiles.svg)

| Strategy Parameter | 🛡️ Conservative | ⚖️ Moderate *(Recommended)* | 🚀 Aggressive |
| :--- | :--- | :--- | :--- |
| **Take Profit Target 1 (TP1)** | 3.5% | 5.0% | 7.5% |
| **Take Profit Target 2 (TP2)** | 7.0% | 10.0% | 15.0% |
| **Trailing Stop Ratchet** | 1.8% (Tight) | 2.5% (Balanced) | 3.5% (Wide) |
| **Simultaneous Positions** | Maximum 2 Coins (3 when capital ≥ Rp 5.000.000) | Maximum 3 Coins | 2–3 Coins by capital tier (3 when ≥ Rp 500.000) |
| **Asset Universe** | Tier 1 Blue-Chips (BTC, ETH, SOL) | Top 20 Indodax Liquidity | Momentum Breakouts & New Listings |
| **Daily Circuit Breaker** | 3.0% Maximum Loss | 5.0% Maximum Loss | 8.0% Maximum Loss |
| **Slippage Tolerance** | 0.5% | 0.8% | 1.2% |
| **Target Trader Persona** | Capital preservation & beginners | Standard balanced crypto traders | High-conviction traders in Bull Runs |

---

## 🔄 Simulation Mode (Paper) vs Real Mode (Live Indodax)

### 1. Demo Mode (Paper Trading) — Zero Financial Risk
- Pre-loaded with **IDR 10,000,000** in virtual trading capital.
- Streams real live market prices directly from the Indodax exchange.
- Accurately simulates buy orders, exchange taker fees (configurable via `trading_fee_percent`, default 0.3322% all-in for Indodax IDR market orders), orderbook slippage, and trailing stop exits.
- Recommended for testing and calibration for 3 to 7 days before funding real capital.

### 2. Live Mode (Real Indodax Funds) — Real Capital Execution
- Direct integration with your Indodax account via API Key and Secret Key.
- Protected by an interactive **3-Point Safety Confirmation Modal** before activation.
- Orders are executed live on the official Indodax orderbook.
- Includes a **Panic Sell Button (< 1 Second)** to immediately liquidate all open crypto assets to IDR in global emergencies.

**Live safety behavior (read before funding):**
- **Every order is fill-verified.** The engine polls the exchange order status after submission, records the actual executed quantity and average price, and handles partial fills. If a fill cannot be confirmed, the order is cancelled where possible and the position is left for review instead of being marked closed based on an assumption.
- **Startup reconciliation runs automatically.** Before trading resumes, local open positions are compared against real balances and open exchange orders. Mismatches (missing balance, unexpected open order, stale exit claim) are reported, and auto-trading stays paused until you review them.
- **Auto-resume is opt-in and fail-safe.** Auto-trading is always paused when the server restarts. It only resumes automatically when `auto_resume_on_startup=1` is set **and** reconciliation reports a safe state; otherwise it remains paused and requires manual activation.
- **Deadman switch scope is limited.** The Indodax deadman switch (`countdownCancelAll`) can only cancel **open exchange orders** after the process stops pinging. It does **not** liquidate spot holdings and it does **not** place a stop-loss.
- **No native exchange stop-loss exists on the Indodax API.** This is an exchange limitation, verified against the official Trade API v2 docs: `POST /api/v2/order` explicitly rejects stop orders (`STOP_LIMIT` is not a supported type) — only `LIMIT` and `MARKET` can be placed. Consequently, trailing stops, take-profits, and the circuit breaker are enforced by the local engine and only run while this process is online. The engine mitigates this with: **floored limit exits** (live exits first place a `LIMIT SELL` at a price floor so they can never fill below it, then market-sell any remainder — see `exit_floor_limit_enabled`), a **max-drawdown kill switch** with equity floor and configurable de-risk (`halt`/`halve`/`flatten`), an **exit guard** that refuses to open new live positions while any live position lacks a guaranteed exit plan (`require_protective_orders`), a **shutdown warning** whenever live positions remain open, and **order-intent journaling** with `clientOrderId` crash recovery. For unattended live trading, run on an always-on VPS with automatic restart (systemd/Docker restart policy) so engine downtime stays in the seconds-to-minutes range.

---

## 📱 Unified Remote Bots: WhatsApp & Telegram

Remote control and automated notification feeds are unified inside a **single central control panel** in the **Bots** tab:

![Unified Bots Control Panel](docs/assets/unified-bots.svg)

### Notification Channel Modes:
1. 🚀 **Both Channels (WhatsApp + Telegram):** Dispatches buy/sell alerts, daily profit summaries, and emergency alerts simultaneously to both apps *(Recommended)*.
2. 🟢 **WhatsApp Only:** Operates exclusively via the embedded Baileys WhatsApp Web client.
3. 🔵 **Telegram Only:** Operates via the official Telegram Bot API (Token & Chat ID).
4. 🛑 **Disable All Bots:** Silent mode; completely pauses automated notification broadcasts.

### Remote Bot Command Reference:
| Command | Permission | Description |
| :--- | :---: | :--- |
| `/status` | Public / Admin | Displays bot operational health, exchange connectivity, and open positions. |
| `/pnl` (alias `/profit`) | Public / Admin | Reports today's realized profit, win rate, and total net performance. |
| `/coins` | Public / Admin | Lists top 5 trending gainers on Indodax. |
| `/modal <amount> [profile]` | **Admin Only** | Dynamically reconfigures trading capital and risk profile from your phone (`k`/`jt` shorthand supported, e.g. `/modal 500k agresif`). |
| `/start` | **Admin Only** | Resumes or enables autonomous spot trading remotely. |
| `/stop` | **Admin Only** | Pauses automated entry signal execution. |
| `/panic` | **Admin Only** | Triggers an immediate sub-second market liquidation of all open coins to IDR. |
| `/balance` | **Admin Only** | Checks available IDR cash balance and total portfolio valuation. |
| `/admin <token>` | Verification | Authorizes the sender's phone number as a registered Administrator using the access token. |
| `/help` | Public / Admin | Displays the full interactive command glossary. |

### Conversational AI Actions & Two-Step Confirmation

The WhatsApp assistant can also execute actions from free-form chat (e.g., *"beli btc 100000"*, *"matikan bot"*). Destructive actions — **RESUME_AUTOTRADING, SET_RISK_PROFILE, SET_TRADING_MODE, BUY_COIN, SELL_COIN, PANIC_SELL** — are never executed directly from the model's output:

1. The bot replies with a **6-digit confirmation code** (valid for 5 minutes).
2. The admin must reply with that exact code. The code check runs **outside the LLM**, so the model can never bypass or fabricate the second factor.
3. A wrong, expired, or missing code cancels the pending action; only `STOP_AUTOTRADING` (pausing is protective) executes immediately.

---

## 🔒 Zero-Trust Security & Resilient Infrastructure

1. **Restricted Indodax API Permissions:**
   - The bot strictly requires only `View (Read)` and `Trading (Trade)` permissions.
   - ❌ **NEVER ENABLE WITHDRAW PERMISSIONS!** Without withdrawal privileges, your funds remain securely locked inside Indodax.
2. **Zero-Trust Admin Access Token (Fail-Closed):**
   - Administrative endpoints, dashboard actions, and WebSocket admin channels require a 32-character hexadecimal token.
   - Authentication checks utilize `crypto.timingSafeEqual` to guard against side-channel timing attacks.
   - If no token is configured, admin access is denied rather than opened. Visitors without valid credentials are restricted to View-Only mode, which now hides balances, positions, trade history, WhatsApp QR/identity, and provider quota details.
   - The token is printed to the console only when the server runs on an interactive TTY. In headless/Docker logs, retrieve it locally with `npm run admin:token` (only someone with access to the server data directory can run this).
3. **Encryption at Rest ([`secrets.ts`](src/services/security/secrets.ts)):**
   - Indodax API key/secret, admin token, Telegram/ngrok tokens, WhatsApp/Telegram identifiers, and AI provider `api_keys`/OAuth tokens are encrypted with **AES-256-GCM** before being written to SQLite. Legacy plaintext rows are migrated automatically on startup.
   - The key lives at `data/.encryption-key` (mode `0600`) or comes from `AI_TRADING_ENCRYPTION_KEY`. **Back up the key separately from the database**; a copied database cannot be decrypted without it.
4. **Automated Token Rotation Service ([`tokenRotation.ts`](src/services/auth/tokenRotation.ts)):**
   - Configurable rotation policies: *Fixed*, *Rotate on Startup*, or *Periodic Schedules (e.g., every 1h, 24h)*.
5. **Isolated SQLite Database & Auto-Backup ([`backupService.ts`](src/services/backup/backupService.ts)):**
   - Runs in **WAL (Write-Ahead Logging)** mode for crash resilience and concurrency.
   - Automated timestamped database snapshots are preserved in `backups/` and can be downloaded from the Reports UI.
6. **Official Audit PDF & CSV Export:**
   - Enables one-click exports of trade histories to formatted spreadsheet **CSV** files (generated server-side by the reporting service) and audit-ready **PDF Reports** (assembled client-side in the browser via jsPDF).
7. **Conversational AI Action Guard:**
   - Destructive actions requested through WhatsApp free-form chat require a 6-digit two-step confirmation code that is consumed outside the LLM, with a 5-minute expiry (see [Remote Bots](#-unified-remote-bots-whatsapp--telegram)).

---

## 🚀 Quickstart Guide: 1-Click Launchers

### System Requirements:
- **Node.js:** Version **22.12.0** or newer ([Download Node.js](https://nodejs.org/)).
- **Operating System:** Windows 10/11, macOS, or Linux (Ubuntu, Debian, CentOS).
- **Network:** Stable internet connection for real-time WebSocket and REST feeds.

### Running with 1-Click Launchers:

#### 🪟 Windows:
1. Extract or clone this repository to your local drive.
2. Double-click **`start.bat`** (or right-click `start.ps1` and select *Run with PowerShell*).
3. The launcher will automatically verify dependencies, compile the application, and launch your browser at:
   ```
   http://localhost:3001
   ```

#### 🐧 Linux / macOS:
1. Open a terminal in the project directory.
2. Grant execution permissions and start the service:
   ```bash
   chmod +x start.sh
   ./start.sh
   ```
3. Open your browser and navigate to `http://localhost:3001`.

---

## 🐳 Production Deployment via Docker

To run the terminal headlessly on a Linux cloud VPS:

```bash
# 1. Copy the environment template
cp .env.example .env

# 2. Build and launch the container in detached mode
docker compose up -d --build

# 3. View live server logs (the admin token is intentionally not printed to non-interactive logs)
docker compose logs -f

# 4. Retrieve the admin token from inside the container
docker compose exec ai-trading npm run admin:token
```
Access the dashboard through your browser at `http://YOUR-SERVER-IP:3001`.

The image ships with a `HEALTHCHECK` (polls `/api/system/health`), and `docker-compose.yml` uses `restart: unless-stopped`, so a crashed process restarts automatically — keep that behavior, because exit protection lives in this process (see the [Institutional Protection Layer](#institutional-protection-layer-wraps-the-9-gates)).

### Systemd Deployment (bare-metal VPS)

Prefer running without Docker? A ready-made unit with `Restart=always` ships in [`deploy/ai-trading.service`](deploy/ai-trading.service):

```bash
sudo cp deploy/ai-trading.service /etc/systemd/system/  # edit User/WorkingDirectory first
sudo systemctl daemon-reload && sudo systemctl enable --now ai-trading
```

### Observability Environment Variables

Set these in `.env` (see `.env.example`) for professional operations:

| Variable | Effect |
| :--- | :--- |
| `AI_TRADING_STRUCTURED_LOGS=1` | Routes all console output through pino (structured JSON); plain console stays the default otherwise. |
| `LOG_LEVEL` | `error` \| `warn` \| `info` \| `debug` (default `info`). |
| `LOG_FILE` | Additionally appends logs to a file (use logrotate for rotation). |
| `WATCHDOG_URL` | External uptime ping (healthchecks.io-compatible). Pinged once per minute after successful engine loops; if the ping stops, the monitor alerts you that the bot stopped protecting positions. |
| `AI_TRADING_ENCRYPTION_KEY` | Optional 32-byte AES-256-GCM key (else generated at `data/.encryption-key`). |

Scrape `GET /api/metrics` with Prometheus for positions by mode, unprotected live positions, drawdown/circuit-breaker state, pending order intents, loop duration, and market WebSocket status — or read the same state from the Dashboard protection card.

---

## 📂 Project Directory Architecture

![Project Directory Architecture](docs/assets/project-structure.svg)

| Directory / Module | Path | Primary Role & Responsibilities |
| :--- | :--- | :--- |
| **Frontend Web (PWA)** | `client/` | React 19, Tailwind CSS, Vite, Lucide Icons, service worker, & PWA manifest. |
| **Internationalization** | `client/src/i18n/` | Bilingual dictionaries (`translations.ts`), context provider (`LanguageContext.tsx`), and switchers. |
| **UI Components** | `client/src/components/` | `DashboardView`, `BotsView`, `EntryDiagnosticsSection`, `SetupWizard`, `LiveReadinessCard`, `QuotaView`, `ReportView`. |
| **Documentation & Assets** | `docs/` | `docs/assets/` (Vector SVGs), `PANDUAN_PENGGUNA.md` (Indonesian User Guide), and audit logs. |
| **Quantitative Signals** | `src/services/signals/` | Deterministic Section 9 (`features`, `lexicon`, `threat`, `regime`, `scorer`). |
| **Trading & Risk Guard** | `src/services/trading/` | 9 Risk Defense Gates (`riskGuard`), institutional protection layer (drawdown kill switch, exit guard, floored exits), order-intent journal, trailing ratchet, & capital auto-set engine. |
| **AI Swarm Intelligence** | `src/services/agents/` | 10 specialized intelligence analysts, read-only Portfolio Advisor, SQLite outbox Blackboard bus, & SHA-256 deduplication. |
| **AI Prompt Registry** | `src/services/ai/prompts.ts` | Versioned prompts for every LLM role with per-call version audit trail (`ai_call_logs.prompt_version`) and the `npm run ai:eval` golden-scenario harness. |
| **Research & Backtesting** | `src/services/backtest/`, `src/services/candles/`, `scripts/` | Single-symbol & portfolio backtest engines (concurrent slots, zero-lookahead stops, TP1+TP2 scale-outs) that prefer the local SQLite candle cache and tag each result `dataSource: 'cache'` or `'exchange'`, plus grid-search optimizer with walk-forward analysis. |
| **Indodax Market Adapter** | `src/services/indodax/` | REST v2 wrapper & WebSocket client with 6-second in-flight promise deduplication, retry/backoff on private endpoints, & write-through candle persistence. |
| **Remote Bot Services** | `src/services/whatsapp/` & `telegram/` | Baileys WhatsApp Multi-Device engine & Telegram Official Bot API integration. |
| **Security & Auth** | `src/services/auth/` | Token rotation manager & constant-time `timingSafeEqual` authentication verification. |
| **Database & Snapshots** | `src/db/` & `src/services/backup/` | SQLite WAL engine, relational schemas, migrations, and automated snapshot backup services. |
| **REST API Server** | `src/api/` & `src/server.ts` | Express REST routes, exchange webhooks, zero-trust token protection middleware, `/api/metrics` Prometheus exposition, & lifecycle hooks. |
| **Automated Test Suite** | `tests/` | 303 unit and integration tests across 70 suites, covering critical quantitative algorithms, execution safety, institutional protection, API security, and risk barriers. |
| **Process Supervision** | `deploy/ai-trading.service` | systemd unit with `Restart=always` for always-on VPS operation (seconds-to-minutes downtime). |
| **1-Click Launchers** | `start.bat`, `start.ps1`, `start.sh` | Automated zero-configuration launchers for Windows, Linux, and macOS. |
| **Containerization** | `Dockerfile`, `docker-compose.yml` | Multi-stage production Docker container configuration for continuous 24/7 cloud hosting. |

> [!NOTE]
> **Unified Full-Stack Architecture:**
> - **`src/` (Backend Core):** Executes the deterministic Section 9 signal pipeline, applies the 9 risk gates, coordinates the AI swarm, manages SQLite persistence, and drives remote WhatsApp/Telegram bots.
> - **`client/` (Frontend Dashboard):** The interactive web console available at `http://localhost:3001` — presenting candlestick charts, order controls, market scanners, quota monitors, and live gate diagnostics.
> - Both modules are bundled and served harmoniously from a single consolidated server process via the 1-click launchers (`start.bat` / `start.sh`).

---

## 🧪 Quality Assurance & Test Suite

All critical business logic, token security routines, quantitative indicators, and risk defense gates are safeguarded by **303 unit & integration tests** located in [`tests/`](tests/):

```bash
# Execute the entire automated test suite:
npm test
```

### Verified Test Suite Breakdown:
```
✔ AI failure policy (paper fallback vs. live fail-closed)
✔ Subagent source honesty & extra RSS feed validation
✔ API security, observer redaction, admin token rotation & query-token rejection
✔ Secrets at-rest encryption & fail-closed admin authentication
✔ Capital Allocation & Auto-Set Engine
✔ Quantitative indicators (RSI, EMA, True ATR) & spread mechanics
✔ Live reconciliation, fill handling, stale exit claims & auto-resume safety
✔ New-coin registry persistence across restarts
✔ Fee-aware PnL, mode-scoped equity & circuit breaker fail-closed behavior
✔ Concurrent position exit protection (full exit & partial take-profit)
✔ Performance reporting, CSV export, database backup & Telegram notifier
✔ Section 9 lexicon, scoped threat blocker, BTC regime & blue-chip scoring
✔ Pure Risk Guard execution pipeline (Gates 1–9)
✔ Swarm deduplication, blackboard outbox & MarketAdapter abstraction
✔ Signatures, slippage, quantity precision, trailing stops & fail-closed AI parsing
✔ CORS hardening, RSS sanitization, sell-failure protection & admin middleware
✔ Risk profiles, self-learning memory, backtest engine & A/B ghost positions
✔ Model discovery, WhatsApp LID authorization & conversational AI actions
✔ Circuit breaker resilience & decoupled trailing ratchet
✔ Institutional protection: floored exits, dust handling, drawdown kill switch & de-risk modes
✔ Order-intent journal crash recovery & safety-status telemetry
✔ Portfolio backtest simulator (concurrent slots, shared cash, zero-lookahead stops)
✔ Composite momentum entry scoring, TP2 scale-out & cache-first backtests
✔ Candle store round-trip & new indicators (MACD, Bollinger width, volume z-score)
✔ Prompt version invariants & AI verdict parser golden cases
---------------------------------------------------------------------------------
ℹ tests 306 | suites 71 | pass 306 | fail 0 | cancelled 0
---------------------------------------------------------------------------------
```

Coverage on critical modules (`riskGuard`, `secrets`, indicators, signals) is enforced at **80% lines** — currently ~89.9%:

```bash
npm run test:coverage            # full report (lcov + text)
npm run test:coverage:critical   # hard 80% gate on critical modules
```

The client ships its own vitest suite (`npm test` inside `client/`, 25 tests) covering token storage, connection-state events, live-readiness scoring, and EN/ID translation parity.

Production Build Verification:
```bash
npm run build
# Executes TypeScript strict typechecks and Vite client bundle generation (100% clean)
```

Continuous Integration:
```bash
# .github/workflows/ci.yml runs on every push/PR:
npm ci && npm --prefix client ci
npm run typecheck
npm test                                 # backend suite (306 tests)
npm run test:coverage:critical           # 80% coverage gate on critical modules
npm --prefix client test                 # client vitest suite
npm --prefix client run build
```

---

## ❓ Frequently Asked Questions (FAQ) & Troubleshooting

#### Q1: Why hasn't the bot entered any trades today?
> **A:** This is clear evidence that the **9 Risk Gates** are actively protecting your capital. The bot never enters trades blindly. If the bid-ask spread is excessively wide, Bitcoin is trending downward, or target coins are in extreme overbought territory, entries are purposely withheld. You can view the exact evaluation diagnostics in the **Entry Diagnostics Section** on the dashboard.

#### Q2: Does my computer need to remain powered on 24/7?
> **A:** Yes for live trading. The Indodax Trade API v2 does not support placing stop orders (verified against the official docs), so all exit logic (trailing stop, take-profit, circuit breaker, drawdown kill switch) runs in this process. If the host goes down, open positions lose their automated exits — the engine sends a shutdown warning if live positions are open, and the deadman switch cancels any resting orders. Deploy to an always-on cloud VPS with a process supervisor (Docker `restart: unless-stopped` or the provided systemd unit) so downtime is seconds-to-minutes; on restart, startup reconciliation plus `clientOrderId`-based order-intent recovery verifies the exchange state before anything resumes, and auto-trading stays paused until that passes (or the opt-in `auto_resume_on_startup` policy allows it).

#### Q3: Is it safe to enter my Indodax API keys?
> **A:** Yes. API keys are stored only in your local SQLite database on your own machine, encrypted with AES-256-GCM (key in `data/.encryption-key` or `AI_TRADING_ENCRYPTION_KEY`), and are never transmitted to external cloud servers. Keep the encryption key backed up separately from the database. Furthermore, you must **only grant View and Trade permissions**—never check the Withdraw permission. Without withdrawal rights, your funds cannot be transferred out of Indodax.

#### Q4: How do I recover my Admin Access Token if the terminal window was closed?
> **A:** On an interactive terminal, restart the app with `start.bat` or `./start.sh`; the token is printed at startup. For headless/Docker runs it is intentionally omitted from logs—run `npm run admin:token` on the server (or `docker compose exec ai-trading npm run admin:token`) to print it locally.

#### Q5: How do I switch the bot's language?
> **A:** Click the **Language Switcher** pill located in the top-right header (or navigate to **Settings &rarr; Language Preference**) and toggle between **English (default)** and **Bahasa Indonesia**.

---

## ⚠️ Financial Risk Disclaimer

1. **Market Volatility:** Cryptocurrency assets are subject to extreme price volatility. Although this software incorporates 9 risk defense gates and automated trailing stops, no algorithmic system can guarantee 100% profitability across all unforeseen market conditions.
2. **Mandatory Testing:** Users are strongly advised to thoroughly test strategies in **Demo Mode (Paper Trading)** for a minimum of 3 to 7 days before risking real funds.
3. **Risk Capital:** Only deploy discretionary risk capital that you can comfortably afford to lose. Never trade with essential living funds.
4. **User Responsibility:** The developers of this terminal accept no liability for individual trading decisions, losses incurred due to network failures, or negligence in securing exchange API credentials.

---

<div align="center">

**AI TRADING TERMINAL — QUANTITATIVE PRECISION &amp; ENTERPRISE-GRADE SECURITY**  
*Preserving Capital, Removing Emotion, Capturing Opportunity.*

⭐ **Star this repository on GitHub if it enhances your trading journey!** ⭐

</div>
