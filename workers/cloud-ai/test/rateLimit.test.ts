import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { checkDeviceQuota, checkIpQuota, recordUsage } from '../src/rateLimit';
import type { Env } from '../src/types';

const testEnv = env as unknown as Env;

beforeEach(async () => {
  // Clear all KV entries between tests using the test KV namespace.
  const keys = await testEnv.RATE_LIMIT.list();
  for (const key of keys.keys) {
    await testEnv.RATE_LIMIT.delete(key.name);
  }
});

describe('checkDeviceQuota', () => {
  it('returns full quota for a new device', async () => {
    const quota = await checkDeviceQuota({ ...testEnv, DAILY_QUOTA: '50', IP_DAILY_QUOTA: '200' }, 'device-1');
    expect(quota.used).toBe(0);
    expect(quota.remaining).toBe(50);
    expect(quota.total).toBe(50);
    expect(quota.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('reflects usage after recordUsage calls', async () => {
    const testEvn = { ...testEnv, DAILY_QUOTA: '50', IP_DAILY_QUOTA: '200' };
    await recordUsage(testEvn, 'device-2', '127.0.0.1');
    await recordUsage(testEvn, 'device-2', '127.0.0.1');
    const quota = await checkDeviceQuota(testEvn, 'device-2');
    expect(quota.used).toBe(2);
    expect(quota.remaining).toBe(48);
  });

  it('clamps remaining to 0 when quota exceeded', async () => {
    const testEvn = { ...testEnv, DAILY_QUOTA: '2', IP_DAILY_QUOTA: '200' };
    await recordUsage(testEvn, 'device-3', '10.0.0.1');
    await recordUsage(testEvn, 'device-3', '10.0.0.1');
    await recordUsage(testEvn, 'device-3', '10.0.0.1');
    const quota = await checkDeviceQuota(testEvn, 'device-3');
    expect(quota.remaining).toBe(0);
  });
});

describe('checkIpQuota', () => {
  it('allows a new IP', async () => {
    const ok = await checkIpQuota({ ...testEnv, DAILY_QUOTA: '50', IP_DAILY_QUOTA: '3' }, '1.2.3.4');
    expect(ok).toBe(true);
  });

  it('blocks an IP that has hit the cap', async () => {
    const testEvn = { ...testEnv, DAILY_QUOTA: '50', IP_DAILY_QUOTA: '2' };
    await recordUsage(testEvn, 'd1', '5.5.5.5');
    await recordUsage(testEvn, 'd2', '5.5.5.5');
    await recordUsage(testEvn, 'd3', '5.5.5.5');
    const ok = await checkIpQuota(testEvn, '5.5.5.5');
    expect(ok).toBe(false);
  });
});
