/**
 * MCP Read ツール
 * projects_list, tasks_search, tasks_get, users_search
 *
 * NOTE: server.tool() の Zod 型推論が深すぎて TS2589 が出るため、
 * ToolCallback を明示的にキャストしている。
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listProjects, listTasks, listStages, getProject, db, serialize } from '../../lib/firestore';
import { listUsers } from '../../lib/users';
import type { McpContext } from '../types';
import type { TaskDoc, ProjectDoc } from '../../lib/firestore';

// Zod スキーマをスタンドアロン定数として定義
const ProjectsListParams = z.object({
  status: z.string().optional().describe('Filter by project status (e.g. "進行中", "完了")'),
});

const TasksSearchParams = z.object({
  projectId: z.string().optional().describe('Filter by project ID (e.g. "P-00001")'),
  assignee: z.string().optional().describe('Filter by assignee name'),
  status: z.string().optional().describe('Filter by status (e.g. "未着手", "進行中", "完了")'),
  q: z.string().optional().describe('Free-text search across task name, assignee, status, etc.'),
});

const TasksGetParams = z.object({
  taskId: z.string().describe('The task ID (e.g. "T-00042")'),
});

const UsersSearchParams = z.object({
  role: z.string().optional().describe('Filter by role (e.g. "owner", "admin", "member", "viewer")'),
});

const ProjectsGetParams = z.object({
  projectId: z.string().describe('The project ID (e.g. "P-00001")'),
});

const StagesListParams = z.object({
  projectId: z.string().describe('The project ID to list stages for (e.g. "P-00001")'),
});

/**
 * Read ツールをサーバーに登録する
 */
export function registerReadTools(
  server: McpServer,
  getContext: () => McpContext
) {
  // ── projects_list ──
  (server as any).tool(
    'projects_list',
    'List projects in your organization. Optionally filter by status (進行中/完了/中断). Returns project name, client, dates, and priority.',
    ProjectsListParams.shape,
    async (args: z.infer<typeof ProjectsListParams>) => {
      const ctx = getContext();
      let projects = await listProjects(ctx.orgId);
      if (args.status) {
        projects = projects.filter((p) => p.ステータス === args.status);
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              projects.map((p) => ({
                id: p.id,
                name: p.物件名,
                client: p.クライアント ?? null,
                status: p.ステータス,
                priority: p.優先度,
                startDate: p.開始日 ?? null,
                dueDate: p.予定完了日 ?? null,
                updatedAt: p.updatedAt,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── tasks_search ──
  (server as any).tool(
    'tasks_search',
    'Search tasks with filters. Returns matching tasks sorted by updatedAt desc. Use projectId to scope results. Assignee must match a displayName from users_search.',
    TasksSearchParams.shape,
    async (args: z.infer<typeof TasksSearchParams>) => {
      const ctx = getContext();
      const tasks = await listTasks({
        orgId: ctx.orgId,
        projectId: args.projectId ?? undefined,
        assignee: args.assignee ?? undefined,
        status: args.status ?? undefined,
        q: args.q ?? undefined,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              tasks.map((t) => ({
                id: t.id,
                projectId: t.projectId,
                name: t.タスク名,
                assignee: t.担当者 ?? t.assignee ?? null,
                status: t.ステータス,
                priority: t.優先度 ?? null,
                startDate: t.予定開始日 ?? t.start ?? null,
                dueDate: t.期限 ?? t.end ?? null,
                progress: t.progress ?? null,
                updatedAt: t.updatedAt,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── tasks_get ──
  (server as any).tool(
    'tasks_get',
    'Get a single task by ID with full details. Always call this before tasks_update to get the current updatedAt value for optimistic locking.',
    TasksGetParams.shape,
    async (args: z.infer<typeof TasksGetParams>) => {
      const ctx = getContext();
      const doc = await db
        .collection('orgs')
        .doc(ctx.orgId)
        .collection('tasks')
        .doc(args.taskId)
        .get();

      if (!doc.exists) {
        return {
          content: [{ type: 'text' as const, text: `Task "${args.taskId}" not found.` }],
          isError: true,
        };
      }

      const task = serialize<TaskDoc>(
        doc as FirebaseFirestore.QueryDocumentSnapshot
      );

      if (task.deletedAt) {
        return {
          content: [{ type: 'text' as const, text: `Task "${args.taskId}" has been deleted.` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                id: task.id,
                projectId: task.projectId,
                name: task.タスク名,
                type: task.type ?? 'task',
                assignee: task.担当者 ?? task.assignee ?? null,
                assigneeEmail: task.担当者メール ?? null,
                status: task.ステータス,
                priority: task.優先度 ?? null,
                startDate: task.予定開始日 ?? task.start ?? null,
                dueDate: task.期限 ?? task.end ?? null,
                actualStartDate: task.実績開始日 ?? null,
                actualEndDate: task.実績完了日 ?? null,
                progress: task.progress ?? null,
                milestone: task.マイルストーン ?? false,
                estimatedHours: task['工数見積(h)'] ?? null,
                actualHours: task['工数実績(h)'] ?? null,
                dependencies: task['依存タスク'] ?? null,
                requestedBy: task['依頼元'] ?? null,
                phase: task.フェーズ ?? null,
                sprint: task.スプリント ?? null,
                parentId: task.parentId ?? null,
                createdAt: task.createdAt,
                updatedAt: task.updatedAt,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── users_search ──
  (server as any).tool(
    'users_search',
    'Search users in your organization. Call this first to get valid assignee displayName values before creating or updating tasks.',
    UsersSearchParams.shape,
    async (args: z.infer<typeof UsersSearchParams>) => {
      const ctx = getContext();
      const users = await listUsers({
        orgId: ctx.orgId,
        role: args.role as any,
        isActive: true,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              users.map((u) => ({
                id: u.id,
                email: u.email,
                displayName: u.displayName,
                role: u.role,
                jobTitle: u.jobTitle ?? null,
                department: u.department ?? null,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── projects_get ──
  (server as any).tool(
    'projects_get',
    'Get a single project by ID with full details. Includes milestone dates (着工日, 竣工予定日, 引渡し予定日, etc.) useful for inferring task date ranges.',
    ProjectsGetParams.shape,
    async (args: z.infer<typeof ProjectsGetParams>) => {
      const ctx = getContext();
      const project = await getProject(ctx.orgId, args.projectId);

      if (!project) {
        return {
          content: [{ type: 'text' as const, text: `Project "${args.projectId}" not found.` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                id: project.id,
                name: project.物件名,
                client: project.クライアント ?? null,
                status: project.ステータス,
                priority: project.優先度,
                startDate: project.開始日 ?? null,
                dueDate: project.予定完了日 ?? null,
                location: project.所在地_現地 ?? null,
                folderUrl: project['フォルダURL'] ?? null,
                notes: project['備考'] ?? null,
                constructionCost: project.施工費 ?? null,
                siteSurveyDate: project['現地調査日'] ?? null,
                layoutDate: project['レイアウト確定日'] ?? null,
                perspectiveDate: project['パース確定日'] ?? null,
                basicDesignDate: project['基本設計完了日'] ?? null,
                constructionSurveyDate: project['設計施工現調日'] ?? null,
                estimateDate: project['見積確定日'] ?? null,
                constructionStartDate: project['着工日'] ?? null,
                interimInspectionDate: project['中間検査日'] ?? null,
                completionDate: project['竣工予定日'] ?? null,
                handoverDate: project['引渡し予定日'] ?? null,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── stages_list ──
  (server as any).tool(
    'stages_list',
    'List stages (工程) for a project, ordered by orderIndex. Use stage names as the phase field when creating tasks.',
    StagesListParams.shape,
    async (args: z.infer<typeof StagesListParams>) => {
      const ctx = getContext();
      const stages = await listStages(args.projectId, ctx.orgId);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              stages.map((s) => ({
                id: s.id,
                projectId: s.projectId,
                name: s.タスク名,
                startDate: s.予定開始日 ?? s.start ?? null,
                dueDate: s.期限 ?? s.end ?? null,
                orderIndex: s.orderIndex ?? null,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
