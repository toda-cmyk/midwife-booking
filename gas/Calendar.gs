/**
 * ============================================================
 * Calendar.gs — Googleカレンダー操作
 * ============================================================
 * 3カレンダー方式で空き時間を算出する。
 *
 * - BUSINESS_CALENDAR_ID（業務カレンダー）: 予約登録先＋ブロック対象
 * - PRIVATE_CALENDAR_ID（プライベート）    : ブロック対象
 * - WORKABLE_CALENDAR_ID（保育園タイム等） : 稼働可能時間の定義
 *
 * 空き枠として表示する条件：
 *   (営業時間9-17時内) かつ
 *   (WORKABLEカレンダーに予定がある時間) かつ
 *   (BUSINESSカレンダーに予定がない) かつ
 *   (PRIVATEカレンダーに予定がない)
 *
 * WORKABLE未設定の場合は営業時間全体を稼働可能とみなす（後方互換）。
 */

const TZ = 'Asia/Tokyo';

/**
 * 指定プラン時間で予約可能なスロット一覧を返す
 * @param {number} durationHours プラン時間（例: 2.5, 3, 7）
 * @return {Array<{date:string, start:string, end:string}>}
 */
function getAvailableSlots(durationHours, plan) {
  const businessCal = CalendarApp.getCalendarById(getConfig('BUSINESS_CALENDAR_ID'));
  if (!businessCal) throw new Error('Business calendar not found');

  const privateCal = getOptionalCalendar(CALENDAR_KEYS.PRIVATE);
  const workableCal = getOptionalCalendar(CALENDAR_KEYS.WORKABLE);

  // プラン別の最短予約日数を取得（未指定ならMIN_DAYS_AHEAD）
  const minDays = (plan && plan.minDaysAhead !== undefined) ? plan.minDaysAhead : MIN_DAYS_AHEAD;

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + minDays);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + MAX_DAYS_AHEAD);
  endDate.setHours(23, 59, 59, 999);

  // ブロック対象カレンダー（業務＋プライベート）の予定を一括取得
  const blockingEvents = businessCal.getEvents(startDate, endDate);
  if (privateCal) {
    const privateEvents = privateCal.getEvents(startDate, endDate);
    privateEvents.forEach(ev => blockingEvents.push(ev));
  }

  // 稼働可能時間カレンダーの予定を取得（あれば）
  const workableEvents = workableCal ? workableCal.getEvents(startDate, endDate) : null;

  const slots = [];
  const durationMin = durationHours * 60;

  // 日付ごとに空き時間を算出
  const dayMs = 24 * 60 * 60 * 1000;
  for (let t = startDate.getTime(); t <= endDate.getTime(); t += dayMs) {
    const d = new Date(t);
    const dateKey = formatDate(d);

    // その日の営業時間（曜日別の終了時刻オーバーライドを適用）
    const dayOfWeek = d.getDay(); // 0=日, 4=木
    const dayEndTime = DAY_END_OVERRIDE[dayOfWeek] || BUSINESS_HOURS.END;
    const bizStart = buildDate(d, BUSINESS_HOURS.START);
    const bizEnd = buildDate(d, dayEndTime);

    // 営業時間が0以下の日はスキップ（例：木曜12:00終了で開始9:00だが、プランが入らないケースは下で弾く）
    if (bizStart.getTime() >= bizEnd.getTime()) continue;

    // 稼働可能ブロックを算出（WORKABLEがあればその予定内、なければ営業時間全体）
    const workableBlocks = workableCal
      ? extractDayRanges(workableEvents, bizStart, bizEnd)
      : [{ start: bizStart.getTime(), end: bizEnd.getTime() }];

    if (workableBlocks.length === 0) continue; // その日は稼働不可

    // ブロック対象（業務＋プライベート）の予定をその日の範囲で抽出
    const dayBlocking = extractDayRanges(blockingEvents, bizStart, bizEnd);

    // 1日1件ルール：業務カレンダーに既に予約がある日はスキップ
    const dayBusinessEvents = blockingEvents.filter(ev =>
      ev.getStartTime() < bizEnd && ev.getEndTime() > bizStart
    );
    const hasExistingBooking = dayBusinessEvents.some(ev =>
      ev.getTitle && ev.getTitle().startsWith('【予約】')
    );
    if (hasExistingBooking) continue;

    // 稼働可能ブロックから、ブロック予定を引いて空きブロックを算出
    const freeBlocks = [];
    for (const workable of workableBlocks) {
      freeBlocks.push(...subtractRanges(workable, dayBlocking));
    }

    // プラン別スタート時間制限
    const startEarliestMin = plan && plan.startEarliest ? toMinutesHHMM(plan.startEarliest) : 0;
    const startLatestMin = plan && plan.startLatest ? toMinutesHHMM(plan.startLatest) : 24 * 60;

    // 各空きブロックから30分刻みでプラン時間分の枠を切り出す
    for (const block of freeBlocks) {
      const blockDurationMin = (block.end - block.start) / 60000;
      if (blockDurationMin < durationMin) continue;

      for (let s = block.start; s + durationMin * 60000 <= block.end; s += SLOT_STEP_MINUTES * 60000) {
        const slotStart = new Date(s);
        const slotEnd = new Date(s + durationMin * 60000);

        // スタート時間がプラン許容範囲内か
        const startMinOfDay = slotStart.getHours() * 60 + slotStart.getMinutes();
        if (startMinOfDay < startEarliestMin || startMinOfDay > startLatestMin) continue;

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
 * 3カレンダー方式：業務＋プライベートのブロック判定＋WORKABLE内に含まれるか。
 */
function checkSlotAvailable(dateStr, startTimeStr, endTimeStr) {
  const businessCal = CalendarApp.getCalendarById(getConfig('BUSINESS_CALENDAR_ID'));
  const privateCal = getOptionalCalendar(CALENDAR_KEYS.PRIVATE);
  const workableCal = getOptionalCalendar(CALENDAR_KEYS.WORKABLE);

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

  // ブロック対象（業務＋プライベート）に重複がないか
  if (businessCal.getEvents(start, end).length > 0) return false;
  if (privateCal && privateCal.getEvents(start, end).length > 0) return false;

  // WORKABLE設定時は稼働可能時間内に完全に含まれるか
  if (workableCal) {
    const workableEvents = workableCal.getEvents(start, end);
    const covered = workableEvents.some(ev =>
      ev.getStartTime().getTime() <= start.getTime() &&
      ev.getEndTime().getTime() >= end.getTime()
    );
    if (!covered) return false;
  }

  return true;
}

/**
 * 予約を業務カレンダーに登録
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
// 内部ユーティリティ
// ============================================================

/** 任意カレンダーを安全に取得（未設定ならnull、不正IDでも例外を出さずnullを返す） */
function getOptionalCalendar(key) {
  const id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id) return null;
  try {
    return CalendarApp.getCalendarById(id);
  } catch (e) {
    console.warn(`Optional calendar ${key} failed to load: ${e.message}`);
    return null;
  }
}

/**
 * イベント配列から、指定範囲（bizStart-bizEnd）と重なる時間帯を抽出し
 * ソート済みの {start, end} 配列（ミリ秒）を返す
 */
function extractDayRanges(events, bizStart, bizEnd) {
  return events.filter(ev =>
    ev.getStartTime() < bizEnd && ev.getEndTime() > bizStart
  ).map(ev => ({
    start: Math.max(ev.getStartTime().getTime(), bizStart.getTime()),
    end: Math.min(ev.getEndTime().getTime(), bizEnd.getTime()),
  })).sort((a, b) => a.start - b.start);
}

/**
 * baseRange から blockRanges を引いた残り範囲を返す
 * baseRange, blockRanges は {start, end}（ミリ秒）
 */
function subtractRanges(baseRange, blockRanges) {
  const result = [];
  let cursor = baseRange.start;
  for (const block of blockRanges) {
    if (block.end <= cursor) continue;
    if (block.start >= baseRange.end) break;
    if (block.start > cursor) {
      result.push({ start: cursor, end: Math.min(block.start, baseRange.end) });
    }
    cursor = Math.max(cursor, block.end);
    if (cursor >= baseRange.end) break;
  }
  if (cursor < baseRange.end) {
    result.push({ start: cursor, end: baseRange.end });
  }
  return result;
}

// ============================================================
// 日付ユーティリティ
// ============================================================

/** "HH:MM" → 分数に変換 */
function toMinutesHHMM(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

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
