/**
 * Google OAuth API エンドポイント
 * Per-user Google接続の管理
 */

import { Router } from 'express';
import admin from 'firebase-admin';
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
 * GET /api/google/calendar-sync-settings
 * ユーザーのカレンダー双方向同期設定を取得
 */
router.get('/calendar-sync-settings', async (req: any, res, next) => {
  try {
    const uid = req.uid as string;
    const settingsDoc = await db
      .collection('users')
      .doc(uid)
      .collection('private')
      .doc('calendarSyncSettings')
      .get();

    if (!settingsDoc.exists) {
      return res.json({
        settings: {
          outbound: {
            enabled: false,
            calendarId: null,
            calendarName: null,
            lastSyncAt: null,
          },
          inbound: {
            enabled: false,
            calendarId: null,
            calendarName: null,
            syncMode: 'all',
            importAsType: 'task',
            defaultProjectId: null,
            syncToken: null,
            lastSyncAt: null,
          },
        },
      });
    }

    const data = settingsDoc.data();
    const outboundLastSync = data?.outbound?.lastSyncAt;
    const inboundLastSync = data?.inbound?.lastSyncAt;

    return res.json({
      settings: {
        outbound: {
          ...data?.outbound,
          lastSyncAt: outboundLastSync?.toDate?.()?.toISOString?.() ?? outboundLastSync ?? null,
        },
        inbound: {
          ...data?.inbound,
          lastSyncAt: inboundLastSync?.toDate?.()?.toISOString?.() ?? inboundLastSync ?? null,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PUT /api/google/calendar-sync-settings
 * ユーザーのカレンダー双方向同期設定を保存
 */
router.put('/calendar-sync-settings', async (req: any, res, next) => {
  try {
    const uid = req.uid as string;
    const { outbound, inbound } = req.body ?? {};

    if (!outbound || !inbound) {
      return res.status(400).json({ error: 'outbound and inbound settings are required' });
    }

    let calendar: any;
    try {
      calendar = await getUserCalendarClient(uid);
    } catch {
      return res.status(400).json({ error: 'Googleアカウントが接続されていません' });
    }

    if (outbound.enabled && outbound.calendarId) {
      try {
        await calendar.calendarList.get({ calendarId: outbound.calendarId });
      } catch {
        return res.status(400).json({
          error: `Outbound カレンダー（${outbound.calendarId}）にアクセスできません。カレンダーIDを確認してください。`,
        });
      }
    }

    if (inbound.enabled && inbound.calendarId) {
      try {
        await calendar.calendarList.get({ calendarId: inbound.calendarId });
      } catch {
        return res.status(400).json({
          error: `Inbound カレンダー（${inbound.calendarId}）にアクセスできません。カレンダーIDを確認してください。`,
        });
      }
    }

    if (
      outbound.enabled &&
      inbound.enabled &&
      outbound.calendarId &&
      inbound.calendarId &&
      outbound.calendarId === inbound.calendarId
    ) {
      return res.status(400).json({
        error: 'Outbound と Inbound に同じカレンダーは設定できません（ループが発生します）',
      });
    }

    const settingsRef = db
      .collection('users')
      .doc(uid)
      .collection('private')
      .doc('calendarSyncSettings');
    const existingDoc = await settingsRef.get();
    const existing = existingDoc.data();
    const inboundCalendarChanged = existing?.inbound?.calendarId !== inbound.calendarId;

    const settingsData = {
      outbound: {
        enabled: Boolean(outbound.enabled),
        calendarId: outbound.calendarId || null,
        calendarName: outbound.calendarName || null,
        lastSyncAt: existing?.outbound?.lastSyncAt ?? null,
      },
      inbound: {
        enabled: Boolean(inbound.enabled),
        calendarId: inbound.calendarId || null,
        calendarName: inbound.calendarName || null,
        syncMode: inbound.syncMode === 'accepted' ? 'accepted' : 'all',
        importAsType: inbound.importAsType === 'meeting' ? 'meeting' : 'task',
        defaultProjectId: inbound.defaultProjectId || null,
        syncToken: inboundCalendarChanged ? null : (existing?.inbound?.syncToken ?? null),
        lastSyncAt: inboundCalendarChanged ? null : (existing?.inbound?.lastSyncAt ?? null),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await settingsRef.set(settingsData, { merge: false });

    if (outbound.enabled && outbound.calendarId) {
      const tokenRef = db.collection('users').doc(uid).collection('private').doc('googleTokens');
      const tokenDoc = await tokenRef.get();
      if (tokenDoc.exists) {
        await tokenRef.update({ syncCalendarId: outbound.calendarId });
      }
    }

    return res.json({ ok: true });
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
