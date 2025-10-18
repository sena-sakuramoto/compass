import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import {
  addProjectMember,
  getProjectMember,
  listProjectMembers,
  updateProjectMember,
  removeProjectMember,
  acceptProjectInvitation,
  listUserProjects,
} from '../lib/project-members';
import { ProjectMemberInput } from '../lib/auth-types';
import { canManageProjectMembers } from '../lib/access-control';
import { getUser } from '../lib/users';
import { getProject } from '../lib/firestore';

const router = Router();

/**
 * 認証ミドルウェア
 */
async function authenticate(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    
    const user = await getUser(decodedToken.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = user;
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * GET /api/projects/:projectId/members
 * プロジェクトメンバー一覧を取得
 */
router.get('/projects/:projectId/members', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const { role, status, orgId } = req.query;
    
    // プロジェクトを取得
    const project = await getProject(req.user.orgId, projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const members = await listProjectMembers(req.user.orgId, projectId, {
      role,
      status,
      orgId,
    });
    
    res.json(members);
  } catch (error) {
    console.error('Error listing project members:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/projects/:projectId/members
 * プロジェクトメンバーを追加（招待）
 */
router.post('/projects/:projectId/members', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const input: ProjectMemberInput = req.body;
    
    // プロジェクトを取得
    const project = await getProject(req.user.orgId, projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // 権限チェック
    const canManage = await canManageProjectMembers(req.user, project as any, req.user.orgId);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const member = await addProjectMember(
      req.user.orgId,
      projectId,
      input,
      req.uid
    );
    
    res.status(201).json(member);
  } catch (error) {
    console.error('Error adding project member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/projects/:projectId/members/:userId
 * プロジェクトメンバーを更新
 */
router.patch('/projects/:projectId/members/:userId', authenticate, async (req: any, res) => {
  try {
    const { projectId, userId } = req.params;
    const updates = req.body;
    
    // プロジェクトを取得
    const project = await getProject(req.user.orgId, projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // 権限チェック
    const canManage = await canManageProjectMembers(req.user, project as any, req.user.orgId);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    await updateProjectMember(req.user.orgId, projectId, userId, updates);
    
    const updatedMember = await getProjectMember(req.user.orgId, projectId, userId);
    res.json(updatedMember);
  } catch (error) {
    console.error('Error updating project member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/projects/:projectId/members/:userId
 * プロジェクトメンバーを削除
 */
router.delete('/projects/:projectId/members/:userId', authenticate, async (req: any, res) => {
  try {
    const { projectId, userId } = req.params;
    
    // プロジェクトを取得
    const project = await getProject(req.user.orgId, projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // 権限チェック
    const canManage = await canManageProjectMembers(req.user, project as any, req.user.orgId);
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    await removeProjectMember(req.user.orgId, projectId, userId);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error removing project member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/projects/:projectId/members/:userId/accept
 * プロジェクトメンバーの招待を承認
 */
router.post('/projects/:projectId/members/:userId/accept', authenticate, async (req: any, res) => {
  try {
    const { projectId, userId } = req.params;
    
    // 自分自身の招待のみ承認可能
    if (req.uid !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    await acceptProjectInvitation(req.user.orgId, projectId, userId);
    
    const updatedMember = await getProjectMember(req.user.orgId, projectId, userId);
    res.json(updatedMember);
  } catch (error) {
    console.error('Error accepting project invitation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users/:userId/projects
 * ユーザーが参加しているプロジェクト一覧を取得
 */
router.get('/users/:userId/projects', authenticate, async (req: any, res) => {
  try {
    const { userId } = req.params;
    
    // 自分自身または管理者のみ取得可能
    if (req.uid !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const projects = await listUserProjects(req.user.orgId, userId);
    
    res.json(projects);
  } catch (error) {
    console.error('Error listing user projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

