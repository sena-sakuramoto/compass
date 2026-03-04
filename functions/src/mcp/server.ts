/**
 * McpServer ファクトリ
 * リクエスト毎にステートレスなサーバーインスタンスを生成する。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerReadTools } from './tools/read-tools';
import { registerWriteTools } from './tools/write-tools';
import type { McpContext } from './types';

/**
 * Compass の業務知識・ルールを LLM に伝える instructions。
 * McpServer の ServerOptions.instructions に設定される。
 */
const COMPASS_INSTRUCTIONS = `
Compass is a construction project management tool (工程管理ツール) designed for Japanese architecture firms.
The primary UI is a Gantt chart, so date fields are critical for visualization.

## Data Model
Organization → Project (物件) → Stage (工程) → Task (タスク)
- Projects have milestone dates: 現地調査日, レイアウト確定日, パース確定日, 基本設計完了日, 設計施工現調日, 見積確定日, 着工日, 中間検査日, 竣工予定日, 引渡し予定日
- Stages group related tasks (e.g. "基本設計", "実施設計", "現場監理")
- Tasks belong to a project and optionally to a stage (via parentId/phase)

## CRITICAL RULES

### 1. Always include startDate AND dueDate when creating tasks
Tasks without both dates will NOT appear on the Gantt chart, making them invisible to users.
When the user doesn't specify dates, infer reasonable dates from project milestones or context.
Format: YYYY-MM-DD

### 2. Verify assignee names before creating tasks
Always call users_search first to get valid displayName values.
The assignee field must exactly match a user's displayName from users_search.

### 3. Always get updatedAt before updating tasks
Call tasks_get to retrieve the current updatedAt timestamp before calling tasks_update.
This is required for optimistic locking to prevent conflicts.

### 4. Server-side validation is enforced
The server will REJECT tasks_create if:
- assignee doesn't match any user displayName → error includes valid names list
- phase doesn't match any stage name → error includes valid stage names

The server will WARN (task still created) if:
- startDate or dueDate is missing

The server may SUGGEST if:
- Task name matches milestone keywords → consider setting taskType to "milestone"

When you receive validation errors, present the valid options to the user as choices.

## Field Values (Japanese)
- Status (ステータス): "未着手" (not started), "進行中" (in progress), "完了" (completed)
- Priority (優先度): "高" (high), "中" (medium), "低" (low)

## Recommended Workflow
1. projects_list → find the target project
2. users_search → get valid assignee names
3. stages_list → get existing stages for the project (use as phase field)
4. tasks_create → create tasks with projectId, assignee, startDate, dueDate, and phase

## Tips
- Use projects_get to see milestone dates, which help you infer appropriate task date ranges
- When creating multiple tasks, use idempotencyKey to prevent duplicates on retry
- Task types: "task" (default), "meeting" (打合せ), "milestone" (マイルストーン)
`.trim();

/**
 * 認証済みコンテキストを注入した McpServer を生成する。
 */
export function createMcpServer(context: McpContext): McpServer {
  const server = new McpServer(
    { name: 'compass-mcp', version: '1.0.0' },
    { instructions: COMPASS_INSTRUCTIONS }
  );

  const getContext = () => context;

  registerReadTools(server, getContext);
  registerWriteTools(server, getContext);

  return server;
}
