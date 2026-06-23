interface SheetCache {
  data: string;
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 1000;
let cache: SheetCache | null = null;

export async function getFaqCsv(): Promise<string> {
  const now = Date.now();

  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const url = process.env.SHEET_CSV_URL!;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

    const raw = await res.text();
    const lines = raw.split('\n');
    const header = lines[0];

    // filter active=TRUE — active is the last column, ends with ,TRUE
    const activeLines = lines.slice(1).filter((line) => {
      const trimmed = line.trim().toUpperCase();
      return trimmed.endsWith(',TRUE');
    });

    const filtered = [header, ...activeLines].join('\n');
    cache = { data: filtered, timestamp: now };
    return filtered;
  } catch (err) {
    if (cache) {
      console.warn('[Sheet] Fetch failed, using stale cache:', err);
      return cache.data;
    }
    throw err;
  }
}
