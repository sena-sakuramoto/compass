# Compass 現状整理（2025年11月30日時点）

## 実装済み機能

### コア機能
- ✅ プロジェクト管理（CRUD）
- ✅ タスク管理（CRUD）
- ✅ 人員管理（CRUD）
- ✅ クライアント管理（CRUD）
- ✅ マルチテナント対応（組織・プロジェクト単位のアクセス制御）
- ✅ プロジェクトメンバー管理（owner/manager/member/viewer）
- ✅ 招待システム（メールベース）

### プロジェクト機能
- ✅ 基本情報（物件名、クライアント、ステータス、優先度）
- ✅ 日程管理（開始日、予定完了日、現地調査日、着工日、竣工予定日、引渡し予定日）
- ✅ 施工費管理
- ✅ メンバー管理（営業、PM、設計、施工管理の割り当て）
- ✅ フォルダURL管理
- ✅ 所在地管理（Google Maps連携対応）
- ✅ 進捗集計（タスク進捗の自動集計）

### タスク機能
- ✅ 基本情報（タスク名、種別、担当者、優先度、ステータス）
- ✅ 日程管理（予定開始日、期限、実績開始日、実績完了日）
- ✅ 工数管理（見積・実績）
- ✅ 進捗率計算
- ✅ スプリント・フェーズ管理
- ✅ 依存タスク設定
- ✅ マイルストーン設定
- ✅ カレンダー連携準備

### UI/表示機能
- ✅ ダッシュボード（プロジェクト一覧、統計表示）
- ✅ プロジェクトカード（進捗、メンバー、施工費表示）
- ✅ ガントチャート（タスク表示、マイルストーン表示）
- ✅ タスクテーブル
- ✅ フィルタ・検索機能
- ✅ アクティビティログ

### インテグレーション
- ✅ Google Maps API（住所自動補完）
- ✅ Google Drive API（フォルダピッカー）
- ✅ Firebase Authentication
- ✅ Cloud Firestore
- ✅ Firebase Functions

### 最近の修正（本日）
- ✅ 施工費フィールドのバックエンド対応
- ✅ スプリント・フェーズフィールドのバックエンド対応
- ✅ クライアント作成UI修正
- ✅ メンバー削除時のクラッシュ修正
- ✅ ESCキーでダイアログを閉じる機能
- ✅ 404エラーのログレベル調整
- ✅ ガントチャートのマイルストーン位置調整
- ✅ 施工費入力フォーマット改善

## 未実装機能

### 通知機能（一部実装済み、未完成）
- ⚠️ Gmail API連携（設定は存在するが未テスト）
- ⚠️ タスク通知（期限前日、当日、超過）
- ⚠️ リマインダー機能

### Excel連携
- ❌ Excelインポート
- ❌ Excelエクスポート

### カレンダー連携
- ⚠️ Google Calendar同期（準備済み、未実装）

### レポート機能
- ❌ 進捗レポート
- ❌ 担当者別ワークロード
- ❌ カンバンボード

## アーキテクチャ

### フロントエンド
```
web/
├── src/
│   ├── components/
│   │   ├── GanttChart/         # ガントチャート
│   │   ├── ProjectCard.tsx     # プロジェクトカード
│   │   ├── ProjectEditDialog.tsx # プロジェクト編集
│   │   ├── TaskCard.tsx        # タスクカード
│   │   ├── TaskTable.tsx       # タスクテーブル
│   │   ├── ClientSelector.tsx  # クライアント選択
│   │   ├── GoogleMapsAddressInput.tsx # 住所入力
│   │   └── GoogleDriveFolderPicker.tsx # フォルダ選択
│   ├── lib/
│   │   ├── api.ts              # API通信
│   │   ├── auth-types.ts       # 認証型定義
│   │   ├── types.ts            # データ型定義
│   │   └── normalize.ts        # データ正規化
│   └── App.tsx                 # メインアプリ
```

### バックエンド
```
functions/
├── src/
│   ├── api/
│   │   ├── projects.ts         # プロジェクトAPI
│   │   ├── tasks.ts            # タスクAPI
│   │   ├── people.ts           # 人員API
│   │   ├── clients-api.ts      # クライアントAPI
│   │   ├── project-members-api.ts # メンバーAPI
│   │   ├── users-api.ts        # ユーザーAPI
│   │   ├── invitations.ts      # 招待API
│   │   └── activity-logs.ts    # アクティビティログAPI
│   ├── lib/
│   │   ├── firestore.ts        # Firestore操作
│   │   ├── auth.ts             # 認証ミドルウェア
│   │   ├── roles.ts            # ロール管理
│   │   └── project-members.ts  # メンバー管理
│   └── index.ts                # エントリーポイント
```

### データベーススキーマ
```
orgs/
  {orgId}/
    projects/
      {projectId}/
        - 物件名、ステータス、優先度
        - 日程情報
        - 施工費
        - createdAt, updatedAt

    project_members/
      {memberId}/
        - projectId, userId, role, 職種
        - status (active/inactive)

    tasks/
      {taskId}/
        - タスク名、ステータス、担当者
        - 日程、工数
        - スプリント、フェーズ
        - progress

    clients/
      {clientId}/
        - name
        - createdAt, createdBy

    people/
      {personId}/
        - 氏名、役割、メール

users/
  {userId}/
    - email, displayName
    - orgId, role
    - organizations (複数組織対応)
```

## 技術スタック

### バックエンド
- Firebase Functions (Node.js 20, 2nd Gen)
- Express.js
- TypeScript
- Zod (バリデーション)
- Firebase Admin SDK

### フロントエンド
- React 18
- TypeScript
- Vite
- TailwindCSS
- Lucide Icons
- date-fns
- Recharts

### インフラ
- Cloud Firestore
- Firebase Authentication
- Firebase Hosting
- Cloud Scheduler
- Google Maps API
- Google Drive API

## 現在の課題

### スマホ対応
- ❌ レスポンシブデザインが不十分
- ❌ タッチ操作の最適化が未実装
- ❌ モバイル専用UIが存在しない
- ❌ ガントチャートがスマホで使いにくい
- ❌ 編集ダイアログがスマホで大きすぎる

### パフォーマンス
- ⚠️ 大量データ時のパフォーマンス未検証
- ⚠️ 画像最適化未実装

### UX
- ⚠️ オフライン対応なし
- ⚠️ PWA未対応
- ⚠️ 通知機能が未完成

## 次のステップ

### 優先度: 高
1. スマホUXの大幅改善
2. レスポンシブデザインの全面的な見直し
3. タッチ操作の最適化

### 優先度: 中
1. 通知機能の完成
2. Excel連携の実装
3. PWA対応

### 優先度: 低
1. レポート機能
2. カンバンボード
3. パフォーマンス最適化
