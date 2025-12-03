import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ProjectMember, ProjectMemberInput, User } from './auth-types';
import { ProjectRole, getProjectRolePermissions, ProjectPermissions } from './roles';
import { getUser, getUserByEmail } from './users';
import { getOrganization } from './users';

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

  // 入力バリデーション
  if (!input.role) {
    throw new Error('Role is required');
  }

  if (!input.email && !input.displayName) {
    throw new Error('Email or displayName is required');
  }

  if (!orgId || !projectId || !invitedBy) {
    throw new Error('Organization ID, project ID, and inviter ID are required');
  }

  // メールアドレスからユーザーを検索（メールアドレスがある場合のみ）
  const user = input.email ? await getUserByEmail(input.email) : null;

  // 権限を設定（カスタム権限がある場合はそれを使用、なければロールのデフォルト権限）
  const permissions: ProjectPermissions = input.permissions
    ? { ...getProjectRolePermissions(input.role), ...input.permissions }
    : getProjectRolePermissions(input.role);

  let member: ProjectMember;

  if (user) {
    // 既存ユーザーの場合 - 直接アクティブ化
    const org = await getOrganization(user.orgId);

    const memberId = `${projectId}_${user.id}`;
    member = {
      id: memberId,
      projectId,
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      orgId: user.orgId,
      orgName: org?.name || user.orgId,
      role: input.role,
      職種: input.職種 || user.職種, // 招待時に指定された職種を優先、なければユーザーの職種
      permissions,
      invitedBy,
      invitedAt: now,
      joinedAt: now, // 既存ユーザーは即座に参加
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // Top-level collection with composite ID
    await db.collection('project_members').doc(memberId).set(member);
  } else if (input.email) {
    // 未登録ユーザー（メールアドレスあり）の場合 - 招待状態で作成
    // ユーザーが初回ログイン時に、このレコードを自分のUIDに紐付ける
    const userId = `pending_${input.email.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const memberId = `${projectId}_${userId}`;

    member = {
      id: memberId,
      projectId,
      userId,
      email: input.email,
      displayName: input.displayName || input.email.split('@')[0],
      orgId,
      orgName: '',
      role: input.role,
      職種: input.職種, // 招待時に指定された職種
      permissions,
      invitedBy,
      invitedAt: now,
      // joinedAt は招待受諾時に設定
      status: 'invited', // 未登録ユーザーは招待状態
      createdAt: now,
      updatedAt: now,
    };

    // Top-level collection with composite ID
    await db.collection('project_members').doc(memberId).set(member);
  } else {
    // システム未登録ユーザー（テキスト入力のみ）の場合 - 外部メンバーとして作成
    const userId = `external_${input.displayName!.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    const memberId = `${projectId}_${userId}`;

    member = {
      id: memberId,
      projectId,
      userId,
      email: '',
      displayName: input.displayName!,
      orgId: 'external', // 外部メンバー
      orgName: '外部',
      role: input.role,
      職種: input.職種, // 招待時に指定された職種
      permissions,
      invitedBy,
      invitedAt: now,
      joinedAt: now, // テキスト入力の場合は即座に参加扱い
      status: 'active', // テキスト入力の場合は即座にアクティブ
      createdAt: now,
      updatedAt: now,
    };

    // Top-level collection with composite ID
    await db.collection('project_members').doc(memberId).set(member);
  }

  // プロジェクトのメンバー数を更新（インクリメント）
  // 既存ユーザー（active）の場合のみカウント
  if (member.status === 'active') {
    await updateProjectMemberCount(orgId, projectId, member.orgId, true);
  }

  // メール通知は実装していません
  const action = user ? 'added' : 'invited';
  console.log(`Project member ${action}: ${input.email} to project ${projectName}`);

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
  // Top-level collection with composite ID
  const memberId = `${projectId}_${userId}`;
  const doc = await db.collection('project_members').doc(memberId).get();

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
  // Top-level collection: project_members/
  // プロジェクトIDでフィルタし、orgIdは内部メンバーと外部メンバー（協力者）の両方を含める
  let query = db.collection('project_members')
    .where('projectId', '==', projectId) as FirebaseFirestore.Query;

  // orgIdフィルタは使わず、後でフィルタリング
  // 協力者（orgId: 'external'）も含めるため

  if (filters?.role) {
    query = query.where('role', '==', filters.role);
  }

  if (filters?.status) {
    query = query.where('status', '==', filters.status);
  }

  const snapshot = await query.get();
  const allMembers = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      ...data,
      invitedAt: data.invitedAt,
      joinedAt: data.joinedAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as ProjectMember;
  });

  // プロジェクトに属する全メンバーを返す
  // orgIdパラメータはアクセス制御用で、結果のフィルタには使わない
  // 理由：異なる組織のユーザーもプロジェクトメンバーになれるため
  return allMembers;
}

/**
 * プロジェクトメンバーを更新
 */
export async function updateProjectMember(
  orgId: string,
  projectId: string,
  userId: string,
  updates: Partial<Pick<ProjectMember, 'role' | 'permissions' | 'status' | '職種'>>
): Promise<void> {
  // 入力バリデーション
  if (!orgId || !projectId || !userId) {
    throw new Error('Organization ID, project ID, and user ID are required');
  }

  if (!updates || Object.keys(updates).length === 0) {
    throw new Error('No updates provided');
  }

  // Top-level collection with composite ID
  const memberId = `${projectId}_${userId}`;
  const memberRef = db.collection('project_members').doc(memberId);

  // メンバーが存在するか確認
  const memberDoc = await memberRef.get();
  if (!memberDoc.exists) {
    throw new Error('Member not found');
  }

  // ロールが変更された場合、権限も更新
  if (updates.role) {
    updates.permissions = getProjectRolePermissions(updates.role);
  }

  await memberRef.update({
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

/**
 * プロジェクトメンバーを削除
 */
export async function removeProjectMember(
  orgId: string,
  projectId: string,
  userId: string
): Promise<void> {
  // 入力バリデーション
  if (!orgId || !projectId || !userId) {
    throw new Error('Organization ID, project ID, and user ID are required');
  }

  // Top-level collection with composite ID
  const memberId = `${projectId}_${userId}`;
  const memberRef = db.collection('project_members').doc(memberId);

  const memberDoc = await memberRef.get();
  if (!memberDoc.exists) {
    throw new Error('Member not found');
  }

  const memberData = memberDoc.data() as ProjectMember;
  await memberRef.delete();

  // プロジェクトのメンバー数を更新（デクリメント）
  // active メンバーのみカウントしているため、active の場合のみデクリメント
  if (memberData.status === 'active') {
    await updateProjectMemberCount(orgId, projectId, memberData.orgId, false);
  }
}

/**
 * プロジェクトメンバーの招待を承認（アクティブ化）
 */
export async function acceptProjectInvitation(
  orgId: string,
  projectId: string,
  userId: string
): Promise<void> {
  // 入力バリデーション
  if (!orgId || !projectId || !userId) {
    throw new Error('Organization ID, project ID, and user ID are required');
  }

  // メンバーが存在するか確認
  const member = await getProjectMember(orgId, projectId, userId);
  if (!member) {
    throw new Error('Invitation not found');
  }

  // 招待状態であることを確認
  if (member.status !== 'invited') {
    throw new Error(`Cannot accept invitation with status: ${member.status}`);
  }

  // Top-level collection with composite ID
  const memberId = `${projectId}_${userId}`;
  const now = Timestamp.now();
  await db.collection('project_members').doc(memberId).update({
    status: 'active',
    joinedAt: now,
    updatedAt: now,
  });

  // プロジェクトのメンバー数を更新（インクリメント）
  // invited から active になったのでカウントを増やす
  await updateProjectMemberCount(orgId, projectId, member.orgId, true);
}

/**
 * ユーザー がメンバーとして参加しているプロジェクト一覧を取得
 * 
 * 【同組織メンバーのデフォルトアクセス】
 * - memberType === 'member' のユーザーは、同組織の全プロジェクトに自動的にアクセス可能
 * - memberType === 'guest' のユーザーは、明示的に招待されたプロジェクトのみアクセス可能
 * - 役職に応じてデフォルトの権限が付与される
 * 
 * @param orgId - 組織IDでフィルタ（省略可能。省略時は全組織のプロジェクトを取得）
 * @param userId - ユーザーID
 */
export async function listUserProjects(
  orgId: string | null,
  userId: string
): Promise<Array<{ projectId: string; member: ProjectMember; project?: any }>> {
  // ユーザー情報を取得
  const user = await getUser(userId);
  if (!user) {
    return [];
  }

  // 明示的に招待されているプロジェクトを取得
  let query = db
    .collection('project_members')
    .where('userId', '==', userId) as FirebaseFirestore.Query;

  // orgIdが指定されている場合のみフィルタ
  if (orgId) {
    query = query.where('orgId', '==', orgId);
  }

  const membersSnapshot = await query.get();

  const explicitProjects: Array<{ projectId: string; member: ProjectMember }> = [];

  for (const memberDoc of membersSnapshot.docs) {
    const member = memberDoc.data() as ProjectMember;
    explicitProjects.push({
      projectId: member.projectId,
      member,
    });
  }

  // 同組織のメンバー（memberType === 'member'）の場合、全プロジェクトへのアクセスを追加
  if (user.memberType === 'member') {
    const targetOrgId = orgId || user.orgId;

    // 組織の全プロジェクトを取得
    const projectsSnapshot = await db
      .collection('orgs')
      .doc(targetOrgId)
      .collection('projects')
      .get();

    const now = Timestamp.now();
    const explicitProjectIds = new Set(explicitProjects.map(p => p.projectId));

    // 明示的に招待されていないプロジェクトに対して、暗黙的なメンバーシップを追加
    for (const projectDoc of projectsSnapshot.docs) {
      const projectId = projectDoc.id;

      // すでに明示的なメンバーシップがある場合はスキップ
      if (explicitProjectIds.has(projectId)) {
        continue;
      }

      // 役職に基づいてデフォルトのプロジェクトロールを決定
      let defaultProjectRole: ProjectRole = 'viewer';
      if (user.role === 'super_admin' || user.role === 'admin') {
        defaultProjectRole = 'manager';
      } else if (user.role === 'project_manager') {
        defaultProjectRole = 'manager';
      } else if (user.role === 'sales' || user.role === 'designer' || user.role === 'site_manager') {
        defaultProjectRole = 'member';
      } else {
        // worker, viewer などはviewerロール
        defaultProjectRole = 'viewer';
      }

      // 暗黙的なメンバーシップを作成（Firestoreには保存しない、メモリ上のみ）
      const implicitMember: ProjectMember = {
        id: `${projectId}_${userId}`,
        projectId,
        userId,
        email: user.email,
        displayName: user.displayName,
        orgId: user.orgId,
        orgName: '', // 後で取得可能
        role: defaultProjectRole,
        職種: user.職種,
        permissions: getProjectRolePermissions(defaultProjectRole),
        invitedBy: 'system', // システムによる自動追加
        invitedAt: now,
        joinedAt: now,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      explicitProjects.push({
        projectId,
        member: implicitMember,
      });
    }
  }

  // プロジェクト情報を含めて返す
  const results: Array<{ projectId: string; member: ProjectMember; project?: any }> = [];

  for (const item of explicitProjects) {
    // プロジェクト情報を取得して含める
    const projectDoc = await db
      .collection('orgs')
      .doc(item.member.orgId)
      .collection('projects')
      .doc(item.projectId)
      .get();

    results.push({
      ...item,
      project: projectDoc.exists ? projectDoc.data() : null,
    });
  }

  return results;
}

/**
 * プロジェクトのメンバー数を更新
 */
/**
 * メンバー数をインクリメント/デクリメントする（最適化版）
 * @param orgId - 組織ID
 * @param projectId - プロジェクトID
 * @param memberOrgId - 追加/削除されるメンバーの組織ID
 * @param increment - true: 追加, false: 削除
 */
async function updateProjectMemberCount(
  orgId: string,
  projectId: string,
  memberOrgId?: string,
  increment: boolean = true
): Promise<void> {
  const projectRef = db
    .collection('orgs').doc(orgId)
    .collection('projects').doc(projectId);

  // プロジェクトオーナーの組織IDを取得（外部メンバー判定用）
  const projectDoc = await projectRef.get();
  if (!projectDoc.exists) return;

  const projectData = projectDoc.data();
  const ownerOrgId = projectData?.ownerOrgId;

  const admin = await import('firebase-admin');
  const incrementValue = increment ? 1 : -1;

  const updates: any = {
    memberCount: admin.firestore.FieldValue.increment(incrementValue),
    updatedAt: Timestamp.now(),
  };

  // 外部メンバーかどうかを判定
  if (memberOrgId && memberOrgId !== ownerOrgId) {
    updates.externalMemberCount = admin.firestore.FieldValue.increment(incrementValue);
  }

  await projectRef.update(updates);
}

/**
 * メンバー数を再計算する（整合性チェック用）
 * 通常は使用せず、データ修復時のみ使用
 */
async function recalculateProjectMemberCount(
  orgId: string,
  projectId: string
): Promise<void> {
  const members = await listProjectMembers(orgId, projectId, { status: 'active' });

  const projectDoc = await db
    .collection('orgs').doc(orgId)
    .collection('projects').doc(projectId)
    .get();

  if (!projectDoc.exists) return;

  const projectData = projectDoc.data();
  const ownerOrgId = projectData?.ownerOrgId;

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

