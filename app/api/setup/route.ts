import { NextRequest, NextResponse } from 'next/server';
import { validateSignature } from '@line/bot-sdk';
import { messagingApi } from '@line/bot-sdk';

// Endpoint ชั่วคราวสำหรับหา ADMIN_GROUP_ID
// วิธีใช้:
//   1. เพิ่มบอทเข้า LINE group
//   2. ส่งข้อความใน group นั้น
//   3. บอทจะ reply ด้วย groupId ทันที
//   4. เมื่อได้ ADMIN_GROUP_ID แล้ว ลบ endpoint นี้ทิ้ง

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

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

  for (const event of events) {
    if (event.type !== 'message') continue;
    const source = event.source as Record<string, unknown>;
    const groupId = source?.groupId as string | undefined;
    const replyToken = event.replyToken as string;
    if (!groupId || !replyToken) continue;

    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: `ADMIN_GROUP_ID ของ group นี้คือ:\n\n${groupId}\n\nนำไปใส่ใน Vercel → Settings → Environment Variables ได้เลยค่ะ` }],
    });
    break;
  }

  return NextResponse.json({ ok: true });
}
