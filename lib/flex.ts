import { FAQRow } from '@/lib/sheet';

// สร้าง Flex Message carousel จาก FAQ rows ที่มีรูป
// รองรับหลายรูปต่อห้อง โดยคั่น URL ด้วย | ในคอลัมน์ keyword
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

  // แต่ละห้องอาจมีหลายรูป → สร้างหลาย bubble ต่อห้อง
  const bubbles = rooms.flatMap(buildBubbles).slice(0, 10);
  return bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles };
}

// แยก URL จาก keywords — รองรับ | คั่น URL หลายตัวในช่องเดียว
function getImageUrls(room: FAQRow): string[] {
  const urls: string[] = [];
  for (const kw of room.keywords) {
    if (kw.startsWith('http')) {
      // รองรับ URL เดี่ยว หรือหลาย URL คั่นด้วย |
      kw.split('|').forEach((u) => {
        const trimmed = u.trim();
        if (trimmed.startsWith('http')) urls.push(trimmed);
      });
    }
  }
  return urls;
}

function buildBubbles(room: FAQRow): object[] {
  const imageUrls = getImageUrls(room);

  // ถ้าไม่มีรูปเลย → bubble เดียวไม่มี hero
  if (imageUrls.length === 0) return [buildBubble(room, undefined, true)];

  // ถ้ามีหลายรูป → รูปแรกมี header+body+footer, รูปที่เหลือมีแค่ hero+header
  return imageUrls.map((url, i) => buildBubble(room, url, i === 0));
}

function buildBubble(room: FAQRow, imageUrl: string | undefined, showDetail: boolean): object {
  return {
    type: 'bubble',
    ...(imageUrl && {
      hero: {
        type: 'image',
        url: imageUrl,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
        action: { type: 'uri', label: 'ดูรูป', uri: imageUrl },
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
    ...(showDetail && {
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
    }),
  };
}
