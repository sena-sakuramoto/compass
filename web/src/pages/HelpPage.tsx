// ヘルプページ - Compassの使い方と権限説明

import React, { useState } from 'react';
import { HelpCircle, Users, Shield, UserCheck, ChevronDown, ChevronRight, Info } from 'lucide-react';

export function HelpPage() {
  const [expandedSection, setExpandedSection] = useState<string | null>('getting-started');

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const Section = ({ id, title, icon: Icon, children }: any) => {
    const isExpanded = expandedSection === id;

    return (
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-teal-100 p-2">
              <Icon className="h-5 w-5 text-teal-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-400" />
          )}
        </button>
        {isExpanded && (
          <div className="p-6 pt-0 border-t border-slate-100">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-2xl p-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Compass ヘルプ</h1>
          </div>
          <p className="text-teal-100">
            プロジェクト管理システムの使い方、権限、よくある質問
          </p>
        </div>

        {/* Compassの使い方 */}
        <Section id="getting-started" title="Compassの使い方" icon={HelpCircle}>
          <div className="space-y-4 text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Compassとは？</h3>
              <p className="text-sm">
                Compassは、建設・設計プロジェクトを効率的に管理するためのシステムです。
                プロジェクトの進捗管理、タスク管理、チームメンバーとのコラボレーションを一元化します。
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-2">基本機能</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>プロジェクト管理:</strong> 物件ごとにプロジェクトを作成し、ステータスや進捗を管理</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>タスク管理:</strong> プロジェクト内のタスクを作成・割り当て・追跡</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>工程表:</strong> ガントチャートで全体の工程を可視化</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>人員管理:</strong> チームメンバーとゲストを管理</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-2">はじめ方</h3>
              <ol className="space-y-2 text-sm list-decimal list-inside">
                <li>左サイドバーから「プロジェクト」を選択</li>
                <li>プロジェクト一覧から既存のプロジェクトを選択、または新規作成</li>
                <li>プロジェクト内でタスクを作成し、担当者を割り当て</li>
                <li>工程表やタスク一覧で進捗を確認・更新</li>
              </ol>
            </div>
          </div>
        </Section>

        {/* メンバーとゲストの違い */}
        <Section id="member-guest" title="メンバーとゲストの違い" icon={Users}>
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-2">
                <Info className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-teal-900 mb-1">重要：人数制限</h3>
                  <p className="text-sm text-teal-800">
                    組織ごとに<strong>メンバー5人</strong>、<strong>ゲスト10人</strong>まで追加できます。
                  </p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border-2 border-teal-200 rounded-lg p-4 bg-teal-50">
                <h3 className="font-semibold text-teal-900 mb-3">メンバー（5人まで）</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="text-teal-600 mt-1">✓</span>
                    <span>正社員・正規雇用者</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-teal-600 mt-1">✓</span>
                    <span>長期的にプロジェクトに関わる</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-teal-600 mt-1">✓</span>
                    <span>組織の中核メンバー</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-teal-600 mt-1">✓</span>
                    <span>様々な役職を持てる</span>
                  </li>
                </ul>
              </div>

              <div className="border-2 border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">ゲスト（10人まで）</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 mt-1">✓</span>
                    <span>外部協力者・パートナー</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 mt-1">✓</span>
                    <span>一時的・プロジェクト単位の参加</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 mt-1">✓</span>
                    <span>協力会社のメンバー</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-400 mt-1">✓</span>
                    <span>推奨：職人、設計、施工管理など</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Section>

        {/* 役職と権限 */}
        <Section id="roles" title="役職と権限" icon={Shield}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700 mb-4">
              各役職には異なる権限が設定されています。適切な役職を選択してメンバーを招待してください。
            </p>

            <div className="space-y-3">
              {/* 組織管理者 */}
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">組織管理者</h3>
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">
                    最高権限
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  組織全体を管理し、メンバーやゲストを招待・管理できます
                </p>
                <div className="text-xs text-slate-500">
                  ✓ すべてのプロジェクト管理 ✓ メンバー招待 ✓ 組織設定変更
                </div>
              </div>

              {/* プロジェクトマネージャー */}
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">プロジェクトマネージャー</h3>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                    推奨（メンバー）
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  プロジェクト全体を管理し、メンバーを追加できます
                </p>
                <div className="text-xs text-slate-500">
                  ✓ プロジェクト作成・編集 ✓ タスク作成・削除 ✓ メンバー招待
                </div>
              </div>

              {/* 営業 */}
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">営業</h3>
                  <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                    メンバー
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  プロジェクトとタスクを管理できます
                </p>
                <div className="text-xs text-slate-500">
                  ✓ プロジェクト作成 ✓ タスク作成・編集
                </div>
              </div>

              {/* 設計・施工管理 */}
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">設計・施工管理</h3>
                  <span className="px-2 py-1 bg-teal-100 text-teal-800 text-xs font-medium rounded">
                    推奨（ゲスト）
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  タスクを作成・編集できます
                </p>
                <div className="text-xs text-slate-500">
                  ✓ タスク作成・編集 ✓ 自分のタスク管理
                </div>
              </div>

              {/* 職人 */}
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">職人</h3>
                  <span className="px-2 py-1 bg-teal-100 text-teal-800 text-xs font-medium rounded">
                    推奨（ゲスト）
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  自分に割り当てられたタスクのみ閲覧・更新できます
                </p>
                <div className="text-xs text-slate-500">
                  ✓ 自分のタスク編集のみ
                </div>
              </div>

              {/* 閲覧者 */}
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">閲覧者</h3>
                  <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                    制限
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  プロジェクトとタスクを閲覧できます（編集不可）
                </p>
                <div className="text-xs text-slate-500">
                  ✓ 閲覧のみ
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* キーボードショートカット */}
        <Section id="shortcuts" title="キーボードショートカット" icon={HelpCircle}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700 mb-4">
              効率的に操作するためのキーボードショートカットです。
            </p>

            <div className="space-y-3">
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">工程表（ガントチャート）</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">タスクを移動</span>
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">ドラッグ</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">タスクをコピー</span>
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Alt + ドラッグ</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">タスク期間を変更</span>
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">両端をドラッグ</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">横スクロール</span>
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Shift + スクロール</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">ズームイン/アウト</span>
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Alt + スクロール</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">表示モード切替（日/週/月）</span>
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Alt + クリック</kbd>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">全般</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">ページ再読み込み</span>
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Ctrl + Shift + R</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">スーパーリロード（キャッシュクリア）</span>
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Ctrl + F5</kbd>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <h4 className="font-semibold text-blue-900 mb-1">ヒント</h4>
                  <p className="text-blue-800">
                    工程表でタスクをドラッグする際、Altキーを押しながらドラッグするとタスクのコピーができます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* 招待の方法 */}
        <Section id="invitation" title="メンバー/ゲストの招待方法" icon={UserCheck}>
          <div className="space-y-4 text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">招待の手順</h3>
              <ol className="space-y-3 text-sm list-decimal list-inside">
                <li>
                  <strong>人員管理ページを開く</strong>
                  <p className="ml-5 mt-1 text-slate-600">左サイドバーから「人員管理」を選択</p>
                </li>
                <li>
                  <strong>「メンバー/ゲストを招待」ボタンをクリック</strong>
                  <p className="ml-5 mt-1 text-slate-600">画面右上のボタンから招待モーダルを開く</p>
                </li>
                <li>
                  <strong>区分を選択</strong>
                  <p className="ml-5 mt-1 text-slate-600">メンバー（5人まで）またはゲスト（10人まで）を選択</p>
                </li>
                <li>
                  <strong>情報を入力</strong>
                  <p className="ml-5 mt-1 text-slate-600">メールアドレス、表示名、役職を入力</p>
                </li>
                <li>
                  <strong>招待を送信</strong>
                  <p className="ml-5 mt-1 text-slate-600">招待リンクがメールで送信されます</p>
                </li>
              </ol>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <h4 className="font-semibold text-amber-900 mb-1">注意事項</h4>
                  <ul className="space-y-1 text-amber-800">
                    <li>• メンバー/ゲストの上限に達している場合は招待できません</li>
                    <li>• 招待できるのは組織管理者とプロジェクトマネージャーのみです</li>
                    <li>• 招待リンクには有効期限があります（デフォルト：7日間）</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* よくある質問 */}
        <Section id="faq" title="よくある質問" icon={HelpCircle}>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Q: メンバーとゲストを途中で変更できますか？</h3>
              <p className="text-sm text-slate-600">
                A: はい、組織管理者が人員管理ページからユーザーの設定を変更できます。
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Q: 人数制限を超えたい場合は？</h3>
              <p className="text-sm text-slate-600">
                A: プラン変更が必要です。管理者にお問い合わせください。
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Q: プロジェクトを削除するには？</h3>
              <p className="text-sm text-slate-600">
                A: プロジェクト詳細ページの設定メニューから削除できます（組織管理者のみ）。
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Q: タスクの担当者を変更するには？</h3>
              <p className="text-sm text-slate-600">
                A: タスク詳細画面で担当者フィールドをクリックし、新しい担当者を選択します。
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
