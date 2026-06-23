import { NextRequest, NextResponse } from 'next/server';
import { validateSignature } from '@line/bot-sdk';
import { getFaqCsv } from '@/lib/sheet';
import { generateReply } from '@/lib/gemini';
import { replyText } from '@/lib/line';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-line-signature') ?? '';
  const rawBody = await req.text();

  if (!validateSignature(rawBody, process.env.LINE_CHANNEL_SECRET!, signature)) {
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

      const userMessage = message.text as string;
      const replyToken = event.replyToken as string;

      let faqCsv = '';
      try {
        faqCsv = await getFaqCsv();
      } catch (err) {
        console.error('[Webhook] Sheet unavailable, proceeding without FAQ:', err);
      }

      const reply = await generateReply(faqCsv, userMessage);
      await replyText(replyToken, reply);
    }),
  );

  // Always return 200 — prevents LINE from retrying the webhook
  return NextResponse.json({ ok: true });
}
