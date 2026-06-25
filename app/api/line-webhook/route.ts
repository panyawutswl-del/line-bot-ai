import { NextRequest, NextResponse } from 'next/server';
import { validateSignature } from '@line/bot-sdk';
import { fetchFAQRows, matchFAQ } from '@/lib/sheet';
import { generateReply, DEFAULT_REPLY } from '@/lib/gemini';
import { getHistory } from '@/lib/history';
import { replyText } from '@/lib/line';
import { shouldHandoff, notifyAdmin } from '@/lib/handoff';
import { isPaused, pauseUser } from '@/lib/pause';
import { addTurn } from '@/lib/history';
import { log } from '@/lib/log';

export const maxDuration = 10;

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-line-signature') ?? '';
  const rawBody = await req.text();

  if (!validateSignature(rawBody, process.env.LINE_CHANNEL_SECRET!, signature)) {
    log.warn('webhook.invalid_signature');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let events: Record<string, unknown>[];
  try {
    events = (JSON.parse(rawBody) as { events: Record<string, unknown>[] }).events;
  } catch {
    return NextResponse.json({ ok: true });
  }

  await Promise.allSettled(
    events.map(async (event) => {
      if (event.type !== 'message') return;

      const message = event.message as Record<string, unknown> | undefined;
      if (message?.type !== 'text') return;

      const userMessage = (message.text as string) ?? '';
      const replyToken = event.replyToken as string;
      const source = event.source as Record<string, unknown>;
      const userId = (source?.userId as string) ?? 'unknown';
      const sourceGroupId = source?.groupId as string | undefined;
      const start = Date.now();

      // Setup helper: ถ้าบอทอยู่ใน group และยังไม่ตั้ง ADMIN_GROUP_ID → reply บอก ID
      if (sourceGroupId) {
        if (!process.env.ADMIN_GROUP_ID) {
          await replyText(replyToken, `ID ของ group นี้คือ:\n\n${sourceGroupId}\n\nนำไปใส่ใน Vercel\nSettings → Environment Variables\nชื่อ: ADMIN_GROUP_ID`);
        }
        return; // ไม่ตอบ message ในกลุ่ม (กลุ่มไว้รับแจ้งเตือนเท่านั้น)
      }

      try {
        // 1. ถ้าแอดมินกำลังคุยอยู่ → บอทหยุดตอบ 2 ชั่วโมง
        if (isPaused(userId)) return;

        // 2. Smart Handoff — pause user แล้วแจ้ง admin
        if (shouldHandoff(userMessage)) {
          pauseUser(userId);
          await Promise.all([
            replyText(replyToken, 'ขอแอดมินติดต่อกลับนะคะ 🙏'),
            notifyAdmin(userId, userMessage),
          ]);
          log.info('handoff.routed', { userId, latencyMs: Date.now() - start });
          return;
        }

        // 2. ดึง FAQ rows (cached 60s)
        let faqRows: Awaited<ReturnType<typeof fetchFAQRows>> = [];
        try {
          faqRows = await fetchFAQRows();
        } catch (err) {
          log.warn('webhook.sheet_unavailable', { err: String(err) });
        }

        // 3. Direct keyword match — ข้ามถ้าข้อความสั้น + มี history (คำถามต่อเนื่อง)
        const hasHistory = getHistory(userId).length > 0;
        const isFollowUp = hasHistory && userMessage.length < 10;
        const directAnswer = isFollowUp ? null : matchFAQ(userMessage, faqRows);
        if (directAnswer) {
          addTurn(userId, userMessage, directAnswer);
          await replyText(replyToken, directAnswer);
          log.info('webhook.direct_match', { userId, latencyMs: Date.now() - start });
          return;
        }

        // 4. Fallback → Gemini (สำหรับคำถามที่ไม่ match keyword)
        const faqText = faqRows
          .filter((r) => r.answer)
          .map((r) => `[${r.category}] ${r.question}\n→ ${r.answer}`)
          .join('\n\n');
        const reply = await generateReply(userId, userMessage, faqText);

        // 4. Reply กลับ LINE
        await replyText(replyToken, reply);

        log.info('webhook.reply_sent', {
          userId,
          latencyMs: Date.now() - start,
          replyLength: reply.length,
        });
      } catch (err) {
        log.error('webhook.event_error', {
          userId,
          err: String((err as Error)?.message ?? err),
        });
        try {
          await replyText(replyToken, DEFAULT_REPLY);
        } catch {
          // replyToken expired — swallow เพื่อไม่ให้ webhook fail
        }
      }
    }),
  );

  // ต้อง return 200 เสมอ — กัน LINE retry webhook ซ้ำ
  return NextResponse.json({ ok: true });
}
