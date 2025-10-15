import { onRequest } from 'firebase-functions/v2/https';
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
import { processPendingJobs } from './lib/jobProcessor';

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
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
