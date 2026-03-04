/**
 * ChatGPT Custom GPT 用 REST API ルーター
 *
 * Bearer トークン認証 → Firestore CRUD 関数を呼び出す。
 * レスポンス形式は MCP ツールと同じ英語キー。
 *
 * マウント先: /gpt/api/v1
 */
import { Router } from 'express';
import { authenticateMcpRequest } from '../auth';
import {
  listProjects, getProject, createProject, updateProject, deleteProject,
  listTasks, createTask, updateTask, deleteTask, completeTask,
  listStages, createStage, updateStage, deleteStage,
  db, serialize,
} from '../../lib/firestore';
import type { TaskInput, TaskDoc, ProjectInput, ProjectDoc } from '../../lib/firestore';
import { listUsers } from '../../lib/users';
import { mapTaskFields, mapProjectFields } from '../lib/field-mapping';
import { validateTaskFields, validateAssigneeUpdate } from '../lib/task-validation';
import type { McpContext } from '../types';

const router = Router();

// ── 認証ミドルウェア ──
router.use(async (req, res, next) => {
  const ctx = await authenticateMcpRequest(req.headers.authorization);
  if (!ctx) {
    res.status(401).json({ error: 'Unauthorized', message: 'Valid access token required' });
    return;
  }
  // リクエストにコンテキストを付与
  (req as any).ctx = ctx;
  next();
});

/** リクエストから McpContext を取得 */
function getCtx(req: any): McpContext {
  return req.ctx as McpContext;
}

/** 書き込み権限チェック */
function requireWriter(ctx: McpContext, res: any): boolean {
  if (ctx.role === 'viewer') {
    res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot perform write operations' });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════
// Projects
// ═══════════════════════════════════════════

// GET /projects
router.get('/projects', async (req, res) => {
  try {
    const ctx = getCtx(req);
    let projects = await listProjects(ctx.orgId);
    const status = req.query.status as string | undefined;
    if (status) {
      projects = projects.filter((p) => p.ステータス === status);
    }
    res.json(projects.map((p) => ({
      id: p.id,
      name: p.物件名,
      client: p.クライアント ?? null,
      status: p.ステータス,
      priority: p.優先度,
      startDate: p.開始日 ?? null,
      dueDate: p.予定完了日 ?? null,
      updatedAt: p.updatedAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /projects/:projectId
router.get('/projects/:projectId', async (req, res) => {
  try {
    const ctx = getCtx(req);
    const project = await getProject(ctx.orgId, req.params.projectId);
    if (!project) {
      res.status(404).json({ error: `Project "${req.params.projectId}" not found` });
      return;
    }
    res.json({
      id: project.id,
      name: project.物件名,
      client: project.クライアント ?? null,
      status: project.ステータス,
      priority: project.優先度,
      startDate: project.開始日 ?? null,
      dueDate: project.予定完了日 ?? null,
      location: project.所在地_現地 ?? null,
      folderUrl: project['フォルダURL'] ?? null,
      notes: project['備考'] ?? null,
      constructionCost: project.施工費 ?? null,
      siteSurveyDate: project['現地調査日'] ?? null,
      layoutDate: project['レイアウト確定日'] ?? null,
      perspectiveDate: project['パース確定日'] ?? null,
      basicDesignDate: project['基本設計完了日'] ?? null,
      constructionSurveyDate: project['設計施工現調日'] ?? null,
      estimateDate: project['見積確定日'] ?? null,
      constructionStartDate: project['着工日'] ?? null,
      interimInspectionDate: project['中間検査日'] ?? null,
      completionDate: project['竣工予定日'] ?? null,
      handoverDate: project['引渡し予定日'] ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /projects
router.post('/projects', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    const mapped = mapProjectFields(req.body);
    const payload: ProjectInput = {
      物件名: (mapped['物件名'] as string) ?? req.body.name,
      ステータス: (mapped['ステータス'] as string) ?? '進行中',
      優先度: (mapped['優先度'] as string) ?? '中',
      クライアント: (mapped['クライアント'] as string | undefined) ?? undefined,
      開始日: (mapped['開始日'] as string | undefined) ?? undefined,
      予定完了日: (mapped['予定完了日'] as string | undefined) ?? undefined,
      所在地_現地: (mapped['所在地_現地'] as string | undefined) ?? undefined,
      フォルダURL: (mapped['フォルダURL'] as string | undefined) ?? undefined,
      備考: (mapped['備考'] as string | undefined) ?? undefined,
      現地調査日: (mapped['現地調査日'] as string | undefined) ?? undefined,
      レイアウト確定日: (mapped['レイアウト確定日'] as string | undefined) ?? undefined,
      パース確定日: (mapped['パース確定日'] as string | undefined) ?? undefined,
      基本設計完了日: (mapped['基本設計完了日'] as string | undefined) ?? undefined,
      設計施工現調日: (mapped['設計施工現調日'] as string | undefined) ?? undefined,
      見積確定日: (mapped['見積確定日'] as string | undefined) ?? undefined,
      着工日: (mapped['着工日'] as string | undefined) ?? undefined,
      中間検査日: (mapped['中間検査日'] as string | undefined) ?? undefined,
      竣工予定日: (mapped['竣工予定日'] as string | undefined) ?? undefined,
      引渡し予定日: (mapped['引渡し予定日'] as string | undefined) ?? undefined,
    };

    const projectId = await createProject(payload, ctx.orgId, ctx.uid);
    res.status(201).json({ projectId, message: `Project "${req.body.name}" created successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /projects/:projectId
router.patch('/projects/:projectId', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    const mapped = mapProjectFields(req.body);
    if (Object.keys(mapped).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    await updateProject(req.params.projectId, mapped as Partial<ProjectInput>, ctx.orgId);
    res.json({ projectId: req.params.projectId, message: 'Project updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /projects/:projectId
router.delete('/projects/:projectId', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    await deleteProject(req.params.projectId, ctx.orgId);
    res.json({ projectId: req.params.projectId, message: 'Project deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// Tasks
// ═══════════════════════════════════════════

// GET /tasks
router.get('/tasks', async (req, res) => {
  try {
    const ctx = getCtx(req);
    const { projectId, assignee, status, q } = req.query as Record<string, string>;
    const tasks = await listTasks({
      orgId: ctx.orgId,
      projectId: projectId ?? undefined,
      assignee: assignee ?? undefined,
      status: status ?? undefined,
      q: q ?? undefined,
    });
    res.json(tasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      name: t.タスク名,
      assignee: t.担当者 ?? t.assignee ?? null,
      status: t.ステータス,
      priority: t.優先度 ?? null,
      startDate: t.予定開始日 ?? t.start ?? null,
      dueDate: t.期限 ?? t.end ?? null,
      progress: t.progress ?? null,
      updatedAt: t.updatedAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /tasks/:taskId
router.get('/tasks/:taskId', async (req, res) => {
  try {
    const ctx = getCtx(req);
    const doc = await db
      .collection('orgs')
      .doc(ctx.orgId)
      .collection('tasks')
      .doc(req.params.taskId)
      .get();

    if (!doc.exists) {
      res.status(404).json({ error: `Task "${req.params.taskId}" not found` });
      return;
    }

    const task = serialize<TaskDoc>(doc as FirebaseFirestore.QueryDocumentSnapshot);
    if (task.deletedAt) {
      res.status(404).json({ error: `Task "${req.params.taskId}" has been deleted` });
      return;
    }

    res.json({
      id: task.id,
      projectId: task.projectId,
      name: task.タスク名,
      type: task.type ?? 'task',
      assignee: task.担当者 ?? task.assignee ?? null,
      assigneeEmail: task.担当者メール ?? null,
      status: task.ステータス,
      priority: task.優先度 ?? null,
      startDate: task.予定開始日 ?? task.start ?? null,
      dueDate: task.期限 ?? task.end ?? null,
      actualStartDate: task.実績開始日 ?? null,
      actualEndDate: task.実績完了日 ?? null,
      progress: task.progress ?? null,
      milestone: task.マイルストーン ?? false,
      estimatedHours: task['工数見積(h)'] ?? null,
      actualHours: task['工数実績(h)'] ?? null,
      dependencies: task['依存タスク'] ?? null,
      requestedBy: task['依頼元'] ?? null,
      phase: task.フェーズ ?? null,
      sprint: task.スプリント ?? null,
      parentId: task.parentId ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tasks
router.post('/tasks', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    // サーバーサイドバリデーション
    const validation = await validateTaskFields({
      orgId: ctx.orgId,
      projectId: req.body.projectId,
      assignee: req.body.assignee,
      phase: req.body.phase,
      startDate: req.body.startDate,
      dueDate: req.body.dueDate,
      taskName: req.body.taskName,
      taskType: req.body.taskType,
    });

    if (validation.errors.length > 0) {
      res.status(422).json({
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings,
        suggestions: validation.suggestions,
      });
      return;
    }

    const mapped = mapTaskFields(req.body);
    const payload: TaskInput = {
      projectId: req.body.projectId,
      タスク名: (mapped['タスク名'] as string) ?? req.body.taskName,
      ステータス: (mapped['ステータス'] as string) ?? '未着手',
      担当者: (mapped['担当者'] as string | undefined) ?? undefined,
      担当者メール: (mapped['担当者メール'] as string | undefined) ?? undefined,
      優先度: (mapped['優先度'] as string | undefined) ?? undefined,
      予定開始日: (mapped['予定開始日'] as string | undefined) ?? undefined,
      期限: (mapped['期限'] as string | undefined) ?? undefined,
      タスク種別: (mapped['タスク種別'] as string | undefined) ?? undefined,
      フェーズ: (mapped['フェーズ'] as string | undefined) ?? undefined,
      orgId: ctx.orgId,
    };

    const taskId = await createTask(payload, ctx.orgId);
    const result: Record<string, unknown> = { taskId, message: `Task "${req.body.taskName}" created successfully.` };
    if (validation.warnings.length > 0) result.warnings = validation.warnings;
    if (validation.suggestions.length > 0) result.suggestions = validation.suggestions;
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /tasks/:taskId
router.patch('/tasks/:taskId', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    const { updatedAt } = req.body;
    if (!updatedAt) {
      res.status(400).json({ error: 'updatedAt is required for optimistic locking' });
      return;
    }

    // 楽観ロック
    const docRef = db.collection('orgs').doc(ctx.orgId).collection('tasks').doc(req.params.taskId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      res.status(404).json({ error: `Task "${req.params.taskId}" not found` });
      return;
    }

    const current = serialize<TaskDoc>(snapshot as FirebaseFirestore.QueryDocumentSnapshot);
    if (current.deletedAt) {
      res.status(404).json({ error: `Task "${req.params.taskId}" has been deleted` });
      return;
    }

    const currentUpdatedAt = typeof current.updatedAt === 'string' ? current.updatedAt : '';
    if (currentUpdatedAt && currentUpdatedAt !== updatedAt) {
      res.status(409).json({
        error: 'Conflict',
        message: 'Task has been modified since you last read it. Re-read the task and retry.',
        currentUpdatedAt,
        providedUpdatedAt: updatedAt,
      });
      return;
    }

    // フィールドマッピング（メタフィールドを除外）
    const { taskId: _tid, updatedAt: _uat, ...updateFields } = req.body;
    const mapped = mapTaskFields(updateFields);

    if (Object.keys(mapped).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    // assignee 更新時のバリデーション
    if (req.body.assignee) {
      const validation = await validateAssigneeUpdate({
        orgId: ctx.orgId,
        assignee: req.body.assignee,
      });
      if (validation.errors.length > 0) {
        res.status(422).json({
          error: 'Validation failed',
          errors: validation.errors,
        });
        return;
      }
    }

    await updateTask(req.params.taskId, mapped as Partial<TaskInput>, ctx.orgId);
    res.json({ taskId: req.params.taskId, message: 'Task updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /tasks/:taskId
router.delete('/tasks/:taskId', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    await deleteTask(req.params.taskId, ctx.orgId);
    res.json({ taskId: req.params.taskId, message: 'Task deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tasks/:taskId/complete
router.post('/tasks/:taskId/complete', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    const done = req.body.done !== undefined ? req.body.done : true;
    await completeTask(req.params.taskId, done, ctx.orgId);
    const action = done ? 'completed' : 'reverted to in-progress';
    res.json({ taskId: req.params.taskId, message: `Task ${action} successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// Stages
// ═══════════════════════════════════════════

// GET /projects/:projectId/stages
router.get('/projects/:projectId/stages', async (req, res) => {
  try {
    const ctx = getCtx(req);
    const stages = await listStages(req.params.projectId, ctx.orgId);
    res.json(stages.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      name: s.タスク名,
      startDate: s.予定開始日 ?? s.start ?? null,
      dueDate: s.期限 ?? s.end ?? null,
      orderIndex: s.orderIndex ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /projects/:projectId/stages
router.post('/projects/:projectId/stages', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    const stageId = await createStage({
      projectId: req.params.projectId,
      orgId: ctx.orgId,
      タスク名: req.body.name,
      予定開始日: req.body.startDate ?? null,
      期限: req.body.dueDate ?? null,
      orderIndex: req.body.orderIndex ?? null,
    });
    res.status(201).json({ stageId, message: `Stage "${req.body.name}" created successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /stages/:stageId
router.patch('/stages/:stageId', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) updates['タスク名'] = req.body.name;
    if (req.body.startDate !== undefined) updates['予定開始日'] = req.body.startDate;
    if (req.body.dueDate !== undefined) updates['期限'] = req.body.dueDate;
    if (req.body.orderIndex !== undefined) updates['orderIndex'] = req.body.orderIndex;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    await updateStage(req.params.stageId, updates as any, ctx.orgId);
    res.json({ stageId: req.params.stageId, message: 'Stage updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /stages/:stageId
router.delete('/stages/:stageId', async (req, res) => {
  try {
    const ctx = getCtx(req);
    if (!requireWriter(ctx, res)) return;

    await deleteStage(req.params.stageId, ctx.orgId);
    res.json({ stageId: req.params.stageId, message: 'Stage deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// Users
// ═══════════════════════════════════════════

// GET /users
router.get('/users', async (req, res) => {
  try {
    const ctx = getCtx(req);
    const role = req.query.role as string | undefined;
    const users = await listUsers({
      orgId: ctx.orgId,
      role: role as any,
      isActive: true,
    });
    res.json(users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      jobTitle: u.jobTitle ?? null,
      department: u.department ?? null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as gptRestApiRouter };
