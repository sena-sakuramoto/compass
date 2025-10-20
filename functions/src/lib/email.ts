import sgMail from '@sendgrid/mail';

// SendGrid APIキーを環境変数から取得
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@compass.example.com';
const APP_URL = process.env.APP_URL || 'https://compass-31e9e.web.app';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * プロジェクト招待メールを送信
 */
export async function sendProjectInvitationEmail(
  to: string,
  projectName: string,
  invitedByName: string,
  role: string,
  message?: string
): Promise<void> {
  if (!SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY not set, skipping email notification');
    return;
  }

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: `【Compass】${projectName} へ招待されました`,
    text: `
${invitedByName} さんから、プロジェクト「${projectName}」へ招待されました。

ロール: ${role}

${message ? `メッセージ:\n${message}\n\n` : ''}

以下のリンクからログインして、プロジェクトにアクセスしてください：
${APP_URL}

---
このメールは Compass から自動送信されています。
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .content {
      background: #f9fafb;
      padding: 30px;
      border-radius: 0 0 8px 8px;
    }
    .project-info {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      border-left: 4px solid #667eea;
    }
    .message {
      background: #e0e7ff;
      padding: 15px;
      border-radius: 8px;
      margin: 15px 0;
      font-style: italic;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 600;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0;">🎯 Compass</h1>
    <p style="margin: 10px 0 0 0;">プロジェクト管理システム</p>
  </div>

  <div class="content">
    <h2>プロジェクトへ招待されました</h2>

    <p><strong>${invitedByName}</strong> さんから、プロジェクトへ招待されました。</p>

    <div class="project-info">
      <h3 style="margin-top: 0;">📋 ${projectName}</h3>
      <p style="margin: 5px 0;"><strong>ロール:</strong> ${role}</p>
    </div>

    ${message ? `
    <div class="message">
      <strong>メッセージ:</strong><br>
      ${message}
    </div>
    ` : ''}

    <div style="text-align: center;">
      <a href="${APP_URL}" class="button">プロジェクトにアクセス</a>
    </div>

    <p style="color: #6b7280; font-size: 14px;">
      ログイン後、プロジェクト一覧またはベルアイコンから招待を確認できます。
    </p>
  </div>

  <div class="footer">
    このメールは Compass から自動送信されています。<br>
    心当たりがない場合は、このメールを無視してください。
  </div>
</body>
</html>
    `.trim(),
  };

  try {
    await sgMail.send(msg);
    console.log(`Invitation email sent to ${to}`);
  } catch (error) {
    console.error('Error sending invitation email:', error);
    // エラーでも処理は続行（メール送信失敗してもプロジェクト招待自体は成功）
  }
}

/**
 * 招待承認通知メールを送信（招待した人に通知）
 */
export async function sendInvitationAcceptedEmail(
  to: string,
  projectName: string,
  acceptedByName: string
): Promise<void> {
  if (!SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY not set, skipping email notification');
    return;
  }

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: `【Compass】${acceptedByName} さんが招待を承認しました`,
    text: `
${acceptedByName} さんが、プロジェクト「${projectName}」への招待を承認しました。

プロジェクトへアクセス：
${APP_URL}

---
このメールは Compass から自動送信されています。
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 30px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .content {
      background: #f9fafb;
      padding: 30px;
      border-radius: 0 0 8px 8px;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background: #10b981;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 600;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0;">✅ 招待が承認されました</h1>
  </div>

  <div class="content">
    <p><strong>${acceptedByName}</strong> さんが、プロジェクト「<strong>${projectName}</strong>」への招待を承認しました。</p>

    <div style="text-align: center;">
      <a href="${APP_URL}" class="button">プロジェクトを確認</a>
    </div>
  </div>

  <div class="footer">
    このメールは Compass から自動送信されています。
  </div>
</body>
</html>
    `.trim(),
  };

  try {
    await sgMail.send(msg);
    console.log(`Invitation accepted notification sent to ${to}`);
  } catch (error) {
    console.error('Error sending invitation accepted email:', error);
  }
}
