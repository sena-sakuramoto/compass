/**
 * アプリ内通知API
 */

import express from 'express';
import { authMiddleware } from '../lib/auth';
import { db, FieldValue } from '../lib/firestore';

const router = express.Router();

router.use(authMiddleware());

export interface InAppNotification {
  id: string;
  userId: string;
  type: 'invitation' | 'task_assigned' | 'task_reminder' | 'project_update' | 'mention';
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: {
    projectId?: string;
    projectName?: string;
    taskId?: string;
    invitationId?: string;
    inviterName?: string;
    role?: string;
    [key: string]: any;
  };
  read: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}

/**
 * GET /api/notifications
 * 現在のユーザーの通知一覧を取得
 */
router.get('/', async (req: any, res) => {
  try {
    const { limit = 50, unreadOnly = false } = req.query;
    const parsedLimit = Number.parseInt(String(limit), 10);
    const limitNumber = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;
    const unreadOnlyFlag = unreadOnly === 'true' || unreadOnly === true;

    let query = db
      .collection('notifications')
      .where('userId', '==', req.uid);

    if (unreadOnlyFlag) {
      query = query.where('read', '==', false);
    }

    const snapshot = await query.get();

    const notifications = snapshot.docs
      .map(doc => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate?.() ?? new Date(0);
        return {
          id: doc.id,
          ...data,
          createdAt: createdAt.toISOString(),
          _createdAtMs: createdAt.getTime(),
        };
      })
      .sort((a, b) => (b._createdAtMs || 0) - (a._createdAtMs || 0))
      .slice(0, limitNumber)
      .map(({ _createdAtMs, ...rest }) => rest);

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/notifications/unread-count
 * 未読通知数を取得
 */
router.get('/unread-count', async (req: any, res) => {
  try {
    const snapshot = await db
      .collection('notifications')
      .where('userId', '==', req.uid)
      .where('read', '==', false)
      .count()
      .get();

    res.json({ count: snapshot.data().count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/notifications/:notificationId/read
 * 通知を既読にする
 */
router.patch('/:notificationId/read', async (req: any, res) => {
  try {
    const { notificationId } = req.params;

    const notificationRef = db.collection('notifications').doc(notificationId);
    const notification = await notificationRef.get();

    if (!notification.exists) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // 自分の通知のみ既読にできる
    if (notification.data()?.userId !== req.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await notificationRef.update({
      read: true,
      readAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * 全ての通知を既読にする
 */
router.post('/mark-all-read', async (req: any, res) => {
  try {
    const snapshot = await db
      .collection('notifications')
      .where('userId', '==', req.uid)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        read: true,
        readAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    res.json({ success: true, count: snapshot.size });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/notifications/:notificationId
 * 通知を削除
 */
router.delete('/:notificationId', async (req: any, res) => {
  try {
    const { notificationId } = req.params;

    const notificationRef = db.collection('notifications').doc(notificationId);
    const notification = await notificationRef.get();

    if (!notification.exists) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // 自分の通知のみ削除できる
    if (notification.data()?.userId !== req.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await notificationRef.delete();

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 通知を作成（内部ヘルパー関数）
 */
export async function createNotification(data: Omit<InAppNotification, 'id' | 'createdAt' | 'read'>): Promise<string> {
  const notificationRef = db.collection('notifications').doc();

  await notificationRef.set({
    ...data,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return notificationRef.id;
}

export default router;
