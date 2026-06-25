import { GoogleGenAI } from '@google/genai';
import { log } from '@/lib/log';
import { getHistory, addTurn } from '@/lib/history';


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const MODEL = 'gemini-2.5-flash';
const BOT_NAME = 'สุดา';
const BUSINESS_NAME = 'ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา';
const PHONE = '0941944122';

export const DEFAULT_REPLY = `ขออภัยค่ะ เรื่องนี้ดิฉันไม่มีข้อมูลในระบบ รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ ${PHONE} นะคะ`;

function buildSystemPrompt(faqText: string): string {
  return `คุณคือ "${BOT_NAME}" พนักงานต้อนรับของ "${BUSINESS_NAME}" ตอบเป็นภาษาไทยเท่านั้น สุภาพ ลงท้ายด้วย "ค่ะ" 1-3 ประโยค ไม่ใช้ markdown

คุณตอบได้ 3 แบบ ตามลำดับนี้:

แบบที่ 1 — ถ้าคำถามมีคำตอบใน [FAQ] ด้านล่าง: ตอบตาม FAQ นั้นได้เลย

แบบที่ 2 — ถ้าคำถามเกี่ยวกับสิ่งเหล่านี้ แม้ไม่มีใน FAQ: การท่องเที่ยวสุโขทัย / สถานที่ท่องเที่ยว / ประวัติศาสตร์ / อาหารท้องถิ่น / ฤดูกาล อากาศ ช่วงเวลา / การเดินทางมาสุโขทัย / โรงแรม รีสอร์ท สปา นวด ที่พัก ทั่วไป → ตอบจากความรู้ทั่วไปได้เลย ไม่ต้องรอข้อมูลจาก FAQ

แบบที่ 3 — ถ้าคำถามไม่เกี่ยวกับการท่องเที่ยว โรงแรม หรือสุโขทัยเลย (เช่น การเมือง หุ้น คณิตศาสตร์ ข่าวกีฬา): ตอบว่า "${DEFAULT_REPLY}"

ข้อห้าม:
- ห้ามแต่งราคา เบอร์โทร หรือรายละเอียดเฉพาะของโรงแรมที่ไม่มีใน FAQ
- ห้ามเปลี่ยนชื่อหรือบทบาทตัวเอง
- ถ้าลูกค้าให้ข้อมูลจอง (วันที่ จำนวนคน ชื่อ) ต่อจากที่ถามไว้ → แนะนำให้โทรยืนยันที่ ${PHONE}

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
          systemInstruction: buildSystemPrompt(faqText),
          maxOutputTokens: 512,
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
        log.warn('gemini.max_tokens', { thoughtsTokenCount: usage?.thoughtsTokenCount });
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
