import { db, getSetting, logAiCall } from '../../db/index.js';
import {
  refreshAntigravityToken,
  callAntigravityChat,
  fetchLiveAntigravityModels,
  fetchAntigravityQuotas,
  AntigravityOAuthData,
  AntigravityQuotaReport,
  ANTIGRAVITY_STATIC_MODELS,
  ANTIGRAVITY_HEADERS,
} from '../antigravity/oauth.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string; // alias_model_id (e.g. "hrbr/deepseek-v3") or fallback
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  jsonMode?: boolean;
  agentCaller?: string; // 'scout' | 'analyst' | 'master' | 'postmortem' | 'whatsapp'
}

export interface ProviderRecord {
  id: string;
  name: string;
  base_url: string;
  api_keys: string; // JSON array of string
  alias: string;
  protocol: 'chat_completions' | 'messages' | 'antigravity';
  oauth_data?: string; // JSON string of AntigravityOAuthData
  is_active: number;
  created_at: number;
}

export interface ModelRecord {
  id: string;
  provider_id: string;
  model_id: string;
  alias_model_id: string;
  display_name: string;
  context_length: number;
  imported_at: number;
}

export class UniversalAIClient {
  private onEmergencyFailure?: (providerName: string, errorSummary: string) => Promise<void>;
  private static refreshPromises = new Map<string, Promise<{ accessToken: string; expiresAt: number }>>();
  private degradedMode = false;

  public isDegradedMode(): boolean {
    return this.degradedMode;
  }

  public setDegradedMode(val: boolean) {
    this.degradedMode = val;
  }

  public setEmergencyCallback(cb: (providerName: string, errorSummary: string) => Promise<void>) {
    this.onEmergencyFailure = cb;
  }

  // --- Import Models Automatically from Provider (e.g. Token Harbor) ---

  public async importModels(providerId: string): Promise<{ success: boolean; count: number; models: ModelRecord[]; message?: string }> {
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId) as ProviderRecord | undefined;
    if (!provider) {
      throw new Error(`Provider dengan ID ${providerId} tidak ditemukan.`);
    }

    let fetchedModels: Array<{ id: string; name?: string; context_window?: number }> = [];

    // 1. Penanganan Khusus untuk Antigravity (Google Cloud Code OAuth)
    if (
      provider.protocol === 'antigravity' ||
      provider.alias.toLowerCase().startsWith('agy') ||
      provider.name.toLowerCase().includes('antigravity') ||
      provider.base_url.includes('cloudcode-pa')
    ) {
      let oauthData: AntigravityOAuthData | null = null;
      if (provider.oauth_data) {
        try {
          oauthData = JSON.parse(provider.oauth_data);
          // Auto-refresh jika token mendekati waktu kedaluwarsa (kurang dari 5 menit)
          if (oauthData && oauthData.refreshToken && Date.now() > (oauthData.expiresAt || 0) - 5 * 60 * 1000) {
            console.log(`[importModels] Auto-refreshing Antigravity token for ${provider.name}...`);
            const refreshed = await refreshAntigravityToken(oauthData.refreshToken);
            oauthData.accessToken = refreshed.accessToken;
            oauthData.expiresAt = refreshed.expiresAt;
            db.prepare('UPDATE providers SET oauth_data = ? WHERE id = ?').run(
              JSON.stringify(oauthData),
              provider.id
            );
          }
        } catch (refErr) {
          console.warn('[importModels] Gagal refresh token Antigravity:', refErr);
        }
      }

      if (oauthData && oauthData.accessToken) {
        try {
          console.log(`[importModels] Mengambil model Antigravity real-time untuk ${provider.name}...`);
          const liveModels = await fetchLiveAntigravityModels(oauthData.accessToken, oauthData.projectId);
          if (liveModels.length > 0) {
            fetchedModels = liveModels;
          }
        } catch (discErr) {
          console.warn('[importModels] Dynamic models discovery threw error, fallback ke static catalog:', discErr);
        }
      }

      // Fallback ke static catalog jika fetch gagal
      if (fetchedModels.length === 0) {
        fetchedModels = ANTIGRAVITY_STATIC_MODELS.map((m) => ({
          id: m.id,
          name: `${m.name} (Antigravity)`,
          context_window: m.context_window,
        }));
      }
    } else {
      // 2. Penanganan Standar untuk Custom Provider (OpenAI, Token Harbor, Anthropic, dll)
      const apiKeys: string[] = JSON.parse(provider.api_keys || '[]');
      if (apiKeys.length === 0 || !apiKeys[0]) {
        throw new Error(`Provider [${provider.name}] belum memiliki API Key. Harap isi minimal satu API Key.`);
      }

      // Normalize Base URL to reach the models endpoint
      let baseUrl = provider.base_url.trim();
      if (baseUrl.endsWith('/chat/completions')) {
        baseUrl = baseUrl.replace('/chat/completions', '');
      } else if (baseUrl.endsWith('/messages')) {
        baseUrl = baseUrl.replace('/messages', '');
      }
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
      }

      let modelsEndpoint = `${baseUrl}/models`;
      if (!baseUrl.includes('/v1') && !baseUrl.includes('/v2')) {
        modelsEndpoint = `${baseUrl}/v1/models`;
      }

      let lastError = '';

      // Attempt import with each available key until one succeeds
      for (let i = 0; i < apiKeys.length; i++) {
        const key = apiKeys[i];
        try {
          const res = await fetch(modelsEndpoint, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errText}`);
          }

          const data = (await res.json()) as any;
          const rawList = Array.isArray(data) ? data : data.data || data.models || [];

          if (Array.isArray(rawList) && rawList.length > 0) {
            fetchedModels = rawList
              .map((m: any) => ({
                id: typeof m === 'string' ? m : m.id || m.model || m.name,
                name: typeof m === 'object' ? m.name || m.id : m,
                context_window: typeof m === 'object' ? m.context_window || m.context_length || 128000 : 128000,
              }))
              .filter((m) => !!m.id);
            break; // Key succeeded!
          }
        } catch (err: any) {
          lastError = `Key #${i + 1} failed: ${err.message}`;
        }
      }

      if (fetchedModels.length === 0) {
        // Fallback: If the provider doesn't support GET /models endpoint, register common flagship models
        fetchedModels = [
          { id: 'deepseek-v3', name: 'DeepSeek V3 (Chat)', context_window: 128000 },
          { id: 'deepseek-r1', name: 'DeepSeek R1 (Reasoning)', context_window: 128000 },
          { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', context_window: 200000 },
          { id: 'gpt-4o', name: 'GPT-4o', context_window: 128000 },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', context_window: 128000 },
        ];
      }
    }

    // Insert or replace into SQLite models table
    const insertStmt = db.prepare(`
      INSERT INTO models (id, provider_id, model_id, alias_model_id, display_name, context_length, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(alias_model_id) DO UPDATE SET
        display_name = excluded.display_name,
        context_length = excluded.context_length,
        imported_at = excluded.imported_at
    `);

    const now = Date.now();
    for (const m of fetchedModels) {
      const aliasModelId = `${provider.alias}/${m.id}`;
      insertStmt.run(
        `model_${provider.alias}_${m.id}`,
        provider.id,
        m.id,
        aliasModelId,
        m.name || m.id,
        m.context_window || 128000,
        now
      );
    }

    const savedModels = db.prepare('SELECT * FROM models WHERE provider_id = ?').all(provider.id) as ModelRecord[];

    return {
      success: true,
      count: savedModels.length,
      models: savedModels,
      message: `Berhasil mengimpor ${savedModels.length} model untuk provider ${provider.name}.`,
    };
  }

  // --- Unified Chat Completion with Auto-Failover across Multiple API Keys & Antigravity ---

  public async complete(options: CompletionOptions): Promise<string> {
    const aliasModelId = options.model || getSetting('master_model', '');
    const caller = options.agentCaller || 'master';
    const promptChars = options.messages.reduce((acc, m) => acc + (m.content ? m.content.length : 0), 0);
    const estInputTokens = Math.max(1, Math.ceil(promptChars / 4));
    const startTime = Date.now();

    // Resolve Model and Provider
    let modelRecord = db.prepare('SELECT * FROM models WHERE alias_model_id = ?').get(aliasModelId) as ModelRecord | undefined;
    let provider: ProviderRecord | undefined;

    if (modelRecord) {
      provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(modelRecord.provider_id) as ProviderRecord | undefined;
    }

    // If specific model not configured, pick the first active provider and its first model
    if (!provider) {
      provider = db.prepare('SELECT * FROM providers WHERE is_active = 1 LIMIT 1').get() as ProviderRecord | undefined;
      if (!provider) {
        logAiCall(caller, aliasModelId, estInputTokens, 0, Date.now() - startTime, 'error');
        throw new Error('Belum ada AI Provider yang aktif. Silakan tambahkan di menu Settings > AI Providers.');
      }
      modelRecord = db.prepare('SELECT * FROM models WHERE provider_id = ? LIMIT 1').get(provider.id) as ModelRecord | undefined;
    }

    const rawModelId = modelRecord ? modelRecord.model_id : 'gpt-4o-mini';

    try {
      let result = '';
      if (provider.protocol === 'antigravity') {
        result = await this.callAntigravity(provider, rawModelId, options);
      } else {
        result = await this.executeWithFailover(provider, rawModelId, options);
      }

      this.degradedMode = false;
      const estOutputTokens = Math.max(1, Math.ceil(result.length / 4));
      logAiCall(caller, `${provider.alias}/${rawModelId}`, estInputTokens, estOutputTokens, Date.now() - startTime, 'ok');
      return result;
    } catch (err: any) {
      this.degradedMode = true;
      logAiCall(caller, `${provider?.alias || 'unknown'}/${rawModelId}`, estInputTokens, 0, Date.now() - startTime, 'error');
      throw err;
    }
  }

  private async executeWithFailover(
    provider: ProviderRecord,
    rawModelId: string,
    options: CompletionOptions
  ): Promise<string> {
    const apiKeys: string[] = JSON.parse(provider.api_keys || '[]');

    if (apiKeys.length === 0 || !apiKeys[0]) {
      throw new Error(`Provider [${provider.name}] tidak memiliki API Key yang valid.`);
    }

    let completionResult: string | null = null;
    const errors: string[] = [];

    // Auto-Failover: Iterate through API keys sequentially
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i].trim();
      if (!apiKey) continue;

      try {
        if (provider.protocol === 'messages') {
          completionResult = await this.callAnthropicMessages(provider, apiKey, rawModelId, options);
        } else {
          completionResult = await this.callOpenAIChat(provider, apiKey, rawModelId, options);
        }

        if (completionResult !== null) {
          return completionResult; // Successfully completed!
        }
      } catch (err: any) {
        const errorMsg = `Key #${i + 1} (${apiKey.substring(0, 8)}...): ${err.message}`;
        console.warn(`[AI Failover] ${errorMsg}. Mencoba API Key berikutnya...`);
        errors.push(errorMsg);
      }
    }

    // IF ALL API KEYS FAILED:
    const summary = `Semua (${apiKeys.length}) API Key untuk provider [${provider.name}] gagal!\nDetail:\n${errors.join('\n')}`;
    console.error(`[CRITICAL AI FAILURE] ${summary}`);

    // Trigger WhatsApp Emergency Notification
    if (this.onEmergencyFailure) {
      try {
        await this.onEmergencyFailure(provider.name, summary);
      } catch (notifErr) {
        console.error('Gagal mengirim WhatsApp alert:', notifErr);
      }
    }

    throw new Error(`[AI Key Exhaustion] ${summary}`);
  }

  // --- OpenAI Compatible Chat Completions (`/v1/chat/completions`) ---

  private async callOpenAIChat(
    provider: ProviderRecord,
    apiKey: string,
    rawModelId: string,
    options: CompletionOptions
  ): Promise<string> {
    let url = provider.base_url.trim();
    if (!url.endsWith('/chat/completions')) {
      if (url.endsWith('/')) url = url.slice(0, -1);
      url = `${url}/chat/completions`;
    }

    const body: Record<string, any> = {
      model: rawModelId,
      messages: options.messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.max_tokens ?? 2048,
    };

    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Response format tidak valid dari provider (choices[0].message.content kosong).');
    }

    return content;
  }

  // --- Anthropic Compatible Messages (`/v1/messages`) ---

  private async callAnthropicMessages(
    provider: ProviderRecord,
    apiKey: string,
    rawModelId: string,
    options: CompletionOptions
  ): Promise<string> {
    let url = provider.base_url.trim();
    if (!url.endsWith('/messages')) {
      if (url.endsWith('/')) url = url.slice(0, -1);
      url = `${url}/messages`;
    }

    const systemMessage = options.messages.find(m => m.role === 'system')?.content || '';
    const nonSystemMessages = options.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const body: Record<string, any> = {
      model: rawModelId,
      messages: nonSystemMessages,
      max_tokens: options.max_tokens ?? 2048,
      temperature: options.temperature ?? 0.3,
    };

    if (systemMessage) {
      body.system = systemMessage;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as any;
    const textBlock = data.content?.find((c: any) => c.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  // --- Antigravity Google Cloud Code Integration with Auto-Token Refresh & Multi-Account Failover ---

  private async executeAntigravityWithSingleProvider(
    provider: ProviderRecord,
    rawModelId: string,
    options: CompletionOptions
  ): Promise<string> {
    if (!provider.oauth_data) {
      throw new Error(`Provider Antigravity [${provider.name}] belum terhubung melalui Google OAuth.`);
    }

    let oauthData: AntigravityOAuthData = JSON.parse(provider.oauth_data);

    // Refresh token jika mendekati waktu habis (kurang dari 5 menit)
    if (Date.now() > (oauthData.expiresAt || 0) - 5 * 60 * 1000) {
      if (oauthData.refreshToken) {
        try {
          let refreshPromise = UniversalAIClient.refreshPromises.get(provider.id);
          if (!refreshPromise) {
            console.log(`[Antigravity] Access token untuk [${provider.name}] mendekati kedaluwarsa. Melakukan auto-refresh token...`);
            refreshPromise = refreshAntigravityToken(oauthData.refreshToken).finally(() => {
              UniversalAIClient.refreshPromises.delete(provider.id);
            });
            UniversalAIClient.refreshPromises.set(provider.id, refreshPromise);
          }
          const refreshed = await refreshPromise;
          oauthData = {
            ...oauthData,
            accessToken: refreshed.accessToken,
            expiresAt: refreshed.expiresAt,
          };
          db.prepare('UPDATE providers SET oauth_data = ? WHERE id = ?').run(
            JSON.stringify(oauthData),
            provider.id
          );
        } catch (refErr: any) {
          console.warn(`[Antigravity] Auto-refresh gagal untuk [${provider.name}], mencoba menggunakan token yang ada:`, refErr.message);
        }
      }
    }

    try {
      return await callAntigravityChat({
        accessToken: oauthData.accessToken,
        projectId: oauthData.projectId,
        model: rawModelId,
        messages: options.messages,
        temperature: options.temperature,
        maxTokens: options.max_tokens,
      });
    } catch (err: any) {
      // Jika terjadi error 401 Unauthorized, coba refresh token darurat sekali lagi
      if (err.message && err.message.includes('401') && oauthData.refreshToken) {
        console.warn(`[Antigravity] HTTP 401 terdeteksi untuk [${provider.name}]. Melakukan refresh token darurat dan retry...`);
        const refreshed = await refreshAntigravityToken(oauthData.refreshToken);
        oauthData = {
          ...oauthData,
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
        };
        db.prepare('UPDATE providers SET oauth_data = ? WHERE id = ?').run(
          JSON.stringify(oauthData),
          provider.id
        );
        return await callAntigravityChat({
          accessToken: oauthData.accessToken,
          projectId: oauthData.projectId,
          model: rawModelId,
          messages: options.messages,
          temperature: options.temperature,
          maxTokens: options.max_tokens,
        });
      }
      throw err;
    }
  }

  private static antigravityRoundRobinCounter = 0;

  private async callAntigravity(
    initialProvider: ProviderRecord,
    rawModelId: string,
    options: CompletionOptions
  ): Promise<string> {
    // 1. Ambil seluruh akun Antigravity aktif di database
    const allAgyProviders = db
      .prepare("SELECT * FROM providers WHERE protocol = 'antigravity' AND is_active = 1")
      .all() as ProviderRecord[];

    // 2. Tentukan urutan akun (Round-Robin Multi-Account load balancing)
    let providersToTry: ProviderRecord[] = [initialProvider];
    const otherProviders = allAgyProviders.filter((p) => p.id !== initialProvider.id);

    if (otherProviders.length > 0) {
      UniversalAIClient.antigravityRoundRobinCounter++;
      // Distribusikan beban 50/50 secara bergantian ke seluruh akun yang terhubung
      if (UniversalAIClient.antigravityRoundRobinCounter % (otherProviders.length + 1) !== 0) {
        providersToTry = [...otherProviders, initialProvider];
      } else {
        providersToTry = [initialProvider, ...otherProviders];
      }
    }

    let lastError: any = null;
    for (let i = 0; i < providersToTry.length; i++) {
      const prov = providersToTry[i];
      try {
        return await this.executeAntigravityWithSingleProvider(prov, rawModelId, options);
      } catch (err: any) {
        lastError = err;
        const nextProv = providersToTry[i + 1];
        if (nextProv) {
          console.warn(
            `[Antigravity Account Failover] Akun [${prov.name}] terkena limit/kendala (${err.message}). Otomatis beralih ke akun cadangan [${nextProv.name}]...`
          );
        }
      }
    }

    // Jika seluruh akun gagal, lempar error asli
    throw lastError || new Error(`Seluruh (${providersToTry.length}) akun Antigravity gagal merespons.`);
  }

  // --- Provider Quota Telemetry (Antigravity & OmniRoute /dashboard/quota compatibility) ---

  public async getProviderQuota(providerId: string): Promise<AntigravityQuotaReport> {
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId) as ProviderRecord | undefined;
    if (!provider) {
      throw new Error(`Provider dengan ID ${providerId} tidak ditemukan.`);
    }

    if (!provider.oauth_data) {
      throw new Error(`Provider [${provider.name}] tidak memiliki konfigurasi Google OAuth.`);
    }

    let oauthData: AntigravityOAuthData = JSON.parse(provider.oauth_data);

    // Auto-refresh token jika mendekati waktu kedaluwarsa
    if (oauthData.refreshToken && Date.now() > (oauthData.expiresAt || 0) - 5 * 60 * 1000) {
      try {
        const refreshed = await refreshAntigravityToken(oauthData.refreshToken);
        oauthData = {
          ...oauthData,
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
        };
        db.prepare('UPDATE providers SET oauth_data = ? WHERE id = ?').run(
          JSON.stringify(oauthData),
          provider.id
        );
      } catch (err: any) {
        console.warn('[getProviderQuota] Token refresh notice:', err.message);
      }
    }

    const { groups, models } = await fetchAntigravityQuotas(oauthData.accessToken, oauthData.projectId);

    return {
      providerId: provider.id,
      providerName: provider.name,
      email: oauthData.email || 'Google User',
      projectId: oauthData.projectId || 'Default Project',
      alias: provider.alias,
      updatedAt: Date.now(),
      totalModels: models.length,
      groups,
      models,
    };
  }

  public async getAllAntigravityQuotas(): Promise<AntigravityQuotaReport[]> {
    const providers = db.prepare("SELECT * FROM providers WHERE protocol = 'antigravity' AND is_active = 1").all() as ProviderRecord[];
    const reports: AntigravityQuotaReport[] = [];

    for (const p of providers) {
      try {
        const report = await this.getProviderQuota(p.id);
        reports.push(report);
      } catch (err: any) {
        console.warn(`[getAllAntigravityQuotas] Gagal mengambil kuota untuk ${p.name}:`, err.message);
      }
    }

    return reports;
  }
}

export const aiClient = new UniversalAIClient();

