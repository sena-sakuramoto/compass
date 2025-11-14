// Project creation fix deployed
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import express from 'express';
import cors from 'cors';
import projectsRouter from './api/projects';
import tasksRouter from './api/tasks';
import excelRouter from './api/excel';
import peopleRouter from './api/people';
import scheduleRouter from './api/schedule';
import calendarRouter from './api/calendar';
import jobsRouter from './api/jobs';
import settingsRouter from './api/settings';
import usersRouter from './api/users-api';
import projectMembersRouter from './api/project-members-api';
import invitationsRouter from './api/invitations';
import activityLogsRouter from './api/activity-logs';
import { processPendingJobs } from './lib/jobProcessor';
import { runDailyTaskReminders } from './scheduled/taskReminders';

const app = express();

// CORS configuration with strict origin validation
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['https://compass-31e9e.web.app', 'https://compass-31e9e.firebaseapp.com'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy violation: ${origin} is not allowed`));
      }
    },
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/people', peopleRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/users', usersRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api', projectMembersRouter);
app.use('/api', activityLogsRouter);
app.use('/api', excelRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API Error]', {
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: (err as { errors?: unknown[] }).errors
    });
  }

  res.status(500).json({
    error: err.message || 'Internal Server Error'
  });
});

const REGION = process.env.COMPASS_FUNCTION_REGION ?? 'asia-northeast1';
const REMINDER_CRON = process.env.TASK_REMINDER_CRON ?? '0 9 * * *';
const REMINDER_TIMEZONE = process.env.TASK_REMINDER_TIMEZONE ?? 'Asia/Tokyo';
const REMINDER_ENABLED = process.env.TASK_REMINDER_ENABLED ?? 'true';

export const api = onRequest({
  region: REGION,
  maxInstances: 10,
}, app);

export const jobRunner = onRequest({
  region: REGION,
  timeoutSeconds: 180,
  memory: '256MiB',
}, async (_req, res) => {
  try {
    const result = await processPendingJobs();
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[jobRunner] failed', error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

export const taskReminderScheduler = onSchedule({
  region: REGION,
  schedule: REMINDER_CRON,
  timeZone: REMINDER_TIMEZONE,
}, async () => {
  if (REMINDER_ENABLED.toLowerCase() === 'false') {
    console.log('[TaskReminders] Skipped (TASK_REMINDER_ENABLED=false)');
    return;
  }
  await runDailyTaskReminders();
});
