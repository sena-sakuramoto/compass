# 一括インポート機能 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 文章・Excel・PDF・画像からAIで工程/タスク/打合せを自動抽出し、レビューテーブルで確認・修正して一括追加する。

**Architecture:** フロントエンド完結型。入力→前処理→AI解析→レビューテーブル→バッチ保存API。Excel/CSVはブラウザ内xlsxでテキスト化、AI解析はFirebase Functions経由（Gemini Flash/Claude Sonnet）またはブラウザ内ローカルLLM（Transformers.js v4 + WebGPU）。レビューテーブルはインライン編集可能なテーブルUI。

**Tech Stack:** React + TypeScript + Tailwind CSS, Firebase Functions (Express), Gemini API, Anthropic API, Transformers.js v4, xlsx library

**Design Doc:** `docs/plans/2026-02-20-bulk-import-design.md`

---

## Phase 1: テキスト入力 + Gemini Flash + レビューテーブル + バッチ保存

### Task 1: バックエンド — bulk-import ルーター骨格

**Files:**
- Create: `functions/src/api/bulk-import.ts`
- Modify: `functions/src/index.ts:1-38` (import追加), `functions/src/index.ts:87-112` (route登録)

**Step 1: ルーターファイル作成**

`functions/src/api/bulk-import.ts` を作成。authMiddleware付きのExpressルーター。2つのエンドポイント骨格:

```typescript
import { Router } from 'express';
import { authMiddleware } from '../lib/auth';

const router = Router();
router.use(authMiddleware);

// POST /bulk-import/parse — AI解析
router.post('/bulk-import/parse', async (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

// POST /bulk-import/save — 一括保存
router.post('/bulk-import/save', async (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
```

**Step 2: index.tsにルーター登録**

`functions/src/index.ts` の import群（line ~34付近）に追加:
```typescript
import bulkImportRouter from './api/bulk-import';
```

route登録（line ~112付近、`app.use('/api', billingRouter);` の後）に追加:
```typescript
app.use('/api', bulkImportRouter);
```

**Step 3: ビルド確認**

Run: `cd functions && npm run build`
Expected: ビルド成功

**Step 4: コミット**

```bash
git add functions/src/api/bulk-import.ts functions/src/index.ts
git commit -m "feat(api): add bulk-import router skeleton"
```

---

### Task 2: バックエンド — /parse エンドポイント実装（Gemini Flash）

**Files:**
- Modify: `functions/src/api/bulk-import.ts`
- Modify: `functions/package.json` (Gemini SDK追加が必要な場合)

**前提知識:**
- Gemini API はすでに `@google/generative-ai` パッケージで利用可能かを確認。なければ `npm install @google/generative-ai`
- APIキーは Firebase Functions の環境変数/Secrets で管理: `GEMINI_API_KEY`
- 既存の googleapis 依存あり (`functions/package.json`)

**Step 1: Gemini SDK依存を確認・追加**

Run: `cd functions && cat package.json | grep generative`
- あれば次へ。なければ: `npm install @google/generative-ai`

**Step 2: /parse エンドポイント実装**

`functions/src/api/bulk-import.ts` の `/bulk-import/parse` ハンドラを実装:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import crypto from 'crypto';

const parseRequestSchema = z.object({
  text: z.string().min(1).max(50000),
  model: z.enum(['flash', 'sonnet']),
  projectId: z.string().min(1),
  inputType: z.enum(['excel', 'text', 'pdf', 'image']),
});

const SYSTEM_PROMPT = `あなたは建築プロジェクトの工程表を解析するアシスタントです。
入力テキストから工程（Stage）、タスク、打合せ、マイルストーンを抽出してください。

分類ルール:
- stage: 大きなフェーズ（基本設計、実施設計、施工 等）
- task: 具体的な作業（図面作成、申請書作成 等）
- meeting: 打合せ、会議、確認会 等
- milestone: 着工、竣工、引渡し、検査 等の1日イベント

階層ルール:
- 工程(stage)の下にタスクや打合せがぶら下がる
- インデント、番号体系、文脈から親子関係を推定
- 親のないタスクはparentTempIdをnullにする

出力は以下のJSON形式のみ返してください（説明文不要）:
{
  "items": [
    {
      "tempId": "tmp_1",
      "name": "タスク名",
      "type": "stage|task|meeting|milestone",
      "parentTempId": null または親のtempId,
      "assignee": "担当者名" または null,
      "startDate": "YYYY-MM-DD" または null,
      "endDate": "YYYY-MM-DD" または null,
      "confidence": 0.0〜1.0
    }
  ],
  "warnings": ["注意点があれば記載"]
}`;

router.post('/bulk-import/parse', async (req, res) => {
  try {
    const parsed = parseRequestSchema.parse(req.body);

    if (parsed.model === 'sonnet') {
      return res.status(400).json({ error: 'Sonnet is not yet supported' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const result = await model.generateContent([
      { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n--- 入力データ ---\n' + parsed.text }] },
    ]);

    const responseText = result.response.text();
    const data = JSON.parse(responseText);

    // tempIdが無い場合は生成
    if (data.items) {
      for (const item of data.items) {
        if (!item.tempId) {
          item.tempId = 'tmp_' + crypto.randomUUID().slice(0, 8);
        }
      }
    }

    res.json({
      items: data.items || [],
      warnings: data.warnings || [],
    });
  } catch (err: any) {
    console.error('[bulk-import/parse]', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.errors });
    }
    res.status(500).json({ error: err.message || 'Parse failed' });
  }
});
```

**Step 3: ビルド確認**

Run: `cd functions && npm run build`
Expected: ビルド成功

**Step 4: コミット**

```bash
git add functions/src/api/bulk-import.ts functions/package.json functions/package-lock.json
git commit -m "feat(api): implement /bulk-import/parse with Gemini Flash"
```

---

### Task 3: バックエンド — /save エンドポイント実装

**Files:**
- Modify: `functions/src/api/bulk-import.ts`

**前提知識:**
- 既存の `firestore.ts` には `createTask()` と `createStage()` がある
- Firestore batch write は最大500件/バッチ
- Stage は `type: 'stage'`, `parentId: null` の Task レコード
- Task は `parentId` で親 Stage を参照
- `getNextTaskId()` で連番IDを生成（`functions/src/lib/firestore.ts` 参照）
- orgId は `req.orgId` から取得（authMiddleware が設定）

**Step 1: /save エンドポイント実装**

```typescript
import { db, getNextTaskId } from '../lib/firestore';
import { FieldValue } from 'firebase-admin/firestore';

const saveRequestSchema = z.object({
  projectId: z.string().min(1),
  items: z.array(z.object({
    tempId: z.string(),
    name: z.string().min(1),
    type: z.enum(['stage', 'task', 'meeting', 'milestone']),
    parentTempId: z.string().nullable().optional(),
    assignee: z.string().nullable().optional(),
    assigneeEmail: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    orderIndex: z.number(),
  })),
});

router.post('/bulk-import/save', async (req, res) => {
  try {
    const { projectId, items } = saveRequestSchema.parse(req.body);
    const orgId = (req as any).orgId;
    if (!orgId) return res.status(403).json({ error: 'No org' });

    const tasksCol = db.collection('orgs').doc(orgId).collection('tasks');

    // Phase 1: Stage を先に作成して tempId → 実IDマッピングを構築
    const stageIdMap: Record<string, string> = {};
    const stages = items.filter(i => i.type === 'stage');
    const nonStages = items.filter(i => i.type !== 'stage');

    const counts = { stages: 0, tasks: 0, meetings: 0, milestones: 0 };

    // Stages を batch write
    if (stages.length > 0) {
      const batch = db.batch();
      for (const stage of stages) {
        const taskId = await getNextTaskId(orgId);
        const docRef = tasksCol.doc(taskId);
        stageIdMap[stage.tempId] = taskId;

        batch.set(docRef, {
          projectId,
          タスク名: stage.name,
          type: 'stage',
          parentId: null,
          orderIndex: stage.orderIndex,
          ステータス: '未着手',
          予定開始日: stage.startDate || null,
          期限: stage.endDate || null,
          担当者: stage.assignee || null,
          orgId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        counts.stages++;
      }
      await batch.commit();
    }

    // Phase 2: Tasks/Meetings/Milestones を batch write
    if (nonStages.length > 0) {
      // Firestore batch は 500件制限があるので分割
      const BATCH_SIZE = 400;
      for (let i = 0; i < nonStages.length; i += BATCH_SIZE) {
        const chunk = nonStages.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const item of chunk) {
          const taskId = await getNextTaskId(orgId);
          const docRef = tasksCol.doc(taskId);

          const parentId = item.parentTempId ? (stageIdMap[item.parentTempId] || null) : null;

          const isMilestone = item.type === 'milestone';
          const taskType = item.type === 'meeting' ? 'task' : (item.type === 'milestone' ? 'task' : 'task');

          batch.set(docRef, {
            projectId,
            タスク名: item.name,
            type: taskType,
            parentId,
            orderIndex: item.orderIndex,
            ステータス: '未着手',
            予定開始日: item.startDate || null,
            期限: item.endDate || (isMilestone ? item.startDate : null),
            担当者: item.assignee || null,
            担当者メール: item.assigneeEmail || null,
            マイルストーン: isMilestone || null,
            participants: item.type === 'meeting' ? [] : null,
            orgId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          if (item.type === 'meeting') counts.meetings++;
          else if (item.type === 'milestone') counts.milestones++;
          else counts.tasks++;
        }
        await batch.commit();
      }
    }

    res.json({ created: counts, stageIdMap });
  } catch (err: any) {
    console.error('[bulk-import/save]', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.errors });
    }
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});
```

**Step 2: ビルド確認**

Run: `cd functions && npm run build`
Expected: ビルド成功

**Step 3: コミット**

```bash
git add functions/src/api/bulk-import.ts
git commit -m "feat(api): implement /bulk-import/save with batch write"
```

---

### Task 4: フロントエンド — API関数追加

**Files:**
- Modify: `web/src/lib/api.ts` (末尾に追加)
- Modify: `web/src/lib/types.ts` (型追加)

**Step 1: 型定義追加**

`web/src/lib/types.ts` の末尾に追加:

```typescript
// ── Bulk Import ──
export interface ParsedItem {
  tempId: string;
  name: string;
  type: 'stage' | 'task' | 'meeting' | 'milestone';
  parentTempId?: string | null;
  assignee?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  confidence: number;
}

export interface BulkImportParseResponse {
  items: ParsedItem[];
  warnings: string[];
}

export interface ConfirmedItem {
  tempId: string;
  name: string;
  type: 'stage' | 'task' | 'meeting' | 'milestone';
  parentTempId?: string | null;
  assignee?: string | null;
  assigneeEmail?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  orderIndex: number;
}

export interface BulkImportSaveResponse {
  created: { stages: number; tasks: number; meetings: number; milestones: number };
  stageIdMap: Record<string, string>;
}
```

**Step 2: API関数追加**

`web/src/lib/api.ts` の末尾に追加:

```typescript
// ── Bulk Import ──
export async function bulkImportParse(payload: {
  text: string;
  model: 'flash' | 'sonnet';
  projectId: string;
  inputType: 'excel' | 'text' | 'pdf' | 'image';
}): Promise<BulkImportParseResponse> {
  return request<BulkImportParseResponse>('/bulk-import/parse', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function bulkImportSave(payload: {
  projectId: string;
  items: ConfirmedItem[];
}): Promise<BulkImportSaveResponse> {
  return request<BulkImportSaveResponse>('/bulk-import/save', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
```

**Step 3: 型のimport追加**

`web/src/lib/api.ts` の先頭のimport文に `ParsedItem`, `BulkImportParseResponse`, `ConfirmedItem`, `BulkImportSaveResponse` を追加。

**Step 4: ビルド確認**

Run: `cd web && npx tsc --noEmit`
Expected: エラーなし

**Step 5: コミット**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts
git commit -m "feat(web): add bulk import API functions and types"
```

---

### Task 5: フロントエンド — BulkImportModal コンポーネント（入力画面）

**Files:**
- Create: `web/src/components/BulkImportModal.tsx`

**前提知識:**
- 既存モーダルのベースコンポーネント: `web/src/components/Modals/Modal.tsx` を参照
- プロジェクト一覧は `projects` props として親から受け取る
- プロジェクトメンバーは `listStages()` のパターンで取得可能

**Step 1: BulkImportModal作成**

このコンポーネントは2つのステップを持つ:
1. **入力ステップ**: プロジェクト選択 + タブ切替（テキスト/Excel/PDF） + AIモデル選択 + 解析ボタン
2. **レビューステップ**: レビューテーブル表示（Task 6で実装）

```typescript
// web/src/components/BulkImportModal.tsx
import React, { useState, useCallback } from 'react';
import type { Project, ParsedItem } from '../lib/types';
import { bulkImportParse, bulkImportSave, listStages } from '../lib/api';
import type { ConfirmedItem, BulkImportSaveResponse } from '../lib/types';

type InputTab = 'text' | 'excel' | 'pdf';
type AIModel = 'flash' | 'sonnet' | 'local';
type Step = 'input' | 'review';

interface BulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  defaultProjectId?: string;
  onImported?: () => void; // データ更新コールバック
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  open, onOpenChange, projects, defaultProjectId, onImported,
}) => {
  const [step, setStep] = useState<Step>('input');
  const [tab, setTab] = useState<InputTab>('text');
  const [model, setModel] = useState<AIModel>('flash');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // ... 入力画面のJSXレンダリング
  // ... タブ切替（Phase 1はテキストのみ有効、Excel/PDFはグレーアウト）
  // ... プロジェクト選択ドロップダウン
  // ... AIモデル選択ラジオ（Phase 1はFlashのみ、ローカルとSonnetはグレーアウト）
  // ... テキストエリア
  // ... 「解析する」ボタン → bulkImportParse() 呼出
  // ... 解析成功時に step='review' へ遷移、parsedItems をセット
  // ... レビューステップでは ReviewTable コンポーネント（Task 6）をレンダリング
};
```

モーダルのオープン/クローズ、入力バリデーション、解析中ローディング表示、エラーハンドリングを含む。

UIはTailwindで構築。既存の `Modal.tsx` のスタイルパターンを踏襲。

**Step 2: ビルド確認**

Run: `cd web && npx tsc --noEmit`

**Step 3: コミット**

```bash
git add web/src/components/BulkImportModal.tsx
git commit -m "feat(web): add BulkImportModal input step"
```

---

### Task 6: フロントエンド — ReviewTable コンポーネント

**Files:**
- Create: `web/src/components/BulkImportReviewTable.tsx`

**前提知識:**
- テーブルの各セルはインライン編集可能
- 種別: ドロップダウン（工程/タスク/打合せ/マイルストーン）
- 親工程: ドロップダウン（items内のstage + 「なし」選択肢）
- 担当者: ドロップダウン（プロジェクトメンバーから選択）
- 日付: `<input type="date" />`
- チェックボックス: 個別選択/全選択
- 警告: 担当者未設定や日付未設定を⚠表示
- 「確定」ボタンで `bulkImportSave()` 呼出

**Step 1: ReviewTable作成**

```typescript
interface ReviewTableProps {
  items: ParsedItem[];
  warnings: string[];
  projectId: string;
  members: string[]; // プロジェクトメンバー名一覧
  onSaved: (result: BulkImportSaveResponse) => void;
  onBack: () => void; // 入力画面に戻る
}
```

主な機能:
- `items` を `editableItems` ローカルstateにコピーして編集可能にする
- チェックボックスで選択/全選択/全解除
- 各セルをクリック → ドロップダウンor入力フィールドに切替
- 種別変更: `type` フィールドを更新。stageに変更した場合、他のアイテムの `parentTempId` 候補に追加
- 親工程変更: `parentTempId` を更新
- confidence < 0.7 のアイテムには⚠アイコン表示
- 「確定」ボタン → チェック済みのアイテムだけ `bulkImportSave()` に送信
- 保存中はローディング表示
- 保存成功でモーダルを閉じ、`onSaved()` コールバック

**Step 2: ビルド確認**

Run: `cd web && npx tsc --noEmit`

**Step 3: コミット**

```bash
git add web/src/components/BulkImportReviewTable.tsx
git commit -m "feat(web): add BulkImportReviewTable with inline editing"
```

---

### Task 7: フロントエンド — GanttToolbar にボタン追加 + App.tsx 統合

**Files:**
- Modify: `web/src/components/GanttChart/GanttToolbar.tsx:6-13` (props追加), `web/src/components/GanttChart/GanttToolbar.tsx:60-75` (ボタン追加)
- Modify: `web/src/App.tsx` (BulkImportModal state追加 + レンダリング)

**Step 1: GanttToolbar にコールバック追加**

`GanttToolbarProps` に `onBulkImport?: () => void` を追加:

```typescript
interface GanttToolbarProps {
  // ... existing props
  onBulkImport?: () => void;
}
```

ツールバー内、「今日」ボタンのdivの後（line 59の後）に新しいセクションを追加:

```tsx
{onBulkImport && (
  <div className="flex items-center gap-1 border-l border-slate-100 pl-1">
    <button
      onClick={onBulkImport}
      className="px-2 py-1 rounded-full text-slate-600 hover:bg-slate-100"
      title="一括インポート"
    >
      一括
    </button>
  </div>
)}
```

**Step 2: App.tsx に BulkImportModal を統合**

`App.tsx` のモーダル state群（`taskModalOpen` 等の近く）に追加:

```typescript
const [bulkImportOpen, setBulkImportOpen] = useState(false);
```

モーダルレンダリング部（`<TaskModal />` 等の近く）に追加:

```tsx
<BulkImportModal
  open={bulkImportOpen}
  onOpenChange={setBulkImportOpen}
  projects={state.projects}
  onImported={reloadTasks}
/>
```

GanttChart コンポーネントに `onBulkImport` props を渡す:
```tsx
<GanttToolbar onBulkImport={() => setBulkImportOpen(true)} />
```

**注意:** App.tsx は6400行超の巨大ファイル。GanttToolbar がどこで使われているかを `grep` で確認し、正確な箇所に `onBulkImport` を渡す。GanttChart コンポーネント内で GanttToolbar を使っている場合は、GanttChart の props 経由でコールバックを渡す必要がある。

**Step 3: ビルド確認**

Run: `cd web && npx tsc --noEmit`

**Step 4: 動作確認**

Run: `cd web && npm run dev`
- ガントチャートのツールバーに「一括」ボタンが表示される
- クリックでモーダルが開く
- テキストを入力して「解析する」を押すとAI解析が走る
- 結果がレビューテーブルに表示される
- 「確定」で保存される

**Step 5: コミット**

```bash
git add web/src/components/GanttChart/GanttToolbar.tsx web/src/App.tsx web/src/components/BulkImportModal.tsx
git commit -m "feat(web): integrate BulkImportModal with GanttToolbar"
```

---

## Phase 2: Excel/CSV アップロード対応

### Task 8: フロントエンド — Excel/CSV パース（ブラウザ内）

**Files:**
- Modify: `web/src/components/BulkImportModal.tsx` (Excelタブ有効化)

**前提知識:**
- xlsx ライブラリは既に `web/package.json` にあるか確認。なければ `pnpm add xlsx`
- 既存の `ExcelImportExport.tsx` のファイルアップロードパターンを参考にする

**Step 1: Excelタブの実装**

- ファイルドロップ or ファイル選択UIを追加
- `xlsx.read()` でExcelを読み込み
- 各シートの内容をテキスト化（セル値を行/列で結合）
- テキスト化した結果を AI解析APIに送信（既存の `/parse` を使う）
- CSVも同じフローで処理（xlsxライブラリはCSVも読める）

**Step 2: ビルド確認 + 動作確認**

**Step 3: コミット**

```bash
git commit -m "feat(web): add Excel/CSV upload and parsing to bulk import"
```

---

## Phase 3: ローカルLLM（WebGPU）対応

### Task 9: フロントエンド — WebGPU対応チェック + Transformers.js統合

**Files:**
- Create: `web/src/lib/localLLM.ts` (ローカルLLMヘルパー)
- Modify: `web/src/components/BulkImportModal.tsx` (ローカルタブ有効化)
- Modify: `web/package.json` (`@huggingface/transformers` 追加)

**前提知識:**
- Transformers.js v4: `pnpm add @huggingface/transformers`
- WebGPU対応チェック: `navigator.gpu !== undefined`
- モデルサイズ3段階: 軽量(1B), 標準(3B), 高精度(7B)
- 初回ダウンロードにプログレスバーが必要
- モデルは `pipeline('text-generation', modelId, { device: 'webgpu' })` で初期化

**Step 1: localLLM.ts ヘルパー作成**

```typescript
// web/src/lib/localLLM.ts
export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export type LocalModelSize = 'small' | 'medium' | 'large';

export const MODEL_CONFIG: Record<LocalModelSize, { id: string; label: string; sizeLabel: string }> = {
  small:  { id: 'onnx-community/SmolLM2-1.7B-Instruct', label: '軽量 (1B)', sizeLabel: '~800MB' },
  medium: { id: 'onnx-community/Qwen2.5-3B-Instruct',   label: '標準 (3B)', sizeLabel: '~2GB' },
  large:  { id: 'onnx-community/Qwen2.5-7B-Instruct',   label: '高精度 (7B)', sizeLabel: '~4GB' },
};

// pipeline初期化 + テキスト生成 + JSON解析
// プログレスコールバック対応
export async function parseWithLocalLLM(
  text: string,
  modelSize: LocalModelSize,
  onProgress?: (progress: number) => void,
): Promise<{ items: ParsedItem[]; warnings: string[] }> {
  // Transformers.js dynamic import
  const { pipeline } = await import('@huggingface/transformers');
  const config = MODEL_CONFIG[modelSize];

  const generator = await pipeline('text-generation', config.id, {
    device: 'webgpu',
    progress_callback: (data: any) => {
      if (data.progress && onProgress) onProgress(data.progress);
    },
  });

  // SYSTEM_PROMPT + text → JSON出力を期待
  // レスポンスからJSON部分を抽出してパース
  // ...
}
```

**Step 2: BulkImportModalのローカルモード実装**

- AIモデル「ローカル」選択時 → モデルサイズ選択UI表示
- WebGPU非対応なら選択肢をグレーアウト + ツールチップ
- 解析ボタン押下 → `parseWithLocalLLM()` 呼出
- プログレスバー表示（初回ダウンロード時）
- 「ベータ」ラベル表示

**Step 3: ビルド確認 + 動作確認**

**Step 4: コミット**

```bash
git commit -m "feat(web): add local LLM support via WebGPU + Transformers.js"
```

---

## Phase 4: PDF/画像アップロード対応

### Task 10: バックエンド — PDF/画像テキスト抽出

**Files:**
- Modify: `functions/src/api/bulk-import.ts` (新エンドポイント or /parse拡張)
- Modify: `functions/package.json` (PDF解析ライブラリ追加)

**前提知識:**
- PDF: `pdf-parse` ライブラリでテキスト抽出（テキストPDFの場合）
- 画像/スキャンPDF: Gemini Flash の Vision API でOCR（`inlineData` でbase64画像を送信）
- ファイルアップロード: multer（既存のexcelインポートと同じパターン）

**Step 1: multerでファイル受付**

`/bulk-import/parse` にファイルアップロード対応を追加。
- `inputType: 'pdf'` → pdf-parseでテキスト抽出 → AI解析
- `inputType: 'image'` → Gemini Vision APIで直接解析

**Step 2: BulkImportModal のPDFタブ有効化**

- ファイルドロップUI（.pdf, .jpg, .png対応）
- アップロード → FormData送信

**Step 3: ビルド確認 + 動作確認**

**Step 4: コミット**

```bash
git commit -m "feat: add PDF/image upload support to bulk import"
```

---

## Phase 5: Claude Sonnet対応

### Task 11: バックエンド — Claude Sonnet モデル追加

**Files:**
- Modify: `functions/src/api/bulk-import.ts`
- Modify: `functions/package.json` (`@anthropic-ai/sdk` 追加)

**前提知識:**
- Anthropic SDK: `npm install @anthropic-ai/sdk`
- APIキー: `ANTHROPIC_API_KEY` 環境変数
- model: `claude-sonnet-4-6`

**Step 1: Sonnet分岐実装**

`/parse` の `model === 'sonnet'` 分岐:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: parsed.text }],
});
```

**Step 2: BulkImportModal のSonnet選択肢有効化**

**Step 3: ビルド確認 + 動作確認**

**Step 4: コミット**

```bash
git commit -m "feat: add Claude Sonnet support to bulk import"
```

---

## 実装順序とタスク依存関係

```
Task 1 (router骨格) → Task 2 (/parse) → Task 3 (/save) → Task 4 (API関数)
                                                              ↓
                                                    Task 5 (入力モーダル)
                                                              ↓
                                                    Task 6 (レビューテーブル)
                                                              ↓
                                                    Task 7 (ツールバー統合)
                                                              ↓
                                               ┌──────────────┼──────────────┐
                                        Task 8 (Excel)   Task 9 (Local LLM)  Task 10 (PDF)
                                                                              Task 11 (Sonnet)
```

Phase 1 (Task 1-7) が完了すれば MVP として動作する。Phase 2-5 は独立して実装可能。

## 完了条件

- [ ] テキスト貼り付け → AI解析 → レビューテーブル → 一括保存が動作する
- [ ] ツールバーから起動できる
- [ ] 工程・タスク・打合せ・マイルストーンの4種別が正しく保存される
- [ ] 親子関係（工程→タスク）が正しく保存される
- [ ] レビューテーブルで全フィールドがインライン編集できる
- [ ] `npm run build` がエラーなし
- [ ] Firebase Functions デプロイ可能
