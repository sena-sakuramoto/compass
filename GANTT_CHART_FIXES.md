# ガントチャート表示問題の修正レポート

**日時**: 2025-10-18  
**対象**: ガントチャートの表示問題（日付の重なり、プロジェクト名の非表示、プロジェクト行の幅）

## 修正内容

### 1. 日付ラベルの重なり問題を解決

**ファイル**: `web/src/App.tsx`  
**変更箇所**: `buildGantt`関数内のtick間隔計算ロジック（2231-2259行目）

**修正前の問題**:
- 長期間の表示時に日付ラベルが密集して重なっていた
- 期間に応じた間隔調整が不十分だった

**修正後**:
```typescript
// 期間に応じてより広い間隔を設定
const autoTickStep = 
  spanDays > 365 ? 60 :  // 1年以上 → 60日間隔
  spanDays > 180 ? 30 :  // 半年以上 → 30日間隔
  spanDays > 90 ? 14 :   // 3ヶ月以上 → 14日間隔
  spanDays > 60 ? 7 :    // 2ヶ月以上 → 7日間隔
  spanDays > 30 ? 3 :    // 1ヶ月以上 → 3日間隔
  1;                     // 1ヶ月以下 → 1日間隔
```

**タイムスケール別の調整**:
- 6週間表示: 3日間隔
- 四半期表示: 7日間隔
- 半年表示: 14日間隔
- 全期間表示: 最低14日間隔、または期間の1/15

### 2. プロジェクト名の表示を改善

**ファイル**: `web/src/components/GanttChart.tsx`  
**変更箇所**: `GanttYAxisTick`コンポーネント（104-139行目）

**修正前の問題**:
- Y軸のラベルが表示されない
- 空文字列の処理が不十分
- プロジェクトごと表示モードで`projectLabel`が設定されていなかった

**修正後**:
```typescript
// projectLabelがあればそれを使用、なければnameを使用
const project = (datum.projectLabel || datum.name || '（無題）');

// 空文字列チェックを追加
const truncateText = (text: string, maxLen: number) => {
  if (!text || text.length <= maxLen) return text;
  return text.substring(0, maxLen - 1) + '…';
};

// タスク名がない場合でも担当者名を表示
{taskName ? (
  <text x={-8} y={10} textAnchor="end" fontSize={10} fill="#64748b">
    {truncateText(taskName + (assignee ? ` ｜ ${assignee}` : ''), maxTaskChars)}
  </text>
) : assignee ? (
  <text x={-8} y={10} textAnchor="end" fontSize={10} fill="#64748b">
    {truncateText(assignee, maxTaskChars)}
  </text>
) : null}
```

**追加機能**:
- テキストの切り詰め機能（長いプロジェクト名やタスク名に対応）
- フォントサイズの調整（プロジェクト名: 12px、タスク名/担当者: 10px）
- Y軸の位置調整（y=-4 と y=10 で2行表示）

### 3. プロジェクト行の高さを最適化

**ファイル**: `web/src/App.tsx`, `web/src/components/GanttChart.tsx`

**App.tsx の変更**:
```typescript
// 行の高さを40pxから50pxに調整（2行表示を考慮）
const rowHeight = 50;
```

**GanttChart.tsx の変更**:
```typescript
// BarChartの設定を調整
barCategoryGap={8}  // 10 → 8 に縮小
barSize={24}        // 28 → 24 に縮小
```

## テスト結果

### ビルド
- ✅ TypeScriptコンパイル成功
- ✅ Viteビルド成功
- ⚠️ 警告なし

### デプロイ
- ✅ Firebase Hosting デプロイ成功
- 🔗 URL: https://compass-31e9e.web.app/

### 確認項目
- [ ] 日付ラベルが重ならずに表示される
- [ ] プロジェクト名がY軸の左側に表示される
- [ ] タスク名と担当者名が2行目に表示される
- [ ] プロジェクト行の高さが適切

## 既知の問題

### Firestoreインデックス
- ステータス: 作成済み（有効）
- インデックス数: 4個
- 問題: なし

### 認証
- Firebase CLI認証: 再認証完了
- ユーザー: s.sakuramoto@archi-prisma.co.jp

## 次のステップ

1. **本番環境での確認**
   - ブラウザで https://compass-31e9e.web.app/ を開く
   - 「工程表」タブでガントチャートを表示
   - Y軸のラベル（プロジェクト名、タスク名、担当者名）が表示されることを確認
   - 日付ラベルが重ならずに表示されることを確認

2. **追加の調整が必要な場合**
   - Y軸の幅を調整（現在: 150-300px、画面幅に応じて自動調整）
   - フォントサイズの微調整
   - 行の高さの微調整

3. **Google Cloud Source Repositoriesへの反映**
   - 修正をコミット
   - Google Cloud Source Repositoriesにプッシュ
   - GitHubにもバックアップ

## ファイル変更リスト

- `web/src/App.tsx`: tick間隔ロジック、行の高さ調整
- `web/src/components/GanttChart.tsx`: Y軸ラベル表示、バーサイズ調整

## 備考

- すべての修正は後方互換性を保っています
- 既存のデータ構造に変更はありません
- パフォーマンスへの影響は最小限です

