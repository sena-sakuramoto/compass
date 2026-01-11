// プライバシーポリシーページ

import React from 'react';
import { Shield, Database, Mail, Globe, Lock, Eye, Trash2, AlertCircle } from 'lucide-react';

export function PrivacyPolicyPage() {
  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8" />
            <h1 className="text-3xl font-bold">プライバシーポリシー</h1>
          </div>
          <p className="text-slate-300">個人情報の取り扱いについて</p>
          <p className="text-sm text-slate-400 mt-2">最終更新日: 2025年1月11日</p>
        </div>

        {/* 前文 */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-slate-700 leading-relaxed">
            Archi-Prisma Design works株式会社（以下「当社」）は、Compass（以下「本サービス」）の提供にあたり、
            お客様の個人情報の保護を重要な責務と認識し、以下のプライバシーポリシーに基づき、
            個人情報を適切に取り扱います。
          </p>
        </section>

        {/* 第1条 */}
        <PolicySection
          number={1}
          title="収集する情報"
          icon={Database}
        >
          <p className="text-slate-700 mb-4">当社は、本サービスの提供にあたり、以下の情報を収集します。</p>

          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-2">1-1. お客様から直接ご提供いただく情報</h4>
              <ul className="space-y-1 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1">•</span>
                  <span>氏名、メールアドレス、電話番号</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1">•</span>
                  <span>会社名、部署名、役職</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1">•</span>
                  <span>請求先情報（有料プランご利用の場合）</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1">•</span>
                  <span>お問い合わせ内容</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-2">1-2. サービス利用時に自動的に収集される情報</h4>
              <ul className="space-y-1 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1">•</span>
                  <span>IPアドレス、ブラウザ情報、デバイス情報</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1">•</span>
                  <span>アクセス日時、利用ログ</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1">•</span>
                  <span>Cookie情報（詳細は第6条をご参照ください）</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-2">1-3. 第三者から取得する情報</h4>
              <ul className="space-y-1 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 mt-1">•</span>
                  <span>Googleアカウント連携時のプロフィール情報（氏名、メールアドレス、プロフィール画像）</span>
                </li>
              </ul>
            </div>
          </div>
        </PolicySection>

        {/* 第2条 */}
        <PolicySection
          number={2}
          title="利用目的"
          icon={Eye}
        >
          <p className="text-slate-700 mb-4">当社は、収集した個人情報を以下の目的で利用します。</p>
          <ul className="space-y-2 text-slate-700">
            <li className="flex items-start gap-2">
              <span className="bg-slate-200 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
              <span>本サービスの提供、運営、維持、改善</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-slate-200 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
              <span>ユーザーアカウントの作成、管理、認証</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-slate-200 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
              <span>お問い合わせへの対応、カスタマーサポートの提供</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-slate-200 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
              <span>利用料金の請求、決済処理（有料プランの場合）</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-slate-200 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0">5</span>
              <span>サービスに関する重要なお知らせの送信</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-slate-200 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0">6</span>
              <span>新機能、アップデート情報のご案内（同意いただいた場合）</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-slate-200 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0">7</span>
              <span>利用状況の分析、統計データの作成</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-slate-200 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0">8</span>
              <span>不正利用の防止、セキュリティの確保</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="bg-slate-200 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0">9</span>
              <span>法令に基づく対応</span>
            </li>
          </ul>
        </PolicySection>

        {/* 第3条 */}
        <PolicySection
          number={3}
          title="第三者提供"
          icon={Globe}
        >
          <p className="text-slate-700 mb-4">
            当社は、以下の場合を除き、お客様の個人情報を第三者に提供することはありません。
          </p>
          <ul className="space-y-2 text-slate-700">
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <span>お客様の同意がある場合</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <span>法令に基づく場合</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <span>人の生命、身体または財産の保護のために必要がある場合</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <span>公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <span>国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合</span>
            </li>
          </ul>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">業務委託先への提供</h4>
            <p className="text-sm text-blue-800">
              当社は、利用目的の達成に必要な範囲内において、個人情報の取り扱いの全部または一部を委託する場合があります。
              その場合、委託先との間で個人情報の取り扱いに関する契約を締結し、適切な監督を行います。
            </p>
            <div className="mt-3 text-sm text-blue-800">
              <p className="font-medium mb-1">主な委託先サービス:</p>
              <ul className="space-y-1">
                <li>• Google Cloud Platform（インフラ、データベース）</li>
                <li>• Firebase（認証、ホスティング）</li>
                <li>• Stripe（決済処理）</li>
              </ul>
            </div>
          </div>
        </PolicySection>

        {/* 第4条 */}
        <PolicySection
          number={4}
          title="安全管理措置"
          icon={Lock}
        >
          <p className="text-slate-700 mb-4">
            当社は、個人情報の漏洩、滅失、毀損の防止その他の安全管理のために、以下の措置を講じています。
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-2">技術的措置</h4>
              <ul className="space-y-1 text-sm text-slate-700">
                <li>• 通信の暗号化（TLS/SSL）</li>
                <li>• データベースの暗号化</li>
                <li>• アクセス制御・認証機能</li>
                <li>• ファイアウォール設定</li>
                <li>• 定期的なセキュリティ監査</li>
              </ul>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-2">組織的措置</h4>
              <ul className="space-y-1 text-sm text-slate-700">
                <li>• 個人情報保護責任者の設置</li>
                <li>• 従業員への教育・研修</li>
                <li>• アクセス権限の管理</li>
                <li>• 委託先の監督</li>
                <li>• インシデント対応体制の整備</li>
              </ul>
            </div>
          </div>
        </PolicySection>

        {/* 第5条 */}
        <PolicySection
          number={5}
          title="お客様の権利"
          icon={Eye}
        >
          <p className="text-slate-700 mb-4">
            お客様は、当社が保有する個人情報について、以下の権利を有します。
          </p>
          <div className="space-y-3">
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-1">開示請求</h4>
              <p className="text-sm text-slate-600">当社が保有する個人情報の開示を請求できます。</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-1">訂正・追加・削除請求</h4>
              <p className="text-sm text-slate-600">個人情報の内容が事実でない場合、訂正・追加・削除を請求できます。</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-1">利用停止・消去請求</h4>
              <p className="text-sm text-slate-600">個人情報が利用目的の範囲を超えて取り扱われている場合等に、利用停止または消去を請求できます。</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="font-semibold text-slate-900 mb-1">第三者提供の停止請求</h4>
              <p className="text-sm text-slate-600">個人情報が不正に第三者に提供されている場合、その停止を請求できます。</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-4">
            これらの請求を行う場合は、本人確認のうえ、第10条に記載のお問い合わせ窓口までご連絡ください。
          </p>
        </PolicySection>

        {/* 第6条 */}
        <PolicySection
          number={6}
          title="Cookieの使用"
          icon={Database}
        >
          <p className="text-slate-700 mb-4">
            本サービスでは、以下の目的でCookieおよび類似技術を使用しています。
          </p>
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 mb-1">必須Cookie</h4>
              <p className="text-sm text-green-800">認証状態の維持、セキュリティ機能に必要です。無効にするとサービスが正常に動作しません。</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-1">機能性Cookie</h4>
              <p className="text-sm text-blue-800">言語設定、表示設定などのユーザー設定を保存します。</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-semibold text-amber-900 mb-1">分析Cookie</h4>
              <p className="text-sm text-amber-800">サービスの利用状況を分析し、改善に役立てます。Google Analyticsを使用しています。</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-4">
            ブラウザの設定によりCookieを無効にすることができますが、一部の機能が制限される場合があります。
          </p>
        </PolicySection>

        {/* 第7条 */}
        <PolicySection
          number={7}
          title="保存期間"
          icon={Trash2}
        >
          <p className="text-slate-700 mb-4">
            当社は、個人情報を利用目的に必要な期間のみ保存します。
          </p>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">データ種別</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">保存期間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                <tr>
                  <td className="px-4 py-3">アカウント情報</td>
                  <td className="px-4 py-3">アカウント削除後30日</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">プロジェクト・タスクデータ</td>
                  <td className="px-4 py-3">削除後30日（復元可能期間）</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">利用ログ</td>
                  <td className="px-4 py-3">1年間</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">請求・決済情報</td>
                  <td className="px-4 py-3">法定保存期間（7年）</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">お問い合わせ記録</td>
                  <td className="px-4 py-3">3年間</td>
                </tr>
              </tbody>
            </table>
          </div>
        </PolicySection>

        {/* 第8条 */}
        <PolicySection
          number={8}
          title="未成年者の個人情報"
          icon={AlertCircle}
        >
          <p className="text-slate-700">
            本サービスは、原則として18歳以上の方を対象としています。
            18歳未満の方が本サービスを利用する場合は、保護者の同意が必要です。
            18歳未満の方から個人情報を収集したことが判明した場合、当社は速やかに当該情報を削除します。
          </p>
        </PolicySection>

        {/* 第9条 */}
        <PolicySection
          number={9}
          title="プライバシーポリシーの変更"
          icon={AlertCircle}
        >
          <p className="text-slate-700">
            当社は、法令の変更、サービス内容の変更、その他必要に応じて、本プライバシーポリシーを変更することがあります。
            変更後のプライバシーポリシーは、本ページに掲載した時点から効力を生じます。
            重要な変更がある場合は、サービス内の通知またはメールでお知らせします。
          </p>
        </PolicySection>

        {/* 第10条 */}
        <PolicySection
          number={10}
          title="お問い合わせ窓口"
          icon={Mail}
        >
          <p className="text-slate-700 mb-4">
            個人情報の取り扱いに関するお問い合わせは、以下の窓口までご連絡ください。
          </p>
          <div className="bg-slate-100 rounded-lg p-6">
            <div className="space-y-2 text-slate-700">
              <p><span className="font-semibold">会社名:</span> Archi-Prisma Design works株式会社</p>
              <p><span className="font-semibold">個人情報保護管理者:</span> 櫻本聖成</p>
              <p><span className="font-semibold">メール:</span> compass@archi-prisma.co.jp</p>
              <p><span className="font-semibold">住所:</span> 〒141-0021 東京都品川区上大崎2-6-7 SMA白金長者丸301</p>
            </div>
          </div>
        </PolicySection>

        {/* フッター */}
        <div className="text-center text-sm text-slate-500 pb-8">
          <p>制定日: 2025年1月11日</p>
          <p className="mt-1">Archi-Prisma Design works株式会社</p>
        </div>
      </div>
    </div>
  );
}

// 共通のセクションコンポーネント
function PolicySection({
  number,
  title,
  icon: Icon,
  children,
}: {
  number: number;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-slate-100 p-2">
          <Icon className="h-5 w-5 text-slate-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          第{number}条 {title}
        </h2>
      </div>
      <div className="pl-0 md:pl-12">{children}</div>
    </section>
  );
}
