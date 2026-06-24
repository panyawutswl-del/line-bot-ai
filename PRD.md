# PRD · LINE Bot AI · ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา

## Goal

ศรีวิไล สุโขทัย รีสอร์ท แอนด์ สปา อยากตอบลูกค้า LINE OA 24 ชม.
โดยไม่ต้องจ้างแอดมินกะดึก · บอท AI ตอบด้วย FAQ ที่เจ้าของแก้ใน Google Sheet ได้ทันที

## Users

- **ลูกค้า** — ทักเข้า LINE OA · ถามเรื่องห้องพัก ราคา บริการ ที่ตั้ง การจอง
- **เจ้าของ** — แก้ Google Sheet จากมือถือเมื่อมีโปรโมชั่น/ข้อมูลใหม่
- **แอดมิน** (optional) — รับ notification เมื่อลูกค้า trigger Smart Handoff

## Acceptance criteria

1. ลูกค้าทักข้อความ → บอทตอบภายใน 5 วินาที (ตรง FAQ)
2. ลูกค้าถามเรื่องไม่อยู่ใน FAQ → บอทตอบ default reply (ไม่แต่งข้อมูล)
3. ลูกค้าถามด้วย paraphrase/synonym → บอทเข้าใจและตอบจาก FAQ
4. ลูกค้าพิมพ์ keyword handoff → บอทตอบ "ขอแอดมินติดต่อกลับ" + แจ้งกลุ่ม admin
5. Sheet ดึงไม่ได้ชั่วคราว → บอท fallback ตอบ default · ไม่ crash
6. Gemini 503 → retry สูงสุด 3 ครั้ง · ถ้ายังไม่ได้ → default reply

## Non-goals

- ❌ Multi-LINE OA — 1 channel ก่อน
- ❌ Voice/Image input — text only
- ❌ Payment/Checkout — ใช้ Handoff ส่งให้แอดมิน
- ❌ Multi-language — ตอบไทยอย่างเดียว
- ❌ Flex Card — ยังไม่จำเป็น (phase 2)
- ❌ Rich Menu — ยังไม่จำเป็น (phase 2)
