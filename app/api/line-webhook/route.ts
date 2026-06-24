import { NextRequest, NextResponse } from 'next/server';
import { validateSignature } from '@line/bot-sdk';
import { fetchFAQ } from '@/lib/sheet';
import { generateReply, DEFAULT_REPLY } from '@/lib/gemini';
import { replyText } from '@/lib/line';
import { shouldHandoff, notifyAdmin } from '@/lib/handoff';
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
      const userId =
        ((event.source as Record<string, unknown>)?.userId as string) ?? 'unknown';
      const start = Date.now();

      try {
        // 1. Smart Handoff — ตรวจก่อน Gemini เพื่อลด latency
        if (shouldHandoff(userMessage)) {
          await Promise.all([
            replyText(replyToken, 'ขอแอดมินติดต่อกลับนะคะ 🙏'),
            notifyAdmin(userId, userMessage),
          ]);
          log.info('handoff.routed', { userId, latencyMs: Date.now() - start });
          return;
        }

        // 2. ดึง FAQ (cached 60s)
        let faqText = '';
        try {
          faqText = await fetchFAQ();
        } catch (err) {
          log.warn('webhook.sheet_unavailable', { err: String(err) });
        }

        // 3. เรียก Gemini
        const reply = await generateReply(userMessage, faqText);

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
