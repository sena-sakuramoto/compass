/**
 * アプリ内フィードバック メール送信エンドポイント
 * 認証必須 - ログインユーザーのみ利用可能
 */
import { Router } from 'express';
import nodemailer from 'nodemailer';
import { authMiddleware } from '../lib/auth';

const router = Router();

router.post('/', authMiddleware(), async (req, res) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    console.error('[feedback] Gmail credentials not configured');
    return res.status(500).json({ error: 'メール送信設定が未構成です' });
  }

  const { type, message, url, userAgent } = req.body;
  const user = (req as any).user;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'メッセージは必須です' });
  }

  const typeLabels: Record<string, string> = {
    bug: '不具合',
    feature: '要望',
    other: 'その他',
  };
  const typeLabel = typeLabels[type] || 'その他';

  const subject = `[Compass フィードバック] ${typeLabel}: ${message.slice(0, 50)}`;
  const body = [
    `種別: ${typeLabel}`,
    `ユーザー: ${user.displayName || user.email} (${user.email})`,
    `組織: ${user.orgId}`,
    `画面URL: ${url || '不明'}`,
    `ブラウザ: ${userAgent || '不明'}`,
    '',
    '--- メッセージ ---',
    message,
  ].join('\n');

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    await transporter.sendMail({
      from: `"Compass フィードバック" <${gmailUser}>`,
      to: 'compass@archi-prisma.co.jp',
      replyTo: user.email,
      subject,
      text: body,
    });

    console.log('[feedback] Mail sent:', {
      type: typeLabel,
      user: user.email,
      orgId: user.orgId,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[feedback] Failed to send email:', err);
    res.status(500).json({ error: 'フィードバックの送信に失敗しました' });
  }
});

export default router;
