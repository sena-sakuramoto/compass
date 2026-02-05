import React from 'react';
import { ArrowRight, CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import type { User } from 'firebase/auth';

type SetupPageProps = {
  user: User | null;
  authReady: boolean;
  authSupported: boolean;
  onSignIn: () => void;
  authError?: string | null;
};

export function SetupPage({
  user,
  authReady,
  authSupported,
  onSignIn,
  authError,
}: SetupPageProps) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const sessionId = params.get('session_id');

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-indigo-200">Compass Setup</p>
          <h1 className="mt-3 text-3xl font-bold">決済が完了しました</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-200">
            次に、Stripe決済時のメールアドレスでサインインしてください。
            認証後に組織作成フォームが表示されます。
          </p>

          {sessionId ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-200">
              <span className="text-slate-400">session_id:</span> {sessionId}
            </div>
          ) : null}

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { title: 'サインイン', body: '決済メールと同じアドレスでログイン', icon: Mail },
              { title: '組織作成', body: '組織IDと名称を登録', icon: ShieldCheck },
              { title: 'メンバー招待', body: '人員管理からチームを追加', icon: CheckCircle2 },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <item.icon className="h-4 w-4 text-indigo-200" />
                <p className="mt-2 text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onSignIn}
              disabled={!authSupported || !authReady}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold shadow-lg shadow-indigo-900/30 transition hover:bg-indigo-600 disabled:opacity-60"
            >
              サインインして続ける
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="/"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              ひとまずアプリへ
            </a>
          </div>

          {authError ? (
            <p className="mt-4 text-xs text-rose-200">{authError}</p>
          ) : null}

          {!authSupported ? (
            <p className="mt-4 text-xs text-amber-200">
              Firebase Auth が未設定のため、この環境ではサインインできません。
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-xs text-slate-300">
          <p className="font-semibold text-slate-100">うまく進まない場合</p>
          <ul className="mt-2 space-y-1">
            <li>・Stripe決済時のメールアドレスでサインインしてください</li>
            <li>・決済直後は反映に数分かかる場合があります</li>
            <li>・解決しない場合は compass@archi-prisma.co.jp までご連絡ください</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
