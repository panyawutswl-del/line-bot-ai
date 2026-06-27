import { createHmac } from 'crypto';

const GRAPH_API = 'https://graph.facebook.com/v21.0/me/messages';

export function verifyFbSignature(rawBody: string, signature: string): boolean {
  const expected = `sha256=${createHmac('sha256', process.env.FB_APP_SECRET!).update(rawBody).digest('hex')}`;
  return signature === expected;
}

async function fbPost(recipientId: string, message: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${GRAPH_API}?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`fb_send_failed: ${res.status} ${err}`);
  }
}

export async function fbSendText(recipientId: string, text: string): Promise<void> {
  await fbPost(recipientId, { text: text.slice(0, 2000) });
}

export async function fbSendQuickReplies(
  recipientId: string,
  text: string,
  rooms: { title: string }[],
): Promise<void> {
  await fbPost(recipientId, {
    text: text.slice(0, 2000),
    quick_replies: rooms.map((r) => ({
      content_type: 'text',
      title: r.title.slice(0, 20),
      payload: `${r.title} detail`,
    })),
  });
}
