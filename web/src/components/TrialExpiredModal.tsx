import React from 'react';
import { X, Users, CreditCard } from 'lucide-react';

interface TrialExpiredModalProps {
  onClose: () => void;
}

// サブスク申込リンク（既存のApp.tsxから流用）
const SUBSCRIBE_URL = 'https://buy.stripe.com/dRm00l0J75OR3eV8Cbf7i00';
// サークル入会リンク
const CIRCLE_URL = 'https://stripe-discord-pro-417218426761.asia-northeast1.run.app';

export function TrialExpiredModal({ onClose }: TrialExpiredModalProps) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {/* 閉じるボタン */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ヘッダー */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <CreditCard className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">トライアルが終了しました</h2>
          <p className="mt-2 text-sm text-slate-600">
            引き続きCompassをご利用いただくには、以下のいずれかをお選びください。
          </p>
        </div>

        {/* オプション */}
        <div className="space-y-3">
          {/* サークル入会 */}
          <a
            href={CIRCLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 transition hover:border-indigo-300 hover:bg-indigo-100"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-indigo-900">サークルに入会する</h3>
              <p className="mt-1 text-xs text-indigo-700">
                3席込み + 学び・コミュニティへのアクセス
              </p>
            </div>
          </a>

          {/* サブスク開始 */}
          <a
            href={SUBSCRIBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-500">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900">Compassサブスクを開始</h3>
              <p className="mt-1 text-xs text-slate-600">
                1席 ¥1,000/月〜
              </p>
            </div>
          </a>
        </div>

        {/* 注意書き */}
        <div className="mt-6 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
          <p>※ データは30日間保管されます</p>
          <p>※ 現在は閲覧のみ可能です</p>
        </div>

        {/* 閉じるボタン（テキスト） */}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

export default TrialExpiredModal;
