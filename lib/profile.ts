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

export async function getProfile(userId: string): Promise<CustomerProfile | null> {
  const redis = getRedis();
  if (!redis) return localCache.get(userId) ?? null;
  try {
    return await redis.get<CustomerProfile>(`profile:${userId}`);
  } catch {
    return null;
  }
}

export async function saveProfile(userId: string, name: string, phone: string): Promise<void> {
  const profile: CustomerProfile = { name, phone, createdAt: Date.now() };
  const redis = getRedis();
  if (!redis) { localCache.set(userId, profile); return; }
  try {
    await redis.set(`profile:${userId}`, profile);
  } catch (err) {
    console.error('[profile] redis.set failed:', err);
  }
}
