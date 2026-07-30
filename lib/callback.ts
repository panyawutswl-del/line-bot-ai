import { isValidPhone, normalizePhone } from '@/lib/booking';

interface CallbackSession {
  question: string;
  expiresAt: number;
}

const sessions = new Map<string, CallbackSession>();
const TTL_MS = 30 * 60 * 1000;

export const UNKNOWN_INFO_MESSAGE =
  'ขออภัยค่ะ ใบบัวเป็นเพียงแชทบอทที่ให้ข้อมูลเบื้องต้นได้เท่านั้น อาจมีข้อมูลไม่ครบถ้วนหรือไม่ทราบในบางเรื่อง รบกวนขอเบอร์โทรติดต่อด้วยนะคะ เพื่อให้พนักงานโรงแรมติดต่อกลับโดยเร็วที่สุดค่ะ';

export function hasActiveCallbackRequest(userId: string): boolean {
  const s = sessions.get(userId);
  if (!s) return false;
  if (s.expiresAt < Date.now()) { sessions.delete(userId); return false; }
  return true;
}

export function startCallbackRequest(userId: string, question: string): string {
  sessions.set(userId, { question, expiresAt: Date.now() + TTL_MS });
  return UNKNOWN_INFO_MESSAGE;
}

export interface CallbackResult {
  reply: string;
  phone?: string;
  question?: string;
}

export function handleCallbackStep(userId: string, message: string): CallbackResult | null {
  const session = sessions.get(userId);
  if (!session || session.expiresAt < Date.now()) { sessions.delete(userId); return null; }

  if (!isValidPhone(message)) {
    session.expiresAt = Date.now() + TTL_MS;
    return { reply: 'ขออภัยค่ะ รบกวนใส่เบอร์โทรศัพท์จริงให้ครบ 10 หลัก เช่น 0941944122 นะคะ' };
  }

  const phone = normalizePhone(message);
  const question = session.question;
  sessions.delete(userId);
  return {
    reply: 'ขอบคุณค่ะ ดิฉันได้รับเบอร์ติดต่อแล้ว พนักงานโรงแรมจะติดต่อกลับโดยเร็วที่สุดนะคะ',
    phone,
    question,
  };
}
