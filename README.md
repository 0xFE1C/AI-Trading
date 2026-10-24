# 🚀 AI Trading Terminal — Autonomous Spot Trading & Multi-Agent Swarm for Indodax

![AI Trading Terminal Banner](docs/assets/system-banner.svg)

<div align="center">

[![Language: English](https://img.shields.io/badge/Language-English-38bdf8?style=for-the-badge)](README.md)
[![Dokumentasi: Bahasa Indonesia](https://img.shields.io/badge/Dokumentasi-Bahasa%20Indonesia-10b981?style=for-the-badge)](docs/PANDUAN_PENGGUNA.md)
[![Tests](https://img.shields.io/badge/Unit%20Tests-95%2F95%20PASS%20(100%25)-10b981?style=for-the-badge&logo=jest)](tests/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20Strict-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2018.0.0-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18%20%2B%20Vite%20%2B%20Tailwind-61dafb?style=for-the-badge&logo=react)](client/)
[![Indodax](https://img.shields.io/badge/Exchange-Indodax%20API%20v2-0284c7?style=for-the-badge)](https://indodax.com)
[![Bots](https://img.shields.io/badge/Remote%20Bots-WhatsApp%20%2B%20Telegram-25d366?style=for-the-badge&logo=whatsapp)](client/src/components/BotsView.tsx)
[![Security](https://img.shields.io/badge/Security-Zero--Trust%20Token-e11d48?style=for-the-badge)](src/services/auth/)
[![License](https://img.shields.io/badge/License-Proprietary%20%2F%20Commercial-7c3aed?style=for-the-badge)](LICENSE)

**Unified Autonomous Cryptocurrency Spot Trading Platform for Indodax Exchange**  
*Unifying High-Speed Deterministic Section 9 Signals (0 Token Cost), 10 Specialized AI Research Sub-Agents, a 9-Gate Pure Risk Guard Pipeline, and Unified Remote Bots via WhatsApp &amp; Telegram.*

[Key Features](#-key-features--advantages) • [System Architecture](#-end-to-end-system-architecture) • [9 Risk Gates Pipeline](#-pure-risk-guard-9-sequential-defense-gates) • [AI Swarm Research](#-multi-agent-ai-research-swarm-10-specialized-sub-agents) • [Quickstart Guide](#-quickstart-guide-1-click-launchers) • [Remote Bots](#-unified-remote-bots-whatsapp--telegram) • [Capital Auto-Set](#-intelligent-capital-allocation-auto-set-engine)

</div>

---

## 📑 Table of Contents

- [1. Executive Summary & Design Philosophy](#-executive-summary--design-philosophy)
- [2. Key Features & Advantages](#-key-features--advantages)
- [3. End-to-End System Architecture](#-end-to-end-system-architecture)
- [4. Deterministic Section 9 Signal Engine](#-deterministic-section-9-signal-engine)
- [5. Pure Risk Guard: 9 Sequential Defense Gates](#-pure-risk-guard-9-sequential-defense-gates)
- [6. Multi-Agent AI Research Swarm (10 Specialized Sub-Agents)](#-multi-agent-ai-research-swarm-10-specialized-sub-agents)
- [7. Counterfactual A/B Testing & Ghost Position Engine](#-counterfactual-ab-testing--ghost-position-engine)
- [8. Intelligent Capital Allocation (Auto-Set Engine)](#-intelligent-capital-allocation-auto-set-engine)
- [9. Investment Risk Profiles (Conservative, Balanced, Aggressive)](#-investment-risk-profiles)
- [10. Simulation Mode (Paper) vs Real Mode (Live Indodax)](#-simulation-mode-paper-vs-real-mode-live-indodax)
- [11. Unified Remote Bots: WhatsApp & Telegram](#-unified-remote-bots-whatsapp--telegram)
- [12. Zero-Trust Security & Resilient Infrastructure](#-zero-trust-security--resilient-infrastructure)
- [13. Quickstart Guide: 1-Click Launchers](#-quickstart-guide-1-click-launchers)
- [14. Production Deployment via Docker](#-production-deployment-via-docker)
- [15. Project Directory Architecture](#-project-directory-architecture)
- [16. Quality Assurance & Test Suite (95/95 Passing)](#-quality-assurance--test-suite)
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
   - **AI Research Swarm:** Operates in the background analyzing macro narratives, GitHub developer commits, and protocol exploit vectors using SHA-256 context deduplication (**saving > 90% of token costs**).
2. **9 Pure Risk Defense Gates:** Every prospective buy signal **must pass 100% of all 9 sequential safety gates** before any order is submitted to Indodax.
3. **Mathematical Trailing Stop Ratchet:** As an asset's market price increases, profit protection thresholds are monotonically ratcheted upward and **locked one-way**. If the trend abruptly reverses, the bot immediately locks in accumulated gains.
4. **Zero-Configuration 1-Click Launchers:** Pre-packaged scripts for Windows (`start.bat`), PowerShell (`start.ps1`), and Linux/macOS (`start.sh`), accompanied by full bidirectional remote control via WhatsApp and Telegram.

---

## ✨ Key Features & Advantages

| Category | Highlighted Capability | Architectural Impact & Benefits |
| :--- | :--- | :--- |
| **Speed & Efficiency** | **Section 9 Engine** | Pure mathematical signal pipeline, sub-millisecond execution, 0 token expenditure. |
| **Market Intelligence** | **10 AI Sub-Agents** | Autonomous swarm scanning global crypto news, Twitter/X, Reddit, on-chain whale wallets, and smart contract exploits. |
| **Capital Defense** | **9 Risk Defense Gates** | Daily circuit breaker, bid-ask spread trap filter, anti-FOMO RSI guard, and BTC flash crash veto. |
| **Financial Sizing** | **Capital Auto-Set** | Intelligent dynamic position sizing scaled to available balance (from micro IDR 10,000 up to tens of millions). |
| **Profit Locking** | **Trailing Ratchet** | Dynamic monotonic stop-loss escalation prevents open profits from turning into catastrophic losses. |
| **UI Observability** | **Entry Diagnostics** | Transparent live observability table explaining why coins were approved or vetoed at each gate. |
| **Remote Control** | **Unified Bots View** | Centralized bot management for WhatsApp & Telegram with 4 modes: *Both*, *WhatsApp Only*, *Telegram Only*, or *Disabled*. |
| **Zero-Trust Security** | **Admin Access Token** | Constant-time token verification (`crypto.timingSafeEqual`) with automated background rotation schedules. |
| **AI Validation** | **A/B Ghost Positions** | Real-time counterfactual simulation benchmarking AI vetoes against market prices to compute empirical AI Alpha. |
| **Internationalization** | **Multi-Language (i18n)** | Full bilingual English (default) and Indonesian support across UI, tables, and reporting. |
| **Portability** | **PWA & Offline Shell** | Installable Progressive Web App (PWA) with responsive mobile layouts and modern dark mode styling. |

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
        BinanceFeed[Global Price Feed Binance/Bybit] --> ArbitrageDelta[Global Arbitrage Delta Engine]
    end

    InFlightCache --> Sec9
    BatchTicker --> Sec9
    ArbitrageDelta --> Sec9

    subgraph Sec9 [2. Deterministic Section 9 Engine - Zero Token]
        Feat[features.ts: RSI14, EMA21, True ATR, Depth Imbalance]
        Lex[lexicon.ts: Bilingual ID/EN Financial Lexicon + Tanh Scaling]
        Threat[threat.ts: Scoped Threat Blocker 30m Freshness]
        Regime[regime.ts: BTC Macro Window 1h & 4h Drop Returns]
        Scorer[scorer.ts: Blue-Chip Pullback & Momentum Scoring]
    end

    Sec9 --> BlackboardBus

    subgraph AIResearch [3. AI Swarm Research - 10 Specialized Sub-Agents]
        BlackboardBus[Blackboard Event Bus SQLite Outbox]
        NewsAgent[Global News & Regulatory]
        SocialAgent[Reddit & Twitter/X Radar]
        OnChainAgent[Whale Tracker & Protocol Exploit]
        ListingAgent[New Indodax Listing Detector]
        DedupEngine[SHA256 Context Dedup - >90% Token Savings]
        AntigravityAPI[Antigravity Live Model API: Gemini 3.8 / Claude 4.6]
        
        BlackboardBus --> DedupEngine --> AntigravityAPI
        AntigravityAPI --> NewsAgent & SocialAgent & OnChainAgent & ListingAgent
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
    end

    subgraph UI_Bots [6. Observability, Bots & Client UI]
        SQLiteDB[(SQLite Database WAL Mode)]
        UnifiedBots[Unified Bots: WhatsApp Baileys + Telegram Bot API]
        ReactUI[React 18 Dashboard + Tailwind CSS + PWA]
        PDFReport[Executive PDF & Tax Report Generator]
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
    G7 -- Depth Slippage &gt; 0.5% --> V7[VETO: Orderbook Slippage Exceeded]
    G7 -- Passed --> G8{Gate 8: Tech & Setup Score?}
    G8 -- Score &lt; 70 --> V8[VETO: Setup Score Sub-Threshold]
    G8 -- Passed --> G9{Gate 9: Min IDR 10,000 Floor?}
    G9 -- Order &lt; 10k IDR --> V9[VETO: Below Indodax Minimum Size]
    G9 -- Passed --> ACC[✓ 100% PASSED: ORDER DISPATCHED TO EXCHANGE]
```

### Gate-by-Gate Specification:
1. **Gate 1 — Daily Circuit Breaker:** Sums total realized losses for the day. If losses exceed the risk profile limit (e.g., 5%), auto-trading is immediately halted for 24 hours. Employs decoupled state ratcheting to prevent execution deadlocks.
2. **Gate 2 — Portfolio Exposure Limit:** Enforces concurrency limits on active positions (1 to 5 coins based on risk profile and balance tier).
3. **Gate 3 — BTC Macro Regime:** Vetoes all buy entries across the board if Bitcoin experiences an acute flash dump (> 3% drop in 1 hour or > 5% in 4 hours).
4. **Gate 4 — Spread Trap Guard:** Rejects assets with excessive bid-ask spreads (> 0.8% - 1.5%), safeguarding capital against illiquid traps.
5. **Gate 5 — RSI Guard (Anti-Top FOMO):** Prevents entering tokens whose 14-period RSI is already overbought (> 70-75).
6. **Gate 6 — Scoped Threat Scoping:** Confirms the specific target coin has had zero exploit disclosures, contract hacks, or delisting announcements within the past 30 minutes.
7. **Gate 7 — Slippage Budget:** Simulates full order execution against the top 5 levels of the Indodax orderbook, ensuring effective slippage does not exceed 0.5%.
8. **Gate 8 — Technical Score Threshold:** Mandates that the composite technical setup score meets or exceeds the required threshold (default 70/100).
9. **Gate 9 — Indodax Minimum Floor:** Verifies that after subtracting cash reserves, the net order value is **at least IDR 10,000**, fully satisfying Indodax exchange regulations.

---

## 🤖 Multi-Agent AI Research Swarm (10 Specialized Sub-Agents)

Located in the **AI Research** tab, 10 specialized intelligence analysts in [`src/services/agents/`](src/services/agents/) collaborate autonomously via an asynchronous **Blackboard Event Bus**:

![AI Swarm Research](docs/assets/ai-swarm-diagram.svg)

1. **Global News Radar:** Aggregates and synthesizes breaking reports from international outlets (CoinDesk, Cointelegraph, Bloomberg Crypto, Decrypt).
2. **Tech & Ecosystem Analyst:** Monitors developer momentum, GitHub repository commits, forks, and official mainnet roadmap upgrades.
3. **Social Community Radar:** Tracks discussions, sentiment polarity, and retail enthusiasm across major crypto subreddits.
4. **Twitter / X Viral Radar:** Detects discussion volume spikes and influencer sentiment velocity.
5. **Indodax Listing Radar:** Identifies newly announced or recently listed trading pairs on Indodax within seconds.
6. **Momentum Hunter:** Isolates sudden volume breakout anomalies and structural liquidity surges.
7. **Exploit & Security Radar:** Continuously audits smart contract security alerts, vulnerability disclosures, and exploit reports.
8. **Macro & Regulatory Analyst:** Monitors central bank policy interest rate decisions (The Fed), CPI inflation numbers, and Bappebti regulatory updates.
9. **Whale On-Chain Tracker:** Detects large-scale exchange inflows, wallet outflows, and institutional accumulation footprints.
10. **Global Delta Analyst:** Benchmarks Indodax pricing disparities against global exchanges (Binance, Bybit) to capture price realignment trends.

### Token Optimization & Degraded Resilience
- **SHA-256 Fingerprint Deduplication:** Generates cryptographic hashes of news headlines and market state. If the context has not fundamentally changed, AI calls are **automatically skipped** (`skipped_dedup`), reducing token consumption by **> 90%**.
- **Compact Payload Formatting:** System prompts are minimized into single-line JSON structures with redundant whitespace eliminated.
- **Fail-Safe Degraded Mode:** If LLM providers experience network outages or quota exhaustion, the engine seamlessly falls back to pure deterministic mode, ensuring trading operations never freeze.

---

## 🔬 Counterfactual A/B Testing & Ghost Position Engine

How do you verify whether AI vetoes genuinely protect capital rather than discard lucrative opportunities?

AI Trading Terminal includes a built-in **A/B Counterfactual Testing Engine**:
- Whenever the AI swarm or risk gates veto a prospective buy signal, a virtual **Ghost Position** is registered in the database table [`ghost_positions`](src/db/index.ts).
- The system monitors this shadow position against real-time Indodax market prices as if the trade had actually executed.
- Outcomes are categorized into empirical performance groups:
  - 🛡️ **`BULLET_DODGED`:** The vetoed trade subsequently collapsed or hit the virtual stop-loss in the real market, proving the AI saved your money!
  - ⚠️ **`MISSED_OPPORTUNITY`:** The vetoed trade subsequently met the take-profit target.
  - ⚖️ **`NEUTRAL`:** The vetoed trade broke even within the tracking window.
- The dashboard highlights the **Empirical AI Alpha**: the exact net percentage of portfolio capital saved by artificial intelligence.

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

> 💡 **Instant Remote Adjustment:** Capital limits and risk profiles can be updated on the fly via the Web Dashboard or by messaging the bot: `/capital 500000 moderate`.

---

## 🎯 Investment Risk Profiles

Tailor the bot's execution style with a single click in **Settings &rarr; Risk Profile**:

![3 Investment Risk Profiles](docs/assets/risk-profiles.svg)

| Strategy Parameter | 🛡️ Conservative | ⚖️ Moderate *(Recommended)* | 🚀 Aggressive |
| :--- | :--- | :--- | :--- |
| **Take Profit Target (TP)** | 3.5% | 5.0% | 7.5% |
| **Trailing Stop Ratchet** | 1.8% (Tight) | 2.5% (Balanced) | 3.5% (Wide) |
| **Simultaneous Positions** | Maximum 2 Coins | Maximum 3 Coins | Maximum 5 Coins |
| **Asset Universe** | Tier 1 Blue-Chips (BTC, ETH, SOL) | Top 20 Indodax Liquidity | Momentum Breakouts & New Listings |
| **Daily Circuit Breaker** | 3.0% Maximum Loss | 5.0% Maximum Loss | 7.0% Maximum Loss |
| **Target Trader Persona** | Capital preservation & beginners | Standard balanced crypto traders | High-conviction traders in Bull Runs |

---

## 🔄 Simulation Mode (Paper) vs Real Mode (Live Indodax)

### 1. Demo Mode (Paper Trading) — Zero Financial Risk
- Pre-loaded with **IDR 10,000,000** in virtual trading capital.
- Streams real live market prices directly from the Indodax exchange.
- Accurately simulates buy orders, exchange maker/taker fees (0.51%), orderbook slippage, and trailing stop exits.
- Recommended for testing and calibration for 3 to 7 days before funding real capital.

### 2. Live Mode (Real Indodax Funds) — Real Capital Execution
- Direct integration with your Indodax account via API Key and Secret Key.
- Protected by an interactive **3-Point Safety Confirmation Modal** before activation.
- Orders are executed live on the official Indodax orderbook.
- Includes a **Panic Sell Button (< 1 Second)** to immediately liquidate all open crypto assets to IDR in global emergencies.

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
| `/profit` | Public / Admin | Reports today's realized profit, win rate, and total net performance. |
| `/coins` | Public / Admin | Lists top 5 trending gainers on Indodax. |
| `/capital <amount> [profile]` | **Admin Only** | Dynamically reconfigures trading capital and risk profile from your phone. |
| `/start` | **Admin Only** | Resumes or enables autonomous spot trading remotely. |
| `/stop` | **Admin Only** | Pauses automated entry signal execution. |
| `/panic` | **Admin Only** | Triggers an immediate sub-second market liquidation of all open coins to IDR. |
| `/balance` | **Admin Only** | Checks available IDR cash balance and total portfolio valuation. |
| `/admin <token>` | Verification | Authorizes the sender's phone number as a registered Administrator using the access token. |
| `/help` | Public / Admin | Displays the full interactive command glossary. |

---

## 🔒 Zero-Trust Security & Resilient Infrastructure

1. **Restricted Indodax API Permissions:**
   - The bot strictly requires only `View (Read)` and `Trading (Trade)` permissions.
   - ❌ **NEVER ENABLE WITHDRAW PERMISSIONS!** Without withdrawal privileges, your funds remain securely locked inside Indodax.
2. **Zero-Trust Admin Access Token:**
   - Administrative endpoints and web settings are guarded by a 32-character hexadecimal token.
   - Authentication checks utilize `crypto.timingSafeEqual` to guard against side-channel timing attacks.
   - Visitors without valid credentials are restricted to View-Only mode.
3. **Automated Token Rotation Service ([`tokenRotationService.ts`](src/services/auth/tokenRotationService.ts)):**
   - Configurable rotation policies: *Fixed*, *Rotate on Startup*, or *Periodic Schedules (e.g., every 1h, 24h)*.
4. **Isolated SQLite Database & Auto-Backup ([`backupService.ts`](src/services/backup/backupService.ts)):**
   - Runs in **WAL (Write-Ahead Logging)** mode for crash resilience and concurrency.
   - Automated timestamped database snapshots are preserved in `backups/` and can be downloaded from the Reports UI.
5. **Official Audit PDF & CSV Export:**
   - Enables one-click exports of trade histories to formatted spreadsheet **CSV** files and audit-ready **PDF Reports**.

---

## 🚀 Quickstart Guide: 1-Click Launchers

### System Requirements:
- **Node.js:** Version **18.0.0** or newer ([Download Node.js](https://nodejs.org/)).
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

# 3. View live server logs and the initial Admin Token
docker compose logs -f
```
Access the dashboard through your browser at `http://YOUR-SERVER-IP:3001`.

---

## 📂 Project Directory Architecture

![Project Directory Architecture](docs/assets/project-structure.svg)

| Directory / Module | Path | Primary Role & Responsibilities |
| :--- | :--- | :--- |
| **Frontend Web (PWA)** | `client/` | React 18, Tailwind CSS, Vite, Lucide Icons, service worker, & PWA manifest. |
| **Internationalization** | `client/src/i18n/` | Bilingual dictionaries (`translations.ts`), context provider (`LanguageContext.tsx`), and switchers. |
| **UI Components** | `client/src/components/` | `DashboardView`, `BotsView`, `EntryDiagnosticsSection`, `QuotaView`, `ReportView`. |
| **Documentation & Assets** | `docs/` | `docs/assets/` (Vector SVGs), `PANDUAN_PENGGUNA.md` (Indonesian User Guide), and audit logs. |
| **Quantitative Signals** | `src/services/signals/` | Deterministic Section 9 (`features`, `lexicon`, `threat`, `regime`, `scorer`). |
| **Trading & Risk Guard** | `src/services/trading/` | 9 Risk Defense Gates (`riskGuard`), trailing ratchet, & capital auto-set engine. |
| **AI Swarm Intelligence** | `src/services/agents/` | 10 specialized intelligence analysts, SQLite outbox Blackboard bus, & SHA-256 deduplication. |
| **Indodax Market Adapter** | `src/services/indodax/` | REST v2 wrapper & WebSocket client with 6-second in-flight promise deduplication. |
| **Remote Bot Services** | `src/services/whatsapp/` & `telegram/` | Baileys WhatsApp Multi-Device engine & Telegram Official Bot API integration. |
| **Security & Auth** | `src/services/auth/` | Token rotation manager & constant-time `timingSafeEqual` authentication verification. |
| **Database & Snapshots** | `src/db/` & `src/services/backup/` | SQLite WAL engine, relational schemas, migrations, and automated snapshot backup services. |
| **REST API Server** | `src/api/` & `src/server.ts` | Express REST routes, exchange webhooks, zero-trust token protection middleware, & lifecycle hooks. |
| **Automated Test Suite** | `tests/` | 95 unit and integration tests covering 100% of critical quantitative algorithms and security barriers. |
| **1-Click Launchers** | `start.bat`, `start.ps1`, `start.sh` | Automated zero-configuration launchers for Windows, Linux, and macOS. |
| **Containerization** | `Dockerfile`, `docker-compose.yml` | Multi-stage production Docker container configuration for continuous 24/7 cloud hosting. |

> [!NOTE]
> **Unified Full-Stack Architecture:**
> - **`src/` (Backend Core):** Executes the deterministic Section 9 signal pipeline, applies the 9 risk gates, coordinates the AI swarm, manages SQLite persistence, and drives remote WhatsApp/Telegram bots.
> - **`client/` (Frontend Dashboard):** The interactive web console available at `http://localhost:3001` — presenting candlestick charts, order controls, market scanners, quota monitors, and live gate diagnostics.
> - Both modules are bundled and served harmoniously from a single consolidated server process via the 1-click launchers (`start.bat` / `start.sh`).

---

## 🧪 Quality Assurance & Test Suite

All critical business logic, token security routines, quantitative indicators, and risk defense gates are safeguarded by **95 unit & integration tests** located in [`tests/`](tests/):

```bash
# Execute the entire automated test suite:
npm test
```

### Verified Test Suite Breakdown:
```
✔ Capital Allocation & Auto-Set Engine (5 tests passing)
✔ Quantitative Indicators (RSI, EMA, True ATR) & Spread Mechanics (5 tests passing)
✔ Performance Reporting Engine & CSV Export (2 tests passing)
✔ Database Backup Service (1 test passing)
✔ Telegram Notifier Service (2 tests passing)
✔ Section 9 Lexicon Sentiment Scoring & Age Decay (4 tests passing)
✔ P0-A Fix: Scoped Threat Blocker & Benign Word Filtering (4 tests passing)
✔ BTC Macro Regime Window Returns (1h & 4h) (3 tests passing)
✔ Conservative Blue-Chip Pullback Opportunity Scoring (2 tests passing)
✔ Pure Risk Guard Execution Pipeline (Gates 1-8) (6 tests passing)
✔ Multi-Agent Blackboard Bus & Outbox Persistence (1 test passing)
✔ Asset-Agnostic MarketAdapter Abstraction (1 test passing)
✔ A/B Counterfactual Logging & Ghost Position Lifecycle (3 tests passing)
✔ Antigravity Live Model Discovery, Multi-Account, & Quota Telemetry (7 tests passing)
✔ WhatsApp Multi-Device LID Authorization & /admin Pairing (4 tests passing)
✔ Admin Access Token Rotation Service & Zero-Trust Comparison (8 tests passing)
✔ Circuit Breaker Resilience & Decoupled Ratchet (1 test passing)
...
---------------------------------------------------------------------------------
ℹ tests 95 | suites 29 | pass 95 | fail 0 | cancelled 0 | duration ~2.28s
---------------------------------------------------------------------------------
```

Production Build Verification:
```bash
npm run build
# Executes TypeScript strict typechecks and Vite client bundle generation (100% clean)
```

---

## ❓ Frequently Asked Questions (FAQ) & Troubleshooting

#### Q1: Why hasn't the bot entered any trades today?
> **A:** This is clear evidence that the **9 Risk Gates** are actively protecting your capital. The bot never enters trades blindly. If the bid-ask spread is excessively wide, Bitcoin is trending downward, or target coins are in extreme overbought territory, entries are purposely withheld. You can view the exact evaluation diagnostics in the **Entry Diagnostics Section** on the dashboard.

#### Q2: Does my computer need to remain powered on 24/7?
> **A:** Yes. The terminal monitors trailing stops every second. If your host computer is shut down, local stop-loss triggers cannot execute. For uninterrupted 24/7 operation without keeping a home PC running, deploy the bot to a cloud VPS using Docker or `./start.sh`.

#### Q3: Is it safe to enter my Indodax API keys?
> **A:** Yes. API keys are stored exclusively in your local SQLite database on your own machine. They are never transmitted to external cloud servers. Furthermore, you must **only grant View and Trade permissions**—never check the Withdraw permission. Without withdrawal rights, your funds cannot be transferred out of Indodax.

#### Q4: How do I recover my Admin Access Token if the terminal window was closed?
> **A:** Restart the terminal application using `start.bat` or `./start.sh`. The active access token is automatically displayed in the terminal output upon launch.

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
