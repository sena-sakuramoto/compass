import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../lib/auth';
import { createPerson, PersonInput } from '../lib/firestore';
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
    const seenEmails = new Set<string>();
    const seenIds = new Set<string>();

    // 1. 自組織のpeopleコレクションから担当者を取得
    const ownOrgPeopleSnapshot = await db
      .collection('orgs')
      .doc(user.orgId)
      .collection('people')
      .get();

    ownOrgPeopleSnapshot.docs.forEach(doc => {
      const person = doc.data();
      const personId = doc.id;
      const email = typeof person.メール === 'string' ? person.メール.trim().toLowerCase() : '';

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

      if (email) {
        seenEmails.add(email);
      }
      if (personId) {
        seenIds.add(personId);
      }
    });

    // 2. アクセス可能なプロジェクトIDを取得（同組織は全件、他組織は明示参加のみ）
    const [ownOrgProjectsSnapshot, explicitMembershipSnapshot] = await Promise.all([
      db.collection('orgs').doc(user.orgId).collection('projects').get(),
      db.collection('project_members').where('userId', '==', req.uid).get(),
    ]);

    const projectIdSet = new Set<string>();
    ownOrgProjectsSnapshot.docs.forEach(doc => projectIdSet.add(doc.id));
    explicitMembershipSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (typeof data.projectId === 'string' && data.projectId) {
        projectIdSet.add(data.projectId);
      }
    });

    const projectIds = Array.from(projectIdSet);

    const addMember = (member: any) => {
      const rawEmail = typeof member.email === 'string' ? member.email.trim().toLowerCase() : '';
      const memberKey = rawEmail || member.userId;
      const fallbackName = rawEmail ? rawEmail.split('@')[0] : '';

      if (!memberKey) return;
      if (rawEmail && seenEmails.has(rawEmail)) return;
      if (!rawEmail && seenIds.has(memberKey)) return;

      peopleMap.set(memberKey, {
        氏名: member.displayName || fallbackName || '',
        役割: member.role || '',
        部署: member.部署 || '',
        メール: member.email || '',
        電話: member.電話 || '',
        '稼働時間/日(h)': null,
        職種: member.職種 || null,
      });

      if (rawEmail) {
        seenEmails.add(rawEmail);
      } else {
        seenIds.add(memberKey);
      }
    };

    // 各プロジェクトのメンバーを取得（10件ずつバッチ）
    for (let i = 0; i < projectIds.length; i += 10) {
      const batch = projectIds.slice(i, i + 10);
      const membersSnapshot = await db.collection('project_members')
        .where('projectId', 'in', batch)
        .get();
      membersSnapshot.docs.forEach(doc => addMember(doc.data()));
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
