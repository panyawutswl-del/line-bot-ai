import { messagingApi } from '@line/bot-sdk';
import { fuzzyContains } from '@/lib/fuzzy';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

const HANDOFF_TRIGGERS = [
  'คุยกับคน',
  'คุยกับแอดมิน',
  'ขอแอดมิน',
  'จองห้อง',
  'ต้องการจอง',
  'ขอจอง',
  'จองที่พัก',
  'ขอเจ้าของ',
  'ขอผู้จัดการ',
  'ขอพนักงาน',
  'ฟ้อง',
  'ร้องเรียน',
  'ไม่พอใจ',
  'แย่มาก',
  'ติดต่อสื่อ',
  'สัมภาษณ์',
  'human',
  'real person',
];

export function shouldHandoff(message: string): boolean {
  return HANDOFF_TRIGGERS.some((t) => fuzzyContains(message, t));
}

export async function notifyAdmin(userId: string, userMessage: string): Promise<void> {
  const groupId = process.env.ADMIN_GROUP_ID;
  if (!groupId) return;

  try {
    await client.pushMessage({
      to: groupId,
      messages: [
        {
          type: 'text',
          text: `🔔 ลูกค้าต้องการคุยกับแอดมิน\n\nUserID: ${userId}\nข้อความ: ${userMessage}\n\nตอบได้ที่: https://manager.line.biz/chats`,
        },
      ],
    });
  } catch (err) {
    console.error('[handoff] notify admin failed:', err);
  }
}
