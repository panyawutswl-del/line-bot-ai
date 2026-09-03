import { GoogleGenAI, createPartFromFunctionResponse, type Content } from '@google/genai';
import { log } from '@/lib/log';
import { getHistory, addTurn } from '@/lib/history';
import { TOOLS } from '@/lib/agents/tools-schema';
import { checkRoomAvailability, getRoomDetails, getBookingLink } from '@/lib/agents/cloudbeds';
import { searchTouristInfo } from '@/lib/agents/places';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const MODEL = 'gemini-2.5-flash';
const BOT_NAME = 'ใบบัว';
const BUSINESS_NAME = 'ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา';
const PHONE = '0941944122';

export const DEFAULT_REPLY = `ขออภัยค่ะ เรื่องนี้ดิฉันไม่มีข้อมูลในระบบ รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ ${PHONE} นะคะ`;

// webhook มี maxDuration = 10s (hard limit) — เผื่อ buffer ให้ sheet fetch (ก่อนหน้านี้) + LINE reply
const OVERALL_DEADLINE_MS = 7_000;
const MAX_TOOL_ROUNDS = 2;

function getBangkokToday(): string {
  const now = new Date();
  const isoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => isoParts.find((p) => p.type === type)?.value ?? '';
  const iso = `${get('year')}-${get('month')}-${get('day')}`;
  const thaiWeekday = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long' }).format(now);
  return `${iso} (วัน${thaiWeekday})`;
}

function buildSystemPrompt(faqText: string): string {
  return `คุณคือ "${BOT_NAME}" พนักงานต้อนรับของ "${BUSINESS_NAME}"
วันนี้คือวันที่ ${getBangkokToday()} เวลาไทย — เมื่อลูกค้าบอกวันที่แบบไม่เป็นทางการ (เช่น "วันนี้", "พรุ่งนี้", "มะรืนนี้", "วันเสาร์นี้", "วันศุกร์หน้า", "อีก 3 วัน") ให้คุณคำนวณเป็นวันที่จริงเองจากวันนี้ที่ระบุไว้ แล้วแปลงเป็น YYYY-MM-DD ก่อนเรียก checkRoomAvailability เสมอ ห้ามถามลูกค้าซ้ำเพื่อขอวันที่ชัดเจนแบบตัวเลขถ้าลูกค้าบอกมาแบบสัมพัทธ์แล้ว
ตอบเป็นภาษาเดียวกับที่ลูกค้าพิมพ์ถามมา — ถ้าลูกค้าพิมพ์เป็นภาษาอังกฤษ ให้ตอบเป็นภาษาอังกฤษสุภาพเป็นทางการ ถ้าพิมพ์เป็นภาษาไทย ให้ตอบเป็นภาษาไทย สุภาพ ลงท้าย "ค่ะ"
ห้ามใช้ markdown ตอบกระชับมีสาระ ไม่เกิน 5-7 ประโยค
เรียกผู้ที่มาคุยด้วยว่า "คุณลูกค้า" เสมอ (ถ้าตอบภาษาอังกฤษ ใช้ "you" แทน) ห้ามถามชื่อลูกค้า

ข้อมูลโรงแรม (ใช้ตอบได้เลย):
ที่ตั้ง: ติดอุทยานประวัติศาสตร์สุโขทัย อ.เมือง จ.สุโขทัย
ระยะทาง: อุทยานสุโขทัย 1-2 กม., ตัวเมืองสุโขทัย 12 กม., ศรีสัชนาลัย 55 กม., สนามบินสุโขทัย 25 กม., พิษณุโลก 60 กม.

สิ่งที่ตอบได้เสมอ (ตอบจากความรู้ทั่วไป ไม่ต้องรอ FAQ — เป็นข้อมูลรูปแบบทั่วไปที่ไม่เปลี่ยนรายวัน):
- แนะนำที่เที่ยวสุโขทัย, สถานที่น่าสนใจ, ประวัติศาสตร์
- ร้านอาหาร, อาหารท้องถิ่น, ของฝาก
- ฤดูกาลของสุโขทัยโดยทั่วไป (เช่น ช่วงไหนเป็นหน้าร้อน/หน้าฝน/หน้าหนาวตามปกติ), ช่วงเวลาที่ดีในการเที่ยว
- การเดินทางมาสุโขทัย
- ระยะทางจากโรงแรมไปสถานที่ต่างๆ

ห้ามเด็ดขาด — คุณไม่มีข้อมูลสถานการณ์ปัจจุบัน/เรียลไทม์ ห้ามเดาหรือคาดการณ์สถานการณ์ ณ วันนี้:
- น้ำท่วม/สถานการณ์น้ำ → ตอบว่าไม่มีข้อมูลในระบบ แนะนำให้ตรวจสอบจาก thaiwater.net หรือติดต่อเจ้าหน้าที่โรงแรมที่ ${PHONE} โดยตรง
- สภาพอากาศวันนี้/ตอนนี้ → แนะนำให้ตรวจสอบจากกรมอุตุนิยมวิทยา (tmd.go.th)
- ภัยพิบัติ, ถนนปิด/เปิด, เหตุการณ์เฉพาะหน้าอื่นๆ → ตอบว่าไม่มีข้อมูลในระบบ แนะนำให้ติดต่อเจ้าหน้าที่โรงแรมที่ ${PHONE} โดยตรง
- ห้ามเดาต่อว่าน่าจะเป็นอย่างไรเด็ดขาด ไม่ว่ากรณีใด

สิ่งที่ห้ามตอบ (ให้บอกโทร ${PHONE}):
- ราคาห้องพัก, โปรโมชั่น, ส่วนลด

คำถามที่ไม่เกี่ยวกับโรงแรม/ท่องเที่ยว/สุโขทัยเลย → ตอบว่า "${DEFAULT_REPLY}"

ถ้ามีคำตอบใน FAQ ด้านล่าง ให้ตอบตาม FAQ ก่อน

ห้ามเดาหรือสร้างข้อมูลเฉพาะของโรงแรมนี้ขึ้นเอง (เช่น จำนวนห้องพัก, สิ่งอำนวยความสะดวก, นโยบาย, เวลาเปิด-ปิด ฯลฯ) หากไม่มีอยู่ใน [FAQ] หรือ "ข้อมูลโรงแรม" ข้างต้น — ห้ามตอบตัวเลขหรือรายละเอียดที่ไม่แน่ใจ ถ้าไม่มีข้อมูลจริงรองรับให้ตอบว่า "${DEFAULT_REPLY}" เท่านั้น (กฎนี้ไม่ใช้กับหัวข้อความรู้ทั่วไปด้านบนที่ตอบได้เสมอ เช่น ที่เที่ยว/ร้านอาหาร/การเดินทาง)

เครื่องมือ (tools) ที่คุณเรียกใช้ได้:
- checkRoomAvailability: เช็คว่าห้องว่างในวันที่ลูกค้าต้องการหรือไม่ — ห้ามบอกราคาที่ได้จากเครื่องมือนี้กับลูกค้าเด็ดขาด (เป็นราคาเต็มยังไม่หักส่วนลด/โปรโมชั่น) ถ้าห้องว่าง ให้บอกลูกค้าว่าห้องว่าง แล้วแนะนำให้กดลิงค์จองเพื่อดูราคาและโปรโมชั่นล่าสุด
- getRoomDetails: ดึงรายละเอียด สิ่งอำนวยความสะดวกของห้องพัก
- searchTouristInfo: ค้นหาสถานที่ท่องเที่ยว/ร้านอาหารในสุโขทัยที่ไม่แน่ใจข้อมูล

บอทไม่สามารถทำการจองห้องพักให้ลูกค้าได้ — เมื่อลูกค้าต้องการจอง (หรือห้องว่างแล้วอยากจอง) ให้ส่งลิงค์นี้ให้ลูกค้ากดจองเอง: ${getBookingLink()}

[FAQ]
${faqText}`;
}

function isRetryable(err: unknown): boolean {
  const msg = String((err as Record<string, unknown>)?.message ?? '');
  return msg.includes('503') || msg.includes('UNAVAILABLE');
}

async function executeFunctionCall(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case 'checkRoomAvailability': {
        const result = await checkRoomAvailability(
          String(args.roomType ?? ''),
          String(args.checkInDate ?? ''),
          Number(args.nights ?? 1),
        );
        // ตัด price ออกก่อนส่งกลับให้ Gemini — กันไม่ให้บอทหลุดบอกราคาเต็มจาก Cloudbeds
        const { price: _price, ...safeResult } = result;
        return { ...safeResult, bookingLink: getBookingLink() };
      }
      case 'getRoomDetails':
        return { ...(await getRoomDetails(String(args.roomType ?? ''))) };
      case 'searchTouristInfo':
        return { ...(await searchTouristInfo(String(args.query ?? ''))) };
      default:
        return { error: `unknown tool: ${name}` };
    }
  } catch (err) {
    log.error('gemini.tool_error', { name, err: String((err as Error)?.message ?? err) });
    return { error: 'tool execution failed' };
  }
}

export async function generateReply(
  userId: string,
  userMessage: string,
  faqText: string,
): Promise<string> {
  const start = Date.now();
  const deadline = start + OVERALL_DEADLINE_MS;

  const history = getHistory(userId);
  const contents: Content[] = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const remainingBeforeCall = deadline - Date.now();
    if (remainingBeforeCall < 800) {
      log.warn('gemini.deadline_exceeded', { round, userId });
      return DEFAULT_REPLY;
    }

    // รอบแรก retry ได้ 2 ครั้ง (กัน 503) — รอบ tool-call ถัดไปไม่ retry เพื่อประหยัดเวลา
    const maxAttempts = round === 0 ? 2 : 1;
    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | undefined;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const budgetLeft = deadline - Date.now();
      if (budgetLeft < 500) break;
      const timeoutMs = Math.min(budgetLeft - 200, attempt === 1 ? 5_000 : 2_500);

      try {
        const call = ai.models.generateContent({
          model: MODEL,
          contents,
          config: {
            systemInstruction: buildSystemPrompt(faqText),
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 },
            tools: [{ functionDeclarations: TOOLS }],
          },
        });

        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`gemini_timeout_r${round}_a${attempt}`)), timeoutMs),
        );

        response = await Promise.race([call, timeout]);
        break;
      } catch (err) {
        lastErr = err;
        if (isRetryable(err) && attempt < maxAttempts) {
          log.warn('gemini.503_retry', { round, attempt });
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
      }
    }

    if (!response) {
      log.error('gemini.failed', {
        round,
        latencyMs: Date.now() - start,
        err: String((lastErr as Error)?.message ?? lastErr),
      });
      return DEFAULT_REPLY;
    }

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0 && round < MAX_TOOL_ROUNDS) {
      contents.push({ role: 'model', parts: functionCalls.map((fc) => ({ functionCall: fc })) });

      const responseParts = await Promise.all(
        functionCalls.map(async (fc) => {
          const result = await executeFunctionCall(fc.name ?? '', (fc.args ?? {}) as Record<string, unknown>);
          return createPartFromFunctionResponse(fc.id ?? fc.name ?? '', fc.name ?? '', result);
        }),
      );

      contents.push({ role: 'user', parts: responseParts });

      log.info('gemini.tool_call', { round, tools: functionCalls.map((fc) => fc.name).join(', ') });
      continue;
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usage = response.usageMetadata as any;

    log.info('gemini.reply', {
      round,
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
    if (!text) {
      log.error('gemini.empty_response', { round });
      return DEFAULT_REPLY;
    }

    // ไม่บันทึก default reply ลง history เพราะ context เสีย
    if (text !== DEFAULT_REPLY) {
      addTurn(userId, userMessage, text);
    }
    return text;
  }

  log.warn('gemini.max_tool_rounds', { userId });
  return DEFAULT_REPLY;
}
