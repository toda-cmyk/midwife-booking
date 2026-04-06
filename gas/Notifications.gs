/**
 * ============================================================
 * Notifications.gs — メール・LINE通知
 * ============================================================
 * 予約完了時に以下4通を送信：
 *   1. 予約者へメール（予約確認）
 *   2. オーナーへメール（新規予約通知）
 *   3. 予約者のLINEへPush（予約確認）
 *   4. オーナーのLINEへPush（本名・住所を含む検索可能な通知）
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateJa(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${y}年${m}月${d}日（${WEEKDAYS[dt.getDay()]}）`;
}

// ============================================================
// メール送信
// ============================================================

/**
 * 予約者宛て：予約確認メール
 */
function sendEmailToUser(booking) {
  const serviceName = getConfigOrDefault('SERVICE_NAME', '産後ケア訪問サービス');
  const senderName = getConfigOrDefault('SENDER_NAME', '助産師');
  const dateJa = formatDateJa(booking.date);

  const subject = `【${serviceName}】ご予約ありがとうございます（${booking.bookingId}）`;
  const body = [
    `${booking.name} 様`,
    ``,
    `この度はご予約いただき、誠にありがとうございます。`,
    `以下の内容でご予約を承りました。`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `予約ID: ${booking.bookingId}`,
    ``,
    `プラン: ${booking.plan.badge}（${booking.plan.durationHours}時間）`,
    `        ${booking.plan.name}`,
    ``,
    `日時: ${dateJa}`,
    `時間: ${booking.startTime}〜${booking.endTime}`,
    ``,
    `ご住所: ${booking.address}`,
    `お電話: ${booking.phone}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `※ ご予約のキャンセル・変更は前日までにご連絡ください。`,
    `※ 当日お会いできますことを楽しみにしております。`,
    ``,
    `${senderName}`,
  ].join('\n');

  GmailApp.sendEmail(booking.email, subject, body, { name: senderName });
}

/**
 * オーナー宛て：新規予約通知メール
 */
function sendEmailToOwner(booking) {
  const ownerEmail = getConfig('OWNER_EMAIL');
  const dateJa = formatDateJa(booking.date);

  const subject = `【新規予約】${dateJa} ${booking.startTime}〜 ${booking.name}様（${booking.plan.badge}）`;
  const body = [
    `新規予約が入りました。`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `予約ID: ${booking.bookingId}`,
    `受付日時: ${Utilities.formatDate(booking.timestamp, TZ, 'yyyy/MM/dd HH:mm')}`,
    ``,
    `【プラン】${booking.plan.badge}（${booking.plan.durationHours}h）`,
    `${booking.plan.name}`,
    ``,
    `【日時】${dateJa} ${booking.startTime}〜${booking.endTime}`,
    ``,
    `【お客様情報】`,
    `お名前: ${booking.name} 様`,
    `電話: ${booking.phone}`,
    `メール: ${booking.email}`,
    `住所: ${booking.address}`,
    ``,
    `【LINE情報】`,
    `表示名: ${booking.lineDisplayName || '(未取得)'}`,
    `User ID: ${booking.lineUserId || '(未取得)'}`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');

  GmailApp.sendEmail(ownerEmail, subject, body);
}

// ============================================================
// LINE Push 送信
// ============================================================

/**
 * 予約者のLINEへPush通知
 */
function sendLineToUser(booking) {
  if (!booking.lineUserId) return; // LIFF経由でない場合はスキップ

  const dateJa = formatDateJa(booking.date);
  const text = [
    `🌸 ご予約ありがとうございます`,
    ``,
    `以下の内容で承りました。`,
    ``,
    `━━━━━━━━━━━━`,
    `予約ID: ${booking.bookingId}`,
    ``,
    `【プラン】`,
    `${booking.plan.badge}（${booking.plan.durationHours}h）`,
    ``,
    `【日時】`,
    `${dateJa}`,
    `${booking.startTime}〜${booking.endTime}`,
    ``,
    `【お名前】`,
    `${booking.name} 様`,
    `━━━━━━━━━━━━`,
    ``,
    `※キャンセル・変更は前日までにご連絡ください。`,
  ].join('\n');

  linePush(booking.lineUserId, text);
}

/**
 * オーナーのLINEへPush通知
 * → LINE表示名・本名・住所を含めることで検索可能にする
 */
function sendLineToOwner(booking) {
  const ownerId = getConfig('OWNER_LINE_USER_ID');
  const dateJa = formatDateJa(booking.date);

  const text = [
    `📩 新規予約が入りました`,
    ``,
    `━━━━━━━━━━━━`,
    `【LINE表示名】`,
    `${booking.lineDisplayName || '(未取得)'}`,
    ``,
    `【お名前】`,
    `${booking.name} 様`,
    ``,
    `【電話】${booking.phone}`,
    `【メール】${booking.email}`,
    `【住所】${booking.address}`,
    ``,
    `【プラン】`,
    `${booking.plan.badge}（${booking.plan.durationHours}h）`,
    ``,
    `【日時】`,
    `${dateJa}`,
    `${booking.startTime}〜${booking.endTime}`,
    ``,
    `予約ID: ${booking.bookingId}`,
    `━━━━━━━━━━━━`,
  ].join('\n');

  linePush(ownerId, text);
}

// ============================================================
// 前日リマインド通知（定期トリガーから呼ばれる）
// ============================================================

/**
 * 毎日13:00にトリガーから実行。
 * 翌日の予約を持つユーザーにLINEでリマインドを送信する。
 */
function sendDayBeforeReminders() {
  const sheet = SpreadsheetApp.openById(getConfig('BOOKING_SHEET_ID'))
    .getSheetByName('予約一覧');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // ヘッダーからインデックスを特定
  const col = {};
  headers.forEach((h, i) => col[h] = i);

  // 翌日の日付文字列を算出
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = Utilities.formatDate(tomorrow, TZ, 'yyyy-MM-dd');
  const tomorrowWeekday = WEEKDAYS[tomorrow.getDay()];
  const tomorrowJa = `${tomorrow.getFullYear()}年${tomorrow.getMonth() + 1}月${tomorrow.getDate()}日（${tomorrowWeekday}）`;

  for (const row of rows) {
    const date = row[col['予約日']];
    const status = row[col['ステータス']];
    const lineUserId = row[col['LINE User ID']];
    const name = row[col['お名前']];
    const planBadge = row[col['プラン']];
    const duration = row[col['所要時間(h)']];
    const startTime = row[col['開始時刻']];
    const endTime = row[col['終了時刻']];
    const bookingId = row[col['予約ID']];

    // 翌日＋確定済み＋LINE ID ありのみ対象
    if (date !== tomorrowStr) continue;
    if (status !== 'confirmed') continue;
    if (!lineUserId) continue;

    // 苗字を抽出（全角/半角スペースで分割して最初の要素）
    const familyName = name.split(/[\s　]+/)[0];

    const text = [
      `${familyName}様`,
      `明日の訪問を前に、事前のご確認としてご連絡いたしました。`,
      ``,
      `━━━━━━━━━━━━━━`,
      `ご予約内容`,
      `━━━━━━━━━━━━━━`,
      `【予約ID】 ${bookingId}`,
      ``,
      `【プラン】 ${planBadge}（${duration}h）`,
      `【日時】 ${tomorrowJa} ${startTime}〜${endTime}`,
      `【お名前】 ${name} 様`,
      `━━━━━━━━━━━━━━`,
      ``,
      `💡 明日についてのお願いとご案内`,
      `・お部屋の整理整頓などは全く必要ございません。どうぞリラックスしてお待ちください。`,
      `・ご本人様やご家族の急な発熱などがある場合は、無理をなさらず速やかにお知らせください（当日でもキャンセル料はかかりません）。`,
      ``,
      `何かご不明な点や、事前に伝えておきたいことがございましたら、このLINEへお気軽にご返信ください。`,
      ``,
      `それでは、明日お会いできるのを楽しみにしております。`,
      `どうぞよろしくお願いいたします。`,
    ].join('\n');

    try {
      linePush(lineUserId, text);
      Logger.log(`✅ リマインド送信: ${name} (${tomorrowStr})`);
    } catch (err) {
      Logger.log(`❌ リマインド失敗: ${name} - ${err.message}`);
    }
  }
}

/**
 * LINE Messaging API Push送信
 */
function linePush(toUserId, text) {
  const token = getConfig('LINE_CHANNEL_ACCESS_TOKEN');
  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = {
    to: toUserId,
    messages: [{ type: 'text', text: text }],
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`LINE push failed (${code}): ${res.getContentText()}`);
  }
}
