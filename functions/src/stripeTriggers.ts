import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from './lib/firestore';

const REGION = process.env.COMPASS_FUNCTION_REGION ?? 'asia-northeast1';

export const syncStripeCustomers = onDocumentWritten(
  {
    region: REGION,
    document: 'stripe_customers/{customerId}',
  },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) {
      return;
    }

    const customerId = event.params.customerId;
    const query = await db.collection('org_billing').where('stripeCustomerId', '==', customerId).get();

    if (query.empty) {
      console.log('[billing] No org billing doc for customer', customerId);
      return;
    }

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
);
