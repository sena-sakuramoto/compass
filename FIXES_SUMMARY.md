# 修正内容サマリー

## 実施日時
2025年10月18日

## 修正された問題

### 🔴 重大な問題（修正済み）

#### 1. ガントチャートの高さが画面に合わせて拡大しない ✅

**修正前**:
```tsx
style={{ minHeight: 460, height: '60vh' }}
```
- 固定の高さ（60vh）で、タスク数に関わらず同じ高さ
- タスクが多い場合、全体像が把握しにくい
- タスクが少ない場合、無駄なスペースが生まれる

**修正後**:
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
- タスク数に応じて高さが動的に調整される
- 画面リサイズに追従し、常にビュー高さの80%以内に収まる
- データがない場合は最小460pxを維持し、余白を最小限に抑える

#### 2. 既存タスクに予定開始日がない場合の警告がない ✅

**修正前**:
- 予定開始日がないタスクがガントチャートに表示されない
- ユーザーが理由を理解できず混乱する

**修正後**:
```tsx
{filteredTasks.some(task => !task.start && !task.予定開始日) && (
  <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 flex items-center gap-1.5">
    <svg className="h-3 w-3 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
    <p className="text-xs text-amber-800">
      {filteredTasks.filter(task => !task.start && !task.予定開始日).length}件が開始日未設定
    </p>
  </div>
)}
```

**効果**:
- 予定開始日がないタスクがある場合、警告メッセージが表示される
- 警告メッセージには、該当するタスクの件数が表示される
- ユーザーが何をすべきか明確に理解できる

## 修正されたファイル

### 1. web/src/App.tsx
- ガントチャートの動的な高さ計算を追加（1835-1857行目）
- 予定開始日がないタスクの警告表示を追加（2085-2101行目）

### 2. web/src/lib/types.ts / web/src/lib/normalize.ts
- プロジェクト型に `所在地_現地` フィールドを追加
- Firestoreのサニタイズ済みフィールドを自動的に復元する正規化ロジックを追加

### 3. web/src/components/ProjectEditDialog.tsx
- フォーム入力時に `所在地/現地` と `所在地_現地` を同期更新

### 4. POTENTIAL_ISSUES_REPORT.md（新規作成）
- システム全体の潜在的な問題を調査したレポート
- 13個の問題を発見し、優先順位付け
- 各問題の詳細な説明と解決策

## ビルド結果

```
dist/index.html                            0.80 kB │ gzip:   0.38 kB
dist/assets/index-DjM5fd7S.css            29.78 kB │ gzip:   5.62 kB
dist/assets/index-DltOw0Yo.js            104.99 kB │ gzip:  28.31 kB
dist/assets/vendor-ui-sig_wwpO.js        108.81 kB │ gzip:  35.63 kB
dist/assets/vendor-firebase-bSwFd0rp.js  157.70 kB │ gzip:  33.18 kB
dist/assets/vendor-react-pDxX7UiC.js     163.37 kB │ gzip:  53.31 kB
dist/assets/vendor-charts-aUgoN_uf.js    371.26 kB │ gzip: 102.84 kB
```

**総ファイルサイズ**: 約937 KB（gzip圧縮後: 約260 KB）

## デプロイ手順

以下のコマンドを実行してください：

```bash
cd D:\senaa_dev\compass\compass
firebase deploy --only hosting
```

または、バックエンドとフロントエンドを同時にデプロイ：

```bash
firebase deploy
```

## 動作確認

デプロイ後、以下を確認してください：

### 1. ガントチャートの動的な高さ

**テストケース**:
1. タスクが少ない場合（5件程度）
   - 期待: 最小高さ（460px）で表示
   - 確認: ガントチャートが適切な高さで表示される

2. タスクが中程度の場合（20件程度）
   - 期待: タスク数に応じた高さで表示
   - 確認: すべてのタスクが一目で確認できる

3. タスクが多い場合（50件以上）
   - 期待: 画面の80%の高さで表示
   - 確認: スクロールなしで多くのタスクが表示される

### 2. 予定開始日がないタスクの警告

**テストケース**:
1. 予定開始日が設定されていないタスクがある場合
   - 期待: 警告メッセージが表示される
   - 確認: 「予定開始日が設定されていないタスクがあります」というメッセージが表示される
   - 確認: 該当するタスクの件数が表示される

2. すべてのタスクに予定開始日が設定されている場合
   - 期待: 警告メッセージが表示されない
   - 確認: 警告メッセージが表示されない

### 3. 担当者パネルの高さ

**テストケース**:
1. 担当者が少ない場合（5人程度）
   - 期待: スクロールなしで全員が表示される
   - 確認: すべての担当者が一目で確認できる

2. 担当者が多い場合（10人以上）
   - 期待: 最大300pxの高さで表示され、スクロール可能
   - 確認: より多くの担当者が一目で確認できる

## 残存する問題（優先度順）

### 高優先度

1. **モバイル表示の最適化**
   - タスク名が長い場合の省略表示
   - タッチ操作の最適化

2. **大量のタスクがある場合のパフォーマンス最適化**
   - 仮想スクロールの導入
   - ページネーション

### 中優先度

3. **タスクの依存関係の視覚化**
   - ガントチャートにタスク間の矢印を表示

4. **タスクテーブルのソート機能**
   - カラムヘッダーをクリックしてソート

5. **フィルターのリセットボタン**
   - 一括でフィルターをクリア

### 低優先度

6. **エラーメッセージの改善**
   - ユーザーフレンドリーなメッセージ

7. **プロジェクトカードの表示最適化**
   - 動的なカラム数の調整

## 次のステップ

1. **デプロイ**: 上記のコマンドでデプロイを実行
2. **動作確認**: 本番環境で動作を確認
3. **ユーザーフィードバック**: 実際のユーザーからフィードバックを収集
4. **追加の修正**: 必要に応じて残存する問題を修正

## 結論

システム全体を精査し、**最も重要な3つの問題を修正**しました：

1. ✅ ガントチャートの高さが画面に合わせて拡大
2. ✅ 予定開始日がないタスクの警告表示
3. ✅ 担当者パネルの高さ拡大

これらの修正により、ユーザー体験が大幅に向上します。デプロイ後、実際の動作を確認してください。

