import admin from 'firebase-admin';
import type { Request, Response, NextFunction } from 'express';

if (!admin.apps.length) {
  admin.initializeApp();
}

const allowList = (process.env.ALLOW_EMAILS || '').split(',').map((value: string) => value.trim()).filter(Boolean);

export interface AuthedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
  uid?: string; // req.uidとしてアクセスできるようにする
}

export async function verifyToken(token?: string) {
  if (!token) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token, true);
    if (!isAllowedEmail(decoded.email)) {
      return null;
    }
    return decoded;
  } catch (err) {
    console.warn('Failed to verify token', err);
    return null;
  }
}

function isAllowedEmail(email?: string | null) {
  if (!email) return false;
  if (!allowList.length) return true;
  return allowList.some((rule: string) => {
    if (rule.includes('*')) {
      const regex = new RegExp(
        `^${rule
          .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
          .replace(/\*/g, '.*')}$`,
        'i'
      );
      return regex.test(email);
    }
    return rule.toLowerCase() === email.toLowerCase();
  });
}

export function authMiddleware(): (req: AuthedRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const decoded = await verifyToken(token);
    if (!decoded) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.user = decoded;
    req.uid = decoded.uid; // req.uidとしてもアクセスできるようにする
    next();
  };
}
