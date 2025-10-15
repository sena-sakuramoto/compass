import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { db } from '../lib/firebase';

const router = Router();

router.use(authMiddleware());

// プロジェクト設定のスキーマ
const projectSettingsSchema = z.object({
  projectId: z.string().min(1),
  settings: z.object({
    viewMode: z.enum(['board', 'gantt', 'backlog', 'reports']).optional(),
    filters: z.object({
      status: z.string().optional(),
      assignee: z.string().optional(),
      priority: z.string().optional(),
      sprint: z.string().optional(),
    }).optional(),
    groupBy: z.enum(['', 'project', 'assignee', 'status', 'priority', 'sprint']).optional(),
    boardColumns: z.array(z.object({
      id: z.string(),
      label: z.string(),
      color: z.string(),
      visible: z.boolean().optional(),
    })).optional(),
  }),
});

// プロジェクト設定を取得
router.get('/projects/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const doc = await db.collection('projectSettings').doc(projectId).get();

    if (!doc.exists) {
      return res.json({
        settings: {
          viewMode: 'board',
          filters: {},
          groupBy: '',
        }
      });
    }

    res.json({ settings: doc.data() });
  } catch (error) {
    next(error);
  }
});

// プロジェクト設定を保存
router.put('/projects/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const payload = projectSettingsSchema.parse({
      projectId,
      settings: req.body,
    });

    await db.collection('projectSettings').doc(projectId).set({
      ...payload.settings,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ナビゲーション設定のスキーマ
const navigationConfigSchema = z.object({
  navigationItems: z.array(z.object({
    id: z.string(),
    label: z.string(),
    path: z.string(),
    icon: z.string(),
    visible: z.boolean(),
    order: z.number(),
  })),
});

// ナビゲーション設定を取得
router.get('/navigation', async (_req, res, next) => {
  try {
    const doc = await db.collection('globalSettings').doc('navigation').get();

    if (!doc.exists) {
      // デフォルト設定を返す
      return res.json({
        navigationItems: [
          { id: 'home', label: 'ホーム', path: '/', icon: 'Home', visible: true, order: 0 },
          { id: 'projects', label: 'プロジェクト', path: '/projects', icon: 'FolderKanban', visible: true, order: 1 },
          { id: 'tasks', label: 'タスク', path: '/tasks', icon: 'ListChecks', visible: true, order: 2 },
          { id: 'schedule', label: 'スケジュール', path: '/schedule', icon: 'BarChart3', visible: true, order: 3 },
        ]
      });
    }

    res.json(doc.data());
  } catch (error) {
    next(error);
  }
});

// ナビゲーション設定を保存
router.put('/navigation', async (req, res, next) => {
  try {
    const payload = navigationConfigSchema.parse(req.body);

    await db.collection('globalSettings').doc('navigation').set({
      ...payload,
      updatedAt: new Date().toISOString(),
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
