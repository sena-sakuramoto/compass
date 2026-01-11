// 利用規約ページ

import React from 'react';
import {
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Scale,
  Shield,
  CreditCard,
  Ban,
  RefreshCw,
  Gavel,
  Mail,
} from 'lucide-react';

export function TermsOfServicePage() {
  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 rounded-2xl p-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-8 w-8" />
            <h1 className="text-3xl font-bold">利用規約</h1>
          </div>
          <p className="text-indigo-200">Compassサービス利用規約</p>
          <p className="text-sm text-indigo-300 mt-2">最終更新日: 2025年1月11日</p>
        </div>

        {/* 前文 */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-slate-700 leading-relaxed">
            この利用規約（以下「本規約」）は、Archi-Prisma Design works株式会社（以下「当社」）が提供する
            プロジェクト管理サービス「Compass」（以下「本サービス」）の利用条件を定めるものです。
            本サービスをご利用いただく前に、本規約をよくお読みください。
            本サービスを利用することにより、お客様は本規約に同意したものとみなされます。
          </p>
        </section>

        {/* 第1条 */}
        <TermsSection number={1} title="定義" icon={FileText}>
          <p className="text-slate-700 mb-4">本規約において使用する用語の定義は、以下の通りとします。</p>
          <div className="space-y-3">
            <DefinitionItem term="本サービス" definition="当社が提供するプロジェクト管理サービス「Compass」およびこれに付随するすべての機能・サービス" />
            <DefinitionItem term="ユーザー" definition="本規約に同意し、本サービスを利用するすべての個人または法人" />
            <DefinitionItem term="組織" definition="本サービス上で作成されるユーザーのグループ単位" />
            <DefinitionItem term="組織管理者" definition="組織の管理権限を持つユーザー" />
            <DefinitionItem term="メンバー" definition="組織に所属し、本サービスにログインして利用するユーザー" />
            <DefinitionItem term="コンテンツ" definition="ユーザーが本サービスにアップロード、投稿、または保存するすべてのデータ・情報" />
          </div>
        </TermsSection>

        {/* 第2条 */}
        <TermsSection number={2} title="利用契約の成立" icon={CheckCircle2}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>本サービスの利用を希望する方は、本規約に同意のうえ、当社所定の方法により利用登録を行うものとします。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>当社が利用登録を承認した時点で、ユーザーと当社の間に本サービスの利用契約が成立します。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
              <span>当社は、以下の場合に利用登録を拒否することがあります。
                <ul className="mt-2 ml-4 space-y-1 text-sm">
                  <li>• 登録情報に虚偽、誤記、または記載漏れがある場合</li>
                  <li>• 過去に本規約違反等により登録を取り消された方からの申請である場合</li>
                  <li>• 反社会的勢力等に該当すると当社が判断した場合</li>
                  <li>• その他、当社が登録を適当でないと判断した場合</li>
                </ul>
              </span>
            </li>
          </ol>
        </TermsSection>

        {/* 第3条 */}
        <TermsSection number={3} title="アカウント管理" icon={Shield}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>ユーザーは、自己の責任においてアカウント情報を管理するものとします。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>ユーザーは、アカウント情報を第三者に貸与、譲渡、または共有してはなりません。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
              <span>アカウントの不正使用により生じた損害について、当社は一切の責任を負いません。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">4</span>
              <span>ユーザーは、アカウント情報の漏洩または不正使用を発見した場合、直ちに当社に通知するものとします。</span>
            </li>
          </ol>
        </TermsSection>

        {/* 第4条 */}
        <TermsSection number={4} title="料金および支払い" icon={CreditCard}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>本サービスの利用料金は、当社が別途定める料金表に従うものとします。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>有料プランのユーザーは、当社が指定する支払方法により、利用料金を支払うものとします。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
              <span>支払期日までに利用料金の支払いがない場合、当社はサービスの提供を停止することがあります。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">4</span>
              <span>当社は、1ヶ月前の通知をもって、料金を改定することがあります。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">5</span>
              <span>既にお支払いいただいた利用料金は、法令に定める場合を除き、返金いたしません。</span>
            </li>
          </ol>

          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-amber-900 mb-1">支払いに関する注意</h4>
                <p className="text-sm text-amber-800">
                  クレジットカードの有効期限切れ等により決済ができない場合、サービスが自動的に停止されることがあります。
                  支払情報は常に最新の状態に保つようお願いいたします。
                </p>
              </div>
            </div>
          </div>
        </TermsSection>

        {/* 第5条 */}
        <TermsSection number={5} title="禁止事項" icon={Ban}>
          <p className="text-slate-700 mb-4">ユーザーは、本サービスの利用にあたり、以下の行為を行ってはなりません。</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <ProhibitedItem text="法令または公序良俗に違反する行為" />
              <ProhibitedItem text="犯罪行為に関連する行為" />
              <ProhibitedItem text="当社または第三者の知的財産権を侵害する行為" />
              <ProhibitedItem text="当社または第三者の名誉・信用を毀損する行為" />
              <ProhibitedItem text="当社または第三者のプライバシーを侵害する行為" />
              <ProhibitedItem text="当社のサーバーやネットワークに過度な負荷をかける行為" />
            </div>
            <div className="space-y-2">
              <ProhibitedItem text="本サービスの運営を妨害する行為" />
              <ProhibitedItem text="不正アクセス、クラッキング行為" />
              <ProhibitedItem text="他のユーザーになりすます行為" />
              <ProhibitedItem text="本サービスを利用した営業活動（当社の許可なく）" />
              <ProhibitedItem text="反社会的勢力への利益供与" />
              <ProhibitedItem text="その他、当社が不適切と判断する行為" />
            </div>
          </div>
        </TermsSection>

        {/* 第6条 */}
        <TermsSection number={6} title="コンテンツの取り扱い" icon={FileText}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>ユーザーが本サービスにアップロードしたコンテンツの著作権は、ユーザーに帰属します。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>ユーザーは、当社に対し、本サービスの提供・改善・宣伝に必要な範囲で、コンテンツを利用する権利を許諾します。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
              <span>当社は、以下の場合にコンテンツを削除または非公開にすることがあります。
                <ul className="mt-2 ml-4 space-y-1 text-sm">
                  <li>• コンテンツが本規約に違反する場合</li>
                  <li>• 法令または第三者の権利を侵害する恐れがある場合</li>
                  <li>• 当社が本サービスの運営上必要と判断した場合</li>
                </ul>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">4</span>
              <span>ユーザーは、定期的にコンテンツのバックアップを取得することを推奨します。</span>
            </li>
          </ol>
        </TermsSection>

        {/* 第7条 */}
        <TermsSection number={7} title="サービスの変更・中断・終了" icon={RefreshCw}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>当社は、当社の裁量により、ユーザーへの事前通知なく、本サービスの内容（機能の追加・変更・削除を含む）を変更することができます。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>当社は、以下の場合に事前通知なく本サービスの全部または一部を中断することができます。
                <ul className="mt-2 ml-4 space-y-1 text-sm">
                  <li>• システムの保守・点検・更新を行う場合</li>
                  <li>• 天災、停電、通信障害、サイバー攻撃等により提供が困難な場合</li>
                  <li>• 第三者サービス（Google、Stripe等）の障害・仕様変更による場合</li>
                  <li>• セキュリティ上の緊急対応が必要な場合</li>
                  <li>• その他、当社が必要と判断した場合</li>
                </ul>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
              <span>当社は、1ヶ月前の通知をもって、本サービスの全部または一部を終了することができます。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">4</span>
              <span>前各項に基づくサービスの変更・中断・終了について、当社はユーザーに対して一切の責任を負いません。</span>
            </li>
          </ol>
        </TermsSection>

        {/* 第8条 */}
        <TermsSection number={8} title="免責事項および責任制限" icon={AlertTriangle}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>当社は、本サービスがユーザーの特定の目的に適合すること、期待する機能・正確性・有用性を有すること、継続的に利用できること、不具合が生じないことを保証しません。本サービスは現状有姿で提供されます。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>当社は、本サービスの利用または利用不能によりユーザーに生じた損害について、当社の故意または重過失による場合を除き、一切の責任を負いません。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
              <span>当社がユーザーに対して損害賠償責任を負う場合であっても、賠償額は金1万円または当該ユーザーが過去12ヶ月間に当社に支払った利用料金の総額のいずれか高い方を上限とします。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">4</span>
              <span>当社は、間接損害、特別損害、付随的損害、派生的損害、逸失利益、データの喪失、業務の中断、その他の経済的損失について、その予見可能性の有無にかかわらず、一切の責任を負いません。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">5</span>
              <span>本サービスが利用する第三者のサービス（Google、Stripe等）に起因する障害・損害について、当社は一切の責任を負いません。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">6</span>
              <span>ユーザー間またはユーザーと第三者との間で生じた紛争について、当社は一切の責任を負いません。</span>
            </li>
          </ol>
        </TermsSection>

        {/* 第9条 */}
        <TermsSection number={9} title="契約解除" icon={XCircle}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>ユーザーは、当社所定の方法により、いつでも利用契約を解除することができます。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>当社は、ユーザーが以下のいずれかに該当する場合、事前の通知なく利用契約を解除することがあります。
                <ul className="mt-2 ml-4 space-y-1 text-sm">
                  <li>• 本規約に違反した場合</li>
                  <li>• 利用料金の支払いを怠った場合</li>
                  <li>• 登録情報に虚偽があった場合</li>
                  <li>• 反社会的勢力に該当することが判明した場合</li>
                  <li>• その他、当社がサービスの利用を適当でないと判断した場合</li>
                </ul>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
              <span>契約解除後、ユーザーのデータは30日間保持された後、完全に削除されます。</span>
            </li>
          </ol>
        </TermsSection>

        {/* 第10条 */}
        <TermsSection number={10} title="補償" icon={Shield}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>ユーザーは、本規約に違反したことにより、または本サービスの利用に関連して、当社に損害（弁護士費用を含む）を与えた場合、当社に対してその全額を賠償するものとします。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>ユーザーの行為により第三者から当社に対してクレーム、請求、訴訟等がなされた場合、ユーザーは自己の責任と費用でこれを解決し、当社を防御し、当社に生じた損害を賠償するものとします。</span>
            </li>
          </ol>
        </TermsSection>

        {/* 第11条 */}
        <TermsSection number={11} title="譲渡" icon={RefreshCw}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>ユーザーは、当社の書面による事前の同意なく、本契約上の地位または本契約に基づく権利義務の全部または一部を第三者に譲渡し、承継させ、または担保に供してはなりません。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>当社は、本サービスに関する事業を第三者に譲渡した場合、当該譲渡に伴い、本契約上の地位、権利義務およびユーザー情報を当該第三者に譲渡することができるものとし、ユーザーはあらかじめこれに同意するものとします。</span>
            </li>
          </ol>
        </TermsSection>

        {/* 第12条 */}
        <TermsSection number={12} title="権利不放棄" icon={Scale}>
          <p className="text-slate-700">
            当社が本規約に基づく権利を行使しない場合、または行使が遅延した場合でも、当該権利を放棄したものとはみなされません。また、当社が権利の一部を行使した場合でも、その他の権利の行使を妨げるものではありません。
          </p>
        </TermsSection>

        {/* 第13条 */}
        <TermsSection number={13} title="可分性" icon={Scale}>
          <p className="text-slate-700">
            本規約のいずれかの条項が無効または執行不能と判断された場合でも、その他の条項は引き続き完全に有効であり、無効または執行不能とされた条項は、その趣旨に最も近い有効な条項に置き換えられるものとします。
          </p>
        </TermsSection>

        {/* 第14条 */}
        <TermsSection number={14} title="完全合意" icon={FileText}>
          <p className="text-slate-700">
            本規約は、本サービスの利用に関する当社とユーザーとの間の完全な合意を構成し、本規約の締結以前になされた書面または口頭によるすべての合意、表明、了解に優先します。
          </p>
        </TermsSection>

        {/* 第15条 */}
        <TermsSection number={15} title="存続条項" icon={Shield}>
          <p className="text-slate-700">
            本契約が終了した場合でも、第6条（コンテンツの取り扱い）、第8条（免責事項および責任制限）、第10条（補償）、第11条（譲渡）、第17条（準拠法・管轄裁判所）およびその性質上存続すべき条項は、引き続き有効に存続するものとします。
          </p>
        </TermsSection>

        {/* 第16条 */}
        <TermsSection number={16} title="規約の変更" icon={RefreshCw}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>当社は、当社の裁量により、いつでも本規約を変更することができます。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>規約を変更する場合、変更後の規約の効力発生日の7日前までに、本サービス上またはメールで通知します。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
              <span>変更後の規約の効力発生日以降に本サービスを利用した場合、変更後の規約に同意したものとみなします。変更に同意しない場合、ユーザーは効力発生日前に本サービスの利用を終了してください。</span>
            </li>
          </ol>
        </TermsSection>

        {/* 第17条 */}
        <TermsSection number={17} title="準拠法・管轄裁判所" icon={Gavel}>
          <ol className="space-y-3 text-slate-700">
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
              <span>本規約の解釈にあたっては、日本法を準拠法とします。</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-indigo-100 text-indigo-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
              <span>本サービスに関して紛争が生じた場合、東京地方裁判所を第一審の専属的合意管轄裁判所とします。</span>
            </li>
          </ol>
        </TermsSection>

        {/* 第18条 */}
        <TermsSection number={18} title="お問い合わせ" icon={Mail}>
          <p className="text-slate-700 mb-4">
            本規約に関するお問い合わせは、以下の窓口までご連絡ください。
          </p>
          <div className="bg-slate-100 rounded-lg p-6">
            <div className="space-y-2 text-slate-700">
              <p><span className="font-semibold">会社名:</span> Archi-Prisma Design works株式会社</p>
              <p><span className="font-semibold">メール:</span> compass@archi-prisma.co.jp</p>
              <p><span className="font-semibold">住所:</span> 〒141-0021 東京都品川区上大崎2-6-7 SMA白金長者丸301</p>
            </div>
          </div>
        </TermsSection>

        {/* フッター */}
        <div className="text-center text-sm text-slate-500 pb-8">
          <p>制定日: 2025年1月11日</p>
          <p className="mt-1">Archi-Prisma Design works株式会社</p>
        </div>
      </div>
    </div>
  );
}

// セクションコンポーネント
function TermsSection({
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
        <div className="rounded-lg bg-indigo-100 p-2">
          <Icon className="h-5 w-5 text-indigo-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          第{number}条 {title}
        </h2>
      </div>
      <div className="pl-0 md:pl-12">{children}</div>
    </section>
  );
}

// 定義項目コンポーネント
function DefinitionItem({ term, definition }: { term: string; definition: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <span className="font-semibold text-indigo-700">「{term}」</span>
      <span className="text-slate-700 ml-2">{definition}</span>
    </div>
  );
}

// 禁止事項コンポーネント
function ProhibitedItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-slate-700">
      <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}
