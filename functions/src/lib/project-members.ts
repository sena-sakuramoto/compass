import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ProjectMember, ProjectMemberInput, User } from './auth-types';
import { ProjectRole, getProjectRolePermissions, ProjectPermissions } from './roles';
import { getUser, getUserByEmail } from './users';
import { getOrganization } from './users';
import { ensureFirebaseAdmin } from './firebaseAdmin';

ensureFirebaseAdmin();

const db = getFirestore();

/**
 * プロジェクトメンバーを追加（招待）
 *
 * 【重要な変更】
 * - ユーザーが存在しない場合はエラー（新規ユーザーは作らない）
 * - isActive=false のユーザーはエラー
 * - ユーザーの実際の orgId を使用（招待元ではない）
 * - memberType をユーザーから継承
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

  const hasEmail = typeof input.email === 'string' && input.email.trim().length > 0;
  const normalizedEmail = hasEmail ? input.email!.trim().toLowerCase() : undefined;
  const trimmedDisplayName = typeof input.displayName === 'string' ? input.displayName.trim() : undefined;

  // 入力バリデーション
  if (!input.role) {
    throw new Error('Role is required');
  }

  // emailとdisplayNameのどちらか一方は必須
  if (!hasEmail && !trimmedDisplayName) {
    throw new Error('Email or displayName is required');
  }

  if (!orgId || !projectId || !invitedBy) {
    throw new Error('Organization ID, project ID, and inviter ID are required');
  }

  // メールアドレスがない場合は、名前のみの外部協力者として追加
  if (!hasEmail) {
    // 名前のみの外部協力者
    const textOnlyUserId = `text_${projectId}_${Date.now()}`;
    const memberId = `${projectId}_${textOnlyUserId}`;

    const permissions: ProjectPermissions = input.permissions
      ? { ...getProjectRolePermissions(input.role), ...input.permissions }
      : getProjectRolePermissions(input.role);

    const member: ProjectMember = {
      id: memberId,
      projectId,
      projectOrgId: orgId,
      userId: textOnlyUserId,
      displayName: trimmedDisplayName || '名前未設定',
      orgId: orgId,
      orgName: '外部協力者',
      memberType: 'external',
      role: input.role,
      jobTitle: input.jobTitle,
      permissions,
      invitedBy,
      invitedAt: now,
      joinedAt: undefined,
      status: 'active', // 名前のみの場合は即座にactive
      createdAt: now,
      updatedAt: now,
    };

    // プロジェクトメンバーとして保存
    const memberRef = db.collection('project_members').doc(memberId);
    await memberRef.set(member);

    // プロジェクトのサブコレクションにも保存
    const subMemberRef = db
      .collection('orgs')
      .doc(orgId)
      .collection('projects')
      .doc(projectId)
      .collection('members')
      .doc(textOnlyUserId);
    await subMemberRef.set(member);

    console.log(`[addProjectMember] Added text-only member ${member.displayName} to project ${projectId}`);
    return member;
  }

  // メールアドレスからユーザーを検索
  const user = await getUserByEmail(normalizedEmail!);

  let member: ProjectMember;
  let memberOrgId: string;

  if (!user) {
    // ユーザーが存在しない場合 - 外部協力者として「招待中」で追加
    console.log(`[addProjectMember] User not found for email ${input.email}, adding as external collaborator`);

    // 外部メンバー用の仮IDを生成
    const externalUserId = `external_${projectId}_${Date.now()}`;
    const memberId = `${projectId}_${externalUserId}`;

    // 権限を設定
    const permissions: ProjectPermissions = input.permissions
      ? { ...getProjectRolePermissions(input.role), ...input.permissions }
      : getProjectRolePermissions(input.role);

    member = {
      id: memberId,
      projectId,
      projectOrgId: orgId,
      userId: externalUserId,
      email: normalizedEmail!,
      displayName: normalizedEmail!,
      orgId: orgId, // 招待元の組織ID
      orgName: '外部協力者',
      memberType: 'external',
      role: input.role,
      jobTitle: input.jobTitle,
      permissions,
      invitedBy,
      invitedAt: now,
      joinedAt: undefined, // 外部ユーザーは未参加
      status: 'invited', // 招待中ステータス
      createdAt: now,
      updatedAt: now,
    };

    memberOrgId = orgId; // 招待元の組織で集計
  } else {
    // ユーザーが存在する場合 - 既存の処理

    // ユーザーが非アクティブの場合はエラー
    if (user.isActive === false) {
      throw new Error('このユーザーのアカウントは無効です');
    }

    // 権限を設定
    const permissions: ProjectPermissions = input.permissions
      ? { ...getProjectRolePermissions(input.role), ...input.permissions }
      : getProjectRolePermissions(input.role);

    // 既存ユーザーの場合 - 直接アクティブ化
    const org = await getOrganization(user.orgId);

    const memberId = `${projectId}_${user.id}`;
    member = {
      id: memberId,
      projectId,
      projectOrgId: orgId,
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      orgId: user.orgId,  // ユーザーの所属組織ID
      orgName: org?.name || user.orgId,
      memberType: user.memberType,
      role: input.role,
      jobTitle: input.jobTitle || user.jobTitle,
      permissions,
      invitedBy,
      invitedAt: now,
      joinedAt: now, // 既存ユーザーは即座に参加
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    memberOrgId = user.orgId;
  }

  // Top-level collection with composite ID
  await db.collection('project_members').doc(member.id).set(member);

  // プロジェクトのメンバー数を更新（インクリメント）
  await updateProjectMemberCount(orgId, projectId, memberOrgId, true);
  await syncProjectMemberSummary(orgId, projectId);

  // メール通知は実装していません
  console.log(`Project member added: ${normalizedEmail || trimmedDisplayName} to project ${projectName} (status: ${member.status})`);

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
  // プロジェクトIDでフィルタし、orgIdは内部メンバーと外部メンバーの両方を含める
  let query = db.collection('project_members')
    .where('projectId', '==', projectId) as FirebaseFirestore.Query;

  if (filters?.role) {
    query = query.where('role', '==', filters.role);
  }

  if (filters?.status) {
    query = query.where('status', '==', filters.status);
  }

  const snapshot = await query.get();
  const memberDocs = snapshot.docs.map(doc => {
    const data = doc.data();
    const member = {
      ...data,
      invitedAt: data.invitedAt,
      joinedAt: data.joinedAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    } as ProjectMember;
    return { member, docId: doc.id };
  });

  const legacyMembers = memberDocs.filter(({ member }) => !member.projectOrgId);
  const inviterIds = Array.from(
    new Set(
      legacyMembers
        .map(({ member }) => member.invitedBy)
        .filter((id): id is string => Boolean(id))
    )
  );

  const inviterOrgMap = new Map<string, string>();
  if (inviterIds.length > 0) {
    const inviterDocs = await db.getAll(
      ...inviterIds.map(id => db.collection('users').doc(id))
    );
    inviterDocs.forEach((doc) => {
      if (!doc.exists) return;
      const data = doc.data() as User;
      if (data?.orgId) {
        inviterOrgMap.set(doc.id, data.orgId);
      }
    });
  }

  const updates: Array<Promise<unknown>> = [];
  const scopedMembers: ProjectMember[] = [];

  memberDocs.forEach(({ member, docId }) => {
    const resolvedOrgId =
      member.projectOrgId ||
      inviterOrgMap.get(member.invitedBy) ||
      member.orgId;

    if (resolvedOrgId !== orgId) return;

    if (!member.projectOrgId && resolvedOrgId) {
      // バックフィル処理は非同期で実行（APIレスポンスをブロックしない）
      updates.push(
        db.collection('project_members').doc(docId).update({
          projectOrgId: resolvedOrgId,
          updatedAt: Timestamp.now(),
        })
      );
      member.projectOrgId = resolvedOrgId;
    }

    scopedMembers.push(member);
  });

  // バックフィル処理はfire-and-forget（待たない）
  if (updates.length > 0) {
    Promise.allSettled(updates).then(results => {
      const failed = results.filter(result => result.status === 'rejected');
      if (failed.length > 0) {
        console.warn('[listProjectMembers] Failed to backfill projectOrgId:', failed.length);
      }
    }).catch(() => {});
  }

  return scopedMembers;
}

/**
 * プロジェクトメンバーを更新
 */
export async function updateProjectMember(
  orgId: string,
  projectId: string,
  userId: string,
  updates: Partial<Pick<ProjectMember, 'role' | 'permissions' | 'status' | 'jobTitle'>>
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

  if (updates.status || updates.role || updates.jobTitle) {
    await syncProjectMemberSummary(orgId, projectId);
  }
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

  await syncProjectMemberSummary(orgId, projectId);
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

  await syncProjectMemberSummary(orgId, projectId);
}

/**
 * プロジェクトの担当者サマリーを更新
 * memberNames（全メンバー）と役職別フィールド（営業、PM、設計、施工管理）を更新
 */
export async function syncProjectMemberSummary(
  orgId: string,
  projectId: string
): Promise<void> {
  if (!orgId || !projectId) return;
  try {
    const members = await listProjectMembers(orgId, projectId, { status: 'active' });
    const seen = new Set<string>();
    const names: string[] = [];

    // 役職別にメンバーを集約
    const roleMap: Record<string, Set<string>> = {
      営業: new Set(),
      PM: new Set(),
      設計: new Set(),
      施工管理: new Set(),
    };

    members.forEach((member) => {
      const nameCandidate =
        member.displayName?.trim() ||
        member.email?.split('@')[0]?.trim() ||
        '';
      if (!nameCandidate) return;

      const key = member.userId || member.email || nameCandidate;
      if (seen.has(key)) return;
      seen.add(key);
      names.push(nameCandidate);

      // 役職があれば該当するセットに追加
      if (member.jobTitle && roleMap[member.jobTitle]) {
        roleMap[member.jobTitle].add(nameCandidate);
      }
    });

    names.sort((a, b) => a.localeCompare(b, 'ja'));

    // 役職別フィールドを作成
    const updateData: Record<string, any> = {
      memberNames: names,
      memberNamesUpdatedAt: Timestamp.now(),
      営業: roleMap.営業.size > 0 ? Array.from(roleMap.営業).sort((a, b) => a.localeCompare(b, 'ja')).join('、') : null,
      PM: roleMap.PM.size > 0 ? Array.from(roleMap.PM).sort((a, b) => a.localeCompare(b, 'ja')).join('、') : null,
      設計: roleMap.設計.size > 0 ? Array.from(roleMap.設計).sort((a, b) => a.localeCompare(b, 'ja')).join('、') : null,
      施工管理: roleMap.施工管理.size > 0 ? Array.from(roleMap.施工管理).sort((a, b) => a.localeCompare(b, 'ja')).join('、') : null,
    };

    await db
      .collection('orgs')
      .doc(orgId)
      .collection('projects')
      .doc(projectId)
      .update(updateData);
  } catch (error) {
    console.warn('[ProjectMembers] Failed to sync member summary:', error);
  }
}

/**
 * ユーザーがメンバーとして参加しているプロジェクト一覧を取得
 *
 * 【同組織メンバーのデフォルトアクセス】
 * - すべてのログインユーザー（組織メンバー）は、同組織の全プロジェクトに自動的にアクセス可能
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

  const orgAccessMap = new Map<string, { accessLevel: 'full' | 'project-specific'; projects?: string[] }>();
  const organizations = (user as any).organizations as Record<string, any> | undefined;
  if (organizations && typeof organizations === 'object') {
    Object.entries(organizations).forEach(([orgKey, access]) => {
      if (!orgKey || !access || typeof access !== 'object') return;
      const accessLevel = access.accessLevel === 'project-specific' ? 'project-specific' : 'full';
      const projects = Array.isArray(access.projects)
        ? access.projects.map((id: any) => String(id)).filter(Boolean)
        : undefined;
      orgAccessMap.set(orgKey, { accessLevel, projects });
    });
  }

  if (user.orgId && !orgAccessMap.has(user.orgId)) {
    orgAccessMap.set(user.orgId, { accessLevel: 'full' });
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

  const explicitProjects: Array<{ projectId: string; member: ProjectMember; docId?: string }> = [];

  for (const memberDoc of membersSnapshot.docs) {
    const member = memberDoc.data() as ProjectMember;
    explicitProjects.push({
      projectId: member.projectId,
      member,
      docId: memberDoc.id,
    });
  }

  const legacyMembers = explicitProjects.filter(({ member }) => !member.projectOrgId);
  const inviterIds = Array.from(
    new Set(
      legacyMembers
        .map(({ member }) => member.invitedBy)
        .filter((id): id is string => Boolean(id))
    )
  );

  const inviterOrgMap = new Map<string, string>();
  if (inviterIds.length > 0) {
    const inviterDocs = await db.getAll(
      ...inviterIds.map((id) => db.collection('users').doc(id))
    );
    inviterDocs.forEach((doc) => {
      if (!doc.exists) return;
      const data = doc.data() as User;
      if (data?.orgId) {
        inviterOrgMap.set(doc.id, data.orgId);
      }
    });
  }

  const updates: Array<Promise<unknown>> = [];
  explicitProjects.forEach(({ member, docId }) => {
    const resolvedOrgId =
      member.projectOrgId ||
      inviterOrgMap.get(member.invitedBy) ||
      member.orgId;

    if (!member.projectOrgId && resolvedOrgId && docId) {
      updates.push(
        db.collection('project_members').doc(docId).update({
          projectOrgId: resolvedOrgId,
          updatedAt: Timestamp.now(),
        })
      );
      member.projectOrgId = resolvedOrgId;
    }
  });

  // バックフィル処理はfire-and-forget（待たない）
  if (updates.length > 0) {
    Promise.allSettled(updates).then(results => {
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length > 0) {
        console.warn('[listUserProjects] Failed to backfill projectOrgId:', failed.length);
      }
    }).catch(() => {});
  }

  // 同組織のメンバーの場合、全プロジェクトへのアクセスを追加
  const now = Timestamp.now();
  const explicitProjectIds = new Set(explicitProjects.map(p => p.projectId));
  const targetOrgIds = orgId ? [orgId] : Array.from(orgAccessMap.keys());

  const buildImplicitMember = (projectId: string, projectOrgId: string): ProjectMember => {
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

    return {
      id: `${projectId}_${userId}`,
      projectId,
      projectOrgId,
      userId,
      email: user.email,
      displayName: user.displayName,
      orgId: user.orgId,
      orgName: '', // 後で取得可能
      role: defaultProjectRole,
      jobTitle: user.jobTitle,
      permissions: getProjectRolePermissions(defaultProjectRole),
      invitedBy: 'system', // システムによる自動追加
      invitedAt: now,
      joinedAt: now,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  };

  for (const targetOrgId of targetOrgIds) {
    const access = orgAccessMap.get(targetOrgId);
    if (!access) continue;

    if (access.accessLevel === 'project-specific' && Array.isArray(access.projects) && access.projects.length > 0) {
      for (const projectId of access.projects) {
        if (explicitProjectIds.has(projectId)) continue;
        const implicitMember = buildImplicitMember(projectId, targetOrgId);
        explicitProjects.push({
          projectId,
          member: implicitMember,
        });
        explicitProjectIds.add(projectId);
      }
      continue;
    }

    // 組織の全プロジェクトを取得
    const projectsSnapshot = await db
      .collection('orgs')
      .doc(targetOrgId)
      .collection('projects')
      .get();

    // 明示的に招待されていないプロジェクトに対して、暗黙的なメンバーシップを追加
    for (const projectDoc of projectsSnapshot.docs) {
      const projectId = projectDoc.id;

      // すでに明示的なメンバーシップがある場合はスキップ
      if (explicitProjectIds.has(projectId)) {
        continue;
      }

      const implicitMember = buildImplicitMember(projectId, targetOrgId);
      explicitProjects.push({
        projectId,
        member: implicitMember,
      });
      explicitProjectIds.add(projectId);
    }
  }

  // プロジェクト情報を含めて返す
  const results: Array<{ projectId: string; member: ProjectMember; project?: any }> = [];

  for (const item of explicitProjects) {
    // プロジェクト情報を取得して含める
    const projectOrgId = item.member.projectOrgId || item.member.orgId;
    const projectDoc = await db
      .collection('orgs')
      .doc(projectOrgId)
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
