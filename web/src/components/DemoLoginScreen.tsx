import React, { useState, useEffect } from 'react';
import { Building2, Briefcase, User, ChevronRight, Loader2 } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';

type DemoUserProfile = {
  jobTitle: string;
  ageRange: string;
  position: string;
  company: string;
};

type Props = {
  user: FirebaseUser | null;
  authReady: boolean;
  authSupported: boolean;
  onSignIn: () => void;
  onProfileComplete: (profile: DemoUserProfile) => void;
  profileLoading: boolean;
  existingProfile: DemoUserProfile | null;
};

const JOB_TITLES = [
  '設計士・建築士',
  '施工管理',
  '現場監督',
  '営業',
  '経営者・役員',
  '事務・管理',
  'IT・システム',
  'その他',
];

const AGE_RANGES = [
  '20代',
  '30代',
  '40代',
  '50代',
  '60代以上',
];

const POSITIONS = [
  '経営者・役員',
  '部長・マネージャー',
  '課長・リーダー',
  '一般社員',
  'フリーランス',
  '学生',
];

export function DemoLoginScreen({
  user,
  authReady,
  authSupported,
  onSignIn,
  onProfileComplete,
  profileLoading,
  existingProfile,
}: Props) {
  const [profile, setProfile] = useState<DemoUserProfile>({
    jobTitle: '',
    ageRange: '',
    position: '',
    company: '',
  });
  const [step, setStep] = useState<'login' | 'profile'>('login');

  useEffect(() => {
    if (user && !existingProfile) {
      setStep('profile');
    }
  }, [user, existingProfile]);

  const isProfileValid = profile.jobTitle && profile.ageRange && profile.position;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProfileValid) {
      onProfileComplete(profile);
    }
  };

  // ログイン前の画面
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
            {/* ロゴ・タイトル */}
            <div className="text-center mb-8">
              <img src="/compass-logo.png" alt="Compass" className="h-12 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">建築プロジェクト管理ツール</p>
            </div>

            {/* デモ説明 */}
            <div className="bg-blue-50 rounded-2xl p-4 mb-6">
              <h2 className="font-semibold text-blue-800 mb-2">デモ版を体験</h2>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>・サンプルプロジェクトで機能を確認</li>
                <li>・ガントチャート・タスク管理を体験</li>
                <li>・リソース分析・工程管理を試す</li>
              </ul>
            </div>

            {/* Googleログインボタン */}
            <button
              type="button"
              onClick={onSignIn}
              disabled={!authReady || !authSupported}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 rounded-2xl px-6 py-4 text-slate-700 font-semibold hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Googleでログイン
            </button>

            {!authSupported && (
              <p className="text-xs text-red-500 text-center mt-3">
                認証機能が利用できません
              </p>
            )}

            {/* フッター */}
            <p className="text-xs text-slate-400 text-center mt-6">
              ログインすることで、デモ版をお試しいただけます
            </p>
          </div>
        </div>
      </div>
    );
  }

  // プロフィール入力画面（ログイン後）
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          {/* ヘッダー */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
              <User className="w-6 h-6 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-1">
              ようこそ、{user.displayName?.split(' ')[0] || 'ゲスト'}さん
            </h1>
            <p className="text-slate-500 text-sm">
              簡単なプロフィールを教えてください
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 職種 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Briefcase className="w-4 h-4" />
                職種
              </label>
              <select
                value={profile.jobTitle}
                onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
              >
                <option value="">選択してください</option>
                {JOB_TITLES.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </div>

            {/* 年代 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <User className="w-4 h-4" />
                年代
              </label>
              <div className="grid grid-cols-3 gap-2">
                {AGE_RANGES.map((age) => (
                  <button
                    key={age}
                    type="button"
                    onClick={() => setProfile({ ...profile, ageRange: age })}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition ${
                      profile.ageRange === age
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {age}
                  </button>
                ))}
              </div>
            </div>

            {/* 役職 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Briefcase className="w-4 h-4" />
                役職
              </label>
              <select
                value={profile.position}
                onChange={(e) => setProfile({ ...profile, position: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
              >
                <option value="">選択してください</option>
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            {/* 会社名（任意） */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Building2 className="w-4 h-4" />
                会社名 <span className="text-slate-400 font-normal">（任意）</span>
              </label>
              <input
                type="text"
                value={profile.company}
                onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                placeholder="株式会社〇〇"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
              />
            </div>

            {/* 送信ボタン */}
            <button
              type="submit"
              disabled={!isProfileValid || profileLoading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-2xl px-6 py-4 hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {profileLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  デモを始める
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
