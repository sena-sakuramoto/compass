import React from 'react';
import type { BillingAccessInfo } from '../lib/api';
import { AlertTriangle, RefreshCcw, Mail } from 'lucide-react';

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
  if (!billing && !loading) return null;
  if (billing?.allowed) return null;

  const message = renderMessage(billing);

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/80 px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-rose-50 p-3">
            <AlertTriangle className="h-6 w-6 text-rose-600" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Billing</p>
            <h2 className="text-2xl font-semibold text-slate-900">{message.title}</h2>
          </div>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{message.description}</p>
        {billing?.planType && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>プラン種別</span>
              <span className="font-semibold text-slate-900">{billing.planType}</span>
            </div>
            {billing.subscriptionStatus && (
              <div className="flex justify-between mt-1">
                <span>Stripeステータス</span>
                <span className="font-semibold text-slate-900">{billing.subscriptionStatus}</span>
              </div>
            )}
            {billing.stripeCustomerId && (
              <div className="flex justify-between mt-1 text-xs">
                <span>Customer ID</span>
                <span className="font-mono">{billing.stripeCustomerId}</span>
              </div>
            )}
            {billing.notes && (
              <p className="mt-2 text-xs text-slate-500 border-t border-slate-200 pt-2 whitespace-pre-wrap">
                {billing.notes}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onRetry}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCcw className="h-4 w-4" />
            {loading ? '確認中...' : 'もう一度チェック'}
          </button>
          <a
            href="mailto:support@archi-prisma.co.jp"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
          >
            <Mail className="h-4 w-4" />
            サポートに連絡
          </a>
        </div>
      </div>
    </div>
  );
}

export default BillingGateOverlay;
