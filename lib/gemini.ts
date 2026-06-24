import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const DEFAULT_REPLY =
  'ขออภัยค่ะ เรื่องนี้ดิฉันไม่มีข้อมูลในระบบ รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ 0941944122 นะคะ';

function buildPrompt(faqCsv: string, userMessage: string): string {
  return `<role>
คุณคือพนักงานต้อนรับของศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามแต่งราคา เวลา หรือที่ตั้งขึ้นมาเอง
- อ่านข้อมูลใน <faq> ทั้งหมดก่อน แล้วตอบโดยใช้ข้อมูลที่เกี่ยวข้องกับคำถาม แม้คำถามจะไม่ตรงกับ "คำถาม" ในตารางทุกคำ
- ถ้าใน <faq> ไม่มีข้อมูลที่เกี่ยวข้องกับคำถามเลย ให้ตอบด้วยข้อความนี้เท่านั้น:
  "ขออภัยค่ะ เรื่องนี้ดิฉันไม่มีข้อมูลในระบบ รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ 0941944122 นะคะ"
- โทนภาษา: สุภาพทางการ ใช้ "ค่ะ" ลงท้ายทุกประโยค
- ความยาวคำตอบ: 1-3 ประโยค
</constraints>

<output_format>
ตอบเป็นภาษาไทยเท่านั้น ห้ามใช้ markdown ห้ามใช้ bullet point
</output_format>

<faq>
${faqCsv}
</faq>

<question>
${userMessage}
</question>`;
}

function is503(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return (
    e['status'] === 503 ||
    String(e['message'] ?? '').includes('503') ||
    String(e['message'] ?? '').includes('UNAVAILABLE')
  );
}

async function callModel(
  model: string,
  prompt: string,
  withThinking: boolean,
  timeoutMs: number,
): Promise<GenerateContentResponse> {
  const call = ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      maxOutputTokens: 1024,
      ...(withThinking ? { thinkingConfig: { thinkingBudget: 2048 } } : {}),
    },
  });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs),
  );

  return Promise.race([call, timeout]);
}

function parseResponse(response: GenerateContentResponse, model: string): string | null {
  const finishReason = response.candidates?.[0]?.finishReason;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = response.usageMetadata as any;
  console.log('[Gemini]', {
    model,
    finishReason,
    thoughtsTokenCount: usage?.thoughtsTokenCount,
    candidatesTokenCount: usage?.candidatesTokenCount,
    totalTokenCount: usage?.totalTokenCount,
  });

  if (finishReason === 'MAX_TOKENS') {
    console.warn('[Gemini] MAX_TOKENS — returning default reply');
    return null;
  }

  const text = response.text;
  return (typeof text === 'string' ? text : '').trim() || null;
}

export async function generateReply(faqCsv: string, userMessage: string): Promise<string> {
  const prompt = buildPrompt(faqCsv, userMessage);

  // Primary: gemini-2.0-flash — GA stable, ไม่มี 503 preview capacity issue
  try {
    const response = await callModel('gemini-2.0-flash', prompt, false, 6_000);
    return parseResponse(response, 'gemini-2.0-flash') ?? DEFAULT_REPLY;
  } catch (err) {
    if (is503(err)) {
      console.warn('[Gemini] 503 on gemini-2.0-flash — falling back to gemini-1.5-flash');
    } else {
      console.error('[Gemini] Primary error:', err);
      return DEFAULT_REPLY;
    }
  }

  // Fallback: gemini-1.5-flash (ultra stable)
  try {
    const response = await callModel('gemini-1.5-flash', prompt, false, 3_000);
    return parseResponse(response, 'gemini-1.5-flash') ?? DEFAULT_REPLY;
  } catch (err) {
    console.error('[Gemini] Fallback error:', err);
    return DEFAULT_REPLY;
  }
}
