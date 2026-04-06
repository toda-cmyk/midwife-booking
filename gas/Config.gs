/**
 * ============================================================
 * Config.gs — 設定値の管理
 * ============================================================
 * すべての設定値を Script Properties から取得します。
 * 初回セットアップ時は setupConfig() を一度だけ実行してください。
 *
 * Apps Scriptエディタ → プロジェクトの設定 → スクリプトプロパティ でも
 * 手動で設定可能です。
 */

/**
 * 初回セットアップ用：ここに実値を記入してから
 * setupConfig() を1回だけ実行してください。
 * 実行後は安全のため値を空欄に戻すことを推奨します。
 */
function setupConfig() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    // 業務用 Google カレンダーID（カレンダー設定画面から取得）
    BUSINESS_CALENDAR_ID: '',

    // 予約ログ保存用スプレッドシートID（URLの /d/xxx/edit の xxx 部分）
    BOOKING_SHEET_ID: '',

    // LINE Messaging API チャネルアクセストークン（長期）
    LINE_CHANNEL_ACCESS_TOKEN: '',

    // オーナー（助産師）の LINE ユーザーID（通知送信先）
    OWNER_LINE_USER_ID: '',

    // オーナー（助産師）のメールアドレス（通知送信先）
    OWNER_EMAIL: '',

    // サービス名・送信元表示名
    SERVICE_NAME: '産後ケア訪問サービス',
    SENDER_NAME: '助産師 ○○',
  });
  Logger.log('Config setup complete. Review Script Properties.');
}

/** 設定値を取得するヘルパー */
function getConfig(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error(`Config missing: ${key}`);
  return v;
}

function getConfigOrDefault(key, defaultValue) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v || defaultValue;
}

// ============================================================
// 業務ルール定数
// ============================================================
const BUSINESS_HOURS = {
  START: '09:00',  // 営業開始時刻
  END: '17:00',    // 営業終了時刻
};

// カレンダー構成（3カレンダー方式）
// - BUSINESS: 予約登録先 ＋ ブロック対象（既存予約）
// - PRIVATE: ブロック対象（プライベート予定）
// - WORKABLE: 稼働可能時間の定義（この時間内しか予約を受け付けない）
// WORKABLE_CALENDAR_ID が未設定の場合は営業時間（9-17時）全体を稼働可能とみなす。
const CALENDAR_KEYS = {
  BUSINESS: 'BUSINESS_CALENDAR_ID',   // 業務カレンダー（既存、予約登録先）
  PRIVATE: 'PRIVATE_CALENDAR_ID',      // プライベートカレンダー
  WORKABLE: 'WORKABLE_CALENDAR_ID',   // 保育園タイム等の稼働可能時間カレンダー
};

const MIN_DAYS_AHEAD = 2;   // 予約は最短何日先から受け付けるか
const MAX_DAYS_AHEAD = 60;  // 最長何日先まで表示するか
const SLOT_STEP_MINUTES = 30; // 空き枠の切り出し刻み（分）

// プラン定義（デモHTMLと一致させる）
// startEarliest/startLatest: スタート時間の許容範囲（HH:MM）
// minDaysAhead: 最短何日先から予約可能か
// maxDaysAhead: 最長何日先まで表示するか（未指定ならグローバルのMAX_DAYS_AHEAD）
const PLANS = {
  premium: { id: 'premium', name: 'オーダーメイドプラン', badge: 'プレミアム', durationHours: 3,   startEarliest: '10:00', startLatest: '13:00', minDaysAhead: 2, maxDaysAhead: 30 },
  basic:   { id: 'basic',   name: 'シッタープラン＋選べるケア', badge: 'ベーシック', durationHours: 2.5, startEarliest: '10:00', startLatest: '13:00', minDaysAhead: 2, maxDaysAhead: 7 },
  special: { id: 'special', name: '1日貸切 オーダーメイドVIPプラン', badge: 'スペシャル', durationHours: 7,   startEarliest: '09:00', startLatest: '09:00', minDaysAhead: 2, maxDaysAhead: 30 },
};

// 曜日別の受付終了時刻（0=日, 1=月, ..., 4=木, 6=土）
// 未定義の曜日は BUSINESS_HOURS.END を使う
const DAY_END_OVERRIDE = {
  4: '12:00',  // 木曜日: 12:00 以降は受付しない
};

function getPlan(planId) {
  const p = PLANS[planId];
  if (!p) throw new Error(`Unknown plan: ${planId}`);
  return p;
}
