# CODEX_COMPASS_AI_STAGE_GENERATION.md

## 目的

プロジェクト情報（マイルストーン日程、クライアント名、物件種別等）から
AIが最適な工程（Stage）とタスクを自動生成する機能を追加する。

既存のbulk-import基盤（`functions/src/api/bulk-import.ts`）を活用する。

## 背景

現状: プロジェクト作成後、工程を手動で1つずつ作成 or bulk-importでテキスト/Excelから取り込む。
改善: プロジェクトのマイルストーン情報を基に、AIが建築プロジェクトの典型的な工程表を推論し提案する。
ユーザーはレビュー画面で編集→一括保存。bulk-importのレビュー＆保存UIをそのまま再利用する。

## 変更対象ファイル

### バックエンド

1. `functions/src/api/bulk-import.ts` — 新しいエンドポイント `/bulk-import/generate-stages` を追加

### フロントエンド

2. `web/src/components/BulkImportModal.tsx` — 「AI自動生成」タブ/ボタンを追加
3. `web/src/lib/api.ts` — `generateStages()` API関数を追加

## 実装手順

### Step 1: バックエンドAPI追加

`functions/src/api/bulk-import.ts` に新しいエンドポイントを追加:

```typescript
// ---------------------------------------------------------------------------
// POST /bulk-import/generate-stages — AIでプロジェクト情報から工程を自動生成
// ---------------------------------------------------------------------------

const generateSchema = z.object({
  projectId: z.string().min(1),
});

router.post('/bulk-import/generate-stages', async (req: Request, res: Response) => {
  try {
    const parsed = generateSchema.parse(req.body);

    // Rate limit check (既存のcheckRateLimitを流用)
    const uid = (req as any).uid;
    const user = await getUser(uid);
    if (!user) { res.status(401).json({ error: 'User not found' }); return; }
    const orgId = getEffectiveOrgId(user);
    const rateCheck = await checkRateLimit(uid, orgId);
    if (!rateCheck.allowed) {
      res.status(429).json({ error: `本日の利用上限（${DAILY_PARSE_LIMIT}回/日）に達しました。` });
      return;
    }

    // プロジェクト情報を取得
    const projectDoc = await db.collection('orgs').doc(orgId).collection('projects').doc(parsed.projectId).get();
    if (!projectDoc.exists) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const project = projectDoc.data();

    // 既存の工程情報を取得（重複を避けるため）
    const existingStagesSnap = await db.collection('orgs').doc(orgId).collection('tasks')
      .where('projectId', '==', parsed.projectId)
      .where('type', '==', 'stage')
      .get();
    const existingStages = existingStagesSnap.docs.map(d => d.data().タスク名);

    // AIプロンプトを構築
    const prompt = buildGeneratePrompt(project, existingStages);

    // Gemini Flash で推論
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'AI service is not configured' });
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildGenerateSystemPrompt(),
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    let data: { items: any[]; warnings: string[] };
    try {
      data = JSON.parse(responseText);
    } catch {
      res.status(500).json({ error: 'AI returned invalid JSON' });
      return;
    }

    if (!Array.isArray(data.items)) data.items = [];
    for (const item of data.items) {
      if (!item.tempId) item.tempId = `tmp_${crypto.randomUUID()}`;
    }
    if (!Array.isArray(data.warnings)) data.warnings = [];

    res.json({ items: data.items, warnings: data.warnings, remaining: rateCheck.remaining });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    console.error('[bulk-import/generate-stages] Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});
```

### Step 2: AIプロンプトの構築

同じファイル内に以下の関数を追加:

```typescript
function buildGenerateSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `あなたは建築プロジェクトの工程管理の専門家です。
プロジェクト情報から最適な工程表を生成してください。

ルール:
- stage(工程)の下にtask(タスク)を配置
- 日付はYYYY-MM-DD形式
- マイルストーン日程がある場合はそれを基準に逆算
- 一般的な建築プロジェクトの工程を網羅
- 既に存在する工程は生成しない

今日は${today}です。

出力JSON形式:
{
  "items": [
    {
      "tempId": "tmp_1",
      "name": "工程名",
      "type": "stage|task|meeting|milestone",
      "parentTempId": null,
      "assignee": null,
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "confidence": 0.9
    }
  ],
  "warnings": []
}`;
}

function buildGeneratePrompt(project: any, existingStages: string[]): string {
  const lines: string[] = ['以下のプロジェクト情報から工程表を生成してください。\n'];

  lines.push(`物件名: ${project.物件名 || '不明'}`);
  if (project.クライアント) lines.push(`クライアント: ${project.クライアント}`);

  // マイルストーン日程
  const milestones = [
    ['開始日', project.開始日],
    ['現地調査日', project.現地調査日],
    ['レイアウト確定日', project.レイアウト確定日],
    ['パース確定日', project.パース確定日],
    ['基本設計完了日', project.基本設計完了日],
    ['設計施工現調日', project.設計施工現調日],
    ['見積確定日', project.見積確定日],
    ['着工日', project.着工日],
    ['中間検査日', project.中間検査日],
    ['竣工予定日', project.竣工予定日],
    ['引渡し予定日', project.引渡し予定日],
  ].filter(([, v]) => v);

  if (milestones.length > 0) {
    lines.push('\nマイルストーン日程:');
    for (const [label, date] of milestones) {
      lines.push(`  ${label}: ${date}`);
    }
  }

  if (existingStages.length > 0) {
    lines.push(`\n既存の工程（これらは生成しないでください）: ${existingStages.join(', ')}`);
  }

  lines.push('\n典型的な建築プロジェクトの工程を生成してください。');
  lines.push('マイルストーン日程が設定されている場合は、それを基準に各工程の開始日・終了日を推論してください。');

  return lines.join('\n');
}
```

### Step 3: フロントエンドAPI関数

`web/src/lib/api.ts` に追加:

```typescript
export async function generateStages(projectId: string) {
  return request<BulkImportParseResponse>('/bulk-import/generate-stages', {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  });
}
```

`BulkImportParseResponse` は `web/src/lib/types.ts` に既に定義されている。

### Step 4: BulkImportModal に「AI自動生成」ボタン追加

`web/src/components/BulkImportModal.tsx` を確認し、以下を追加:

1. モーダル内の入力方法選択エリアに「AI自動生成」ボタンを追加
2. ボタンをクリックすると `generateStages(projectId)` を呼び出す
3. レスポンスのitemsを既存のレビュー画面（プレビューテーブル）に表示
4. 以降は既存のbulk-importと同じフロー（編集 → 保存）

**具体的なUI変更:**

既存の入力方法選択UI（テキスト入力 / ファイルアップロード）の隣に追加:

```tsx
{/* カラー方針: slateベースで統一。派手な色は使わない */}
<button
  onClick={handleGenerateStages}
  disabled={generating}
  className="flex-1 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors text-sm font-medium"
>
  {generating ? 'AI生成中...' : 'AIで工程を自動生成'}
</button>
```

`handleGenerateStages` の実装:

```typescript
const [generating, setGenerating] = useState(false);

const handleGenerateStages = async () => {
  if (!projectId) return;
  setGenerating(true);
  try {
    const result = await generateStages(projectId);
    // 既存のitemsステートにセット（プレビュー画面表示）
    setItems(result.items);
    setWarnings(result.warnings);
    setStep('preview'); // プレビューステップに遷移
  } catch (err: any) {
    toast.error(err.message || 'AI生成に失敗しました');
  } finally {
    setGenerating(false);
  }
};
```

**注意:**
- `projectId` は BulkImportModal の既存propsから取得
- プレビュー画面は既存のものをそのまま使う（items配列の形式は同一）
- 保存処理（`/bulk-import/save`）も既存のものをそのまま使う

### Step 5: ProjectModal からのアクセス

プロジェクト詳細画面（またはプロジェクト設定画面）から「AI工程生成」にアクセスできるようにする。
既存のBulkImportModalの開くトリガーを確認し、同じ導線に追加する。

可能であれば、プロジェクト作成直後（工程がゼロの状態）に
「AIで工程を自動生成しますか？」のサジェストを表示する。

## 完了条件

1. `pnpm --filter functions build` が成功する
2. `pnpm --filter web build` が成功する
3. BulkImportModal内に「AIで工程を自動生成」ボタンが表示される
4. ボタンを押すとプロジェクト情報を基にAIが工程を推論する
5. 推論結果が既存のプレビュー画面に表示される
6. ユーザーが編集後「保存」で工程が作成される
7. 既存の工程がある場合は重複しない
8. レート制限（10回/日/ユーザー）が既存のbulk-importと共有される
9. 新しいパッケージのインストールは不要

## やらないこと

- プロジェクト種別の選択UI（将来のv2で検討）
- テンプレートライブラリ（将来のv2で検討）
- Claude Sonnet対応（Gemini Flashのみで十分）
- テストファイルの作成
