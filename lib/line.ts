import { messagingApi } from '@line/bot-sdk';
import { log } from '@/lib/log';

const QUICK_REPLIES: messagingApi.QuickReply = {
  items: [
    { type: 'action', action: { type: 'message', label: '🏨 Book a Room', text: 'Book a Room' } },
    { type: 'action', action: { type: 'message', label: '📍 Contact Us',  text: 'Contact Us'  } },
    { type: 'action', action: { type: 'message', label: '💬 Talk to Staff', text: 'Talk to Staff' } },
  ],
};

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function replyFlex(replyToken: string, altText: string, contents: any): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await client.replyMessage({
        replyToken,
        messages: [{ type: 'flex', altText, contents }],
      });
      return;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      log.error('line.flex_error', { attempt, err: msg, detail: JSON.stringify(err) });
      if (msg.includes('Invalid reply token') || msg.includes('400')) {
        log.warn('line.reply_token_expired', { attempt });
        return;
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      log.error('line.reply_failed', { err: msg });
    }
  }
}

export async function replyTextWithQR(replyToken: string, text: string): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await client.replyMessage({
        replyToken,
        messages: [{ type: 'text', text, quickReply: QUICK_REPLIES }],
      });
      return;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (msg.includes('Invalid reply token') || msg.includes('400')) {
        log.warn('line.reply_token_expired', { attempt });
        return;
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      log.error('line.reply_failed', { err: msg });
    }
  }
}

export async function replyText(replyToken: string, text: string): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await client.replyMessage({
        replyToken,
        messages: [{ type: 'text', text }],
      });
      return;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      // replyToken คือ one-time token — ถ้าหมดอายุแล้ว retry ไม่ช่วย
      if (msg.includes('Invalid reply token') || msg.includes('400')) {
        log.warn('line.reply_token_expired', { attempt });
        return;
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      log.error('line.reply_failed', { err: msg });
    }
  }
}
