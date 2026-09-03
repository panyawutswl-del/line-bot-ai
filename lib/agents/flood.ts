/**
 * ThaiWater (สสน.) — เช็คระดับน้ำ/สถานการณ์น้ำท่วมจริง เฉพาะสถานีในจังหวัดสุโขทัย
 * แหล่งข้อมูล: สถาบันสารสนเทศทรัพยากรน้ำ (องค์การมหาชน)
 */

const API_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load';
const FETCH_TIMEOUT_MS = 4_000;
// ข้อมูลอัพเดตทุกชั่วโมง — cache สั้นกว่าเว็บไซต์โรงแรมเพราะข้อมูลเปลี่ยนบ่อยกว่า
const CACHE_TTL_MS = 15 * 60 * 1000;

interface StationStatus {
  station: string;
  district: string;
  river: string;
  updatedAt: string;
  diffFromBankM: number | null; // + = ต่ำกว่าตลิ่ง (ปลอดภัย), - หรือใกล้ 0 = เสี่ยง/ท่วม
  trend: 'rising' | 'falling' | 'stable';
}

interface FloodStatusResponse {
  found: boolean;
  stations?: StationStatus[];
  message?: string;
}

interface Cache {
  stations: StationStatus[];
  expiresAt: number;
}

let cache: Cache | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStation(raw: any): StationStatus | null {
  const province = raw?.geocode?.province_name?.th;
  if (province !== 'สุโขทัย') return null;

  const current = parseFloat(raw?.waterlevel_msl);
  const previous = parseFloat(raw?.waterlevel_msl_previous);
  let trend: StationStatus['trend'] = 'stable';
  if (!isNaN(current) && !isNaN(previous)) {
    if (current - previous > 0.02) trend = 'rising';
    else if (previous - current > 0.02) trend = 'falling';
  }

  const diffRaw = parseFloat(raw?.diff_wl_bank);

  return {
    station: raw?.station?.tele_station_name?.th ?? raw?.geocode?.tumbon_name?.th ?? 'ไม่ทราบชื่อสถานี',
    district: raw?.geocode?.amphoe_name?.th ?? '',
    river: raw?.river_name ?? '',
    updatedAt: raw?.waterlevel_datetime ?? '',
    diffFromBankM: isNaN(diffRaw) ? null : diffRaw,
    trend,
  };
}

async function fetchSukhothaiStations(): Promise<StationStatus[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.stations;

  const res = await fetch(API_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SriwilaiLineBot/1.0)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`thaiwater API ${res.status}`);

  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (json?.waterlevel_data?.data ?? []) as any[];
  const stations = raw
    .map(parseStation)
    .filter((s): s is StationStatus => s !== null && s.diffFromBankM !== null);

  cache = { stations, expiresAt: now + CACHE_TTL_MS };
  return stations;
}

export async function checkFloodStatus(): Promise<FloodStatusResponse> {
  try {
    const stations = await fetchSukhothaiStations();
    if (stations.length === 0) {
      return { found: false, message: 'ไม่พบข้อมูลสถานีวัดระดับน้ำในจังหวัดสุโขทัยขณะนี้' };
    }
    // จังหวัดสุโขทัยมีสถานีเยอะ (~27) — payload ใหญ่ทำให้ Gemini ประมวลผลช้าจนอาจเกิน deadline
    // ให้ความสำคัญกับอำเภอเมืองสุโขทัย (ที่โรงแรมตั้งอยู่) ก่อน แล้วจำกัดจำนวนไม่เกิน 6 สถานี
    const prioritized = [
      ...stations.filter((s) => s.district === 'เมืองสุโขทัย'),
      ...stations.filter((s) => s.district !== 'เมืองสุโขทัย'),
    ].slice(0, 6);
    return { found: true, stations: prioritized };
  } catch (err) {
    console.error('[flood] fetch failed:', err);
    return { found: false, message: 'ไม่สามารถดึงข้อมูลระดับน้ำได้ในขณะนี้' };
  }
}
