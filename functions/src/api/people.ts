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

    const { db } = await import('../lib/firestore');
    const peopleMap = new Map<string, any>();

    // 1. 自組織のpeopleコレクションから担当者を取得
    const ownOrgPeopleSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('people')
      .get();

    ownOrgPeopleSnapshot.docs.forEach(doc => {
      const person = doc.data();
      const personId = doc.id;
      peopleMap.set(personId, {
        id: personId,
        氏名: person.氏名 || '',
        役割: person.役割 || '',
        部署: person.部署 || '',
        メール: person.メール || '',
        電話: person.電話 || '',
        '稼働時間/日(h)': person['稼働時間/日(h)'] || null,
        職種: person.職種 || null,
      });
    });

    // 2. ユーザーが参加しているプロジェクトのメンバーを取得（クロスオーガナイゼーション対応）
    const { listUserProjects } = await import('../lib/project-members');
    const userProjectMemberships = await listUserProjects(null, req.uid);

    // プロジェクトIDのリストを取得
    const projectIds = userProjectMemberships.map(m => m.projectId);

    // 各プロジェクトのメンバーを取得
    for (const projectId of projectIds) {
      const membersSnapshot = await db.collection('project_members')
        .where('projectId', '==', projectId)
        .get();

      membersSnapshot.docs.forEach(doc => {
        const member = doc.data();
        // メールアドレスをキーとして使用（組織をまたいで一意）
        const memberKey = member.email || member.userId;

        // 既に存在しない場合のみ追加（自組織のpeopleデータを優先）
        if (memberKey && !Array.from(peopleMap.values()).some(p => p.メール === member.email)) {
          peopleMap.set(memberKey, {
            氏名: member.displayName || member.email?.split('@')[0] || '',
            役割: member.role || '',
            部署: member.部署 || '',
            メール: member.email || '',
            電話: member.電話 || '',
            '稼働時間/日(h)': null,
            職種: member.職種 || null,
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
