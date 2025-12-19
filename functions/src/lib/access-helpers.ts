import { User } from './auth-types';
import { listUserProjects } from './project-members';
import { getProject } from './firestore';

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

  if (!membership || !membership.project) {
    return null;
  }

  // プロジェクトの所属組織IDを取得
  // project.ownerOrgId が優先、なければ member.orgId を使用
  const projectOrgId = membership.project.ownerOrgId || membership.member.orgId;

  // プロジェクトを正しい組織IDで取得
  const project = await getProject(projectOrgId, projectId);

  if (!project) {
    return null;
  }

  return { project, orgId: projectOrgId };
}
