import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { listPeople, createPerson, PersonInput } from '../lib/firestore';
import { getUser } from '../lib/users';

const router = Router();

router.use(authMiddleware());

router.get('/', async (req: any, res, next) => {
  try {
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // ユーザーが参加しているプロジェクトのメンバーを取得（クロスオーガナイゼーション対応）
    const { listUserProjects } = await import('../lib/project-members');
    const userProjectMemberships = await listUserProjects(null, req.uid);

    // 各プロジェクトのメンバーを取得
    const { db } = await import('../lib/firestore');
    const memberEmails = new Set<string>();
    const peopleMap = new Map();

    for (const { projectId } of userProjectMemberships) {
      // プロジェクトのメンバーを取得
      const membersSnapshot = await db.collection('project_members')
        .where('projectId', '==', projectId)
        .get();

      membersSnapshot.docs.forEach(doc => {
        const member = doc.data();
        if (member.email && !memberEmails.has(member.email)) {
          memberEmails.add(member.email);
          peopleMap.set(member.email, {
            氏名: member.displayName || member.email.split('@')[0],
            役割: member.role,
            メール: member.email,
            職種: member.職種 || null,
            電話: null,
            '稼働時間/日(h)': null,
          });
        }
      });
    }

    const people = Array.from(peopleMap.values());
    res.json({ people });
  } catch (error) {
    next(error);
  }
});

const personSchema = z.object({
  氏名: z.string().min(1),
  役割: z.string().optional(),
  メール: z.string().email().optional(),
  電話: z.string().optional(),
  '稼働時間/日(h)': z.number().optional(),
});

router.post('/', async (req: any, res, next) => {
  try {
    const payload = personSchema.parse(req.body) as PersonInput;
    const user = await getUser(req.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const id = await createPerson(payload, user.orgId);
    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

export default router;
