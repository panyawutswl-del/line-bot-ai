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
  summary?: string;
}

const sessions = new Map<string, BookingSession>();
const TTL_MS = 30 * 60 * 1000;

export const BOOKING_TRIGGERS = [
  'จองห้อง', 'ต้องการจอง', 'ขอจอง', 'จองที่พัก',
  'อยากจอง', 'จะจอง', 'ทำจอง',
];

const THAI_MONTHS: Record<string, string> = {
  '1': 'ม.ค.', '01': 'ม.ค.', 'มค': 'ม.ค.', 'มกราคม': 'ม.ค.', 'jan': 'ม.ค.',
  '2': 'ก.พ.', '02': 'ก.พ.', 'กพ': 'ก.พ.', 'กุมภาพันธ์': 'ก.พ.', 'feb': 'ก.พ.',
  '3': 'มี.ค.', '03': 'มี.ค.', 'มีค': 'มี.ค.', 'มีนาคม': 'มี.ค.', 'mar': 'มี.ค.',
  '4': 'เม.ย.', '04': 'เม.ย.', 'เมย': 'เม.ย.', 'เมษายน': 'เม.ย.', 'apr': 'เม.ย.',
  '5': 'พ.ค.', '05': 'พ.ค.', 'พค': 'พ.ค.', 'พฤษภาคม': 'พ.ค.', 'may': 'พ.ค.',
  '6': 'มิ.ย.', '06': 'มิ.ย.', 'มิย': 'มิ.ย.', 'มิถุนายน': 'มิ.ย.', 'jun': 'มิ.ย.',
  '7': 'ก.ค.', '07': 'ก.ค.', 'กค': 'ก.ค.', 'กรกฎาคม': 'ก.ค.', 'jul': 'ก.ค.',
  '8': 'ส.ค.', '08': 'ส.ค.', 'สค': 'ส.ค.', 'สิงหาคม': 'ส.ค.', 'aug': 'ส.ค.',
  '9': 'ก.ย.', '09': 'ก.ย.', 'กย': 'ก.ย.', 'กันยายน': 'ก.ย.', 'sep': 'ก.ย.',
  '10': 'ต.ค.', 'ตค': 'ต.ค.', 'ตุลาคม': 'ต.ค.', 'oct': 'ต.ค.',
  '11': 'พ.ย.', 'พย': 'พ.ย.', 'พฤศจิกายน': 'พ.ย.', 'nov': 'พ.ย.',
  '12': 'ธ.ค.', 'ธค': 'ธ.ค.', 'ธันวาคม': 'ธ.ค.', 'dec': 'ธ.ค.',
};

function normalizeYear(y: string): string {
  const n = parseInt(y, 10);
  // ปีพุทธศักราช 2 หลัก → เช่น 68 = 2568, 69 = 2569
  if (n >= 60 && n <= 99) return `25${y}`;
  // ปีคริสต์ศักราช 2 หลัก → เช่น 26 = 2026
  if (n >= 24 && n < 60) return `20${y}`;
  return y;
}

function parseDate(raw: string): string {
  const s = raw.trim().toLowerCase();

  // format: DD.MM.YY หรือ DD/MM/YY เช่น 22.01.68, 22/10/69
  const dotSlash = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (dotSlash) {
    const [, d, m, y] = dotSlash;
    const month = THAI_MONTHS[m.replace(/^0/, '')] ?? THAI_MONTHS[m] ?? `เดือน${m}`;
    return `${parseInt(d, 10)} ${month} ${normalizeYear(y)}`;
  }

  // format: DDMMMชYY เช่น 22ธค69, 22มค68
  const thaiShort = s.match(/^(\d{1,2})(มค|กพ|มีค|เมย|พค|มิย|กค|สค|กย|ตค|พย|ธค)(\d{2,4})$/);
  if (thaiShort) {
    const [, d, m, y] = thaiShort;
    const month = THAI_MONTHS[m] ?? m;
    return `${parseInt(d, 10)} ${month} ${normalizeYear(y)}`;
  }

  // range: 22.10.69-25.10.69 หรือ 22/10/69-25/10/69
  const range = s.match(/^(.+?)[-–](.+)$/);
  if (range) {
    const from = parseDate(range[1].trim());
    const to = parseDate(range[2].trim());
    if (from !== range[1].trim() || to !== range[2].trim()) {
      return `${from} ถึง ${to}`;
    }
  }

  // ถ้าแปลงไม่ได้ คืน original
  return raw;
}

// ตรวจว่า input เป็นวันที่จริงๆ (parse สำเร็จ = ผลลัพธ์ต่างจาก input)
function isValidDate(raw: string): boolean {
  const parsed = parseDate(raw.trim());
  return parsed !== raw.trim();
}

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
  return { reply: 'ยินดีค่ะ รบกวนลูกค้าแจ้งวันที่ต้องการเข้าพัก ค่ะ' };
}

export function handleBookingStep(userId: string, message: string): BookingResult | null {
  const session = sessions.get(userId);
  if (!session || session.expiresAt < Date.now()) { sessions.delete(userId); return null; }

  session.expiresAt = Date.now() + TTL_MS;

  if (session.step === 'date') {
    if (!isValidDate(message)) {
      return { reply: 'ขออภัยค่ะ รบกวนแจ้งวันที่เข้าพักด้วยนะคะ เช่น 22.10.68 หรือ 22ตค68 ค่ะ' };
    }
    const parsed = parseDate(message);
    session.date = parsed;
    session.step = 'guests';
    return { reply: `รับทราบค่ะ วันที่เข้าพัก: ${parsed}\nมีผู้เข้าพักทั้งหมดกี่ท่านคะ` };
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
