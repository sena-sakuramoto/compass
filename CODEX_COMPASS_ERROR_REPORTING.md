# CODEX_COMPASS_ERROR_REPORTING.md

## 目的

Compassにアプリ内フィードバックボタンを追加する。
ユーザーが不具合・要望をアプリ内から報告でき、Senaにメールで届く仕組み。

外部サービス（Sentry等）は使わない。既存のnodemailer + Gmail SMTPで完結。

## 変更対象ファイル

### バックエンド

1. `functions/src/api/feedback.ts` — **新規作成**: フィードバック受信APIエンドポイント
2. `functions/src/index.ts` — ルーティング追加

### フロントエンド

3. `web/src/components/FeedbackButton.tsx` — **新規作成**: フィードバックUI
4. `web/src/lib/api.ts` — `submitFeedback()` 関数追加
5. `web/src/App.tsx` — FeedbackButton を配置

## 実装手順

### Step 1: バックエンドAPI（feedback.ts）

`functions/src/api/feedback.ts` を新規作成:

```typescript
import { Router } from 'express';
import { requireAuth } from '../lib/auth';
import { sendMail } from '../lib/mail';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
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
    await sendMail({
      to: 'compass@archi-prisma.co.jp',
      subject,
      text: body,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[feedback] Failed to send email:', err);
    res.status(500).json({ error: 'フィードバックの送信に失敗しました' });
  }
});

export default router;
```

**注意:**
- `sendMail` 関数が `functions/src/lib/mail.ts` に既に存在するか確認すること
- 存在しない場合は、既存のnodemailer設定を参照して作成する
- 既存の通知メール送信コード（`functions/src/scheduled/` 等）を参考にする
- 送信先は `compass@archi-prisma.co.jp` 固定

### Step 2: ルーティング追加（index.ts）

`functions/src/index.ts` に追加:

```typescript
import feedbackRouter from './api/feedback';
app.use('/api/feedback', feedbackRouter);
```

既存のルーティングパターンに従って配置する。認証が必要なルート群のブロックに追加。

### Step 3: フロントエンドAPI関数追加（api.ts）

`web/src/lib/api.ts` に追加:

```typescript
export async function submitFeedback(payload: {
  type: 'bug' | 'feature' | 'other';
  message: string;
  url: string;
  userAgent: string;
}) {
  return request<{ ok: true }>('/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
```

### Step 4: フィードバックボタン（FeedbackButton.tsx）

`web/src/components/FeedbackButton.tsx` を新規作成:

```tsx
import { useState } from 'react';
import { submitFeedback } from '../lib/api';

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'bug' | 'feature' | 'other'>('bug');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSending(true);

    try {
      await submitFeedback({
        type,
        message,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });

      setSent(true);
      setMessage('');
      setTimeout(() => {
        setIsOpen(false);
        setSent(false);
      }, 2000);
    } catch (err) {
      console.error('Feedback send failed:', err);
      alert('送信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white rounded-full px-4 py-2 text-sm shadow-lg hover:bg-slate-800 transition-colors"
        aria-label="フィードバックを送る"
      >
        ご意見・不具合報告
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 w-80 p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold text-slate-900">フィードバック</h3>
        <button
          onClick={() => { setIsOpen(false); setSent(false); }}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none"
        >
          ×
        </button>
      </div>

      {sent ? (
        <p className="text-sm text-green-600 py-4 text-center">送信しました。ありがとうございます！</p>
      ) : (
        <>
          <div className="flex gap-2 mb-3">
            {([
              { value: 'bug' as const, label: '不具合' },
              { value: 'feature' as const, label: '要望' },
              { value: 'other' as const, label: 'その他' },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                  type === opt.value
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              type === 'bug'
                ? 'どんな操作をしたとき、何が起きましたか？'
                : type === 'feature'
                ? 'どんな機能があると嬉しいですか？'
                : '自由にお書きください'
            }
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none h-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          <button
            onClick={handleSubmit}
            disabled={!message.trim() || sending}
            className="mt-2 w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? '送信中...' : '送信'}
          </button>
        </>
      )}
    </div>
  );
}
```

### Step 5: FeedbackButton を App に配置

`web/src/App.tsx` に追加:

```tsx
import { FeedbackButton } from './components/FeedbackButton';

// App コンポーネントのreturn内、最後（閉じタグの直前等）に:
<FeedbackButton />
```

**配置条件**: ログイン済みユーザーにのみ表示する。ログイン状態の判定は既存のAuth contextを使う。

## UI設計原則の遵守

- **原則1（選択肢 > 自由入力）**: フィードバック種別は3つのボタンから選択
- **原則6（ツールは脇役）**: 画面右下に控えめに配置
- **原則7（派手より楽）**: モーダルではなくポップアップ。操作ステップ最小
- **原則11（4行以上は読まれない）**: 説明文なし。プレースホルダーで誘導

## 完了条件

1. `pnpm --filter functions build` が成功する
2. `pnpm --filter web build` が成功する
3. フィードバックボタンが画面右下に表示される（ログイン済みユーザーのみ）
4. 種別（不具合/要望/その他）をボタンで選択できる
5. 送信するとSenaのメール（compass@archi-prisma.co.jp）にフィードバックが届く
6. メールにはユーザー名、組織、画面URL、ブラウザ情報が含まれる
7. 送信後「送信しました」が表示され、2秒後に閉じる
8. 新しいパッケージのインストールは不要

## やらないこと

- Sentry等の外部サービス導入
- スクリーンショット機能
- Firestoreへのフィードバック保存（メール送信のみ）
- テストファイルの作成
