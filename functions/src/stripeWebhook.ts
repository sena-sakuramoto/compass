/**
 * Stripe Webhook Handler
 * サブスクリプション変更を自動でFirestoreに同期
 */

import { onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';
import { db } from './lib/firestore';

const REGION = process.env.COMPASS_FUNCTION_REGION ?? 'asia-northeast1';
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' }) : null;

// サークル会員判定用パターン
const CIRCLE_PRODUCT_PATTERNS = ['サークル', 'circle', 'Circle', 'AI×建築'];

function isCircleMemberByProductNames(productNames: string[]): boolean {
  return productNames.some(name =>
    CIRCLE_PRODUCT_PATTERNS.some(pattern => name.includes(pattern))
  );
}

export const stripeWebhook = onRequest({
  region: REGION,
  maxInstances: 10,
  secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!stripe) {
    console.error('[stripeWebhook] Stripe not configured');
    res.status(500).json({ error: 'Stripe not configured' });
    return;
  }

  // Webhook署名の検証
  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;

  if (stripeWebhookSecret && sig) {
    // 署名検証あり
    try {
      const rawBody = req.rawBody || req.body;
      event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret);
    } catch (err: any) {
      console.error('[stripeWebhook] Signature verification failed:', err.message);
      res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
      return;
    }
  } else {
    // 署名検証なし（開発用 - 本番では必ず設定すること）
    console.warn('[stripeWebhook] WARNING: Webhook secret not configured, skipping signature verification');
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      event = body as Stripe.Event;
    } catch (err: any) {
      console.error('[stripeWebhook] Failed to parse body:', err.message);
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }
  }

  console.log('[stripeWebhook] Received event:', event.type, event.id);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(subscription);
        break;
      }
      default:
        console.log('[stripeWebhook] Unhandled event type:', event.type);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('[stripeWebhook] Error processing event:', err);
    res.status(500).json({ error: err.message });
  }
});

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  console.log('[stripeWebhook] Processing subscription change for customer:', customerId);

  // サブスクリプションアイテムからquantityと商品情報を取得
  let quantity: number | null = null;
  const productNames: string[] = [];
  const priceIds: string[] = [];

  for (const item of subscription.items.data) {
    if (item.quantity && quantity === null) {
      quantity = item.quantity;
    }
    if (item.price?.id) {
      priceIds.push(item.price.id);
    }
    // 商品名を取得
    if (item.price?.product) {
      const productId = typeof item.price.product === 'string'
        ? item.price.product
        : item.price.product.id;
      try {
        const product = await stripe!.products.retrieve(productId);
        productNames.push(product.name);
      } catch (err) {
        console.error('[stripeWebhook] Failed to retrieve product:', err);
      }
    }
  }

  const status = subscription.status;
  // Stripe SDK の型定義に合わせてアクセス
  const sub = subscription as any;
  const currentPeriodEnd = sub.current_period_end ?? null;
  const cancelAtPeriodEnd = sub.cancel_at_period_end ?? false;
  const entitled = status === 'active' || status === 'trialing';

  // stripe_customers コレクションを更新
  // これにより stripeTriggers が発火して org_billing も更新される
  await db.collection('stripe_customers').doc(customerId).set({
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    entitled,
    productNames,
    priceIds,
    quantity,
    subscriptionId: subscription.id,
    updatedAt: Date.now(),
  }, { merge: true });

  console.log('[stripeWebhook] Updated stripe_customers for:', customerId, {
    status,
    quantity,
    productNames,
  });
}
