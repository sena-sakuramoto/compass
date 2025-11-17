# 工程表タスク編集の"滑らかな即時反映"実装ガイド

このガイドでは、タスク編集時の楽観的更新（Optimistic Update）とPending Overlay戦略を使用して、UI上でのラバーバンド（一瞬の巻き戻り）をゼロにする実装方法を説明します。

## 📁 実装済みのファイル

### 1. Pending Overlayストア
**ファイル:** `src/state/pendingOverlay.ts`

楽観的更新の状態を管理するZustandストアです。

**主な機能:**
- `addPending()`: タスクにpending変更を追加
- `ackPending()`: サーバーからのACK後にpending解除
- `rollbackPending()`: エラー時のロールバック
- `applyPendingToTask()`: タスクにpending変更を適用
- `applyPendingToTasks()`: タスクリストにpending変更を適用

### 2. サーバー更新のガード関数
**ファイル:** `src/state/guards.ts`

pending中のタスクに対するサーバー更新の適用を制御します。

**主な機能:**
- `shouldApplyServerUpdate()`: サーバー更新を適用すべきか判定
- `applyServerTask()`: サーバータスクをローカルに適用
- `checkDateRegression()`: 日付フィールドの回帰をチェック

### 3. タスク管理カスタムフック
**ファイル:** `src/hooks/useTasks.ts`

React Queryベースのタスク取得・更新フックです。

**主な機能:**
- `useTasks()`: タスク一覧を取得（pending適用済み）
- `useUpdateTask()`: タスク更新（楽観的更新）
- `useMoveTaskDates()`: タスク日付移動（楽観的更新）

### 4. タスクソート関数
**ファイル:** `src/utils/taskSort.ts`

pending変更を加味したソート関数です。

**主な機能:**
- `sortTasksByStartDate()`: 開始日でソート
- `sortTasksByEndDate()`: 終了日でソート
- `sortTasksByUpdatedAt()`: 更新日でソート
- `getStableTaskKey()`: 仮想リスト用の安定キー生成

### 5. Task型の拡張
**ファイル:** `src/lib/types.ts`

Task型に以下のフィールドを追加:
- `version?: number` - 楽観的ロック用のバージョン番号
- `opId?: string` - 操作ID（楽観的更新のACK用）

## 🚀 使用方法

### 基本的な使い方

#### 1. タスク一覧の取得

```typescript
import { useTasks } from '../hooks/useTasks';

function TaskListComponent() {
  // pending適用済みのタスクリストを取得
  const { data: tasks, isLoading, error } = useTasks({ projectId: 'project-123' });

  if (isLoading) return <div>読み込み中...</div>;
  if (error) return <div>エラー: {error.message}</div>;

  return (
    <div>
      {tasks?.map((task) => (
        <div key={task.id}>{task.タスク名}</div>
      ))}
    </div>
  );
}
```

#### 2. タスクの更新（楽観的更新）

```typescript
import { useUpdateTask } from '../hooks/useTasks';
import { usePendingOverlay } from '../state/pendingOverlay';

function TaskEditComponent({ taskId }: { taskId: string }) {
  const updateTask = useUpdateTask();
  const { hasPending } = usePendingOverlay();

  const handleUpdate = async () => {
    // 楽観的更新を実行
    await updateTask.mutateAsync({
      id: taskId,
      payload: {
        タスク名: '新しいタスク名',
        ステータス: '進行中',
      },
    });
  };

  return (
    <div>
      <button onClick={handleUpdate} disabled={updateTask.isPending}>
        更新
      </button>
      {hasPending(taskId) && (
        <span className="ml-2 text-xs text-blue-600">同期中...</span>
      )}
    </div>
  );
}
```

#### 3. タスク日付の移動（ドラッグ&ドロップ）

```typescript
import { useMoveTaskDates } from '../hooks/useTasks';

function GanttTaskBarComponent({ task }: { task: GanttTask }) {
  const moveTaskDates = useMoveTaskDates();

  const handleDateChange = async (newStartDate: Date, newEndDate: Date) => {
    // 楽観的更新を実行
    await moveTaskDates.mutateAsync({
      id: task.id,
      payload: {
        予定開始日: newStartDate.toISOString().split('T')[0],
        期限: newEndDate.toISOString().split('T')[0],
      },
    });
  };

  return (
    <div
      onDragEnd={(e) => {
        const { newStart, newEnd } = calculateNewDates(e);
        handleDateChange(newStart, newEnd);
      }}
    >
      {task.タスク名}
    </div>
  );
}
```

### Pending状態のUI表示

```typescript
import { usePendingOverlay } from '../state/pendingOverlay';

function TaskRow({ task }: { task: Task }) {
  const { getPending } = usePendingOverlay();
  const pending = getPending(task.id);

  return (
    <div className="relative">
      {/* タスクの内容 */}
      <div>{task.タスク名}</div>

      {/* Pending中のバッジ */}
      {pending && Date.now() < pending.lockUntil && (
        <div className="absolute top-0 right-0">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
            <svg className="mr-1 h-3 w-3 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            同期中...
          </span>
        </div>
      )}
    </div>
  );
}
```

### ソートとグループ化

```typescript
import { sortTasksByStartDate, groupTasksByProject } from '../utils/taskSort';
import { usePendingOverlay } from '../state/pendingOverlay';

function SortedTaskListComponent() {
  const { data: tasks } = useTasks({});
  const { pending } = usePendingOverlay();

  // pending適用後のタスクを開始日でソート
  const sortedTasks = sortTasksByStartDate(tasks || [], pending);

  // プロジェクトごとにグループ化
  const groupedTasks = groupTasksByProject(tasks || [], pending);

  return (
    <div>
      {sortedTasks.map((task) => (
        <div key={task.id}>{task.タスク名}</div>
      ))}
    </div>
  );
}
```

## 🔧 詳細設定

### Pending Lock期間のカスタマイズ

デフォルトは3000ms（3秒）ですが、必要に応じて変更可能:

```typescript
const opId = addPending(taskId, fields, 5000); // 5秒間ロック
```

### React Queryのキャッシュ設定

`src/main.tsx`で設定を変更可能:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000, // キャッシュ保持時間
      refetchOnWindowFocus: false, // フォーカス時の再取得
      retry: 1, // リトライ回数
    },
  },
});
```

## 🎯 実装のポイント

### 1. ラバーバンドゼロの実現

- **Pending Overlay**: タスク編集直後にpendingに追加して即座にUIを更新
- **ACK後に解除**: サーバーからのレスポンス後にpendingを解除
- **ガード関数**: 古いサーバー更新を破棄して回帰を防止

### 2. データの一貫性

- **updatedAt**による後勝ち判定
- **version**フィールド（オプショナル）でより厳密な競合検出
- **opId**でACKの追跡

### 3. パフォーマンス最適化

- **React.memo**でコンポーネントの不要な再レンダリングを防止
- **CSS transform**でアニメーション（reflowを避ける）
- **安定したkey**（task.id）を使用

## 📊 計測とデバッグ

### コンソールログの確認

実装には詳細なログが含まれています:

```
[guards] Rejecting server update: older updatedAt
[guards] Rejecting server update: regression detected
[useUpdateTask] Error: ...
```

### React Query Devtools（オプショナル）

デバッグ用にReact Query Devtoolsを追加できます:

```bash
pnpm add @tanstack/react-query-devtools
```

```typescript
// src/main.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<QueryClientProvider client={queryClient}>
  <BrowserRouter>
    <App />
  </BrowserRouter>
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

## 🚨 注意事項

1. **サーバー側の実装**は変更不要ですが、将来的に`version`と`opId`を返すようにするとより強固になります。

2. **Firebaseを使用している場合**は、`metadata.hasPendingWrites`をピン留め条件に使用できます。

3. **並行更新の競合**は、`updatedAt`と`version`で検出・解決されます。

## 📝 今後の改善案

### サーバー側の対応

```typescript
// functions/src/api/tasks.ts の PATCH /tasks/:id
router.patch('/:id', async (req, res) => {
  // version をインクリメント
  const newVersion = (task.version || 0) + 1;

  await updateTask(req.params.id, {
    ...payload,
    version: newVersion,
    updatedAt: new Date().toISOString(),
  });

  // 完全なタスクを返す
  const updated = await getTask(req.params.id);
  res.json({ task: updated });
});
```

### WebSocket/SSEでのリアルタイム更新

```typescript
// サーバーからのリアルタイム更新を受信
socket.on('task.updated', (incoming: Task) => {
  const queryClient = useQueryClient();
  const { getPending } = usePendingOverlay();

  queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (oldTasks) => {
    if (!oldTasks) return [incoming];

    const pending = getPending(incoming.id);
    return applyServerTask(oldTasks, incoming, pending);
  });
});
```

## 🎓 まとめ

この実装により：

✅ **UIの即時反映**: ユーザーの編集が即座にUIに反映
✅ **ラバーバンドゼロ**: サーバー同期待ちでの巻き戻りなし
✅ **データの一貫性**: 競合検出と後勝ち判定
✅ **エラーハンドリング**: 失敗時の自動ロールバック
✅ **パフォーマンス**: 最適化されたレンダリングとアニメーション

これらの機能により、工程表タスク編集の"滑らかな即時反映"が実現されます！
