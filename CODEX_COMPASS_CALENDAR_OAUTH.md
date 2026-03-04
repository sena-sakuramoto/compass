# CODEX: Compass Google Calendar OAuth 修正

## 概要

Google カレンダー同期機能が動かない問題を修正する。原因は2つ：
1. OAuth スコープに `calendar.events` が含まれていない
2. TaskModal で Google 未連携時にチェックボックスが普通に押せてしまい、静かに失敗する

## 変更対象ファイル

### 1. `web/src/hooks/useGoogleConnect.ts`（1行追加）

**L38-44** の `SCOPES` 配列に `calendar.events` スコープを追加：

```ts
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',  // ← 追加
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/chat.spaces.create',
  'https://www.googleapis.com/auth/chat.memberships',
].join(' ');
```

### 2. `web/src/components/Modals/TaskModal.tsx`（UI変更）

**目的**: Google 未連携時にカレンダー同期チェックを disabled にして案内を表示する。

**変更内容**:

1. `useGoogleConnect` フックを import して呼び出す：
```ts
import { useGoogleConnect } from '../../hooks/useGoogleConnect';
```

コンポーネント内で：
```ts
const { connected: googleConnected, loading: googleLoading } = useGoogleConnect();
```

2. **L825-833** のカレンダー同期チェックボックスを以下に置き換え：

```tsx
{/* Google カレンダー同期 */}
<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={calendarSync}
      onChange={(e) => setCalendarSync(e.target.checked)}
      disabled={!googleConnected || googleLoading}
      className="h-4 w-4 rounded border-slate-300 disabled:opacity-50"
    />
    <span className={!googleConnected && !googleLoading ? 'text-slate-400' : ''}>
      Googleカレンダーに同期
    </span>
  </label>
  {!googleConnected && !googleLoading && (
    <p className="mt-1 text-xs text-amber-600">
      設定画面でGoogleアカウントを連携してください
    </p>
  )}
</div>
```

**動作仕様**:
- Google 連携済み → 今まで通りチェック可能
- Google 未連携 → チェックボックス disabled + 黄色テキストで案内表示
- ローディング中 → チェックボックス disabled（案内非表示）

### 3. `functions/src/index.ts`（secrets 配列に追加）

**L153** の `secrets` 配列に `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を追加し、TODO コメントを削除：

```ts
secrets: ['STRIPE_SECRET_KEY', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'GEMINI_API_KEY', 'COMPASS_PRICE_ID_SMALL', 'COMPASS_PRICE_ID_STANDARD', 'COMPASS_PRICE_ID_BUSINESS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
```

## 手動ステップ（Codex 実行前にオーナーが実施）

### A. Firebase Secrets 登録
```bash
cd compass
firebase functions:secrets:set GOOGLE_CLIENT_ID
# → Google Cloud Console から取得したクライアントID を入力

firebase functions:secrets:set GOOGLE_CLIENT_SECRET
# → Google Cloud Console から取得したクライアントシークレットを入力
```

**済み**: 2026-03-01 に登録完了。

### B. web/.env.local に追加
```
VITE_GOOGLE_CLIENT_ID=<Google Cloud Console のクライアントID>
```

**済み**: 2026-03-01 に追加完了。

## やらないこと

- バックエンドの `calendarSync.ts` は変更しない（既にカレンダー API を叩く実装済み）
- `GoogleIntegrationSettings.tsx` は変更しない（既にある）
- 設定画面へのリンク/ナビゲーションは追加しない（テキスト案内のみ）
- 再認可フローは不要（既存連携ユーザーなし）

## 完了条件

- [ ] `pnpm --filter web build` が成功する
- [ ] `useGoogleConnect.ts` の SCOPES に `calendar.events` が含まれる
- [ ] TaskModal で `useGoogleConnect` が呼ばれている
- [ ] Google 未連携時にチェックボックスが disabled になる
- [ ] Google 未連携時に案内テキストが表示される
- [ ] `functions/src/index.ts` の secrets 配列に `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` が含まれる
