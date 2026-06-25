export const BOOKING_LINK = 'https://hotels.cloudbeds.com/reservation/mQSabb';

type BookingStep = 'date' | 'guests' | 'phone';

interface BookingSession {
  step: BookingStep;
  date?: string;
  guests?: string;
  expiresAt: number;
}

export interface BookingResult {
  reply: string;
  summary?: string; // มีเมื่อจบ flow — ใช้แจ้งแอดมิน
}

const sessions = new Map<string, BookingSession>();
const TTL_MS = 30 * 60 * 1000;

export const BOOKING_TRIGGERS = [
  'จองห้อง', 'ต้องการจอง', 'ขอจอง', 'จองที่พัก',
  'อยากจอง', 'จะจอง', 'ทำจอง',
];

export function isBookingTrigger(message: string): boolean {
  return BOOKING_TRIGGERS.some((t) => message.includes(t));
}

export function hasActiveBooking(userId: string): boolean {
  const s = sessions.get(userId);
  if (!s) return false;
  if (s.expiresAt < Date.now()) { sessions.delete(userId); return false; }
  return true;
}

export function startBooking(userId: string): BookingResult {
  sessions.set(userId, { step: 'date', expiresAt: Date.now() + TTL_MS });
  return { reply: 'ยินดีช่วยค่ะ รบกวนแจ้งวันที่ต้องการเข้าพัก และวันที่ออกด้วยนะคะ (เช่น เข้า 20 ก.ค. ออก 22 ก.ค.)' };
}

export function handleBookingStep(userId: string, message: string): BookingResult | null {
  const session = sessions.get(userId);
  if (!session || session.expiresAt < Date.now()) { sessions.delete(userId); return null; }

  session.expiresAt = Date.now() + TTL_MS;

  if (session.step === 'date') {
    session.date = message;
    session.step = 'guests';
    return { reply: 'ขอบคุณค่ะ มีผู้เข้าพักทั้งหมดกี่ท่านคะ' };
  }

  if (session.step === 'guests') {
    session.guests = message;
    session.step = 'phone';
    return { reply: `ขอบคุณค่ะ รบกวนขอเบอร์ติดต่อด้วยนะคะ\nหรือถ้าต้องการจองเองได้เลยที่ ${BOOKING_LINK} ค่ะ` };
  }

  if (session.step === 'phone') {
    const summary = `วันเข้าพัก: ${session.date}\nจำนวนผู้เข้าพัก: ${session.guests}\nเบอร์ติดต่อ: ${message}`;
    sessions.delete(userId);
    return {
      reply: `ขอบคุณค่ะ สรุปข้อมูลการจอง:\n${summary}\n\nดิฉันจะแจ้งเจ้าหน้าที่ติดต่อกลับเพื่อยืนยันการจองนะคะ`,
      summary,
    };
  }

  return null;
}

export function clearBooking(userId: string): void {
  sessions.delete(userId);
}
