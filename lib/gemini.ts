import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const DEFAULT_REPLY =
  'ขออภัยค่ะ เรื่องนี้ดิฉันไม่มีข้อมูลในระบบ รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ 0941944122 นะคะ';

function buildPrompt(faqCsv: string, userMessage: string): string {
  return `<role>
คุณคือพนักงานต้อนรับของศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามแต่งราคา เวลา หรือที่ตั้งขึ้นมาเอง
- ถ้าไม่มีข้อมูลใน <faq> ที่ตรงกับคำถาม ให้ตอบด้วยข้อความนี้เท่านั้น:
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

export async function generateReply(faqCsv: string, userMessage: string): Promise<string> {
  const prompt = buildPrompt(faqCsv, userMessage);

  try {
    const geminiCall = ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        maxOutputTokens: 1024,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout after 7s')), 7_000),
    );

    const response = await Promise.race([geminiCall, timeoutPromise]);

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usage = response.usageMetadata as any;

    console.log('[Gemini]', {
      finishReason,
      thoughtsTokenCount: usage?.thoughtsTokenCount,
      candidatesTokenCount: usage?.candidatesTokenCount,
      totalTokenCount: usage?.totalTokenCount,
    });

    if (finishReason === 'MAX_TOKENS') {
      console.warn('[Gemini] MAX_TOKENS — returning default reply');
      return DEFAULT_REPLY;
    }

    const text = response.text;
    return (typeof text === 'string' ? text : '').trim() || DEFAULT_REPLY;
  } catch (err) {
    console.error('[Gemini] Error:', err);
    return DEFAULT_REPLY;
  }
}
