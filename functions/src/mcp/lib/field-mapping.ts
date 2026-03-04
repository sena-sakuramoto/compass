/**
 * 英語フィールド名 → 日本語フィールド名のマッピング（allowlist）
 * AI が任意のフィールドを送信できないよう、許可リストで制限する。
 */

/** タスク用マッピング */
const TASK_FIELD_MAP: Record<string, string> = {
  taskName: 'タスク名',
  assignee: '担当者',
  assigneeEmail: '担当者メール',
  status: 'ステータス',
  priority: '優先度',
  startDate: '予定開始日',
  dueDate: '期限',
  actualStartDate: '実績開始日',
  actualEndDate: '実績完了日',
  taskType: 'タスク種別',
  estimatedHours: '工数見積(h)',
  actualHours: '工数実績(h)',
  requestedBy: '依頼元',
  phase: 'フェーズ',
  sprint: 'スプリント',
  milestone: 'マイルストーン',
  dependencies: '依存タスク',
};

/** プロジェクト用マッピング */
const PROJECT_FIELD_MAP: Record<string, string> = {
  name: '物件名',
  client: 'クライアント',
  status: 'ステータス',
  priority: '優先度',
  startDate: '開始日',
  dueDate: '予定完了日',
  location: '所在地_現地',
  folderUrl: 'フォルダURL',
  notes: '備考',
  constructionCost: '施工費',
  siteSurveyDate: '現地調査日',
  layoutDate: 'レイアウト確定日',
  perspectiveDate: 'パース確定日',
  basicDesignDate: '基本設計完了日',
  constructionSurveyDate: '設計施工現調日',
  estimateDate: '見積確定日',
  constructionStartDate: '着工日',
  interimInspectionDate: '中間検査日',
  completionDate: '竣工予定日',
  handoverDate: '引渡し予定日',
};

/** 英語→日本語のフィールド名変換（許可リスト外は除外） */
const PASSTHROUGH_FIELDS = new Set([
  'projectId',
  'progress',
  'parentId',
  'orderIndex',
  'type',
  'マイルストーン',
]);

/**
 * 英語キーで受け取った入力を、Firestore のフィールド名にマッピングする。
 * 許可リストにないフィールドは無視される。
 */
export function mapTaskFields(
  input: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (TASK_FIELD_MAP[key]) {
      result[TASK_FIELD_MAP[key]] = value;
    } else if (PASSTHROUGH_FIELDS.has(key)) {
      result[key] = value;
    }
    // 許可リスト外のフィールドは無視
  }

  return result;
}

/**
 * プロジェクト用: 英語キーを Firestore のフィールド名にマッピングする。
 * 許可リストにないフィールドは無視される。
 */
export function mapProjectFields(
  input: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (PROJECT_FIELD_MAP[key]) {
      result[PROJECT_FIELD_MAP[key]] = value;
    }
    // 許可リスト外のフィールドは無視
  }

  return result;
}
