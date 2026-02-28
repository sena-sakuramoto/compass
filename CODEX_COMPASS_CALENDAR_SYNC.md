# CODEX_COMPASS_CALENDAR_SYNC.md

## 目的

CompassのタスクとGoogleカレンダーの双方向同期を実装する。
本指示書はPhase 1: タスクに時刻フィールドを追加し、Push同期（Compass → Googleカレンダー）を完成させる。

## 背景

現状:
- タスクに `カレンダーイベントID` フィールドは既に存在する
- `functions/src/api/calendar.ts` に `/sync` エンドポイントが存在するが、最小限の実装
- `functions/src/lib/jobs.ts` に `enqueueCalendarSync` が存在する
- Google OAuthは `functions/src/api/google-oauth.ts` で実装済み（ユーザー別トークン管理）

課題:
- タスクには日付（YYYY-MM-DD）しかなく、時刻がない → カレンダーに同期しても終日イベントにしかならない
- 実際のカレンダー同期処理（イベント作成/更新/削除）が未実装

## フェーズ構成

| Phase | 内容 | 本指示書 |
|---|---|---|
| **Phase 1** | 時刻フィールド追加 + Push同期（Compass→Gcal）完成 | **対象** |
| Phase 2 | Pull同期（Gcal→Compass）| 将来 |
| Phase 3 | 双方向リアルタイム同期 | 将来 |

## 変更対象ファイル

### バックエンド（型定義・データモデル）

1. `functions/src/lib/types.ts` — Task に時刻フィールド追加
2. `functions/src/api/tasks.ts` — タスク更新時にカレンダー同期ジョブをエンキュー

### バックエンド（カレンダー同期処理）

3. `functions/src/api/calendar.ts` — カレンダー同期処理の本実装
4. `functions/src/lib/jobs.ts` — calendar_syncジョブの処理ロジック（もし未実装なら）

### フロントエンド（型定義）

5. `web/src/lib/types.ts` — Task に時刻フィールド追加

### フロントエンド（UI）

6. `web/src/components/Modals/TaskModal.tsx` — 時刻入力UI追加 + カレンダー同期トグル

## 実装手順

### Step 1: タスクに時刻フィールドを追加

**`functions/src/lib/types.ts`** の Task interface に追加:

```typescript
// カレンダー連携用の時刻フィールド
startTime?: string | null;  // HH:MM形式（例: "09:00"）
endTime?: string | null;    // HH:MM形式（例: "10:30"）
calendarSync?: boolean | null; // カレンダー同期を有効にするか
```

**`web/src/lib/types.ts`** にも同様に追加:

```typescript
startTime?: string;
endTime?: string;
calendarSync?: boolean;
```

### Step 2: TaskModal に時刻入力UI追加

`web/src/components/Modals/TaskModal.tsx` に以下を追加。
既存の「予定開始日」「期限」の入力フィールドの隣に時刻入力を配置:

```tsx
{/* 開始日 + 時刻 */}
<div className="grid grid-cols-2 gap-2">
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">開始日</label>
    {/* 既存の日付入力 */}
  </div>
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">開始時刻</label>
    <input
      type="time"
      value={startTime || ''}
      onChange={(e) => setStartTime(e.target.value || null)}
      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
    />
  </div>
</div>

{/* 期限 + 時刻 */}
<div className="grid grid-cols-2 gap-2">
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">期限</label>
    {/* 既存の日付入力 */}
  </div>
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">終了時刻</label>
    <input
      type="time"
      value={endTime || ''}
      onChange={(e) => setEndTime(e.target.value || null)}
      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
    />
  </div>
</div>

{/* カレンダー同期トグル */}
<div className="flex items-center gap-2 mt-2">
  <input
    type="checkbox"
    id="calendarSync"
    checked={calendarSync || false}
    onChange={(e) => setCalendarSync(e.target.checked)}
    className="rounded border-slate-300"
  />
  <label htmlFor="calendarSync" className="text-sm text-slate-700">
    Googleカレンダーに同期
  </label>
</div>
```

**注意:**
- 時刻入力は `type="time"` を使用（ブラウザネイティブのタイムピッカー）
- 時刻が未入力の場合は終日イベントとして同期
- `calendarSync` チェックボックスがONのタスクのみ同期対象

### Step 3: タスク保存時のカレンダー同期トリガー

`functions/src/api/tasks.ts` のタスク更新処理に以下を追加:

```typescript
// タスク保存後、calendarSync=trueの場合は同期ジョブをエンキュー
if (updatedTask.calendarSync) {
  await enqueueCalendarSync({ taskId: updatedTask.id, mode: 'sync' });
}
```

タスク削除時にカレンダーイベントも削除:
```typescript
if (deletedTask.カレンダーイベントID) {
  await enqueueCalendarSync({ taskId: deletedTask.id, mode: 'delete' });
}
```

### Step 4: カレンダー同期処理の本実装

`functions/src/api/calendar.ts` を拡張:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { google, calendar_v3 } from 'googleapis';
import { authMiddleware } from '../lib/auth';
import { db } from '../lib/firestore';
import { getUser } from '../lib/users';
import { getEffectiveOrgId } from '../lib/access-helpers';

const router = Router();
router.use(authMiddleware());

// --- Google Calendar クライアント取得 ---
async function getCalendarClient(uid: string): Promise<calendar_v3.Calendar | null> {
  // ユーザーのOAuthトークンを取得
  // 既存の google-oauth.ts のトークン管理を参照
  const tokenDoc = await db.collection('users').doc(uid).collection('tokens').doc('google').get();
  if (!tokenDoc.exists) return null;

  const tokens = tokenDoc.data();
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    access_token: tokens?.access_token,
    refresh_token: tokens?.refresh_token,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// --- 同期処理 ---
async function syncTaskToCalendar(taskId: string, orgId: string, uid: string): Promise<void> {
  const taskDoc = await db.collection('orgs').doc(orgId).collection('tasks').doc(taskId).get();
  if (!taskDoc.exists) return;
  const task = taskDoc.data()!;

  if (!task.calendarSync) return;

  const calendar = await getCalendarClient(uid);
  if (!calendar) {
    console.warn('[calendar] No Google OAuth tokens for user:', uid);
    return;
  }

  // イベントデータを構築
  const startDate = task.予定開始日 || task.期限;
  const endDate = task.期限 || task.予定開始日;
  if (!startDate) return; // 日付がなければ同期しない

  let start: calendar_v3.Schema$EventDateTime;
  let end: calendar_v3.Schema$EventDateTime;

  if (task.startTime && task.endTime) {
    // 時刻ありの場合: dateTime形式
    start = { dateTime: `${startDate}T${task.startTime}:00`, timeZone: 'Asia/Tokyo' };
    end = { dateTime: `${endDate}T${task.endTime}:00`, timeZone: 'Asia/Tokyo' };
  } else {
    // 時刻なしの場合: 終日イベント
    start = { date: startDate };
    // Google Calendar の終日イベントはend dateが「翌日」
    const endDateObj = new Date(endDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    end = { date: endDateObj.toISOString().slice(0, 10) };
  }

  const eventBody: calendar_v3.Schema$Event = {
    summary: task.タスク名,
    description: [
      task.ballNote ? `ボール: ${task.ballHolder || '自分'} - ${task.ballNote}` : '',
      `Compass タスクID: ${taskId}`,
    ].filter(Boolean).join('\n'),
    start,
    end,
  };

  const existingEventId = task.カレンダーイベントID;

  if (existingEventId) {
    // 既存イベントを更新
    try {
      await calendar.events.update({
        calendarId: 'primary',
        eventId: existingEventId,
        requestBody: eventBody,
      });
    } catch (err: any) {
      if (err.code === 404) {
        // イベントが削除されていた場合は新規作成
        const created = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: eventBody,
        });
        await taskDoc.ref.update({ カレンダーイベントID: created.data.id });
      } else {
        throw err;
      }
    }
  } else {
    // 新規イベントを作成
    const created = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody,
    });
    await taskDoc.ref.update({ カレンダーイベントID: created.data.id });
  }
}

async function deleteCalendarEvent(taskId: string, orgId: string, uid: string): Promise<void> {
  const taskDoc = await db.collection('orgs').doc(orgId).collection('tasks').doc(taskId).get();
  if (!taskDoc.exists) return;
  const task = taskDoc.data()!;

  const eventId = task.カレンダーイベントID;
  if (!eventId) return;

  const calendar = await getCalendarClient(uid);
  if (!calendar) return;

  try {
    await calendar.events.delete({ calendarId: 'primary', eventId });
  } catch (err: any) {
    if (err.code !== 404) throw err; // 既に削除済みなら無視
  }

  await taskDoc.ref.update({ カレンダーイベントID: null });
}

// --- APIエンドポイント ---

const syncSchema = z.object({
  taskId: z.string().min(1),
});

router.post('/sync', async (req, res) => {
  try {
    const { taskId } = syncSchema.parse(req.body ?? {});
    const uid = (req as any).uid;
    const user = await getUser(uid);
    if (!user) { res.status(401).json({ error: 'User not found' }); return; }
    const orgId = getEffectiveOrgId(user);

    await syncTaskToCalendar(taskId, orgId, uid);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[calendar/sync] Error:', err);
    res.status(500).json({ error: err.message || 'Calendar sync failed' });
  }
});

router.post('/delete', async (req, res) => {
  try {
    const { taskId } = syncSchema.parse(req.body ?? {});
    const uid = (req as any).uid;
    const user = await getUser(uid);
    if (!user) { res.status(401).json({ error: 'User not found' }); return; }
    const orgId = getEffectiveOrgId(user);

    await deleteCalendarEvent(taskId, orgId, uid);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[calendar/delete] Error:', err);
    res.status(500).json({ error: err.message || 'Calendar delete failed' });
  }
});

export default router;
```

**注意:**
- `googleapis` パッケージが `functions/package.json` に入っているか確認する
- 入っていなければ `pnpm --filter functions add googleapis` でインストール
- Google OAuth トークンの保存場所は既存の `google-oauth.ts` を確認して合わせる
- カレンダー同期はユーザーのOAuthトークンで実行（サービスアカウントではない）

### Step 5: ジョブプロセッサの更新（必要な場合）

`functions/src/lib/jobs.ts` の `processPendingJobs` 内で `calendar_sync` タイプのジョブを処理する部分を確認。
未実装の場合は、Step 4の `syncTaskToCalendar` / `deleteCalendarEvent` を呼び出すように実装する。

ジョブのpayloadからtaskId, mode ('sync' | 'delete') を取得し、対応する関数を呼ぶ。

## 完了条件

1. `pnpm --filter functions build` が成功する
2. `pnpm --filter web build` が成功する
3. TaskModal に開始時刻・終了時刻の入力欄が表示される
4. 「Googleカレンダーに同期」チェックボックスが動作する
5. calendarSync=true のタスクを保存すると、Googleカレンダーにイベントが作成される
6. 時刻あり → 時刻指定イベント、時刻なし → 終日イベント
7. タスク更新時にカレンダーイベントも更新される
8. タスク削除時にカレンダーイベントも削除される
9. `カレンダーイベントID` がFirestoreに保存される

## やらないこと

- Pull同期（Googleカレンダー → Compass）（Phase 2）
- カレンダー選択UI（常に primary カレンダーに同期）
- リマインダー設定
- 複数カレンダー対応
- テストファイルの作成

## 依存パッケージ

- `googleapis` — Google Calendar API クライアント。`functions/package.json` に存在しない場合はインストールが必要
