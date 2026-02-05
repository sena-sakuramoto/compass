import React, { useState } from 'react';
import type { BillingAccessInfo, BillingSelfLookupResult } from '../lib/api';
import { lookupBillingSelf, createBillingPortalSession } from '../lib/api';
import { AlertTriangle, RefreshCcw, Mail, Copy } from 'lucide-react';

interface BillingGateOverlayProps {
  billing: BillingAccessInfo | null;
  loading?: boolean;
  onRetry?: () => void;
}

function renderMessage(info: BillingAccessInfo | null) {
  if (!info) return { title: '契約状態を確認中です…', description: '数秒お待ちください。' };

  switch (info.reason) {
    case 'stripe_not_linked':
      return {
        title: 'Stripeサブスクが未連携です',
        description: '支払い情報と組織の紐付けが完了していません。「Stripe カスタマーID」を管理者から確認して入力してください。',
      };
    case 'stripe_inactive':
      return {
        title: 'サブスクリプションが停止しています',
        description: `現在のステータス: ${info.subscriptionStatus ?? 'unknown'}。支払い方法を更新し、再開後に「もう一度チェック」を押してください。`,
      };
    case 'plan_inactive':
      return {
        title: 'この組織のご契約は無効です',
        description: '管理者までお問い合わせください。再契約の手続き完了後に自動で解除されます。',
      };
    default:
      return {
        title: 'ご契約の確認が必要です',
        description: '契約プランの検証が完了するまでお待ちいただくか、サポートにご連絡ください。',
      };
  }
}

export function BillingGateOverlay({ billing, loading, onRetry }: BillingGateOverlayProps) {
  if (!billing) return null;
  if (billing.allowed) return null;

  const message = renderMessage(billing);

  const [selfLookupInput, setSelfLookupInput] = useState({ customerId: '', discordId: '', email: '' });
  const [selfLookupLoading, setSelfLookupLoading] = useState(false);
  const [selfLookupError, setSelfLookupError] = useState<string | null>(null);
  const [selfLookupResult, setSelfLookupResult] = useState<BillingSelfLookupResult | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const canOpenStripePortal = Boolean(billing?.stripeCustomerId) && billing?.planType === 'stripe';

  const handleSelfLookup = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const payload = {
      customerId: selfLookupInput.customerId.trim() || undefined,
      discordId: selfLookupInput.discordId.trim() || undefined,
      email: selfLookupInput.email.trim() || undefined,
    };
    if (!payload.customerId) {
      setSelfLookupError('Stripe Customer ID を入力してください。');
      setSelfLookupResult(null);
      return;
    }
    setSelfLookupLoading(true);
    setSelfLookupError(null);
    try {
      const result = await lookupBillingSelf(payload);
      setSelfLookupResult(result);
    } catch (error) {
      console.error('[BillingGate] self lookup failed', error);
      if (error instanceof Error) {
        setSelfLookupError(error.message);
      } else {
        setSelfLookupError('照合に失敗しました。時間をおいて再度お試しください。');
      }
      setSelfLookupResult(null);
    } finally {
      setSelfLookupLoading(false);
    }
  };

  const copyText = (value: string) => {
    navigator.clipboard.writeText(value).catch(() => undefined);
  };

  const handleOpenStripePortal = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { url } = await createBillingPortalSession(window.location.href);
      if (url) {
        window.location.assign(url);
      } else {
        setPortalError('ポータルURLを取得できませんでした。サポートへご連絡ください。');
      }
    } catch (error) {
      console.error('[BillingGate] Failed to create portal session', error);
      if (error instanceof Error) {
        setPortalError(error.message);
      } else {
        setPortalError('Stripeポータルを開けませんでした。時間をおいて再度お試しください。');
      }
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[1500] flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-4xl rounded-2xl border border-slate-100 bg-white/95 shadow-lg ring-1 ring-black/5 backdrop-blur flex flex-col divide-y divide-slate-100">
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-50 p-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500/80">ご契約の確認</p>
              <h2 className="text-base font-semibold text-slate-900">{message.title}</h2>
              <p className="text-xs text-slate-500 leading-relaxed">{message.description}</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 text-xs text-slate-600">
            {billing?.planType ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 space-y-1">
                <div className="flex justify-between text-[11px] uppercase tracking-wide text-amber-600">
                  <span>プラン</span>
                  <span className="font-semibold text-amber-700">{billing.planType}</span>
                </div>
                {billing.subscriptionStatus && (
                  <div className="flex justify-between text-[11px]">
                    <span>Stripe</span>
                    <span className="font-semibold text-amber-700">{billing.subscriptionStatus}</span>
                  </div>
                )}
                {billing.stripeCustomerId && (
                  <div className="flex justify-between text-[11px] text-amber-700">
                    <span>ID</span>
                    <span className="font-mono">{billing.stripeCustomerId}</span>
                  </div>
                )}
                {billing.notes ? (
                  <p className="text-[11px] leading-relaxed text-amber-700 whitespace-pre-wrap border-t border-amber-100 pt-1 mt-1">
                    {billing.notes}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRetry}
                disabled={loading || !onRetry}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCcw className="h-4 w-4" />
                {loading ? '確認中...' : 'もう一度チェック'}
              </button>
              <a
                href="mailto:support@archi-prisma.co.jp"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-200"
              >
                <Mail className="h-4 w-4" />
                サポートに連絡
              </a>
              {canOpenStripePortal ? (
                <button
                  type="button"
                  onClick={handleOpenStripePortal}
                  disabled={portalLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 disabled:opacity-50"
                >
                  {portalLoading ? '開きています…' : 'Stripeポータルで確認'}
                </button>
              ) : null}
              {portalError && <span className="text-[11px] text-rose-600">{portalError}</span>}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3 text-xs text-slate-600">
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">セルフチェック</p>
              <p className="text-sm text-slate-700">
                手元の Stripe Customer ID（例: cus_XXXXXX）を入力すると、Stripeに登録されている連絡先やDiscordを確認できます。
                Discord ID / メールは絞り込み用の入力です。Customer IDが分からない場合は管理者にお問い合わせください。
              </p>
            </div>
            <form onSubmit={handleSelfLookup} className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Stripe Customer ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={selfLookupInput.customerId}
                  onChange={(e) => setSelfLookupInput((prev) => ({ ...prev, customerId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="cus_XXXX"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Discord ID</label>
                <input
                  type="text"
                  value={selfLookupInput.discordId}
                  onChange={(e) => setSelfLookupInput((prev) => ({ ...prev, discordId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="123456789012345678"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">メールアドレス</label>
                <input
                  type="email"
                  value={selfLookupInput.email}
                  onChange={(e) => setSelfLookupInput((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="you@example.com"
                />
              </div>
              <div className="sm:col-span-3 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={selfLookupLoading}
                  className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
                >
                  {selfLookupLoading ? '照合中…' : 'Stripe情報を照合'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelfLookupInput({ customerId: '', discordId: '', email: '' });
                    setSelfLookupResult(null);
                    setSelfLookupError(null);
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  クリア
                </button>
                {selfLookupError && <span className="text-rose-600">{selfLookupError}</span>}
              </div>
            </form>
            {selfLookupResult && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-semibold uppercase tracking-wide">Customer ID</span>
                  <code className="rounded bg-slate-100 px-2 py-1 text-[11px] font-mono text-slate-800">
                    {selfLookupResult.stripeCustomer.id}
                  </code>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                    onClick={() => copyText(selfLookupResult.stripeCustomer.id)}
                  >
                    <Copy className="h-3 w-3" />
                    コピー
                  </button>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-500">Stripe 登録メール</p>
                  {selfLookupResult.stripeCustomer.emails.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selfLookupResult.stripeCustomer.emails.map((email) => (
                        <button
                          key={email}
                          type="button"
                          onClick={() => copyText(email)}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-mono text-slate-800 hover:bg-white"
                        >
                          {email}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">メール情報は見つかりませんでした。</p>
                  )}
                </div>
                {selfLookupResult.stripeCustomer.discordAccounts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-slate-500">Discord ID/アカウント</p>
                    <p className="text-[11px] text-slate-600">{selfLookupResult.stripeCustomer.discordAccounts.join(', ')}</p>
                  </div>
                )}
                {selfLookupResult.billingRecord ? (
                  <p className="text-[11px] text-slate-500">
                    現在のプラン: {selfLookupResult.billingRecord.planType} / Stripeステータス:{' '}
                    {selfLookupResult.billingRecord.subscriptionStatus || 'unknown'}
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-600">この Customer ID はまだコンパスの組織に紐付いていません。</p>
                )}
                <p className="text-[11px] text-slate-500">
                  ここに表示されたメールを組織管理者へ伝え、同じメールで再招待してもらうか、サポートへご連絡ください。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BillingGateOverlay;
