import { Router } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import {
  exportSnapshot,
  importSnapshot,
  SnapshotPayload,
  ProjectInput,
  TaskInput,
  PersonDoc,
} from '../lib/firestore';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware());

router.post('/import', upload.single('file'), async (req, res) => {
  const buffer = req.file?.buffer;
  if (!buffer) {
    res.status(400).json({ error: 'File is required' });
    return;
  }

  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const getSheet = (nameVariants: string[]) => {
    for (const name of nameVariants) {
      if (workbook.Sheets[name]) return workbook.Sheets[name];
    }
    return null;
  };

  const projectsSheet = getSheet(['Projects', 'プロジェクト']);
  const tasksSheet = getSheet(['Tasks', 'タスク']);
  const peopleSheet = getSheet(['People', '担当者']);

  if (!projectsSheet || !tasksSheet || !peopleSheet) {
    res.status(400).json({ error: 'Projects/Tasks/People シートが必要です' });
    return;
  }

  const projects = xlsx.utils.sheet_to_json<ProjectInput>(projectsSheet);
  const tasks = xlsx.utils.sheet_to_json<TaskInput>(tasksSheet);
  const people = xlsx.utils.sheet_to_json<PersonDoc>(peopleSheet);

  await importSnapshot({ projects, tasks, people });

  res.json({ imported: { projects: projects.length, tasks: tasks.length, people: people.length } });
});

router.get('/export', async (_req, res) => {
  const snapshot = await exportSnapshot();
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(snapshot.projects ?? []), 'Projects');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(snapshot.tasks ?? []), 'Tasks');
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(snapshot.people ?? []), 'People');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="APDW_Export_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

router.get('/snapshot', async (_req, res) => {
  const snapshot = await exportSnapshot();
  res.json(snapshot);
});

const snapshotSchema = z.object({
  projects: z.array(z.record(z.any())).optional(),
  tasks: z.array(z.record(z.any())).optional(),
  people: z.array(z.record(z.any())).optional(),
});

router.post('/snapshot', async (req, res) => {
  const payload = snapshotSchema.parse(req.body) as SnapshotPayload;
  if (!payload.projects && !payload.tasks && !payload.people) {
    res.status(400).json({ error: 'Projects/Tasks/People のいずれかが必要です' });
    return;
  }
  await importSnapshot(payload);
  res.json({ imported: {
    projects: payload.projects?.length ?? 0,
    tasks: payload.tasks?.length ?? 0,
    people: payload.people?.length ?? 0,
  } });
});

export default router;
