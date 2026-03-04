interface OrganizationSetupWelcomeMailParams {
  appUrl: string;
  customerId: string;
  supportEmail?: string;
}

function buildPlainBody(lines: Array<string | null | undefined>): string {
  return lines
    .map((line) => (typeof line === 'string' ? line.trimEnd() : ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildOrganizationSetupWelcomeMail(params: OrganizationSetupWelcomeMailParams): {
  subject: string;
  body: string;
} {
  const supportEmail = params.supportEmail?.trim() || 'support@archi-prisma.co.jp';
  const subject = '[Compass] ご契約ありがとうございます | 初期設定のご案内';
  const body = buildPlainBody([
    'Compass をご契約いただきありがとうございます。',
    '',
    'ご利用開始の手順',
    '1. 下記URLにアクセス',
    '2. このメールを受信したアドレスでログイン',
    '3. 管理画面で組織を作成',
    '',
    `ログインURL: ${params.appUrl}`,
    `Stripe Customer ID: ${params.customerId}`,
    '',
    'すでに組織がある場合',
    '管理画面 > 課金 で上記 Stripe Customer ID を登録してください。',
    '',
    `お問い合わせ: ${supportEmail}`,
    '',
    '※本メールは自動送信です。',
  ]);

  return { subject, body };
}
