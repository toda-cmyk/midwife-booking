# 開発環境セットアップ（VS Code + clasp → 奥様のGASへ）

VS Code で編集したコードを、**奥様のGoogleアカウント上のGASプロジェクト** に `clasp push` で反映させるワークフロー。

## 全体像

```
[あなたのVS Code]
  │ clasp push
  ▼
[奥様のGoogleアカウント内のGASプロジェクト]
  ├─ 奥様のGoogleカレンダーに予定登録
  ├─ 奥様のGmailからメール送信
  └─ 奥様のスプレッドシートにログ記録
```

---

## 初回セットアップ（1回だけ）

### 1. Node.js のインストール確認

```bash
node --version   # v18以上推奨
npm --version
```

なければ https://nodejs.org/ja からインストール。

### 2. clasp をインストール

```bash
cd c:/Users/aruke/OneDrive/Documents/WORK/projects/midwife-booking-demo
npm install
```

→ `node_modules/` 内にローカルインストールされます。

### 3. 奥様のGoogleアカウントでログイン

```bash
npm run login
```

→ ブラウザが開きます。**奥様のGoogleアカウント** でログインして認証を許可してください。

> 💡 別のGoogleアカウントでログインし直したい場合：
> ```bash
> npm run logout
> npm run login
> ```

### 4. Apps Script APIを有効化

初回のみ、https://script.google.com/home/usersettings にアクセスして **「Google Apps Script API」をオン** にしてください。

### 5. GASプロジェクトを新規作成

```bash
npm run create
```

→ 奥様のアカウント配下に「予約システム」という名前のGASプロジェクトが作成され、`.clasp.json` に `scriptId` が自動で書き込まれます。

### 6. 初回 push（コード全部を送信）

```bash
npm run push
```

→ `gas/` 配下の全ファイル（Config.gs, Code.gs, Calendar.gs, Sheet.gs, Notifications.gs, DevHelpers.gs, appsscript.json）が送信されます。

### 7. GASエディタを開いて初期設定

```bash
npm run open
```

→ ブラウザでGASエディタが開きます。以下を実行：

#### 7-1. 業務カレンダーを自動作成
左の関数リストから `helper_createBusinessCalendar` を選択 → ▶実行  
（初回は権限承認を求められます。承認してください）  
→ 実行ログに出たカレンダーIDが自動で保存されます。

#### 7-2. 予約ログ用スプレッドシートを自動作成
同様に `helper_createBookingSpreadsheet` を選択 → ▶実行  
→ スプレッドシートが作成され、IDが自動保存されます。ログ内URLからアクセス可能。

#### 7-3. 残りの設定値を手動入力
左サイドバー「プロジェクトの設定」→「スクリプトプロパティ」で以下を追加：

| キー | 値 |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developersで発行したトークン |
| `OWNER_LINE_USER_ID` | 奥様のLINE User ID |
| `OWNER_EMAIL` | 奥様のメールアドレス |
| `SERVICE_NAME` | 産後ケア訪問サービス（任意） |
| `SENDER_NAME` | 助産師 ○○（任意） |

#### 7-4. 設定確認
`helper_showConfig` を実行 → ログで全項目が ✅ になっていることを確認。

#### 7-5. 接続テスト
- `helper_testLineConnection` を実行 → 奥様のLINEにテスト通知が届く
- `helper_testEmail` を実行 → 奥様のメールにテストメールが届く
- `helper_testGetSlots` を実行 → カレンダーから空き枠が取れる

### 8. Webアプリとしてデプロイ

GASエディタ右上 **「デプロイ > 新しいデプロイ」**

- 種類：**ウェブアプリ**
- 次のユーザーとして実行：**自分（奥様のアカウント）**
- アクセスできるユーザー：**全員**

「デプロイ」をクリック → **ウェブアプリ URL** が発行されるのでコピー。

→ このURLを LINE LIFF のエンドポイントURLに設定します（後の工程）。

---

## 日常の開発フロー（コードを変更するたび）

### コード編集 → push

```bash
# VS Codeでgas/*.gs を編集
npm run push
```

→ 数秒で奥様のGASに反映されます。

### デプロイの更新

コード変更を本番URLに反映させるには：

- 同じURLで更新したい場合：
  ```bash
  npm run deployments   # deploymentId を確認
  npx clasp deploy --deploymentId <ID> --description "update"
  ```
- または GASエディタの「デプロイの管理」→ 既存デプロイを編集 → 「新バージョン」を選んで再デプロイ

### ログを確認

```bash
npm run logs            # 実行ログをターミナルに出力
```

または GASエディタの「実行数」タブ。

---

## よく使うコマンド

| コマンド | 説明 |
|---|---|
| `npm run push` | ローカルの変更をGASに送信 |
| `npm run pull` | GAS側の変更をローカルに取り込む（GASエディタで直接編集した場合） |
| `npm run open` | GASエディタをブラウザで開く |
| `npm run logs` | 実行ログを表示 |
| `npm run deployments` | 現在のデプロイ一覧を表示 |

---

## トラブルシューティング

**`Error: Could not read API credentials`**
→ `npm run login` を実行していない。

**`Error: Script API has not been used...`**
→ 手順4（Apps Script APIを有効化）を忘れている。

**`clasp push` で「Push failed」**
→ `.clasp.json` の `scriptId` が正しいか確認。別のアカウントでログインしている可能性も。

**カレンダーのイベントが作られない**
→ GASエディタで `helper_createBusinessCalendar` を実行したか確認。`helper_showConfig` で `BUSINESS_CALENDAR_ID` が埋まっているか。

**LINE通知が飛ばない**
→ `helper_testLineConnection` でエラーメッセージを確認。トークンの有効期限切れが多い。
