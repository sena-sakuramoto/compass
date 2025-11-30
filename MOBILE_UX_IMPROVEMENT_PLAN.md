# スマホUX改善計画

## 現状の問題点

### 1. レイアウト・デザイン
- ❌ **ダッシュボードがスマホで見づらい**
  - プロジェクトカードが小さすぎる
  - 横幅が固定でスクロールが多い
  - 統計情報が詰め込まれすぎて見にくい

- ❌ **編集ダイアログが大きすぎる**
  - 画面全体を覆ってしまう
  - スクロールが必要すぎて使いにくい
  - 入力フィールドが小さい

- ❌ **ガントチャートがスマホで使えない**
  - 横スクロールと縦スクロールの両方が必要
  - タスクバーが小さくてタップできない
  - 日付軸が見にくい

### 2. ナビゲーション
- ❌ **サイドバーがスマホで邪魔**
  - 常時表示で画面を圧迫
  - メニューの開閉が分かりにくい

- ❌ **戻るボタンがない**
  - 詳細画面から戻る方法が分かりにくい
  - ESCキーだけでは不十分

### 3. タッチ操作
- ❌ **タップターゲットが小さい**
  - ボタンが小さくて押しにくい
  - チェックボックスが小さい
  - ドロップダウンが選びにくい

- ❌ **スワイプ操作が未実装**
  - タスク完了のスワイプ操作がない
  - カードのスワイプ削除がない

### 4. 入力
- ❌ **日付入力が使いにくい**
  - カレンダーピッカーがスマホ最適化されていない
  - キーボード入力が難しい

- ❌ **フォームが長すぎる**
  - 一画面で完結しない
  - 必須・任意が分かりにくい

## 改善案

### Phase 1: 緊急対応（即座に実装）

#### 1.1 レスポンシブブレークポイントの最適化
```css
/* 現状 */
md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6

/* 改善案 */
/* スマホ: 1列 */
/* タブレット: 2列 */
/* PC: 3-4列 */
grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
```

#### 1.2 モバイル専用ナビゲーション
- **ハンバーガーメニュー**（sm以下）
  - サイドバーを非表示
  - 右上にハンバーガーアイコン
  - タップでスライドメニュー表示

- **ボトムナビゲーション**
  - 主要4機能へのクイックアクセス
  - ダッシュボード / プロジェクト / タスク / 設定

#### 1.3 タップターゲットの拡大
```css
/* 最小タップサイズ: 44x44px (Apple推奨) */
min-height: 44px;
min-width: 44px;
padding: 12px; /* 余白を増やす */
```

#### 1.4 編集ダイアログのフルスクリーン化
- スマホでは全画面表示
- ヘッダーに「戻る」「保存」ボタン
- セクションごとにアコーディオン展開

### Phase 2: 中期対応（1-2週間）

#### 2.1 モバイル専用コンポーネント
- **モバイルプロジェクトカード**
  - 縦長デザイン
  - タップで展開
  - 重要情報のみ表示

- **モバイルタスクリスト**
  - シンプルなリストビュー
  - スワイプで完了/削除
  - タップで詳細

- **モバイルガントチャート**
  - タイムライン表示（縦スクロールのみ）
  - 週表示 / 月表示切り替え
  - タスクバーを大きく

#### 2.2 入力の最適化
- **日付入力**
  - ネイティブの `<input type="date">` を使用
  - iOS/Androidの標準ピッカーを活用

- **セレクト**
  - ネイティブの `<select>` を使用
  - カスタムドロップダウンを避ける

- **数値入力**
  - `<input type="number">` を使用
  - 数字キーボードを自動表示

#### 2.3 タッチジェスチャー
- **スワイプアクション**
  - 右スワイプ: タスク完了
  - 左スワイプ: 削除
  - 長押し: メニュー表示

- **プルトゥリフレッシュ**
  - 下に引っ張って更新

#### 2.4 パフォーマンス最適化
- **仮想スクロール**
  - 大量データでもスムーズ
  - `react-window` 導入

- **画像遅延読み込み**
  - `loading="lazy"` 属性

- **コード分割**
  - ルート単位での分割
  - 初期読み込みを高速化

### Phase 3: 長期対応（1ヶ月以内）

#### 3.1 PWA対応
- **Service Worker**
  - オフライン対応
  - キャッシュ戦略

- **App Manifest**
  - ホーム画面に追加
  - スプラッシュスクリーン

- **プッシュ通知**
  - タスク期限通知
  - プロジェクト更新通知

#### 3.2 ダークモード
- システム設定に追従
- 手動切り替え可能

#### 3.3 オフライン対応
- IndexedDB でローカルストレージ
- オフライン時の操作をキュー
- オンライン復帰時に同期

## 実装優先順位

### 🔴 最優先（今日中）
1. ハンバーガーメニュー実装
2. タップターゲット拡大
3. 編集ダイアログのモバイル最適化
4. プロジェクトカードのグリッド調整

### 🟡 優先（今週中）
1. ボトムナビゲーション
2. モバイル専用タスクリスト
3. 日付入力の最適化
4. スワイプアクション

### 🟢 通常（来週以降）
1. モバイルガントチャート
2. 仮想スクロール
3. PWA対応
4. ダークモード

## 具体的な実装手順

### Step 1: ハンバーガーメニュー
```tsx
// components/MobileHeader.tsx
export function MobileHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b">
      <div className="flex items-center justify-between p-4">
        <h1 className="text-xl font-bold">Compass</h1>
        <button onClick={() => setMenuOpen(!menuOpen)} className="p-2">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setMenuOpen(false)}>
          <div className="fixed right-0 top-0 bottom-0 w-64 bg-white">
            {/* メニュー内容 */}
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 2: ボトムナビゲーション
```tsx
// components/BottomNav.tsx
export function BottomNav() {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t z-50">
      <div className="flex justify-around py-2">
        <NavButton icon={Home} label="ホーム" />
        <NavButton icon={Briefcase} label="プロジェクト" />
        <NavButton icon={CheckSquare} label="タスク" />
        <NavButton icon={Settings} label="設定" />
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <button className="flex flex-col items-center gap-1 px-4 py-2 min-w-[44px] min-h-[44px]">
      <Icon className="w-6 h-6" />
      <span className="text-xs">{label}</span>
    </button>
  );
}
```

### Step 3: フルスクリーン編集ダイアログ
```tsx
// components/MobileEditDialog.tsx
export function MobileEditDialog({ onClose, onSave }) {
  return (
    <div className="lg:hidden fixed inset-0 bg-white z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b">
        <button onClick={onClose} className="p-2">
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-lg font-bold">プロジェクト編集</h2>
        <button onClick={onSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg">
          保存
        </button>
      </div>

      {/* コンテンツ（スクロール可能） */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* フォームフィールド */}
      </div>
    </div>
  );
}
```

## 測定指標

### パフォーマンス
- First Contentful Paint (FCP) < 1.8s
- Largest Contentful Paint (LCP) < 2.5s
- Time to Interactive (TTI) < 3.8s

### UX
- タップ成功率 > 95%
- スクロール応答時間 < 100ms
- ページ遷移時間 < 300ms

## まとめ

最優先で以下を実装：
1. ✅ ハンバーガーメニュー
2. ✅ タップターゲット拡大
3. ✅ 編集ダイアログのフルスクリーン化
4. ✅ グリッドレイアウト最適化

これらを実装するだけで、スマホUXは大幅に改善されます。
