import { kv } from '@vercel/kv';

export interface CustomerProfile {
  name: string;
  phone: string;
  createdAt: number;
}

// In-memory fallback สำหรับ local dev (ไม่มี KV_URL)
const localCache = new Map<string, CustomerProfile>();

function isKvAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function getProfile(userId: string): Promise<CustomerProfile | null> {
  if (!isKvAvailable()) return localCache.get(userId) ?? null;
  try {
    return await kv.get<CustomerProfile>(`profile:${userId}`);
  } catch {
    return null;
  }
}

export async function saveProfile(userId: string, name: string, phone: string): Promise<void> {
  const profile: CustomerProfile = { name, phone, createdAt: Date.now() };
  if (!isKvAvailable()) { localCache.set(userId, profile); return; }
  try {
    // เก็บตลอดไป (ไม่ expire) — ลูกค้ากลับมาครั้งต่อไปไม่ต้องถามใหม่
    await kv.set(`profile:${userId}`, profile);
  } catch (err) {
    console.error('[profile] kv.set failed:', err);
  }
}
