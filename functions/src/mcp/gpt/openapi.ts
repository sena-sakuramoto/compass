/**
 * ChatGPT Custom GPT 用 OpenAPI 3.1 スペック
 *
 * GET /gpt/openapi.json で提供し、GPT Builder にペーストして使う。
 */
import type { Request, Response } from 'express';

const GATEWAY_URL = process.env.MCP_GATEWAY_URL || 'https://compass-31e9e.web.app';

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Compass - Construction Project Management API',
    description: 'API for managing construction projects, tasks, stages, and users in Compass — a Gantt-chart-based project management tool for Japanese architecture firms.\n\nIMPORTANT RULES:\n- When creating tasks, always provide both startDate and dueDate (YYYY-MM-DD) so tasks appear on the Gantt chart.\n- Status values are in Japanese: "未着手" (not started), "進行中" (in progress), "完了" (completed).\n- Priority values: "高" (high), "中" (medium), "低" (low).\n- When updating tasks, first GET the task to obtain the current updatedAt value for optimistic locking.\n- Use GET /users to find valid assignee displayName values before creating tasks.',
    version: '1.0.0',
  },
  servers: [
    { url: `${GATEWAY_URL}/gpt/api/v1`, description: 'Production' },
  ],
  paths: {
    '/projects': {
      get: {
        operationId: 'listProjects',
        summary: 'List projects',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status' },
        ],
        responses: {
          '200': {
            description: 'Array of projects',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ProjectSummary' } } } },
          },
        },
      },
      post: {
        operationId: 'createProject',
        summary: 'Create a project',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectCreate' } } } },
        responses: { '201': { description: 'Project created', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } } },
      },
    },
    '/projects/{projectId}': {
      get: {
        operationId: 'getProject',
        summary: 'Get project details',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Project details', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectDetail' } } } } },
      },
      patch: {
        operationId: 'updateProject',
        summary: 'Update a project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectUpdate' } } } },
        responses: { '200': { description: 'Project updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } } },
      },
      delete: {
        operationId: 'deleteProject',
        summary: 'Delete a project (soft-delete)',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Project deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } } },
      },
    },
    '/tasks': {
      get: {
        operationId: 'listTasks',
        summary: 'Search tasks (use projectId to scope results)',
        parameters: [
          { name: 'projectId', in: 'query', schema: { type: 'string' }, description: 'Filter by project ID' },
          { name: 'assignee', in: 'query', schema: { type: 'string' }, description: 'Filter by assignee name' },
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status' },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search' },
        ],
        responses: { '200': { description: 'Array of tasks', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/TaskSummary' } } } } } },
      },
      post: {
        operationId: 'createTask',
        summary: 'Create a task (always include startDate + dueDate for Gantt chart)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskCreate' } } } },
        responses: {
          '201': { description: 'Task created', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } },
          '422': { description: 'Validation error — assignee or phase not found. Response includes valid options.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
        },
      },
    },
    '/tasks/{taskId}': {
      get: {
        operationId: 'getTask',
        summary: 'Get task details',
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Task details', content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskDetail' } } } } },
      },
      patch: {
        operationId: 'updateTask',
        summary: 'Update a task (requires updatedAt from GET /tasks/{taskId})',
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskUpdate' } } } },
        responses: {
          '200': { description: 'Task updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } },
          '409': { description: 'Conflict — task was modified by another user' },
          '422': { description: 'Validation error — assignee not found. Response includes valid options.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
        },
      },
      delete: {
        operationId: 'deleteTask',
        summary: 'Delete a task (soft-delete)',
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Task deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } } },
      },
    },
    '/tasks/{taskId}/complete': {
      post: {
        operationId: 'completeTask',
        summary: 'Mark task as complete or revert to in-progress',
        parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { done: { type: 'boolean', description: 'true to complete, false to revert' } } } } } },
        responses: { '200': { description: 'Task completion toggled', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } } },
      },
    },
    '/projects/{projectId}/stages': {
      get: {
        operationId: 'listStages',
        summary: 'List stages for a project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Array of stages', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/StageSummary' } } } } } },
      },
      post: {
        operationId: 'createStage',
        summary: 'Create a stage in a project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StageCreate' } } } },
        responses: { '201': { description: 'Stage created', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } } },
      },
    },
    '/stages/{stageId}': {
      patch: {
        operationId: 'updateStage',
        summary: 'Update a stage',
        parameters: [{ name: 'stageId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StageUpdate' } } } },
        responses: { '200': { description: 'Stage updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } } },
      },
      delete: {
        operationId: 'deleteStage',
        summary: 'Delete a stage (hard-delete)',
        parameters: [{ name: 'stageId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Stage deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MutationResult' } } } } },
      },
    },
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List organization members (use to get valid assignee displayName values)',
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string' }, description: 'Filter by role (owner, admin, member, viewer)' },
        ],
        responses: { '200': { description: 'Array of users', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/UserSummary' } } } } } },
      },
    },
  },
  components: {
    schemas: {
      ProjectSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          client: { type: ['string', 'null'] },
          status: { type: 'string' },
          priority: { type: 'string' },
          startDate: { type: ['string', 'null'] },
          dueDate: { type: ['string', 'null'] },
          updatedAt: { type: 'string' },
        },
      },
      ProjectDetail: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          client: { type: ['string', 'null'] },
          status: { type: 'string' },
          priority: { type: 'string' },
          startDate: { type: ['string', 'null'] },
          dueDate: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          folderUrl: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
          constructionCost: { type: ['number', 'null'] },
          siteSurveyDate: { type: ['string', 'null'], description: 'Site survey date (現地調査日)' },
          layoutDate: { type: ['string', 'null'], description: 'Layout finalization date (レイアウト確定日)' },
          perspectiveDate: { type: ['string', 'null'], description: 'Perspective finalization date (パース確定日)' },
          basicDesignDate: { type: ['string', 'null'], description: 'Basic design completion date (基本設計完了日)' },
          constructionSurveyDate: { type: ['string', 'null'], description: 'Construction survey date (設計施工現調日)' },
          estimateDate: { type: ['string', 'null'], description: 'Estimate finalization date (見積確定日)' },
          constructionStartDate: { type: ['string', 'null'], description: 'Construction start date (着工日)' },
          interimInspectionDate: { type: ['string', 'null'], description: 'Interim inspection date (中間検査日)' },
          completionDate: { type: ['string', 'null'], description: 'Completion date (竣工予定日)' },
          handoverDate: { type: ['string', 'null'], description: 'Handover date (引渡し予定日)' },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      },
      ProjectCreate: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Project name' },
          status: { type: 'string', description: 'Status (default: "進行中")' },
          priority: { type: 'string', description: 'Priority (高/中/低)' },
          client: { type: 'string' },
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          dueDate: { type: 'string', description: 'YYYY-MM-DD' },
          location: { type: 'string' },
          folderUrl: { type: 'string' },
          notes: { type: 'string' },
          siteSurveyDate: { type: 'string', description: 'Site survey date (YYYY-MM-DD)' },
          layoutDate: { type: 'string', description: 'Layout finalization date (YYYY-MM-DD)' },
          perspectiveDate: { type: 'string', description: 'Perspective finalization date (YYYY-MM-DD)' },
          basicDesignDate: { type: 'string', description: 'Basic design completion date (YYYY-MM-DD)' },
          constructionSurveyDate: { type: 'string', description: 'Construction survey date (YYYY-MM-DD)' },
          estimateDate: { type: 'string', description: 'Estimate finalization date (YYYY-MM-DD)' },
          constructionStartDate: { type: 'string', description: 'Construction start date (YYYY-MM-DD)' },
          interimInspectionDate: { type: 'string', description: 'Interim inspection date (YYYY-MM-DD)' },
          completionDate: { type: 'string', description: 'Completion date (YYYY-MM-DD)' },
          handoverDate: { type: 'string', description: 'Handover date (YYYY-MM-DD)' },
        },
      },
      ProjectUpdate: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'string' },
          client: { type: 'string' },
          startDate: { type: 'string' },
          dueDate: { type: 'string' },
          location: { type: 'string' },
          folderUrl: { type: 'string' },
          notes: { type: 'string' },
          siteSurveyDate: { type: 'string', description: 'Site survey date (YYYY-MM-DD)' },
          layoutDate: { type: 'string', description: 'Layout finalization date (YYYY-MM-DD)' },
          perspectiveDate: { type: 'string', description: 'Perspective finalization date (YYYY-MM-DD)' },
          basicDesignDate: { type: 'string', description: 'Basic design completion date (YYYY-MM-DD)' },
          constructionSurveyDate: { type: 'string', description: 'Construction survey date (YYYY-MM-DD)' },
          estimateDate: { type: 'string', description: 'Estimate finalization date (YYYY-MM-DD)' },
          constructionStartDate: { type: 'string', description: 'Construction start date (YYYY-MM-DD)' },
          interimInspectionDate: { type: 'string', description: 'Interim inspection date (YYYY-MM-DD)' },
          completionDate: { type: 'string', description: 'Completion date (YYYY-MM-DD)' },
          handoverDate: { type: 'string', description: 'Handover date (YYYY-MM-DD)' },
        },
      },
      TaskSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          name: { type: 'string' },
          assignee: { type: ['string', 'null'] },
          status: { type: 'string' },
          priority: { type: ['string', 'null'] },
          startDate: { type: ['string', 'null'] },
          dueDate: { type: ['string', 'null'] },
          progress: { type: ['number', 'null'] },
          updatedAt: { type: 'string' },
        },
      },
      TaskDetail: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string' },
          assignee: { type: ['string', 'null'] },
          assigneeEmail: { type: ['string', 'null'] },
          status: { type: 'string' },
          priority: { type: ['string', 'null'] },
          startDate: { type: ['string', 'null'] },
          dueDate: { type: ['string', 'null'] },
          actualStartDate: { type: ['string', 'null'] },
          actualEndDate: { type: ['string', 'null'] },
          progress: { type: ['number', 'null'] },
          milestone: { type: 'boolean' },
          estimatedHours: { type: ['number', 'null'] },
          actualHours: { type: ['number', 'null'] },
          dependencies: { type: ['string', 'null'] },
          requestedBy: { type: ['string', 'null'] },
          phase: { type: ['string', 'null'] },
          sprint: { type: ['string', 'null'] },
          parentId: { type: ['string', 'null'] },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      },
      TaskCreate: {
        type: 'object',
        description: 'Always provide both startDate and dueDate so the task appears on the Gantt chart. Use GET /users to find valid assignee names. The server validates assignee and phase — invalid values return 422 with valid options.',
        required: ['projectId', 'taskName'],
        properties: {
          projectId: { type: 'string', description: 'Project ID (e.g. "P-00001")' },
          taskName: { type: 'string', description: 'Task name' },
          assignee: { type: 'string', description: 'Must match a displayName from GET /users. Server-validated: returns 422 with valid names if no match.' },
          assigneeEmail: { type: 'string' },
          status: { type: 'string', description: 'Default: "未着手". Options: "未着手", "進行中", "完了"' },
          priority: { type: 'string', description: '高/中/低' },
          startDate: { type: 'string', description: 'YYYY-MM-DD. IMPORTANT: Always provide with dueDate for Gantt chart.' },
          dueDate: { type: 'string', description: 'YYYY-MM-DD. IMPORTANT: Always provide with startDate for Gantt chart.' },
          taskType: { type: 'string' },
          phase: { type: 'string', description: 'Stage name from GET /projects/{projectId}/stages. Server-validated: returns 422 with valid stage names if no match.' },
        },
      },
      TaskUpdate: {
        type: 'object',
        description: 'Get updatedAt from GET /tasks/{taskId} first. This field is required for optimistic locking.',
        required: ['updatedAt'],
        properties: {
          updatedAt: { type: 'string', description: 'Current updatedAt ISO timestamp from GET /tasks/{taskId}' },
          taskName: { type: 'string' },
          assignee: { type: 'string', description: 'Must match a displayName from GET /users' },
          assigneeEmail: { type: 'string' },
          status: { type: 'string', description: '"未着手", "進行中", or "完了"' },
          priority: { type: 'string', description: '高/中/低' },
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          dueDate: { type: 'string', description: 'YYYY-MM-DD' },
          progress: { type: 'number', description: '0-1' },
        },
      },
      StageSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          name: { type: 'string' },
          startDate: { type: ['string', 'null'] },
          dueDate: { type: ['string', 'null'] },
          orderIndex: { type: ['number', 'null'] },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      },
      StageCreate: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Stage name' },
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          dueDate: { type: 'string', description: 'YYYY-MM-DD' },
          orderIndex: { type: 'number' },
        },
      },
      StageUpdate: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          startDate: { type: 'string' },
          dueDate: { type: 'string' },
          orderIndex: { type: 'number' },
        },
      },
      UserSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          displayName: { type: 'string' },
          role: { type: 'string' },
          jobTitle: { type: ['string', 'null'] },
          department: { type: ['string', 'null'] },
        },
      },
      MutationResult: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          taskId: { type: 'string' },
          stageId: { type: 'string' },
          message: { type: 'string' },
          warnings: { type: 'array', items: { type: 'string' }, description: 'Validation warnings (task was still created)' },
          suggestions: { type: 'array', items: { type: 'string' }, description: 'Suggestions (e.g. consider milestone type)' },
        },
      },
      ValidationError: {
        type: 'object',
        description: 'Returned when server-side validation fails (422). Contains valid options to help the LLM retry with correct values.',
        properties: {
          error: { type: 'string', description: 'Always "Validation failed"' },
          errors: { type: 'array', items: { type: 'string' }, description: 'Blocking errors with valid options listed' },
          warnings: { type: 'array', items: { type: 'string' }, description: 'Non-blocking warnings' },
          suggestions: { type: 'array', items: { type: 'string' }, description: 'Suggestions for improvement' },
        },
      },
    },
    securitySchemes: {
      oauth2: {
        type: 'oauth2',
        flows: {
          authorizationCode: {
            authorizationUrl: `${GATEWAY_URL}/gpt/authorize`,
            tokenUrl: `${GATEWAY_URL}/gpt/token`,
            scopes: {
              'compass:read': 'Read projects, tasks, stages, users',
              'compass:write': 'Create, update, delete projects, tasks, stages',
            },
          },
        },
      },
    },
  },
  security: [{ oauth2: ['compass:read', 'compass:write'] }],
};

export function serveOpenApiSpec(_req: Request, res: Response): void {
  res.json(spec);
}
