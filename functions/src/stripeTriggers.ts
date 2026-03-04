import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from './lib/firestore';
import { serializeStripeCustomer } from './lib/billing';
import { sendEmail } from './lib/gmail';
import { PLAN_LIMITS } from './lib/auth-types';
import { buildOrganizationSetupWelcomeMail } from './lib/mail-templates';

const REGION = process.env.COMPASS_FUNCTION_REGION ?? 'asia-northeast1';
const APP_URL = process.env.ORG_SETUP_URL || process.env.APP_URL || 'https://compass-31e9e.web.app';
const DEFAULT_SENDER = process.env.NOTIFICATION_SENDER || 'no-reply@archi-prisma.co.jp';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@archi-prisma.co.jp';

function isEligibleForWelcome(data?: Record<string, any> | null): boolean {
  if (!data) return false;
  const subscription = (data.subscription as Record<string, unknown> | undefined) ?? {};
  const status = String(data.status ?? data.subscriptionStatus ?? subscription.status ?? '').toLowerCase();
  const entitled = data.entitled === true || subscription.entitled === true;
  return entitled || status === 'active' || status === 'trialing';
}

function hasWelcomeBeenSent(data?: Record<string, any> | null): boolean {
  if (!data) return false;
  return Boolean((data as Record<string, any>).welcomeEmailSentAt);
}

export const syncStripeCustomers = onDocumentWritten(
  {
    region: REGION,
    document: 'stripe_customers/{customerId}',
    secrets: ['COMPASS_PRICE_ID_SMALL', 'COMPASS_PRICE_ID_STANDARD', 'COMPASS_PRICE_ID_BUSINESS'],
  },
  async (event) => {
    const afterDoc = event.data?.after;
    const beforeData = event.data?.before?.data() as Record<string, any> | undefined;
    const after = afterDoc?.data() as Record<string, any> | undefined;
    if (!after) return;

    const shouldSendWelcomeEmail =
      isEligibleForWelcome(after) &&
      !hasWelcomeBeenSent(after) &&
      (!isEligibleForWelcome(beforeData) || !hasWelcomeBeenSent(beforeData));

    const customerId = event.params.customerId;
    const query = await db.collection('org_billing').where('stripeCustomerId', '==', customerId).get();

    if (query.empty) {
      console.log('[billing] No org billing doc for customer', customerId);
    } else {
      const subscription = (after.subscription as Record<string, unknown> | undefined) ?? {};

      // quantityを取得（席数として使用）
      // Stripeのサブスクリプションアイテムからquantityを取得
      const items = (subscription.items as Record<string, unknown> | undefined);
      const itemsData = (items?.data as Array<Record<string, unknown>> | undefined) ?? [];
      const quantity = itemsData.length > 0
        ? (itemsData[0].quantity as number | undefined) ?? null
        : (after.quantity ?? subscription.quantity ?? null) as number | null;

      // サークル会員かどうかを判定（商品名で判定）
      const productNames = (after.productNames || []) as string[];
      const CIRCLE_PRODUCT_PATTERNS = ['サークル', 'circle', 'Circle', 'AI×建築'];
      const isCircleMember = productNames.some(name =>
        CIRCLE_PRODUCT_PATTERNS.some(pattern => name.includes(pattern))
      );

      const updates: Record<string, any> = {
        subscriptionStatus: (after.status ?? after.subscriptionStatus ?? subscription.status ?? null) as string | null,
        subscriptionCurrentPeriodEnd:
          (after.currentPeriodEnd ?? after.subscriptionCurrentPeriodEnd ?? subscription.currentPeriodEnd ?? null) as number | null,
        subscriptionCancelAtPeriodEnd: Boolean(
          after.cancelAtPeriodEnd ??
            after.subscriptionCancelAtPeriodEnd ??
            subscription.cancelAtPeriodEnd ??
            subscription.cancel_at_period_end ??
            false
        ),
        entitled: (after.entitled ?? subscription.entitled ?? null) as boolean | null,
        lastStripeSyncAt: Date.now(),
        stripeSnapshot: {
          productNames: productNames,
          priceIds: after.priceIds || [],
        },
        // 席数関連
        isCircleMember: isCircleMember,
      };

      // サークル会員の場合
      if (isCircleMember) {
        updates.circleBaseSeats = 3; // サークル特典の基本席数
        updates.additionalSeats = quantity !== null ? Math.max(0, quantity - 1) : 0; // quantity=1が基本、それ以上が追加席
        updates.seatLimit = 3 + updates.additionalSeats;
      } else {
        // ティア制: priceIdからティアを特定してメンバー上限を設定
        const priceIds = (after.priceIds || []) as string[];
        const tierPriceMap: Record<string, string> = {
          [process.env.COMPASS_PRICE_ID_SMALL || '']: 'small',
          [process.env.COMPASS_PRICE_ID_STANDARD || '']: 'standard',
          [process.env.COMPASS_PRICE_ID_BUSINESS || '']: 'business',
        };
        delete tierPriceMap['']; // 未設定の空文字キーを除去

        let detectedTier: string | null = null;
        for (const pid of priceIds) {
          if (tierPriceMap[pid]) {
            detectedTier = tierPriceMap[pid];
            break;
          }
        }

        // メタデータからもティアを検出（フォールバック）
        if (!detectedTier) {
          const metadata = (subscription.metadata as Record<string, unknown> | undefined) ?? {};
          const metadataTier = metadata.tier;
          detectedTier = typeof metadataTier === 'string' ? metadataTier : null;
        }

        if (detectedTier && detectedTier in PLAN_LIMITS) {
          const tierLimits = PLAN_LIMITS[detectedTier as keyof typeof PLAN_LIMITS];
          updates.tier = detectedTier;
          updates.seatLimit = tierLimits.members;
          updates.additionalSeats = 0; // ティア制では追加席の概念なし
        } else if (quantity !== null) {
          // レガシーフォールバック: 旧席単価サブスク
          updates.additionalSeats = quantity;
          updates.seatLimit = quantity;
        }
      }

      console.log('[billing] Syncing org billing', { customerId, updates });
      await Promise.all(query.docs.map((doc) => doc.ref.set(updates, { merge: true })));
    }

    if (shouldSendWelcomeEmail && afterDoc) {
      try {
        const customer = serializeStripeCustomer(afterDoc);
        const candidateEmails = customer.emails.length
          ? customer.emails
          : customer.email
            ? [customer.email]
            : [];
        const recipients = Array.from(new Set(candidateEmails)).slice(0, 3);

        if (recipients.length === 0) {
          console.warn('[billing] Welcome email skipped because no email is available', { customerId });
          return;
        }

        const { subject, body } = buildOrganizationSetupWelcomeMail({
          appUrl: APP_URL,
          customerId: customer.id,
          supportEmail: SUPPORT_EMAIL,
        });

        await Promise.all(
          recipients.map((to) =>
            sendEmail({
              from: DEFAULT_SENDER,
              to,
              subject,
              body,
            })
          )
        );

        await afterDoc.ref.set(
          {
            welcomeEmailSentAt: Date.now(),
          },
          { merge: true }
        );
        console.log('[billing] Sent organization setup email', { customerId, recipients });
      } catch (error) {
        console.error('[billing] Failed to send organization setup email', { customerId, error });
      }
    }
  }
);
