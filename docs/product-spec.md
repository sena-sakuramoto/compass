# Compass & AI×建築サークル プロダクト仕様

## 0. 現状のシステム

### 認証
- Firebase Auth（Google認証 + メール認証）
- トークンはキャッシュ済み（`authToken.ts`）

### 組織管理
- Firestore `orgs/{orgId}` で管理
- プラン別にメンバー上限あり（Starter=5人、Business=30人）

### 課金（Stripe連携）
- `org_billing`: 組織ごとの課金状態
- `stripe_customers`: Stripeから自動同期される顧客情報（メールアドレスあり）
- `subscriptionStatus`: `active` / `trialing` / `canceled` など

### 現状の判定フロー
```
サークル（Stripe課金）
    ↓
stripe_customers に同期
    ↓
Compassが subscriptionStatus を見て判定 → 使える
```

**つまり**: サークル会員 = Compass使える（既に連携済み）

---

## 1. 商品構成

### 現状
| 商品 | 状態 |
|-----|------|
| AI×建築サークル | Stripe課金中 → Compass利用可 |
| Compass単独サブスク | **実装済み（checkout.ts）** |

### 目標
| 商品 | Compass利用 | 備考 |
|-----|------------|------|
| AI×建築サークル | 3席込み | 既存の仕組みを維持 |
| Compass単独サブスク | 購入席数分 | **実装済み** |
| 両方 | 3席 + 追加分 | 併用可能 |

### 料金
- **Compass単独**: 1席 = ¥1,000/月
- **サークル**: 既存料金（3席込み）
- **追加席**: +¥1,000/席（どちらも共通）

---

## 2. 体験フロー

### A. デモ（操作確認）
| 項目 | 現状 | 目標 |
|-----|------|------|
| ログイン | 不要（実装済み: 2026-01-21） | 不要（達成） |
| データ保存 | なし（リロードで消える） | 維持 |
| 制限 | なし（全機能触れる） | 維持 |

### B. 14日トライアル（実運用）
| 項目 | 内容 |
|-----|------|
| 目的 | 実データで試す |
| ログイン | **必要**（組織作成も必要） |
| データ保存 | あり |
| 終了後 | **閲覧のみ可能**（編集不可・実装済み: 2026-01-24） |
| データ保管 | **30日間**（規定通り） |
| 自動課金 | **なし**（誘導のみ） |

### C. トライアル終了時の導線
※ 閲覧のみモードは実装済み（2026-01-24）。
```
トライアル終了
    ↓
ログイン時にモーダル表示
    ↓
┌─────────────────────────────────────┐
│  トライアルが終了しました           │
│                                     │
│  引き続きご利用いただくには:        │
│                                     │
│  [サークルに入会する]               │
│   → 3席込み + 学び・コミュニティ    │
│   → Discordコミュニティ             │
│                                     │
│  [Compassサブスクを開始]            │
│   → 1席¥1,000/月〜                  │
│                                     │
│  ※データは30日間保管されます       │
│  ※閲覧のみ可能です                 │
└─────────────────────────────────────┘
```

---

## 3. 席数ルール

### 3-1. 基本ルール
- 各組織に `seatLimit`（契約席数）がある
- アクティブユーザー数が `seatLimit` を超えられない
- 超えそうになったら追加席の導線を表示

### 3-2. 席数の決まり方

| パターン | seatLimit | seatSource |
|---------|-----------|------------|
| トライアル中 | 無制限（or 5席） | `trial` |
| サークル会員 | 3席 | `circle` |
| Compass単独 | 購入席数 | `subscription` |
| サークル + 追加席 | 3 + 追加分 | `circle` |

### 3-3. サークル特典（組織単位で3席固定）

**ルール**:
- 組織内にサークル会員が1人でもいれば3席
- 会員が複数いても3席のまま（増殖しない）
- 4席目以降は追加課金（¥1,000/席）

**理由**:
1. 判定ロジックがシンプル
2. 「席を増やしたい=追加課金」という導線が明確
3. サークルは「学び」が価値、席数で釣らない

### 3-4. サークル解約時

| タイミング | 挙動 |
|-----------|------|
| 解約7日前 | メール通知 |
| 解約日 | 閲覧のみモードに移行 |
| 解約後30日 | データ削除 |

---

## 4. データ構造

### 現状（org_billing）
```typescript
interface OrgBillingDoc {
  planType: 'stripe' | 'enterprise_manual' | 'special_admin' | 'inactive';
  stripeCustomerId?: string;
  subscriptionStatus?: string;  // 'active', 'trialing', 'canceled'
  subscriptionCurrentPeriodEnd?: number;
  entitled?: boolean;
}
```

### 追加フィールド（実装状況）
```typescript
interface OrgBillingDoc {
  // ...既存フィールド

  // 席数管理（実装済み: billing.ts）
  seatLimit?: number | null;           // 契約席数（Stripeのquantityから同期、またはサークル特典）
  isCircleMember?: boolean | null;     // サークル会員かどうか
  circleBaseSeats?: number | null;     // サークル特典の基本席数（デフォルト3）
  additionalSeats?: number | null;     // 追加購入席数（Stripeのquantity）
}

// 席数情報取得（実装済み: member-limits.ts）
interface SeatInfo {
  seatLimit: number | null;
  isCircleMember: boolean;
  circleBaseSeats: number;
  additionalSeats: number;
  source: 'explicit' | 'circle' | 'stripe' | 'plan_default';  // ※仕様のseatSourceに相当
}

// トライアル管理
// - readOnlyMode: BillingAccessResultに含む（実装済み）
// - trialEndsAt: 未実装（Stripeのtrial_endで代用中）
```

---

## 5. 席数超過時のUI

### 招待しようとした時
```
┌─────────────────────────────────────┐
│  席数の上限に達しています           │
│                                     │
│  現在: 3席中 3席使用中              │
│                                     │
│  [+1席追加する（¥1,000/月）]        │
│   → Stripeポータルへ                │
│                                     │
│  [キャンセル]                       │
└─────────────────────────────────────┘
```

---

## 6. LP構成

### Compass LP（主役）
1. Compassの価値（プロジェクト/タスク管理の見える化）
2. デモを触る（ログイン不要）
3. 14日トライアル開始（組織作成）
4. 価格（1席¥1,000、シンプル）
5. サークルは補助リンク（「学びたい方はこちら」程度）

### サークル LP（補助）
1. サークルの価値（学び・コミュニティ・Discord）
2. 特典: Compass 3席込み
3. 4席目以降は追加可能

---

## 7. 実装優先順位

| 順位 | 項目 | 内容 | 状態 |
|-----|------|------|------|
| 1 | Compass単独サブスク（Stripe） | 新プロダクト追加 | **実装済み**: checkout.ts（/api/public/checkout） |
| 2 | 席数管理の基盤 | `seatLimit` + 超過判定 | **実装済み**: billing.ts, member-limits.ts |
| 3 | 超過時のUI | 招待ブロック + 追加ボタン | **実装済み**: UserManagement.tsx, OrgMemberInvitationModal.tsx |
| 4 | トライアル終了モーダル | サークル or サブスク誘導 | **実装済み**: 2026-01-24 |
| 5 | 閲覧のみモード | トライアル/解約後の制限 | **実装済み**: 2026-01-24 |
| 6 | デモのログイン不要化 | 現在のデモモード改修 | **実装済み**: 2026-01-21 |
| 7 | LP改修 | 導線整理 | 未着手 |

---

## 8. まとめ

### 現状
- サークル会員 → Compass使える（Stripe連携済み）

### 追加したいこと
- LP改修（導線整理）

### 変更点
| 項目 | 現状 | 目標 |
|-----|------|------|
| デモ | ログイン不要（実装済み: 2026-01-21） | ログイン不要 |
| トライアル終了 | 閲覧のみ + 誘導モーダル（実装済み: 2026-01-24） | 閲覧のみ + 誘導モーダル |
| 自動課金 | なし（誘導のみ）※仕様通り | なし（誘導のみ） |
| 席数管理 | `seatLimit`で明示管理（実装済み: billing.ts, member-limits.ts） | `seatLimit` で明示管理 |
| Compass単独購入 | **実装済み**: checkout.ts（デプロイ待ち） | 可能（1席¥1,000〜） |

---

## 9. 実装状況の同期（2026-01-26）

### 更新済み
| 項目 | 更新前 | 更新後 |
|------|--------|--------|
| Compass単独サブスク | 未実装 | 実装済み（checkout.ts） |
| 席数管理の基盤 | 未実装 | 実装済み（billing.ts, member-limits.ts） |
| 超過時のUI | 未実装 | **実装済み**（UserManagement.tsx, OrgMemberInvitationModal.tsx） |
| データ構造 | 仕様のみ | 実装済みコードを反映 |

### 残りの未実装/要確認
| 項目 | 状態 |
|------|------|
| trialEndsAt フィールド | 未実装（Stripeのtrial_endで代用中） |
| LP改修 | 未着手 |
| checkout.tsのデプロイ | 未デプロイ（git statusで変更中） |
