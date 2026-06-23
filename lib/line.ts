import { messagingApi } from '@line/bot-sdk';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export async function replyText(replyToken: string, text: string): Promise<void> {
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
  } catch (err) {
    // Expired replyToken is expected — log but don't throw (prevents LINE retry loop)
    console.error('[LINE] replyMessage error:', err);
  }
}
