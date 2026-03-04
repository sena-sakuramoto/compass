/**
 * MCP Write ツール
 * tasks_create, tasks_update
 *
 * NOTE: server.tool() の Zod 型推論が深すぎて TS2589 が出るため、
 * (server as any).tool() でキャストしている。
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createTask, updateTask, deleteTask, completeTask,
  createProject, updateProject, deleteProject,
  createStage, updateStage, deleteStage,
  db, serialize,
} from '../../lib/firestore';
import type { TaskInput, TaskDoc, ProjectInput } from '../../lib/firestore';
import { mapTaskFields, mapProjectFields } from '../lib/field-mapping';
import { findIdempotent, saveIdempotent } from '../lib/idempotency';
import { validateTaskFields, validateAssigneeUpdate, formatValidationForMcp } from '../lib/task-validation';
import type { McpContext } from '../types';

// Zod スキーマをスタンドアロン定数として定義
const TasksCreateParams = z.object({
  projectId: z.string().describe('Project ID to create the task in (e.g. "P-00001")'),
  taskName: z.string().describe('Task name'),
  assignee: z.string().optional().describe('Assignee name (must match a user displayName from users_search)'),
  assigneeEmail: z.string().optional().describe('Assignee email'),
  status: z.string().optional().describe('Status (default: "未着手"). Options: "未着手", "進行中", "完了"'),
  priority: z.string().optional().describe('Priority (e.g. "高", "中", "低")'),
  startDate: z.string().optional().describe('Planned start date (YYYY-MM-DD). IMPORTANT: Always provide together with dueDate so the task appears on the Gantt chart.'),
  dueDate: z.string().optional().describe('Due date (YYYY-MM-DD). IMPORTANT: Always provide together with startDate so the task appears on the Gantt chart.'),
  taskType: z.string().optional().describe('Task type'),
  phase: z.string().optional().describe('Phase name'),
  idempotencyKey: z.string().optional().describe('Idempotency key to prevent duplicate creation'),
});

const TasksUpdateParams = z.object({
  taskId: z.string().describe('Task ID to update (e.g. "T-00042")'),
  updatedAt: z.string().describe('Current updatedAt ISO timestamp for optimistic locking'),
  taskName: z.string().optional().describe('New task name'),
  assignee: z.string().optional().describe('New assignee name'),
  assigneeEmail: z.string().optional().describe('New assignee email'),
  status: z.string().optional().describe('New status'),
  priority: z.string().optional().describe('New priority'),
  startDate: z.string().optional().describe('New planned start date (YYYY-MM-DD)'),
  dueDate: z.string().optional().describe('New due date (YYYY-MM-DD)'),
  progress: z.number().optional().describe('Progress (0-1)'),
});

const TasksDeleteParams = z.object({
  taskId: z.string().describe('Task ID to delete (e.g. "T-00042")'),
});

const TasksCompleteParams = z.object({
  taskId: z.string().describe('Task ID to complete/uncomplete (e.g. "T-00042")'),
  done: z.boolean().describe('true to mark complete, false to revert to in-progress'),
});

const ProjectsCreateParams = z.object({
  name: z.string().describe('Project name (物件名)'),
  status: z.string().optional().describe('Status (default: "進行中"). Options: "進行中", "完了", "中断"'),
  priority: z.string().optional().describe('Priority (e.g. "高", "中", "低")'),
  client: z.string().optional().describe('Client name'),
  startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
  location: z.string().optional().describe('Location (所在地)'),
  folderUrl: z.string().optional().describe('Folder URL'),
  notes: z.string().optional().describe('Notes (備考)'),
  siteSurveyDate: z.string().optional().describe('Site survey date (現地調査日, YYYY-MM-DD)'),
  layoutDate: z.string().optional().describe('Layout finalization date (レイアウト確定日, YYYY-MM-DD)'),
  perspectiveDate: z.string().optional().describe('Perspective finalization date (パース確定日, YYYY-MM-DD)'),
  basicDesignDate: z.string().optional().describe('Basic design completion date (基本設計完了日, YYYY-MM-DD)'),
  constructionSurveyDate: z.string().optional().describe('Construction survey date (設計施工現調日, YYYY-MM-DD)'),
  estimateDate: z.string().optional().describe('Estimate finalization date (見積確定日, YYYY-MM-DD)'),
  constructionStartDate: z.string().optional().describe('Construction start date (着工日, YYYY-MM-DD)'),
  interimInspectionDate: z.string().optional().describe('Interim inspection date (中間検査日, YYYY-MM-DD)'),
  completionDate: z.string().optional().describe('Completion date (竣工予定日, YYYY-MM-DD)'),
  handoverDate: z.string().optional().describe('Handover date (引渡し予定日, YYYY-MM-DD)'),
});

const ProjectsUpdateParams = z.object({
  projectId: z.string().describe('Project ID to update (e.g. "P-00001")'),
  name: z.string().optional().describe('New project name'),
  status: z.string().optional().describe('New status'),
  priority: z.string().optional().describe('New priority'),
  client: z.string().optional().describe('New client name'),
  startDate: z.string().optional().describe('New start date (YYYY-MM-DD)'),
  dueDate: z.string().optional().describe('New due date (YYYY-MM-DD)'),
  location: z.string().optional().describe('New location'),
  folderUrl: z.string().optional().describe('New folder URL'),
  notes: z.string().optional().describe('New notes'),
  siteSurveyDate: z.string().optional().describe('Site survey date (現地調査日, YYYY-MM-DD)'),
  layoutDate: z.string().optional().describe('Layout finalization date (レイアウト確定日, YYYY-MM-DD)'),
  perspectiveDate: z.string().optional().describe('Perspective finalization date (パース確定日, YYYY-MM-DD)'),
  basicDesignDate: z.string().optional().describe('Basic design completion date (基本設計完了日, YYYY-MM-DD)'),
  constructionSurveyDate: z.string().optional().describe('Construction survey date (設計施工現調日, YYYY-MM-DD)'),
  estimateDate: z.string().optional().describe('Estimate finalization date (見積確定日, YYYY-MM-DD)'),
  constructionStartDate: z.string().optional().describe('Construction start date (着工日, YYYY-MM-DD)'),
  interimInspectionDate: z.string().optional().describe('Interim inspection date (中間検査日, YYYY-MM-DD)'),
  completionDate: z.string().optional().describe('Completion date (竣工予定日, YYYY-MM-DD)'),
  handoverDate: z.string().optional().describe('Handover date (引渡し予定日, YYYY-MM-DD)'),
});

const ProjectsDeleteParams = z.object({
  projectId: z.string().describe('Project ID to delete (e.g. "P-00001")'),
});

const StagesCreateParams = z.object({
  projectId: z.string().describe('Project ID to create the stage in (e.g. "P-00001")'),
  name: z.string().describe('Stage name (工程名)'),
  startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
  orderIndex: z.number().optional().describe('Display order index'),
});

const StagesUpdateParams = z.object({
  stageId: z.string().describe('Stage ID to update (e.g. "T-00100")'),
  name: z.string().optional().describe('New stage name'),
  startDate: z.string().optional().describe('New start date (YYYY-MM-DD)'),
  dueDate: z.string().optional().describe('New due date (YYYY-MM-DD)'),
  orderIndex: z.number().optional().describe('New display order index'),
});

const StagesDeleteParams = z.object({
  stageId: z.string().describe('Stage ID to delete (e.g. "T-00100"). This is a hard delete — child tasks will have their parentId cleared.'),
});

/**
 * Write ツールをサーバーに登録する
 */
export function registerWriteTools(
  server: McpServer,
  getContext: () => McpContext
) {
  // ── tasks_create ──
  (server as any).tool(
    'tasks_create',
    'Create a new task. Always include both startDate and dueDate so the task appears on the Gantt chart. Use idempotencyKey to prevent duplicates.',
    TasksCreateParams.shape,
    async (args: z.infer<typeof TasksCreateParams>) => {
      const ctx = getContext();

      // 権限チェック: viewer は書き込み不可
      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot create tasks.' }],
          isError: true,
        };
      }

      // 冪等性チェック
      if (args.idempotencyKey) {
        const existing = await findIdempotent(ctx.orgId, args.idempotencyKey);
        if (existing) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(existing, null, 2),
              },
            ],
          };
        }
      }

      // サーバーサイドバリデーション
      const validation = await validateTaskFields({
        orgId: ctx.orgId,
        projectId: args.projectId,
        assignee: args.assignee,
        phase: args.phase,
        startDate: args.startDate,
        dueDate: args.dueDate,
        taskName: args.taskName,
        taskType: args.taskType,
      });

      if (validation.errors.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Validation failed',
              errors: validation.errors,
              warnings: validation.warnings,
              suggestions: validation.suggestions,
            }, null, 2),
          }],
          isError: true,
        };
      }

      // フィールドマッピング
      const mapped = mapTaskFields(args);

      const payload: TaskInput = {
        projectId: args.projectId,
        タスク名: (mapped['タスク名'] as string) ?? args.taskName,
        ステータス: (mapped['ステータス'] as string) ?? '未着手',
        担当者: (mapped['担当者'] as string | undefined) ?? undefined,
        担当者メール: (mapped['担当者メール'] as string | undefined) ?? undefined,
        優先度: (mapped['優先度'] as string | undefined) ?? undefined,
        予定開始日: (mapped['予定開始日'] as string | undefined) ?? undefined,
        期限: (mapped['期限'] as string | undefined) ?? undefined,
        タスク種別: (mapped['タスク種別'] as string | undefined) ?? undefined,
        フェーズ: (mapped['フェーズ'] as string | undefined) ?? undefined,
        orgId: ctx.orgId,
      };

      try {
        const taskId = await createTask(payload, ctx.orgId);
        const baseResult = { taskId, message: `Task "${args.taskName}" created successfully.` };

        // 冪等性キーを保存
        if (args.idempotencyKey) {
          await saveIdempotent(ctx.orgId, args.idempotencyKey, baseResult);
        }

        return {
          content: [{ type: 'text' as const, text: formatValidationForMcp(validation, baseResult) }],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to create task: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── tasks_update ──
  (server as any).tool(
    'tasks_update',
    'Update an existing task. First call tasks_get to get the current updatedAt value. Requires updatedAt for optimistic locking.',
    TasksUpdateParams.shape,
    async (args: z.infer<typeof TasksUpdateParams>) => {
      const ctx = getContext();

      // 権限チェック: viewer は書き込み不可
      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot update tasks.' }],
          isError: true,
        };
      }

      // 楽観ロック: 現在の updatedAt と比較
      const docRef = db
        .collection('orgs')
        .doc(ctx.orgId)
        .collection('tasks')
        .doc(args.taskId);

      const snapshot = await docRef.get();
      if (!snapshot.exists) {
        return {
          content: [{ type: 'text' as const, text: `Task "${args.taskId}" not found.` }],
          isError: true,
        };
      }

      const current = serialize<TaskDoc>(
        snapshot as FirebaseFirestore.QueryDocumentSnapshot
      );

      if (current.deletedAt) {
        return {
          content: [{ type: 'text' as const, text: `Task "${args.taskId}" has been deleted.` }],
          isError: true,
        };
      }

      // updatedAt の比較（楽観ロック）
      const currentUpdatedAt =
        typeof current.updatedAt === 'string'
          ? current.updatedAt
          : '';

      if (currentUpdatedAt && currentUpdatedAt !== args.updatedAt) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: 'Conflict',
                  message:
                    'Task has been modified since you last read it. Re-read the task and retry.',
                  currentUpdatedAt,
                  providedUpdatedAt: args.updatedAt,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // フィールドマッピング（taskId, updatedAt を除外）
      const { taskId: _tid, updatedAt: _uat, ...updateFields } = args;
      const mapped = mapTaskFields(updateFields);

      if (Object.keys(mapped).length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No valid fields to update.' }],
          isError: true,
        };
      }

      // assignee 更新時のバリデーション
      if (args.assignee) {
        const validation = await validateAssigneeUpdate({
          orgId: ctx.orgId,
          assignee: args.assignee,
        });
        if (validation.errors.length > 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Validation failed',
                errors: validation.errors,
              }, null, 2),
            }],
            isError: true,
          };
        }
      }

      try {
        await updateTask(args.taskId, mapped as Partial<TaskInput>, ctx.orgId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { taskId: args.taskId, message: 'Task updated successfully.' },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to update task: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── tasks_delete ──
  (server as any).tool(
    'tasks_delete',
    'Soft-delete a task. The task can be restored later.',
    TasksDeleteParams.shape,
    async (args: z.infer<typeof TasksDeleteParams>) => {
      const ctx = getContext();

      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot delete tasks.' }],
          isError: true,
        };
      }

      try {
        await deleteTask(args.taskId, ctx.orgId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { taskId: args.taskId, message: 'Task deleted successfully.' },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to delete task: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── tasks_complete ──
  (server as any).tool(
    'tasks_complete',
    'Mark a task as complete or revert it to in-progress.',
    TasksCompleteParams.shape,
    async (args: z.infer<typeof TasksCompleteParams>) => {
      const ctx = getContext();

      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot modify tasks.' }],
          isError: true,
        };
      }

      try {
        await completeTask(args.taskId, args.done, ctx.orgId);
        const action = args.done ? 'completed' : 'reverted to in-progress';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { taskId: args.taskId, message: `Task ${action} successfully.` },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to update task completion: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── projects_create ──
  (server as any).tool(
    'projects_create',
    'Create a new project.',
    ProjectsCreateParams.shape,
    async (args: z.infer<typeof ProjectsCreateParams>) => {
      const ctx = getContext();

      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot create projects.' }],
          isError: true,
        };
      }

      const mapped = mapProjectFields(args);

      const payload: ProjectInput = {
        物件名: (mapped['物件名'] as string) ?? args.name,
        ステータス: (mapped['ステータス'] as string) ?? '進行中',
        優先度: (mapped['優先度'] as string) ?? '中',
        クライアント: (mapped['クライアント'] as string | undefined) ?? undefined,
        開始日: (mapped['開始日'] as string | undefined) ?? undefined,
        予定完了日: (mapped['予定完了日'] as string | undefined) ?? undefined,
        所在地_現地: (mapped['所在地_現地'] as string | undefined) ?? undefined,
        フォルダURL: (mapped['フォルダURL'] as string | undefined) ?? undefined,
        備考: (mapped['備考'] as string | undefined) ?? undefined,
        現地調査日: (mapped['現地調査日'] as string | undefined) ?? undefined,
        レイアウト確定日: (mapped['レイアウト確定日'] as string | undefined) ?? undefined,
        パース確定日: (mapped['パース確定日'] as string | undefined) ?? undefined,
        基本設計完了日: (mapped['基本設計完了日'] as string | undefined) ?? undefined,
        設計施工現調日: (mapped['設計施工現調日'] as string | undefined) ?? undefined,
        見積確定日: (mapped['見積確定日'] as string | undefined) ?? undefined,
        着工日: (mapped['着工日'] as string | undefined) ?? undefined,
        中間検査日: (mapped['中間検査日'] as string | undefined) ?? undefined,
        竣工予定日: (mapped['竣工予定日'] as string | undefined) ?? undefined,
        引渡し予定日: (mapped['引渡し予定日'] as string | undefined) ?? undefined,
      };

      try {
        const projectId = await createProject(payload, ctx.orgId, ctx.uid);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { projectId, message: `Project "${args.name}" created successfully.` },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to create project: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── projects_update ──
  (server as any).tool(
    'projects_update',
    'Update an existing project.',
    ProjectsUpdateParams.shape,
    async (args: z.infer<typeof ProjectsUpdateParams>) => {
      const ctx = getContext();

      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot update projects.' }],
          isError: true,
        };
      }

      const { projectId, ...updateFields } = args;
      const mapped = mapProjectFields(updateFields);

      if (Object.keys(mapped).length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No valid fields to update.' }],
          isError: true,
        };
      }

      try {
        await updateProject(args.projectId, mapped as Partial<ProjectInput>, ctx.orgId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { projectId: args.projectId, message: 'Project updated successfully.' },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to update project: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── projects_delete ──
  (server as any).tool(
    'projects_delete',
    'Soft-delete a project. The project can be restored later.',
    ProjectsDeleteParams.shape,
    async (args: z.infer<typeof ProjectsDeleteParams>) => {
      const ctx = getContext();

      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot delete projects.' }],
          isError: true,
        };
      }

      try {
        await deleteProject(args.projectId, ctx.orgId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { projectId: args.projectId, message: 'Project deleted successfully.' },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to delete project: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── stages_create ──
  (server as any).tool(
    'stages_create',
    'Create a new stage (工程) in a project.',
    StagesCreateParams.shape,
    async (args: z.infer<typeof StagesCreateParams>) => {
      const ctx = getContext();

      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot create stages.' }],
          isError: true,
        };
      }

      try {
        const stageId = await createStage({
          projectId: args.projectId,
          orgId: ctx.orgId,
          タスク名: args.name,
          予定開始日: args.startDate ?? null,
          期限: args.dueDate ?? null,
          orderIndex: args.orderIndex ?? null,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { stageId, message: `Stage "${args.name}" created successfully.` },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to create stage: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── stages_update ──
  (server as any).tool(
    'stages_update',
    'Update an existing stage (工程).',
    StagesUpdateParams.shape,
    async (args: z.infer<typeof StagesUpdateParams>) => {
      const ctx = getContext();

      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot update stages.' }],
          isError: true,
        };
      }

      const updates: Record<string, unknown> = {};
      if (args.name !== undefined) updates['タスク名'] = args.name;
      if (args.startDate !== undefined) updates['予定開始日'] = args.startDate;
      if (args.dueDate !== undefined) updates['期限'] = args.dueDate;
      if (args.orderIndex !== undefined) updates['orderIndex'] = args.orderIndex;

      if (Object.keys(updates).length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No valid fields to update.' }],
          isError: true,
        };
      }

      try {
        await updateStage(args.stageId, updates as any, ctx.orgId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { stageId: args.stageId, message: 'Stage updated successfully.' },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to update stage: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── stages_delete ──
  (server as any).tool(
    'stages_delete',
    'Hard-delete a stage (工程). Child tasks will have their parentId cleared.',
    StagesDeleteParams.shape,
    async (args: z.infer<typeof StagesDeleteParams>) => {
      const ctx = getContext();

      if (ctx.role === 'viewer') {
        return {
          content: [{ type: 'text' as const, text: 'Insufficient permissions: viewers cannot delete stages.' }],
          isError: true,
        };
      }

      try {
        await deleteStage(args.stageId, ctx.orgId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { stageId: args.stageId, message: 'Stage deleted successfully.' },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to delete stage: ${err.message ?? String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
