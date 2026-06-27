import { NextRequest, NextResponse } from 'next/server';
import { verifyFbSignature, fbSendText, fbSendQuickReplies } from '@/lib/fb';
import { fetchFAQRows, matchFAQ } from '@/lib/sheet';
import { generateReply, DEFAULT_REPLY } from '@/lib/gemini';
import { getHistory } from '@/lib/history';
import { addTurn } from '@/lib/history';
import { shouldHandoff, notifyAdmin, notifyAdminBooking } from '@/lib/handoff';
import { fuzzyContains } from '@/lib/fuzzy';
import { isPaused, pauseUser } from '@/lib/pause';
import { isBookingTrigger, hasActiveBooking, startBooking, handleBookingStep } from '@/lib/booking';
import { startOnboarding, hasActiveOnboarding, handleOnboardingStep } from '@/lib/onboarding';
import { getProfile } from '@/lib/profile';
import { log } from '@/lib/log';

export const maxDuration = 10;

// GET — Facebook webhook verification
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// POST — incoming messages
export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  const rawBody = await req.text();

  if (!verifyFbSignature(rawBody, signature)) {
    log.warn('fb_webhook.invalid_signature');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (body.object !== 'page') return NextResponse.json({ ok: true });

  const entries = (body.entry as Record<string, unknown>[]) ?? [];

  await Promise.allSettled(
    entries.flatMap((entry) => {
      const messaging = (entry.messaging as Record<string, unknown>[]) ?? [];
      return messaging.map(async (event) => {
        if (!event.message) return;
        const msg = event.message as Record<string, unknown>;
        if (msg.is_echo) return;
        const text = msg.text as string | undefined;
        if (!text) return;

        const sender = event.sender as Record<string, unknown>;
        const userId = sender.id as string;
        // ถ้ามาจาก quick reply ให้ใช้ payload แทน (เช่น "Sriwilai Suite detail")
        const quickReply = msg.quick_reply as Record<string, string> | undefined;
        const userMessage = (quickReply?.payload ?? text).trim();
        const start = Date.now();

        const send = (reply: string) => fbSendText(userId, reply);

        try {
          // 1. แอดมิน handoff pause
          if (isPaused(userId)) return;

          // 2. Onboarding — ถามชื่อครั้งแรก
          if (hasActiveOnboarding(userId)) {
            const result = await handleOnboardingStep(userId, userMessage);
            if (result) {
              await send(result.reply);
              log.info('fb.onboarding_step', { userId, done: result.done });
              return;
            }
          }
          if (!(await getProfile(userId))) {
            await send(startOnboarding(userId));
            log.info('fb.onboarding_start', { userId });
            return;
          }

          // 3. Smart Handoff
          if (shouldHandoff(userMessage)) {
            pauseUser(userId);
            await Promise.all([
              send('ขออนุญาตให้แอดมินติดต่อกลับนะคะ 🙏'),
              notifyAdmin(userId, userMessage),
            ]);
            log.info('fb.handoff', { userId, latencyMs: Date.now() - start });
            return;
          }

          // 4. Booking flow
          if (hasActiveBooking(userId)) {
            const result = handleBookingStep(userId, userMessage);
            if (result) {
              await send(result.reply);
              if (result.summary) {
                await notifyAdminBooking(userId, result.summary);
                log.info('fb.booking_complete', { userId });
              }
              log.info('fb.booking_step', { userId, latencyMs: Date.now() - start });
              return;
            }
          }
          if (isBookingTrigger(userMessage)) {
            const result = startBooking(userId);
            await send(result.reply);
            log.info('fb.booking_start', { userId, latencyMs: Date.now() - start });
            return;
          }

          // 5. FAQ rows
          let faqRows: Awaited<ReturnType<typeof fetchFAQRows>> = [];
          try {
            faqRows = await fetchFAQRows();
          } catch (err) {
            log.warn('fb.sheet_unavailable', { err: String(err) });
          }

          // 6. ห้องพัก — text format (FB ไม่มี Flex)
          const ROOMS_TRIGGERS = [
            'ห้องพักแบบไหน', 'มีห้องอะไรบ้าง', 'ประเภทห้อง', 'ดูห้องพัก', 'รูปห้อง', 'แบบห้อง',
            'ห้องมีแบบไหน', 'อยากดูห้อง', 'ขอดูรูปห้อง', 'ดูรูปห้อง', 'ห้องพักมีอะไรบ้าง',
            'มีห้องพักแบบไหน', 'ห้องมีกี่แบบ', 'ห้องพักมีกี่แบบ', 'อยากเห็นห้อง', 'ขอดูห้อง',
            'ราคาห้อง', 'ค่าห้อง', 'เรท', 'ราคาห้องพัก', 'ห้องพักราคาเท่าไหร่', 'ราคาเท่าไหร่',
          ];
          const isDetailQuery = /detail\s*$/i.test(userMessage);
          const allRoomRows = isDetailQuery ? [] : faqRows.filter((r) =>
            r.keywords.some((kw) => kw.startsWith('https://')),
          );
          const matchedRoom = allRoomRows.find((r) =>
            fuzzyContains(userMessage, r.question) || fuzzyContains(r.question, userMessage),
          );
          const isRoomsQuery = ROOMS_TRIGGERS.some((t) => fuzzyContains(userMessage, t));
          const roomRows = matchedRoom ? [matchedRoom] : isRoomsQuery ? allRoomRows : [];

          if (roomRows.length > 0) {
            if (matchedRoom) {
              // ถ้าระบุห้องชัดเจน → ส่งรายละเอียดเลย
              const lines = `🏨 ${matchedRoom.question}\n${matchedRoom.answer}`;
              await send(lines);
              addTurn(userId, userMessage, lines);
            } else {
              // ถามห้องทั่วไป → ส่ง quick replies ให้เลือก
              await fbSendQuickReplies(
                userId,
                'มีห้องพักหลายประเภทค่ะ กดเลือกห้องที่สนใจได้เลยนะคะ',
                roomRows.map((r) => ({ title: r.question })),
              );
              addTurn(userId, userMessage, `[แสดงตัวเลือกห้องพัก ${roomRows.length} ประเภท]`);
            }
            log.info('fb.rooms_sent', { userId, rooms: roomRows.length });
            return;
          }

          // 7. Direct keyword match
          const hasHistory = getHistory(userId).length > 0;
          const isFollowUp = hasHistory && userMessage.length < 15;
          const directAnswer = isFollowUp ? null : matchFAQ(userMessage, faqRows);
          if (directAnswer) {
            addTurn(userId, userMessage, directAnswer);
            await send(directAnswer);
            log.info('fb.direct_match', { userId, latencyMs: Date.now() - start });
            return;
          }

          // 8. Fallback → Gemini
          const faqText = faqRows
            .filter((r) => r.answer)
            .map((r) => `[${r.category}] ${r.question}\n→ ${r.answer}`)
            .join('\n\n');
          const profile = await getProfile(userId);
          const reply = await generateReply(userId, userMessage, faqText, profile?.name);
          await send(reply);
          log.info('fb.reply_sent', { userId, latencyMs: Date.now() - start });
        } catch (err) {
          log.error('fb.event_error', { userId, err: String((err as Error)?.message ?? err) });
          try {
            await send(DEFAULT_REPLY);
          } catch {
            // send failed
          }
        }
      });
    }),
  );

  return NextResponse.json({ ok: true });
}
