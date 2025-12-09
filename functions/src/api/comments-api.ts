/**
 * タスクコメントAPI
 */

import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { getUser } from '../lib/users';
import { listUserProjects } from '../lib/project-members';
import { db, FieldValue } from '../lib/firestore';

const router = Router();

router.use(authMiddleware());

const createCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

interface Comment {
  id: string;
  taskId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

/**
 * GET /api/tasks/:taskId/comments
 * タスクのコメント一覧を取得
 */
router.get('/tasks/:taskId/comments', async (req: any, res, next) => {
  try {
    const { taskId } = req.params;

    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // タスクを取得してプロジェクトIDを確認
    const taskDoc = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('tasks')
      .doc(taskId)
      .get();

    if (!taskDoc.exists) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskDoc.data()!;

    // プロジェクトメンバーシップをチェック
    const userProjectMemberships = await listUserProjects(user.orgId, req.uid);
    const membership = userProjectMemberships.find(m => m.projectId === task.projectId);

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    // コメント一覧を取得
    const commentsSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('tasks')
      .doc(taskId)
      .collection('comments')
      .orderBy('createdAt', 'asc')
      .get();

    const comments = commentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ comments });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tasks/:taskId/comments
 * タスクにコメントを追加
 */
router.post('/tasks/:taskId/comments', async (req: any, res, next) => {
  try {
    const { taskId } = req.params;
    const { content } = createCommentSchema.parse(req.body);

    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // タスクを取得してプロジェクトIDを確認
    const taskDoc = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('tasks')
      .doc(taskId)
      .get();

    if (!taskDoc.exists) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskDoc.data()!;

    // プロジェクトメンバーシップをチェック
    const userProjectMemberships = await listUserProjects(user.orgId, req.uid);
    const membership = userProjectMemberships.find(m => m.projectId === task.projectId);

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: Not a member of this project' });
    }

    // コメントを作成
    const commentRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('tasks')
      .doc(taskId)
      .collection('comments')
      .doc();

    const commentData = {
      taskId,
      content,
      authorId: req.uid,
      authorName: user.displayName || user.email || 'Unknown',
      authorEmail: user.email || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await commentRef.set(commentData);

    // タスクの更新日時も更新
    await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('tasks')
      .doc(taskId)
      .update({
        updatedAt: FieldValue.serverTimestamp(),
      });

    res.status(201).json({
      id: commentRef.id,
      ...commentData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/tasks/:taskId/comments/:commentId
 * コメントを削除（作成者のみ）
 */
router.delete('/tasks/:taskId/comments/:commentId', async (req: any, res, next) => {
  try {
    const { taskId, commentId } = req.params;

    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // コメントを取得
    const commentRef = db
      .collection('orgs')
      .doc(user.orgId)
      .collection('tasks')
      .doc(taskId)
      .collection('comments')
      .doc(commentId);

    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentDoc.data()!;

    // 作成者のみ削除可能
    if (comment.authorId !== req.uid) {
      return res.status(403).json({ error: 'Forbidden: Only the author can delete this comment' });
    }

    await commentRef.delete();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
