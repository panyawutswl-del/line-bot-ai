import { saveProfile } from '@/lib/profile';

interface OnboardingSession {
  step: 'name';
  expiresAt: number;
}

const sessions = new Map<string, OnboardingSession>();
const TTL_MS = 10 * 60 * 1000; // 10 นาที

const WELCOME =
  'สวัสดีค่ะ ยินดีต้อนรับสู่ ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา ดิฉันเป็นแชตบอทชื่อ ใบบัว เป็นผู้ช่วยพนักงานต้อนรับ ยินดีให้บริการค่ะ\n\nก่อนอื่นรบกวนขอทราบชื่อลูกค้าหน่อยนะคะ';

export function startOnboarding(userId: string): string {
  sessions.set(userId, { step: 'name', expiresAt: Date.now() + TTL_MS });
  return WELCOME;
}

export function hasActiveOnboarding(userId: string): boolean {
  const s = sessions.get(userId);
  if (!s) return false;
  if (s.expiresAt < Date.now()) { sessions.delete(userId); return false; }
  return true;
}

export interface OnboardingResult {
  reply: string;
  done: boolean;
}

export async function handleOnboardingStep(userId: string, message: string): Promise<OnboardingResult | null> {
  const session = sessions.get(userId);
  if (!session || session.expiresAt < Date.now()) { sessions.delete(userId); return null; }

  session.expiresAt = Date.now() + TTL_MS;

  if (session.step === 'name') {
    const name = message.trim();
    await saveProfile(userId, name, '');
    sessions.delete(userId);
    return {
      reply: `ขอบคุณค่ะ คุณ${name} มีอะไรให้ใบบัวช่วยได้บ้างคะ`,
      done: true,
    };
  }

  return null;
}
