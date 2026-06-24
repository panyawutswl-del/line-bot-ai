import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const DEFAULT_REPLY =
  'ขออภัยค่ะ เรื่องนี้ดิฉันไม่มีข้อมูลในระบบ รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ 0941944122 นะคะ';

function buildPrompt(faqCsv: string, userMessage: string): string {
  return `<role>
คุณคือพนักงานต้อนรับของศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา
</role>

<instructions>
อ่าน <faq> ทั้งหมดก่อน จากนั้นตอบคำถามโดยค้นหาข้อมูลจากคอลัมน์ "คำตอบ" ทุกแถว
แม้คำถามของลูกค้าจะใช้คำต่างจากคอลัมน์ "คำถาม" ในตาราง ก็ให้ตอบจากเนื้อหาในคอลัมน์ "คำตอบ" ที่เกี่ยวข้อง
ตัวอย่าง: ถ้าลูกค้าถามเรื่อง "social media" หรือ "โซเชียลมีเดีย" ให้ค้นหาว่ามีแถวไหนใน <faq> ที่คอลัมน์คำตอบกล่าวถึง Facebook, Instagram หรือช่องทางออนไลน์อื่นๆ แล้วตอบจากนั้น
</instructions>

<constraints>
- ห้ามแต่งข้อมูลที่ไม่มีใน <faq> เช่น ราคา วันเวลา หรือบริการที่ไม่ระบุไว้
- ถ้าค้นหาในคอลัมน์คำตอบทุกแถวแล้วไม่มีข้อมูลที่เกี่ยวข้องเลย ให้ตอบว่า:
  "ขออภัยค่ะ เรื่องนี้ดิฉันไม่มีข้อมูลในระบบ รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ 0941944122 นะคะ"
- โทนภาษา: สุภาพทางการ ใช้ "ค่ะ" ลงท้ายทุกประโยค
- ความยาวคำตอบ: 1-3 ประโยค ตอบเป็นภาษาไทย ห้ามใช้ markdown หรือ bullet point
</constraints>

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
    const call = ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: { maxOutputTokens: 1024 },
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout after 7s')), 7_000),
    );

    const response = await Promise.race([call, timeout]);

    const finishReason = response.candidates?.[0]?.finishReason;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usage = response.usageMetadata as any;
    console.log('[Gemini]', {
      model: 'gemini-1.5-flash',
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
