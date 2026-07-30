const lastGreeted = new Map<string, string>(); // userId → YYYY-MM-DD (Asia/Bangkok)

function todayInBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

// true ถ้ายังไม่เคยทักลูกค้าคนนี้วันนี้ (นับเป็นเวลาไทย) — เรียกครั้งเดียวก็ mark ว่าทักแล้ว
export function shouldSendDailyWelcome(userId: string): boolean {
  const today = todayInBangkok();
  if (lastGreeted.get(userId) === today) return false;
  lastGreeted.set(userId, today);
  return true;
}

const GREETING_WORDS = [
  'สวัสดี', 'สวัสดีค่ะ', 'สวัสดีค่า', 'สวัสดีครับ',
  'หวัดดี', 'หวัดดีค่ะ', 'หวัดดีครับ',
  'ดีค่ะ', 'ดีครับ', 'hi', 'hello', 'hey',
];

// ทักทายเฉยๆ ไม่มีคำถามจริง (ตัดเครื่องหมาย/อีโมจิท้ายประโยคออกก่อนเทียบ)
export function isGreetingOnly(message: string): boolean {
  const clean = message.trim().toLowerCase().replace(/[\s!.,😊🙏👋😀🙂❤️]+$/g, '');
  return GREETING_WORDS.includes(clean);
}
