import type { Env, QuotaInfo, QuotaRecord } from './types';

/** Return the current UTC date as YYYY-MM-DD. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Compute next UTC midnight as ISO 8601 string. */
function nextMidnightUtc(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return next.toISOString();
}

function kvKey(prefix: 'quota' | 'ip', id: string): string {
  return `${prefix}:${id}:${todayUtc()}`;
}

/** Read current quota usage for a device (or IP hash). Returns 0 if no record. */
async function readCount(kv: KVNamespace, key: string): Promise<number> {
  const raw = await kv.get(key, 'json') as QuotaRecord | null;
  return raw?.count ?? 0;
}

/**
 * Increment the quota counter for a device.
 * Returns the new count AFTER incrementing.
 * TTL = 48h so yesterday's keys are cleaned automatically.
 */
async function increment(kv: KVNamespace, key: string): Promise<number> {
  const raw = await kv.get(key, 'json') as QuotaRecord | null;
  const record: QuotaRecord = {
    count: (raw?.count ?? 0) + 1,
    firstSeen: raw?.firstSeen ?? new Date().toISOString(),
  };
  await kv.put(key, JSON.stringify(record), { expirationTtl: 172800 });
  return record.count;
}

/**
 * Check whether the device has quota remaining.
 * Returns the quota info — caller decides whether to 429.
 */
export async function checkDeviceQuota(env: Env, deviceId: string): Promise<QuotaInfo> {
  const key = kvKey('quota', deviceId);
  const used = await readCount(env.RATE_LIMIT, key);
  const total = parseInt(env.DAILY_QUOTA, 10);
  return {
    used,
    remaining: Math.max(0, total - used),
    total,
    resetAt: nextMidnightUtc(),
  };
}

/**
 * Check IP-level quota (anti-spoofing layer).
 * SHA-256 hash the raw IP to avoid storing PII in KV keys.
 */
export async function checkIpQuota(env: Env, ip: string): Promise<boolean> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const key = kvKey('ip', hashHex);
  const used = await readCount(env.RATE_LIMIT, key);
  const cap = parseInt(env.IP_DAILY_QUOTA, 10);
  return used < cap;
}

/**
 * Record a successful request — increments both device and IP counters.
 * Call this AFTER the first chunk has been sent to avoid counting failed requests.
 */
export async function recordUsage(env: Env, deviceId: string, ip: string): Promise<void> {
  const deviceKey = kvKey('quota', deviceId);
  await increment(env.RATE_LIMIT, deviceKey);

  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const ipKey = kvKey('ip', hashHex);
  await increment(env.RATE_LIMIT, ipKey);
}
