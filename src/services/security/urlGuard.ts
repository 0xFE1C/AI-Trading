import path from 'node:path';

/**
 * Guard URL outbound untuk endpoint yang dikonfigurasi admin (AI provider,
 * watchdog, dsb.). Fitur "fetch URL milik operator" adalah by-design, tetapi
 * titik masuknya tetap wajib divalidasi agar kompromi token admin tidak bisa
 * dipakai memindai jaringan internal.
 *
 * Aturan:
 * - Skema hanya http/https (tolak file:, data:, javascript:, ftp:, dll).
 * - Tidak ada userinfo (user:pass@host) di URL.
 * - Host literal yang jelas-lokal (localhost, *.localhost, *.local, IP
 *   private/loopback/link-local) ditolak KECUALI env
 *   AI_TRADING_ALLOW_LOCAL_FETCH=1 — pintu eksplisit untuk gateway LLM lokal
 *   (mis. Ollama) dan callback OAuth di mesin operator sendiri.
 *
 * Catatan batasan (disengaja): pemeriksaan ini sinkron pada level nama host /
 * IP literal. DNS rebinding saat runtime bukan cakupan guard ini — endpoint
 * tetap milik operator yang sudah memegang token admin.
 */

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const PRIVATE_HOSTNAMES = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i];

function isPrivateIPv6(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    h === '::1' ||
    h === '::' ||
    h.startsWith('fe80:') ||
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('::ffff:127.')
  );
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.some((re) => re.test(h))) return true;
  if (PRIVATE_IPV4.some((re) => re.test(h))) return true;
  if (isPrivateIPv6(h)) return true;
  return false;
}

export interface UrlGuardResult {
  ok: boolean;
  normalized?: string;
  error?: string;
}

// Web-first configuration: izin hostname lokal bisa dikendalikan dari web UI
// (setting `allow_local_fetch`). Setter di-inject setelah DB siap (server boot)
// dan diperbarui saat setting diubah via API — env tetap jadi fallback.
let localFetchAllowedOverride: boolean | null = null;

export function setAllowLocalFetchAllowed(allowed: boolean): void {
  localFetchAllowedOverride = allowed;
}

/**
 * Validasi URL outbound yang dikonfigurasi admin. `allowLocalOverride`
 * dipakai alur yang memang lokal by-design (callback OAuth di mesin operator).
 */
export function validateOutboundUrl(
  rawUrl: string,
  opts?: { allowLocalOverride?: boolean }
): UrlGuardResult {
  const allowLocal =
    opts?.allowLocalOverride === true ||
    localFetchAllowedOverride === true ||
    process.env.AI_TRADING_ALLOW_LOCAL_FETCH === '1';

  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return { ok: false, error: 'URL tidak boleh kosong.' };
  }
  if (rawUrl.includes('\0')) {
    return { ok: false, error: 'URL mengandung karakter tidak valid.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'URL tidak dapat diurai.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: `Skema URL harus http/https (diterima: ${parsed.protocol}).` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URL tidak boleh mengandung userinfo (user:pass@host).' };
  }
  if (!parsed.hostname) {
    return { ok: false, error: 'URL harus memiliki hostname.' };
  }
  if (!allowLocal && isLocalHostname(parsed.hostname)) {
    return {
      ok: false,
      error:
        'Hostname lokal/private ditolak. Untuk gateway LLM lokal (mis. Ollama), set env AI_TRADING_ALLOW_LOCAL_FETCH=1.',
    };
  }

  // Normalisasi: buang hash; path kosong menjadi '/'.
  parsed.hash = '';
  const normalized = parsed.toString();
  return { ok: true, normalized };
}

/**
 * Guard tambahan untuk path file yang dibangun dari komponen (direktori dari
 * env + nama file konstanta): tolak null-byte dan pastikan hasil resolve
 * tetap berada di dalam direktori induk yang dimaksud.
 */
export function assertContainedPath(dirRaw: string, fileName: string): string {
  if (typeof dirRaw !== 'string' || dirRaw.includes('\0') || fileName.includes('\0')) {
    throw new Error('Path mengandung karakter tidak valid.');
  }
  const resolvedDir = path.resolve(dirRaw);
  const resolved = path.resolve(resolvedDir, fileName);
  const rel = path.relative(resolvedDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path keluar dari direktori yang diizinkan.');
  }
  return resolved;
}
