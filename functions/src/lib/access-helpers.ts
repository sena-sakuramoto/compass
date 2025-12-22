import { User } from './auth-types';
import { listUserProjects } from './project-members';
import { getProject, db } from './firestore';

/**
 * ユーザーの有効な組織IDを取得
 * super_adminがなりすまし中の場合は、なりすまし先の組織IDを返す
 */
export function getEffectiveOrgId(user: User): string {
  return user.impersonatingOrgId || user.orgId;
}

/**
 * ユーザーがアクセス可能なプロジェクトを取得
 * クロスオーガナイゼーション対応：他組織のプロジェクトにも招待されていればアクセス可能
 *
 * @param userId ユーザーID
 * @param projectId プロジェクトID
 * @returns プロジェクトと所属組織ID、アクセス権がない場合はnull
 */
export async function getProjectForUser(
  userId: string,
  projectId: string
): Promise<{ project: any; orgId: string } | null> {
  // ユーザーがメンバーとして参加しているプロジェクトを取得（全組織対象）
  const userProjectMemberships = await listUserProjects(null, userId);

  // 指定されたプロジェクトへのメンバーシップを検索
  const membership = userProjectMemberships.find((m) => m.projectId === projectId);

  if (!membership) {
    return null;
  }

  // プロジェクトの所属組織IDを取得
  // project.ownerOrgId が優先、なければ member.projectOrgId → member.orgId
  const projectOrgId =
    membership.project?.ownerOrgId ||
    membership.member.projectOrgId ||
    membership.member.orgId;

  // プロジェクトを正しい組織IDで取得
  const project = await getProject(projectOrgId, projectId);

  if (!project) {
    return null;
  }

  return { project, orgId: projectOrgId };
}

/**
 * ユーザーがアクセス可能なタスクを取得
 * クロスオーガナイゼーション対応：効率的に1つのタスクだけを取得
 *
 * @param userId ユーザーID
 * @param taskId タスクID
 * @returns タスクと所属組織ID、アクセス権がない場合はnull
 */
export async function getTaskForUser(
  userId: string,
  taskId: string
): Promise<{ task: any; orgId: string; projectId: string } | null> {
  // ユーザーがアクセス可能なプロジェクトを取得（全組織対象）
  const userProjectMemberships = await listUserProjects(null, userId);

  // アクセス可能な組織IDを収集
  const accessibleOrgIds = new Set<string>();
  userProjectMemberships.forEach((membership) => {
    const projectOrgId =
      membership.project?.ownerOrgId ||
      membership.member.projectOrgId ||
      membership.member.orgId;
    const memberOrgId = membership.member.orgId;
    if (projectOrgId) {
      accessibleOrgIds.add(projectOrgId);
    }
    if (memberOrgId && memberOrgId !== projectOrgId) {
      accessibleOrgIds.add(memberOrgId);
    }
  });

  // 各組織からタスクを検索（効率化：見つかったら即終了）
  for (const orgId of accessibleOrgIds) {
    const taskDoc = await db
      .collection('orgs')
      .doc(orgId)
      .collection('tasks')
      .doc(taskId)
      .get();

    if (taskDoc.exists) {
      const task: any = { id: taskDoc.id, ...taskDoc.data() };

      // タスクが属するプロジェクトへのアクセス権を確認
      const membership = userProjectMemberships.find(
        (m) => m.projectId === task.projectId
      );

      if (membership) {
        return { task, orgId, projectId: task.projectId };
      }
    }
  }

  return null;
}
