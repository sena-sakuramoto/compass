import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import multer from 'multer';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';
import { getEffectiveOrgId } from '../lib/access-helpers';
import { getAiUsageLimits, getOrgBilling } from '../lib/billing';
import { db } from '../lib/firestore';
import { getNextTaskId } from '../lib/counters';
import { FieldValue } from 'firebase-admin/firestore';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

const router = Router();

router.use(authMiddleware());

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const parseRequestSchema = z.object({
  text: z.string().min(1).max(50000),
  model: z.enum(['flash', 'sonnet']),
  projectId: z.string().min(1),
  inputType: z.enum(['excel', 'text', 'pdf', 'image']),
});

const generateSchema = z.object({
  projectId: z.string().min(1),
});

const saveItemSchema = z.object({
  tempId: z.string(),
  name: z.string().min(1),
  type: z.enum(['stage', 'task', 'meeting', 'milestone']),
  parentTempId: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  assigneeEmail: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  orderIndex: z.number(),
  participants: z.array(z.string()).optional(),
});

const saveRequestSchema = z.object({
  projectId: z.string().min(1),
  items: z.array(saveItemSchema),
});

// ---------------------------------------------------------------------------
// System prompt for Gemini
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  return `あなたは建築プロジェクトの工程表を解析するアシスタントです。
入力テキストから工程（Stage）、タスク、打合せ、マイルストーンを抽出してください。

重要: 今日は${today}です。年が明示されていない日付は${year}年として扱ってください。
和暦の場合: 令和${year - 2018}年 = ${year}年 です。

分類ルール:
- stage: 大きなフェーズ（基本設計、実施設計、施工 等）
- task: 具体的な作業（図面作成、申請書作成 等）
- meeting: 打合せ、会議、確認会 等
- milestone: 着工、竣工、引渡し、検査 等の1日イベント

階層ルール:
- 工程(stage)の下にタスクや打合せがぶら下がる
- インデント、番号体系、文脈から親子関係を推定
- 親のないタスクはparentTempIdをnullにする

日付ルール:
- 必ずYYYY-MM-DD形式で出力（例: ${today}）
- 「3月」「3/15」のように年が省略されている場合は${year}年とする
- 「R8」「令和8年」は${year}年（令和${year - 2018}年）
- 日付が不明な場合はnull

出力は以下のJSON形式のみ返してください（説明文不要）:
{
  "items": [
    {
      "tempId": "tmp_1",
      "name": "タスク名",
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

function buildGenerateSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  return `あなたは建築プロジェクトの工程管理の専門家です。
プロジェクト情報から、実務で使える工程(stage)とタスク(task)を提案してください。

重要: 今日は${today}です。年が明示されていない日付は${year}年として扱ってください。
和暦の場合: 令和${year - 2018}年 = ${year}年 です。

ルール:
- stage(工程)の下にtask(タスク)を配置する
- 日付は必ずYYYY-MM-DD形式（不明ならnull）
- マイルストーン日程がある場合は、それを基準に逆算/順算する
- 一般的な建築プロジェクトの工程を網羅する
- 既に存在する工程名は生成しない

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

  lines.push(`物件名: ${project?.物件名 || '不明'}`);
  if (project?.クライアント) lines.push(`クライアント: ${project.クライアント}`);
  if (project?.ステータス) lines.push(`ステータス: ${project.ステータス}`);
  if (project?.優先度) lines.push(`優先度: ${project.優先度}`);

  const milestones: Array<[string, string]> = [
    ['開始日', project?.開始日],
    ['現地調査日', project?.現地調査日],
    ['レイアウト確定日', project?.レイアウト確定日],
    ['パース確定日', project?.パース確定日],
    ['基本設計完了日', project?.基本設計完了日],
    ['設計施工現調日', project?.設計施工現調日],
    ['見積確定日', project?.見積確定日],
    ['着工日', project?.着工日],
    ['中間検査日', project?.中間検査日],
    ['竣工予定日', project?.竣工予定日],
    ['引渡し予定日', project?.引渡し予定日],
    ['予定完了日', project?.予定完了日],
  ].filter(([, value]) => typeof value === 'string' && value.trim().length > 0) as Array<[string, string]>;

  if (milestones.length > 0) {
    lines.push('\nマイルストーン日程:');
    for (const [label, date] of milestones) {
      lines.push(`  ${label}: ${date}`);
    }
  }

  if (existingStages.length > 0) {
    lines.push(`\n既存の工程（これらは生成しないでください）: ${existingStages.join(', ')}`);
  }

  lines.push('\n要件:');
  lines.push('- 実行可能な粒度で工程とタスクを作る');
  lines.push('- stageにはparentTempIdをnull、taskには対応するstageのtempIdを設定する');
  lines.push('- 返答はJSONのみ');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Per-user daily rate limit (Gemini API cost control)
// ---------------------------------------------------------------------------

const DEFAULT_DAILY_LIMIT = 10; // デフォルト日次上限（ティア別上限が取得できない場合のフォールバック）

async function checkRateLimit(uid: string, orgId: string, dailyLimit = DEFAULT_DAILY_LIMIT): Promise<{ allowed: boolean; remaining: number; dailyLimit: number }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const ref = db.collection('orgs').doc(orgId).collection('bulk-import-usage').doc(uid);
  const doc = await ref.get();
  const data = doc.data();

  if (!data || data.date !== today) {
    // New day or first use
    await ref.set({ date: today, count: 1 });
    return { allowed: true, remaining: dailyLimit - 1, dailyLimit };
  }

  if (data.count >= dailyLimit) {
    return { allowed: false, remaining: 0, dailyLimit };
  }

  await ref.update({ count: FieldValue.increment(1) });
  return { allowed: true, remaining: dailyLimit - data.count - 1, dailyLimit };
}

async function checkMonthlyLimit(orgId: string): Promise<{ allowed: boolean; used: number; limit: number; dailyLimit: number }> {
  const billingDoc = await getOrgBilling(orgId);
  const limits = getAiUsageLimits(billingDoc);

  const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const ref = db.collection('orgs').doc(orgId).collection('ai-usage-monthly').doc(yearMonth);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const used = snapshot.exists ? Number(snapshot.data()?.count || 0) : 0;

    if (used >= limits.monthly) {
      return { allowed: false, used, limit: limits.monthly, dailyLimit: limits.daily };
    }

    tx.set(ref, {
      count: used + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { allowed: true, used: used + 1, limit: limits.monthly, dailyLimit: limits.daily };
  });
}

// ---------------------------------------------------------------------------
// POST /bulk-import/parse
// ---------------------------------------------------------------------------

router.post('/bulk-import/parse', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = parseRequestSchema.parse(req.body);

    // Rate limit check
    const uid = (req as any).uid;
    const user = await getUser(uid);
    if (!user) { res.status(401).json({ error: 'User not found' }); return; }
    const userOrgId = getEffectiveOrgId(user);
    // 月間チェックを先に実行（ティア別日次上限も取得）
    const monthlyCheck = await checkMonthlyLimit(userOrgId);
    if (!monthlyCheck.allowed) {
      res.status(429).json({
        error: `今月のAI利用上限（${monthlyCheck.limit}回/月）に達しました。プランのアップグレードをご検討ください。`,
        monthlyUsed: monthlyCheck.used,
        monthlyLimit: monthlyCheck.limit,
      });
      return;
    }
    const rateCheck = await checkRateLimit(uid, userOrgId, monthlyCheck.dailyLimit);
    if (!rateCheck.allowed) {
      res.status(429).json({ error: `本日の利用上限（${rateCheck.dailyLimit}回/日）に達しました。明日またお試しください。` });
      return;
    }

    if (parsed.model === 'sonnet') {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        console.error('[bulk-import/parse] ANTHROPIC_API_KEY is not set');
        res.status(500).json({ error: 'Claude Sonnet is not configured' });
        return;
      }

      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: parsed.text }],
      });

      // Extract text content from response
      const textBlock = message.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        res.status(500).json({ error: 'AI returned no text response' });
        return;
      }

      let data: { items: any[]; warnings: string[] };
      try {
        data = JSON.parse(textBlock.text);
      } catch {
        console.error('[bulk-import/parse] Failed to parse Sonnet response:', textBlock.text);
        res.status(500).json({ error: 'AI returned invalid JSON' });
        return;
      }

      if (!Array.isArray(data.items)) data.items = [];
      for (const item of data.items) {
        if (!item.tempId) item.tempId = `tmp_${crypto.randomUUID()}`;
      }
      if (!Array.isArray(data.warnings)) data.warnings = [];

      res.json({
        items: data.items,
        warnings: data.warnings,
        remaining: rateCheck.remaining,
        monthlyUsed: monthlyCheck.used,
        monthlyLimit: monthlyCheck.limit,
      });
      return;
    }

    // Call Gemini Flash
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[bulk-import/parse] GEMINI_API_KEY is not set');
      res.status(500).json({ error: 'AI service is not configured' });
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildSystemPrompt(),
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const result = await model.generateContent(parsed.text);
    const response = result.response;
    const responseText = response.text();

    // Parse the JSON response
    let data: { items: any[]; warnings: string[] };
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[bulk-import/parse] Failed to parse Gemini response:', responseText);
      res.status(500).json({ error: 'AI returned invalid JSON' });
      return;
    }

    // Ensure items is an array
    if (!Array.isArray(data.items)) {
      data.items = [];
    }

    // Ensure each item has a tempId
    for (const item of data.items) {
      if (!item.tempId) {
        item.tempId = `tmp_${crypto.randomUUID()}`;
      }
    }

    // Ensure warnings is an array
    if (!Array.isArray(data.warnings)) {
      data.warnings = [];
    }

    res.json({
      items: data.items,
      warnings: data.warnings,
      remaining: rateCheck.remaining,
      monthlyUsed: monthlyCheck.used,
      monthlyLimit: monthlyCheck.limit,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    console.error('[bulk-import/parse] Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /bulk-import/generate-stages — AIでプロジェクト情報から工程を自動生成
// ---------------------------------------------------------------------------

router.post('/bulk-import/generate-stages', async (req: Request, res: Response) => {
  try {
    const parsed = generateSchema.parse(req.body);

    const uid = (req as any).uid;
    const user = await getUser(uid);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    const orgId = getEffectiveOrgId(user);

    // 月間チェックを先に実行（ティア別日次上限も取得）
    const monthlyCheck = await checkMonthlyLimit(orgId);
    if (!monthlyCheck.allowed) {
      res.status(429).json({
        error: `今月のAI利用上限（${monthlyCheck.limit}回/月）に達しました。プランのアップグレードをご検討ください。`,
        monthlyUsed: monthlyCheck.used,
        monthlyLimit: monthlyCheck.limit,
      });
      return;
    }
    const rateCheck = await checkRateLimit(uid, orgId, monthlyCheck.dailyLimit);
    if (!rateCheck.allowed) {
      res.status(429).json({ error: `本日の利用上限（${rateCheck.dailyLimit}回/日）に達しました。` });
      return;
    }

    const projectDoc = await db.collection('orgs').doc(orgId).collection('projects').doc(parsed.projectId).get();
    if (!projectDoc.exists) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = projectDoc.data() || {};

    const existingStagesSnap = await db
      .collection('orgs')
      .doc(orgId)
      .collection('tasks')
      .where('projectId', '==', parsed.projectId)
      .where('type', '==', 'stage')
      .get();

    const existingStages = Array.from(new Set(existingStagesSnap.docs
      .map((doc) => {
        const data = doc.data();
        return typeof data.タスク名 === 'string' ? data.タスク名.trim() : '';
      })
      .filter(Boolean)));

    const prompt = buildGeneratePrompt(project, existingStages);

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
      console.error('[bulk-import/generate-stages] Failed to parse Gemini response:', responseText);
      res.status(500).json({ error: 'AI returned invalid JSON' });
      return;
    }

    if (!Array.isArray(data.items)) data.items = [];
    for (const item of data.items) {
      if (!item.tempId) item.tempId = `tmp_${crypto.randomUUID()}`;
    }
    if (!Array.isArray(data.warnings)) data.warnings = [];

    res.json({
      items: data.items,
      warnings: data.warnings,
      remaining: rateCheck.remaining,
      monthlyUsed: monthlyCheck.used,
      monthlyLimit: monthlyCheck.limit,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    console.error('[bulk-import/generate-stages] Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /bulk-import/save
// ---------------------------------------------------------------------------

router.post('/bulk-import/save', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = saveRequestSchema.parse(req.body);

    // Get orgId from authenticated user
    const uid = (req as any).uid;
    const user = await getUser(uid);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    const orgId = getEffectiveOrgId(user);

    const { projectId, items } = parsed;

    // Separate stages from non-stages
    const stages = items.filter((item) => item.type === 'stage');
    const nonStages = items.filter((item) => item.type !== 'stage');

    // Phase 1: Create stages first, build stageIdMap (tempId -> firestoreId)
    const stageIdMap: Record<string, string> = {};
    const BATCH_LIMIT = 400;

    // Process stages in batches
    for (let i = 0; i < stages.length; i += BATCH_LIMIT) {
      const chunk = stages.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();

      for (const stage of chunk) {
        const taskId = await getNextTaskId();
        stageIdMap[stage.tempId] = taskId;

        const docRef = db.collection('orgs').doc(orgId).collection('tasks').doc(taskId);
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
          担当者メール: stage.assigneeEmail || null,
          マイルストーン: null,
          participants: null,
          orgId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
    }

    // Phase 2: Create non-stages, resolving parentTempId to real Firestore IDs
    const counters = { stages: stages.length, tasks: 0, meetings: 0, milestones: 0 };

    for (let i = 0; i < nonStages.length; i += BATCH_LIMIT) {
      const chunk = nonStages.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();

      for (const item of chunk) {
        const taskId = await getNextTaskId();

        // Resolve parentTempId to real Firestore ID
        // If parentTempId is in stageIdMap (new stage), use mapped ID;
        // otherwise use it as-is (existing stage ID from Firestore)
        const resolvedParentId = item.parentTempId
          ? (stageIdMap[item.parentTempId] || item.parentTempId)
          : null;

        const docRef = db.collection('orgs').doc(orgId).collection('tasks').doc(taskId);
        batch.set(docRef, {
          projectId,
          タスク名: item.name,
          type: 'task',
          parentId: resolvedParentId,
          orderIndex: item.orderIndex,
          ステータス: '未着手',
          予定開始日: item.startDate || null,
          期限: item.endDate || null,
          担当者: item.assignee || null,
          担当者メール: item.assigneeEmail || null,
          マイルストーン: item.type === 'milestone' ? true : null,
          participants: item.type === 'meeting' ? (item.participants || []) : null,
          orgId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Count by original type
        if (item.type === 'task') counters.tasks++;
        else if (item.type === 'meeting') counters.meetings++;
        else if (item.type === 'milestone') counters.milestones++;
      }

      await batch.commit();
    }

    res.json({
      created: counters,
      stageIdMap,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    console.error('[bulk-import/save] Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /bulk-import/parse-file — Parse uploaded PDF or image file
// ---------------------------------------------------------------------------

router.post('/bulk-import/parse-file', upload.single('file'), async (req: Request, res: Response) => {
  try {
    // Rate limit check
    const fileUid = (req as any).uid;
    const fileUser = await getUser(fileUid);
    if (!fileUser) { res.status(401).json({ error: 'User not found' }); return; }
    const fileOrgId = getEffectiveOrgId(fileUser);
    // 月間チェックを先に実行（ティア別日次上限も取得）
    const fileMonthlyCheck = await checkMonthlyLimit(fileOrgId);
    if (!fileMonthlyCheck.allowed) {
      res.status(429).json({
        error: `今月のAI利用上限（${fileMonthlyCheck.limit}回/月）に達しました。プランのアップグレードをご検討ください。`,
        monthlyUsed: fileMonthlyCheck.used,
        monthlyLimit: fileMonthlyCheck.limit,
      });
      return;
    }
    const fileRateCheck = await checkRateLimit(fileUid, fileOrgId, fileMonthlyCheck.dailyLimit);
    if (!fileRateCheck.allowed) {
      res.status(429).json({ error: `本日の利用上限（${fileRateCheck.dailyLimit}回/日）に達しました。明日またお試しください。` });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const projectId = req.body.projectId;
    const model = req.body.model || 'flash';
    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }

    const mimeType = file.mimetype;
    let parseText = '';

    // For PDFs, try text extraction first
    if (mimeType === 'application/pdf') {
      try {
        const { PDFParse: PDFParseClass } = await import('pdf-parse');
        const parser = new PDFParseClass({ data: new Uint8Array(file.buffer) });
        const textResult = await parser.getText();
        parseText = textResult.text;
        await parser.destroy();
      } catch {
        // If text extraction fails, fall through to Vision API
      }
    }

    // If we have text from PDF, use the regular text parsing flow
    if (parseText && parseText.trim().length > 50) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: 'AI service is not configured' });
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: buildSystemPrompt(),
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const result = await genModel.generateContent(parseText);
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

      res.json({
        items: data.items,
        warnings: data.warnings,
        remaining: fileRateCheck.remaining,
        monthlyUsed: fileMonthlyCheck.used,
        monthlyLimit: fileMonthlyCheck.limit,
      });
      return;
    }

    // For images or scanned PDFs, use Gemini Vision API
    const isImage = mimeType.startsWith('image/');
    const isScannedPdf = mimeType === 'application/pdf';

    if (!isImage && !isScannedPdf) {
      res.status(400).json({ error: 'Unsupported file type. Please upload PDF, JPG, or PNG.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'AI service is not configured' });
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildSystemPrompt(),
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    // Send image/PDF as inline data to Gemini Vision
    const base64Data = file.buffer.toString('base64');
    const result = await genModel.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      },
      { text: 'この画像/文書から工程表の情報を抽出してJSON形式で返してください。' },
    ]);

    const responseText = result.response.text();

    let data: { items: any[]; warnings: string[] };
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[bulk-import/parse-file] Failed to parse Vision response:', responseText);
      res.status(500).json({ error: 'AI returned invalid JSON' });
      return;
    }

    if (!Array.isArray(data.items)) data.items = [];
    for (const item of data.items) {
      if (!item.tempId) item.tempId = `tmp_${crypto.randomUUID()}`;
    }
    if (!Array.isArray(data.warnings)) data.warnings = [];

    res.json({
      items: data.items,
      warnings: data.warnings,
      remaining: fileRateCheck.remaining,
      monthlyUsed: fileMonthlyCheck.used,
      monthlyLimit: fileMonthlyCheck.limit,
    });
  } catch (err: any) {
    console.error('[bulk-import/parse-file] Error:', err);
    res.status(500).json({ error: err.message || 'File parsing failed' });
  }
});

export default router;
