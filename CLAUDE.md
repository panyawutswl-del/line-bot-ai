# CLAUDE.md — LINE Bot AI · ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา

## What we're building

LINE Official Account bot สำหรับ **ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา**
ตอบลูกค้า 24 ชม. โดยใช้ Gemini อ่าน FAQ จาก Google Sheet · ส่ง reply กลับ LINE

## Stack — locked

- Next.js 14 App Router + TypeScript
- `@line/bot-sdk@9` — LINE Messaging API
- `@google/genai@1` — Gemini (ใช้ `gemini-2.5-flash` เพราะ API key อยู่ free tier)
- Google Sheet CSV public URL — FAQ source
- Vercel Hobby tier

## Business info

- **ชื่อธุรกิจ**: ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา
- **ชื่อบอท**: สุดา (พนักงานต้อนรับ)
- **โทน**: สุภาพทางการ ลงท้ายด้วย "ค่ะ"
- **เบอร์โทรสำรอง**: 0941944122
- **Default reply**: "ขออภัยค่ะ เรื่องนี้ดิฉันไม่มีข้อมูลในระบบ รบกวนติดต่อเจ้าหน้าที่โดยตรงที่ 0941944122 นะคะ"

## File layout

```
app/api/line-webhook/route.ts   — POST handler (verify sig → handoff → FAQ → Gemini → reply)
lib/sheet.ts                    — fetch + parse CSV + cache 60s + format as FAQ text
lib/gemini.ts                   — Gemini wrapper (systemInstruction + retry 503 + log)
lib/handoff.ts                  — Smart Handoff keyword detection + notify admin
lib/line.ts                     — LINE reply wrapper (replyText with retry)
lib/log.ts                      — structured JSON logging
```

## Env vars (Vercel)

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `GEMINI_API_KEY`
- `SHEET_CSV_URL`
- `ADMIN_GROUP_ID` — LINE Group ID สำหรับรับ Smart Handoff notifications (optional)

## Google Sheet format

คอลัมน์: `No. | หมวดหมู่ (Category) | คำถาม (Question / Trigger) | คำตอบ (Answer) | Keyword`
- ไม่มีคอลัมน์ `active` → ส่งทุกแถว
- sheet.ts parse CSV แบบ proper (รองรับ multiline quoted fields)
- format FAQ เป็น `[หมวดหมู่] คำถาม\n→ คำตอบ` ก่อนส่งให้ AI

## Don'ts

- ❌ Hardcode token/key — ใช้ env vars เท่านั้น
- ❌ ข้าม signature verification — security risk
- ❌ ไม่มี timeout บน Gemini call — webhook ต้องตอบภายใน 10s
- ❌ Cache FAQ เกิน 60s — เจ้าของแก้ Sheet ควร reflect ทันที
- ❌ เปลี่ยน model โดยไม่ทดสอบ — free tier มีข้อจำกัดรุนแรง
  - `gemini-2.0-flash` → 429 limit=0 บน free tier
  - `gemini-1.5-flash` → 404 deprecated บน v1beta
  - `gemini-2.5-flash` → ✅ ใช้ได้ (503 intermittent → แก้ด้วย retry)
