/**
 * Hotel official website lookup — จำกัดเฉพาะ www.sriwilaisukhothai.com เท่านั้น
 * ใช้เมื่อไม่มีข้อมูลใน FAQ Sheet (เช่น สิ่งอำนวยความสะดวก, ร้านอาหารของโรงแรม)
 */

const WEBSITE_URL = 'https://www.sriwilaisukhothai.com';
const FETCH_TIMEOUT_MS = 4_000;
// เว็บไซต์เปลี่ยนไม่บ่อยเท่า FAQ Sheet — cache นานกว่าได้
const CACHE_TTL_MS = 10 * 60 * 1000;

interface Cache {
  text: string;
  expiresAt: number;
}

let cache: Cache | null = null;

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWebsiteText(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.text;

  const res = await fetch(WEBSITE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SriwilaiLineBot/1.0)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`website fetch ${res.status}`);

  const text = stripHtmlToText(await res.text());
  cache = { text, expiresAt: now + CACHE_TTL_MS };
  return text;
}

export async function searchHotelWebsite(): Promise<{ found: boolean; content?: string; message?: string }> {
  try {
    const content = await fetchWebsiteText();
    return { found: true, content };
  } catch (err) {
    console.error('[website] fetch failed:', err);
    return { found: false, message: 'ไม่สามารถดึงข้อมูลจากเว็บไซต์โรงแรมได้ในขณะนี้' };
  }
}
