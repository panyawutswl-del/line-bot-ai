/**
 * Google Places API Integration
 * ค้นหาสถานที่ท่องเที่ยว ร้านอาหาร ในสุโขทัย พร้อมระยะทางจากโรงแรม
 */

interface PlaceResult {
  name: string;
  address: string;
  rating?: number;
  types: string[];
  distanceKm?: number;
}

interface TouristInfoResponse {
  results: PlaceResult[];
  message?: string;
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://places.googleapis.com/v1/places:searchText';

// พิกัดโรงแรมศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา — ใช้คำนวณระยะทางแบบเส้นตรง (Haversine)
const HOTEL_LAT = 17.0159349;
const HOTEL_LNG = 99.7241314;

// จำกัดพื้นที่ค้นหาให้อยู่แถวสุโขทัยเสมอ (bias ผลลัพธ์)
const SUKHOTHAI_BIAS = ' สุโขทัย';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // รัศมีโลก (กม.)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function searchTouristInfo(
  query: string,
  category?: string,
): Promise<TouristInfoResponse> {
  if (!API_KEY) {
    return {
      results: [],
      message: 'Google Places API key not configured',
    };
  }

  try {
    const searchQuery = query.includes('สุโขทัย') ? query : query + SUKHOTHAI_BIAS;

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.types,places.location',
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        languageCode: 'th',
        maxResultCount: 5,
      }),
      signal: AbortSignal.timeout(4_000),
    });

    if (!response.ok) {
      throw new Error(`places API ${response.status}`);
    }

    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const places = (data.places ?? []) as any[];

    return {
      results: places.map((p) => {
        const lat = p.location?.latitude;
        const lng = p.location?.longitude;
        return {
          name: p.displayName?.text ?? '',
          address: p.formattedAddress ?? '',
          rating: p.rating,
          types: p.types ?? [],
          distanceKm:
            typeof lat === 'number' && typeof lng === 'number'
              ? Math.round(haversineKm(HOTEL_LAT, HOTEL_LNG, lat, lng) * 10) / 10
              : undefined,
        };
      }),
    };
  } catch (err) {
    console.error('[places] search failed:', err);
    return {
      results: [],
      message: 'ไม่สามารถค้นหาข้อมูลสถานที่ได้ในขณะนี้',
    };
  }
}
