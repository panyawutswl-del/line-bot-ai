interface Cache {
  text: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
let cache: Cache | null = null;

export async function fetchFAQ(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.text;

  const url = process.env.SHEET_CSV_URL;
  if (!url) throw new Error('SHEET_CSV_URL not set');

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`sheet fetch ${res.status}`);

    const csv = await res.text();
    const text = csvToFaqText(csv);

    cache = { text, expiresAt: now + CACHE_TTL_MS };
    return text;
  } catch (err) {
    if (cache) {
      console.warn('[sheet] fetch failed, serving stale cache:', err);
      return cache.text;
    }
    throw err;
  }
}

function csvToFaqText(csv: string): string {
  const rows = parseCSV(csv);
  if (rows.length < 2) return '';

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const activeIdx = header.indexOf('active');

  // Sheet columns: No. | หมวดหมู่ | คำถาม | คำตอบ | Keyword
  // ตรวจหา index จาก header จริง (รองรับทั้งภาษาไทยและอังกฤษ)
  const catIdx = header.findIndex((h) => h.includes('category') || h.includes('หมวด'));
  const qIdx = header.findIndex((h) => h.includes('question') || h.includes('คำถาม'));
  const aIdx = header.findIndex((h) => h.includes('answer') || h.includes('คำตอบ'));

  const ci = catIdx >= 0 ? catIdx : 1;
  const qi = qIdx >= 0 ? qIdx : 2;
  const ai = aIdx >= 0 ? aIdx : 3;

  return rows
    .slice(1)
    .filter((row) => {
      if (row.length <= ai) return false;
      if (activeIdx >= 0) return row[activeIdx]?.trim().toUpperCase() === 'TRUE';
      return true;
    })
    .map((row) => {
      const cat = row[ci]?.trim() ?? '';
      const q = row[qi]?.trim() ?? '';
      const a = row[ai]?.trim() ?? '';
      if (!a) return null;
      return `[${cat}] ${q}\n→ ${a}`;
    })
    .filter((x): x is string => x !== null)
    .join('\n\n');
}

// Full CSV parser — รองรับ quoted fields ที่มี comma และ newline ข้างใน
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const ch = csv[i];

    if (ch === '"') {
      if (inQuotes && csv[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
    i++;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c !== '')) rows.push(row);
  }

  return rows;
}
