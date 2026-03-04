# CODEX_COMPASS_BALL_MANAGEMENT.md

## 目的

Compassのタスクに「ボール管理」機能を追加する。
タスクを「ゴール」（達成すべき小さな目標）として捉え、「今誰がボールを持っているか」を可視化する。

ボール ≠ 担当者。担当者は静的な責任者。ボールは「今アクションすべき人」を示す動的な概念。
例: 自分が担当の設計図作成タスクでも、クライアントの承認待ちなら「ボールはクライアント側」。

## 背景

建築プロジェクトでは、タスクが当事者間を「ピンポン」する:
- 設計図を提出 → クライアント確認待ち → 修正依頼 → 再提出 → 承認
- 見積依頼 → 施工会社回答待ち → 確認 → 発注

「担当者」だけでは「今誰が動くべきか」が分からない。
モバイルで「自分ボール」のゴール一覧を見て、即座にアクションできるようにする。

## データモデル変更

### Task に3つのフィールドを追加

| フィールド | 型 | 説明 |
|---|---|---|
| `ballHolder` | `string \| null` | ボール保持者のdisplayName（null = 未設定 = 担当者がボール保持と見なす） |
| `responseDeadline` | `string \| null` | 返答期限（YYYY-MM-DD形式）。この日までに相手から返答が欲しい |
| `ballNote` | `string \| null` | ボールメモ（例: 「クライアントの承認待ち」「施工会社の見積回答待ち」） |

### 重要な設計判断

- **新しいステータスは追加しない**（Sena判断）
- `ballHolder` が `null` の場合は従来通り担当者がボールを持つと解釈
- `ballHolder` が設定されていれば、その人がアクション待ち
- `ballHolder` はメンバー一覧から選択するが、「クライアント」「施工会社」等の自由入力も可能

## 変更対象ファイル

### バックエンド

1. `functions/src/lib/types.ts` — Task interfaceにフィールド追加
2. `functions/src/api/tasks.ts` — タスク更新時にball系フィールドの保存・取得対応

### フロントエンド（型定義）

3. `web/src/lib/types.ts` — Task interfaceにフィールド追加

### フロントエンド（タスク編集UI）

4. `web/src/components/Modals/TaskModal.tsx` — ボール管理セクション追加

### フロントエンド（モバイルボールビュー）

5. `web/src/components/BallView.tsx` — **新規作成**: モバイルボール一覧ビュー
6. `web/src/App.tsx` — ルーティング追加（`/ball` パス）

## 実装手順

### Step 1: 型定義の更新

**`functions/src/lib/types.ts`** の `Task` interface に追加:

```typescript
// ボール管理
ballHolder?: string | null;       // ボール保持者
responseDeadline?: string | null;  // 返答期限 (YYYY-MM-DD)
ballNote?: string | null;          // ボールメモ
```

**`web/src/lib/types.ts`** の `Task` interface にも同じフィールドを追加:

```typescript
// ボール管理
ballHolder?: string;
responseDeadline?: string;
ballNote?: string;
```

### Step 2: タスクAPI対応

`functions/src/api/tasks.ts` を確認し、タスクの更新（PUT/PATCH）で `ballHolder`, `responseDeadline`, `ballNote` が正しく保存されることを確認する。

Firestoreへの書き込み部分で、これらのフィールドがスプレッドオペレータ等で自動的に含まれる場合は変更不要。明示的にフィールドリストがある場合は追加する。

### Step 3: TaskModal にボール管理セクション追加

`web/src/components/Modals/TaskModal.tsx` に新しいセクションを追加。
既存の「担当者」セクションの下に配置:

```tsx
{/* ボール管理 */}
<div className="space-y-3 border-t border-slate-200 pt-4 mt-4">
  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ボール管理</h4>

  {/* ボール保持者 */}
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">
      今のボール
    </label>
    <div className="flex gap-2">
      {/* クイック選択ボタン: 自分 / クライアント / 施工会社 */}
      {/* カラー方針: slateベースで統一。選択中はslate-900、非選択はslate-200。派手な色は使わない */}
      <button
        type="button"
        onClick={() => setBallHolder(currentUserName)}
        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
          ballHolder === currentUserName
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
        }`}
      >
        自分
      </button>
      <button
        type="button"
        onClick={() => setBallHolder('クライアント')}
        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
          ballHolder === 'クライアント'
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
        }`}
      >
        クライアント
      </button>
      <button
        type="button"
        onClick={() => setBallHolder('施工会社')}
        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
          ballHolder === '施工会社'
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
        }`}
      >
        施工会社
      </button>
      {/* プロジェクトメンバーのドロップダウンも追加 */}
    </div>
    {/* カスタム入力（選択肢にない場合） */}
    <input
      type="text"
      value={ballHolder || ''}
      onChange={(e) => setBallHolder(e.target.value || null)}
      placeholder="その他（自由入力）"
      className="mt-2 w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
    />
  </div>

  {/* 返答期限 */}
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">
      返答期限
    </label>
    <input
      type="date"
      value={responseDeadline || ''}
      onChange={(e) => setResponseDeadline(e.target.value || null)}
      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
    />
  </div>

  {/* ボールメモ */}
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">
      メモ
    </label>
    <input
      type="text"
      value={ballNote || ''}
      onChange={(e) => setBallNote(e.target.value || null)}
      placeholder="例: クライアントの承認待ち"
      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
    />
  </div>
</div>
```

**UI設計原則の遵守:**
- **原則1（選択肢 > 自由入力）**: 「自分」「クライアント」「施工会社」のクイック選択 + メンバー選択 + 自由入力フォールバック
- **原則7（派手より楽）**: 1タップでボール変更
- **原則11（4行以上は読まれない）**: ラベルとプレースホルダーのみ

### Step 4: モバイルボールビュー

`web/src/components/BallView.tsx` を**新規作成**:

```tsx
import { useState, useMemo } from 'react';
import type { Task, Project } from '../lib/types';

interface BallViewProps {
  tasks: Task[];
  projects: Project[];
  currentUserName: string;
  onTaskClick: (task: Task) => void;
}

export function BallView({ tasks, projects, currentUserName, onTaskClick }: BallViewProps) {
  const [filter, setFilter] = useState<'mine' | 'waiting' | 'all'>('mine');

  // ボール保持者の判定ロジック
  const categorized = useMemo(() => {
    const activeTasks = tasks.filter(
      (t) => t.ステータス !== '完了' && t.type !== 'stage'
    );

    const mine: Task[] = []; // 自分がボールを持っている
    const waiting: Task[] = []; // 相手ボール（自分が担当だが相手待ち）

    for (const task of activeTasks) {
      const holder = task.ballHolder || task.担当者 || null;
      if (!holder) continue;

      if (holder === currentUserName) {
        mine.push(task);
      } else if (task.担当者 === currentUserName && task.ballHolder) {
        // 自分が担当だが、ボールは別の人
        waiting.push(task);
      }
    }

    // 期限の近い順にソート
    const sortByDeadline = (a: Task, b: Task) => {
      const da = a.responseDeadline || a.期限 || '9999-12-31';
      const db = b.responseDeadline || b.期限 || '9999-12-31';
      return da.localeCompare(db);
    };

    mine.sort(sortByDeadline);
    waiting.sort(sortByDeadline);

    return { mine, waiting, all: activeTasks };
  }, [tasks, currentUserName]);

  const filtered = filter === 'mine' ? categorized.mine
    : filter === 'waiting' ? categorized.waiting
    : categorized.all;

  const getProjectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.物件名 || '';

  // 期限の緊急度を表示（slateベース。超過のみ赤、それ以外は濃淡で表現）
  const getDeadlineColor = (deadline?: string) => {
    if (!deadline) return 'text-slate-300';
    const diff = Math.ceil(
      (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (diff < 0) return 'text-red-600 font-bold'; // 超過（これだけ赤）
    if (diff <= 1) return 'text-slate-900 font-semibold'; // 今日・明日
    if (diff <= 3) return 'text-slate-700'; // 3日以内
    return 'text-slate-400';
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-4">
      {/* フィルターボタン */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'mine' as const, label: '自分ボール', count: categorized.mine.length },
          { key: 'waiting' as const, label: '相手ボール', count: categorized.waiting.length },
          { key: 'all' as const, label: 'すべて', count: categorized.all.length },
        ]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`flex-1 px-3 py-2 text-sm rounded-xl border transition-colors ${
              filter === opt.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {opt.label}
            <span className="ml-1 text-xs opacity-70">({opt.count})</span>
          </button>
        ))}
      </div>

      {/* タスク一覧 */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-slate-400 py-8 text-sm">該当するゴールはありません</p>
        )}
        {filtered.map((task) => (
          <button
            key={task.id}
            onClick={() => onTaskClick(task)}
            className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors"
          >
            {/* プロジェクト名 */}
            <p className="text-xs text-slate-400 mb-1">{getProjectName(task.projectId)}</p>
            {/* ゴール名 */}
            <p className="text-sm font-medium text-slate-900 mb-2">{task.タスク名}</p>
            {/* ボール情報 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* カラー方針: slateベースで統一。相手ボール=slate-200背景、自分ボール=slate-900背景 */}
                {task.ballHolder && task.ballHolder !== currentUserName ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-700">
                    {task.ballHolder}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-900 text-white">
                    自分
                  </span>
                )}
                {task.ballNote && (
                  <span className="text-xs text-slate-400 truncate max-w-[120px]">
                    {task.ballNote}
                  </span>
                )}
              </div>
              {/* 期限表示 */}
              <span className={`text-xs ${getDeadlineColor(task.responseDeadline || task.期限)}`}>
                {task.responseDeadline || task.期限 || '期限なし'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Step 5: App.tsx にルーティング追加

`web/src/App.tsx` に以下を追加:

1. `BallView` をインポート
2. `/ball` パスでBallViewを表示するルーティングを追加
3. ナビゲーションに「ボール」リンクを追加（モバイル時のみ表示、または常時表示）

具体的には、既存のルーティング構造を確認し、適切な場所に追加する。
BallViewに渡すpropsは、既存のApp.tsxで管理しているtasks, projects, currentUserを使う。

**ナビゲーション追加**: 既存のナビゲーション要素を確認し、モバイルナビにリンクを追加。
デスクトップでもアクセス可能にするが、主にモバイルでの利用を想定。

### Step 6: ガントチャートのボール表示（軽微）

`web/src/components/GanttChart/` 内のタスク行に、`ballHolder` がある場合に小さなバッジを表示。
既存のガントチャートUIを確認し、担当者名の横に表示する。

例: `[田中] → クライアント` のように表示

これは必須ではないが、デスクトップでもボール状態が一目で分かるようにする。
実装の複雑度が高い場合はスキップしてよい。

## 完了条件

1. `pnpm --filter functions build` が成功する（TypeScriptエラーなし）
2. `pnpm --filter web build` が成功する（TypeScriptエラーなし）
3. TaskModal でボール保持者、返答期限、メモを設定・保存できる
4. ボール保持者は「自分」「クライアント」「施工会社」のクイック選択 + メンバー選択 + 自由入力で選べる
5. `/ball` パスでモバイルボールビューが表示される
6. 「自分ボール」「相手ボール」のフィルタリングが正しく動作する
7. 返答期限の緊急度がslateの濃淡で区別される（超過のみ赤、それ以外はslate濃淡）
8. ゴールをタップするとTaskModalが開く

## やらないこと

- ステータスの追加・変更（既存の「未着手/進行中/完了」はそのまま）
- PWA対応（将来のv0.2で検討）
- プッシュ通知（将来のv0.3で検討）
- ボール履歴の記録（将来のv0.2で検討）
- テストファイルの作成
