/**
 * Open-Meteo — พยากรณ์อากาศจริงแบบเรียลไทม์ สำหรับพิกัดโรงแรม (ไม่ต้องใช้ API key)
 */

const API_URL = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 20 * 60 * 1000;

// พิกัดโรงแรมศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา (เดียวกับ places.ts)
const HOTEL_LAT = 17.0159349;
const HOTEL_LNG = 99.7241314;

const WEATHER_CODE_TH: Record<number, string> = {
  0: 'ท้องฟ้าแจ่มใส',
  1: 'ท้องฟ้าโปร่ง มีเมฆบางส่วน',
  2: 'มีเมฆเป็นบางส่วน',
  3: 'มีเมฆมาก',
  45: 'มีหมอก',
  48: 'มีหมอกน้ำแข็งเกาะ',
  51: 'ฝนโปรยปรายเบา',
  53: 'ฝนโปรยปรายปานกลาง',
  55: 'ฝนโปรยปรายหนัก',
  61: 'ฝนตกเบา',
  63: 'ฝนตกปานกลาง',
  65: 'ฝนตกหนัก',
  80: 'ฝนตกเป็นช่วงๆ เบา',
  81: 'ฝนตกเป็นช่วงๆ ปานกลาง',
  82: 'ฝนตกเป็นช่วงๆ หนักมาก',
  95: 'พายุฝนฟ้าคะนอง',
  96: 'พายุฝนฟ้าคะนอง มีลูกเห็บเบา',
  99: 'พายุฝนฟ้าคะนอง มีลูกเห็บหนัก',
};

function describeCode(code: number): string {
  return WEATHER_CODE_TH[code] ?? `สภาพอากาศรหัส ${code}`;
}

interface DayForecast {
  date: string;
  condition: string;
  tempMaxC: number;
  tempMinC: number;
  rainChancePercent: number;
}

interface WeatherResponse {
  found: boolean;
  current?: {
    updatedAt: string;
    temperatureC: number;
    humidityPercent: number;
    condition: string;
    windSpeedKmh: number;
  };
  forecast?: DayForecast[];
  message?: string;
}

interface Cache {
  data: WeatherResponse;
  expiresAt: number;
}

let cache: Cache | null = null;

export async function checkWeather(): Promise<WeatherResponse> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;

  try {
    const url = new URL(API_URL);
    url.searchParams.set('latitude', String(HOTEL_LAT));
    url.searchParams.set('longitude', String(HOTEL_LNG));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
    url.searchParams.set('timezone', 'Asia/Bangkok');
    url.searchParams.set('forecast_days', '3');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);

    const json = await res.json();
    const c = json.current;
    const d = json.daily;

    const forecast: DayForecast[] = (d?.time ?? []).map((date: string, i: number) => ({
      date,
      condition: describeCode(d.weather_code[i]),
      tempMaxC: d.temperature_2m_max[i],
      tempMinC: d.temperature_2m_min[i],
      rainChancePercent: d.precipitation_probability_max[i],
    }));

    const result: WeatherResponse = {
      found: true,
      current: {
        updatedAt: c.time,
        temperatureC: c.temperature_2m,
        humidityPercent: c.relative_humidity_2m,
        condition: describeCode(c.weather_code),
        windSpeedKmh: c.wind_speed_10m,
      },
      forecast,
    };

    cache = { data: result, expiresAt: now + CACHE_TTL_MS };
    return result;
  } catch (err) {
    console.error('[weather] fetch failed:', err);
    return { found: false, message: 'ไม่สามารถดึงข้อมูลสภาพอากาศได้ในขณะนี้' };
  }
}
