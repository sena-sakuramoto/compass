import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ProjectMember, ProjectMemberInput, User } from './auth-types';
import { ProjectRole, getProjectRolePermissions, ProjectPermissions } from './roles';
import { getUser, getUserByEmail } from './users';
import { getOrganization } from './users';
import { sendProjectInvitationEmail } from './email';

const db = getFirestore();

/**
 * プロジェクトメンバーを追加（招待）
 */
export async function addProjectMember(
  orgId: string,
  projectId: string,
  projectName: string,
  input: ProjectMemberInput,
  invitedBy: string,
  invitedByName: string
): Promise<ProjectMember> {
  const now = Timestamp.now();

  // メールアドレスからユーザーを検索
  const user = await getUserByEmail(input.email);

  // 権限を設定（カスタム権限がある場合はそれを使用、なければロールのデフォルト権限）
  const permissions: ProjectPermissions = input.permissions
    ? { ...getProjectRolePermissions(input.role), ...input.permissions }
    : getProjectRolePermissions(input.role);

  let member: ProjectMember;

  if (user) {
    // 既存ユーザーの場合
    const org = await getOrganization(user.orgId);

    member = {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      orgId: user.orgId,
      orgName: org?.name || user.orgId,
      role: input.role,
      職種: user.職種,
      permissions,
      invitedBy,
      invitedAt: now,
      status: 'invited',
    };

    await db
      .collection('orgs').doc(orgId)
      .collection('projects').doc(projectId)
      .collection('members').doc(user.id)
      .set(member);
  } else {
    // 未登録ユーザーの場合、メールアドレスをキーとして招待レコードを作成
    // ユーザーが初回ログイン時に、このレコードを自分のUIDに紐付ける
    const userId = `pending_${input.email.replace(/[^a-zA-Z0-9]/g, '_')}`;

    member = {
      userId,
      email: input.email,
      displayName: input.email.split('@')[0],
      orgId,
      orgName: '',
      role: input.role,
      permissions,
      invitedBy,
      invitedAt: now,
      status: 'invited',
    };

    await db
      .collection('orgs').doc(orgId)
      .collection('projects').doc(projectId)
      .collection('members').doc(userId)
      .set(member);
  }

  // プロジェクトのメンバー数を更新
  await updateProjectMemberCount(orgId, projectId);

  // 招待メール送信（非同期、エラーでも処理は続行）
  sendProjectInvitationEmail(
    input.email,
    projectName,
    invitedByName,
    input.role,
    input.message
  ).catch(err => console.error('Failed to send invitation email:', err));

  return member;
}

/**
 * プロジェクトメンバーを取得
 */
export async function getProjectMember(
  orgId: string,
  projectId: string,
  userId: string
): Promise<ProjectMember | null> {
  const doc = await db
    .collection('orgs').doc(orgId)
    .collection('projects').doc(projectId)
    .collection('members').doc(userId)
    .get();
  
  if (!doc.exists) return null;
  return doc.data() as ProjectMember;
}

/**
 * プロジェクトメンバー一覧を取得
 */
export async function listProjectMembers(
  orgId: string,
  projectId: string,
  filters?: {
    role?: ProjectRole;
    status?: ProjectMember['status'];
    orgId?: string;
  }
): Promise<ProjectMember[]> {
  let query = db
    .collection('orgs').doc(orgId)
    .collection('projects').doc(projectId)
    .collection('members') as FirebaseFirestore.Query;
  
  if (filters?.role) {
    query = query.where('role', '==', filters.role);
  }
  
  if (filters?.status) {
    query = query.where('status', '==', filters.status);
  }
  
  if (filters?.orgId) {
    query = query.where('orgId', '==', filters.orgId);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as ProjectMember);
}

/**
 * プロジェクトメンバーを更新
 */
export async function updateProjectMember(
  orgId: string,
  projectId: string,
  userId: string,
  updates: Partial<Pick<ProjectMember, 'role' | 'permissions' | 'status'>>
): Promise<void> {
  const memberRef = db
    .collection('orgs').doc(orgId)
    .collection('projects').doc(projectId)
    .collection('members').doc(userId);
  
  // ロールが変更された場合、権限も更新
  if (updates.role) {
    const currentMember = await getProjectMember(orgId, projectId, userId);
    if (currentMember) {
      updates.permissions = getProjectRolePermissions(updates.role);
    }
  }
  
  await memberRef.update(updates);
}

/**
 * プロジェクトメンバーを削除
 */
export async function removeProjectMember(
  orgId: string,
  projectId: string,
  userId: string
): Promise<void> {
  await db
    .collection('orgs').doc(orgId)
    .collection('projects').doc(projectId)
    .collection('members').doc(userId)
    .delete();
  
  // プロジェクトのメンバー数を更新
  await updateProjectMemberCount(orgId, projectId);
}

/**
 * プロジェクトメンバーの招待を承認（アクティブ化）
 */
export async function acceptProjectInvitation(
  orgId: string,
  projectId: string,
  userId: string
): Promise<void> {
  const now = Timestamp.now();
  await db
    .collection('orgs').doc(orgId)
    .collection('projects').doc(projectId)
    .collection('members').doc(userId)
    .update({
      status: 'active',
      joinedAt: now,
    });
}

/**
 * ユーザーがメンバーとして参加しているプロジェクト一覧を取得
 */
export async function listUserProjects(
  orgId: string,
  userId: string
): Promise<Array<{ projectId: string; member: ProjectMember }>> {
  // すべてのプロジェクトを検索してメンバーシップを確認
  const projectsSnapshot = await db
    .collection('orgs').doc(orgId)
    .collection('projects')
    .get();
  
  const results: Array<{ projectId: string; member: ProjectMember }> = [];
  
  for (const projectDoc of projectsSnapshot.docs) {
    const memberDoc = await projectDoc.ref
      .collection('members')
      .doc(userId)
      .get();
    
    if (memberDoc.exists) {
      results.push({
        projectId: projectDoc.id,
        member: memberDoc.data() as ProjectMember,
      });
    }
  }
  
  return results;
}

/**
 * プロジェクトのメンバー数を更新
 */
async function updateProjectMemberCount(
  orgId: string,
  projectId: string
): Promise<void> {
  const members = await listProjectMembers(orgId, projectId, { status: 'active' });
  
  // プロジェクトオーナーの組織IDを取得
  const projectDoc = await db
    .collection('orgs').doc(orgId)
    .collection('projects').doc(projectId)
    .get();
  
  if (!projectDoc.exists) return;
  
  const projectData = projectDoc.data();
  const ownerOrgId = projectData?.ownerOrgId;
  
  // 外部メンバー数をカウント
  const externalMembers = members.filter(m => m.orgId !== ownerOrgId);
  
  await db
    .collection('orgs').doc(orgId)
    .collection('projects').doc(projectId)
    .update({
      memberCount: members.length,
      externalMemberCount: externalMembers.length,
      updatedAt: Timestamp.now(),
    });
}

/**
 * ユーザーがプロジェクトのメンバーかどうかを確認
 */
export async function isProjectMember(
  orgId: string,
  projectId: string,
  userId: string
): Promise<boolean> {
  const member = await getProjectMember(orgId, projectId, userId);
  return member !== null && member.status === 'active';
}

/**
 * ユーザーのプロジェクト内の権限を取得
 */
export async function getProjectMemberPermissions(
  orgId: string,
  projectId: string,
  userId: string
): Promise<ProjectPermissions | null> {
  const member = await getProjectMember(orgId, projectId, userId);
  return member?.permissions ?? null;
}

