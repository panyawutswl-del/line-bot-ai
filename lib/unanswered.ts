import { log } from '@/lib/log';

// ส่งคำถามที่บอทตอบไม่ได้ไปเก็บใน Google Sheet (ผ่าน Apps Script Web App) — ไม่บล็อกการตอบลูกค้า
export async function logUnansweredQuestion(userId: string, question: string): Promise<void> {
  const url = process.env.UNANSWERED_SHEET_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, question }),
    });
  } catch (err) {
    log.error('unanswered.log_failed', { err: String((err as Error)?.message ?? err) });
  }
}
