// ตรวจสอบว่า haystack มี needle อยู่ด้วย — ทนต่อการสะกดผิด 1-2 ตัวอักษร
export function fuzzyContains(haystack: string, needle: string): boolean {
  const h = norm(haystack);
  const n = norm(needle);

  if (h.includes(n)) return true;

  // คำสั้นเกินไป → exact เท่านั้น
  if (n.length < 5) return false;

  const maxEdits = n.length >= 9 ? 2 : 1;

  // Sliding window — ขนาดหน้าต่าง ±1 รอบความยาว needle
  for (let len = n.length - 1; len <= n.length + 1; len++) {
    for (let i = 0; i <= h.length - len; i++) {
      if (lev(h.slice(i, i + len), n, maxEdits) <= maxEdits) return true;
    }
  }
  return false;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '').trim();
}

// Levenshtein พร้อม early exit เมื่อเกิน maxCost
function lev(a: string, b: string, maxCost: number): number {
  if (Math.abs(a.length - b.length) > maxCost) return maxCost + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > maxCost) return maxCost + 1;
    prev = curr;
  }
  return prev[b.length];
}
