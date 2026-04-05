/**
 * ============================================================
 * Code.gs — HTTPエンドポイント（GAS Webアプリ）
 * ============================================================
 * LIFFアプリから呼び出されるエンドポイント。
 *
 * GET（doGet）: 空き枠取得
 *   ?action=getSlots&plan=basic
 *   ?action=health
 *
 * POST（doPost）: 予約確定
 *   body: { action:"createBooking", ... }
 */

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'health';

    if (action === 'health') {
      return jsonResponse({ ok: true, message: 'GAS endpoint alive' });
    }

    if (action === 'getSlots') {
      const planId = e.parameter.plan;
      if (!planId) return jsonError('plan parameter is required');
      const plan = getPlan(planId);
      const slots = getAvailableSlots(plan.durationHours);
      return jsonResponse({ ok: true, plan: plan, slots: slots });
    }

    return jsonError(`Unknown action: ${action}`);
  } catch (err) {
    console.error(err);
    return jsonError(err.message);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'createBooking') {
      return jsonResponse(handleCreateBooking(body));
    }

    return jsonError(`Unknown action: ${action}`);
  } catch (err) {
    console.error(err);
    return jsonError(err.message);
  }
}

/**
 * 予約作成のメインフロー
 */
function handleCreateBooking(body) {
  // 入力値のバリデーション
  const required = ['plan', 'date', 'startTime', 'endTime', 'name', 'address', 'phone', 'email', 'consentAgreed'];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null || body[k] === '') {
      throw new Error(`Missing field: ${k}`);
    }
  }
  if (body.consentAgreed !== true) {
    throw new Error('Consent must be agreed');
  }

  const plan = getPlan(body.plan);

  // 予約希望日時が本当に空いているか再チェック（二重予約防止）
  const isAvailable = checkSlotAvailable(body.date, body.startTime, body.endTime);
  if (!isAvailable) {
    throw new Error('選択された時間帯は既に予約済みです。別の時間をお選びください。');
  }

  // 予約IDを発番
  const bookingId = generateBookingId();

  const booking = {
    bookingId: bookingId,
    timestamp: new Date(),
    lineUserId: body.lineUserId || '',
    lineDisplayName: body.lineDisplayName || '',
    name: body.name,
    address: body.address,
    phone: body.phone,
    email: body.email,
    plan: plan,
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
    status: 'confirmed',
  };

  // カレンダーに登録
  const eventId = createCalendarEvent(booking);
  booking.calendarEventId = eventId;

  // スプレッドシートに記録
  appendBookingRow(booking);

  // 通知送信（失敗しても予約自体は成立させる）
  const notifyResults = {
    emailToUser: safeCall(() => sendEmailToUser(booking)),
    emailToOwner: safeCall(() => sendEmailToOwner(booking)),
    lineToUser: safeCall(() => sendLineToUser(booking)),
    lineToOwner: safeCall(() => sendLineToOwner(booking)),
  };

  return {
    ok: true,
    bookingId: bookingId,
    notifications: notifyResults,
  };
}

// ============================================================
// ユーティリティ
// ============================================================

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(message) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function generateBookingId() {
  const d = new Date();
  const yyyymmdd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMMdd');
  const hhmmss = Utilities.formatDate(d, 'Asia/Tokyo', 'HHmmss');
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `BK${yyyymmdd}-${hhmmss}${rand}`;
}

/** エラーで全体を止めないためのラッパー */
function safeCall(fn) {
  try {
    fn();
    return 'ok';
  } catch (err) {
    console.error(err);
    return 'error: ' + err.message;
  }
}
