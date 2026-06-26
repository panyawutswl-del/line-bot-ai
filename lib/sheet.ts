import { fuzzyContains } from '@/lib/fuzzy';

export interface FAQRow {
  category: string;
  question: string;
  answer: string;
  keywords: string[]; // parsed from Keyword column (comma-separated)
}

interface Cache {
  rows: FAQRow[];
  text: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
let cache: Cache | null = null;

export async function fetchFAQ(): Promise<string> {
  return (await getCache()).text;
}

export async function fetchFAQRows(): Promise<FAQRow[]> {
  return (await getCache()).rows;
}

async function fetchOneSheet(url: string): Promise<FAQRow[]> {
  const res = await fetch(url.trim(), {
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`sheet fetch ${res.status} — ${url}`);
  return csvToFaqRows(await res.text());
}

async function getCache(): Promise<Cache> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  const raw = process.env.SHEET_CSV_URL;
  if (!raw) throw new Error('SHEET_CSV_URL not set');

  // รองรับหลาย sheet คั่นด้วยคอมมา
  const urls = raw.split(',').map((u) => u.trim()).filter(Boolean);

  try {
    const results = await Promise.all(urls.map(fetchOneSheet));
    const rows = results.flat();
    const text = rowsToText(rows);

    cache = { rows, text, expiresAt: now + CACHE_TTL_MS };
    return cache;
  } catch (err) {
    if (cache) {
      console.warn('[sheet] fetch failed, serving stale cache:', err);
      return cache;
    }
    throw err;
  }
}

// เลือก keyword ที่ยาวที่สุดที่ match (specific ที่สุด) ป้องกัน keyword กว้างๆ ชนะ keyword เฉพาะ
// keyword < 5 ตัวอักษร ถือว่า ambiguous เกิน → ข้ามไป ให้ Gemini จัดการ
export function matchFAQ(userMessage: string, rows: FAQRow[]): string | null {
  let best: { answer: string; len: number } | null = null;

  for (const row of rows) {
    if (!row.answer) continue;
    for (const kw of row.keywords) {
      if (!kw || kw.length < 5) continue;
      if (fuzzyContains(userMessage, kw) && (!best || kw.length > best.len)) {
        best = { answer: row.answer, len: kw.length };
      }
    }
  }
  if (best) return best.answer;

  // fallback: ตรวจ question text — เลือก question ที่ยาวที่สุดที่ match (specific ที่สุด)
  let bestQ: { answer: string; len: number } | null = null;
  for (const row of rows) {
    if (!row.answer || !row.question) continue;
    if (fuzzyContains(userMessage, row.question) && (!bestQ || row.question.length > bestQ.len)) {
      bestQ = { answer: row.answer, len: row.question.length };
    }
  }
  return bestQ?.answer ?? null;
}

function rowsToText(rows: FAQRow[]): string {
  return rows
    .filter((r) => r.answer)
    .map((r) => `[${r.category}] ${r.question}\n→ ${r.answer}`)
    .join('\n\n');
}

function csvToFaqRows(csv: string): FAQRow[] {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const activeIdx = header.indexOf('active');
  const catIdx = header.findIndex((h) => h.includes('category') || h.includes('หมวด') || h.includes('หมู่'));
  const qIdx = header.findIndex((h) => h.includes('question') || h.includes('คำถาม'));
  const aIdx = header.findIndex((h) => h.includes('answer') || h.includes('คำตอบ'));
  const kIdx = header.findIndex((h) => h.includes('keyword'));

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
      const rawKeywords = kIdx >= 0 ? (row[kIdx] ?? '') : '';
      return {
        category: row[ci]?.trim() ?? '',
        question: row[qi]?.trim() ?? '',
        answer: row[ai]?.trim() ?? '',
        keywords: rawKeywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        // หมายเหตุ: URL หลายตัวในช่องเดียวใช้ | คั่น เช่น https://a.jpg|https://b.jpg
        // flex.ts จะ split | ตอน render
      };
    })
    .filter((r) => r.answer);
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
