/**
 * WorkItem タイプ
 * stage: 工程（大分類）
 * task: タスク（stage に紐づく実作業）
 */
export type WorkItemType = 'stage' | 'task';

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
  現地調査日?: string;
  着工日?: string;
  竣工予定日?: string;
  引渡し予定日?: string;
  // 追加マイルストーン
  レイアウト確定日?: string;
  基本設計完了日?: string;
  設計施工現調日?: string;
  見積確定日?: string;
  中間検査日?: string;
  '所在地/現地'?: string;
  '所在地_現地'?: string;
  'フォルダURL'?: string;
  '備考'?: string;
  施工費?: number;
  createdAt?: string;
  updatedAt?: string;
  progressAggregate?: number;
  span?: { start?: string; end?: string };
  memberNames?: string[];
  memberNamesUpdatedAt?: string;
  // 役職別メンバー（syncProjectMemberSummaryで自動更新）
  営業?: string | null;
  PM?: string | null;
  設計?: string | null;
  施工管理?: string | null;
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

  // WorkItem 統合のための追加フィールド
  type?: WorkItemType;        // 'stage' | 'task' (未設定時は task として扱う)
  parentId?: string | null;   // task の場合、所属する stage の id
  orderIndex?: number | null; // 表示順序

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
  スプリント?: string;
  フェーズ?: string;
  start?: string;
  end?: string;
  duration_days?: number;
  progress?: number;
  進捗率?: number;
  マイルストーン?: boolean;
  milestone?: boolean;
  createdAt?: string;
  updatedAt?: string;
  version?: number;  // 楽観的ロック用のバージョン番号
  opId?: string;     // 操作ID（楽観的更新のACK用）
}

export interface Person {
  id: string;
  type?: 'person' | 'client'; // 担当者 or クライアント
  氏名: string;
  役割?: string;
  部署?: string;
  会社名?: string; // クライアント用
  メール?: string;
  電話?: string;
  '稼働時間/日(h)'?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ManageableUserSummary {
  id: string;
  email: string;
  displayName: string;
  role: string;
  jobTitle?: string | null;
  department?: string | null;
}

export interface SnapshotPayload {
  generated_at?: string;
  projects: Project[];
  tasks: Task[];
  people: Person[];
}

export interface CompassState {
  projects: Project[];
  tasks: Task[];
  people: Person[];
}

// Stage は Task の特殊ケース（type='stage', parentId=null）
export type Stage = Task & { type: 'stage'; parentId: null };
