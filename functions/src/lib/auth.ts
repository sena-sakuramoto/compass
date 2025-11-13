import admin from 'firebase-admin';
import type { Request, Response, NextFunction } from 'express';

if (!admin.apps.length) {
  admin.initializeApp();
}

const allowList = (process.env.ALLOW_EMAILS || '').split(',').map((value: string) => value.trim()).filter(Boolean);
console.log('[Auth] Initialized with ALLOW_EMAILS:', process.env.ALLOW_EMAILS);
console.log('[Auth] Allow list:', allowList);

export interface AuthedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
  uid?: string; // req.uidとしてアクセスできるようにする
}

function getHeaderValue(value?: string | string[]): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function resolveAuthHeader(req: Request) {
  const authorization = getHeaderValue(req.headers.authorization);
  const forwarded = getHeaderValue(req.headers['x-forwarded-authorization']);
  const original = getHeaderValue(req.headers['x-original-authorization']);
  const header = authorization ?? forwarded ?? original;

  return {
    header,
    sources: {
      authorization,
      forwarded,
      original,
    },
  } as const;
}

export async function verifyToken(token?: string) {
  if (!token) {
    console.warn('[Auth] No token provided');
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token, true);
    console.log('[Auth] Token verified successfully for user:', {
      uid: decoded.uid,
      email: decoded.email,
    });
    if (!isAllowedEmail(decoded.email)) {
      console.warn('[Auth] Email not in allow list:', decoded.email, 'Allow list:', allowList);
      return null;
    }
    console.log('[Auth] Email is allowed:', decoded.email);
    return decoded;
  } catch (err) {
    console.warn('[Auth] Failed to verify token:', err);
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
    const { header, sources } = resolveAuthHeader(req);

    console.log(
      '[Auth] Request to:',
      req.method,
      req.path,
      'Authorization present:',
      !!sources.authorization,
      'X-Forwarded-Authorization present:',
      !!sources.forwarded,
      'X-Original-Authorization present:',
      !!sources.original
    );

    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;
    const decoded = await verifyToken(token);
    if (!decoded) {
      console.error('[Auth] Authentication failed for request:', req.method, req.path);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    console.log('[Auth] Authentication successful for:', decoded.email);
    req.user = decoded;
    req.uid = decoded.uid; // req.uidとしてもアクセスできるようにする
    next();
  };
}
