import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import {
  completeTask as completeTaskRepo,
  createTask,
  listTasks,
  updateTask,
  moveTaskDates,
  TaskInput,
  recordTaskCreator,
  canEditTask,
} from '../lib/firestore';
import { enqueueNotificationSeed } from '../lib/jobs';
import { listUserProjects } from '../lib/project-members';
import { getUser } from '../lib/users';

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

    // 管理者は全タスクを取得
    if (user.role === 'admin') {
      const tasks = await listTasks({ ...params, orgId: user.orgId });
      res.json({ tasks });
      return;
    }

    // 一般ユーザーは参加しているプロジェクトのタスクのみ取得
    const userProjectMemberships = await listUserProjects(user.orgId, user.id);
    const projectIds = userProjectMemberships.map(m => m.projectId);

    // プロジェクトIDでフィルタリング
    if (params.projectId && !projectIds.includes(params.projectId)) {
      // アクセス権がないプロジェクトのタスクは返さない
      res.json({ tasks: [] });
      return;
    }

    const tasks = await listTasks({ ...params, orgId: user.orgId });

    // ユーザーが参加しているプロジェクトのタスクのみフィルタ
    const filteredTasks = tasks.filter(task => projectIds.includes(task.projectId));

    res.json({ tasks: filteredTasks });
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
  担当者メール: z.string().email().optional().nullable(),
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
});

router.post('/', async (req: any, res, next) => {
  try {
    const payload = taskSchema.parse(req.body) as TaskInput;
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 管理者以外はメンバーシップをチェック
    if (user.role !== 'admin') {
      const userProjectMemberships = await listUserProjects(user.orgId, user.id);
      const projectIds = userProjectMemberships.map(m => m.projectId);

      if (!projectIds.includes(payload.projectId)) {
        return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
      }
    }

    const id = await createTask(payload, user.orgId);

    // タスク作成者を記録
    await recordTaskCreator(id, user.email, user.orgId);

    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req: any, res, next) => {
  try {
    const payload = taskSchema.partial().parse(req.body) as Partial<TaskInput>;
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

    // 管理者以外はメンバーシップをチェック
    if (user.role !== 'admin') {
      const userProjectMemberships = await listUserProjects(user.orgId, user.id);
      const projectIds = userProjectMemberships.map(m => m.projectId);

      if (!projectIds.includes(task.projectId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // タスク編集権限チェック（自分が作成したタスクのみ編集可能）
    const hasEditPermission = await canEditTask(req.params.id, user.email, user.orgId);
    if (!hasEditPermission) {
      return res.status(403).json({ error: 'Forbidden: You can only edit tasks you created' });
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

    // 管理者以外はメンバーシップをチェック
    if (user.role !== 'admin') {
      const userProjectMemberships = await listUserProjects(user.orgId, user.id);
      const projectIds = userProjectMemberships.map(m => m.projectId);

      if (!projectIds.includes(task.projectId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

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

    // 管理者以外はメンバーシップをチェック
    if (user.role !== 'admin') {
      const userProjectMemberships = await listUserProjects(user.orgId, user.id);
      const projectIds = userProjectMemberships.map(m => m.projectId);

      if (!projectIds.includes(task.projectId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // タスク編集権限チェック（自分が作成したタスクのみ移動可能）
    const hasEditPermission = await canEditTask(req.params.id, user.email, user.orgId);
    if (!hasEditPermission) {
      return res.status(403).json({ error: 'Forbidden: You can only move tasks you created' });
    }

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

export default router;
