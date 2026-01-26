/**
 * Compass 申し込み用 Checkout エンドポイント
 * 認証不要 - LPから直接呼び出し可能
 */
import { Router } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import cors from 'cors';

const router = Router();

// このルーター専用のCORS設定
router.use(cors({
  origin: true, // 全オリジン許可（公開API）
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' }) : null;

// 価格設定
const COMPASS_PRICE_ID = process.env.COMPASS_PRICE_ID || 'price_1SDiNTRpUEcUjSDNZa2AYMWq';
const COMPASS_PRICE_ID_STUDENT = process.env.COMPASS_PRICE_ID_STUDENT || 'price_1SrgWhRpUEcUjSDNfR0wVCvJ';

// 学生ドメインパターン
const STUDENT_DOMAINS = ['.ac.jp', '.edu', '.ed.jp'];

function isStudentEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return STUDENT_DOMAINS.some(domain => lower.endsWith(domain));
}

const checkoutSchema = z.object({
  email: z.string().email(),
  quantity: z.number().int().min(1).max(100).optional().default(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/**
 * POST /api/public/checkout
 * メールアドレスを受け取り、学生判定してCheckout Sessionを作成
 */
router.post('/checkout', async (req, res) => {
  if (!stripe) {
    console.error('[checkout] Stripe not configured');
    return res.status(500).json({ error: 'Stripe is not configured' });
  }

  try {
    const payload = checkoutSchema.parse(req.body);
    const { email, quantity } = payload;

    const isStudent = isStudentEmail(email);
    const priceId = isStudent ? COMPASS_PRICE_ID_STUDENT : COMPASS_PRICE_ID;

    // 成功・キャンセルURL
    const baseUrl = process.env.APP_URL || 'https://compass-31e9e.web.app';
    const successUrl = payload.successUrl || `${baseUrl}/setup?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = payload.cancelUrl || process.env.LP_URL || 'https://compass-lp.web.app';

    // Checkout Session作成
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: quantity,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      metadata: {
        source: 'compass_lp',
        isStudent: isStudent ? 'true' : 'false',
      },
    };

    // 通常プランは14日間トライアル
    if (!isStudent) {
      sessionParams.subscription_data = {
        trial_period_days: 14,
        metadata: {
          source: 'compass_lp',
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[checkout] Session created:', {
      sessionId: session.id,
      email,
      isStudent,
      priceId,
      quantity,
    });

    res.json({
      url: session.url,
      sessionId: session.id,
      isStudent,
      plan: isStudent ? 'student' : 'standard',
      trialDays: isStudent ? 0 : 14,
    });
  } catch (error: any) {
    console.error('[checkout] Error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }

    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
});

/**
 * GET /api/public/checkout/plans
 * 料金プラン情報を返す（LP表示用）
 */
router.get('/checkout/plans', async (_req, res) => {
  res.json({
    standard: {
      name: 'Compass Pro',
      pricePerSeat: 1000,
      currency: 'JPY',
      interval: 'month',
      trialDays: 14,
      features: [
        '全機能が使える',
        '席数に上限なし',
        '14日間の無料トライアル',
      ],
    },
    student: {
      name: 'Compass 学生プラン',
      pricePerSeat: 0,
      currency: 'JPY',
      interval: 'month',
      trialDays: 0,
      features: [
        '全機能が使える',
        '学生は永久無料',
        '.ac.jp / .edu / .ed.jp ドメインが対象',
      ],
      eligibleDomains: STUDENT_DOMAINS,
    },
  });
});

export default router;
