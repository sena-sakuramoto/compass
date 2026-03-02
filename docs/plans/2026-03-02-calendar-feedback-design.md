# カレンダー同期先選択 + Google連携開放 + フィードバック改善 — 設計書

## 日付: 2026-03-02

## 概要

4つの改善を行う:

1. カレンダー同期先をユーザーがドロップダウンで選択可能にする（デフォルト: メインカレンダー）
2. Google連携（カレンダー）を全メンバーに開放する（admin/owner限定を解除）
3. フィードバックをサイドバーに統合 + スクショ添付機能
4. エラー発生時に報告を促すプロンプト表示

---

## 変更1: カレンダー同期先をドロップダウンで選択

### 背景

現在 `calendarSync.ts` L94 で `process.env.CALENDAR_ID || 'primary'` を全ユーザー共通で使用。
ユーザーの個人予定と混ざる問題がある。

### 方針

- ユーザーごとに同期先カレンダーIDを Firestore に保存
- OAuth済みユーザーのカレンダー一覧をAPI取得し、ドロップダウンで選択
- デフォルト: メインカレンダー（primary）

### データモデル

`users/{uid}/private/googleTokens` に `syncCalendarId` フィールドを追加:

```typescript
{
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  scope: string;
  connectedEmail: string;
  // 追加
  syncCalendarId: string | null;  // null = primary（デフォルト）
}
```

### バックエンド

#### 新API: `GET /api/google/calendars`

- OAuth済みユーザーのGoogle Calendarリストを返す
- `calendar.calendarList.list()` を使用
- レスポンス: `{ calendars: Array<{ id: string; summary: string; primary?: boolean }> }`

#### 新API: `PATCH /api/google/sync-calendar`

- リクエスト: `{ syncCalendarId: string; migrateExisting: boolean }`
- `syncCalendarId` を `users/{uid}/private/googleTokens` に保存
- `migrateExisting: true` の場合:
  1. `orgs/{orgId}/tasks` から `カレンダーイベントID` が存在するタスクを取得
  2. 各タスクについて旧カレンダーからイベント削除 → 新カレンダーに再作成
  3. 新しいイベントIDで Firestore を更新
- `migrateExisting: false` の場合: `syncCalendarId` の保存のみ

#### calendarSync.ts 変更

L94 を変更:

```typescript
// Before
const calendarId = process.env.CALENDAR_ID || 'primary';

// After
const tokenDoc = await db.collection('users').doc(userId).collection('private').doc('googleTokens').get();
const calendarId = tokenDoc.data()?.syncCalendarId || 'primary';
```

### フロントエンド

`GoogleIntegrationSettings.tsx` に「カレンダー同期設定」セクションを追加:

```
━━━ Googleカレンダー同期設定 ━━━
同期先カレンダー:
[▼ メインカレンダー (sena@archi-prisma.co.jp)]
```

- Google接続済みの場合のみ表示
- マウント時に `GET /api/google/calendars` でカレンダー一覧取得
- ドロップダウンの初期値は現在の `syncCalendarId`（未設定なら primary）

#### カレンダー切替時のダイアログ

```
┌─────────────────────────────────────┐
│ 同期先カレンダーを変更              │
│                                     │
│ 既存のイベントも新しいカレンダーに   │
│ 移動しますか？                       │
│                                     │
│  [移動する]  [新規タスクから適用]    │
└─────────────────────────────────────┘
```

- 「移動する」→ `PATCH /api/google/sync-calendar` に `migrateExisting: true`
- 「新規タスクから適用」→ `migrateExisting: false`

---

## 変更2: Google連携を全メンバーに開放

### 背景

現在 `UserManagement.tsx` L468 で Google連携タブは `super_admin || admin || owner` のみ表示。
カレンダー同期は個人のGoogleアカウントに紐づく機能なので、全メンバーが使えるべき。

### 方針

Google連携タブ自体を全ユーザーに表示。タブ内のセクションをロールで分離。

| セクション | 表示対象 | 内容 |
|-----------|---------|------|
| Googleアカウント接続 | **全ユーザー** | OAuth接続ボタン |
| カレンダー同期設定 | **全ユーザー** | 同期先カレンダー選択（変更1） |
| Drive設定 | admin/owner のみ | フォルダ設定 |
| Chat設定 | admin/owner のみ | スペース設定 |
| メンバー同期 | admin/owner のみ | 同期モード |

### 実装

#### `UserManagement.tsx`

L468-479: Google連携タブの表示条件を削除（全ユーザーに表示）。

#### `GoogleIntegrationSettings.tsx`

- props に `currentUserRole: string` を追加
- Drive/Chat/memberSync セクションを `currentUserRole === 'admin' || currentUserRole === 'owner' || currentUserRole === 'super_admin'` で条件表示

---

## 変更3: フィードバックをサイドバーに統合 + スクショ添付

### 背景

- `FeedbackButton.tsx`（固定ポジション）をサイドバーフッターに統合する作業が途中
- スクショ添付機能を追加する

### 方針

ローカルの Sidebar.tsx 変更をベースに、スクショ添付を追加。`FeedbackButton.tsx` は削除。

### サイドバーフィードバックUI

```
━━ サイドバーフッター ━━
利用規約 | プライバシー | 特商法 | ご意見

[ご意見] クリック → 展開:
  [不具合] [要望] [その他]
  ┌─────────────────────┐
  │ 内容を入力           │
  └─────────────────────┘
  📎 スクリーンショットを添付
  [プレビュー画像 ×]
  [送信]
```

### スクショ添付の実装

1. `Sidebar.tsx` にファイル input 追加（`accept="image/*"`）
2. 選択 → `URL.createObjectURL` でプレビュー表示
3. 送信時 → Firebase Storage `feedback/{timestamp}_{filename}` にアップロード → URL を `submitFeedback` に含める
4. バックエンド `feedback.ts` → メール本文にスクショ URL と img タグを追加

### Firebase Storage ルール

`storage.rules` に追加:

```
match /feedback/{filename} {
  allow write: if request.auth != null
                && request.resource.size < 5 * 1024 * 1024
                && request.resource.contentType.matches('image/.*');
  allow read: if request.auth != null;
}
```

### 削除するもの

- `web/src/components/FeedbackButton.tsx` を削除
- `App.tsx` から `FeedbackButton` の import/使用を削除

---

## 変更4: エラー発生時の報告プロンプト

### 背景

エラーが発生してもユーザーが気づかない/報告しない。エラー時に自動で報告を促す。

### 検知するエラー

| 種類 | 検知方法 |
|------|---------|
| APIエラー（4xx/5xx/ネットワーク） | `api.ts` の共通リクエスト関数でキャッチ |
| 未キャッチJSエラー | `window.onerror` + `unhandledrejection` |

### UXフロー

```
エラー発生
  ↓
画面中央にトースト表示（自動消去しない）:
┌──────────────────────────────┐
│ ⚠ エラーが発生しました       │
│                              │
│ [報告する]  [閉じる]         │
└──────────────────────────────┘
  ↓ [報告する]
サイドバーのフィードバックが展開
  - 種別: 「不具合」に自動選択
  - 本文: エラー情報を自動挿入
    例: "APIエラー: POST /api/tasks 500"
  - ユーザーが追記して送信
```

### 実装ポイント

- **頻度制限**: 同じエラーは30秒以内に2回以上表示しない（連続トースト防止）
- **自動挿入するエラー情報**: メソッド、URL、ステータスコード、エラーメッセージ（個人情報は含めない）
- **状態管理**: `App.tsx` にエラー報告用のコールバックを用意し、Sidebar に props で渡す

### api.ts 変更

共通の `request()` 関数でエラー時にコールバックを呼ぶ:

```typescript
// グローバルなエラー報告コールバック
let onApiError: ((info: { method: string; url: string; status: number; message: string }) => void) | null = null;

export function setApiErrorHandler(handler: typeof onApiError) {
  onApiError = handler;
}
```

### App.tsx 変更

- `useEffect` で `window.onerror` と `unhandledrejection` をリスン
- `setApiErrorHandler` でAPIエラーハンドラを登録
- エラー情報を state に格納 → Sidebar に渡す

### Sidebar.tsx 変更

- props に `errorReport?: { type: string; message: string } | null` と `onErrorReportHandled?: () => void` を追加
- `errorReport` が設定されたらフィードバックを自動展開、種別を「不具合」、本文にエラー情報を自動挿入

---

## やらないこと

- React ErrorBoundary（クラッシュ自体が稀、大掛かり）
- Sentry導入（Sena判断で不使用）
- カレンダーIDのリンク貼り付け（ドロップダウン選択のみ）
- Drive/Chat機能自体の変更

## 完了条件

- [ ] `pnpm build` (web) 成功
- [ ] `pnpm build` (functions) 成功
- [ ] `GET /api/google/calendars` でカレンダー一覧が返る
- [ ] `PATCH /api/google/sync-calendar` で同期先が変更できる
- [ ] `calendarSync.ts` がユーザーの `syncCalendarId` を参照している
- [ ] カレンダー切替時にダイアログ表示（移動する / 新規タスクから適用）
- [ ] Google連携タブが全ユーザーに表示される
- [ ] Drive/Chat設定セクションは admin/owner のみ表示
- [ ] FeedbackButton.tsx が削除されている
- [ ] サイドバーにフィードバックフォーム（スクショ添付付き）がある
- [ ] Firebase Storage ルールに `feedback/` のルールがある
- [ ] スクショアップロード → メールにURL含まれる
- [ ] APIエラー時に報告プロンプトが画面中央に表示される
- [ ] 未キャッチJSエラー時にも報告プロンプトが表示される
- [ ] 報告する → サイドバーフィードバックが展開、エラー情報が自動挿入される
- [ ] 同じエラーの連続トースト防止（30秒制限）
