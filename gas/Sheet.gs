/**
 * ============================================================
 * Sheet.gs — スプレッドシート予約ログ
 * ============================================================
 * 予約情報をスプレッドシートに追記する。
 * シートが存在しない場合は自動作成＋ヘッダー行をセット。
 */

const SHEET_NAME = '予約一覧';

const SHEET_HEADERS = [
  '予約ID',
  '受付日時',
  '予約日',
  '開始時刻',
  '終了時刻',
  'プラン',
  '所要時間(h)',
  'お名前',
  'ご住所',
  '電話番号',
  'メールアドレス',
  'LINE表示名',
  'LINE User ID',
  'ステータス',
  'カレンダーEvent ID',
];

/**
 * 予約1件をシートに追記
 */
function appendBookingRow(booking) {
  const sheet = getOrCreateBookingSheet();
  const row = [
    booking.bookingId,
    Utilities.formatDate(booking.timestamp, TZ, 'yyyy-MM-dd HH:mm:ss'),
    booking.date,
    booking.startTime,
    booking.endTime,
    booking.plan.badge,
    booking.plan.durationHours,
    booking.name,
    booking.address,
    booking.phone,
    booking.email,
    booking.lineDisplayName || '',
    booking.lineUserId || '',
    booking.status,
    booking.calendarEventId || '',
  ];
  sheet.appendRow(row);
}

/**
 * 予約シート取得（なければ作成してヘッダーを付与）
 */
function getOrCreateBookingSheet() {
  const ss = SpreadsheetApp.openById(getConfig('BOOKING_SHEET_ID'));
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#f3ebe0');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140); // 予約ID
    sheet.setColumnWidth(9, 200); // 住所
  }
  return sheet;
}
