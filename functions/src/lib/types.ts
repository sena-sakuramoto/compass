// 共通型定義

export interface Project {
  id: string;
  物件名: string;
  クライアント?: string | null;
  LS担当者?: string | null;
  自社PM?: string | null;
  ステータス: string;
  優先度: string;
  開始日?: string | null;
  予定完了日?: string | null;
  現地調査日?: string | null;
  着工日?: string | null;
  竣工予定日?: string | null;
  '所在地/現地'?: string | null;
  フォルダURL?: string | null;
  備考?: string | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface Task {
  id: string;
  projectId: string;
  タスク名: string;
  タスク種別?: string | null;
  担当者?: string | null;
  assignee?: string | null;
  担当者メール?: string | null;
  優先度?: string | null;
  ステータス: string;
  予定開始日?: string | null;
  期限?: string | null;
  実績開始日?: string | null;
  実績完了日?: string | null;
  start?: string | null;
  end?: string | null;
  duration_days?: number | null;
  progress?: number | null;
  '工数見積(h)'?: number | null;
  '工数実績(h)'?: number | null;
  依頼元?: string | null;
  '依存タスク'?: string[] | null;
  'カレンダーイベントID'?: string | null;
  '通知設定'?: TaskNotificationSettings | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface TaskNotificationSettings {
  開始日?: boolean;
  期限前日?: boolean;
  期限当日?: boolean;
  超過?: boolean;
}

export interface Person {
  氏名: string;
  役割?: string | null;
  メール?: string | null;
  電話?: string | null;
  '稼働時間/日(h)'?: number | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface Job {
  id: string;
  type: 'notification' | 'calendar_sync' | 'reminder_seed';
  state: 'pending' | 'processing' | 'completed' | 'failed';
  dueAt: FirebaseFirestore.Timestamp;
  payload: Record<string, any>;
  error?: string | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface Counter {
  value: number;
}

// API用の入力型（createdAt/updatedAtなし）
export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;
export type PersonInput = Omit<Person, 'createdAt' | 'updatedAt'>;
export type JobInput = Omit<Job, 'id' | 'state' | 'createdAt' | 'updatedAt'>;

