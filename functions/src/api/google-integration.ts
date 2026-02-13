/**
 * Google連携設定 API
 * 組織単位でのDrive/Chat連携設定を管理
 */

import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ensureFirebaseAdmin } from '../lib/firebaseAdmin';
import { getUser } from '../lib/users';
import { DEFAULT_GOOGLE_INTEGRATION_SETTINGS, GoogleIntegrationSettings } from '../lib/types';

ensureFirebaseAdmin();

const db = getFirestore();

const router = Router();

router.use(authMiddleware());

// 設定更新のスキーマ
const googleIntegrationSettingsSchema = z.object({
  drive: z.object({
    enabled: z.boolean(),
    parentFolderId: z.string().nullable(),
    parentFolderUrl: z.string().nullable(),
    folderNameTemplate: z.string().min(1),
  }),
  chat: z.object({
    enabled: z.boolean(),
    spaceNameTemplate: z.string().min(1),
    defaultDescription: z.string().nullable(),
  }),
  memberSyncMode: z.enum(['none', 'addOnly']),
});

/**
 * adminかどうかをチェック
 */
function isAdmin(role?: string): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'owner';
}

/**
 * GET /api/org/google-integration
 * 組織のGoogle連携設定を取得
 */
router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // admin以上のみ設定を取得可能
    if (!isAdmin(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const orgId = user.orgId;
    const doc = await db.collection('orgs').doc(orgId).collection('settings').doc('google-integration').get();

    if (!doc.exists) {
      // デフォルト設定を返す
      return res.json({
        settings: {
          ...DEFAULT_GOOGLE_INTEGRATION_SETTINGS,
          updatedAt: null,
          updatedBy: null,
        },
      });
    }

    const data = doc.data();
    res.json({
      settings: {
        drive: data?.drive ?? DEFAULT_GOOGLE_INTEGRATION_SETTINGS.drive,
        chat: data?.chat ?? DEFAULT_GOOGLE_INTEGRATION_SETTINGS.chat,
        memberSyncMode: data?.memberSyncMode ?? DEFAULT_GOOGLE_INTEGRATION_SETTINGS.memberSyncMode,
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString() ?? null,
        updatedBy: data?.updatedBy ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/org/google-integration
 * 組織のGoogle連携設定を更新
 */
router.put('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // admin以上のみ設定を更新可能
    if (!isAdmin(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const payload = googleIntegrationSettingsSchema.parse(req.body);
    const orgId = user.orgId;

    await db.collection('orgs').doc(orgId).collection('settings').doc('google-integration').set({
      ...payload,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.id,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/org/google-integration/status
 * 連携設定のステータス確認（一般ユーザー向け）
 */
router.get('/status', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const orgId = user.orgId;
    const doc = await db.collection('orgs').doc(orgId).collection('settings').doc('google-integration').get();

    if (!doc.exists) {
      return res.json({
        driveEnabled: false,
        chatEnabled: false,
      });
    }

    const data = doc.data();
    res.json({
      driveEnabled: data?.drive?.enabled ?? false,
      chatEnabled: data?.chat?.enabled ?? false,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
