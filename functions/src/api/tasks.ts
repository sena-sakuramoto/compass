import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import {
  completeTask as completeTaskRepo,
  createTask,
  listTasks,
  updateTask,
  deleteTask as deleteTaskRepo,
  moveTaskDates,
  TaskInput,
  recordTaskCreator,
  canEditTask,
  getProject,
} from '../lib/firestore';
import { getUser } from '../lib/users';
import { enqueueNotificationSeed } from '../lib/jobs';
import { listUserProjects } from '../lib/project-members';
import { canDeleteTask } from '../lib/access-control';
import { logActivity } from '../lib/activity-log';

const router = Router();

router.use(authMiddleware());

const listQuerySchema = z.object({
  projectId: z.string().optional(),
  assignee: z.string().optional(),
  assigneeEmail: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

router.get('/', async (req: any, res, next) => {
  try {
    const params = listQuerySchema.parse(req.query);
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // ユーザーが参加している全プロジェクトを取得（クロスオーガナイゼーション対応）
    const userProjectMemberships = await listUserProjects(null, req.uid);
    const projectIds = userProjectMemberships.map(m => m.projectId);

    if (projectIds.length === 0) {
      res.json({ tasks: [] });
      return;
    }

    // プロジェクトIDでフィルタリング
    if (params.projectId && !projectIds.includes(params.projectId)) {
      // アクセス権がないプロジェクトのタスクは返さない
      res.json({ tasks: [] });
      return;
    }

    // 各組織からタスクを取得
    const orgIds = new Set(userProjectMemberships.map(m => m.member.orgId));
    const allTasks: any[] = [];

    for (const orgId of orgIds) {
      const orgTasks = await listTasks({ ...params, orgId });
      // この組織でユーザーがアクセスできるプロジェクトのタスクのみ
      const accessibleProjectIds = userProjectMemberships
        .filter(m => m.member.orgId === orgId)
        .map(m => m.projectId);
      const filtered = orgTasks.filter(task => accessibleProjectIds.includes(task.projectId));
      allTasks.push(...filtered);
    }

    res.json({ tasks: allTasks });
  } catch (error) {
    next(error);
  }
});

const notificationSchema = z
  .object({
    開始日: z.boolean().optional(),
    期限前日: z.boolean().optional(),
    期限当日: z.boolean().optional(),
    超過: z.boolean().optional(),
  })
  .partial()
  .optional()
  .nullable();

const taskSchema = z.object({
  projectId: z.string().min(1),
  タスク名: z.string().min(1),
  タスク種別: z.string().optional().nullable(),
  担当者: z.string().optional().nullable(),
  assignee: z.string().optional().nullable(),
  担当者メール: z.union([z.string().email(), z.literal('')]).optional().nullable(),
  優先度: z.string().optional().nullable(),
  ステータス: z.string().min(1),
  予定開始日: z.string().optional().nullable(),
  期限: z.string().optional().nullable(),
  実績開始日: z.string().optional().nullable(),
  実績完了日: z.string().optional().nullable(),
  start: z.string().optional().nullable(),
  end: z.string().optional().nullable(),
  duration_days: z.number().optional().nullable(),
  progress: z.number().optional().nullable(),
  ['工数見積(h)']: z.number().optional().nullable(),
  ['工数実績(h)']: z.number().optional().nullable(),
  依頼元: z.string().optional().nullable(),
  '依存タスク': z.array(z.string()).optional().nullable(),
  'カレンダーイベントID': z.string().optional().nullable(),
  '通知設定': notificationSchema,
  マイルストーン: z.boolean().optional().nullable(),
  スプリント: z.string().optional().nullable(),
  フェーズ: z.string().optional().nullable(),
  // WorkItem 統合: 工程(stage)への紐づけ
  parentId: z.string().optional().nullable(),  // stageId として使用
  orderIndex: z.number().optional().nullable(),
});

router.post('/', async (req: any, res, next) => {
  try {
    console.log('[POST /tasks] Request body:', JSON.stringify(req.body));
    const payload = taskSchema.parse(req.body) as TaskInput;
    console.log('[POST /tasks] Parsed payload:', JSON.stringify(payload));
    console.log('[POST /tasks] Payload has id?', 'id' in payload, 'TaskID' in payload);

    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // プロジェクトメンバーシップをチェック
    const userProjectMemberships = await listUserProjects(user.orgId, req.uid);
    const membership = userProjectMemberships.find(m => m.projectId === payload.projectId);

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    // 権限チェック
    const { getProjectMemberPermissions } = await import('../lib/project-members');
    const permissions = await getProjectMemberPermissions(user.orgId, payload.projectId, req.uid);

    if (!permissions || !permissions.canCreateTasks) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to create tasks' });
    }

    const id = await createTask(payload, user.orgId);
    console.log('[POST /tasks] Task created with ID:', id);

    // タスク作成者を記録
    await recordTaskCreator(id, user.id, user.orgId);

    res.status(201).json({ id });
  } catch (error) {
    console.error('[POST /tasks] Error:', error);
    next(error);
  }
});

router.patch('/:id', async (req: any, res, next) => {
  try {
    console.log('[PATCH /tasks/:id] Request body:', JSON.stringify(req.body));
    const payload = taskSchema.partial().parse(req.body) as Partial<TaskInput>;
    console.log('[PATCH /tasks/:id] Parsed payload:', JSON.stringify(payload));
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // タスクを取得してプロジェクトIDを確認
    const tasks = await listTasks({ orgId: user.orgId });
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // プロジェクトメンバーシップをチェック
    const userProjectMemberships = await listUserProjects(user.orgId, req.uid);
    const membership = userProjectMemberships.find(m => m.projectId === task.projectId);

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    // 権限チェック
    const { getProjectMemberPermissions } = await import('../lib/project-members');
    const permissions = await getProjectMemberPermissions(user.orgId, task.projectId, req.uid);

    if (!permissions || !permissions.canEditTasks) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to edit tasks' });
    }

    // memberロールの場合は自分が担当者のタスクのみ編集可能
    if (membership.member.role === 'member') {
      const isAssignee = task.担当者 === user.displayName ||
                        task.担当者 === user.email ||
                        task.assignee === req.uid;

      if (!isAssignee) {
        return res.status(403).json({ error: 'Forbidden: Members can only edit their own tasks' });
      }
    }

    await updateTask(req.params.id, payload, user.orgId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const completeSchema = z.object({ done: z.boolean() });

router.post('/:id/complete', async (req: any, res, next) => {
  try {
    const { done } = completeSchema.parse(req.body);
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // タスクを取得してプロジェクトIDを確認
    const tasks = await listTasks({ orgId: user.orgId });
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // プロジェクトメンバーシップをチェック
    const userProjectMemberships = await listUserProjects(user.orgId, req.uid);
    const projectIds = userProjectMemberships.map(m => m.projectId);

    if (!projectIds.includes(task.projectId)) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    // プロジェクトメンバーであれば誰でも完了操作可能
    await completeTaskRepo(req.params.id, done, user.orgId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const moveSchema = z
  .object({
    予定開始日: z.string().optional().nullable(),
    期限: z.string().optional().nullable(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: '少なくとも1つのフィールドが必要です',
  });

router.post('/:id/move', async (req: any, res, next) => {
  try {
    const payload = moveSchema.parse(req.body);
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // タスクを取得してプロジェクトIDを確認
    const tasks = await listTasks({ orgId: user.orgId });
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // プロジェクトメンバーシップをチェック
    const userProjectMemberships = await listUserProjects(user.orgId, req.uid);
    const projectIds = userProjectMemberships.map(m => m.projectId);

    if (!projectIds.includes(task.projectId)) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    // プロジェクトメンバーであれば誰でも移動可能
    await moveTaskDates(req.params.id, payload, user.orgId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/seed-reminders', async (req, res, next) => {
  try {
    await enqueueNotificationSeed({ taskId: req.params.id, reason: 'manual' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // タスクを取得してプロジェクトIDを確認
    const tasks = await listTasks({ orgId: user.orgId });
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // プロジェクト情報を取得
    const project = await getProject(user.orgId, task.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // 削除権限をチェック（admin、タスク作成者、canDeleteTasks権限を持つメンバー）
    const hasPermission = await canDeleteTask(user, task as any, project as any, user.orgId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this task' });
    }

    // タスクを削除
    await deleteTaskRepo(req.params.id, user.orgId);

    // アクティビティログを記録
    await logActivity({
      orgId: user.orgId,
      projectId: task.projectId,
      type: 'task.deleted',
      userId: user.id,
      userName: user.displayName || '',
      userEmail: user.email || '',
      targetType: 'task',
      targetId: req.params.id,
      targetName: task.タスク名,
      action: '削除',
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
