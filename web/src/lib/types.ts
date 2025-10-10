export interface Project {
  id: string;
  物件名: string;
  クライアント?: string;
  LS担当者?: string;
  自社PM?: string;
  ステータス: string;
  優先度: string;
  開始日?: string;
  予定完了日?: string;
  '所在地/現地'?: string;
  'フォルダURL'?: string;
  '備考'?: string;
  createdAt?: string;
  updatedAt?: string;
  progressAggregate?: number;
  span?: { start?: string; end?: string };
}

export interface TaskNotificationSettings {
  開始日: boolean;
  期限前日: boolean;
  期限当日: boolean;
  超過: boolean;
}

export interface Task {
  id: string;
  TaskID?: string;
  projectId: string;
  ProjectID?: string;
  タスク名: string;
  タスク種別?: string;
  担当者?: string;
  assignee?: string;
  担当者メール?: string;
  優先度?: string;
  ステータス: string;
  予定開始日?: string;
  期限?: string;
  実績開始日?: string;
  実績完了日?: string;
  '工数見積(h)'?: number;
  '工数実績(h)'?: number;
  '依頼元'?: string;
  '依存タスク'?: string[];
  'カレンダーイベントID'?: string | null;
  '通知設定'?: TaskNotificationSettings;
  start?: string;
  end?: string;
  duration_days?: number;
  progress?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Person {
  氏名: string;
  役割?: string;
  メール?: string;
  電話?: string;
  '稼働時間/日(h)'?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SnapshotPayload {
  generated_at?: string;
  projects: Project[];
  tasks: Task[];
  people: Person[];
}
