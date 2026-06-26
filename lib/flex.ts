import { FAQRow } from '@/lib/sheet';

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

function getImageUrls(room: FAQRow): string[] {
  const urls: string[] = [];
  for (const kw of room.keywords) {
    if (kw.startsWith('http')) {
      kw.split('|').forEach((u) => {
        const t = u.trim();
        if (t.startsWith('http')) urls.push(t);
      });
    }
  }
  return urls;
}

function buildBubble(room: FAQRow): object {
  const imageUrls = getImageUrls(room);
  const mainImage = imageUrls[0];
  const extraImages = imageUrls.slice(1, 4); // แสดงรูปเพิ่มได้สูงสุด 3 รูป

  // thumbnail ของรูปเพิ่มเติม
  const thumbnailRow = extraImages.length > 0
    ? [{
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        margin: 'sm',
        contents: extraImages.map((url) => ({
          type: 'image',
          url,
          flex: 1,
          aspectRatio: '1:1',
          aspectMode: 'cover',
          action: { type: 'uri', label: 'ดูรูป', uri: url },
        })),
      }]
    : [];

  return {
    type: 'bubble',
    ...(mainImage && {
      hero: {
        type: 'image',
        url: mainImage,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
        action: { type: 'uri', label: 'ดูรูป', uri: mainImage },
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
        ...thumbnailRow,
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
            label: 'จองห้องพัก',
            text: 'จองห้องพัก',
          },
        },
      ],
    },
  };
}
