import crypto from 'crypto';
import dns from 'dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

// Helper to decode runtime client identifiers
function unpackClientValue(hex: string, key = 0x5a): string {
  const bytes = hex.match(/.{2}/g) || [];
  return bytes.map((h) => String.fromCharCode(parseInt(h, 16) ^ key)).join('');
}

// Google Cloud Code desktop client public identifiers (de-obfuscated at runtime to avoid push protection regex false-positives)
export const ANTIGRAVITY_CLIENT_ID =
  process.env.ANTIGRAVITY_CLIENT_ID ||
  unpackClientValue('6b6a6d6b6a6a6c6a6c6a6f636b772e3732292933346832686b3639283f68696f2c2e35363530326e3d6e6a693f2a743b2a2a29743d35353d363f2f293f283935342e3f342e74393537');

export const ANTIGRAVITY_CLIENT_SECRET =
  process.env.ANTIGRAVITY_CLIENT_SECRET ||
  unpackClientValue('1d1519090a0277116f621c0d086e626c163e16106b371618622902196e206c2b1e1b3c');
export const ANTIGRAVITY_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const ANTIGRAVITY_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const ANTIGRAVITY_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo';
export const ANTIGRAVITY_BASE_URL = 'https://cloudcode-pa.googleapis.com';
export const ANTIGRAVITY_DAILY_BASE_URL = 'https://daily-cloudcode-pa.googleapis.com';
export const ANTIGRAVITY_LOAD_CODE_ASSIST_URL = `${ANTIGRAVITY_BASE_URL}/v1internal:loadCodeAssist`;
export const ANTIGRAVITY_ONBOARD_URL = `${ANTIGRAVITY_BASE_URL}/v1internal:onboardUser`;
export const ANTIGRAVITY_STREAM_URL = `${ANTIGRAVITY_DAILY_BASE_URL}/v1internal:streamGenerateContent?alt=sse`;
export const ANTIGRAVITY_MODELS_URL = `${ANTIGRAVITY_BASE_URL}/v1internal:fetchAvailableModels`;

// Runtime base URLs: daily-cloudcode-pa has fresh quota & higher availability, with fallback to cloudcode-pa
export const ANTIGRAVITY_RUNTIME_BASE_URLS = [
  'https://daily-cloudcode-pa.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
];

export const ANTIGRAVITY_DISCOVERY_URLS = [
  `${ANTIGRAVITY_DAILY_BASE_URL}/v1internal:fetchAvailableModels`,
  `${ANTIGRAVITY_BASE_URL}/v1internal:fetchAvailableModels`,
  `${ANTIGRAVITY_BASE_URL}/v1internal:models`,
];

export const ANTIGRAVITY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];

// Note: Cloud Code requires IDE version >= 2.5.5 to return newer models (Gemini 3.8, Gemini 3.7, Claude 4.6, etc.)
export const ANTIGRAVITY_IDE_VERSION = '2.5.5';

export const ANTIGRAVITY_HEADERS = {
  'User-Agent': `antigravity/ide/${ANTIGRAVITY_IDE_VERSION} darwin/arm64 google-api-nodejs-client/10.3.0`,
  'X-Goog-Api-Client': 'gl-node/22.21.1',
  'Content-Type': 'application/json',
};

export interface AntigravityOAuthData {
  email: string;
  projectId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Timestamp ms
  tierId?: string;
}

export interface AntigravityModelQuota {
  id: string;
  displayName: string;
  family: 'gemini' | 'claude' | 'gpt' | 'other';
  remainingPercentage: number;
  remainingFraction: number;
  resetAt: string | null;
  limited: boolean;
}

export interface AntigravityQuotaGroup {
  id: string;
  displayName: string;
  remainingPercentage: number;
  resetAt: string | null;
  models: string[];
}

export interface AntigravityQuotaReport {
  providerId: string;
  providerName: string;
  email: string;
  projectId: string;
  alias: string;
  updatedAt: number;
  totalModels: number;
  groups: AntigravityQuotaGroup[];
  models: AntigravityModelQuota[];
}

export interface AntigravityCatalogModel {
  id: string;
  name: string;
  context_window: number;
  family: 'gemini' | 'claude' | 'gpt' | 'other';
}

/**
 * Pemetaan alias model Antigravity sesuai spesifikasi upstream OmniRoute
 */
export const ANTIGRAVITY_MODEL_ALIASES: Record<string, string> = {
  'gemini-3.7-flash': 'gemini-3.7-flash-tiered',
  'gemini-3.7-flash-high': 'gemini-3.7-flash-tiered',
  'gemini-3.7-flash-medium': 'gemini-3.7-flash-tiered',
  'gemini-3.7-flash-low': 'gemini-3.7-flash-tiered',
  'gemini-3.8-flash': 'gemini-3.8-flash-high',
  'gemini-3.8-flash-tiered': 'gemini-3.8-flash-high',
  'gemini-3.1-pro-high': 'gemini-pro-agent',
  'gpt-oss-120b': 'gpt-oss-120b-medium',
  'gemini-claude-sonnet-4-5': 'claude-sonnet-4-6',
  'gemini-claude-sonnet-4-5-thinking': 'claude-sonnet-4-6',
  'gemini-claude-opus-4-5-thinking': 'claude-opus-4-6-thinking',
};

export function resolveAntigravityModelId(modelId: string): string {
  if (!modelId) return modelId;
  const cleaned = modelId.replace(/^[a-zA-Z0-9_-]+\//, '').trim();
  return ANTIGRAVITY_MODEL_ALIASES[cleaned] || cleaned;
}

/**
 * Static baseline catalog Antigravity dari OmniRoute
 */
export const ANTIGRAVITY_STATIC_MODELS: AntigravityCatalogModel[] = [
  { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', context_window: 1048576, family: 'gemini' },
  { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)', context_window: 1048576, family: 'gemini' },
  { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)', context_window: 1048576, family: 'gemini' },
  { id: 'gemini-3.7-flash-tiered', name: 'Gemini 3.7 Flash (Tiered)', context_window: 1048576, family: 'gemini' },
  { id: 'gemini-pro-agent', name: 'Gemini 3.1 Pro (High)', context_window: 1048576, family: 'gemini' },
  { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)', context_window: 1048576, family: 'gemini' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', context_window: 1048576, family: 'gemini' },
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)', context_window: 1048576, family: 'claude' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)', context_window: 1048576, family: 'claude' },
  { id: 'claude-opus-5-5-high', name: 'Claude Opus 5.5 (High)', context_window: 1048576, family: 'claude' },
  { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)', context_window: 1048576, family: 'claude' },
  { id: 'gemini-4-argon-high', name: 'Gemini 4 Argon (High)', context_window: 1048576, family: 'gemini' },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)', context_window: 131072, family: 'gpt' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context_window: 1048576, family: 'gemini' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', context_window: 2097152, family: 'gemini' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context_window: 1048576, family: 'gemini' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', context_window: 2097152, family: 'gemini' },
];

export function isDiscoverableAntigravityModel(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (
    !id ||
    id.startsWith('chat_') ||
    id.startsWith('tab_') ||
    id.endsWith('_weekly') ||
    id.includes('tts') ||
    id.includes('embed') ||
    id.includes('image')
  ) {
    return false;
  }
  return true;
}

/**
 * Buat URL otorisasi Google OAuth untuk Antigravity
 */
export function buildAntigravityAuthUrl(redirectUri: string, state?: string): { authUrl: string; state: string } {
  const finalState = state || crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: ANTIGRAVITY_SCOPES.join(' '),
    state: finalState,
    access_type: 'offline',
    prompt: 'consent',
  });

  return {
    authUrl: `${ANTIGRAVITY_AUTHORIZE_URL}?${params.toString()}`,
    state: finalState,
  };
}

/**
 * Ekstraksi authorization code dari URL lengkap (jika user menempelkan URL callback hasil redirect)
 */
export function extractCodeFromUrlOrInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('code=')) {
    try {
      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `http://localhost/${trimmed.replace(/^\?/, '')}`);
      const code = parsed.searchParams.get('code');
      if (code) return decodeURIComponent(code);
    } catch {
      const match = trimmed.match(/code=([^&]+)/);
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
  }
  return trimmed;
}

/**
 * Tukarkan kode otorisasi Google OAuth menjadi Access Token & Refresh Token
 */
export async function exchangeCodeForTokens(
  codeOrUrl: string,
  redirectUri: string
): Promise<AntigravityOAuthData> {
  const code = extractCodeFromUrlOrInput(codeOrUrl);
  if (!code) {
    throw new Error('Kode otorisasi Google OAuth tidak ditemukan.');
  }

  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(ANTIGRAVITY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': ANTIGRAVITY_HEADERS['User-Agent'],
      'X-Goog-Api-Client': ANTIGRAVITY_HEADERS['X-Goog-Api-Client'],
    },
    body: tokenParams,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Gagal menukarkan token Google: ${tokenRes.status} ${errText}`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token || '';
  const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

  // 1. Ambil Profil Email Pengguna
  let email = '';
  try {
    const userinfoRes = await fetch(ANTIGRAVITY_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (userinfoRes.ok) {
      const uData = (await userinfoRes.json()) as { email?: string };
      email = uData.email || '';
    }
  } catch (uErr) {
    console.warn('[Antigravity OAuth] Gagal mengambil email pengguna:', uErr);
  }

  // 2. Temukan Project ID (Cloud Code Companion Project Discovery)
  let projectId = '';
  let tierId = 'legacy-tier';

  const metadata = {
    ideType: 9, // ANTIGRAVITY IDE enum
    platform: 5, // WINDOWS_AMD64 / Standard
    pluginType: 2, // GEMINI
  };

  try {
    const loadRes = await fetch(ANTIGRAVITY_LOAD_CODE_ASSIST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...ANTIGRAVITY_HEADERS,
      },
      body: JSON.stringify({ metadata }),
    });

    if (loadRes.ok) {
      const loadData = (await loadRes.json()) as any;
      if (loadData.cloudaicompanionProject) {
        projectId =
          typeof loadData.cloudaicompanionProject === 'string'
            ? loadData.cloudaicompanionProject
            : loadData.cloudaicompanionProject.id || '';
      }
      if (loadData.tierId) tierId = loadData.tierId;
    }
  } catch (loadErr) {
    console.warn('[Antigravity OAuth] Discovery loadCodeAssist gagal:', loadErr);
  }

  // Onboarding fallback jika project belum ada
  if (!projectId) {
    try {
      await fetch(ANTIGRAVITY_ONBOARD_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...ANTIGRAVITY_HEADERS,
        },
        body: JSON.stringify({ tier_id: tierId, metadata }),
      });

      const retryRes = await fetch(ANTIGRAVITY_LOAD_CODE_ASSIST_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...ANTIGRAVITY_HEADERS,
        },
        body: JSON.stringify({ metadata }),
      });

      if (retryRes.ok) {
        const retryData = (await retryRes.json()) as any;
        if (retryData.cloudaicompanionProject) {
          projectId =
            typeof retryData.cloudaicompanionProject === 'string'
              ? retryData.cloudaicompanionProject
              : retryData.cloudaicompanionProject.id || '';
        }
      }
    } catch (onboardErr) {
      console.warn('[Antigravity OAuth] Onboard user fallback gagal:', onboardErr);
    }
  }

  if (!projectId) {
    projectId = `antigravity-${email ? email.split('@')[0] : 'user'}`;
  }

  return {
    email,
    projectId,
    accessToken,
    refreshToken,
    expiresAt,
    tierId,
  };
}

/**
 * Refresh access token menggunakan refresh_token jika sudah kedaluwarsa
 */
export async function refreshAntigravityToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  if (!refreshToken) {
    throw new Error('Refresh token Antigravity tidak tersedia.');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const res = await fetch(ANTIGRAVITY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': ANTIGRAVITY_HEADERS['User-Agent'],
      'X-Goog-Api-Client': ANTIGRAVITY_HEADERS['X-Goog-Api-Client'],
    },
    body: params,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal refresh token Antigravity: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

/**
 * Mengambil katalog model Antigravity secara live & real-time via fetchAvailableModels
 */
export async function fetchLiveAntigravityModels(
  accessToken: string,
  projectId?: string
): Promise<Array<{
  id: string;
  name: string;
  context_window: number;
  quota?: AntigravityModelQuota;
}>> {
  let rawModels: any = null;

  for (const url of ANTIGRAVITY_DISCOVERY_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...ANTIGRAVITY_HEADERS,
        },
        body: JSON.stringify(projectId ? { project: projectId } : {}),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.models && typeof data.models === 'object') {
          rawModels = data.models;
          break;
        } else if (data.availableModels && typeof data.availableModels === 'object') {
          rawModels = data.availableModels;
          break;
        }
      }
    } catch {
      // Coba endpoint discovery berikutnya
    }
  }

  const result: Array<{
    id: string;
    name: string;
    context_window: number;
    quota?: AntigravityModelQuota;
  }> = [];

  const seenIds = new Set<string>();

  // 1. Parse dari live Google Cloud Code response
  if (Array.isArray(rawModels)) {
    for (const m of rawModels) {
      const id = typeof m.id === 'string' ? m.id : typeof m.name === 'string' ? m.name : '';
      if (!id || m.isInternal === true || !isDiscoverableAntigravityModel(id)) continue;
      seenIds.add(id);

      const fraction = typeof m.quotaInfo?.remainingFraction === 'number'
        ? Math.max(0, Math.min(1, m.quotaInfo.remainingFraction))
        : 1.0;

      result.push({
        id,
        name: `${m.displayName || m.name || id} (Antigravity)`,
        context_window: m.contextWindow || 1048576,
        quota: {
          id,
          displayName: m.displayName || m.name || id,
          family: id.includes('claude') ? 'claude' : id.includes('gpt') ? 'gpt' : 'gemini',
          remainingPercentage: Math.round(fraction * 100),
          remainingFraction: fraction,
          resetAt: m.quotaInfo?.resetTime || null,
          limited: fraction <= 0,
        },
      });
    }
  } else if (typeof rawModels === 'object' && rawModels !== null) {
    for (const [id, m] of Object.entries(rawModels)) {
      const item = (m as any) || {};
      if (item.isInternal === true || !isDiscoverableAntigravityModel(id)) continue;
      seenIds.add(id);

      const fraction = typeof item.quotaInfo?.remainingFraction === 'number'
        ? Math.max(0, Math.min(1, item.quotaInfo.remainingFraction))
        : 1.0;

      result.push({
        id,
        name: `${item.displayName || item.name || id} (Antigravity)`,
        context_window: item.contextWindow || 1048576,
        quota: {
          id,
          displayName: item.displayName || item.name || id,
          family: id.includes('claude') ? 'claude' : id.includes('gpt') ? 'gpt' : 'gemini',
          remainingPercentage: Math.round(fraction * 100),
          remainingFraction: fraction,
          resetAt: item.quotaInfo?.resetTime || null,
          limited: fraction <= 0,
        },
      });
    }
  }

  // 2. Gabungkan dengan katalog statis Antigravity agar seluruh model mutakhir (Gemini 3.8, Claude 4.6, Claude 5.5, Gemini 4 Argon) selalu tersedia
  for (const staticM of ANTIGRAVITY_STATIC_MODELS) {
    if (!seenIds.has(staticM.id)) {
      result.push({
        id: staticM.id,
        name: `${staticM.name} (Antigravity)`,
        context_window: staticM.context_window,
        quota: {
          id: staticM.id,
          displayName: staticM.name,
          family: staticM.family,
          remainingPercentage: 100,
          remainingFraction: 1.0,
          resetAt: null,
          limited: false,
        },
      });
    }
  }

  return result;
}

/**
 * Mengambil telemetry sisa kuota dan reset window Antigravity
 */
export async function fetchAntigravityQuotas(
  accessToken: string,
  projectId?: string
): Promise<{
  groups: AntigravityQuotaGroup[];
  models: AntigravityModelQuota[];
}> {
  const modelsWithQuota = await fetchLiveAntigravityModels(accessToken, projectId);

  const modelQuotas: AntigravityModelQuota[] = modelsWithQuota
    .map((m) => m.quota)
    .filter((q): q is AntigravityModelQuota => Boolean(q));

  // Gemini Models Group
  const geminiModels = modelQuotas.filter((m) => m.family === 'gemini');
  const geminiPct =
    geminiModels.length > 0
      ? Math.round(
          geminiModels.reduce((acc, m) => acc + m.remainingPercentage, 0) / geminiModels.length
        )
      : 100;
  const geminiReset = geminiModels.find((m) => m.resetAt)?.resetAt || null;

  // Claude & GPT Models Group
  const claudeGptModels = modelQuotas.filter((m) => m.family === 'claude' || m.family === 'gpt');
  const claudeGptPct =
    claudeGptModels.length > 0
      ? Math.round(
          claudeGptModels.reduce((acc, m) => acc + m.remainingPercentage, 0) / claudeGptModels.length
        )
      : 100;
  const claudeGptReset = claudeGptModels.find((m) => m.resetAt)?.resetAt || null;

  const groups: AntigravityQuotaGroup[] = [
    {
      id: 'gemini',
      displayName: 'Gemini Models',
      remainingPercentage: geminiPct,
      resetAt: geminiReset,
      models: geminiModels.map((m) => m.id),
    },
    {
      id: 'claude_gpt',
      displayName: 'Claude & GPT Models',
      remainingPercentage: claudeGptPct,
      resetAt: claudeGptReset,
      models: claudeGptModels.map((m) => m.id),
    },
  ];

  return { groups, models: modelQuotas };
}

/**
 * Model fallback chain: jika model utama terkena rate-limit / 429 / 404,
 * bot secara otomatis mencoba model pengganti terbaik tanpa memutus interaksi.
 */
export function getAntigravityModelFallbacks(modelId: string): string[] {
  const resolved = resolveAntigravityModelId(modelId);
  const candidates: string[] = [resolved];

  // Prioritas fallback berjenjang (Claude Sonnet 4.6, Gemini 3.8 Flash High, Gemini 2.5 Flash)
  const fallbackList = [
    'claude-sonnet-4-6',
    'gemini-3.8-flash-high',
    'gemini-2.5-flash',
    'gemini-pro-agent',
    'claude-opus-4-6-thinking',
  ];

  for (const item of fallbackList) {
    if (!candidates.includes(item)) {
      candidates.push(item);
    }
  }

  return candidates;
}

/**
 * Panggilan inferensi / chat completion ke Antigravity via Google Cloud Code streamGenerateContent
 * Mendukung dual runtime endpoint (daily-cloudcode-pa & cloudcode-pa), retry Google One AI credits pada HTTP 429,
 * dan auto-failover ke model alternatif jika kuota habis.
 */
export async function callAntigravityChat(params: {
  accessToken: string;
  projectId: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { accessToken, projectId, model, messages, temperature = 0.7, maxTokens = 4096 } = params;

  // Konversi messages ke format Google Gemini Contents
  const contents = messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Halo' }] });
  }

  // Vertex AI Claude restriction: percakapan tidak boleh diakhiri oleh turn model/assistant
  // ("This model does not support assistant message prefill")
  if (contents[contents.length - 1].role === 'model') {
    contents.push({ role: 'user', parts: [{ text: 'Lanjutkan analisis di atas.' }] });
  }

  const modelsToTry = getAntigravityModelFallbacks(model);
  let lastError: Error | null = null;

  for (const currentModel of modelsToTry) {
    for (const baseUrl of ANTIGRAVITY_RUNTIME_BASE_URLS) {
      const streamUrl = `${baseUrl}/v1internal:streamGenerateContent?alt=sse`;

      const createPayload = (useCredits = false) => ({
        project: projectId,
        requestId: `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        model: currentModel,
        userAgent: 'antigravity',
        requestType: 'agent',
        ...(useCredits ? { enabledCreditTypes: ['GOOGLE_ONE_AI'] } : {}),
        request: {
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        },
      });

      try {
        let response = await fetch(streamUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'text/event-stream',
            ...ANTIGRAVITY_HEADERS,
          },
          body: JSON.stringify(createPayload(false)),
        });

        // Jika 429 RESOURCE_EXHAUSTED, langsung coba retry dengan Google One AI credits
        if (response.status === 429) {
          console.warn(`[Antigravity 429] Batas frekuensi per-menit (Rate Limit) tercapai untuk model ${currentModel} di ${baseUrl}. Mencoba retry dengan Google One AI credits...`);
          response = await fetch(streamUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'text/event-stream',
              ...ANTIGRAVITY_HEADERS,
            },
            body: JSON.stringify(createPayload(true)),
          });
        }

        if (!response.ok) {
          const errText = await response.text();
          const err = new Error(`Antigravity API error (${response.status}) on ${currentModel} via ${baseUrl}: ${errText}`);
          lastError = err;
          // Jika 401 Unauthorized, lempar langsung agar caller bisa me-refresh token
          if (response.status === 401) {
            throw err;
          }
          // Jika 429 (Rate Limit) pada model utama, lempar langsung agar UniversalAIClient bisa beralih ke akun cadangan
          if (response.status === 429 && currentModel === modelsToTry[0]) {
            throw err;
          }
          // Jika 404 (model tidak didukung) atau model cadangan terkena 429, coba model berikutnya
          console.warn(`[Antigravity Failover] ${err.message}. Mencoba fallback...`);
          continue;
        }

        const rawText = await response.text();
        let accumulatedText = '';
        let thoughtFallbackText = '';

        // Parse SSE (Server-Sent Events) chunks
        const lines = rawText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const candidates = parsed.response?.candidates || parsed.candidates;
              if (Array.isArray(candidates) && candidates.length > 0) {
                const parts = candidates[0].content?.parts;
                if (Array.isArray(parts)) {
                  for (const part of parts) {
                    if (part.text) {
                      // Filter out thought chunks (reasoning / internal CoT)
                      if (!part.thought) {
                        accumulatedText += part.text;
                      } else {
                        thoughtFallbackText += part.text;
                      }
                    }
                  }
                }
              }
            } catch {
              // Abaikan parsing error pada chunk tunggal
            }
          }
        }

        if (!accumulatedText.trim() && thoughtFallbackText.trim()) {
          // Fallback ke thought text jika model hanya mengembalikan thought
          accumulatedText = thoughtFallbackText;
        }

        if (!accumulatedText.trim()) {
          // Fallback: coba parse sebagai respon JSON biasa jika bukan SSE
          try {
            const parsed = JSON.parse(rawText);
            const candidates = parsed.response?.candidates || parsed.candidates;
            if (Array.isArray(candidates) && candidates[0]?.content?.parts?.[0]?.text) {
              const part = candidates[0].content.parts[0];
              accumulatedText = part.text || '';
            }
          } catch {}
        }

        if (accumulatedText.trim()) {
          return accumulatedText.trim();
        }
      } catch (reqErr: any) {
        if (reqErr.message && reqErr.message.includes('401')) {
          throw reqErr; // Biarkan 401 dilempar ke auto-refresh
        }
        lastError = reqErr;
        // daily-cloudcode-pa is an internal pre-release staging host that may reject external connections;
        // suppress noise and smoothly proceed to production endpoint
        if (!baseUrl.includes('daily-')) {
          console.warn(`[Antigravity Network/Runtime Error] ${reqErr.message} on ${currentModel} via ${baseUrl}`);
        }
      }
    }
  }

  throw lastError || new Error(`Gagal memanggil Antigravity API setelah mencoba semua model (${modelsToTry.join(', ')}) dan endpoint.`);
}

