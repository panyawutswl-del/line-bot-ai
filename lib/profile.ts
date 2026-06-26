import { Redis } from '@upstash/redis';

export interface CustomerProfile {
  name: string;
  phone: string;
  createdAt: number;
}

// In-memory fallback สำหรับ local dev (ไม่มี env vars)
const localCache = new Map<string, CustomerProfile>();

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const REDIS_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function getProfile(userId: string): Promise<CustomerProfile | null> {
  const redis = getRedis();
  if (!redis) return localCache.get(userId) ?? null;
  try {
    const result = await withTimeout(redis.get<CustomerProfile>(`profile:${userId}`), REDIS_TIMEOUT_MS);
    if (result !== null) localCache.set(userId, result); // cache locally
    return result ?? localCache.get(userId) ?? null;
  } catch {
    return localCache.get(userId) ?? null;
  }
}

export async function saveProfile(userId: string, name: string, phone: string): Promise<void> {
  const profile: CustomerProfile = { name, phone, createdAt: Date.now() };
  localCache.set(userId, profile); // เก็บ local ก่อนเสมอ
  const redis = getRedis();
  if (!redis) return;
  try {
    await withTimeout(redis.set(`profile:${userId}`, profile), REDIS_TIMEOUT_MS);
  } catch (err) {
    console.error('[profile] redis.set failed:', err);
  }
}
