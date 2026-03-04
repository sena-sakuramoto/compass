# Compass 改善設計書 — 2026-02-28

## 概要

Compass の利用者フィードバックに基づく6つの改善課題を整理し、優先度と方針を決定した。

## 課題一覧と方針

### P0（実装完了） — コミット済み `b6c7146`

| # | 課題 | 方針 | 指示書 | 状態 |
|---|------|------|--------|------|
| 1 | 担当者出るまで遅い | `@tanstack/react-query` でメンバー・工程をキャッシュ。5分TTL | `CODEX_COMPASS_ASSIGNEE_CACHE.md` | **完了** |
| 2 | エラー報告機能 | アプリ内フィードバックボタン + メール送信（Sentry不使用） | `CODEX_COMPASS_ERROR_REPORTING.md` | **完了** |

### P1（次に実装） — Codex指示書作成済み

| # | 課題 | 方針 | 指示書 |
|---|------|------|--------|
| 5 | ボール管理 | タスクを「ゴール」として捉え、ballHolder/responseDeadline/ballNoteフィールド追加 + モバイルボールビュー | `CODEX_COMPASS_BALL_MANAGEMENT.md` |
| 3 | AI自動工程生成 | PJ情報からAI推論 → レビュー → 一括保存。既存bulk-import基盤を活用 | `CODEX_COMPASS_AI_STAGE_GENERATION.md` |

### P2（中期） — Codex指示書作成済み

| # | 課題 | 方針 | 指示書 |
|---|------|------|--------|
| 6 | AI課金制度 | ベース料金に含む + ティア別月間上限制御 | `CODEX_COMPASS_AI_BILLING.md` |

### P3（長期） — Codex指示書作成済み

| # | 課題 | 方針 | 指示書 |
|---|------|------|--------|
| 4 | カレンダー双方向同期 | Phase1: 時刻フィールド+Push同期。Phase2-3は将来 | `CODEX_COMPASS_CALENDAR_SYNC.md` |

## 推奨実装順序

```
#5 ボール管理 → #3 AI工程生成 → #6 AI課金 → #4 カレンダー同期
```

理由:
- #5: ユーザー体験を大きく変える機能。Senaが最も深く検討済み
- #3: 既存基盤の活用で実装コスト低い。AI機能の第一弾
- #6: #3のAI利用を前提とした課金制御。#3の後に実装すべき
- #4: 最も複雑（外部API連携）。他の機能が安定した後に取り組む

## 詳細設計

### #1 担当者キャッシュ（完了）

- **問題**: TaskModal で毎回 `listProjectMembers()` API呼び出し → 「メンバー読み込み中...」表示
- **解決**: `useQuery` でキャッシュ。2回目以降は即座に表示
- **技術**: `@tanstack/react-query` （既にインストール済み）
- **キャッシュ戦略**: staleTime 5分、gcTime 10分、refetchOnWindowFocus: false
- **無効化**: メンバー追加・削除時に `invalidateQueries`
- **成果物**: `useProjectMembers.ts`, `useStages.ts` フック

### #2 エラー報告（完了）

- **手動報告**: 画面右下にフィードバックボタン。種別選択（不具合/要望/その他）+ テキスト入力
- **送信**: バックエンドAPI → nodemailer + Gmail SMTP → compass@archi-prisma.co.jp
- **Sentry不使用**（Sena判断: 「めんどいから無しで」）
- **成果物**: `FeedbackButton.tsx`, `functions/src/api/feedback.ts`

### #3 AI自動工程生成

- PJ作成後に「AIで工程を自動生成」ボタン（BulkImportModal内）
- 入力: プロジェクトのマイルストーン日程、クライアント情報、既存工程
- AI: Gemini Flash で工程+タスクをJSON推論
- 出力: 既存のbulk-importレビュー画面 → 編集 → 一括保存
- レート制限: 既存のbulk-importと共有（10回/日/ユーザー）
- UI原則2（AI出力にアクションボタン）に準拠

### #4 カレンダー双方向同期（Phase 1のみ）

- `startTime`/`endTime`/`calendarSync` フィールドをTaskに追加
- TaskModal に時刻入力UI + カレンダー同期トグル
- Push同期: calendarSync=true のタスク保存時 → Google Calendar API でイベント作成/更新
- 時刻あり → 時刻指定イベント、時刻なし → 終日イベント
- ユーザー別OAuthトークンで同期（既存のgoogle-oauth基盤を活用）

### #5 ボール管理

**概念整理:**
- タスクを「ゴール」として捉える。ゴール = 達成すべき小さな目標
- ボール（Ball） = 「今誰がアクションすべきか」を示す動的な概念
- 担当者（Assignee） ≠ ボール保持者（Ball Holder）
- 担当者は静的な責任者、ボールは当事者間をピンポンする

**データモデル:**
- `ballHolder: string | null` — ボール保持者（null = 担当者がボール）
- `responseDeadline: string | null` — 返答期限（YYYY-MM-DD）
- `ballNote: string | null` — メモ（例: 「クライアント承認待ち」）

**UI:**
- TaskModal: ボール管理セクション（クイック選択ボタン + 自由入力）
- `/ball` ルート: モバイルボールビュー
  - 「自分ボール」「相手ボール」「すべて」フィルター
  - 期限の緊急度を色で表示（赤=超過、オレンジ=3日以内）
  - タップでTaskModal表示

### #6 AI課金制度

- **方針**: ベース料金に含む（制限付き）
- **理由**: 利用を躊躇させるとツールの価値が下がる
- **月間制限**: Small 30回, Standard 100回, Business 300回, Enterprise 無制限
- **日次制限**: 全ティア共通10回/日（既存維持）
- **カウント単位**: 組織単位（個人ではない）
- **超過時**: 「今月の利用上限に達しました」表示
- **Firestoreスキーマ**: `orgs/{orgId}/ai-usage-monthly/{YYYY-MM}`

## 決定事項

- Senaの判断: ステータス追加は不要
- Senaの判断: Sentry不使用（メール送信のみ）
- Senaの概念定義: タスクはゴールとして捉える（ボール管理文脈）
- 実装順序: #5 → #3 → #6 → #4
- 全てCodex CLI指示書で実装
