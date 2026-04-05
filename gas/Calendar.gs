/**
 * ============================================================
 * Calendar.gs — Googleカレンダー操作
 * ============================================================
 * 業務用カレンダーから空き時間を算出し、
 * プラン時間が入る枠だけを30分刻みで返す。
 *
 * 方式：業務用カレンダー（方式A）を使う前提。
 * このカレンダーに載っていない予定はすべて「空き」とみなす。
 */

const TZ = 'Asia/Tokyo';

/**
 * 指定プラン時間で予約可能なスロット一覧を返す
 * @param {number} durationHours プラン時間（例: 2.5, 3, 7）
 * @return {Array<{date:string, start:string, end:string}>}
 */
function getAvailableSlots(durationHours) {
  const calendar = CalendarApp.getCalendarById(getConfig('BUSINESS_CALENDAR_ID'));
  if (!calendar) throw new Error('Business calendar not found');

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + MIN_DAYS_AHEAD);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + MAX_DAYS_AHEAD);
  endDate.setHours(23, 59, 59, 999);

  const events = calendar.getEvents(startDate, endDate);

  const slots = [];
  const durationMin = durationHours * 60;

  // 日付ごとに空き時間を算出
  const dayMs = 24 * 60 * 60 * 1000;
  for (let t = startDate.getTime(); t <= endDate.getTime(); t += dayMs) {
    const d = new Date(t);
    const dateKey = formatDate(d);

    // その日の営業時間（9:00 - 17:00）
    const bizStart = buildDate(d, BUSINESS_HOURS.START);
    const bizEnd = buildDate(d, BUSINESS_HOURS.END);

    // その日の既存予定を抽出
    const dayEvents = events.filter(ev => {
      return ev.getStartTime() < bizEnd && ev.getEndTime() > bizStart;
    }).map(ev => ({
      start: Math.max(ev.getStartTime().getTime(), bizStart.getTime()),
      end: Math.min(ev.getEndTime().getTime(), bizEnd.getTime()),
    })).sort((a, b) => a.start - b.start);

    // 営業時間を予定で分割して「空きブロック」を算出
    const freeBlocks = [];
    let cursor = bizStart.getTime();
    for (const ev of dayEvents) {
      if (ev.start > cursor) {
        freeBlocks.push({ start: cursor, end: ev.start });
      }
      cursor = Math.max(cursor, ev.end);
    }
    if (cursor < bizEnd.getTime()) {
      freeBlocks.push({ start: cursor, end: bizEnd.getTime() });
    }

    // 各空きブロックから30分刻みでプラン時間分の枠を切り出す
    for (const block of freeBlocks) {
      const blockDurationMin = (block.end - block.start) / 60000;
      if (blockDurationMin < durationMin) continue;

      for (let s = block.start; s + durationMin * 60000 <= block.end; s += SLOT_STEP_MINUTES * 60000) {
        const slotStart = new Date(s);
        const slotEnd = new Date(s + durationMin * 60000);
        slots.push({
          date: dateKey,
          start: formatTime(slotStart),
          end: formatTime(slotEnd),
        });
      }
    }
  }

  return slots;
}

/**
 * 指定日時が予約可能かチェック（二重予約防止のための最終確認）
 */
function checkSlotAvailable(dateStr, startTimeStr, endTimeStr) {
  const calendar = CalendarApp.getCalendarById(getConfig('BUSINESS_CALENDAR_ID'));
  const start = buildDateTime(dateStr, startTimeStr);
  const end = buildDateTime(dateStr, endTimeStr);

  // 2日前ルールの確認
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + MIN_DAYS_AHEAD);
  if (start < minDate) return false;

  // 営業時間内か
  const bizStart = buildDateTime(dateStr, BUSINESS_HOURS.START);
  const bizEnd = buildDateTime(dateStr, BUSINESS_HOURS.END);
  if (start < bizStart || end > bizEnd) return false;

  // 重複イベントがないか
  const overlapping = calendar.getEvents(start, end);
  return overlapping.length === 0;
}

/**
 * 予約をカレンダーに登録
 */
function createCalendarEvent(booking) {
  const calendar = CalendarApp.getCalendarById(getConfig('BUSINESS_CALENDAR_ID'));
  const start = buildDateTime(booking.date, booking.startTime);
  const end = buildDateTime(booking.date, booking.endTime);

  const title = `【予約】${booking.plan.badge}｜${booking.name}様`;
  const description = [
    `予約ID: ${booking.bookingId}`,
    `プラン: ${booking.plan.badge}（${booking.plan.durationHours}h）${booking.plan.name}`,
    ``,
    `お名前: ${booking.name} 様`,
    `電話: ${booking.phone}`,
    `メール: ${booking.email}`,
    `住所: ${booking.address}`,
    ``,
    `LINE表示名: ${booking.lineDisplayName || '(未取得)'}`,
    `LINE User ID: ${booking.lineUserId || '(未取得)'}`,
  ].join('\n');

  const event = calendar.createEvent(title, start, end, { description: description });
  return event.getId();
}

// ============================================================
// 日付ユーティリティ
// ============================================================

function formatDate(d) {
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}
function formatTime(d) {
  return Utilities.formatDate(d, TZ, 'HH:mm');
}

/** 日付オブジェクト＋"HH:MM"文字列から Date を組み立てる */
function buildDate(baseDate, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/** "YYYY-MM-DD" + "HH:MM" から Date を組み立てる */
function buildDateTime(dateStr, hhmm) {
  const [y, mo, da] = dateStr.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi, 0, 0);
}
