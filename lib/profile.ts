export interface CustomerProfile {
  name: string;
  phone: string;
  createdAt: number;
}

const profiles = new Map<string, CustomerProfile>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 ชั่วโมง

export function getProfile(userId: string): CustomerProfile | null {
  const p = profiles.get(userId);
  if (!p) return null;
  if (p.createdAt + TTL_MS < Date.now()) { profiles.delete(userId); return null; }
  return p;
}

export function saveProfile(userId: string, name: string, phone: string): void {
  profiles.set(userId, { name, phone, createdAt: Date.now() });
}
