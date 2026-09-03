import { NextResponse } from 'next/server';
import { checkWeather } from '@/lib/agents/weather';
import { checkFloodStatus } from '@/lib/agents/flood';

export async function GET() {
  const [weather, flood] = await Promise.allSettled([checkWeather(), checkFloodStatus()]);
  return NextResponse.json({
    weather: weather.status === 'fulfilled' ? weather.value : { error: String(weather.reason) },
    flood: flood.status === 'fulfilled' ? flood.value : { error: String(flood.reason) },
  });
}
