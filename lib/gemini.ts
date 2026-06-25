import { GoogleGenAI } from '@google/genai';
import { log } from '@/lib/log';
import { getHistory, addTurn } from '@/lib/history';


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const MODEL = 'gemini-2.5-flash';
const BOT_NAME = 'สุดา';
const BUSINESS_NAME = 'ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา';
const PHONE = '0941944122';

export const DEFAULT_REPLY = `ขออภัยค่ะ เรื่องนี้ดิฉันไม่มีข้อมูลในระบบ รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ ${PHONE} นะคะ`;

function buildSystemPrompt(faqText: string, customerName?: string): string {
  const nameHint = customerName ? `\nชื่อลูกค้า: ${customerName} (เรียกลูกค้าว่า "คุณ${customerName}" เมื่อเหมาะสม)` : '';
  return `คุณคือ "${BOT_NAME}" พนักงานต้อนรับของ "${BUSINESS_NAME}"
ตอบภาษาไทย สุภาพ ลงท้าย "ค่ะ" ห้ามใช้ markdown ตอบกระชับมีสาระ ไม่เกิน 5-7 ประโยค${nameHint}

ข้อมูลโรงแรม (ใช้ตอบได้เลย):
ที่ตั้ง: ติดอุทยานประวัติศาสตร์สุโขทัย อ.เมือง จ.สุโขทัย
ระยะทาง: อุทยานสุโขทัย 1-2 กม., ตัวเมืองสุโขทัย 12 กม., ศรีสัชนาลัย 55 กม., สนามบินสุโขทัย 25 กม., พิษณุโลก 60 กม.

สิ่งที่ตอบได้เสมอ (ตอบจากความรู้ทั่วไป ไม่ต้องรอ FAQ):
- แนะนำที่เที่ยวสุโขทัย, สถานที่น่าสนใจ, ประวัติศาสตร์
- ร้านอาหาร, อาหารท้องถิ่น, ของฝาก
- อากาศ, ฤดูกาล, ช่วงเวลาที่ดีในการเที่ยว
- การเดินทางมาสุโขทัย
- ระยะทางจากโรงแรมไปสถานที่ต่างๆ

สิ่งที่ห้ามตอบ (ให้บอกโทร ${PHONE}):
- ราคาห้องพัก, โปรโมชั่น, ส่วนลด

คำถามที่ไม่เกี่ยวกับโรงแรม/ท่องเที่ยว/สุโขทัยเลย → ตอบว่า "${DEFAULT_REPLY}"

ถ้ามีคำตอบใน FAQ ด้านล่าง ให้ตอบตาม FAQ ก่อน

[FAQ]
${faqText}`;
}

function isRetryable(err: unknown): boolean {
  const msg = String((err as Record<string, unknown>)?.message ?? '');
  return msg.includes('503') || msg.includes('UNAVAILABLE');
}

export async function generateReply(
  userId: string,
  userMessage: string,
  faqText: string,
  customerName?: string,
): Promise<string> {
  const start = Date.now();

  // Build multi-turn contents from history + current message
  const history = getHistory(userId);
  const contents = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const timeoutMs = attempt === 1 ? 8_000 : 4_000;

      const call = ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: buildSystemPrompt(faqText, customerName),
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`gemini_timeout_attempt_${attempt}`)), timeoutMs),
      );

      const response = await Promise.race([call, timeout]);

      const finishReason = response.candidates?.[0]?.finishReason;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usage = response.usageMetadata as any;

      log.info('gemini.reply', {
        attempt,
        latencyMs: Date.now() - start,
        finishReason: finishReason ?? '',
        thoughtsTokenCount: usage?.thoughtsTokenCount ?? 0,
        candidatesTokenCount: usage?.candidatesTokenCount ?? 0,
        totalTokenCount: usage?.totalTokenCount ?? 0,
        replyLength: response.text?.length ?? 0,
      });

      if (finishReason === 'MAX_TOKENS') {
        log.warn('gemini.max_tokens', { candidatesTokenCount: usage?.candidatesTokenCount });
        // ส่ง reply จริงแทน DEFAULT_REPLY — ตัดข้อความสั้นลงให้ลงท้ายด้วย "ค่ะ"
        const truncated = response.text?.trim() ?? '';
        if (truncated) return truncated.endsWith('ค่ะ') ? truncated : truncated + '...(ติดต่อเพิ่มเติมที่ ' + PHONE + ' ค่ะ)';
        return DEFAULT_REPLY;
      }

      const text = response.text?.trim();
      if (!text) throw new Error('gemini_empty_response');

      // ไม่บันทึก default reply ลง history เพราะ context เสีย
      if (text !== DEFAULT_REPLY) {
        addTurn(userId, userMessage, text);
      }
      return text;
    } catch (err) {
      if (isRetryable(err) && attempt < 3) {
        log.warn('gemini.503_retry', { attempt });
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      log.error('gemini.failed', {
        attempt,
        latencyMs: Date.now() - start,
        err: String((err as Error)?.message ?? err),
      });
      return DEFAULT_REPLY;
    }
  }

  return DEFAULT_REPLY;
}
