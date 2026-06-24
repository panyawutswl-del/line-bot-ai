const PAUSE_TTL_MS = 2 * 60 * 60 * 1000; // 2 ชั่วโมง

const paused = new Map<string, number>(); // userId → expiresAt

export function pauseUser(userId: string): void {
  paused.set(userId, Date.now() + PAUSE_TTL_MS);
}

export function isPaused(userId: string): boolean {
  const expiresAt = paused.get(userId);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    paused.delete(userId);
    return false;
  }
  return true;
}
