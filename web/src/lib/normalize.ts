import { STATUS_PROGRESS } from './constants';
import { calculateDuration, formatDate, parseDate } from './date';
import type { SnapshotPayload, Project, Task, Person } from './types';

export function toNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  const num = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(num) ? num : 0;
}

const DEFAULT_NOTIFICATION_SETTINGS = {
  開始日: true,
  期限前日: true,
  期限当日: true,
  超過: true,
};

function normalizeTask(raw: any, index: number): Task {
  const projectId = String(raw.projectId ?? raw.ProjectID ?? '').trim();
  const startCandidate = raw.start ?? raw['予定開始日'] ?? raw['実績開始日'];
  const endCandidate = raw.end ?? raw['期限'] ?? raw['実績完了日'];
  const start = formatDate(startCandidate);
  const end = formatDate(endCandidate);
  const estimate = toNumber(raw['工数見積(h)']);
  const actual = toNumber(raw['工数実績(h)']);

  let progress: number;
  if (estimate > 0 && actual >= 0) {
    progress = Math.min(1, Math.max(0, actual / estimate));
  } else {
    const rawProgress = raw.progress ?? raw['進捗率'];
    if (rawProgress != null && rawProgress !== '') {
      const numeric = typeof rawProgress === 'number' ? rawProgress : Number(String(rawProgress).replace(/,/g, ''));
      if (Number.isFinite(numeric)) {
        const normalized = numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
        progress = Math.min(1, Math.max(0, normalized));
      } else {
        progress = STATUS_PROGRESS[String(raw['ステータス'])] ?? 0;
      }
    } else {
      progress = STATUS_PROGRESS[String(raw['ステータス'])] ?? 0;
    }
  }
  if ((STATUS_PROGRESS[String(raw['ステータス'])] ?? 0) === 1 && progress < 1) {
    progress = 1;
  }

  const idFromPayload = raw.id ?? raw.TaskID;
  const fallbackId = `T${String(index + 1).padStart(3, '0')}`;
  const finalId = String(idFromPayload || fallbackId);

  const assignee = raw.assignee ?? raw['担当者'] ?? '';
  const assigneeEmailRaw = raw['担当者メール'] ?? raw.assigneeEmail;
  const assigneeEmail = typeof assigneeEmailRaw === 'string' ? assigneeEmailRaw.trim() : '';

  const rawDependencies = raw['依存タスク'];
  const dependencies = Array.isArray(rawDependencies)
    ? rawDependencies
        .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value: string) => value.length > 0)
    : undefined;

  const notificationsRaw = raw['通知設定'] ?? {};
  const notifications = {
    開始日: notificationsRaw?.['開始日'] ?? DEFAULT_NOTIFICATION_SETTINGS.開始日,
    期限前日: notificationsRaw?.['期限前日'] ?? DEFAULT_NOTIFICATION_SETTINGS.期限前日,
    期限当日: notificationsRaw?.['期限当日'] ?? DEFAULT_NOTIFICATION_SETTINGS.期限当日,
    超過: notificationsRaw?.['超過'] ?? DEFAULT_NOTIFICATION_SETTINGS.超過,
  };

  const calendarEventIdRaw = raw['カレンダーイベントID'] ?? raw['calendarEventId'];
  const calendarEventId = typeof calendarEventIdRaw === 'string'
    ? calendarEventIdRaw.trim() || null
    : calendarEventIdRaw ?? null;

  return {
    id: finalId,
    TaskID: finalId,
    projectId,
    ProjectID: projectId,
    type: raw.type || 'task',
    parentId: raw.parentId ?? null,
    タスク名: raw['タスク名'] ?? raw.name ?? '',
    タスク種別: raw['タスク種別'] ?? '',
    担当者: raw['担当者'] ?? '',
    assignee,
    担当者メール: assigneeEmail || undefined,
    優先度: raw['優先度'] ?? '',
    ステータス: raw['ステータス'] ?? '',
    予定開始日: start,
    期限: end,
    実績開始日: formatDate(raw['実績開始日']),
    実績完了日: formatDate(raw['実績完了日']),
    ['工数見積(h)']: estimate,
    ['工数実績(h)']: actual,
    '依頼元': raw['依頼元'] ?? raw['依頼元/連絡先'] ?? '',
    '依存タスク': dependencies,
    'カレンダーイベントID': calendarEventId,
    '通知設定': notifications,
    マイルストーン: raw['マイルストーン'] ?? raw['milestone'],
    milestone: raw['マイルストーン'] ?? raw['milestone'],
    start,
    end,
    duration_days: calculateDuration(start, end),
    progress,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizeProjectStatus(status: string | undefined | null): string {
  if (!status) return '';
  // 「完了（引渡し済）」は「完了」に統一
  if (status === '完了（引渡し済）') return '完了';
  return status;
}

function normalizeProject(raw: any): Project {
  const location = raw['所在地/現地'] ?? raw['所在地_現地'] ?? '';
  const sanitizedLocation = raw['所在地_現地'];

  return {
    id: String(raw.id ?? raw.ProjectID ?? raw.projectId ?? ''),
    物件名: raw['物件名'] ?? '',
    クライアント: raw['クライアント'] ?? '',
    LS担当者: raw['LS担当者'] ?? '',
    自社PM: raw['自社PM'] ?? '',
    ステータス: normalizeProjectStatus(raw['ステータス']),
    優先度: raw['優先度'] ?? '',
    開始日: formatDate(raw['開始日']),
    予定完了日: formatDate(raw['予定完了日']),
    現地調査日: formatDate(raw['現地調査日']),
    着工日: formatDate(raw['着工日']),
    竣工予定日: formatDate(raw['竣工予定日']),
    引渡し予定日: formatDate(raw['引渡し予定日']),
    '所在地/現地': location,
    ...(sanitizedLocation !== undefined ? { '所在地_現地': sanitizedLocation } : location ? { '所在地_現地': location } : {}),
    'フォルダURL': raw['フォルダURL'] ?? '',
    '備考': raw['備考'] ?? '',
    施工費: raw['施工費'] != null ? toNumber(raw['施工費']) : undefined,
    memberNames: Array.isArray(raw.memberNames) ? raw.memberNames.filter(Boolean) : undefined,
    memberNamesUpdatedAt: raw.memberNamesUpdatedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizePeople(raw: any, index: number): Person {
  const rawDailyHours = raw['稼働時間/日(h)'];
  const dailyHours = rawDailyHours == null || rawDailyHours === '' ? undefined : toNumber(rawDailyHours);

  const idFromPayload = raw.id;
  const fallbackId = `PERSON${String(index + 1).padStart(3, '0')}`;
  const finalId = String(idFromPayload || fallbackId);

  const rawType = typeof raw.type === 'string' ? raw.type.trim() : undefined;
  const normalizedType: Person['type'] | undefined =
    rawType === 'client' ? 'client' : rawType === 'person' ? 'person' : undefined;

  return {
    id: finalId,
    ...(normalizedType ? { type: normalizedType } : {}),
    氏名: raw['氏名'],
    役割: raw['役割'] ?? '',
    部署: raw['部署'] ?? '',
    メール: raw['メール'] ?? '',
    電話: raw['電話'] ?? '',
    '稼働時間/日(h)': dailyHours,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function computeProjectAggregates(projects: Project[], tasks: Task[]): Project[] {
  const byProject: Record<string, Task[]> = {};
  tasks.forEach((task) => {
    if (!task.projectId) return;
    if (!byProject[task.projectId]) byProject[task.projectId] = [];
    byProject[task.projectId].push(task);
  });

  return projects.map((project) => {
    const list = byProject[project.id] ?? [];
    if (!list.length) return project;
    let totalEstimate = 0;
    let weighted = 0;
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;

    list.forEach((task) => {
      const estimate = toNumber(task['工数見積(h)']);
      const progress = task.progress ?? STATUS_PROGRESS[task.ステータス] ?? 0;
      totalEstimate += estimate;
      weighted += estimate > 0 ? estimate * progress : progress;

      const start = parseDate(task.start);
      const end = parseDate(task.end ?? task.期限);
      if (start) minStart = !minStart || start < minStart ? start : minStart;
      if (end) maxEnd = !maxEnd || end > maxEnd ? end : maxEnd;
    });

    const progressAggregate = totalEstimate > 0 ? weighted / totalEstimate : weighted / list.length;

    return {
      ...project,
      progressAggregate: Math.min(1, Math.max(0, progressAggregate || 0)),
      span: {
        start: formatDate(minStart ?? project.開始日),
        end: formatDate(maxEnd ?? project.予定完了日),
      },
    };
  });
}

export function normalizeSnapshot(payload: SnapshotPayload): SnapshotPayload {
  const projects = (payload.projects ?? []).map(normalizeProject);
  const tasks = (payload.tasks ?? []).map(normalizeTask);
  const people = (payload.people ?? []).map((raw, index) => normalizePeople(raw, index));
  const enrichedProjects = computeProjectAggregates(projects, tasks);
  return {
    generated_at: payload.generated_at,
    projects: enrichedProjects,
    tasks,
    people,
  };
}

export const SAMPLE_SNAPSHOT: SnapshotPayload = {
  generated_at: '2025-10-04 15:19:48',
  projects: [
    {
      id: 'P-0001',
      物件名: 'LS_新宿南口 店舗新装',
      クライアント: 'LS',
      LS担当者: '鈴木 花子',
      自社PM: '櫻本 聖成',
      ステータス: '設計中',
      優先度: '高',
      開始日: '2025-08-22',
      予定完了日: '2025-10-06',
      '所在地/現地': '新宿区',
    },
  ],
  tasks: [
    {
      id: 'T001',
      projectId: 'P-0001',
      タスク名: '基本設計_レイアウト案',
      タスク種別: '設計',
      担当者: '櫻本 聖成',
      assignee: '櫻本 聖成',
      優先度: '高',
      ステータス: '進行中',
      予定開始日: '2025-09-01',
      期限: '2025-09-08',
      ['工数見積(h)']: 16,
      ['工数実績(h)']: 10,
      '依頼元': 'LS',
      start: '2025-09-01',
      end: '2025-09-08',
      duration_days: 7,
      progress: 0.625,
    },
    {
      id: 'T002',
      projectId: 'P-0001',
      タスク名: '設備レイアウト調整',
      タスク種別: '設備',
      担当者: '中村',
      assignee: '中村',
      優先度: '中',
      ステータス: '未着手',
      予定開始日: '2025-09-05',
      期限: '2025-09-12',
      ['工数見積(h)']: 12,
      ['工数実績(h)']: 0,
      依頼元: 'LS',
      start: '2025-09-05',
      end: '2025-09-12',
      duration_days: 7,
      progress: 0,
    },
  ],
  people: [
    { id: 'PERSON001', 氏名: '櫻本 聖成', 役割: 'PM/設計統括', メール: 's.sakuramoto@archi-prisma.co.jp' },
    { id: 'PERSON002', 氏名: '中村', 役割: '管理建築士/設計', メール: 's.nakamura@archi-prisma.co.jp' },
  ],
};
