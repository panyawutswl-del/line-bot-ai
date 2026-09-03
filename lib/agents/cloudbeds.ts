import { fuzzyContains } from '@/lib/fuzzy';

/**
 * Cloudbeds API Integration (v1.2)
 * ตรวจสอบความว่าง ดึงรายละเอียดห้อง
 *
 * หมายเหตุ: ชื่อห้องจริงใน Cloudbeds แยกเป็น variant (เช่น "Deluxe with balcony - King" /
 * "...- Twin") แต่ลูกค้า/FAQ พูดถึงแค่หมวดหลัก ("Superior", "Sriwilai Suite", "Deluxe")
 * เวลา match จึงรวมทุก variant ที่อยู่ในหมวดเดียวกันเข้าด้วยกัน
 */

interface RoomAvailability {
  roomType: string;
  available: boolean;
  price?: number;
  currency: string;
  message?: string;
}

interface RoomDetailsResponse {
  roomType: string;
  amenities: string[];
  maxGuests: number;
  description: string;
  images: string[];
  message?: string;
}

interface CloudbedsRoomPhoto {
  thumb?: string;
  image?: string;
}

interface CloudbedsAvailableRoom {
  roomTypeID: string;
  roomTypeName: string;
  roomTypeDescription?: string;
  maxGuests?: string | number;
  roomTypeFeatures?: string[];
  roomRate?: number;
  roomsAvailable?: number;
}

interface CloudbedsRoomType {
  roomTypeID: string;
  roomTypeName: string;
  roomTypeDescription?: string;
  maxGuests?: string | number;
  roomTypeFeatures?: string[];
  roomTypePhotos?: (string | CloudbedsRoomPhoto)[];
}

const API_KEY = process.env.CLOUDBEDS_API_KEY;
const PROPERTY_ID = process.env.CLOUDBEDS_PROPERTY_ID;
const BASE_URL = 'https://api.cloudbeds.com/api/v1.2';
const FETCH_TIMEOUT_MS = 4_000;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// วันที่ YYYY-MM-DD + จำนวนวัน → YYYY-MM-DD
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function cloudbedsGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('propertyID', PROPERTY_ID!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`cloudbeds ${path} ${res.status}`);
  const json = (await res.json()) as { success: boolean; data?: unknown; message?: string };
  if (!json.success) throw new Error(`cloudbeds ${path} failed: ${json.message ?? 'unknown error'}`);
  return json.data as T;
}

// รวมห้องทุก variant ที่อยู่ในหมวดหลักเดียวกัน (เช่น "Deluxe" → King + Twin)
function findRoomsByCategory<T extends { roomTypeName: string }>(rooms: T[], roomType: string): T[] {
  const exact = rooms.filter(
    (r) => fuzzyContains(r.roomTypeName, roomType) || fuzzyContains(roomType, r.roomTypeName),
  );
  if (exact.length > 0) return exact;

  // Fallback: keyword overlap — เผื่อชื่อ Cloudbeds ยาวกว่าที่ลูกค้าพิมพ์ (เช่น "Deluxe with balcony - King")
  const targetWords = normalizeRoomWords(roomType);
  if (targetWords.size === 0) return [];

  const scored: { room: T; score: number }[] = [];
  for (const r of rooms) {
    const roomWords = normalizeRoomWords(r.roomTypeName);
    const overlap = Array.from(targetWords).filter((w) => roomWords.has(w)).length;
    if (overlap > 0) scored.push({ room: r, score: overlap });
  }
  if (scored.length === 0) return [];
  const maxScore = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === maxScore).map((s) => s.room);
}

function normalizeRoomWords(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[-,()]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && w !== 'room' && w !== 'the'),
  );
}

export async function checkRoomAvailability(
  roomType: string,
  checkInDate: string, // YYYY-MM-DD
  nights: number,
): Promise<RoomAvailability> {
  if (!API_KEY || !PROPERTY_ID) {
    return {
      roomType,
      available: false,
      currency: 'THB',
      message: 'Cloudbeds API credentials not configured',
    };
  }

  try {
    const endDate = addDays(checkInDate, Math.max(1, nights));

    const data = await cloudbedsGet<
      { propertyCurrency?: { currencyCode?: string }; propertyRooms?: CloudbedsAvailableRoom[] }[]
    >('/getAvailableRoomTypes', { startDate: checkInDate, endDate });

    const property = data?.[0];
    const rooms = property?.propertyRooms ?? [];
    const matches = findRoomsByCategory(rooms, roomType);

    if (matches.length === 0) {
      return {
        roomType,
        available: false,
        currency: property?.propertyCurrency?.currencyCode ?? 'THB',
        message: `ไม่พบห้องประเภท "${roomType}" ในระบบ`,
      };
    }

    const available = matches.some((m) => (m.roomsAvailable ?? 0) > 0);
    const rates = matches.map((m) => m.roomRate).filter((r): r is number => typeof r === 'number');

    return {
      roomType,
      available,
      price: rates.length > 0 ? Math.min(...rates) : undefined,
      currency: property?.propertyCurrency?.currencyCode ?? 'THB',
    };
  } catch (err) {
    console.error('[cloudbeds] availability check failed:', err);
    return {
      roomType,
      available: false,
      currency: 'THB',
      message: 'ไม่สามารถตรวจสอบความว่างได้ กรุณาติดต่อเจ้าหน้าที่',
    };
  }
}

export async function getRoomDetails(roomType: string): Promise<RoomDetailsResponse> {
  if (!API_KEY || !PROPERTY_ID) {
    return {
      roomType,
      amenities: [],
      maxGuests: 0,
      description: 'Cloudbeds API credentials not configured',
      images: [],
    };
  }

  try {
    const rooms = await cloudbedsGet<CloudbedsRoomType[]>('/getRoomTypes', {});
    const matches = findRoomsByCategory(rooms ?? [], roomType);

    if (matches.length === 0) {
      return {
        roomType,
        amenities: [],
        maxGuests: 0,
        description: `ไม่พบข้อมูลห้องประเภท "${roomType}" ในระบบ`,
        images: [],
      };
    }

    const amenities = Array.from(new Set(matches.flatMap((m) => m.roomTypeFeatures ?? [])));
    const maxGuests = Math.max(...matches.map((m) => Number(m.maxGuests ?? 0)));
    const description = stripHtml(matches[0].roomTypeDescription ?? '');
    const images = matches
      .flatMap((m) => m.roomTypePhotos ?? [])
      .map((p) => (typeof p === 'string' ? p : p.image ?? p.thumb ?? ''))
      .filter(Boolean)
      .slice(0, 4);

    return { roomType, amenities, maxGuests, description, images };
  } catch (err) {
    console.error('[cloudbeds] room details fetch failed:', err);
    return {
      roomType,
      amenities: [],
      maxGuests: 0,
      description: `ไม่สามารถดึงรายละเอียดห้อง "${roomType}" ได้`,
      images: [],
    };
  }
}

export function getBookingLink(): string {
  return 'https://hotels.cloudbeds.com/reservation/mQSabb';
}
