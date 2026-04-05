# GAS バックエンド セットアップ手順

産後ケア予約システムのGoogle Apps Script（GAS）バックエンド。

## ファイル構成

```
gas/
├── Config.gs          設定値・業務ルール定数
├── Code.gs            HTTPエンドポイント（doGet/doPost）
├── Calendar.gs        Googleカレンダー連携
├── Sheet.gs           スプレッドシート記録
├── Notifications.gs   メール・LINE通知
└── README.md          このファイル
```

## セットアップ手順

### 1. 事前準備（以下を用意）

| 準備物 | 取得方法 |
|---|---|
| **業務用Googleカレンダー** | Googleカレンダーで新規カレンダー作成。「設定」→「カレンダーの統合」→ **カレンダーID** をコピー |
| **予約ログ用スプレッドシート** | Googleスプレッドシートを新規作成。URLの `/d/XXX/edit` の `XXX` 部分が **スプレッドシートID** |
| **LINE Messaging APIチャネル** | [LINE Developers Console](https://developers.line.biz/console/) で Messaging APIチャネル作成 → **チャネルアクセストークン（長期）** を発行 |
| **オーナーのLINE User ID** | LINE Developers Console → 対象チャネル → 「Basic settings」タブ下部の **Your user ID** |
| **オーナーのメールアドレス** | 助産師（奥様）のGmailアドレス |

### 2. GASプロジェクトの作成

1. [Google Apps Script](https://script.google.com/) で新規プロジェクトを作成（プロジェクト名は任意、例：`midwife-booking`）
2. 既存の `Code.gs` を削除し、`gas/` フォルダ内の **5つの .gs ファイル** を同名で作成し、内容をコピペ
3. 保存（Ctrl+S）

### 3. 設定値の登録

以下のいずれかの方法で設定値を登録：

**方法A：スクリプトから一括登録**
1. `Config.gs` の `setupConfig()` 関数内にある各値を記入
2. エディタ上部から `setupConfig` を選択して ▶実行
3. 初回は権限承認を求められるので承認
4. 実行後、**セキュリティのため `Config.gs` の値を空に戻して再保存**

**方法B：GAS UIから手動登録**
1. 左サイドバー「プロジェクトの設定」→「スクリプトプロパティ」
2. 以下のキーと値を追加：
   - `BUSINESS_CALENDAR_ID`
   - `BOOKING_SHEET_ID`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `OWNER_LINE_USER_ID`
   - `OWNER_EMAIL`
   - `SERVICE_NAME`（任意）
   - `SENDER_NAME`（任意）

### 4. Webアプリとしてデプロイ

1. 右上「デプロイ」→「新しいデプロイ」
2. 種類：**ウェブアプリ**
3. 設定：
   - 説明：`midwife-booking v1`
   - 次のユーザーとして実行：**自分**
   - アクセスできるユーザー：**全員**
4. 「デプロイ」→ 権限承認
5. 発行された **Webアプリ URL** をコピー（`https://script.google.com/macros/s/XXXXX/exec` 形式）

→ このURLをLIFFアプリ側から呼び出す。

### 5. 動作確認

ブラウザで以下にアクセスして疎通確認：

```
https://script.google.com/macros/s/XXXXX/exec?action=health
```

期待されるレスポンス：
```json
{ "ok": true, "message": "GAS endpoint alive" }
```

空き枠取得テスト：
```
https://script.google.com/macros/s/XXXXX/exec?action=getSlots&plan=basic
```

## API仕様

### GET `?action=health`
疎通確認。

### GET `?action=getSlots&plan={planId}`
指定プランの予約可能枠を返す。

- `planId`: `premium` | `basic` | `special`

レスポンス例：
```json
{
  "ok": true,
  "plan": { "id": "basic", "name": "...", "badge": "ベーシック", "durationHours": 2.5 },
  "slots": [
    { "date": "2026-04-10", "start": "09:00", "end": "11:30" },
    { "date": "2026-04-10", "start": "09:30", "end": "12:00" }
  ]
}
```

### POST（予約確定）
Body（JSON）：
```json
{
  "action": "createBooking",
  "plan": "basic",
  "date": "2026-04-10",
  "startTime": "09:00",
  "endTime": "11:30",
  "name": "山田 花子",
  "address": "東京都○○区○○1-2-3",
  "phone": "090-1234-5678",
  "email": "hanako@example.com",
  "consentAgreed": true,
  "lineUserId": "Uxxxxxxxxxxxxxxxx",
  "lineDisplayName": "はなこ"
}
```

レスポンス例：
```json
{
  "ok": true,
  "bookingId": "BK20260405-142305123",
  "notifications": {
    "emailToUser": "ok",
    "emailToOwner": "ok",
    "lineToUser": "ok",
    "lineToOwner": "ok"
  }
}
```

## 業務ルール（Config.gs で変更可能）

| 項目 | 設定値 |
|---|---|
| 営業時間 | 9:00〜17:00 |
| 最短予約日 | 2日先から |
| 最長予約日 | 60日先まで |
| 空き枠の刻み | 30分 |

## トラブルシューティング

- **`Config missing: XXX` エラー** → スクリプトプロパティにキーが未登録。手順3を確認。
- **カレンダーが見つからない** → `BUSINESS_CALENDAR_ID` が正しいか、GAS実行ユーザーがカレンダーへアクセス権を持っているか確認。
- **LINE通知が失敗** → チャネルアクセストークンの有効期限、オーナーUser IDが自分のIDになっているか確認。
- **デプロイ後にAPI変更を反映させたい** → 「デプロイの管理」→ 既存デプロイの編集 → バージョン「新バージョン」を選んで再デプロイ。URLは変わりません。
