import { FAQRow } from '@/lib/sheet';

// สร้าง Flex Message carousel จาก FAQ rows ที่ category = "ห้องพัก"
export function buildRoomsCarousel(rooms: FAQRow[]): object {
  if (rooms.length === 0) {
    return {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: 'ยังไม่มีข้อมูลห้องพักในระบบค่ะ', wrap: true }],
      },
    };
  }

  const bubbles = rooms.slice(0, 10).map(buildBubble);
  return bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles };
}

function buildBubble(room: FAQRow): object {
  const imageUrl = room.keywords.find((kw) => kw.startsWith('http'));

  return {
    type: 'bubble',
    size: 'kilo',
    ...(imageUrl && {
      hero: {
        type: 'image',
        url: imageUrl,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
    }),
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1a4a6e',
      paddingAll: '15px',
      contents: [
        {
          type: 'text',
          text: room.question || room.category,
          color: '#ffffff',
          weight: 'bold',
          size: 'md',
          wrap: true,
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'text',
          text: room.answer,
          size: 'sm',
          wrap: true,
          color: '#444444',
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          label: 'สอบถามเพิ่มเติม',
          height: 'sm',
          color: '#1a4a6e',
          action: {
            type: 'message',
            label: 'สอบถามเพิ่มเติม',
            text: `สอบถาม${room.question}`,
          },
        },
      ],
    },
  };
}
