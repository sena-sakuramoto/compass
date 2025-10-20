import { User } from './auth-types';
import { Project, Task } from './types';
import { getRolePermissions } from './roles';
import { getProjectMember, isProjectMember, getProjectMemberPermissions } from './project-members';

/**
 * プロジェクトへのアクセス権限をチェック
 */
export async function canAccessProject(
  user: User,
  project: Project & { ownerUserId?: string; ownerOrgId?: string; visibility?: string },
  orgId: string
): Promise<boolean> {
  // 1. 管理者は常にアクセス可能
  if (user.role === 'admin') return true;
  
  // 2. プロジェクトオーナーは常にアクセス可能
  if (project.ownerUserId && project.ownerUserId === user.id) return true;
  
  // 3. プロジェクトメンバーはアクセス可能
  const isMember = await isProjectMember(orgId, project.id, user.id);
  if (isMember) return true;
  
  // 4. 組織内公開の場合、同じ組織のユーザーはアクセス可能
  if (project.visibility === 'organization' && project.ownerOrgId === user.orgId) {
    return true;
  }
  
  return false;
}

/**
 * プロジェクトの編集権限をチェック
 */
export async function canEditProject(
  user: User,
  project: Project & { ownerUserId?: string; ownerOrgId?: string; visibility?: string },
  orgId: string
): Promise<boolean> {
  // アクセス権限がない場合は編集もできない
  if (!await canAccessProject(user, project, orgId)) return false;
  
  // 管理者は常に編集可能
  if (user.role === 'admin') return true;
  
  // プロジェクトオーナーは常に編集可能
  if (project.ownerUserId && project.ownerUserId === user.id) return true;
  
  // プロジェクトメンバーの権限を確認
  const permissions = await getProjectMemberPermissions(orgId, project.id, user.id);
  if (permissions && permissions.canEditProject) return true;
  
  return false;
}

/**
 * プロジェクトの削除権限をチェック
 */
export async function canDeleteProject(
  user: User,
  project: Project & { ownerUserId?: string },
  orgId: string
): Promise<boolean> {
  // 管理者は常に削除可能
  if (user.role === 'admin') return true;
  
  // プロジェクトオーナーは常に削除可能
  if (project.ownerUserId && project.ownerUserId === user.id) return true;
  
  // プロジェクトメンバーの権限を確認
  const permissions = await getProjectMemberPermissions(orgId, project.id, user.id);
  if (permissions && permissions.canDeleteProject) return true;
  
  return false;
}

/**
 * プロジェクトメンバーの管理権限をチェック
 */
export async function canManageProjectMembers(
  user: User,
  project: Project & { ownerUserId?: string },
  orgId: string
): Promise<boolean> {
  // 管理者は常に管理可能
  if (user.role === 'admin') return true;

  // プロジェクトマネージャーは自組織のプロジェクトを管理可能
  if (user.role === 'project_manager' && user.orgId === orgId) return true;

  // プロジェクトオーナーは常に管理可能
  if (project.ownerUserId && project.ownerUserId === user.id) return true;

  // プロジェクトメンバーの権限を確認
  const permissions = await getProjectMemberPermissions(orgId, project.id, user.id);
  if (permissions && permissions.canManageMembers) return true;

  return false;
}

/**
 * タスクへのアクセス権限をチェック
 */
export async function canAccessTask(
  user: User,
  task: Task & { createdBy?: string; assignedTo?: string; watchers?: string[]; visibility?: string },
  project: Project & { ownerUserId?: string; ownerOrgId?: string; visibility?: string },
  orgId: string
): Promise<boolean> {
  // プロジェクトにアクセスできない場合、タスクにもアクセスできない
  if (!await canAccessProject(user, project, orgId)) return false;
  
  // 管理者は常にアクセス可能
  if (user.role === 'admin') return true;
  
  // タスクの作成者は常にアクセス可能
  if (task.createdBy && task.createdBy === user.id) return true;
  
  // タスクの担当者は常にアクセス可能
  if (task.assignedTo && task.assignedTo === user.id) return true;
  
  // タスクのウォッチャーはアクセス可能
  if (task.watchers && task.watchers.includes(user.id)) return true;
  
  // タスクの公開範囲に応じて判定
  if (task.visibility === 'project') {
    // プロジェクトメンバー全員がアクセス可能
    return await isProjectMember(orgId, project.id, user.id);
  }
  
  if (task.visibility === 'assignee') {
    // 担当者のみアクセス可能
    return task.assignedTo === user.id;
  }
  
  // デフォルトはプロジェクトメンバーならアクセス可能
  return await isProjectMember(orgId, project.id, user.id);
}

/**
 * タスクの編集権限をチェック
 */
export async function canEditTask(
  user: User,
  task: Task & { createdBy?: string; assignedTo?: string; watchers?: string[]; visibility?: string },
  project: Project & { ownerUserId?: string; ownerOrgId?: string; visibility?: string },
  orgId: string
): Promise<boolean> {
  // アクセス権限がない場合は編集もできない
  if (!await canAccessTask(user, task, project, orgId)) return false;
  
  // 管理者は常に編集可能
  if (user.role === 'admin') return true;
  
  // タスクの作成者は常に編集可能
  if (task.createdBy && task.createdBy === user.id) return true;
  
  // プロジェクトメンバーの権限を確認
  const permissions = await getProjectMemberPermissions(orgId, project.id, user.id);
  if (permissions && permissions.canEditTasks) return true;
  
  // 職人は自分のタスクのみ編集可能
  if (user.role === 'worker' && task.assignedTo === user.id) return true;
  
  return false;
}

/**
 * タスクの作成権限をチェック
 */
export async function canCreateTask(
  user: User,
  project: Project & { ownerUserId?: string; ownerOrgId?: string; visibility?: string },
  orgId: string
): Promise<boolean> {
  // プロジェクトにアクセスできない場合、タスクも作成できない
  if (!await canAccessProject(user, project, orgId)) return false;
  
  // 管理者は常に作成可能
  if (user.role === 'admin') return true;
  
  // グローバルロールの権限を確認
  const globalPermissions = getRolePermissions(user.role);
  if (globalPermissions.canCreateTasks) {
    // プロジェクトメンバーである必要がある
    return await isProjectMember(orgId, project.id, user.id);
  }
  
  // プロジェクトメンバーの権限を確認
  const permissions = await getProjectMemberPermissions(orgId, project.id, user.id);
  if (permissions && permissions.canCreateTasks) return true;
  
  return false;
}

/**
 * タスクの削除権限をチェック
 */
export async function canDeleteTask(
  user: User,
  task: Task & { createdBy?: string },
  project: Project & { ownerUserId?: string; ownerOrgId?: string; visibility?: string },
  orgId: string
): Promise<boolean> {
  // 管理者は常に削除可能
  if (user.role === 'admin') return true;
  
  // タスクの作成者は常に削除可能
  if (task.createdBy && task.createdBy === user.id) return true;
  
  // プロジェクトメンバーの権限を確認
  const permissions = await getProjectMemberPermissions(orgId, project.id, user.id);
  if (permissions && permissions.canDeleteTasks) return true;
  
  return false;
}

/**
 * プロジェクト作成権限をチェック
 */
export function canCreateProject(user: User): boolean {
  const permissions = getRolePermissions(user.role);
  return permissions.canCreateProjects;
}

/**
 * ユーザー管理権限をチェック
 */
export function canManageUsers(user: User): boolean {
  const permissions = getRolePermissions(user.role);
  return permissions.canManageUsers;
}

/**
 * ユーザーのすべての権限を取得
 */
export async function getUserPermissionsForProject(
  user: User,
  project: Project & { ownerUserId?: string; ownerOrgId?: string; visibility?: string },
  orgId: string
) {
  const canView = await canAccessProject(user, project, orgId);
  const canEdit = await canEditProject(user, project, orgId);
  const canDelete = await canDeleteProject(user, project, orgId);
  const canManageMembers = await canManageProjectMembers(user, project, orgId);
  const canCreateTasks = await canCreateTask(user, project, orgId);
  
  const projectPermissions = await getProjectMemberPermissions(orgId, project.id, user.id);
  
  return {
    canView,
    canEdit,
    canDelete,
    canManageMembers,
    canCreateTasks,
    canViewTasks: projectPermissions?.canViewTasks ?? canView,
    canEditTasks: projectPermissions?.canEditTasks ?? false,
    canDeleteTasks: projectPermissions?.canDeleteTasks ?? false,
    canViewFiles: projectPermissions?.canViewFiles ?? canView,
    canUploadFiles: projectPermissions?.canUploadFiles ?? false,
  };
}

