import { NextRequest, NextResponse } from 'next/server';
import { validateSignature } from '@line/bot-sdk';
import { fetchFAQRows, matchFAQ } from '@/lib/sheet';
import { generateReply, DEFAULT_REPLY } from '@/lib/gemini';
import { getHistory } from '@/lib/history';
import { replyText, replyFlex } from '@/lib/line';
import { shouldHandoff, notifyAdmin, notifyAdminBooking } from '@/lib/handoff';
import { buildRoomsCarousel } from '@/lib/flex';
import { fuzzyContains } from '@/lib/fuzzy';
import { isPaused, pauseUser } from '@/lib/pause';
import { addTurn } from '@/lib/history';
import { log } from '@/lib/log';
import { isBookingTrigger, hasActiveBooking, startBooking, handleBookingStep } from '@/lib/booking';
import { getProfile } from '@/lib/profile';
import { startOnboarding, hasActiveOnboarding, handleOnboardingStep } from '@/lib/onboarding';

export const maxDuration = 10;

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-line-signature') ?? '';
  const rawBody = await req.text();

  if (!validateSignature(rawBody, process.env.LINE_CHANNEL_SECRET!, signature)) {
    log.warn('webhook.invalid_signature');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let events: Record<string, unknown>[];
  try {
    events = (JSON.parse(rawBody) as { events: Record<string, unknown>[] }).events;
  } catch {
    return NextResponse.json({ ok: true });
  }

  await Promise.allSettled(
    events.map(async (event) => {
      if (event.type !== 'message') return;

      const message = event.message as Record<string, unknown> | undefined;
      if (message?.type !== 'text') return;

      const userMessage = (message.text as string) ?? '';
      const replyToken = event.replyToken as string;
      const source = event.source as Record<string, unknown>;
      const userId = (source?.userId as string) ?? 'unknown';
      const sourceGroupId = source?.groupId as string | undefined;
      const start = Date.now();

      // Setup helper: ถ้าบอทอยู่ใน group และยังไม่ตั้ง ADMIN_GROUP_ID → reply บอก ID
      if (sourceGroupId) {
        if (!process.env.ADMIN_GROUP_ID) {
          await replyText(replyToken, `ID ของ group นี้คือ:\n\n${sourceGroupId}\n\nนำไปใส่ใน Vercel\nSettings → Environment Variables\nชื่อ: ADMIN_GROUP_ID`);
        }
        return;
      }

      try {
        // 1. ถ้าแอดมินกำลังคุยอยู่ → บอทหยุดตอบ 2 ชั่วโมง
        if (isPaused(userId)) return;

        // 1b. Onboarding flow — ถามชื่อ + เบอร์ ครั้งแรกที่คุย
        if (hasActiveOnboarding(userId)) {
          const result = await handleOnboardingStep(userId, userMessage);
          if (result) {
            await replyText(replyToken, result.reply);
            log.info('webhook.onboarding_step', { userId, done: result.done });
            return;
          }
        }
        if (!(await getProfile(userId))) {
          const welcome = startOnboarding(userId);
          await replyText(replyToken, welcome);
          log.info('webhook.onboarding_start', { userId });
          return;
        }

        // 2. Smart Handoff — pause user แล้วแจ้ง admin
        if (shouldHandoff(userMessage)) {
          pauseUser(userId);
          await Promise.all([
            replyText(replyToken, 'ขออนุญาตให้แอดมินติดต่อกลับนะคะ 🙏'),
            notifyAdmin(userId, userMessage),
          ]);
          log.info('handoff.routed', { userId, latencyMs: Date.now() - start });
          return;
        }

        // 3. Booking flow (state machine — bypass Gemini ทั้งหมด)
        if (hasActiveBooking(userId)) {
          const result = handleBookingStep(userId, userMessage);
          if (result) {
            await replyText(replyToken, result.reply);
            if (result.summary) {
              await notifyAdminBooking(userId, result.summary);
              log.info('webhook.booking_complete', { userId });
            }
            log.info('webhook.booking_step', { userId, latencyMs: Date.now() - start });
            return;
          }
        }

        if (isBookingTrigger(userMessage)) {
          const result = startBooking(userId);
          await replyText(replyToken, result.reply);
          log.info('webhook.booking_start', { userId, latencyMs: Date.now() - start });
          return;
        }

        // 4. ดึง FAQ rows (cached 60s)
        let faqRows: Awaited<ReturnType<typeof fetchFAQRows>> = [];
        try {
          faqRows = await fetchFAQRows();
        } catch (err) {
          log.warn('webhook.sheet_unavailable', { err: String(err) });
        }

        // 5. Rooms Flex Message
        const ROOMS_TRIGGERS = [
          'ห้องพักแบบไหน', 'มีห้องอะไรบ้าง', 'ประเภทห้อง', 'ดูห้องพัก', 'รูปห้อง', 'แบบห้อง',
          'ห้องมีแบบไหน', 'อยากดูห้อง', 'ขอดูรูปห้อง', 'ดูรูปห้อง', 'ห้องพักมีอะไรบ้าง',
          'มีห้องพักแบบไหน', 'ห้องมีกี่แบบ', 'ห้องพักมีกี่แบบ', 'อยากเห็นห้อง', 'ขอดูห้อง',
          'ราคาห้อง', 'ค่าห้อง', 'เรท', 'ราคาห้องพัก', 'ห้องพักราคาเท่าไหร่', 'ราคาเท่าไหร่',
        ];
        // ข้อความที่ลงท้าย "detail" → ไปหา FAQ/Gemini ไม่ต้อง flex
        const isDetailQuery = /detail\s*$/i.test(userMessage.trim());

        // ห้องพัก = row ที่มีรูป (keyword มี https://) เท่านั้น
        const allRoomRows = isDetailQuery ? [] : faqRows.filter((r) =>
          r.keywords.some((kw) => kw.startsWith('https://')),
        );
        log.info('webhook.room_debug', {
          totalRows: faqRows.length,
          roomRows: allRoomRows.length,
          sampleKeywords: JSON.stringify(faqRows.slice(0, 5).map((r) => ({ q: r.question, kw: r.keywords }))),
        });
        // ถ้าพิมพ์ชื่อห้องตรงๆ เช่น "Deluxe Room" → แสดงเฉพาะห้องนั้น
        const matchedRoom = allRoomRows.find((r) =>
          fuzzyContains(userMessage, r.question) || fuzzyContains(r.question, userMessage),
        );
        const isRoomsQuery = ROOMS_TRIGGERS.some((t) => fuzzyContains(userMessage, t));
        const roomRows = matchedRoom ? [matchedRoom] : isRoomsQuery ? allRoomRows : [];
        log.info('webhook.room_check', { matched: !!matchedRoom, isRoomsQuery, roomRowsLen: roomRows.length });
        if (roomRows.length > 0) {
          log.info('webhook.rooms_flex_attempt', { userId, rooms: roomRows.length });
          const carousel = buildRoomsCarousel(roomRows);
          await replyFlex(replyToken, 'ห้องพักของเรา', carousel);
          addTurn(userId, userMessage, `[แสดงการ์ดห้องพัก ${roomRows.length} ประเภท]`);
          log.info('webhook.rooms_flex_done', { userId, rooms: roomRows.length });
          return;
        }

        // 6. Direct keyword match
        const hasHistory = getHistory(userId).length > 0;
        const isFollowUp = hasHistory && userMessage.length < 15;
        const directAnswer = isFollowUp ? null : matchFAQ(userMessage, faqRows);
        if (directAnswer) {
          addTurn(userId, userMessage, directAnswer);
          await replyText(replyToken, directAnswer);
          log.info('webhook.direct_match', { userId, latencyMs: Date.now() - start });
          return;
        }

        // 7. Fallback → Gemini
        const faqText = faqRows
          .filter((r) => r.answer)
          .map((r) => `[${r.category}] ${r.question}\n→ ${r.answer}`)
          .join('\n\n');
        const profile = await getProfile(userId);
        const reply = await generateReply(userId, userMessage, faqText, profile?.name);

        await replyText(replyToken, reply);
        log.info('webhook.reply_sent', { userId, latencyMs: Date.now() - start, replyLength: reply.length });
      } catch (err) {
        log.error('webhook.event_error', {
          userId,
          err: String((err as Error)?.message ?? err),
        });
        try {
          await replyText(replyToken, DEFAULT_REPLY);
        } catch {
          // replyToken expired
        }
      }
    }),
  );

  return NextResponse.json({ ok: true });
}
