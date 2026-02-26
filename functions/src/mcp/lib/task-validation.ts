/**
 * MCP / GPT API 共通タスクバリデーション
 *
 * assignee / phase のサーバーサイド検証、日付警告、マイルストーン提案を行う。
 */
import { listUsers } from '../../lib/users';
import { listStages } from '../../lib/firestore';
import type { TaskDoc } from '../../lib/firestore';

export interface TaskValidationResult {
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/** マイルストーンを示唆するキーワード */
const MILESTONE_KEYWORDS = [
  '竣工', '引渡', '引き渡し', '着工', '検査', '確認申請',
  '上棟', '地鎮祭', '完了検査', '中間検査', '配筋検査',
  '検収', '建方', '申請',
];

/**
 * タスク作成時のフィールドバリデーション
 */
export async function validateTaskFields(opts: {
  orgId: string;
  projectId: string;
  assignee?: string;
  phase?: string;
  startDate?: string;
  dueDate?: string;
  taskName?: string;
  taskType?: string;
}): Promise<TaskValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // ── assignee チェック ──
  if (opts.assignee) {
    const users = await listUsers({ orgId: opts.orgId, isActive: true });
    const validNames = users.map((u) => u.displayName).filter(Boolean);
    const match = validNames.find((n) => n === opts.assignee);
    if (!match) {
      errors.push(
        `担当者 "${opts.assignee}" は組織内に存在しません。有効な担当者: [${validNames.join(', ')}]`
      );
    }
  }

  // ── phase チェック ──
  if (opts.phase) {
    let stages: TaskDoc[] = [];
    try {
      stages = await listStages(opts.projectId, opts.orgId);
    } catch {
      // stages取得失敗は無視
    }

    if (stages.length === 0) {
      warnings.push(
        `プロジェクトに工程(stage)が未登録です。phase "${opts.phase}" はそのまま設定しますが、ガントの工程グループには反映されない可能性があります。`
      );
    } else {
      const stageNames = stages.map((s) => s.タスク名).filter(Boolean);
      const match = stageNames.find((n) => n === opts.phase);
      if (!match) {
        errors.push(
          `工程 "${opts.phase}" はプロジェクト内に存在しません。有効な工程: [${stageNames.join(', ')}]`
        );
      }
    }
  }

  // ── 日付チェック ──
  if (!opts.startDate || !opts.dueDate) {
    const missing: string[] = [];
    if (!opts.startDate) missing.push('startDate');
    if (!opts.dueDate) missing.push('dueDate');
    warnings.push(
      `${missing.join(' と ')} が未指定です。両方の日付がないとガントチャートに表示されません。`
    );
  }

  // ── マイルストーン提案 ──
  if (opts.taskName && opts.taskType !== 'milestone') {
    const name = opts.taskName;
    const matched = MILESTONE_KEYWORDS.filter((kw) => name.includes(kw));
    if (matched.length > 0) {
      suggestions.push(
        `タスク名に "${matched.join(', ')}" が含まれています。マイルストーン (taskType: "milestone") の方が適切かもしれません。`
      );
    }
  }

  return { errors, warnings, suggestions };
}

/**
 * タスク更新時の担当者バリデーション（assignee変更時のみ）
 */
export async function validateAssigneeUpdate(opts: {
  orgId: string;
  assignee: string;
}): Promise<TaskValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const users = await listUsers({ orgId: opts.orgId, isActive: true });
  const validNames = users.map((u) => u.displayName).filter(Boolean);
  const match = validNames.find((n) => n === opts.assignee);
  if (!match) {
    errors.push(
      `担当者 "${opts.assignee}" は組織内に存在しません。有効な担当者: [${validNames.join(', ')}]`
    );
  }

  return { errors, warnings, suggestions };
}

/**
 * バリデーション結果を MCP レスポンステキストに整形
 */
export function formatValidationForMcp(
  result: TaskValidationResult,
  baseResult: Record<string, unknown>
): string {
  const output: Record<string, unknown> = { ...baseResult };
  if (result.warnings.length > 0) output.warnings = result.warnings;
  if (result.suggestions.length > 0) output.suggestions = result.suggestions;
  return JSON.stringify(output, null, 2);
}
