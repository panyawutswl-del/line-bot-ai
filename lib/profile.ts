import { Redis } from '@upstash/redis';

export interface CustomerProfile {
  name: string;
  phone: string;
  createdAt: number;
}

// In-memory fallback สำหรับ local dev (ไม่มี env vars)
const localCache = new Map<string, CustomerProfile>();

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
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
