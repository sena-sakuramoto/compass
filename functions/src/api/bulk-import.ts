import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';
import { getEffectiveOrgId } from '../lib/access-helpers';
import { db } from '../lib/firestore';
import { getNextTaskId } from '../lib/counters';
import { FieldValue } from 'firebase-admin/firestore';

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
});

const saveRequestSchema = z.object({
  projectId: z.string().min(1),
  items: z.array(saveItemSchema),
});

// ---------------------------------------------------------------------------
// System prompt for Gemini
// ---------------------------------------------------------------------------

const PARSE_SYSTEM_PROMPT = `あなたは建築プロジェクトの工程表を解析するアシスタントです。
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
      "parentTempId": null,
      "assignee": null,
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "confidence": 0.9
    }
  ],
  "warnings": []
}`;

// ---------------------------------------------------------------------------
// POST /bulk-import/parse
// ---------------------------------------------------------------------------

router.post('/bulk-import/parse', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = parseRequestSchema.parse(req.body);

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
        system: PARSE_SYSTEM_PROMPT,
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

      res.json({ items: data.items, warnings: data.warnings });
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
      model: 'gemini-2.0-flash',
      systemInstruction: PARSE_SYSTEM_PROMPT,
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
        const resolvedParentId = item.parentTempId
          ? stageIdMap[item.parentTempId] || null
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
          participants: item.type === 'meeting' ? [] : null,
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

export default router;
