# 潜在的な問題の調査レポート

## 実施日時
2025年10月18日

## 調査範囲
- UI/UXの問題
- レスポンシブデザインの問題
- パフォーマンスの問題
- データ整合性の問題
- セキュリティの問題

## 発見された問題と解決策

### 🔴 重大な問題

#### 1. ガントチャートの高さが画面に合わせて拡大しない → ✅ 対応済み

**問題の詳細（解消済み）**:
- 旧実装では `height: '60vh'` 固定で、タスク数や画面サイズに応じた調整ができなかった
- タスク数が多い場合はスクロールが必須、少ない場合は余白が生じていた

**最新の実装**:
```tsx
const [viewportHeight, setViewportHeight] = useState(() =>
  typeof window !== 'undefined' ? window.innerHeight : 1080
);

useEffect(() => {
  if (typeof window === 'undefined') return;
  const handleResize = () => setViewportHeight(window.innerHeight);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);

const ganttChartHeight = useMemo(() => {
  const baseHeight = 460;
  const rowHeight = 40;
  const headerBuffer = 150;
  const taskCount = newGanttTasks.length;
  const calculatedHeight = taskCount > 0 ? taskCount * rowHeight + headerBuffer : baseHeight;
  const maxHeight = viewportHeight * 0.8;
  return Math.max(baseHeight, Math.min(calculatedHeight, maxHeight));
}, [newGanttTasks.length, viewportHeight]);

<section
  className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
  style={{ minHeight: 460, height: ganttChartHeight }}
>
```

**効果**:
- タスク数と画面サイズに応じて高さが自動調整される
- ビュー高さの80%を上限とし、過度なスクロールや余白を防止
- リサイズにも追従し、レスポンシブに動作

---

### 🟡 中程度の問題

#### 2. モバイル表示の最適化が不十分

**問題の詳細**:
- ガントチャートのY軸ラベルがモバイルで切れる可能性
- タスク名が長い場合、表示が崩れる
- タッチ操作の最適化が不十分

**影響度**: 中（モバイルユーザーの体験に影響）

**解決策**:
1. **Y軸の幅を動的に調整**: 既に実装されているが、さらに最適化
2. **タスク名の省略表示**: 長いタスク名を `...` で省略
3. **タッチ操作の改善**: ドラッグ＆ドロップの代わりにタップ操作を追加

**実装方法**:
```tsx
// タスク名の省略
const truncateTaskName = (name: string, maxLength: number = 30) => {
  return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
};
```

#### 3. 担当者パネルの高さ制限

**問題の詳細**:
- 担当者パネルの高さが `max-h-[120px]` に固定（App.tsx 2047行目）
- 担当者が多い場合、スクロールが必要になり、全員を一目で確認できない

**影響度**: 中（担当者が多い場合に影響）

**解決策**:
1. **動的な高さ調整**: 担当者数に応じて高さを調整
2. **検索機能の追加**: 担当者を検索できるようにする
3. **折りたたみ機能**: 必要に応じて展開/折りたたみ

**実装方法**:
```tsx
const assigneeListHeight = useMemo(() => {
  const count = people.length;
  const rowHeight = 56; // 1人あたりの高さ
  const maxHeight = 300; // 最大高さ
  return Math.min(count * rowHeight, maxHeight);
}, [people.length]);

<div className="space-y-2 overflow-y-auto" style={{ maxHeight: assigneeListHeight }}>
```

#### 4. プロジェクトカードの表示が固定グリッド

**問題の詳細**:
- プロジェクトカードが固定グリッド（`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`）
- プロジェクト数が多い場合、スクロールが長くなる
- プロジェクト数が少ない場合、無駄なスペースが生まれる

**影響度**: 低（見た目の問題）

**解決策**:
1. **仮想スクロール**: プロジェクト数が多い場合に仮想スクロールを使用
2. **動的なカラム数**: 画面サイズとプロジェクト数に応じてカラム数を調整

---

### 🟢 軽微な問題

#### 5. タスクテーブルのソート機能がない

**問題の詳細**:
- タスクテーブルでカラムヘッダーをクリックしてソートできない
- ユーザーが任意の順序でタスクを並び替えられない

**影響度**: 低（利便性の問題）

**解決策**:
- カラムヘッダーにソート機能を追加

#### 6. フィルターのリセットボタンがない

**問題の詳細**:
- フィルターを一括でリセットするボタンがない
- 複数のフィルターを設定した後、すべてクリアするのが面倒

**影響度**: 低（利便性の問題）

**解決策**:
- 「フィルターをリセット」ボタンを追加

#### 7. エラーメッセージが不親切

**問題の詳細**:
- APIエラー時のメッセージが技術的すぎる
- ユーザーが何をすべきか分からない

**影響度**: 低（エラー発生時のみ影響）

**解決策**:
- エラーメッセージをユーザーフレンドリーに変更
- エラーの原因と対処方法を明示

---

### 🔵 パフォーマンスの問題

#### 8. 大量のタスクがある場合のパフォーマンス低下

**問題の詳細**:
- タスク数が1000件を超えると、フィルタリングやレンダリングが遅くなる可能性
- ガントチャートの描画に時間がかかる

**影響度**: 中（大規模プロジェクトで影響）

**解決策**:
1. **仮想スクロール**: タスクテーブルとガントチャートに仮想スクロールを導入
2. **ページネーション**: タスク一覧をページ分割
3. **遅延ロード**: 必要なデータのみをロード

**実装方法**:
- `react-window` または `react-virtual` ライブラリを使用

#### 9. 不要な再レンダリング

**問題の詳細**:
- `useMemo` と `useCallback` が適切に使用されているが、一部で不要な再レンダリングが発生する可能性

**影響度**: 低（パフォーマンスに軽微な影響）

**解決策**:
- React DevTools Profilerで再レンダリングを分析
- 必要に応じて `React.memo` を追加

---

### 🟣 データ整合性の問題

#### 10. 既存タスクに予定開始日がない場合の対処

**問題の詳細**:
- 既存のFirestoreデータに `予定開始日` または `start` フィールドがない場合、ガントチャートに表示されない
- ユーザーが混乱する可能性

**影響度**: 高（既存データがある場合）

**解決策**:
1. **マイグレーションスクリプトの実行**: 既存タスクに `start`/`end` を自動生成
2. **UIでの警告表示**: 予定開始日が設定されていないタスクを警告
3. **一括編集機能**: 複数のタスクを一度に編集できる機能

**実装状況**:
- ✅ マイグレーションスクリプトが作成済み（`migrate-task-dates.ts`）
- ⚠️ UIでの警告表示は未実装

#### 11. タスクの依存関係が視覚化されていない

**問題の詳細**:
- タスクに「依存タスク」フィールドがあるが、ガントチャートで視覚化されていない
- タスクの依存関係が分かりにくい

**影響度**: 中（プロジェクト管理の効率に影響）

**解決策**:
- ガントチャートにタスク間の矢印を表示
- 依存タスクが完了していない場合、警告を表示

---

### 🟠 セキュリティの問題

#### 12. Firestoreセキュリティルールの検証

**問題の詳細**:
- 現在のセキュリティルールは `@archi-prisma.co.jp` ドメインのみアクセス可能
- しかし、特定のユーザーのみがアクセスできるようにする必要がある場合、追加の設定が必要

**影響度**: 中（セキュリティに関わる）

**現在の実装**:
```
function allowed() {
  return request.auth != null &&
    request.auth.token.email.matches(".*@archi-prisma\\.co\\.jp$");
}
```

**推奨事項**:
- 必要に応じて、特定のユーザーIDやロールベースのアクセス制御を追加

#### 13. 環境変数の管理

**問題の詳細**:
- `.env` ファイルがGitにコミットされないように `.gitignore` に含まれている（正しい）
- しかし、デプロイ時に環境変数が正しく設定されているか確認が必要

**影響度**: 低（デプロイ時のみ影響）

**推奨事項**:
- デプロイ前に環境変数のチェックリストを確認

---

## 優先順位付き修正リスト

### 最優先（すぐに修正すべき）

1. **ガントチャートの高さを画面に合わせて拡大** ⭐⭐⭐
2. **既存タスクに予定開始日がない場合の対処** ⭐⭐⭐

### 高優先度（近日中に修正すべき）

3. **モバイル表示の最適化** ⭐⭐
4. **担当者パネルの高さ調整** ⭐⭐
5. **大量のタスクがある場合のパフォーマンス最適化** ⭐⭐

### 中優先度（余裕があれば修正）

6. **タスクの依存関係の視覚化** ⭐
7. **タスクテーブルのソート機能** ⭐
8. **フィルターのリセットボタン** ⭐
9. **エラーメッセージの改善** ⭐

### 低優先度（将来的に検討）

10. **プロジェクトカードの表示最適化**
11. **不要な再レンダリングの最適化**

---

## 修正の実装

### 1. ガントチャートの高さを画面に合わせて拡大

**修正ファイル**: `web/src/App.tsx`

**修正内容**:
```tsx
// ガントチャートの動的な高さ計算
const ganttChartHeight = useMemo(() => {
  const taskCount = ganttData.data.length;
  if (taskCount === 0) return 460; // データがない場合の最小高さ
  
  const rowHeight = 40; // 1タスクあたりの高さ
  const headerHeight = 150; // ヘッダーとマージン
  const calculatedHeight = taskCount * rowHeight + headerHeight;
  
  // 画面の高さの80%を最大値とする
  const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 800;
  const minHeight = 460;
  
  return Math.max(minHeight, Math.min(calculatedHeight, maxHeight));
}, [ganttData.data.length]);

// 使用箇所
<div
  className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4"
  style={{ height: ganttChartHeight }}
>
```

### 2. 既存タスクに予定開始日がない場合の警告表示

**修正ファイル**: `web/src/App.tsx`

**修正内容**:
```tsx
// 予定開始日がないタスクを検出
const tasksWithoutStartDate = useMemo(() => {
  return filteredTasks.filter(task => !task.start && !task.予定開始日);
}, [filteredTasks]);

// 警告メッセージの表示
{tasksWithoutStartDate.length > 0 && (
  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
    <div className="flex items-start gap-2">
      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
      <div className="text-sm text-amber-800">
        <p className="font-medium">予定開始日が設定されていないタスクがあります</p>
        <p className="mt-1 text-xs">
          {tasksWithoutStartDate.length}件のタスクがガントチャートに表示されません。
          タスクを編集して予定開始日を設定してください。
        </p>
      </div>
    </div>
  </div>
)}
```

---

## テスト計画

### 1. ガントチャートの高さテスト

**テストケース**:
1. タスクが0件の場合 → 最小高さ（460px）で表示
2. タスクが10件の場合 → 適切な高さで表示
3. タスクが100件の場合 → 最大高さ（画面の80%）で表示
4. 画面サイズを変更した場合 → 高さが動的に調整される

### 2. モバイル表示テスト

**テストケース**:
1. iPhone SE（375px幅）で表示
2. iPad（768px幅）で表示
3. タッチ操作でタスクをドラッグ＆ドロップ

### 3. パフォーマンステスト

**テストケース**:
1. タスクが100件の場合のレンダリング時間
2. タスクが1000件の場合のレンダリング時間
3. フィルタリング操作の応答時間

---

## 結論

システム全体を調査した結果、**13個の潜在的な問題**を発見しました。最も重要な問題は以下の2つです：

1. **ガントチャートの高さが画面に合わせて拡大しない**
2. **既存タスクに予定開始日がない場合の対処**

これらの問題を修正することで、ユーザー体験が大幅に向上します。修正を実装した後、デプロイして動作確認を行うことをお勧めします。

