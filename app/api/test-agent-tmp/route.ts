import { NextResponse } from 'next/server';
import { checkWeather } from '@/lib/agents/weather';

export async function GET() {
  const r1 = await checkWeather();
  const r2 = await checkWeather(); // second call — check if cache path also fails
  return NextResponse.json({ r1, r2 });
}
