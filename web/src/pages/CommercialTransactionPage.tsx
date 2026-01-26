// 特定商取引法に基づく表示ページ

import React from 'react';
import {
  Store,
  Building2,
  User,
  MapPin,
  Phone,
  Mail,
  Globe,
  CreditCard,
  Truck,
  RotateCcw,
  AlertCircle,
  Clock,
  Banknote,
} from 'lucide-react';

export function CommercialTransactionPage() {
  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 rounded-2xl p-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <Store className="h-8 w-8" />
            <h1 className="text-3xl font-bold">特定商取引法に基づく表示</h1>
          </div>
          <p className="text-emerald-200">特定商取引に関する法律に基づく表記</p>
          <p className="text-sm text-emerald-300 mt-2">最終更新日: 2026年1月26日</p>
        </div>

        {/* 事業者情報 */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">事業者情報</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            <InfoRow icon={Building2} label="販売業者" value="Archi-Prisma Design works株式会社" />
            <InfoRow icon={User} label="代表者" value="櫻本聖成" />
            <InfoRow icon={MapPin} label="所在地" value="〒141-0021 東京都品川区上大崎2-6-7 SMA白金長者丸301" />
            <InfoRow icon={Phone} label="電話番号" value="090-8205-9171（平日 10:00〜18:00）" />
            <InfoRow icon={Mail} label="メールアドレス" value="compass@archi-prisma.co.jp" />
            <InfoRow icon={Globe} label="URL" value="https://compass.archi-prisma.co.jp" />
          </div>
        </section>

        {/* 販売価格 */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">販売価格</h2>
            </div>
          </div>
          <div className="p-6">
            <p className="text-slate-700 mb-4">
              表示価格はすべて税込みです。
            </p>

            <div className="space-y-4">
              {/* AI×建築サークル会員 */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold text-emerald-900">AI×建築サークル 会員</h3>
                  <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">おすすめ</span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold text-emerald-700">¥5,000</span>
                  <span className="text-slate-600">/月（税込）</span>
                </div>
                <div className="mt-3 bg-white/60 rounded-lg p-3">
                  <p className="text-emerald-800 font-medium">
                    Compass 無料でご利用いただけます
                  </p>
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  AIと建築に関するコミュニティへの参加、各種勉強会・イベントへのアクセス、およびCompassの全機能が含まれます。
                </p>
              </div>

              {/* 会員以外 */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="font-bold text-slate-900 mb-2">一般利用（サークル会員以外）</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-700">¥1,000</span>
                  <span className="text-slate-600">/人・月（税込）</span>
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  AI×建築サークルに入会せずにCompassのみをご利用いただく場合の料金です。
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-500 mt-4">
              ※ 料金は予告なく変更される場合があります。変更の際は事前にお知らせいたします。
            </p>
          </div>
        </section>

        {/* 商品代金以外の必要料金 */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">商品代金以外の必要料金</h2>
            </div>
          </div>
          <div className="p-6">
            <ul className="space-y-2 text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span>インターネット接続に必要な通信費用はお客様のご負担となります。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span>クレジットカード決済の場合、カード会社所定の手数料が発生する場合があります。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span>銀行振込の場合、振込手数料はお客様のご負担となります。</span>
              </li>
            </ul>
          </div>
        </section>

        {/* 支払方法・支払時期 */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">支払方法・支払時期</h2>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">お支払い方法</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <h4 className="font-medium text-slate-900 mb-2">クレジットカード</h4>
                  <p className="text-sm text-slate-600">VISA / Mastercard / American Express / JCB / Diners Club</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <h4 className="font-medium text-slate-900 mb-2">銀行振込</h4>
                  <p className="text-sm text-slate-600">法人契約の場合は請求書払い可（要相談）</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-3">お支払い時期</h3>
              <ul className="space-y-2 text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span><strong>AI×建築サークル会費:</strong> 毎月の契約更新日にクレジットカードより自動引き落とし</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span><strong>一般利用料:</strong> 毎月の契約更新日にクレジットカードより自動引き落とし</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 役務の提供時期 */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">役務の提供時期</h2>
            </div>
          </div>
          <div className="p-6">
            <ul className="space-y-2 text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span>お申し込みおよびお支払い手続き完了後、直ちにサービスをご利用いただけます。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span>銀行振込の場合は、入金確認後にサービスが有効化されます（通常1〜3営業日）。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span>サービスは24時間365日ご利用いただけます（システムメンテナンス時を除く）。</span>
              </li>
            </ul>
          </div>
        </section>

        {/* キャンセル・返金ポリシー */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">キャンセル・返金ポリシー</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-amber-900 mb-1">原則として返金不可</h4>
                  <p className="text-sm text-amber-800">
                    デジタルサービスの性質上、一度お支払いいただいた料金は原則として返金いたしません。
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-3">キャンセルについて</h3>
              <ul className="space-y-2 text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>有料プランのキャンセル（解約）は、設定画面よりいつでも行えます。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>キャンセル後も、支払い済み期間の終了まではサービスをご利用いただけます。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>解約手続き完了後、自動更新は停止され、次回以降の請求は発生しません。</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-3">例外的な返金</h3>
              <ul className="space-y-2 text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>当社の責めに帰すべき事由によりサービスが提供できなかった場合</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>二重課金等、明らかな請求エラーが発生した場合</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 mt-1">•</span>
                  <span>法令に基づき返金が必要な場合</span>
                </li>
              </ul>
              <p className="text-sm text-slate-500 mt-3">
                上記に該当する場合は、カスタマーサポートまでお問い合わせください。
              </p>
            </div>
          </div>
        </section>

        {/* 動作環境 */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">動作環境</h2>
            </div>
          </div>
          <div className="p-6">
            <p className="text-slate-700 mb-4">
              本サービスは、以下の環境でご利用いただけます。
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-medium text-slate-900 mb-2">対応ブラウザ</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li>• Google Chrome（最新版）</li>
                  <li>• Mozilla Firefox（最新版）</li>
                  <li>• Microsoft Edge（最新版）</li>
                  <li>• Safari（最新版）</li>
                </ul>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-medium text-slate-900 mb-2">推奨環境</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li>• インターネット接続環境</li>
                  <li>• JavaScript有効</li>
                  <li>• Cookie有効</li>
                  <li>• 画面解像度 1280×720以上</li>
                </ul>
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-3">
              ※ Internet Explorer は非対応です。古いバージョンのブラウザでは正常に動作しない場合があります。
            </p>
          </div>
        </section>

        {/* サポート */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">サポート体制</h2>
            </div>
          </div>
          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-medium text-slate-900 mb-2">メールサポート</h4>
                <p className="text-sm text-slate-600 mb-1">compass@archi-prisma.co.jp</p>
                <p className="text-sm text-slate-500">24時間受付（回答は営業時間内）</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-medium text-slate-900 mb-2">営業時間</h4>
                <p className="text-sm text-slate-600 mb-1">平日 10:00〜18:00</p>
                <p className="text-sm text-slate-500">土日祝・年末年始を除く</p>
              </div>
            </div>
          </div>
        </section>

        {/* お問い合わせ */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">お問い合わせ先</h2>
            </div>
          </div>
          <div className="p-6">
            <div className="bg-slate-100 rounded-lg p-6">
              <div className="space-y-2 text-slate-700">
                <p><span className="font-semibold">会社名:</span> Archi-Prisma Design works株式会社</p>
                <p><span className="font-semibold">担当部署:</span> カスタマーサポート</p>
                <p><span className="font-semibold">メール:</span> compass@archi-prisma.co.jp</p>
                <p><span className="font-semibold">電話:</span> 090-8205-9171（平日 10:00〜18:00）</p>
                <p><span className="font-semibold">住所:</span> 〒141-0021 東京都品川区上大崎2-6-7 SMA白金長者丸301</p>
              </div>
            </div>
          </div>
        </section>

        {/* フッター */}
        <div className="text-center text-sm text-slate-500 pb-8">
          <p>制定日: 2026年1月26日</p>
          <p className="mt-1">Archi-Prisma Design works株式会社</p>
        </div>
      </div>
    </div>
  );
}

// 情報行コンポーネント
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start px-6 py-4">
      <div className="flex items-center gap-2 w-40 flex-shrink-0">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <span className="text-slate-900">{value}</span>
    </div>
  );
}
