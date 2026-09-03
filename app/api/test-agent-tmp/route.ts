import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=17.0159&longitude=99.7241&current=temperature_2m&timezone=Asia%2FBangkok';
    const start = Date.now();
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const elapsed = Date.now() - start;
    const text = await res.text();
    return NextResponse.json({ ok: true, status: res.status, elapsed, body: text.slice(0, 500) });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      errorName: (err as Error)?.name,
      errorMessage: (err as Error)?.message,
      errorString: String(err),
    });
  }
}
