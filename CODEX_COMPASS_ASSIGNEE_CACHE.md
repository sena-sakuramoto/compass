# CODEX_COMPASS_ASSIGNEE_CACHE.md

## 目的

TaskModal で担当者ドロップダウンを開く際、プロジェクトメンバー一覧の読み込みが遅い問題を解決する。
`@tanstack/react-query`（既にインストール済み）を使い、メンバー・工程データをキャッシュする。

## 背景

現状: `TaskModal.tsx` の `useEffect` 内で毎回 `listProjectMembers()` と `listStages()` を直接呼んでいる。
モーダルを開く度にAPIリクエストが発生し、「メンバー読み込み中...」が表示される。

## 変更対象ファイル

1. `web/src/lib/hooks/useProjectMembers.ts` — **新規作成**
2. `web/src/lib/hooks/useStages.ts` — **新規作成**
3. `web/src/components/Modals/TaskModal.tsx` — **既存修正**
4. `web/src/App.tsx` — React Query の `QueryClientProvider` が既に設定されているか確認。なければ追加

## 実装手順

### Step 1: QueryClientProvider の確認・追加

`web/src/App.tsx` （またはエントリーポイント `main.tsx`）を確認。
`@tanstack/react-query` の `QueryClientProvider` が既にラップされていればスキップ。
なければ以下を追加:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分間キャッシュ
      gcTime: 10 * 60 * 1000,   // 10分間GC
      refetchOnWindowFocus: false,
    },
  },
});

// アプリ全体をラップ
<QueryClientProvider client={queryClient}>
  {/* 既存のアプリ */}
</QueryClientProvider>
```

### Step 2: useProjectMembers フック作成

`web/src/lib/hooks/useProjectMembers.ts` を新規作成:

```typescript
import { useQuery } from '@tanstack/react-query';
import { listProjectMembers } from '../api';
import type { ProjectMember } from '../auth-types';

export function useProjectMembers(projectId: string | undefined) {
  return useQuery<ProjectMember[]>({
    queryKey: ['projectMembers', projectId],
    queryFn: () => listProjectMembers(projectId!, { status: 'active' }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5分
  });
}
```

### Step 3: useStages フック作成

`web/src/lib/hooks/useStages.ts` を新規作成:

```typescript
import { useQuery } from '@tanstack/react-query';
import { listStages } from '../api';
import type { Stage } from '../types';

export function useStages(projectId: string | undefined) {
  return useQuery<Stage[]>({
    queryKey: ['stages', projectId],
    queryFn: async () => {
      const { stages } = await listStages(projectId!);
      return stages;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}
```

### Step 4: TaskModal.tsx の修正

**削除する部分:**

1. `projectMembers` / `membersLoading` の `useState` を削除
2. `stages` の `useState` を削除
3. メンバー取得の `useEffect`（L207〜L232付近）を削除
4. 工程取得の `useEffect`（L190〜L204付近）を削除

**追加する部分:**

```tsx
import { useProjectMembers } from '../../lib/hooks/useProjectMembers';
import { useStages } from '../../lib/hooks/useStages';

// コンポーネント内
const {
  data: projectMembers = preloadedProjectMembers ?? [],
  isLoading: membersLoading,
} = useProjectMembers(project || undefined);

const { data: stages = [] } = useStages(project || undefined);
```

**注意:**
- `preloadedProjectMembers` prop はそのまま残す（BatchEditModal等から利用される後方互換性のため）
- `preloadedProjectMembers` が渡された場合はそちらを優先する。react-queryの `initialData` または `placeholderData` として渡す:

```tsx
const {
  data: fetchedMembers = [],
  isLoading: membersLoading,
} = useProjectMembers(project || undefined);

// preloadedがあればそちらを優先
const projectMembers = (preloadedProjectMembers && preloadedProjectMembers.length > 0 && project === defaultProjectId)
  ? preloadedProjectMembers
  : fetchedMembers;
```

### Step 5: キャッシュ無効化

メンバー追加・削除時にキャッシュを無効化する必要がある。
`ProjectMembersDialog.tsx` 等でメンバーを追加した後に:

```tsx
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();
// メンバー追加/削除後:
queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
```

同様に、工程作成/削除後:
```tsx
queryClient.invalidateQueries({ queryKey: ['stages', projectId] });
```

## 完了条件

1. `pnpm --filter web build` が成功する（TypeScriptエラーなし）
2. TaskModal を開いたとき、2回目以降は「メンバー読み込み中...」が表示されない（キャッシュから即座に表示）
3. プロジェクトを切り替えた場合、新しいプロジェクトのメンバーが正しく表示される
4. `preloadedProjectMembers` が渡された場合は引き続きそちらが優先される
5. メンバー追加後にキャッシュが無効化され、新しいメンバーが表示される

## やらないこと

- UIデザインの変更
- 新しい依存パッケージの追加（react-queryは既にある）
- テストファイルの作成（現状テストフレームワークが未導入）
