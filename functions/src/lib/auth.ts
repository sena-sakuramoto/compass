import admin from 'firebase-admin';
import type { Request, Response, NextFunction } from 'express';
import { getUser as fetchUserDoc } from './users';
import { evaluateBillingAccess, findStripeCustomer, getOrgBilling } from './billing';

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

export class OrgSetupRequired extends Error {
  constructor(public stripeCustomerId?: string | null) {
    super('Org setup required');
    this.name = 'OrgSetupRequired';
  }
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

    // ALLOW_EMAILSに含まれているかチェック
    if (isAllowedEmail(decoded.email)) {
      console.log('[Auth] Email is in allow list:', decoded.email);
      return decoded;
    }

    // ALLOW_EMAILSに含まれていない場合、招待されているかチェック
    console.log('[Auth] Email not in allow list, checking for invitations/stripe:', decoded.email);
    const hasInvitation = await checkUserHasInvitation(decoded.email);
    if (hasInvitation) {
      console.log('[Auth] User has valid invitation:', decoded.email);
      return decoded;
    }

    // Stripeサブスク利用者であれば認証は通し、後続で組織作成を促す
    const stripeEligibility = await getStripeEligibilityByEmail(decoded.email);
    if (stripeEligibility.eligible) {
      console.log('[Auth] User is Stripe subscriber, allow to proceed to org-setup:', decoded.email);
      return decoded;
    }

    console.warn('[Auth] Email not in allow list and no invitation found:', decoded.email, 'Allow list:', allowList);
    return null;
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

/**
 * ユーザーが有効な招待を持っているかチェック
 */
async function checkUserHasInvitation(email?: string | null): Promise<boolean> {
  if (!email) return false;

  try {
    const db = admin.firestore();

    // 全ての組織の招待をチェック
    const orgsSnapshot = await db.collection('orgs').get();

    for (const orgDoc of orgsSnapshot.docs) {
      // 組織メンバー招待をチェック
      const orgInvitationsSnapshot = await db
        .collection('orgs')
        .doc(orgDoc.id)
        .collection('invitations')
        .where('email', '==', email)
        .where('status', '==', 'pending')
        .get();

      if (!orgInvitationsSnapshot.empty) {
        // 有効期限をチェック
        for (const invDoc of orgInvitationsSnapshot.docs) {
          const invData = invDoc.data();
          const expiresAt = invData.expiresAt?.toMillis?.() || 0;
          if (expiresAt > Date.now()) {
            console.log('[Auth] Found valid org invitation for:', email);
            return true;
          }
        }
      }
    }

    // プロジェクトメンバー招待をチェック
    const projectMembersSnapshot = await db
      .collection('project_members')
      .where('email', '==', email)
      .where('status', '==', 'invited')
      .get();

    if (!projectMembersSnapshot.empty) {
      console.log('[Auth] Found valid project member invitation for:', email);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[Auth] Error checking invitations:', error);
    return false;
  }
}

async function findStripeCustomerViaApi(email: string): Promise<{ customerId: string | null; status: string; entitled: boolean }> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return { customerId: null, status: '', entitled: false };

  const emailLower = email.toLowerCase();
  const fetchStripeSubscriptions = async (status: 'active' | 'trialing') => {
    const params = new URLSearchParams();
    params.set('status', status);
    params.set('limit', '100');
    params.append('expand[]', 'data.customer');

    const response = await fetch(`https://api.stripe.com/v1/subscriptions?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    });

    const payload = (await response.json()) as { data?: any[]; error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Stripe API request failed');
    }
    return payload.data ?? [];
  };

  const matchByEmail = (subs: any[]) => {
    for (const sub of subs) {
      const customer = (sub.customer || {}) as Record<string, unknown>;
      const candidateEmails = [
        (customer.email as string | undefined)?.toLowerCase(),
        (customer.customerEmail as string | undefined)?.toLowerCase(),
        (customer.billingEmail as string | undefined)?.toLowerCase(),
        (sub.customer_email as string | undefined)?.toLowerCase(),
        (sub.billing_email as string | undefined)?.toLowerCase(),
      ].filter(Boolean) as string[];

      if (candidateEmails.includes(emailLower)) {
        const status = String(sub.status ?? '').toLowerCase();
        const entitled = sub.entitled === true || (sub.metadata as Record<string, unknown> | undefined)?.entitled === true;
        return {
          customerId: (customer.id as string | undefined) ?? null,
          status,
          entitled,
        };
      }
    }
    return null;
  };

  try {
    const [activeSubs, trialSubs] = await Promise.all([fetchStripeSubscriptions('active'), fetchStripeSubscriptions('trialing')]);
    const hit = matchByEmail([...activeSubs, ...trialSubs]);
    if (hit) {
      return {
        customerId: hit.customerId,
        status: hit.status,
        entitled: hit.entitled,
      };
    }
  } catch (error) {
    console.error('[Auth] Stripe API lookup failed:', error);
  }

  return { customerId: null, status: '', entitled: false };
}

export async function getStripeEligibilityByEmail(email?: string | null): Promise<{ eligible: boolean; customerId?: string | null; status?: string }> {
  if (!email) return { eligible: false };
  try {
    const customer = await findStripeCustomer({ email });
    if (customer) {
      const subscription = (customer.raw?.subscription as Record<string, unknown> | undefined) ?? {};
      const status = String(
        subscription.status ??
          subscription.subscriptionStatus ??
          customer.status ??
          ''
      ).toLowerCase();
      const entitled = subscription.entitled === true || customer.entitled === true;
      const eligible = entitled || status === 'active' || status === 'trialing';
      if (eligible) {
        return { eligible, customerId: customer.id, status };
      }
    }

    // Firestoreにない場合はStripe APIを直接参照
    const live = await findStripeCustomerViaApi(email);
    const eligibleLive = live.entitled || live.status === 'active' || live.status === 'trialing';
    return { eligible: eligibleLive, customerId: live.customerId, status: live.status };
  } catch (error) {
    console.error('[Auth] Error checking Stripe eligibility:', error);
    return { eligible: false };
  }
}

/**
 * 招待情報からユーザードキュメントを作成（共通ヘルパー）
 */
export async function ensureUserDocument(uid: string, email: string): Promise<any | null> {
  try {
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    // 既存のユーザードキュメントをチェック
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();

      // isActiveチェック（falseの場合はアクセス拒否）
      if (userData && userData.isActive === false) {
        console.warn('[Auth] User is inactive:', email);
        throw new Error('User account is inactive. Please contact your administrator.');
      }

      return userData;
    }

    console.log('[Auth] User document not found, checking for invitations:', email);

    // 組織招待をチェック
    const orgsSnapshot = await db.collection('orgs').get();

    for (const orgDoc of orgsSnapshot.docs) {
      const orgInvitationsSnapshot = await db
        .collection('orgs')
        .doc(orgDoc.id)
        .collection('invitations')
        .where('email', '==', email)
        .where('status', '==', 'pending')
        .get();

      if (!orgInvitationsSnapshot.empty) {
        const invDoc = orgInvitationsSnapshot.docs[0];
        const invData = invDoc.data();

        // 有効期限をチェック
        const expiresAt = invData.expiresAt?.toMillis?.() || 0;
        if (expiresAt < Date.now()) {
          console.log('[Auth] Invitation expired for:', email);
          continue;
        }

        // ユーザードキュメントを作成
        const user = {
          id: uid,
          email: email,
          displayName: invData.displayName || email.split('@')[0],
          orgId: invData.orgId,
          orgName: invData.orgId,
          role: invData.role || 'viewer',
          memberType: invData.memberType || 'guest',
          職種: null,
          部署: null,
          電話番号: null,
          photoURL: null,
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastLogin: FieldValue.serverTimestamp(),
        };

        await db.collection('users').doc(uid).set(user);

        // 招待のステータスを更新
        await invDoc.ref.update({
          status: 'accepted',
          acceptedAt: FieldValue.serverTimestamp(),
          acceptedBy: uid,
        });

        console.log('[Auth] User created from org invitation:', email);
        return { ...user, id: uid };
      }
    }

    // プロジェクトメンバー招待をチェック
    const projectMembersSnapshot = await db
      .collection('project_members')
      .where('email', '==', email)
      .where('status', '==', 'invited')
      .limit(1)
      .get();

    if (!projectMembersSnapshot.empty) {
      const memberDoc = projectMembersSnapshot.docs[0];
      const memberData = memberDoc.data();

      // ユーザードキュメントを作成
      const user = {
        id: uid,
        email: email,
        displayName: memberData.displayName || email.split('@')[0],
        orgId: memberData.orgId || 'archi-prisma',
        orgName: memberData.orgName || memberData.orgId || 'archi-prisma',
        role: memberData.role || 'viewer',
        memberType: 'guest',
        職種: memberData.職種 || null,
        部署: null,
        電話番号: null,
        photoURL: null,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastLogin: FieldValue.serverTimestamp(),
      };

      await db.collection('users').doc(uid).set(user);

      // プロジェクトメンバーのステータスを更新
      await memberDoc.ref.update({
        userId: uid,
        status: 'active',
        joinedAt: FieldValue.serverTimestamp(),
      });

      console.log('[Auth] User created from project member invitation:', email);
      return { ...user, id: uid };
    }

    // Stripeサブスク利用者なら、組織作成を促すために特別なエラーを投げる
    const stripeEligibility = await getStripeEligibilityByEmail(email);
    if (stripeEligibility.eligible) {
      throw new OrgSetupRequired(stripeEligibility.customerId);
    }

    return null;
  } catch (error) {
    if (error instanceof OrgSetupRequired) {
      throw error;
    }
    console.error('[Auth] Error ensuring user document:', error);
    return null;
  }
}

interface AuthMiddlewareOptions {
  skipBillingCheck?: boolean;
}

export function authMiddleware(options?: AuthMiddlewareOptions): (req: AuthedRequest, res: Response, next: NextFunction) => Promise<void> {
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

    // ユーザードキュメントを確保（存在しない場合は招待から作成）
    try {
      await ensureUserDocument(decoded.uid, decoded.email || '');
    } catch (error) {
      if (error instanceof OrgSetupRequired) {
        res.status(403).json({
          error: 'Org setup required',
          code: 'ORG_SETUP_REQUIRED',
          stripeCustomerId: error.stripeCustomerId ?? null,
        });
        return;
      }
      throw error;
    }

    const userRecord = await fetchUserDoc(decoded.uid);
    if (!userRecord) {
      console.error('[Auth] User record not found for:', decoded.uid);
      res.status(401).json({ error: 'User not found' });
      return;
    }

    if (!options?.skipBillingCheck) {
      const billingDoc = await getOrgBilling(userRecord.orgId);
      const billingAccess = evaluateBillingAccess(userRecord, billingDoc);
      if (!billingAccess.allowed) {
        res.status(402).json({
          error: 'Billing required',
          reason: billingAccess.reason,
          planType: billingAccess.planType,
        });
        return;
      }
    }

    console.log('[Auth] Authentication successful for:', decoded.email);
    req.user = decoded;
    req.uid = decoded.uid;
    next();
  };
}
