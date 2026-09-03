/**
 * Google Places API Integration
 * ค้นหาสถานที่ท่องเที่ยว ร้านอาหาร ในสุโขทัย
 */

interface PlaceResult {
  name: string;
  address: string;
  rating?: number;
  types: string[];
}

interface TouristInfoResponse {
  results: PlaceResult[];
  message?: string;
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://places.googleapis.com/v1/places:searchText';

// จำกัดพื้นที่ค้นหาให้อยู่แถวสุโขทัยเสมอ (bias ผลลัพธ์)
const SUKHOTHAI_BIAS = ' สุโขทัย';

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
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.types',
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
      results: places.map((p) => ({
        name: p.displayName?.text ?? '',
        address: p.formattedAddress ?? '',
        rating: p.rating,
        types: p.types ?? [],
      })),
    };
  } catch (err) {
    console.error('[places] search failed:', err);
    return {
      results: [],
      message: 'ไม่สามารถค้นหาข้อมูลสถานที่ได้ในขณะนี้',
    };
  }
}
