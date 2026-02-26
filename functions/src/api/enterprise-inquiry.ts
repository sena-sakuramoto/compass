/**
 * Enterprise相談フォーム メール送信エンドポイント
 * 認証不要 - LPから直接呼び出し可能
 */
import { Router } from 'express';
import { z } from 'zod';
import cors from 'cors';
import nodemailer from 'nodemailer';

const router = Router();

router.use(cors({
  origin: true,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

const inquirySchema = z.object({
  companyName: z.string().min(1, '会社名は必須です'),
  contactName: z.string().min(1, '担当者名は必須です'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  teamSize: z.string().min(1, '想定利用人数は必須です'),
  phone: z.string().optional().default(''),
  message: z.string().min(1, '相談内容は必須です'),
});

/**
 * POST /api/public/enterprise-inquiry
 * Enterprise相談フォームの内容をメールで送信
 */
router.post('/enterprise-inquiry', async (req, res) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    console.error('[enterprise-inquiry] Gmail credentials not configured');
    return res.status(500).json({ error: 'メール送信設定が未構成です' });
  }

  try {
    const data = inquirySchema.parse(req.body);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    const subject = `[Compass Enterprise相談] ${data.companyName} / ${data.teamSize}名`;
    const body = [
      'Compass Enterprise 相談フォームより',
      '',
      `会社名: ${data.companyName}`,
      `担当者名: ${data.contactName}`,
      `メールアドレス: ${data.email}`,
      `想定利用人数: ${data.teamSize}`,
      `電話番号: ${data.phone || '未入力'}`,
      '',
      '相談内容:',
      data.message,
    ].join('\n');

    // Sena宛の通知メール
    await transporter.sendMail({
      from: `"Compass Enterprise相談" <${gmailUser}>`,
      to: 'compass@archi-prisma.co.jp',
      replyTo: data.email,
      subject,
      text: body,
    });

    // 送信者への確認メール（自動返信）
    const confirmBody = [
      `${data.contactName} 様`,
      '',
      'この度はCompass Enterpriseプランへのお問い合わせをいただき、誠にありがとうございます。',
      '以下の内容でお問い合わせを受け付けました。',
      '',
      '─────────────────────────',
      `会社名: ${data.companyName}`,
      `担当者名: ${data.contactName}`,
      `想定利用人数: ${data.teamSize}名`,
      `電話番号: ${data.phone || '未入力'}`,
      '',
      '相談内容:',
      data.message,
      '─────────────────────────',
      '',
      '担当者より2営業日以内にご連絡いたします。',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━',
      'Compass - 建築工程管理SaaS',
      'Archi-Prisma Design works株式会社',
      'Email: compass@archi-prisma.co.jp',
      '━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n');

    await transporter.sendMail({
      from: `"Compass" <${gmailUser}>`,
      to: data.email,
      subject: `【Compass】お問い合わせを受け付けました`,
      text: confirmBody,
    });

    console.log('[enterprise-inquiry] Mail sent:', {
      companyName: data.companyName,
      email: data.email,
      teamSize: data.teamSize,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('[enterprise-inquiry] Error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }

    res.status(500).json({ error: 'メール送信に失敗しました' });
  }
});

export default router;
