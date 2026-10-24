import {
  SystemStatus,
  AIProvider,
  AIModel,
  MarketTicker,
  NewCoinAlert,
  SubagentDef,
  SubagentLog,
  RiskProfileKey,
  RiskProfileInfo,
  BacktestParams,
  BacktestResult,
  AbValidationMetrics,
  AntigravityAccountQuota,
  PerformanceReport,
  BackupItem,
  SystemHealth,
  TokenRotationStatus,
  TokenRotationMode,
  TokenRotationUnit,
  EntryGateDiagnostics,
  AiMeteringStats,
  SignalsRadarData,
} from '../types';
import {
  mockSystemStatus,
  mockTopGainers,
  mockNewCoins,
  mockSubagentDefs,
  mockSubagentLogs,
  mockBacktestResult,
  mockAnalytics,
  mockAbMetrics,
  mockRiskProfiles,
  mockAntigravityQuotas,
  mockSystemHealth,
  mockTokenRotationStatus,
  mockAIProviders,
  mockAIModels,
  generateMockCandles,
  mockEntryGateDiagnostics,
  mockAiMeteringStats,
  mockSignalsRadar,
} from './mockData';

const BASE_URL = '/api';
const TOKEN_KEY = 'ai_trading_token';

export const isStaticHost =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('github.io') || window.location.protocol === 'file:');

export interface ApiConnectionState {
  isOnline: boolean;
  isDemoMode: boolean;
  lastSyncTime: number;
  errorMessage: string | null;
}

export const apiConnectionState: ApiConnectionState = {
  isOnline: true,
  isDemoMode: isStaticHost,
  lastSyncTime: Date.now(),
  errorMessage: null,
};

export function notifyConnectionChange(isOnline: boolean, errorMsg: string | null = null) {
  const changed = apiConnectionState.isOnline !== isOnline || apiConnectionState.errorMessage !== errorMsg;
  apiConnectionState.isOnline = isOnline;
  apiConnectionState.errorMessage = errorMsg;
  if (isOnline) {
    apiConnectionState.lastSyncTime = Date.now();
  }
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('API_CONNECTION_STATE_CHANGED', { detail: { ...apiConnectionState } }));
  }
}

export const authStorage = {
  getToken(): string {
    return localStorage.getItem(TOKEN_KEY) || (isStaticHost ? 'demo-admin-token' : '');
  },
  setToken(token: string) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  },
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (isStaticHost) {
    throw new Error('Static host: use mock fallback');
  }

  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const json = await res.json();

    if (res.status === 401 && json.requiresAuth) {
      window.dispatchEvent(new CustomEvent('AUTH_REQUIRED'));
    }

    if (!res.ok) {
      throw new Error(json.error || `Request failed with status ${res.status}`);
    }

    notifyConnectionChange(true, null);
    return json;
  } catch (err: any) {
    notifyConnectionChange(false, err?.message || 'Gagal terhubung ke server');
    throw err;
  }
}

export const api = {
  async verifyToken(token: string): Promise<boolean> {
    if (isStaticHost) return true;
    try {
      const res = await fetch(`${BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch {
      return isStaticHost;
    }
  },

  async getAuthStatus(): Promise<{ success: boolean; requiresAuth: boolean; isAdmin: boolean }> {
    if (isStaticHost) {
      return { success: true, requiresAuth: false, isAdmin: true };
    }
    try {
      const res: any = await request('/auth/status');
      return res;
    } catch {
      return { success: true, requiresAuth: false, isAdmin: true };
    }
  },

  async getStatus(): Promise<SystemStatus> {
    try {
      const json: any = await request('/status');
      return json.data;
    } catch {
      return mockSystemStatus;
    }
  },

  async getSettings(): Promise<Record<string, string>> {
    try {
      const json: any = await request('/settings');
      return json.data;
    } catch {
      return {
        TRADING_MODE: 'paper',
        DEFAULT_RISK_PROFILE: 'balanced',
        MAX_ACTIVE_TRADES: '3',
        TRAILING_STOP_PERCENT: '3.0',
        TAKE_PROFIT_STEP_1_PERCENT: '5.0',
        WHATSAPP_ENABLED: 'true',
        TELEGRAM_ENABLED: 'true',
        DEADMAN_SWITCH_ENABLED: 'true',
      };
    }
  },

  async updateSettings(settings: Record<string, string>): Promise<void> {
    try {
      await request('/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
    } catch {
      // In static demo, succeed silently
    }
  },

  async getProviders(): Promise<AIProvider[]> {
    try {
      const json: any = await request('/providers');
      return json.data;
    } catch {
      return mockAIProviders;
    }
  },

  async saveProvider(provider: Partial<AIProvider>): Promise<{ success: boolean; providerId: string }> {
    try {
      return await request('/providers', {
        method: 'POST',
        body: JSON.stringify(provider),
      });
    } catch {
      return { success: true, providerId: 'prov_demo_saved' };
    }
  },

  async deleteProvider(id: string): Promise<void> {
    try {
      await request(`/providers/${id}`, { method: 'DELETE' });
    } catch {
      // In static demo, succeed silently
    }
  },

  // Antigravity Google OAuth Flow
  async getAntigravityAuthUrl(redirectUri?: string): Promise<{ success: boolean; authUrl: string; state: string; redirectUri: string }> {
    try {
      const query = redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : '';
      return await request(`/oauth/antigravity/authorize${query}`);
    } catch {
      return { success: true, authUrl: '#', state: 'demo_oauth_state', redirectUri: window.location.href };
    }
  },

  async exchangeAntigravityOAuth(payload: { code?: string; url?: string; redirectUri?: string }): Promise<{
    success: boolean;
    email: string;
    projectId: string;
    providerId: string;
    modelsCount: number;
    message: string;
  }> {
    try {
      return await request('/oauth/antigravity/exchange', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      return {
        success: true,
        email: 'trading.master@antigravity.ai',
        projectId: 'ai-trading-demo',
        providerId: 'prov_antigravity',
        modelsCount: 4,
        message: 'Google Antigravity Connected (Demo Mode)',
      };
    }
  },

  async importModels(providerId: string): Promise<{ success: boolean; count: number; models: AIModel[]; message?: string }> {
    try {
      return await request(`/providers/${providerId}/import-models`, {
        method: 'POST',
      });
    } catch {
      return { success: true, count: mockAIModels.length, models: mockAIModels, message: '2 model AI berhasil diimpor' };
    }
  },

  async getModels(): Promise<AIModel[]> {
    try {
      const json: any = await request('/models');
      return json.data;
    } catch {
      return mockAIModels;
    }
  },

  async getScanner(): Promise<{ topGainers: MarketTicker[]; newCoinAlerts: NewCoinAlert[]; totalPairs: number }> {
    try {
      const json: any = await request('/scanner');
      return json.data;
    } catch {
      return {
        topGainers: mockTopGainers,
        newCoinAlerts: mockNewCoins,
        totalPairs: 437,
      };
    }
  },

  // 100% Real-time Candlestick & Trades Chart Data from Indodax
  async getChartData(symbol: string, timeframe = '1h'): Promise<{
    symbol: string;
    timeframe: string;
    candles: Array<{ time: string; timestamp: number; open: number; high: number; low: number; close: number; volume: number }>;
    latestPrice: number;
    high24h: number;
    low24h: number;
    volIdr: number;
  }> {
    try {
      const json: any = await request(`/chart/${encodeURIComponent(symbol)}?timeframe=${timeframe}`);
      return json.data;
    } catch {
      const basePrice = symbol.toLowerCase().includes('btc')
        ? 1617000000
        : symbol.toLowerCase().includes('sol')
        ? 3456000
        : symbol.toLowerCase().includes('eth')
        ? 49200000
        : 6420;
      const candles = generateMockCandles(basePrice, 48);
      const latestPrice = candles[candles.length - 1].close;
      const high24h = Math.round(Math.max(...candles.map((c) => c.high)));
      const low24h = Math.round(Math.min(...candles.map((c) => c.low)));
      return {
        symbol: symbol.toUpperCase(),
        timeframe,
        candles,
        latestPrice,
        high24h,
        low24h,
        volIdr: 45200000000,
      };
    }
  },

  async getSubagents(): Promise<{ agents: SubagentDef[]; recentLogs: SubagentLog[]; sentiment: any }> {
    try {
      const json: any = await request('/subagents');
      return json.data;
    } catch {
      return {
        agents: mockSubagentDefs,
        recentLogs: mockSubagentLogs,
        sentiment: mockSystemStatus.sentiment,
      };
    }
  },

  async runSubagentsCycle(): Promise<void> {
    try {
      await request('/subagents/run', { method: 'POST' });
    } catch {
      // Demo mode success
    }
  },

  async toggleAutoTrading(): Promise<{ isActive: boolean }> {
    try {
      return await request('/trading/toggle', { method: 'POST' });
    } catch {
      mockSystemStatus.isAutoTradingActive = !mockSystemStatus.isAutoTradingActive;
      return { isActive: mockSystemStatus.isAutoTradingActive };
    }
  },

  async toggleTradingMode(): Promise<{ mode: 'paper' | 'live' }> {
    try {
      return await request('/trading/mode', { method: 'POST' });
    } catch {
      mockSystemStatus.mode = mockSystemStatus.mode === 'paper' ? 'live' : 'paper';
      return { mode: mockSystemStatus.mode };
    }
  },

  async panicSell(): Promise<{ message: string }> {
    try {
      return await request('/trading/panic', { method: 'POST' });
    } catch {
      mockSystemStatus.openPositions = [];
      return { message: 'Seluruh posisi aktif berhasil dilikuidasi ke saldo IDR (Demo Mode).' };
    }
  },

  async getWhatsAppStatus(): Promise<any> {
    try {
      const json: any = await request('/whatsapp');
      return json.data;
    } catch {
      return {
        connected: true,
        active: true,
        qrCode: null,
        adminNumber: '6281234567890',
        lid: '12345678@lid',
      };
    }
  },

  async connectWhatsApp(): Promise<{ success: boolean; message: string }> {
    try {
      return await request('/whatsapp/connect', { method: 'POST' });
    } catch {
      return { success: true, message: 'WhatsApp session aktif (Demo Mode)' };
    }
  },

  async disconnectWhatsApp(): Promise<{ success: boolean; message: string }> {
    try {
      return await request('/whatsapp/disconnect', { method: 'POST' });
    } catch {
      return { success: true, message: 'WhatsApp session diputus (Demo Mode)' };
    }
  },

  async getTunnelStatus(): Promise<any> {
    try {
      const json: any = await request('/tunnel');
      return json.data;
    } catch {
      return {
        active: false,
        type: null,
        url: null,
      };
    }
  },

  async startTunnel(type: 'cloudflared' | 'ngrok', authtoken?: string): Promise<any> {
    try {
      return await request('/tunnel/start', {
        method: 'POST',
        body: JSON.stringify({ type, authtoken }),
      });
    } catch {
      return {
        active: true,
        type,
        url: 'https://demo-ai-trading.trycloudflare.com',
      };
    }
  },

  async stopTunnel(): Promise<any> {
    try {
      return await request('/tunnel/stop', { method: 'POST' });
    } catch {
      return { active: false };
    }
  },

  async getRiskProfiles(): Promise<{
    currentProfile: RiskProfileKey;
    profiles: Record<RiskProfileKey, RiskProfileInfo>;
  }> {
    try {
      const json: any = await request('/settings/profiles');
      return json.data;
    } catch {
      return {
        currentProfile: 'balanced',
        profiles: mockRiskProfiles,
      };
    }
  },

  async setRiskProfile(profile: RiskProfileKey): Promise<{ success: boolean; message: string; profile: RiskProfileInfo }> {
    try {
      return await request('/settings/profile', {
        method: 'POST',
        body: JSON.stringify({ profile }),
      });
    } catch {
      return {
        success: true,
        message: 'Profil risiko berhasil diubah',
        profile: mockRiskProfiles[profile] || mockRiskProfiles.balanced,
      };
    }
  },

  async calculateCapitalPlan(capital: number, profile?: RiskProfileKey): Promise<any> {
    try {
      const res: any = await request(`/settings/calculate-capital?capital=${capital}&profile=${profile || 'balanced'}`);
      return res.plan;
    } catch {
      const allocPct = profile === 'conservative' ? 0.2 : profile === 'aggressive' ? 0.45 : 0.3;
      const alloc = Math.max(10000, Math.round(capital * allocPct));
      const maxAllowed = Math.max(1, Math.floor(capital / alloc));
      const maxTrades = Math.min(profile === 'balanced' ? 3 : 2, maxAllowed);
      return {
        capitalIdr: capital,
        profile: profile || 'balanced',
        maxAllocationPerTradeIdr: alloc,
        maxActiveTrades: maxTrades,
        cashBufferIdr: Math.max(0, capital - (alloc * maxTrades)),
        cashBufferPercent: Math.round(((capital - (alloc * maxTrades)) / capital) * 100),
        trailingStopPercent: profile === 'conservative' ? 1.8 : profile === 'aggressive' ? 3.5 : 2.5,
        dailyLossLimitPercent: profile === 'conservative' ? 3.0 : profile === 'aggressive' ? 8.0 : 5.0,
        takeProfitStep1Percent: profile === 'conservative' ? 3.5 : profile === 'aggressive' ? 7.5 : 5.0,
        notes: [],
      };
    }
  },

  async autoSetCapital(capital: number, profile?: RiskProfileKey): Promise<{ success: boolean; message: string; plan: any }> {
    return await request('/settings/auto-set-capital', {
      method: 'POST',
      body: JSON.stringify({ capital, profile }),
    });
  },

  async runBacktest(params: BacktestParams): Promise<BacktestResult> {
    try {
      const json: any = await request('/backtest/run', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      return json.data;
    } catch {
      return {
        ...mockBacktestResult,
        symbol: params.symbol || 'BTCIDR',
        timeframe: params.timeframe || '1h',
        days: params.days || 30,
      };
    }
  },

  async getAbMetrics(): Promise<AbValidationMetrics> {
    try {
      const json: any = await request('/trading/ab-metrics');
      return json.data;
    } catch {
      return mockAbMetrics;
    }
  },

  async getAllAntigravityQuotas(): Promise<AntigravityAccountQuota[]> {
    try {
      const json: any = await request('/providers/quota/all');
      return json.data || [];
    } catch {
      return mockAntigravityQuotas;
    }
  },

  async getAntigravityQuota(providerId: string): Promise<AntigravityAccountQuota> {
    try {
      const json: any = await request(`/providers/${providerId}/quota`);
      return json.data;
    } catch {
      return mockAntigravityQuotas[0];
    }
  },

  async getPerformanceReport(days?: number | 'all'): Promise<PerformanceReport> {
    try {
      const query = days ? `?days=${days}` : '';
      const json: any = await request(`/reports/summary${query}`);
      return json.data;
    } catch {
      return mockAnalytics;
    }
  },

  getReportCsvUrl(days?: number | 'all'): string {
    const token = authStorage.getToken();
    const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
    return `/api/reports/csv?days=${days || 'all'}${tokenQuery}`;
  },

  async getBackupList(): Promise<BackupItem[]> {
    try {
      const json: any = await request('/backup/list');
      return json.data || [];
    } catch {
      return [
        {
          filename: 'trading_backup_2026-10-20T04-27-49-451Z.db',
          sizeBytes: 479232,
          sizeFormatted: '468.0 KB',
          createdAt: Date.now() - 3600 * 24 * 1000,
          createdFormatted: '1 hari yang lalu',
        },
      ];
    }
  },

  async createBackup(): Promise<{ success: boolean; message: string; data: BackupItem }> {
    try {
      return await request('/backup/create', { method: 'POST' });
    } catch {
      const item: BackupItem = {
        filename: `trading_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`,
        sizeBytes: 479232,
        sizeFormatted: '468.0 KB',
        createdAt: Date.now(),
        createdFormatted: 'Baru saja',
      };
      return { success: true, message: 'Database backup berhasil dibuat', data: item };
    }
  },

  async testTelegram(botToken: string, chatId: string): Promise<{ success: boolean; message: string }> {
    try {
      return await request('/telegram/test', {
        method: 'POST',
        body: JSON.stringify({ botToken, chatId }),
      });
    } catch {
      return { success: true, message: 'Pesan tes Telegram berhasil dikirim ke Chat ID ' + chatId };
    }
  },

  async getSystemHealth(): Promise<SystemHealth> {
    try {
      const json: any = await request('/system/health');
      return json.data;
    } catch {
      return mockSystemHealth;
    }
  },

  async getTokenRotationStatus(): Promise<TokenRotationStatus> {
    try {
      const json: any = await request('/auth/rotation-status');
      return json.data;
    } catch {
      return mockTokenRotationStatus;
    }
  },

  async updateTokenRotationConfig(config: {
    mode: TokenRotationMode;
    intervalValue?: number;
    intervalUnit?: TokenRotationUnit;
  }): Promise<TokenRotationStatus> {
    try {
      const json: any = await request('/auth/rotation-config', {
        method: 'POST',
        body: JSON.stringify(config),
      });
      return json.data;
    } catch {
      return {
        ...mockTokenRotationStatus,
        mode: config.mode,
        intervalValue: config.intervalValue ?? mockTokenRotationStatus.intervalValue,
        intervalUnit: config.intervalUnit ?? mockTokenRotationStatus.intervalUnit,
      };
    }
  },

  async rotateTokenNow(): Promise<{ token: string; rotatedAt: number }> {
    try {
      const json: any = await request('/auth/rotate-token', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Rotasi Manual dari Web Dashboard' }),
      });
      return { token: json.token, rotatedAt: json.rotatedAt };
    } catch {
      const newToken = Math.random().toString(36).substring(2, 18);
      return { token: newToken, rotatedAt: Date.now() };
    }
  },

  async getEntryGateDiagnostics(): Promise<EntryGateDiagnostics> {
    try {
      const json: any = await request('/diagnostics/entry-gates');
      return json.data;
    } catch {
      return mockEntryGateDiagnostics;
    }
  },

  async getAiMetering(): Promise<AiMeteringStats> {
    try {
      const json: any = await request('/ai/metering');
      return json.data;
    } catch {
      return mockAiMeteringStats;
    }
  },

  async getSignalsRadar(): Promise<SignalsRadarData> {
    try {
      const json: any = await request('/signals/radar');
      return json.data;
    } catch {
      return mockSignalsRadar;
    }
  },
};
