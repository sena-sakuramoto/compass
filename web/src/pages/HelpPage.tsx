// ヘルプページ - Compassの最新仕様ガイド

import React, { useState } from 'react';
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
          <p className="text-teal-100">最新のレイアウトと集計ルールに合わせた使い方ガイドです。</p>
        </div>

        <Section id="getting-started" title="Compassの使い方" icon={HelpCircle}>
          <div className="space-y-4 text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Compassとは？</h3>
              <p className="text-sm">
                建築・設計プロジェクトを横断し、ガント・タスク・稼働・人員情報を一体管理する社内ツールです。
                2025年版ではヘッダーとフィルターバーの高さを見直し、ガントやカード領域への表示面積を最大化しました。
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">主な画面</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>ダッシュボード:</strong> プロジェクト一覧・危険タスク・フィルター結果を集約。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>タスク / 工程表:</strong> ガント領域専用のズーム・今日ボタン・日/週/月切替を装備。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>稼働状況:</strong> 週・月・年の切替とサマリーカード、稼ぎタイムライン、担当者別バー。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span><strong>人員管理:</strong> メンバーと協力者の整理、招待と上限管理。</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">はじめ方</h3>
              <ol className="space-y-2 text-sm list-decimal list-inside">
                <li>左上メニューからページを選択（モバイルはハンバーガー）</li>
                <li>ページ見出し直下のフィルターバーで対象を絞る</li>
                <li>カード/ガントでタスク・プロジェクトを開き編集</li>
                <li>危険タスクモーダルや稼働サマリーで進捗を確認</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">モバイル最適化</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span>ヘッダーとフィルターが常に密着して表示され、余白がありません。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-600 mt-1">•</span>
                  <span>工程表はタスク一覧の幅を自動縮小し、ズーム/今日ボタンもタップしやすいサイズに固定しています。</span>
                </li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="filters" title="ビュー構成とフィルター" icon={ListFilter}>
          <div className="space-y-4 text-slate-700">
            <p className="text-sm">
              フィルターは見出しの直下に1段で配置し、表示件数もフィルター付近にまとめて表示します。
            </p>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">フィルターのポイント</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>プロジェクト/担当者/ステータスはマルチセレクト。プルダウンの重なり順を最上位に固定し、カレンダーヘッダーより前面に表示します。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>担当者候補は人員管理で登録した担当者と、参加中プロジェクトのメンバーから作られます。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>検索はタスク名・担当者・ステータス・プロジェクト名などのテキストを横断して絞り込みます。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>失注・引渡し済はダッシュボードでデフォルト非表示。案内帯のボタンで即切り替えできます。</span></li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="schedule" title="工程表（ガントチャート）の仕様" icon={CalendarDays}>
          <div className="space-y-4 text-slate-700">
            <p className="text-sm">
              工程表ではページ見出しとフィルターを分離しつつも余白をなくし、ガント領域限定のズーム/横スクロールに統一しました。
            </p>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">操作と表示</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>ツールバーで日/週/月を切替、同列に「今日」ボタンとズーム（＋/－）。Shift+ホイールで横移動、Ctrl+ホイールでズーム（ガント領域上のみ）。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>土曜は平日と同じ配色、日曜と祝日（振替含む）は赤文字のみで強調。赤背景は廃止しました。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>日本の祝日は最新データから自動判定し、ヘッダーとガント双方に反映します。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>プロジェクト行の上にあった「日/週/月」切替を撤廃し、ガント領域専用のコントロールへ集約しました。</span></li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="workload" title="稼働状況 / 稼ぎビュー" icon={BarChart3}>
          <div className="space-y-4 text-slate-700">
            <p className="text-sm">
              稼働状況ページは週・月・年をワンクリックで切替え、期間内/比較期間（先週/前月/前年）の指標を揃えています。
            </p>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">集計ルール</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>稼働時間はタスク期間と対象期間の重なり日数で按分した工数見積(h)の合計。1日のタスクも日割りで算入します。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>稼ぎ（施工費ベース）はプロジェクトの開始〜引渡し予定をスパンとして施工費を按分。重なる日数のみを合計します。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>タイムラインは週=日別、月=週別、年=月別にバケット化し、稼働と稼ぎを同じロジックで描画。</span></li>
                <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">•</span><span>担当者別バーは対象期間で工数が発生した人のみ表示し、協力者のテキスト登録も即反映されます。</span></li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="danger" title="危険タスクの自動アラート" icon={AlertTriangle}>
          <div className="space-y-4 text-slate-700">
            <p className="text-sm">
              期限が今日を含む2日以内、または超過している未完了タスクをまとめたモーダルが、画面を開いたタイミングで1回だけ自動表示されます。リマインド内では「今日が期限」と「期限が迫っている/超過」の2セクションに分かれ、担当者名も同時に表示されます。
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
                  <p className="text-sm text-teal-800">プランに応じて組織メンバー数の上限が変わります（例: starter 5名 / business 30名 / enterprise 実質無制限）。</p>
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border-2 border-teal-200 rounded-lg p-4 bg-teal-50">
                <h3 className="font-semibold text-teal-900 mb-3">メンバー</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">✓</span><span>正社員や長期参画者向け</span></li>
                  <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">✓</span><span>全プロジェクトの編集や人員招待が可能</span></li>
                  <li className="flex items-start gap-2"><span className="text-teal-600 mt-1">✓</span><span>役職に応じて工程編集・人員管理にアクセス</span></li>
                </ul>
              </div>
              <div className="border-2 border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">協力者</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2"><span className="text-slate-400 mt-1">✓</span><span>協力会社・職人・外部PMなどの連絡先管理向け</span></li>
                  <li className="flex items-start gap-2"><span className="text-slate-400 mt-1">✓</span><span>ログイン不要で登録可能</span></li>
                  <li className="flex items-start gap-2"><span className="text-slate-400 mt-1">✓</span><span>タスクの担当者はプロジェクトメンバー/担当者から選択（協力者は名簿用）</span></li>
                </ul>
              </div>
            </div>
          </div>
        </Section>

        <Section id="roles" title="役職と権限" icon={Shield}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700 mb-4">ローカル閲覧時は読み取り専用ですが、オンラインでは役職ごとに以下の権限が適用されます。</p>
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">組織管理者</h3>
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">最高権限</span>
                </div>
                <p className="text-sm text-slate-600">組織設定、ユーザー招待、全プロジェクトの編集が可能。</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">プロジェクトマネージャー</h3>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">推奨（メンバー）</span>
                </div>
                <p className="text-sm text-slate-600">担当プロジェクト内でのメンバー招待・タスク編集・工程調整を行います。</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">営業 / 設計 / 施工管理</h3>
                  <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">メンバー or ゲスト</span>
                </div>
                <p className="text-sm text-slate-600">割り当てタスクの追加・更新、進捗共有が可能。</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 hover:border-teal-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">閲覧者</h3>
                  <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">閲覧のみ</span>
                </div>
                <p className="text-sm text-slate-600">すべてのページを閲覧できますが編集はできません。</p>
              </div>
            </div>
          </div>
        </Section>

        <Section id="shortcuts" title="キーボードショートカット" icon={HelpCircle}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700 mb-4">PCでの操作を効率化するショートカットです（ガント領域限定のものを含む）。</p>
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">工程表</h3>
                <div className="space-y-2 text-sm">
                  <Shortcut label="タスク移動" value="ドラッグ" />
                  <Shortcut label="タスクコピー" value="Alt + ドラッグ" />
                  <Shortcut label="期間調整" value="バー両端をドラッグ" />
                  <Shortcut label="横スクロール" value="Shift + ホイール" />
                  <Shortcut label="ズーム（ガント領域）" value="Ctrl + ホイール" />
                  <Shortcut label="今日に戻る / アラートを閉じる" value="ツールバー「今日」 / Esc" />
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3">全般</h3>
                <div className="space-y-2 text-sm">
                  <Shortcut label="ページ再読み込み" value="Ctrl + Shift + R" />
                  <Shortcut label="スーパーリロード" value="Ctrl + F5" />
                </div>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">危険タスクモーダルは朝・夕それぞれ1回まで。Escキーや✕で閉じた後は次の時間帯まで再表示されません。</p>
              </div>
            </div>
          </div>
        </Section>

        <Section id="invitation" title="メンバー/ゲストの招待方法" icon={UserCheck}>
          <div className="space-y-4 text-slate-700">
            <ol className="space-y-3 text-sm list-decimal list-inside">
              <li>左サイドバー「人員管理」を開く</li>
              <li>右上「メンバー/ゲストを招待」をクリック</li>
              <li>メンバー or ゲストを選び、役職を指定</li>
              <li>メールアドレス or 協力者名（テキストのみ）を入力</li>
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
              question="Q: 失注や引渡し済のプロジェクトはどこで確認できますか？"
              answer="A: ダッシュボードの案内帯にあるボタンで表示/非表示を切り替えられます。" />
            <FAQItem
              question="Q: 稼働時間や稼ぎの数値が以前と違うのはなぜ？"
              answer="A: タスク/プロジェクト期間との重なり日数で按分する方式に刷新したためです。週・月・年いずれも同じロジックです。" />
            <FAQItem
              question="Q: 協力者をテキストで追加したのにフィルターに出ません。"
              answer="A: プロジェクト編集で保存後に自動反映されます。反映されない場合はページを再読込してください。" />
            <FAQItem
              question="Q: 危険タスクモーダルが頻繁に表示されます。"
              answer="A: 朝(5〜11時)と夕方(17〜23時)でそれぞれ1回のみ表示されます。Escまたは✕で閉じるとその時間帯は抑止されます。" />
            <FAQItem
              question="Q: 祝日や振替休日はどうやって反映されていますか？"
              answer="A: 日本の祝日データセットを起動時に読み込み、日曜と同じ赤文字で表示します。特別な設定は不要です。" />
          </div>
        </Section>
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
