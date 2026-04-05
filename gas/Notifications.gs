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
