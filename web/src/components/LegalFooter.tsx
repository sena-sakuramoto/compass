// 法務ページへのリンクを含むフッターコンポーネント

import React from 'react';
import { Link } from 'react-router-dom';

interface LegalFooterProps {
  className?: string;
  variant?: 'light' | 'dark';
}

export function LegalFooter({ className = '', variant = 'light' }: LegalFooterProps) {
  const textColor = variant === 'dark' ? 'text-slate-400' : 'text-slate-500';
  const hoverColor = variant === 'dark' ? 'hover:text-slate-200' : 'hover:text-slate-700';
  const borderColor = variant === 'dark' ? 'border-slate-700' : 'border-slate-200';

  return (
    <footer className={`py-4 ${className}`}>
      <div className="flex flex-col items-center gap-3">
        {/* リンク */}
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs">
          <Link
            to="/terms"
            className={`${textColor} ${hoverColor} transition-colors`}
          >
            利用規約
          </Link>
          <Link
            to="/privacy"
            className={`${textColor} ${hoverColor} transition-colors`}
          >
            プライバシーポリシー
          </Link>
          <Link
            to="/legal"
            className={`${textColor} ${hoverColor} transition-colors`}
          >
            特定商取引法に基づく表示
          </Link>
          <Link
            to="/help"
            className={`${textColor} ${hoverColor} transition-colors`}
          >
            ヘルプ
          </Link>
        </nav>

        {/* コピーライト */}
        <div className={`text-xs ${textColor} border-t ${borderColor} pt-3 w-full text-center`}>
          <p>&copy; {new Date().getFullYear()} Archi-Prisma Design works株式会社 All Rights Reserved.</p>
        </div>
      </div>
    </footer>
  );
}

// シンプルなインラインリンク版（サインイン画面など用）
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`text-xs text-slate-400 ${className}`}>
      <Link to="/terms" className="underline hover:text-slate-200 transition-colors">
        利用規約
      </Link>
      <span className="mx-2">・</span>
      <Link to="/privacy" className="underline hover:text-slate-200 transition-colors">
        プライバシーポリシー
      </Link>
    </div>
  );
}
