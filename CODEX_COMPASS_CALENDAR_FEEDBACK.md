# CODEX: カレンダー専用カレンダー + Google連携権限修正 + フィードバックスクショ

## 概要

3つの改善を行う：
1. カレンダー同期を「Compass」専用カレンダーに向ける（primary ではなく）
2. Google連携（カレンダー）を全メンバーに開放する（admin/owner限定を解除）
3. フィードバックボタンにスクショ添付機能を追加

---

## 変更1: Compass 専用カレンダー作成・同期

### 目的
タスクを同期する先を `primary`（個人カレンダー）ではなく、自動作成する「Compass」カレンダーにする。ユーザーの個人予定と混ざらない。

### バックエンド: `functions/src/lib/calendarSync.ts`

**変更内容**:

1. `syncTaskToCalendar` 関数の冒頭で、ユーザーの Compass 専用カレンダーIDを取得する処理を追加：

```ts
// ユーザーの Compass カレンダーIDを取得。なければ作成。
async function getOrCreateCompassCalendar(
  calendar: calendar_v3.Calendar,
  uid: string
): Promise<string> {
  // Firestore からカレンダーIDを取得
  const tokenDoc = await db.collection('users').doc(uid).collection('private').doc('googleTokens').get();
  const existingCalId = tokenDoc.data()?.compassCalendarId;
  if (existingCalId) {
    // 存在確認（削除されていないか）
    try {
      await calendar.calendars.get({ calendarId: existingCalId });
      return existingCalId;
    } catch (e) {
      // 404なら再作成
      if (!isNotFoundError(e)) throw e;
    }
  }

  // 新規作成
  const res = await calendar.calendars.insert({
    requestBody: {
      summary: 'Compass',
      description: 'Project Compass タスク同期用カレンダー',
      timeZone: process.env.CALENDAR_TIMEZONE ?? 'Asia/Tokyo',
    },
  });
  const newCalId = res.data.id!;

  // Firestore に保存
  await db.collection('users').doc(uid).collection('private').doc('googleTokens').update({
    compassCalendarId: newCalId,
  });

  return newCalId;
}
```

2. `syncTaskToCalendar` 内の `calendarId` 取得を変更：

**Before (L94)**:
```ts
const calendarId = process.env.CALENDAR_ID || 'primary';
```

**After**:
```ts
const calendarId = await getOrCreateCompassCalendar(calendar, userId);
```

3. `isNotFoundError` 関数は既存のものを再利用（L65-68）。

### フロントエンド変更なし

カレンダーIDの管理はバックエンドで完結する。

---

## 変更2: Google連携（カレンダー）を全メンバーに開放

### 目的
現状 Google連携タブは admin/owner のみ表示だが、カレンダー同期は個人の Google アカウントに紐づく機能。全メンバーが自分のアカウントを連携できるべき。

### `web/src/components/UserManagement.tsx`

**L467-479 付近**: Google連携タブの表示条件を変更。

**Before**:
```tsx
{(currentUserRole === 'super_admin' || currentUserRole === 'admin' || currentUserRole === 'owner') && (
  <button
    onClick={() => setActiveTab('google')}
    ...
  >
    <Settings className="w-4 h-4" />
    Google連携
  </button>
)}
```

**After**: 条件を削除し、全ユーザーにタブを表示する：
```tsx
<button
  onClick={() => setActiveTab('google')}
  ...
>
  <Settings className="w-4 h-4" />
  Google連携
</button>
```

### `web/src/components/GoogleIntegrationSettings.tsx`

このコンポーネントには Drive フォルダ設定や Chat スペース設定など org レベルの設定も含まれている。カレンダー連携（個人）と org 設定を分ける：

- **Google アカウント接続セクション**（`GoogleConnectButton`）: 全ユーザーに表示
- **Drive 設定 / Chat 設定 / メンバー同期**: admin/owner のみ表示

具体的には、コンポーネント内で現在のユーザーロールを取得し、Drive/Chat/memberSync セクションを条件分岐で非表示にする。

ロール取得は既存の `useAuth` フック等から取得すること（UserManagement.tsx で `currentUserRole` をどう取得しているか参考にする）。

なければ props で `currentUserRole` を `GoogleIntegrationSettings` に渡す。

---

## 変更3: フィードバックにスクショ添付

### 目的
ユーザーが不具合報告時にスクリーンショットを添付できるようにする。

### フロントエンド: `web/src/components/FeedbackButton.tsx`

1. state 追加：
```ts
const [screenshot, setScreenshot] = useState<File | null>(null);
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
```

2. textarea の下にファイル input を追加：
```tsx
<div className="mt-2">
  <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer hover:text-slate-700">
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.414 6.586a6 6 0 108.486 8.486L20.5 13" />
    </svg>
    スクリーンショットを添付
    <input
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0] ?? null;
        setScreenshot(file);
        if (file) {
          setPreviewUrl(URL.createObjectURL(file));
        } else {
          setPreviewUrl(null);
        }
      }}
    />
  </label>
  {previewUrl && (
    <div className="relative mt-1">
      <img src={previewUrl} alt="プレビュー" className="w-full rounded-lg border border-slate-200" />
      <button
        type="button"
        onClick={() => { setScreenshot(null); setPreviewUrl(null); }}
        className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
      >
        ×
      </button>
    </div>
  )}
</div>
```

3. `handleSubmit` を修正 — スクショがある場合は先に Firebase Storage にアップロード：

```ts
const handleSubmit = async () => {
  if (!message.trim()) return;
  setSending(true);

  try {
    let screenshotUrl: string | null = null;

    if (screenshot) {
      screenshotUrl = await uploadFeedbackScreenshot(screenshot);
    }

    await submitFeedback({
      type,
      message,
      url: window.location.href,
      userAgent: navigator.userAgent,
      screenshotUrl,
    });

    setSent(true);
    setMessage('');
    setScreenshot(null);
    setPreviewUrl(null);
    // ...rest unchanged
  }
  // ...rest unchanged
};
```

4. reset 時に `setScreenshot(null); setPreviewUrl(null);` を追加（閉じる時も）。

### フロントエンド: `web/src/lib/api.ts`

1. `submitFeedback` の payload 型に `screenshotUrl` を追加：
```ts
export async function submitFeedback(payload: {
  type: 'bug' | 'feature' | 'other';
  message: string;
  url: string;
  userAgent: string;
  screenshotUrl?: string | null;
}) {
  return request<{ ok: true }>('/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
```

2. Firebase Storage アップロード関数を追加：
```ts
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export async function uploadFeedbackScreenshot(file: File): Promise<string> {
  const storage = getStorage();
  const filename = `feedback/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, filename);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
```

Note: Firebase Storage の import が `web/src/lib/api.ts` に既にあるか確認。なければ `web/src/lib/firebase.ts` 等の既存のFirebase初期化ファイルから storage instance を取得すること。

### バックエンド: `functions/src/api/feedback.ts`

メール本文に `screenshotUrl` を追加：

**Before** (メール本文構築部分):
```ts
// 現在のメール本文にscreenshotUrlの行を追加
```

**After**: `req.body.screenshotUrl` があれば、メール本文の末尾にリンクを追加：
```ts
const screenshotUrl = req.body.screenshotUrl;
// ...既存のメール本文の後に:
if (screenshotUrl) {
  text += `\n\nスクリーンショット: ${screenshotUrl}`;
  // HTML版にも画像タグを追加
  html += `<p><strong>スクリーンショット:</strong><br/><img src="${screenshotUrl}" style="max-width:600px;border:1px solid #ddd;border-radius:8px;" /></p>`;
}
```

### Firebase Storage ルール

`feedback/` パスに認証済みユーザーの書き込みを許可するルールが必要。既存の Storage ルールファイル（`storage.rules`）に追加：

```
match /feedback/{filename} {
  allow write: if request.auth != null
                && request.resource.size < 5 * 1024 * 1024  // 5MB制限
                && request.resource.contentType.matches('image/.*');
  allow read: if request.auth != null;
}
```

---

## やらないこと

- カレンダー同期の ON/OFF UI は変えない（既に TaskModal に実装済み）
- Drive / Chat 機能自体は変更しない
- フィードバックの保存先は変えない（メール送信のまま）

## 完了条件

- [ ] `pnpm build` (web) 成功
- [ ] `pnpm build` (functions) 成功
- [ ] `calendarSync.ts` で `getOrCreateCompassCalendar` が使われている
- [ ] `calendarSync.ts` から `process.env.CALENDAR_ID || 'primary'` が削除されている
- [ ] Google連携タブが全ユーザーに表示される
- [ ] Drive/Chat 設定セクションは admin/owner のみ表示
- [ ] FeedbackButton にファイル input がある
- [ ] スクショアップロード → メールに URL 含まれる
- [ ] Firebase Storage ルールに `feedback/` のルールがある
