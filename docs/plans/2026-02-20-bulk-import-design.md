# 一括インポート機能 設計ドキュメント

**日付**: 2026-02-20
**ステータス**: 承認済み
**対象**: Compass（工程管理SaaS）

---

## 概要

文章・Excel・PDF・画像からAIで工程・タスク・打合せ・マイルストーンを自動抽出し、レビューテーブルで確認・修正した上で一括追加する機能。

## 要件

- **入力元**: Excel/CSV、テキスト貼り付け、PDF/画像（段階的実装）
- **AI解析**: ローカルLLM（WebGPU）/ Gemini Flash / Claude Sonnet の3段階選択制
- **ローカルLLM**: ユーザーがモデルサイズを選択可能（軽量1B / 標準3B / 高精度7B）
- **レビューUI**: テーブル一覧型。インライン編集で種別・担当者・日付等を修正
- **階層推定**: AIが工程→タスクの親子関係を自動推定。レビューで修正可能
- **プロジェクト紐付け**: インポート前に対象プロジェクトを事前選択
- **配置**: ツールバーの「一括インポート」ボタン

## アーキテクチャ: フロントエンド完結型 + バッチ保存API

### 全体フロー

```
入力 → 前処理 → AI解析 → レビューテーブル → 一括保存
```

1. ユーザーがファイルアップロード or テキスト貼り付け
2. Excel/CSVはブラウザ内のxlsxライブラリでテキスト化
3. テキスト/PDF/画像はFirebase Functionの `/api/bulk-import/parse` に送信
4. Functions側でAI（選択モデル）を呼び、構造化JSONを返す
5. ローカルLLM選択時はブラウザ内でTransformers.js v4 + WebGPUで処理
6. フロントエンドでレビューテーブル表示
7. 確定ボタンで `/api/bulk-import/save` にバッチ保存

## 入力UI

モーダル形式。3つのタブ（Excel/CSV、テキスト、PDF/画像）を切り替え。

- 対象プロジェクト: ドロップダウンで事前選択
- AIモデル選択: ローカル（サイズ選択付き）/ Flash / Sonnet
- ローカル選択時はWebGPU対応チェック、非対応ならグレーアウト

## レビューテーブル

### 列構成
| 列 | 型 | 編集方法 |
|---|---|---|
| チェックボックス | boolean | クリック |
| タスク名 | string | インライン編集 |
| 種別 | enum | ドロップダウン（工程/タスク/打合せ/マイルストーン） |
| 親工程 | ref | ドロップダウン（既存工程 + 今回追加工程） |
| 担当者 | string | ドロップダウン（プロジェクトメンバー） |
| 開始日 | date | カレンダーピッカー |
| 期限 | date | カレンダーピッカー |

### 操作
- 全選択/選択解除ボタン
- 不要な行はチェックを外して除外
- 警告アイコン: 担当者未設定、日付不正、親工程未割当を表示
- 行ドラッグで並び順変更
- 「全部確定」ボタンで一括保存
- 「やり直す」で入力画面に戻る

## API設計

### POST /api/bulk-import/parse

AI解析エンドポイント。

```typescript
// Request
{
  text: string;
  model: 'flash' | 'sonnet';
  projectId: string;
  inputType: 'excel' | 'text' | 'pdf' | 'image';
}

// Response
{
  items: ParsedItem[];
  warnings: string[];
}

interface ParsedItem {
  tempId: string;
  name: string;
  type: 'stage' | 'task' | 'meeting' | 'milestone';
  parentTempId?: string;
  assignee?: string;
  startDate?: string;  // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD
  confidence: number;  // 0-1
}
```

### POST /api/bulk-import/save

一括保存エンドポイント。Firestore batch writeで原子的に保存。

```typescript
// Request
{
  projectId: string;
  items: ConfirmedItem[];
}

interface ConfirmedItem {
  name: string;
  type: 'stage' | 'task' | 'meeting' | 'milestone';
  parentTempId?: string;
  assignee?: string;
  assigneeEmail?: string;
  startDate?: string;
  endDate?: string;
  orderIndex: number;
}

// Response
{
  created: { stages: number; tasks: number; meetings: number; milestones: number };
  stageIdMap: Record<string, string>;
}
```

## AIプロンプト設計

```
あなたは建築プロジェクトの工程表を解析するアシスタントです。
入力テキストから工程（Stage）、タスク、打合せ、マイルストーンを抽出してください。

分類ルール:
- 工程(stage): 大きなフェーズ（基本設計、実施設計、施工、etc.）
- タスク(task): 具体的な作業（図面作成、申請書作成、etc.）
- 打合せ(meeting): 打合せ、会議、確認会、etc.
- マイルストーン(milestone): 着工、竣工、引渡し、検査 等の1日イベント

階層ルール:
- 工程の下にタスクや打合せがぶら下がる
- インデント、番号体系、文脈から親子関係を推定

出力: JSON配列で返してください。
```

## ローカルLLM仕様

- **技術**: Transformers.js v4 + ONNX Runtime Web + WebGPU
- **モデルサイズ選択**:
  - 軽量(1B): SmolLM2-1.7B相当。~800MB DL。低スペックPCでも動作
  - 標準(3B): Qwen2.5-3B or Phi-3-mini。~2GB DL。バランス型
  - 高精度(7B): Qwen2.5-7B相当。~4GB DL。GPU 8GB+推奨
- **WebGPU非対応時**: 選択肢をグレーアウトし「お使いのブラウザではローカルAIを利用できません」表示
- **初回ダウンロード**: プログレスバー表示、以降はブラウザキャッシュ
- **表記**: 「ベータ」ラベル付き

## 実装優先度

1. **Phase 1**: テキスト貼り付け + Gemini Flash + レビューテーブル + バッチ保存API
2. **Phase 2**: Excel/CSVアップロード対応
3. **Phase 3**: ローカルLLM（WebGPU）対応
4. **Phase 4**: PDF/画像アップロード対応（Vision API）
5. **Phase 5**: Claude Sonnet対応

## UI設計原則への準拠

- 原則1: 種別・担当者・親工程は全てドロップダウン選択（自由入力ではない）
- 原則2: AI出力に「確定」「編集」「スキップ」のアクションボタン
- 原則6: 最短で工程追加して出番を終える
- 原則7: 派手より「楽」。テーブルのインライン編集で認知負荷を下げる
- 原則10: AIの推定結果をデフォルト値として最適化
- 原則12: 解析→表示の速度にこだわる
