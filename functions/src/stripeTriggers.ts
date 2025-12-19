import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from './lib/firestore';
import { serializeStripeCustomer } from './lib/billing';
import { sendEmail } from './lib/gmail';

const REGION = process.env.COMPASS_FUNCTION_REGION ?? 'asia-northeast1';
const APP_URL = process.env.ORG_SETUP_URL || process.env.APP_URL || 'https://compass-31e9e.web.app';
const DEFAULT_SENDER = process.env.NOTIFICATION_SENDER || 'no-reply@archi-prisma.co.jp';

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
      const updates = {
        subscriptionStatus: after.status || null,
        subscriptionCurrentPeriodEnd: after.currentPeriodEnd ?? null,
        subscriptionCancelAtPeriodEnd: Boolean(after.cancelAtPeriodEnd),
        entitled: after.entitled ?? null,
        lastStripeSyncAt: Date.now(),
        stripeSnapshot: {
          productNames: after.productNames || [],
          priceIds: after.priceIds || [],
        },
      };
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

        const subject = '[Compass] ご契約ありがとうございます - 組織作成のご案内';
        const body = `
Stripeでのご契約ありがとうございます。

コンパスの組織を作成し、利用を開始するには以下のURLからサインインしてください。
${APP_URL}

このメールが届いているアドレスでログインすると、管理者画面から組織を作成できます。
Stripe Customer ID: ${customer.id}

すでに組織がある場合は、管理者ツール > 課金で上記Customer IDを登録してください。
ご不明点は support@archi-prisma.co.jp までご連絡ください。

※このメールは自動送信されています。`;

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
