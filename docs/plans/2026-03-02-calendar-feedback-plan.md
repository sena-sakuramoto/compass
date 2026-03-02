# カレンダー同期先選択 + Google連携開放 + フィードバック改善 — 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** カレンダー同期先をユーザーが選べるようにし、Google連携を全員に開放し、フィードバックをサイドバーに統合（スクショ添付+エラー報告プロンプト付き）する。

**Architecture:** バックエンドに2つの新APIエンドポイント追加（カレンダー一覧取得、同期先変更）。calendarSync.tsをユーザー別calendarId参照に変更。フロントエンドはGoogleIntegrationSettingsにカレンダー選択UIを追加、権限条件を分離。フィードバックはSidebarに統合し、FeedbackButtonを削除。エラー報告はapi.tsのグローバルハンドラ+window.onerrorで検知しトーストで報告を促す。

**Tech Stack:** TypeScript, Express, Google Calendar API (googleapis), Firebase Storage, React, Tailwind CSS, react-hot-toast

**Design Doc:** `docs/plans/2026-03-02-calendar-feedback-design.md`

---

## Task 1: カレンダー一覧取得API

**Files:**
- Modify: `functions/src/api/google-oauth.ts` — 新エンドポイント追加
- Modify: `functions/src/lib/perUserGoogleClient.ts:11-19` — GoogleTokens型にsyncCalendarId追加

**Step 1: GoogleTokens型にsyncCalendarIdを追加**

`functions/src/lib/perUserGoogleClient.ts` L11-19:

```typescript
export interface GoogleTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  scope: string;
  connectedEmail: string;
  connectedAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  syncCalendarId?: string | null;  // null = primary（デフォルト）
}
```

**Step 2: カレンダー一覧APIを追加**

`functions/src/api/google-oauth.ts` に以下を追加:

```typescript
import { getUserCalendarClient, getUserGoogleTokens } from '../lib/perUserGoogleClient';

/**
 * GET /api/google/calendars
 * OAuth済みユーザーのGoogleカレンダー一覧を返す
 */
router.get('/calendars', async (req: any, res, next) => {
  try {
    const calendar = await getUserCalendarClient(req.uid);
    const listRes = await calendar.calendarList.list({ minAccessRole: 'writer' });
    const items = listRes.data.items ?? [];

    const tokens = await getUserGoogleTokens(req.uid);
    const syncCalendarId = tokens?.syncCalendarId ?? null;

    const calendars = items.map((item) => ({
      id: item.id,
      summary: item.summary,
      primary: item.primary ?? false,
      backgroundColor: item.backgroundColor,
    }));

    res.json({ calendars, syncCalendarId });
  } catch (error) {
    next(error);
  }
});
```

**Step 3: ビルド確認**

Run: `cd functions && npx tsc --noEmit`
Expected: エラーなし

**Step 4: コミット**

```bash
git add functions/src/lib/perUserGoogleClient.ts functions/src/api/google-oauth.ts
git commit -m "feat: add GET /api/google/calendars endpoint and syncCalendarId field"
```

---

## Task 2: カレンダー同期先変更API + calendarSync.ts修正

**Files:**
- Modify: `functions/src/api/google-oauth.ts` — PATCH /api/google/sync-calendar エンドポイント
- Modify: `functions/src/lib/calendarSync.ts:94` — calendarId参照を変更
- Modify: `functions/src/lib/perUserGoogleClient.ts` — saveGoogleTokens経由でsyncCalendarId保存

**Step 1: 同期先変更APIを追加**

`functions/src/api/google-oauth.ts` に以下を追加:

```typescript
import { db } from '../lib/firestore';
import { syncTaskToCalendar } from '../lib/calendarSync';

/**
 * PATCH /api/google/sync-calendar
 * 同期先カレンダーを変更。migrateExisting=trueで既存イベントも移動。
 */
router.patch('/sync-calendar', async (req: any, res, next) => {
  try {
    const { syncCalendarId, migrateExisting } = req.body;
    if (!syncCalendarId || typeof syncCalendarId !== 'string') {
      return res.status(400).json({ error: 'syncCalendarId is required' });
    }

    const uid = req.uid;
    const tokenRef = db.collection('users').doc(uid).collection('private').doc('googleTokens');
    const tokenDoc = await tokenRef.get();
    if (!tokenDoc.exists) {
      return res.status(400).json({ error: 'Google未連携です' });
    }

    const oldCalendarId = tokenDoc.data()?.syncCalendarId || 'primary';

    // syncCalendarIdを保存
    await tokenRef.update({ syncCalendarId });

    let migratedCount = 0;
    if (migrateExisting && oldCalendarId !== syncCalendarId) {
      // ユーザーの組織を取得
      const userDoc = await db.collection('users').doc(uid).get();
      const orgId = userDoc.data()?.orgId;
      if (orgId) {
        // カレンダーイベントID付きのタスクを取得
        const tasksSnap = await db.collection('orgs').doc(orgId).collection('tasks')
          .where('カレンダーイベントID', '!=', null)
          .get();

        const calendar = await getUserCalendarClient(uid);

        for (const doc of tasksSnap.docs) {
          const task = { id: doc.id, ...doc.data() } as any;
          try {
            // 旧カレンダーから削除
            await calendar.events.delete({
              calendarId: oldCalendarId,
              eventId: task['カレンダーイベントID'],
            }).catch(() => { /* 404は無視 */ });

            // 新カレンダーに再作成
            await syncTaskToCalendar(task, 'sync', uid, orgId);
            migratedCount++;
          } catch (err) {
            console.warn('[sync-calendar] Failed to migrate event:', task.id, err);
          }
        }
      }
    }

    res.json({ ok: true, syncCalendarId, migratedCount });
  } catch (error) {
    next(error);
  }
});
```

**Step 2: calendarSync.tsのcalendarId参照を変更**

`functions/src/lib/calendarSync.ts` L94 を変更:

```typescript
// Before:
const calendarId = process.env.CALENDAR_ID || 'primary';

// After:
const tokenDoc = await db.collection('users').doc(userId).collection('private').doc('googleTokens').get();
const calendarId = tokenDoc.data()?.syncCalendarId || 'primary';
```

**Step 3: ビルド確認**

Run: `cd functions && npx tsc --noEmit`
Expected: エラーなし

**Step 4: コミット**

```bash
git add functions/src/api/google-oauth.ts functions/src/lib/calendarSync.ts
git commit -m "feat: add PATCH /api/google/sync-calendar and per-user calendarId lookup"
```

---

## Task 3: フロントエンド — カレンダー選択UI + Google連携権限開放

**Files:**
- Modify: `web/src/lib/api.ts` — カレンダー一覧取得・同期先変更のAPI関数追加
- Modify: `web/src/components/GoogleIntegrationSettings.tsx:89-91` — props拡張、カレンダー選択セクション追加、Drive/Chat条件分岐
- Modify: `web/src/components/UserManagement.tsx:467-486` — Google連携タブ条件を削除

**Step 1: api.tsにカレンダーAPI関数を追加**

`web/src/lib/api.ts` の末尾（L1183の後）に追加:

```typescript
// ==================== Google Calendar API ====================

export async function listGoogleCalendars() {
  return request<{
    calendars: Array<{ id: string; summary: string; primary: boolean; backgroundColor?: string }>;
    syncCalendarId: string | null;
  }>('/google/calendars');
}

export async function updateSyncCalendar(payload: {
  syncCalendarId: string;
  migrateExisting: boolean;
}) {
  return request<{ ok: true; syncCalendarId: string; migratedCount: number }>('/google/sync-calendar', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
```

**Step 2: GoogleIntegrationSettingsにprops追加とカレンダー選択UI**

`web/src/components/GoogleIntegrationSettings.tsx`:

1. props型を変更 (L89-91):
```typescript
interface GoogleIntegrationSettingsProps {
  className?: string;
  currentUserRole?: string;
}
```

2. コンポーネント引数で受け取り:
```typescript
export function GoogleIntegrationSettings({ className, currentUserRole }: GoogleIntegrationSettingsProps) {
```

3. Googleアカウント接続セクション（L237-240）の直後に「カレンダー同期設定」セクションを追加:
```tsx
{/* カレンダー同期設定 — 全ユーザー */}
<CalendarSyncSection />
```

4. Drive設定（L243〜）とChat設定（L448〜）とメンバー同期（L517〜）をadmin/owner条件で囲む:
```tsx
{(currentUserRole === 'super_admin' || currentUserRole === 'admin' || currentUserRole === 'owner') && (
  <>
    {/* 既存のDrive設定セクション */}
    {/* 既存のChat設定セクション */}
    {/* 既存のメンバー同期セクション */}
  </>
)}
```

5. CalendarSyncSectionを同ファイル内に実装:
```tsx
function CalendarSyncSection() {
  const [calendars, setCalendars] = useState<Array<{ id: string; summary: string; primary: boolean; backgroundColor?: string }>>([]);
  const [syncCalendarId, setSyncCalendarId] = useState<string>('primary');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMigrateDialog, setShowMigrateDialog] = useState(false);
  const [pendingCalendarId, setPendingCalendarId] = useState<string | null>(null);

  useEffect(() => {
    listGoogleCalendars()
      .then((res) => {
        setCalendars(res.calendars);
        setSyncCalendarId(res.syncCalendarId || 'primary');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (newId: string) => {
    if (newId === syncCalendarId) return;
    setPendingCalendarId(newId);
    setShowMigrateDialog(true);
  };

  const handleConfirm = async (migrateExisting: boolean) => {
    if (!pendingCalendarId) return;
    setSaving(true);
    setShowMigrateDialog(false);
    try {
      await updateSyncCalendar({ syncCalendarId: pendingCalendarId, migrateExisting });
      setSyncCalendarId(pendingCalendarId);
      toast.success(migrateExisting ? '同期先を変更し、既存イベントを移動しました' : '同期先を変更しました');
    } catch {
      toast.error('同期先の変更に失敗しました');
    }
    setSaving(false);
    setPendingCalendarId(null);
  };

  if (loading) return <p className="text-sm text-slate-400">読み込み中...</p>;
  if (calendars.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="font-medium text-gray-900">カレンダー同期設定</h3>
      <label className="block text-sm text-slate-600">
        同期先カレンダー
        <select
          value={syncCalendarId}
          onChange={(e) => handleChange(e.target.value)}
          disabled={saving}
          className="mt-1 block w-full rounded-md border-slate-300 text-sm"
        >
          {calendars.map((cal) => (
            <option key={cal.id} value={cal.id!}>
              {cal.summary}{cal.primary ? ' (メイン)' : ''}
            </option>
          ))}
        </select>
      </label>

      {/* 移動確認ダイアログ */}
      {showMigrateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h4 className="font-medium text-gray-900 mb-2">同期先カレンダーを変更</h4>
            <p className="text-sm text-slate-600 mb-4">
              既存のイベントも新しいカレンダーに移動しますか？
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleConfirm(true)}
                className="flex-1 bg-slate-900 text-white rounded px-3 py-2 text-sm hover:bg-slate-800"
              >移動する</button>
              <button
                onClick={() => handleConfirm(false)}
                className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm hover:bg-slate-50"
              >新規タスクから適用</button>
            </div>
            <button
              onClick={() => { setShowMigrateDialog(false); setPendingCalendarId(null); }}
              className="mt-2 w-full text-sm text-slate-400 hover:text-slate-600"
            >キャンセル</button>
          </div>
        </div>
      )}
    </section>
  );
}
```

**Step 3: UserManagement.tsxのGoogle連携タブ条件を削除**

`web/src/components/UserManagement.tsx` L467-479:

```typescript
// Before: 条件付き表示
{(currentUserRole === 'super_admin' || currentUserRole === 'admin' || currentUserRole === 'owner') && (
  <button onClick={() => setActiveTab('google')} ...>

// After: 全ユーザーに表示（条件を削除）
<button onClick={() => setActiveTab('google')} ...>
```

L483-486のGoogleIntegrationSettings呼び出しにcurrentUserRoleを渡す:
```tsx
{activeTab === 'google' && (
  <GoogleIntegrationSettings currentUserRole={currentUserRole} />
)}
```

**Step 4: ビルド確認**

Run: `cd web && npx tsc --noEmit`
Expected: エラーなし

**Step 5: コミット**

```bash
git add web/src/lib/api.ts web/src/components/GoogleIntegrationSettings.tsx web/src/components/UserManagement.tsx
git commit -m "feat: calendar selector dropdown + Google integration open to all members"
```

---

## Task 4: フィードバックをサイドバーに統合 + スクショ添付

**Files:**
- Modify: `web/src/components/Sidebar.tsx` — スクショ添付UI追加
- Delete: `web/src/components/FeedbackButton.tsx`
- Modify: `web/src/App.tsx` — FeedbackButton import/使用の削除確認
- Modify: `web/src/lib/api.ts:1173-1183` — submitFeedback型にscreenshotUrl追加、uploadFeedbackScreenshot追加
- Modify: `web/src/lib/firebaseClient.ts` — Firebase Storage初期化（getStorage export）
- Modify: `functions/src/api/feedback.ts` — screenshotUrlをメール本文に追加
- Create: `storage.rules` — feedbackパスのルール
- Modify: `firebase.json` — storageセクション追加

**Step 1: Firebase Storage設定**

`storage.rules` を新規作成:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /feedback/{filename} {
      allow write: if request.auth != null
                    && request.resource.size < 5 * 1024 * 1024
                    && request.resource.contentType.matches('image/.*');
      allow read: if request.auth != null;
    }
  }
}
```

`firebase.json` に追加:
```json
"storage": {
  "rules": "storage.rules"
}
```

**Step 2: api.tsにスクショアップロード関数を追加**

`web/src/lib/api.ts` の先頭にimport追加:
```typescript
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
```

submitFeedbackの型を拡張 (L1173):
```typescript
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

export async function uploadFeedbackScreenshot(file: File): Promise<string> {
  const { getFirebaseApp } = await import('./firebaseClient');
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase not initialized');
  const storage = getStorage(app);
  const filename = `feedback/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storageRef = ref(storage, filename);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
```

Note: `firebaseClient.ts` に `getFirebaseApp` がexportされているか確認。なければ追加:
```typescript
export function getFirebaseApp(): FirebaseApp | null {
  return firebaseApp;
}
```

**Step 3: feedback.tsにscreenshotUrl対応を追加**

`functions/src/api/feedback.ts` L20:
```typescript
const { type, message, url, userAgent, screenshotUrl } = req.body;
```

L44（body構築後）に追加:
```typescript
const htmlBody = [
  `<p><strong>種別:</strong> ${typeLabel}</p>`,
  `<p><strong>ユーザー:</strong> ${user.displayName || user.email} (${user.email})</p>`,
  `<p><strong>組織:</strong> ${user.orgId}</p>`,
  `<p><strong>画面URL:</strong> ${url || '不明'}</p>`,
  `<p><strong>ブラウザ:</strong> ${userAgent || '不明'}</p>`,
  `<hr/>`,
  `<p>${message.replace(/\n/g, '<br/>')}</p>`,
  screenshotUrl ? `<p><strong>スクリーンショット:</strong><br/><img src="${screenshotUrl}" style="max-width:600px;border:1px solid #ddd;border-radius:8px;" /></p>` : '',
].filter(Boolean).join('\n');
```

sendMailにhtml追加:
```typescript
await transporter.sendMail({
  from: `"Compass フィードバック" <${gmailUser}>`,
  to: 'compass@archi-prisma.co.jp',
  replyTo: user.email,
  subject,
  text: body + (screenshotUrl ? `\n\nスクリーンショット: ${screenshotUrl}` : ''),
  html: htmlBody,
});
```

**Step 4: Sidebar.tsxにスクショ添付UIを追加**

既存のローカル変更（feedbackOpen/feedbackType/feedbackMsg state）をベースに追加:

```typescript
// 追加state
const [feedbackScreenshot, setFeedbackScreenshot] = useState<File | null>(null);
const [feedbackPreviewUrl, setFeedbackPreviewUrl] = useState<string | null>(null);
```

handleFeedbackSubmitを修正:
```typescript
const handleFeedbackSubmit = async () => {
  if (!feedbackMsg.trim()) return;
  setFeedbackSending(true);
  try {
    let screenshotUrl: string | null = null;
    if (feedbackScreenshot) {
      const { uploadFeedbackScreenshot } = await import('../lib/api');
      screenshotUrl = await uploadFeedbackScreenshot(feedbackScreenshot);
    }
    await submitFeedback({
      type: feedbackType,
      message: feedbackMsg,
      url: window.location.href,
      userAgent: navigator.userAgent,
      screenshotUrl,
    });
    setFeedbackSent(true);
    setFeedbackMsg('');
    setFeedbackScreenshot(null);
    setFeedbackPreviewUrl(null);
    window.setTimeout(() => { setFeedbackOpen(false); setFeedbackSent(false); }, 2000);
  } catch { alert('送信に失敗しました'); }
  setFeedbackSending(false);
};
```

textareaの下にスクショUIを追加:
```tsx
{/* スクショ添付 */}
<label className="flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer hover:text-slate-600">
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.414 6.586a6 6 0 108.486 8.486L20.5 13" />
  </svg>
  スクショ添付
  <input
    type="file"
    accept="image/*"
    className="hidden"
    onChange={(e) => {
      const file = e.target.files?.[0] ?? null;
      setFeedbackScreenshot(file);
      setFeedbackPreviewUrl(file ? URL.createObjectURL(file) : null);
    }}
  />
</label>
{feedbackPreviewUrl && (
  <div className="relative">
    <img src={feedbackPreviewUrl} alt="プレビュー" className="w-full rounded border border-slate-200" />
    <button
      type="button"
      onClick={() => { setFeedbackScreenshot(null); setFeedbackPreviewUrl(null); }}
      className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px]"
    >×</button>
  </div>
)}
```

**Step 5: FeedbackButton.tsxを削除**

```bash
rm web/src/components/FeedbackButton.tsx
```

App.tsxでFeedbackButtonのimport/使用がないことを確認（ローカル変更で既に削除済み）。

**Step 6: ビルド確認**

Run: `cd web && npx tsc --noEmit && cd ../functions && npx tsc --noEmit`
Expected: エラーなし

**Step 7: コミット**

```bash
git add -A
git commit -m "feat: feedback in sidebar with screenshot attachment, delete FeedbackButton"
```

---

## Task 5: エラー報告プロンプト

**Files:**
- Modify: `web/src/lib/api.ts:82-137` — グローバルエラーハンドラ追加
- Modify: `web/src/App.tsx` — window.onerror/unhandledrejection リスナー + エラートースト
- Modify: `web/src/components/Sidebar.tsx:30-37` — errorReport props追加

**Step 1: api.tsにグローバルエラーハンドラを追加**

`web/src/lib/api.ts` のApiErrorクラスの後（L15付近）に追加:

```typescript
// グローバルなAPIエラー通知コールバック
type ApiErrorInfo = { method: string; url: string; status: number; message: string };
let onApiErrorCallback: ((info: ApiErrorInfo) => void) | null = null;

export function setApiErrorHandler(handler: ((info: ApiErrorInfo) => void) | null) {
  onApiErrorCallback = handler;
}
```

`request()` 関数内のエラースロー前（L126付近）に追加:

```typescript
// 404はユーザーに報告不要
if (res.status !== 404 && onApiErrorCallback) {
  onApiErrorCallback({
    method: options.method || 'GET',
    url: path,
    status: res.status,
    message: String(message).slice(0, 200),
  });
}
```

**Step 2: Sidebar.tsxにerrorReportプロップスを追加**

`web/src/components/Sidebar.tsx` SidebarProps (L30-37):

```typescript
interface SidebarProps {
  navigationItems?: NavigationItem[];
  onNavigationChange?: (items: NavigationItem[]) => void;
  user?: User | null;
  onSignOut?: () => void;
  loading?: boolean;
  panel?: React.ReactNode;
  errorReport?: { type: string; message: string } | null;
  onErrorReportHandled?: () => void;
}
```

コンポーネント引数:
```typescript
export function Sidebar({ navigationItems, onNavigationChange, user, onSignOut, loading = false, panel, errorReport, onErrorReportHandled }: SidebarProps)
```

errorReportを受け取ったらフィードバックを自動展開するuseEffect:
```typescript
useEffect(() => {
  if (errorReport) {
    setFeedbackOpen(true);
    setFeedbackType('bug');
    setFeedbackMsg(errorReport.message);
    onErrorReportHandled?.();
  }
}, [errorReport]);
```

**Step 3: App.tsxにエラーリスナーとトーストを追加**

`web/src/App.tsx` のApp関数内に追加:

```typescript
import { setApiErrorHandler } from './lib/api';

// エラー報告プロンプト用state
const [pendingErrorReport, setPendingErrorReport] = useState<{ type: string; message: string } | null>(null);
const lastErrorTimeRef = useRef<Record<string, number>>({});

const showErrorReportPrompt = useCallback((info: { method?: string; url?: string; status?: number; message: string; source?: string }) => {
  const key = `${info.source || info.url || ''}:${info.status || 'js'}`;
  const now = Date.now();
  if (lastErrorTimeRef.current[key] && now - lastErrorTimeRef.current[key] < 30000) return; // 30秒制限
  lastErrorTimeRef.current[key] = now;

  const errorMsg = info.url
    ? `APIエラー: ${info.method} ${info.url} ${info.status}\n${info.message}`
    : `JSエラー: ${info.message}`;

  toast((t) => (
    <div className="flex items-center gap-3">
      <span className="text-sm">エラーが発生しました</span>
      <button
        onClick={() => {
          setPendingErrorReport({ type: 'bug', message: errorMsg });
          toast.dismiss(t.id);
        }}
        className="bg-slate-900 text-white px-3 py-1 rounded text-sm hover:bg-slate-800"
      >報告する</button>
      <button onClick={() => toast.dismiss(t.id)} className="text-slate-400 text-sm hover:text-slate-600">
        閉じる
      </button>
    </div>
  ), { duration: Infinity, position: 'top-center' });
}, []);

// APIエラーハンドラ登録
useEffect(() => {
  setApiErrorHandler((info) => showErrorReportPrompt(info));
  return () => setApiErrorHandler(null);
}, [showErrorReportPrompt]);

// window.onerror + unhandledrejection
useEffect(() => {
  const handleError = (event: ErrorEvent) => {
    showErrorReportPrompt({ message: event.message, source: event.filename });
  };
  const handleRejection = (event: PromiseRejectionEvent) => {
    const msg = event.reason?.message || String(event.reason);
    showErrorReportPrompt({ message: msg, source: 'unhandledrejection' });
  };
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);
  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}, [showErrorReportPrompt]);
```

Sidebarにpropsを渡す（AppLayout内のSidebar呼び出し箇所）:
```tsx
<Sidebar
  user={user}
  onSignOut={onSignOut}
  loading={loading}
  panel={...}
  errorReport={pendingErrorReport}
  onErrorReportHandled={() => setPendingErrorReport(null)}
/>
```

**Step 4: ビルド確認**

Run: `cd web && npx tsc --noEmit`
Expected: エラーなし

**Step 5: Viteビルド確認**

Run: `cd web && npx vite build`
Expected: ビルド成功

**Step 6: コミット**

```bash
git add web/src/lib/api.ts web/src/App.tsx web/src/components/Sidebar.tsx
git commit -m "feat: error report prompt via toast + auto-fill sidebar feedback"
```

---

## Task 6: 最終ビルド確認 + CODEX指示書更新

**Files:**
- Modify: `CODEX_COMPASS_CALENDAR_FEEDBACK.md` — 完了条件チェック

**Step 1: フルビルド確認**

Run: `cd web && npx tsc --noEmit && npx vite build`
Run: `cd functions && npx tsc --noEmit`
Expected: 両方エラーなし

**Step 2: 完了条件チェック**

設計書 `docs/plans/2026-03-02-calendar-feedback-design.md` の完了条件をすべて確認:

- [ ] `pnpm build` (web) 成功
- [ ] `pnpm build` (functions) 成功
- [ ] `GET /api/google/calendars` でカレンダー一覧が返る
- [ ] `PATCH /api/google/sync-calendar` で同期先が変更できる
- [ ] `calendarSync.ts` がユーザーの `syncCalendarId` を参照している
- [ ] カレンダー切替時にダイアログ表示
- [ ] Google連携タブが全ユーザーに表示される
- [ ] Drive/Chat設定セクションは admin/owner のみ表示
- [ ] FeedbackButton.tsx が削除されている
- [ ] サイドバーにフィードバックフォーム（スクショ添付付き）がある
- [ ] Firebase Storage ルールに `feedback/` のルールがある
- [ ] スクショアップロード → メールにURL含まれる
- [ ] APIエラー時に報告プロンプトが表示される
- [ ] 未キャッチJSエラー時にも報告プロンプトが表示される
- [ ] 報告する → サイドバーフィードバックが展開、エラー情報が自動挿入される
- [ ] 同じエラーの連続トースト防止（30秒制限）

**Step 3: コミット**

```bash
git add -A
git commit -m "chore: finalize calendar/feedback improvements, update docs"
```
