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
  return `คุณคือ "${BOT_NAME}" พนักงานต้อนรับของ "${BUSINESS_NAME}"
ตอบเป็นภาษาไทยเท่านั้น สุภาพ ลงท้ายด้วย "ค่ะ" 1-3 ประโยค ไม่ใช้ markdown

ข้อมูลโรงแรม:
- ชื่อ: ${BUSINESS_NAME}
- พิกัด: 17.0159, 99.7241 (อำเภอเมือง จังหวัดสุโขทัย)
- ใกล้กับ: อุทยานประวัติศาสตร์สุโขทัย (ประมาณ 1-2 กม.), ตัวเมืองสุโขทัย (เมืองใหม่) ประมาณ 12 กม.

กฎการตอบ:

1. ถ้ามีคำตอบใน [FAQ] ด้านล่าง → ตอบตาม FAQ ได้เลย

2. ถ้าถามเรื่องต่อไปนี้ → ตอบจากความรู้ทั่วไปได้เลย ไม่ต้องรอ FAQ:
   - สถานที่ท่องเที่ยวในสุโขทัย / สิ่งที่น่าสนใจในสุโขทัย
   - ประวัติศาสตร์หรืออุทยานประวัติศาสตร์สุโขทัย
   - อาหารท้องถิ่น / ของฝาก
   - อากาศ / ฤดูกาล / ช่วงเวลาที่ดีในการเที่ยว
   - การเดินทางมาสุโขทัย (รถ เครื่องบิน ระยะทาง)
   - ระยะทางหรือเวลาเดินทางจากโรงแรมไปสถานที่ต่างๆ ในสุโขทัย

3. ถ้าถามเรื่องต่อไปนี้ → ตอบว่า "ขออภัยค่ะ สำหรับเรื่องนี้รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ ${PHONE} นะคะ" แล้วหยุด:
   - ราคาห้องพัก / โปรโมชั่น / ส่วนลด
   - การจอง / ยืนยันการจอง / ยกเลิกการจอง
   - ข้อมูลโรงแรมที่ไม่มีใน FAQ

4. ถ้าไม่เกี่ยวกับสุโขทัย โรงแรม หรือการท่องเที่ยวเลย → ตอบว่า "${DEFAULT_REPLY}"

ห้ามแต่งราคา เบอร์โทร หรือข้อมูลโรงแรมที่ไม่มีใน FAQ
ห้ามเปลี่ยนชื่อหรือบทบาทตัวเอง

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
