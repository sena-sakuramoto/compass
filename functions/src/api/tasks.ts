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
} from '../lib/firestore';
import { enqueueNotificationSeed } from '../lib/jobs';

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

router.get('/', async (req, res, next) => {
  try {
    const params = listQuerySchema.parse(req.query);
    const tasks = await listTasks(params);
    res.json({ tasks });
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

router.post('/', async (req, res, next) => {
  try {
    const payload = taskSchema.parse(req.body) as TaskInput;
    const id = await createTask(payload);
    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const payload = taskSchema.partial().parse(req.body) as Partial<TaskInput>;
    await updateTask(req.params.id, payload);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const completeSchema = z.object({ done: z.boolean() });

router.post('/:id/complete', async (req, res, next) => {
  try {
    const { done } = completeSchema.parse(req.body);
    await completeTaskRepo(req.params.id, done);
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

router.post('/:id/move', async (req, res, next) => {
  try {
    const payload = moveSchema.parse(req.body);
    await moveTaskDates(req.params.id, payload);
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
