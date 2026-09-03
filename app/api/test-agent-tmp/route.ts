import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const HOTEL_LAT = 17.0159349;
    const HOTEL_LNG = 99.7241314;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(HOTEL_LAT));
    url.searchParams.set('longitude', String(HOTEL_LNG));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
    url.searchParams.set('timezone', 'Asia/Bangkok');
    url.searchParams.set('forecast_days', '3');

    const start = Date.now();
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) });
    const elapsed = Date.now() - start;
    const json = await res.json();
    return NextResponse.json({ ok: true, url: url.toString(), status: res.status, elapsed, json });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      errorName: (err as Error)?.name,
      errorMessage: (err as Error)?.message,
      errorString: String(err),
      stack: (err as Error)?.stack,
    });
  }
}
