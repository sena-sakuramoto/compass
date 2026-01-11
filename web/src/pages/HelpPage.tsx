// ヘルプページ - Compassの最新仕様ガイド

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HelpCircle,
  Users,
  Shield,
  UserCheck,
  ChevronDown,
  ChevronRight,
  Info,
  Database,
  RefreshCw,
  ListFilter,
  CalendarDays,
  BarChart3,
  AlertTriangle,
  FileText,
  Mail,
} from 'lucide-react';

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
        {isExpanded && <div className="p-6 pt-0 border-t border-slate-100">{children}</div>}
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 rounded-2xl p-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Compass ヘルプ</h1>
          </div>
          <p className="text-teal-100">はじめての方でも迷わない、最新UIの使い方ガイドです。</p>
        </div>

        <Section id="getting-started" title="Compassの使い方" icon={HelpCircle}>
          <div className="space-y-4 text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Compassとは？</h3>
              <p className="text-sm">
                工程表・タスク・稼働・人員をひとつの画面でつなぎ、現場と事務の情報共有を早くするためのツールです。
                今のUIは、作業エリアを広く取りながら、必要な操作はサイドバーに集約しています。
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">主な画面</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>ダッシュボード:</strong> いま見るべき案件や期限が近いタスクをまとめて確認。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>タスク / 工程表:</strong> 期限や担当を管理し、ガントで全体の流れを把握。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>リソース分析:</strong> 期間別の稼働/稼ぎを可視化し、人員やプロジェクトの負荷を確認。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>人員管理:</strong> メンバーや協力者を整理し、担当の候補を最新化。</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">はじめ方</h3>
              <ol className="space-y-2 text-sm list-decimal list-inside">
                <li>左のサイドバーからページを選択（モバイルはメニューを開く）</li>
                <li>サイドバー下部のフィルター/検索で対象を絞る</li>
                <li>カードやガントの項目をクリックして詳細を編集</li>
                <li>危険タスクや稼働サマリーで状況を確認</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">モバイル最適化</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span>必要な操作はサイドバーにまとめ、画面を広く使えるようにしています。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span>工程表は横スクロールが中心なので、スワイプでスムーズに移動できます。</span>
                </li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="filters" title="ビュー構成とフィルター" icon={ListFilter}>
          <div className="space-y-4 text-slate-700">
            <p className="text-sm">
              フィルターと検索はサイドバー内にまとめています。ページを切り替えても設定が保たれるので、同じ条件で見続けられます。
            </p>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">フィルターのポイント</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>プロジェクト/担当者/ステータスは複数選択できます。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>担当者候補は人員管理で登録した人＋プロジェクトの参加メンバーが基準です。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>検索はタスク名・担当者・ステータス・プロジェクト名を横断して絞り込みます。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>完了・失注の表示切替はダッシュボードの案内帯から行えます。</span></li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="schedule" title="工程表（ガントチャート）の仕様" icon={CalendarDays}>
          <div className="space-y-4 text-slate-700">
            <p className="text-sm">
              工程表は作業エリアに集中できるよう、操作は上部ツールバーに集約しています。
            </p>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">操作と表示</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>日/週/月の切替、今日、ズームはツールバーから操作できます。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>横スクロールはトラックパッドや Shift+ホイールで移動できます。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>日曜・祝日は赤文字でわかりやすく表示されます。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>タスクバーはドラッグで移動、左右の端をドラッグすると期間を調整できます。</span></li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="workload" title="リソース分析" icon={BarChart3}>
          <div className="space-y-4 text-slate-700">
            <p className="text-sm">
              リソース分析は、担当者別・プロジェクト別の工数と稼ぎを同じ期間で見られるページです。
            </p>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">集計ルール</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>稼働時間は、タスク期間と対象期間の重なりで工数を按分して計算します。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>タスク期間は「開始日/予定開始日/実績開始日/期限/実績完了日」のうち取得できる日付で決定します。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>タスク工数見積(h)が未設定または0の場合は稼働時間に含まれません。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>稼ぎ（施工費ベース）はプロジェクト期間に応じて日割りで集計されます。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>プロジェクト期間は「開始日/着工日/現地調査日〜引渡し予定日/竣工予定日/予定完了日」を優先順で判定します。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>担当者別テーブルでは、稼働率と超過時間が確認でき、CSVで出力できます。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>稼働キャパは「人員管理の稼働時間/日(h) × 担当タスクのある日数」で計算します。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>稼働率は「稼働時間 ÷ キャパ」、超過は「稼働時間 − キャパ」を表示します。</span></li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="danger" title="危険タスクの自動アラート" icon={AlertTriangle}>
          <div className="space-y-4 text-slate-700">
            <p className="text-sm">
              期限が近いタスクや期限切れのタスクを自動でまとめて表示します。大事な見落としを防ぐためのリマインドです。
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>Escまたは✕で閉じられ、同じセッションでは再表示されません。</span></li>
              <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>プロジェクト名に加えて担当者、期限（曜日付き）、本日締切/要確認/要対応のバッジを表示します。</span></li>
              <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>今日締切のタスクだけをまとめて把握でき、期限を過ぎたものは赤バッジで強調されます。</span></li>
            </ul>
          </div>
        </Section>

        <Section id="member-guest" title="メンバーと協力者" icon={Users}>
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-2">
                <Info className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-teal-900 mb-1">人数制限</h3>
                  <p className="text-sm text-teal-800">プランによって招待できる人数が異なります。上限に達すると招待ができません。</p>
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border-2 border-teal-200 rounded-lg p-4 bg-teal-50">
                <h3 className="font-semibold text-teal-900 mb-3">メンバー</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">✓</span><span>ログインしてタスクや工程を編集する人向け</span></li>
                  <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">✓</span><span>プロジェクトの閲覧/編集は役職権限に応じて付与</span></li>
                  <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">✓</span><span>担当者候補としてタスクに割当可能</span></li>
                </ul>
              </div>
              <div className="border-2 border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">協力者</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2"><span className="text-slate-400 mt-1">✓</span><span>協力会社・職人など、連絡先管理のための名簿</span></li>
                  <li className="flex items-start gap-2"><span className="text-slate-400 mt-1">✓</span><span>ログイン不要で登録でき、必要ならメンバーとして招待可能</span></li>
                  <li className="flex items-start gap-2"><span className="text-slate-400 mt-1">✓</span><span>タスク担当にする場合はメンバー追加が必要</span></li>
                </ul>
              </div>
            </div>
          </div>
        </Section>

        <Section id="roles" title="役職と権限" icon={Shield}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700 mb-4">役職によってできることが変わります。必要な範囲だけ権限を付与できます。</p>
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">組織管理者</h3>
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">最高権限</span>
                </div>
                <p className="text-sm text-slate-600">組織設定・ユーザー招待・全プロジェクトの管理が可能。</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">プロジェクトマネージャー</h3>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">推奨（メンバー）</span>
                </div>
                <p className="text-sm text-slate-600">担当プロジェクトのタスク・工程・メンバーを管理します。</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">営業 / 設計 / 施工管理</h3>
                  <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">メンバー or ゲスト</span>
                </div>
                <p className="text-sm text-slate-600">割り当てられた範囲でタスク更新や進捗共有を行います。</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">閲覧者</h3>
                  <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">閲覧のみ</span>
                </div>
                <p className="text-sm text-slate-600">閲覧のみ可能。編集はできません。</p>
              </div>
            </div>
          </div>
        </Section>

        <Section id="shortcuts" title="キーボードショートカット" icon={HelpCircle}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700 mb-4">PCでよく使う操作をまとめています。</p>
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">工程表</h3>
                <div className="space-y-2 text-sm">
                  <Shortcut label="タスク移動" value="ドラッグ" />
                  <Shortcut label="期間調整" value="バー両端をドラッグ" />
                  <Shortcut label="横スクロール" value="Shift + ホイール" />
                  <Shortcut label="ズーム（ガント領域）" value="Ctrl + ホイール" />
                  <Shortcut label="今日に戻る / アラートを閉じる" value="ツールバー「今日」 / Esc" />
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">全般</h3>
                <div className="space-y-2 text-sm">
                  <Shortcut label="ページ再読み込み" value="Ctrl + R" />
                  <Shortcut label="強制再読み込み" value="Ctrl + Shift + R" />
                </div>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">危険タスクの通知は1日に数回までに制限されています。閉じた後はすぐに再表示されません。</p>
              </div>
            </div>
          </div>
        </Section>

        <Section id="invitation" title="メンバー/ゲストの招待方法" icon={UserCheck}>
          <div className="space-y-4 text-slate-700">
            <ol className="space-y-3 text-sm list-decimal list-inside">
              <li>サイドバーから「人員管理」を開く</li>
              <li>「メンバー/ゲストを招待」をクリック</li>
              <li>メンバー or ゲストを選び、役職を指定</li>
              <li>メールアドレスまたは協力者名を入力</li>
              <li>送信すると即時追加または招待メールが送られます</li>
            </ol>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              上限に達するとボタンが無効になります。不要なユーザーを整理してから招待してください。
            </div>
          </div>
        </Section>

        <Section id="data-safety" title="データの安全性とバックアップ" icon={Database}>
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
              <Database className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-green-900 mb-1">自動バックアップ</h3>
                <p className="text-sm text-green-800">毎日02:00にFirestore全体をスナップショットし、30日分保持します。</p>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">削除データの扱い</h3>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>削除後30日は保留状態で復元可能。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>31日目に自動完全削除。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>バックアップは暗号化されたCloud Storageに保管。</span></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">自動ジョブ</h3>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">時刻</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">処理</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    <tr><td className="px-4 py-3 font-mono">02:00</td><td className="px-4 py-3">Firestoreバックアップ</td></tr>
                    <tr><td className="px-4 py-3 font-mono">03:00</td><td className="px-4 py-3">30日超の削除データを完全削除</td></tr>
                    <tr><td className="px-4 py-3 font-mono">09:00</td><td className="px-4 py-3">期限/開始通知を送信</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Section>

        <Section id="faq" title="よくある質問" icon={HelpCircle}>
          <div className="space-y-4 text-sm text-slate-700">
            <FAQItem
              question="Q: 完了や失注のプロジェクトはどこで確認できますか？"
              answer="A: ダッシュボードの案内帯にあるボタンで表示/非表示を切り替えられます。" />
            <FAQItem
              question="Q: 稼働時間や稼ぎの数値が以前と違うのはなぜ？"
              answer="A: タスク/プロジェクト期間に対して日割りで計算する方式に統一したためです。週・月・年でも同じロジックです。" />
            <FAQItem
              question="Q: 協力者をテキストで追加したのにフィルターに出ません。"
              answer="A: 協力者は名簿用のため担当者候補には出ません。担当にしたい場合はメンバーとして追加してください。" />
            <FAQItem
              question="Q: 危険タスクモーダルが頻繁に表示されます。"
              answer="A: 朝(5〜11時)と夕方(17〜23時)でそれぞれ1回のみ表示されます。Escまたは✕で閉じるとその時間帯は抑止されます。" />
            <FAQItem
              question="Q: 祝日や振替休日はどうやって反映されていますか？"
              answer="A: 日本の祝日データセットを起動時に読み込み、日曜と同じ赤文字で表示します。特別な設定は不要です。" />
          </div>
        </Section>

        {/* 法務情報・お問い合わせ */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-slate-100 p-2">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">法務情報・お問い合わせ</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-slate-900 mb-3">規約・ポリシー</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/terms" className="text-teal-600 hover:text-teal-700 hover:underline text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    利用規約
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="text-teal-600 hover:text-teal-700 hover:underline text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    プライバシーポリシー
                  </Link>
                </li>
                <li>
                  <Link to="/legal" className="text-teal-600 hover:text-teal-700 hover:underline text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    特定商取引法に基づく表示
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium text-slate-900 mb-3">お問い合わせ</h3>
              <div className="space-y-2 text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <a href="mailto:compass@archi-prisma.co.jp" className="text-teal-600 hover:text-teal-700 hover:underline">
                    compass@archi-prisma.co.jp
                  </a>
                </p>
                <p className="text-xs text-slate-500">
                  平日 10:00〜18:00（土日祝・年末年始を除く）
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* コピーライト */}
        <div className="text-center text-xs text-slate-400 pb-4">
          &copy; {new Date().getFullYear()} Archi-Prisma Design works株式会社 All Rights Reserved.
        </div>
      </div>
    </div>
  );
}

function Shortcut({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-700">{label}</span>
      <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">{value}</kbd>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div>
      <h3 className="font-semibold text-slate-900 mb-1">{question}</h3>
      <p className="text-slate-600">{answer}</p>
    </div>
  );
}
