import { Redis } from '@upstash/redis';
import { log } from '@/lib/log';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const GREETED_TTL_SEC = 30 * 60 * 60; // 30 ชม. — กันวันเปลี่ยนเขตเวลา ไม่ต้องเก็บ key ตลอดไป

function todayInBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

// true ถ้ายังไม่เคยทักลูกค้าคนนี้วันนี้ (นับเป็นเวลาไทย) — เรียกครั้งเดียวก็ mark ว่าทักแล้ว
// เก็บผ่าน Redis (ไม่ใช่ in-memory) เพราะ Vercel serverless ไม่รับประกัน instance เดิมทุก request
// ถ้า Redis ล่ม/เรียกไม่ได้ → ข้าม feature นี้ไปเลย (คืน false) ห้ามให้ throw หลุดขึ้นไป
// เพราะจะทำให้ทั้ง webhook ตอบ DEFAULT_REPLY ทุกข้อความ ไม่ว่าลูกค้าจะถามอะไรก็ตาม
export async function shouldSendDailyWelcome(userId: string): Promise<boolean> {
  const key = `greeted:${userId}:${todayInBangkok()}`;
  try {
    const result = await redis.set(key, '1', { nx: true, ex: GREETED_TTL_SEC });
    return result === 'OK';
  } catch (err) {
    log.error('greeting.redis_unavailable', { err: String((err as Error)?.message ?? err) });
    return false;
  }
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
