/**
 * ============================================================
 * DevHelpers.gs — 開発用ヘルパー関数
 * ============================================================
 * GASエディタ上から手動実行する開発・動作確認用の関数群。
 * clasp push 後、Apps Scriptエディタで関数を選択→実行。
 */

/**
 * ヘルパー1: 業務用カレンダーを自動作成して設定に登録
 * 実行すると奥様のアカウント配下に新規カレンダーが作られる。
 */
function helper_createBusinessCalendar() {
  const name = '出張助産師 業務カレンダー';
  const calendar = CalendarApp.createCalendar(name, {
    summary: '予約システムと連携する業務用カレンダー',
    timeZone: TZ,
  });
  const calId = calendar.getId();
  PropertiesService.getScriptProperties().setProperty('BUSINESS_CALENDAR_ID', calId);
  Logger.log('✅ カレンダー作成完了');
  Logger.log('名前: ' + name);
  Logger.log('ID: ' + calId);
  Logger.log('→ BUSINESS_CALENDAR_ID としてスクリプトプロパティに保存しました。');
}

/**
 * ヘルパー1-B: プライベートカレンダーを自動作成
 */
function helper_createPrivateCalendar() {
  const name = 'プライベート';
  const calendar = CalendarApp.createCalendar(name, {
    summary: '予約システムでブロック対象として扱うプライベート予定',
    timeZone: TZ,
  });
  const calId = calendar.getId();
  PropertiesService.getScriptProperties().setProperty('PRIVATE_CALENDAR_ID', calId);
  Logger.log('✅ プライベートカレンダー作成完了');
  Logger.log('名前: ' + name);
  Logger.log('ID: ' + calId);
  Logger.log('→ PRIVATE_CALENDAR_ID としてスクリプトプロパティに保存しました。');
}

/**
 * ヘルパー1-C: 保育園タイムカレンダーを自動作成
 * このカレンダーに予定が入っている時間だけ予約を受け付ける。
 */
function helper_createWorkableCalendar() {
  const name = '保育園タイム';
  const calendar = CalendarApp.createCalendar(name, {
    summary: '予約受付可能な時間帯（子の保育園預け時間など）',
    timeZone: TZ,
  });
  const calId = calendar.getId();
  PropertiesService.getScriptProperties().setProperty('WORKABLE_CALENDAR_ID', calId);
  Logger.log('✅ 保育園タイムカレンダー作成完了');
  Logger.log('名前: ' + name);
  Logger.log('ID: ' + calId);
  Logger.log('→ WORKABLE_CALENDAR_ID としてスクリプトプロパティに保存しました。');
  Logger.log('');
  Logger.log('【重要】このカレンダーに予定を入れた時間だけ、予約枠として表示されます。');
  Logger.log('例：「保育園預け」10:00-16:00 の予定を入れる → その時間内のみ予約可能。');
}

/**
 * ヘルパー2: 予約ログ用スプレッドシートを自動作成して設定に登録
 */
function helper_createBookingSpreadsheet() {
  const ss = SpreadsheetApp.create('予約ログ — 出張助産師サービス');
  const id = ss.getId();
  PropertiesService.getScriptProperties().setProperty('BOOKING_SHEET_ID', id);
  // 初期化（ヘッダー行を作る）
  getOrCreateBookingSheet();
  Logger.log('✅ スプレッドシート作成完了');
  Logger.log('ID: ' + id);
  Logger.log('URL: ' + ss.getUrl());
  Logger.log('→ BOOKING_SHEET_ID としてスクリプトプロパティに保存しました。');
}

/**
 * ヘルパー3: 現在の設定状況を一覧表示
 */
function helper_showConfig() {
  const keys = [
    'BUSINESS_CALENDAR_ID',
    'PRIVATE_CALENDAR_ID',
    'WORKABLE_CALENDAR_ID',
    'BOOKING_SHEET_ID',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'OWNER_LINE_USER_ID',
    'OWNER_EMAIL',
    'SERVICE_NAME',
    'SENDER_NAME',
  ];
  const props = PropertiesService.getScriptProperties();
  Logger.log('=== 現在の設定状況 ===');
  keys.forEach(k => {
    const v = props.getProperty(k);
    if (!v) {
      Logger.log(`❌ ${k}: (未設定)`);
    } else if (k.includes('TOKEN')) {
      // トークンはマスク表示
      Logger.log(`✅ ${k}: ${v.substring(0, 8)}...${v.substring(v.length - 4)}`);
    } else {
      Logger.log(`✅ ${k}: ${v}`);
    }
  });
}

/**
 * ヘルパー4: LINE接続テスト（オーナー自身にテストPush送信）
 */
function helper_testLineConnection() {
  try {
    const ownerId = getConfig('OWNER_LINE_USER_ID');
    linePush(ownerId, '✅ LINE接続テスト成功しました。\nこのメッセージが届いていれば、予約通知が正常に送信されます。');
    Logger.log('✅ LINE送信成功。LINEアプリで通知を確認してください。');
  } catch (err) {
    Logger.log('❌ LINE送信失敗: ' + err.message);
    Logger.log('→ LINE_CHANNEL_ACCESS_TOKEN と OWNER_LINE_USER_ID を確認してください。');
  }
}

/**
 * ヘルパー5: メール送信テスト（オーナーにテストメール）
 */
function helper_testEmail() {
  try {
    const ownerEmail = getConfig('OWNER_EMAIL');
    GmailApp.sendEmail(
      ownerEmail,
      '【テスト】予約システム接続確認',
      'メール送信テストに成功しました。\nこのメールが届いていれば、予約通知が正常に送信されます。'
    );
    Logger.log('✅ メール送信成功: ' + ownerEmail);
  } catch (err) {
    Logger.log('❌ メール送信失敗: ' + err.message);
  }
}

/**
 * ヘルパー6: 空き枠取得のテスト（basicプランで先30日分）
 */
function helper_testGetSlots() {
  try {
    const slots = getAvailableSlots(2.5);
    Logger.log(`✅ 空き枠を ${slots.length} 件取得`);
    slots.slice(0, 10).forEach(s => {
      Logger.log(`  ${s.date} ${s.start}〜${s.end}`);
    });
    if (slots.length > 10) Logger.log(`  ... 他 ${slots.length - 10} 件`);
  } catch (err) {
    Logger.log('❌ 取得失敗: ' + err.message);
  }
}

/**
 * ヘルパー7: ダミー予約を作成してエンドツーエンド動作確認
 * ⚠ 実際にメール・LINE通知が送信されます
 */
function helper_testCreateBooking() {
  const slots = getAvailableSlots(2.5);
  if (slots.length === 0) {
    Logger.log('❌ 空き枠がありません');
    return;
  }
  const slot = slots[0];
  const testBody = {
    action: 'createBooking',
    plan: 'basic',
    date: slot.date,
    startTime: slot.start,
    endTime: slot.end,
    name: 'テスト 太郎',
    address: '東京都テスト区テスト1-2-3',
    phone: '090-0000-0000',
    email: getConfig('OWNER_EMAIL'), // 自分宛にテストメール
    consentAgreed: true,
    lineUserId: getConfig('OWNER_LINE_USER_ID'),
    lineDisplayName: 'テストユーザー',
  };
  const result = handleCreateBooking(testBody);
  Logger.log('✅ ダミー予約作成完了');
  Logger.log('予約ID: ' + result.bookingId);
  Logger.log('通知結果: ' + JSON.stringify(result.notifications));
}

/**
 * ヘルパー: 3カレンダーの中身を個別にダンプ（診断用）
 */
function helper_debugCalendars() {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + MIN_DAYS_AHEAD);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 14); // 2週間だけ見る
  endDate.setHours(23, 59, 59, 999);

  Logger.log(`=== 期間: ${formatDate(startDate)} 〜 ${formatDate(endDate)} ===`);

  const targets = [
    { key: CALENDAR_KEYS.BUSINESS, label: '業務カレンダー' },
    { key: CALENDAR_KEYS.PRIVATE, label: 'プライベート' },
    { key: CALENDAR_KEYS.WORKABLE, label: '保育園タイム' },
  ];

  targets.forEach(t => {
    const id = PropertiesService.getScriptProperties().getProperty(t.key);
    Logger.log(`\n--- ${t.label} (${t.key}) ---`);
    Logger.log(`ID: ${id || '(未設定)'}`);
    if (!id) return;
    try {
      const cal = CalendarApp.getCalendarById(id);
      if (!cal) {
        Logger.log('❌ カレンダーが見つかりません');
        return;
      }
      Logger.log(`名前: ${cal.getName()}`);
      const events = cal.getEvents(startDate, endDate);
      Logger.log(`予定件数: ${events.length}`);
      events.forEach(ev => {
        Logger.log(`  ${formatDate(ev.getStartTime())} ${formatTime(ev.getStartTime())}-${formatTime(ev.getEndTime())} : ${ev.getTitle()}`);
      });
    } catch (e) {
      Logger.log(`❌ エラー: ${e.message}`);
    }
  });
}

/**
 * ヘルパー: 前日リマインドの毎日13時トリガーを設定（1回だけ実行）
 */
function helper_setupReminderTrigger() {
  // 既存の同名トリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'sendDayBeforeReminders') {
      ScriptApp.deleteTrigger(t);
      Logger.log('既存トリガーを削除しました。');
    }
  });

  // 毎日13:00に実行するトリガーを作成
  ScriptApp.newTrigger('sendDayBeforeReminders')
    .timeBased()
    .everyDays(1)
    .atHour(13)
    .nearMinute(0)
    .create();
  Logger.log('✅ 前日リマインドトリガー設定完了: 毎日13:00に実行');
  Logger.log('→ 翌日の予約を持つユーザーにLINEリマインドを送信します。');
}

/**
 * ヘルパー8: デプロイ後のWebアプリURLを確認
 */
function helper_showWebAppUrl() {
  try {
    const url = ScriptApp.getService().getUrl();
    Logger.log('Webアプリ URL:');
    Logger.log(url);
    Logger.log('→ このURLをLIFFエンドポイントURLに設定してください。');
  } catch (err) {
    Logger.log('❌ まだデプロイされていません。「デプロイ > 新しいデプロイ」を実行してください。');
  }
}
