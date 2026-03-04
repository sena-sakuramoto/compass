# CODEX指示書: Compass Google Calendar 双方向同期

**作成**: 2026-03-03
**優先度**: 高
**概要**: Compass のタスク/スケジュールと Google Calendar の双方向同期機能を実装する

---

## 背景

現在の Compass には Google Calendar への片方向同期（Compass → Google Calendar）が既に実装されている:
- `functions/src/lib/calendarSync.ts` — `syncTaskToCalendar()` でタスクを Google Calendar イベントとして push/update/delete
- `functions/src/api/calendar.ts` — `/api/calendar/sync` と `/api/calendar/delete` エンドポイント
- `functions/src/api/google-oauth.ts` — 同期先カレンダー選択 (`GET /api/google/calendars`, `PATCH /api/google/sync-calendar`)
- `functions/src/lib/perUserGoogleClient.ts` — Per-User OAuth トークン管理、`getUserCalendarClient()` 等
- `functions/src/lib/jobs.ts` — `enqueueCalendarSync()` でジョブキューに投入
- `functions/src/lib/jobProcessor.ts` — `task.calendar.sync` ジョブを `handleCalendarSync()` で処理
- `web/src/components/GoogleIntegrationSettings.tsx` — `CalendarSyncSection` で同期先カレンダー選択UI
- `web/src/lib/api.ts` — `listGoogleCalendars()`, `updateSyncCalendar()`, `syncTaskCalendar()`

### 既存アーキテクチャの要点

1. **Per-User OAuth**: 各ユーザーが自分のGoogleアカウントを接続し、自分のトークンでCalendar APIを呼ぶ
2. **トークン保存先**: `users/{uid}/private/googleTokens` （`GoogleTokens` interface）
3. **同期先カレンダー**: `googleTokens.syncCalendarId` フィールド（未設定なら `'primary'`）
4. **非同期処理**: タスク作成/更新時に `enqueueCalendarSync()` → ジョブキュー → `jobProcessor` が処理
5. **タスクの `calendarSync` フラグ**: `true` のタスクのみ同期対象

### 現状の課題

1. **メインカレンダー汚染**: ユーザーが専用カレンダーを選べるが、UIが分かりにくい
2. **Google Calendar → Compass 方向の同期がない**: 外部で作成した予定をCompassに取り込めない
3. **設定が分散**: 同期先カレンダーは `googleTokens.syncCalendarId` に保存されており、Outbound/Inbound の概念がない

---

## 実装する機能

### Feature 1: Compass → Google Calendar（Outbound Sync）の改善
- ユーザーが **専用のGoogleカレンダーを自分で作成** し、そのカレンダーをCompassで選択
- Compassのタスクはその専用カレンダーにのみ同期される（メインカレンダーを汚さない）
- 既存の `syncCalendarId` との後方互換性を維持

### Feature 2: Google Calendar → Compass（Inbound Sync）の新規実装
- ユーザーが **取り込み元のGoogleカレンダーを指定**
- そのカレンダーのイベントをCompassのタスクとして取り込む
- Google Calendar API の incremental sync（syncToken）を使用して差分取得
- Outboundとは異なるカレンダーを指定可能

---

## 前提条件

- Per-User Google OAuth は既存実装をそのまま使用（`perUserGoogleClient.ts`）
- OAuth スコープに `https://www.googleapis.com/auth/calendar` が含まれていること（既存で含まれている想定。`perUserGoogleClient.ts` L28の `getOAuthClient()` を確認）
- `googleapis` パッケージは `functions/package.json` にインストール済み

---

## UI設計原則

UI設計はCLAUDE.mdの「UI設計原則（全プロダクト共通）」12原則に従うこと。
- 原則1（選択肢 > 自由入力）: 同期モード・インポート種別はボタン切り替え。ただしカレンダーID直接入力は許容（各ユーザー固有のため）
- 原則3（状態を選択肢で管理）: syncMode, importAsType はセグメントボタンで切り替え
- 原則6（ツールは脇役）: 設定画面は最短で完了できる構成
- デザイン禁止事項（AIグラデーション、Inter、Lucideのみ、shadcnデフォルト）を遵守
- Lucide 以外のアイコンも検討（ただし既存コードベースとの一貫性を優先）

---

## Firestore スキーマ

### 既存（変更なし）: `users/{uid}/private/googleTokens`

```typescript
// functions/src/lib/perUserGoogleClient.ts L11-20
interface GoogleTokens {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  scope: string;
  connectedEmail: string;
  connectedAt: Timestamp;
  updatedAt: Timestamp;
  syncCalendarId?: string | null;  // 既存フィールド（後方互換性のため維持）
}
```

### 新規: `users/{uid}/private/calendarSyncSettings`

```typescript
interface CalendarSyncSettings {
  outbound: {
    enabled: boolean;
    calendarId: string | null;       // 同期先カレンダーID（例: "abc123@group.calendar.google.com"）
    calendarName: string | null;     // 表示名（UIプレビュー用）
    lastSyncAt: Timestamp | null;
  };
  inbound: {
    enabled: boolean;
    calendarId: string | null;       // 取り込み元カレンダーID
    calendarName: string | null;     // 表示名
    syncMode: 'all' | 'accepted';    // 'all': 全イベント, 'accepted': 承認済みのみ
    importAsType: 'task' | 'meeting';// インポート時のタスク種別
    defaultProjectId: string | null; // インポート先のデフォルトプロジェクト
    syncToken: string | null;        // Google Calendar API の incrementalSync 用トークン
    lastSyncAt: Timestamp | null;
  };
  updatedAt: Timestamp;
}
```

### 新規: `orgs/{orgId}/importedEvents/{docId}`

Inbound同期で取り込まれたイベントとタスクのマッピング。重複取り込みを防止する。

```typescript
interface ImportedEventMapping {
  googleEventId: string;           // Google Calendar のイベントID
  googleCalendarId: string;        // 取り込み元カレンダーID
  taskId: string;                  // CompassのタスクID
  projectId: string;               // 所属プロジェクトID
  userId: string;                  // インポートしたユーザーID
  eventUpdatedAt: string;          // Googleイベントの更新日時
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 変更対象ファイル一覧

### バックエンド — 既存ファイル変更（5ファイル）

| # | ファイルパス | 変更内容 |
|---|---|---|
| 1 | `functions/src/lib/calendarSync.ts` | outbound同期先を `calendarSyncSettings` から取得するよう変更 |
| 2 | `functions/src/api/google-oauth.ts` | `GET/PUT /calendar-sync-settings` エンドポイント追加 |
| 3 | `functions/src/api/calendar.ts` | `POST /inbound-sync` エンドポイント追加 |
| 4 | `functions/src/lib/jobs.ts` | `enqueueInboundCalendarSync()` 関数追加 |
| 5 | `functions/src/lib/jobProcessor.ts` | `calendar.inbound.sync` ジョブハンドラー追加 |

### バックエンド — 新規ファイル（1ファイル）

| # | ファイルパス | 内容 |
|---|---|---|
| 6 | `functions/src/lib/calendarInbound.ts` | Inbound同期ロジック（`syncInboundCalendar()`） |

### フロントエンド — 既存ファイル変更（3ファイル）

| # | ファイルパス | 変更内容 |
|---|---|---|
| 7 | `web/src/lib/types.ts` | `CalendarSyncSettings` 型定義追加 |
| 8 | `web/src/lib/api.ts` | 新規APIクライアント関数3つ追加 |
| 9 | `web/src/components/GoogleIntegrationSettings.tsx` | `CalendarSyncSection` を新コンポーネントで置き換え |

### フロントエンド — 新規ファイル（1ファイル）

| # | ファイルパス | 内容 |
|---|---|---|
| 10 | `web/src/components/CalendarSyncSettings.tsx` | 双方向同期設定UI（Outbound/Inbound両セクション） |

### インフラ（1ファイル）

| # | ファイルパス | 変更内容 |
|---|---|---|
| 11 | `firestore.indexes.json` | `importedEvents` の composite index 追加 |

---

## Step 1: フロントエンド型定義の追加

### ファイル: `web/src/lib/types.ts`

ファイル末尾（`BulkImportSaveResponse` の後）に以下を追加:

```typescript
// ── Calendar Sync Settings ──

export interface OutboundCalendarSettings {
  enabled: boolean;
  calendarId: string | null;
  calendarName: string | null;
  lastSyncAt: string | null;
}

export interface InboundCalendarSettings {
  enabled: boolean;
  calendarId: string | null;
  calendarName: string | null;
  syncMode: 'all' | 'accepted';
  importAsType: 'task' | 'meeting';
  defaultProjectId: string | null;
  syncToken: string | null;
  lastSyncAt: string | null;
}

export interface CalendarSyncSettings {
  outbound: OutboundCalendarSettings;
  inbound: InboundCalendarSettings;
  updatedAt?: string;
}
```

---

## Step 2: Outbound同期の改善

### ファイル: `functions/src/lib/calendarSync.ts`

### 変更箇所: `syncTaskToCalendar()` 関数内のカレンダーID取得ロジック（L94-95）

**現在のコード:**
```typescript
const tokenDoc = await db.collection('users').doc(userId).collection('private').doc('googleTokens').get();
const calendarId = tokenDoc.data()?.syncCalendarId || 'primary';
```

**新しいコードで置き換え:**
```typescript
// 新しい calendarSyncSettings を優先チェック（後方互換性あり）
let calendarId = 'primary';
const syncSettingsDoc = await db
  .collection('users')
  .doc(userId)
  .collection('private')
  .doc('calendarSyncSettings')
  .get();
const syncSettings = syncSettingsDoc.data();

if (syncSettings?.outbound?.enabled && syncSettings?.outbound?.calendarId) {
  calendarId = syncSettings.outbound.calendarId;
} else {
  // フォールバック: 旧 syncCalendarId（既存ユーザーの動作を維持）
  const tokenDoc = await db
    .collection('users')
    .doc(userId)
    .collection('private')
    .doc('googleTokens')
    .get();
  calendarId = tokenDoc.data()?.syncCalendarId || 'primary';
}
```

**重要**: この変更により、新設定がある場合はそちらを優先し、未設定のユーザーは既存の動作を維持する。

---

## Step 3: Inbound同期ロジック — 新規ファイル

### ファイル: `functions/src/lib/calendarInbound.ts`（新規作成）

以下の内容で新規作成する:

```typescript
import admin from 'firebase-admin';
import { calendar_v3 } from 'googleapis';
import { getUserCalendarClient } from './perUserGoogleClient';
import { db } from './firestore';

const importedEventsCollection = (orgId: string) =>
  db.collection('orgs').doc(orgId).collection('importedEvents');

export interface InboundSyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

/**
 * Google Calendar → Compass のインバウンド同期を実行
 *
 * 処理フロー:
 * 1. ユーザーの inbound 設定を Firestore から取得
 * 2. Google Calendar API でイベント一覧を取得（syncToken があれば差分取得）
 * 3. 各イベントを Compass タスクとして作成/更新/削除
 * 4. syncToken を保存して次回の差分取得に備える
 */
export async function syncInboundCalendar(
  userId: string,
  orgId: string,
): Promise<InboundSyncResult> {
  const result: InboundSyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };

  // 1. ユーザーの inbound 設定を取得
  const settingsDoc = await db
    .collection('users')
    .doc(userId)
    .collection('private')
    .doc('calendarSyncSettings')
    .get();
  const settings = settingsDoc.data();

  if (!settings?.inbound?.enabled || !settings?.inbound?.calendarId) {
    return result;
  }

  const inbound = settings.inbound;
  const calendarId: string = inbound.calendarId;
  const syncToken: string | null = inbound.syncToken || null;
  const importAsType: 'task' | 'meeting' = inbound.importAsType || 'task';
  const defaultProjectId: string | null = inbound.defaultProjectId;

  if (!defaultProjectId) {
    result.errors.push('デフォルトプロジェクトが設定されていません');
    return result;
  }

  // 2. Google Calendar API でイベントを取得
  let calendar: calendar_v3.Calendar;
  try {
    calendar = await getUserCalendarClient(userId);
  } catch (error) {
    result.errors.push(`Google Calendar クライアントの取得に失敗: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }

  let events: calendar_v3.Schema$Event[] = [];
  let nextSyncToken: string | null = null;

  try {
    if (syncToken) {
      // インクリメンタル同期（差分取得）
      const listRes = await calendar.events.list({
        calendarId,
        syncToken,
        singleEvents: true,
        showDeleted: true,
      });
      events = listRes.data.items ?? [];
      nextSyncToken = listRes.data.nextSyncToken ?? null;
    } else {
      // 初回フル同期（今日以降のイベントのみ、最大250件）
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const listRes = await calendar.events.list({
        calendarId,
        timeMin: now.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        showDeleted: false,
      });
      events = listRes.data.items ?? [];
      nextSyncToken = listRes.data.nextSyncToken ?? null;
    }
  } catch (error: any) {
    // syncToken が無効（410 Gone）→ フル同期にフォールバック
    if (error?.code === 410 || error?.status === 410) {
      console.warn('[calendarInbound] syncToken expired, falling back to full sync');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      try {
        const listRes = await calendar.events.list({
          calendarId,
          timeMin: now.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
          showDeleted: false,
        });
        events = listRes.data.items ?? [];
        nextSyncToken = listRes.data.nextSyncToken ?? null;
      } catch (retryError: any) {
        result.errors.push(`Google Calendar API エラー（リトライ）: ${retryError?.message ?? String(retryError)}`);
        return result;
      }
    } else {
      result.errors.push(`Google Calendar API エラー: ${error?.message ?? String(error)}`);
      return result;
    }
  }

  // 3. 各イベントを処理
  const tasksCollection = db.collection('orgs').doc(orgId).collection('tasks');

  for (const event of events) {
    if (!event.id) continue;

    try {
      // 削除されたイベント
      if (event.status === 'cancelled') {
        const deletedCount = await handleDeletedEvent(event.id, calendarId, orgId, tasksCollection);
        result.deleted += deletedCount;
        continue;
      }

      // syncMode='accepted' の場合、自分が承認していないイベントはスキップ
      if (inbound.syncMode === 'accepted') {
        const selfAttendee = event.attendees?.find((a) => a.self === true);
        if (selfAttendee && selfAttendee.responseStatus !== 'accepted') {
          continue;
        }
      }

      // 既存マッピングを確認
      const mappingQuery = await importedEventsCollection(orgId)
        .where('googleEventId', '==', event.id)
        .where('googleCalendarId', '==', calendarId)
        .limit(1)
        .get();

      if (!mappingQuery.empty) {
        // 既存タスクを更新
        const mapping = mappingQuery.docs[0];
        const taskId = mapping.data().taskId as string;
        const updates = eventToTaskUpdate(event);
        await tasksCollection.doc(taskId).update({
          ...updates,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await mapping.ref.update({
          eventUpdatedAt: event.updated ?? new Date().toISOString(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        result.updated++;
      } else {
        // 新規タスクとして作成
        const taskData = eventToNewTask(event, defaultProjectId, importAsType, orgId);
        const taskRef = await tasksCollection.add({
          ...taskData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // マッピングを保存
        await importedEventsCollection(orgId).add({
          googleEventId: event.id,
          googleCalendarId: calendarId,
          taskId: taskRef.id,
          projectId: defaultProjectId,
          userId,
          eventUpdatedAt: event.updated ?? new Date().toISOString(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        result.created++;
      }
    } catch (error: any) {
      result.errors.push(`イベント ${event.id}: ${error?.message ?? String(error)}`);
    }
  }

  // 4. syncToken を保存
  if (nextSyncToken) {
    await db
      .collection('users')
      .doc(userId)
      .collection('private')
      .doc('calendarSyncSettings')
      .update({
        'inbound.syncToken': nextSyncToken,
        'inbound.lastSyncAt': admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  return result;
}

/**
 * Google Calendar イベントから Compass タスクの更新データを生成
 */
function eventToTaskUpdate(event: calendar_v3.Schema$Event): Record<string, any> {
  const updates: Record<string, any> = {};

  if (event.summary) {
    updates['タスク名'] = event.summary;
  }

  const { startDate, endDate, startTime, endTime } = extractEventDates(event);
  if (startDate) {
    updates['予定開始日'] = startDate;
    updates['start'] = startDate;
  }
  if (endDate) {
    updates['期限'] = endDate;
    updates['end'] = endDate;
  }
  updates['startTime'] = startTime;
  updates['endTime'] = endTime;

  return updates;
}

/**
 * Google Calendar イベントから新規 Compass タスクを生成
 */
function eventToNewTask(
  event: calendar_v3.Schema$Event,
  projectId: string,
  type: 'task' | 'meeting',
  orgId: string,
): Record<string, any> {
  const { startDate, endDate, startTime, endTime } = extractEventDates(event);

  return {
    projectId,
    orgId,
    type,
    タスク名: event.summary ?? '(Google Calendar イベント)',
    ステータス: '未着手',
    予定開始日: startDate ?? null,
    期限: endDate ?? null,
    start: startDate ?? null,
    end: endDate ?? null,
    startTime: startTime ?? null,
    endTime: endTime ?? null,
    担当者: null,
    assignee: null,
    優先度: '中',
    calendarSync: false,  // ループ防止: Inbound イベントは Outbound 同期しない
    parentId: null,
    orderIndex: null,
    マイルストーン: false,
    milestone: false,
  };
}

/**
 * Google Calendar イベントの日時情報を抽出
 */
function extractEventDates(event: calendar_v3.Schema$Event): {
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
} {
  let startDate: string | null = null;
  let endDate: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;

  if (event.start?.date) {
    // 終日イベント
    startDate = event.start.date;
    if (event.end?.date) {
      // Google Calendar の終日イベントの end は翌日なので1日引く
      const end = new Date(event.end.date);
      end.setDate(end.getDate() - 1);
      endDate = end.toISOString().slice(0, 10);
    }
  } else if (event.start?.dateTime) {
    // 時刻指定イベント
    const start = new Date(event.start.dateTime);
    startDate = start.toISOString().slice(0, 10);
    startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;

    if (event.end?.dateTime) {
      const end = new Date(event.end.dateTime);
      endDate = end.toISOString().slice(0, 10);
      endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    }
  }

  return { startDate, endDate, startTime, endTime };
}

/**
 * 削除されたイベントの処理
 * - Compass 側のタスクは削除しない（ユーザーが判断）
 * - ステータスを「完了」に変更
 * - マッピングを削除
 */
async function handleDeletedEvent(
  googleEventId: string,
  calendarId: string,
  orgId: string,
  tasksCollection: FirebaseFirestore.CollectionReference,
): Promise<number> {
  const mappingQuery = await importedEventsCollection(orgId)
    .where('googleEventId', '==', googleEventId)
    .where('googleCalendarId', '==', calendarId)
    .limit(1)
    .get();

  if (mappingQuery.empty) return 0;

  const mapping = mappingQuery.docs[0];
  const taskId = mapping.data().taskId as string;

  // タスクのステータスを「完了」に変更
  const taskDoc = await tasksCollection.doc(taskId).get();
  if (taskDoc.exists) {
    await tasksCollection.doc(taskId).update({
      ステータス: '完了',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // マッピングを削除
  await mapping.ref.delete();
  return 1;
}
```

---

## Step 4: ジョブキュー定義の追加

### ファイル: `functions/src/lib/jobs.ts`

`enqueueCalendarSync` 関数（L145-157）の後に以下を追加:

```typescript
export async function enqueueInboundCalendarSync(input: { userId: string; orgId: string }) {
  const dueAt = new Date();
  await enqueueJob({
    type: 'calendar.inbound.sync',
    dueAt,
    payload: {
      userId: input.userId,
      orgId: input.orgId,
    },
  });
}
```

---

## Step 5: ジョブプロセッサーの追加

### ファイル: `functions/src/lib/jobProcessor.ts`

### 変更 5-1: import 文の追加

L11（`import { syncTaskToCalendar } from './calendarSync';` の後）に追加:

```typescript
import { syncInboundCalendar } from './calendarInbound';
```

### 変更 5-2: Payload interface の追加

`CalendarSyncPayload` interface（L23-28）の後に追加:

```typescript
interface InboundCalendarSyncPayload extends Record<string, unknown> {
  userId: string;
  orgId: string;
}
```

### 変更 5-3: ハンドラー関数の追加

`handleCalendarSync` 関数（L49-59）の後に追加:

```typescript
async function handleInboundCalendarSync(job: JobDoc<InboundCalendarSyncPayload>) {
  const { userId, orgId } = job.payload;
  const result = await syncInboundCalendar(userId, orgId);
  console.info('[job] inbound calendar sync completed', {
    userId,
    orgId,
    created: result.created,
    updated: result.updated,
    deleted: result.deleted,
    errorCount: result.errors.length,
  });
  if (result.errors.length > 0) {
    console.warn('[job] inbound sync errors:', result.errors);
  }
}
```

### 変更 5-4: `processJobs` の switch/if 文にケースを追加

`processJobs` 関数内のジョブタイプ判定箇所に以下を追加:

```typescript
case 'calendar.inbound.sync':
  await handleInboundCalendarSync(job as JobDoc<InboundCalendarSyncPayload>);
  break;
```

**注意**: 既存コードが `switch` 文か `if/else` かを確認し、適切な形式で追加すること。`jobProcessor.ts` の全体を読んで `processJobs` 関数のジョブタイプ分岐箇所を特定すること。

---

## Step 6: APIエンドポイントの追加

### ファイル: `functions/src/api/google-oauth.ts`

既存の `router.post('/disconnect', ...)` （L165-173）の **前** に以下2つのエンドポイントを追加:

```typescript
/**
 * GET /api/google/calendar-sync-settings
 * ユーザーのカレンダー双方向同期設定を取得
 */
router.get('/calendar-sync-settings', async (req: any, res, next) => {
  try {
    const uid = req.uid as string;
    const settingsDoc = await db
      .collection('users')
      .doc(uid)
      .collection('private')
      .doc('calendarSyncSettings')
      .get();

    if (!settingsDoc.exists) {
      return res.json({
        settings: {
          outbound: {
            enabled: false,
            calendarId: null,
            calendarName: null,
            lastSyncAt: null,
          },
          inbound: {
            enabled: false,
            calendarId: null,
            calendarName: null,
            syncMode: 'all',
            importAsType: 'task',
            defaultProjectId: null,
            syncToken: null,
            lastSyncAt: null,
          },
        },
      });
    }

    const data = settingsDoc.data();
    // Timestamp を ISO 文字列に変換
    const outboundLastSync = data?.outbound?.lastSyncAt;
    const inboundLastSync = data?.inbound?.lastSyncAt;
    return res.json({
      settings: {
        outbound: {
          ...data?.outbound,
          lastSyncAt: outboundLastSync?.toDate?.()?.toISOString?.() ?? outboundLastSync ?? null,
        },
        inbound: {
          ...data?.inbound,
          lastSyncAt: inboundLastSync?.toDate?.()?.toISOString?.() ?? inboundLastSync ?? null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/google/calendar-sync-settings
 * ユーザーのカレンダー双方向同期設定を保存
 */
router.put('/calendar-sync-settings', async (req: any, res, next) => {
  try {
    const uid = req.uid as string;
    const { outbound, inbound } = req.body ?? {};

    if (!outbound || !inbound) {
      return res.status(400).json({ error: 'outbound and inbound settings are required' });
    }

    // カレンダーIDのアクセス検証
    let calendar: any;
    try {
      calendar = await getUserCalendarClient(uid);
    } catch {
      return res.status(400).json({ error: 'Googleアカウントが接続されていません' });
    }

    if (outbound.enabled && outbound.calendarId) {
      try {
        await calendar.calendarList.get({ calendarId: outbound.calendarId });
      } catch {
        return res.status(400).json({
          error: `Outbound カレンダー（${outbound.calendarId}）にアクセスできません。カレンダーIDを確認してください。`,
        });
      }
    }

    if (inbound.enabled && inbound.calendarId) {
      try {
        await calendar.calendarList.get({ calendarId: inbound.calendarId });
      } catch {
        return res.status(400).json({
          error: `Inbound カレンダー（${inbound.calendarId}）にアクセスできません。カレンダーIDを確認してください。`,
        });
      }
    }

    // ループ防止: Outbound と Inbound に同じカレンダーを設定させない
    if (
      outbound.enabled &&
      inbound.enabled &&
      outbound.calendarId &&
      inbound.calendarId &&
      outbound.calendarId === inbound.calendarId
    ) {
      return res.status(400).json({
        error: 'Outbound と Inbound に同じカレンダーは設定できません（ループが発生します）',
      });
    }

    // 既存設定を取得（syncToken 等を保持するため）
    const existingDoc = await db
      .collection('users')
      .doc(uid)
      .collection('private')
      .doc('calendarSyncSettings')
      .get();
    const existing = existingDoc.data();

    // Inbound カレンダーが変更された場合、syncToken をリセット
    const inboundCalendarChanged = existing?.inbound?.calendarId !== inbound.calendarId;

    const settingsData = {
      outbound: {
        enabled: Boolean(outbound.enabled),
        calendarId: outbound.calendarId || null,
        calendarName: outbound.calendarName || null,
        lastSyncAt: existing?.outbound?.lastSyncAt ?? null,
      },
      inbound: {
        enabled: Boolean(inbound.enabled),
        calendarId: inbound.calendarId || null,
        calendarName: inbound.calendarName || null,
        syncMode: inbound.syncMode === 'accepted' ? 'accepted' : 'all',
        importAsType: inbound.importAsType === 'meeting' ? 'meeting' : 'task',
        defaultProjectId: inbound.defaultProjectId || null,
        syncToken: inboundCalendarChanged ? null : (existing?.inbound?.syncToken ?? null),
        lastSyncAt: inboundCalendarChanged ? null : (existing?.inbound?.lastSyncAt ?? null),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db
      .collection('users')
      .doc(uid)
      .collection('private')
      .doc('calendarSyncSettings')
      .set(settingsData, { merge: false });

    // Outbound カレンダー変更時は旧 syncCalendarId も更新（後方互換性）
    if (outbound.enabled && outbound.calendarId) {
      const tokenRef = db.collection('users').doc(uid).collection('private').doc('googleTokens');
      const tokenDoc = await tokenRef.get();
      if (tokenDoc.exists) {
        await tokenRef.update({ syncCalendarId: outbound.calendarId });
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
```

**注意**: `getUserCalendarClient` は既にファイル先頭で import されている（L11）。`admin` と `db` も同様に既にスコープ内にある（`db` は `../lib/firestore` から import、`admin` は `syncTaskToCalendar` の `admin` を通じて利用）。`admin` が未 import であれば追加すること:

```typescript
import admin from 'firebase-admin';
```

### ファイル: `functions/src/api/calendar.ts`

既存の import文に追加:

```typescript
import { enqueueInboundCalendarSync } from '../lib/jobs';
```

既存の `/delete` エンドポイント（L36-49）の後に追加:

```typescript
/**
 * POST /api/calendar/inbound-sync
 * Google Calendar → Compass のインバウンド同期を手動トリガー
 */
router.post('/inbound-sync', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const orgId = getEffectiveOrgId(user);
    await enqueueInboundCalendarSync({ userId: req.uid, orgId });
    res.json({ ok: true, message: 'Inbound sync job enqueued' });
  } catch (error) {
    next(error);
  }
});
```

---

## Step 7: フロントエンド API クライアント

### ファイル: `web/src/lib/api.ts`

`// ==================== Google Calendar API ====================` セクション（L1224付近）の末尾、`updateSyncCalendar` 関数の後に追加:

```typescript
/**
 * ユーザーのカレンダー双方向同期設定を取得
 */
export async function getCalendarSyncSettings() {
  return request<{ settings: CalendarSyncSettings }>('/google/calendar-sync-settings');
}

/**
 * ユーザーのカレンダー双方向同期設定を保存
 */
export async function updateCalendarSyncSettings(settings: Omit<CalendarSyncSettings, 'updatedAt'>) {
  return request<{ ok: true }>('/google/calendar-sync-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

/**
 * Google Calendar → Compass のインバウンド同期を手動実行
 */
export async function triggerInboundCalendarSync() {
  return request<{ ok: true }>('/calendar/inbound-sync', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
```

**注意**: `CalendarSyncSettings` 型を `'./types'` から import する必要がある。既存の `import type { ... } from './types';`（L1042）に `CalendarSyncSettings` を追加すること。

---

## Step 8: 双方向同期設定UIコンポーネント

### ファイル: `web/src/components/CalendarSyncSettings.tsx`（新規作成）

このコンポーネントは以下の2セクションで構成する:

#### セクション1: Outbound（Compass → Google Calendar）
- 有効/無効トグル（チェックボックス）
- 同期先カレンダー選択（ドロップダウン — `listGoogleCalendars()` から取得）
- カレンダーID直接入力（テキストフィールド — ドロップダウンに表示されないカレンダー用）
- 最終同期日時の表示
- 説明テキスト: 「Compass専用のGoogleカレンダーを別途作成し、そのカレンダーを選択することを推奨します」

#### セクション2: Inbound（Google Calendar → Compass）
- 有効/無効トグル（チェックボックス）
- 取り込み元カレンダー選択（ドロップダウン）
- 同期モード: `[全イベント]` `[承認済みのみ]` セグメントボタン（原則1: 選択肢 > 自由入力）
- インポート種別: `[タスク]` `[打合せ]` セグメントボタン
- デフォルトプロジェクト選択（ドロップダウン — `listProjects()` から取得）
- 「今すぐ同期」ボタン（`triggerInboundCalendarSync()` を呼ぶ）
- 最終同期日時の表示

#### 共通
- 「同期設定を保存」ボタン
- 注意事項セクション（amber 背景）

#### データ取得（`useEffect` 内で `Promise.allSettled` を使用）
1. `getCalendarSyncSettings()` — 現在の設定
2. `listGoogleCalendars()` — カレンダー一覧（Google未接続時はエラーを表示）
3. `listProjects()` — プロジェクト一覧（Inbound のデフォルトプロジェクト用）

#### デザイン仕様
- セクションアイコン: Outbound は `Upload`（lucide-react）、Inbound は `Download`
- 保存ボタン: `bg-slate-900 text-white`（`bg-blue-600` ではない — shadcnデフォルト回避）
- 同期ボタン: `bg-emerald-600 text-white`
- セグメントボタンの active 状態: `bg-slate-900 text-white border-slate-900`
- セグメントボタンの inactive 状態: `bg-white text-slate-700 border-slate-300`
- 注意事項: `bg-amber-50 border-amber-200 text-amber-700`

#### props

```typescript
interface CalendarSyncSettingsProps {
  className?: string;
}
```

#### state 管理

```typescript
const [settings, setSettings] = useState<Omit<CalendarSyncSettings, 'updatedAt'>>(DEFAULT_SETTINGS);
const [calendars, setCalendars] = useState<CalendarOption[]>([]);
const [projects, setProjects] = useState<Project[]>([]);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [syncing, setSyncing] = useState(false);
const [error, setError] = useState<string | null>(null);
const [success, setSuccess] = useState(false);
const [calendarsError, setCalendarsError] = useState<string | null>(null);
```

#### 注意事項セクションの文言

```
- Outbound: Compass専用のGoogleカレンダーを別途作成し、そのカレンダーを選択することを推奨します
- Inbound: イベントの削除はCompass側で「完了」ステータスに変更されます（タスク自体は削除されません）
- Inbound: 初回同期では本日以降のイベントのみが取り込まれます
- OutboundとInboundに同じカレンダーを設定するとループが発生するため避けてください
```

---

## Step 9: 既存UIへの組み込み

### ファイル: `web/src/components/GoogleIntegrationSettings.tsx`

### 変更 9-1: import 文の追加

L1 付近の import に追加:

```typescript
import { CalendarSyncSettings } from './CalendarSyncSettings';
```

lucide-react の import に `ArrowRightLeft` を追加（L17 付近）。

### 変更 9-2: CalendarSyncSection の置き換え

L248 の `<CalendarSyncSection />` を以下で置き換え:

```tsx
{/* カレンダー双方向同期設定（全ユーザー） */}
<section>
  <div className="flex items-center gap-2 mb-4">
    <ArrowRightLeft className="w-5 h-5 text-blue-600" />
    <h3 className="font-medium text-gray-900">カレンダー同期</h3>
  </div>
  <CalendarSyncSettings />
</section>
```

### 変更 9-3: 旧 CalendarSyncSection の削除

L599-736 の `CalendarOption` 型定義と `CalendarSyncSection` 関数コンポーネントを削除する。

**削除対象:**
```typescript
type CalendarOption = { ... };        // L599-604
function CalendarSyncSection() { ... } // L606-735
```

### 変更 9-4: 不要な import の削除

`CalendarSyncSection` で使用していた以下の import が不要になった場合は削除:
- `listGoogleCalendars` （api.ts から）
- `updateSyncCalendar` （api.ts から）
- `toast` （react-hot-toast）— CalendarSyncSettings.tsx で直接使用するため

ただし、他のコンポーネントで使用されている場合は残すこと。

---

## Step 10: Firestore Indexes

### ファイル: `firestore.indexes.json`

Inbound同期のマッピング検索用 composite index を追加:

```json
{
  "collectionGroup": "importedEvents",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "googleEventId", "order": "ASCENDING" },
    { "fieldPath": "googleCalendarId", "order": "ASCENDING" }
  ]
}
```

既存の `firestore.indexes.json` の `indexes` 配列に上記オブジェクトを追加すること。
ファイルが存在しない場合は、プロジェクトルートに作成すること。

---

## Step 11: Firestore セキュリティルール

### ファイル: `firestore.rules`

`users/{uid}/private/{docId}` に対する既存のルールに `calendarSyncSettings` が含まれることを確認する。
通常、`{docId}` ワイルドカードで既にカバーされているが、明示的なルールがある場合は追加が必要:

```
match /users/{uid}/private/calendarSyncSettings {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

`orgs/{orgId}/importedEvents/{docId}` に対するルールも追加:

```
match /orgs/{orgId}/importedEvents/{docId} {
  allow read, write: if request.auth != null && isOrgMember(orgId);
}
```

（`isOrgMember` は既存の関数を使用。実装は Firestore Rules ファイルを確認すること。）

---

## 完了条件

### Phase 1 — 必須

- [ ] `web/src/lib/types.ts` に `CalendarSyncSettings`, `OutboundCalendarSettings`, `InboundCalendarSettings` 型が追加されている
- [ ] `functions/src/lib/calendarSync.ts` の `syncTaskToCalendar` が `calendarSyncSettings.outbound` を優先参照し、未設定なら旧 `syncCalendarId` にフォールバックする
- [ ] `functions/src/lib/calendarInbound.ts` が作成され、`syncInboundCalendar()` が実装されている
- [ ] `functions/src/api/google-oauth.ts` に `GET /api/google/calendar-sync-settings` が追加されている
- [ ] `functions/src/api/google-oauth.ts` に `PUT /api/google/calendar-sync-settings` が追加されている（カレンダーアクセス検証・ループ防止バリデーション含む）
- [ ] `functions/src/api/calendar.ts` に `POST /api/calendar/inbound-sync` が追加されている
- [ ] `functions/src/lib/jobs.ts` に `enqueueInboundCalendarSync()` が追加されている
- [ ] `functions/src/lib/jobProcessor.ts` に `calendar.inbound.sync` ハンドラーが追加されている
- [ ] `web/src/lib/api.ts` に `getCalendarSyncSettings`, `updateCalendarSyncSettings`, `triggerInboundCalendarSync` が追加されている
- [ ] `web/src/components/CalendarSyncSettings.tsx` が作成されている
- [ ] `web/src/components/GoogleIntegrationSettings.tsx` で旧 `CalendarSyncSection` が新コンポーネントに置き換えられている
- [ ] Firestore indexes に `importedEvents` の composite index が追加されている
- [ ] `pnpm --filter web build` がエラーなく成功する
- [ ] `pnpm --filter functions build` がエラーなく成功する（または `cd functions && pnpm build`）

### Phase 2 — 将来対応

- [ ] Inbound同期の定期自動実行（Cloud Scheduler / scheduled Cloud Function）
- [ ] Outbound同期時に `calendarSyncSettings.outbound.lastSyncAt` を更新
- [ ] Inbound同期結果のリアルタイム通知（作成/更新/削除件数をUIに表示）
- [ ] Outbound同期のバッチ再同期（全タスクを一括で新カレンダーに移動）

---

## テスト・検証手順

### 1. ビルド確認

```bash
cd D:/senaa_dev/compass
pnpm --filter web build
pnpm --filter functions build
```

### 2. 型チェック

```bash
cd D:/senaa_dev/compass/web && pnpm tsc --noEmit
cd D:/senaa_dev/compass/functions && pnpm tsc --noEmit
```

### 3. Outbound同期テスト

1. Google Calendar で「Compass同期用」カレンダーを新規作成
2. Compass 設定画面 → カレンダー同期 → Outbound でそのカレンダーを選択 → 保存
3. タスクを作成し、`calendarSync: true` で保存
4. 指定カレンダーにイベントが作成されることを確認
5. メインカレンダーにはイベントが **作成されない** ことを確認

### 4. Inbound同期テスト

1. Google Calendar でテスト用カレンダーにイベントを2〜3件作成
2. Compass 設定画面 → カレンダー同期 → Inbound でそのカレンダーを選択 → デフォルトプロジェクトを設定 → 保存
3. 「今すぐ同期」ボタンをクリック
4. Compass にタスクが作成されることを確認
5. Google Calendar でイベントのタイトルを変更 → 再度「今すぐ同期」→ タスク名が更新されることを確認
6. Google Calendar でイベントを削除 → 再度「今すぐ同期」→ タスクが「完了」になることを確認

### 5. 後方互換性テスト

- 新しい `calendarSyncSettings` が **未設定** のユーザーで、既存の `syncCalendarId` を使ったOutbound同期が引き続き動作すること

### 6. エラーケーステスト

- 存在しないカレンダーIDを入力 → 保存時にエラーメッセージが表示されること
- Outbound と Inbound に同じカレンダーIDを設定 → バリデーションエラーが表示されること
- Google未接続状態で設定画面を開く → 「Googleアカウント接続後にカレンダーを選択できます」が表示されること

---

## 注意事項

1. **ループ防止**: Inbound で取り込んだタスクは `calendarSync: false` で作成する。これにより Outbound 同期の対象にならず、無限ループを防ぐ。サーバー側でもバリデーション（同一カレンダーID禁止）を行う。

2. **レートリミット**: Google Calendar API は 1ユーザーあたり約60リクエスト/分。大量のイベントがある場合はバッチサイズ（`maxResults: 250`）で制御。

3. **OAuth スコープ**: `perUserGoogleClient.ts` の `getOAuthClient()` で使用されるスコープに `https://www.googleapis.com/auth/calendar` が含まれていることを確認。含まれていない場合は、スコープ追加とユーザーへの再接続促進UIが必要。

4. **Firestore セキュリティルール**: `calendarSyncSettings` は `googleTokens` と同じルールを適用。`importedEvents` は組織メンバーのみアクセス可能。

5. **後方互換性**: 既存の `googleTokens.syncCalendarId` は維持し、新設定が優先される仕組みにする。既存ユーザーの動作に影響を与えない。

6. **`admin` import**: `google-oauth.ts` で `admin` が未 import の場合は追加が必要。`db` は `'../lib/firestore'` から import 済み。`getUserCalendarClient` は `'../lib/perUserGoogleClient'` から import 済み。

---

## やらないこと（スコープ外）

- Cloud Scheduler による定期自動実行（Phase 2）
- リアルタイム Webhook（Google Calendar Push Notification）
- テストファイルの作成
- 複数ユーザーのInbound同期を一括処理する管理者機能
- Inbound で取り込んだタスクの Outbound 再同期
- カレンダーの自動作成（ユーザーが手動で作成する前提）

---

## 依存パッケージ

- `googleapis` — 既に `functions/package.json` にインストール済み
- `react-hot-toast` — 既に `web/package.json` にインストール済み
- 追加パッケージのインストールは不要
