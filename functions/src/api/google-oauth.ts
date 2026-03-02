/**
 * Google OAuth API エンドポイント
 * Per-user Google接続の管理
 */

import { Router } from 'express';
import { authMiddleware } from '../lib/auth';
import {
  exchangeCodeForTokens,
  getUserCalendarClient,
  getUserGoogleTokens,
  revokeGoogleConnection,
} from '../lib/perUserGoogleClient';
import { db } from '../lib/firestore';
import type { TaskDoc } from '../lib/firestore';
import { syncTaskToCalendar } from '../lib/calendarSync';

const router = Router();

router.use(authMiddleware());

/**
 * POST /api/google/connect
 * Authorization code をトークンに交換して保存
 */
router.post('/connect', async (req: any, res, next) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const result = await exchangeCodeForTokens(req.uid, code);
    console.log('[google-oauth] Connected Google account:', result.email, 'for user:', req.uid);

    res.json({
      connected: true,
      email: result.email,
    });
  } catch (error: any) {
    console.error('[google-oauth] Failed to connect:', error);
    if (error.message?.includes('No refresh token')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * GET /api/google/status
 * 接続状態を確認
 */
router.get('/status', async (req: any, res, next) => {
  try {
    const tokens = await getUserGoogleTokens(req.uid);
    if (tokens?.refreshToken) {
      res.json({
        connected: true,
        email: tokens.connectedEmail || null,
        connectedAt: tokens.connectedAt || null,
      });
    } else {
      res.json({ connected: false });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/google/calendars
 * OAuth済みユーザーのGoogleカレンダー一覧を返す
 */
router.get('/calendars', async (req: any, res, next) => {
  try {
    const calendar = await getUserCalendarClient(req.uid);
    const listRes = await calendar.calendarList.list({ minAccessRole: 'writer' });
    const items = listRes.data.items ?? [];

    const tokens = await getUserGoogleTokens(req.uid);
    const syncCalendarId = tokens?.syncCalendarId ?? null;

    const calendars = items
      .filter((item) => typeof item.id === 'string' && item.id.length > 0)
      .map((item) => ({
        id: item.id as string,
        summary: item.summary ?? '(名称未設定)',
        primary: item.primary ?? false,
        backgroundColor: item.backgroundColor ?? undefined,
      }));

    res.json({ calendars, syncCalendarId });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/google/sync-calendar
 * 同期先カレンダーを変更。migrateExisting=trueで既存イベントも移動。
 */
router.patch('/sync-calendar', async (req: any, res, next) => {
  try {
    const { syncCalendarId, migrateExisting } = req.body ?? {};
    if (!syncCalendarId || typeof syncCalendarId !== 'string') {
      return res.status(400).json({ error: 'syncCalendarId is required' });
    }

    const uid = req.uid as string;
    const tokenRef = db.collection('users').doc(uid).collection('private').doc('googleTokens');
    const tokenDoc = await tokenRef.get();
    if (!tokenDoc.exists) {
      return res.status(400).json({ error: 'Google未連携です' });
    }

    const oldCalendarId = (tokenDoc.data()?.syncCalendarId as string | undefined) || 'primary';

    await tokenRef.update({ syncCalendarId });

    let migratedCount = 0;
    if (Boolean(migrateExisting) && oldCalendarId !== syncCalendarId) {
      const userDoc = await db.collection('users').doc(uid).get();
      const orgId = userDoc.data()?.orgId as string | undefined;
      if (orgId) {
        const tasksSnap = await db
          .collection('orgs')
          .doc(orgId)
          .collection('tasks')
          .where('カレンダーイベントID', '!=', null)
          .get();

        const calendar = await getUserCalendarClient(uid);
        for (const taskDoc of tasksSnap.docs) {
          const task = { id: taskDoc.id, ...taskDoc.data() } as TaskDoc;
          const eventId = task['カレンダーイベントID'];
          if (!eventId) continue;

          try {
            await calendar.events.delete({
              calendarId: oldCalendarId,
              eventId,
            }).catch(() => {
              // 404等は無視して新規作成に進む
            });

            await syncTaskToCalendar(task, 'sync', uid, orgId);
            migratedCount += 1;
          } catch (err) {
            console.warn('[sync-calendar] Failed to migrate event:', task.id, err);
          }
        }
      }
    }

    return res.json({ ok: true, syncCalendarId, migratedCount });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/google/disconnect
 * トークン失効・削除
 */
router.post('/disconnect', async (req: any, res, next) => {
  try {
    await revokeGoogleConnection(req.uid);
    console.log('[google-oauth] Disconnected Google account for user:', req.uid);
    res.json({ disconnected: true });
  } catch (error) {
    next(error);
  }
});

export default router;
