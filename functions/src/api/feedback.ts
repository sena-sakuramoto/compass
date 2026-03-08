/**
 * アプリ内フィードバック メール送信エンドポイント
 * 認証必須 - ログインユーザーのみ利用可能
 */
import { Router } from 'express';
import nodemailer from 'nodemailer';
import { authMiddleware } from '../lib/auth';
import { getUser, getOrganization } from '../lib/users';

const router = Router();

router.post('/', authMiddleware(), async (req, res) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    console.error('[feedback] Gmail credentials not configured');
    return res.status(500).json({ error: 'メール送信設定が未構成です' });
  }

  const { type, message, url, userAgent, screenshotUrl } = req.body;
  const tokenUser = (req as any).user;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'メッセージは必須です' });
  }

  // Firestoreからフルユーザー情報と組織名を取得
  const userDoc = await getUser((req as any).uid);
  const orgName = userDoc?.orgId
    ? (await getOrganization(userDoc.orgId))?.name || userDoc.orgId
    : '不明';

  const displayName = userDoc?.displayName || tokenUser.name || tokenUser.email;
  const email = userDoc?.email || tokenUser.email;

  const typeLabels: Record<string, string> = {
    bug: '不具合',
    feature: '要望',
    other: 'その他',
  };
  const typeLabel = typeLabels[type] || 'その他';

  const subject = `[Compass フィードバック] ${typeLabel}: ${message.slice(0, 50)}`;
  const body = [
    `種別: ${typeLabel}`,
    `ユーザー: ${displayName} (${email})`,
    `組織: ${orgName}`,
    `画面URL: ${url || '不明'}`,
    `ブラウザ: ${userAgent || '不明'}`,
    screenshotUrl ? `スクリーンショット: ${screenshotUrl}` : null,
    '',
    '--- メッセージ ---',
    message,
  ]
    .filter(Boolean)
    .join('\n');

  const htmlBody = [
    `<p><strong>種別:</strong> ${typeLabel}</p>`,
    `<p><strong>ユーザー:</strong> ${displayName} (${email})</p>`,
    `<p><strong>組織:</strong> ${orgName}</p>`,
    `<p><strong>画面URL:</strong> ${url || '不明'}</p>`,
    `<p><strong>ブラウザ:</strong> ${userAgent || '不明'}</p>`,
    '<hr/>',
    `<p>${String(message).replace(/\n/g, '<br/>')}</p>`,
    screenshotUrl
      ? `<p><strong>スクリーンショット:</strong><br/><img src="${screenshotUrl}" style="max-width:600px;border:1px solid #ddd;border-radius:8px;" /></p>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

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
      replyTo: email,
      subject,
      text: body,
      html: htmlBody,
    });

    console.log('[feedback] Mail sent:', {
      type: typeLabel,
      user: email,
      org: orgName,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[feedback] Failed to send email:', err);
    res.status(500).json({ error: 'フィードバックの送信に失敗しました' });
  }
});

export default router;
