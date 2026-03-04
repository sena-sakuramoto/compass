# CODEX_COMPASS_AI_BILLING.md

## 目的

CompassのAI機能（bulk-import AI解析、AI工程生成等）に対するティア別月間利用上限を実装する。

方針: **ベース料金にAI利用を含む**（制限付き）。利用を躊躇させるとツールの価値が下がるため。

## 背景

現状: AI利用（bulk-import）は全ユーザー共通で10回/日/ユーザーの制限。
課題: ティアごとの差別化がない。サークル会員と有料ティアで同じ制限。

### ティア別AI利用上限

| ティア | 月間AI上限 | 日次上限 |
|---|---|---|
| Small（〜5名 ¥5,000/月） | 30回/月 | 10回/日 |
| Standard（〜15名 ¥15,000/月） | 100回/月 | 10回/日 |
| Business（〜40名 ¥35,000/月） | 300回/月 | 10回/日 |
| Enterprise | 無制限 | 10回/日 |
| サークル会員 | 30回/月 | 10回/日 |
| トライアル中 | 10回/月 | 5回/日 |

**注意:** 日次上限は既存の仕組み（`checkRateLimit`）を維持。月間上限を新たに追加。

## 変更対象ファイル

### バックエンド

1. `functions/src/api/bulk-import.ts` — 月間レート制限チェックを追加
2. `functions/src/lib/billing.ts` — AI利用上限の取得ヘルパー追加
3. `functions/src/lib/auth-types.ts` — `PLAN_LIMITS` にAI上限を追加

### フロントエンド

4. `web/src/components/BulkImportModal.tsx` — 残り回数の表示UI

## 実装手順

### Step 1: PLAN_LIMITS にAI上限を追加

`functions/src/lib/auth-types.ts` の `PLAN_LIMITS` を拡張:

```typescript
export const PLAN_LIMITS = {
  small: {
    price: 5000,
    members: 5,
    aiMonthly: 30,   // 月間AI利用上限
    aiDaily: 10,     // 日次AI利用上限
  },
  standard: {
    price: 15000,
    members: 15,
    aiMonthly: 100,
    aiDaily: 10,
  },
  business: {
    price: 35000,
    members: 40,
    aiMonthly: 300,
    aiDaily: 10,
  },
  enterprise: {
    price: null,
    members: 999999,
    aiMonthly: 999999, // 実質無制限
    aiDaily: 10,
  },
} as const;
```

### Step 2: 月間利用カウントのFirestoreスキーマ

既存の日次カウント: `orgs/{orgId}/bulk-import-usage/{uid}` → `{ date, count }`

月間カウントを追加: `orgs/{orgId}/ai-usage-monthly/{YYYY-MM}` → `{ count, updatedAt }`

**組織単位で月間合計をカウントする**（個人単位ではなく）。
理由: 料金はティア=組織単位。組織全体のAI利用量を管理する。

### Step 3: 月間レート制限チェック関数

`functions/src/api/bulk-import.ts` に追加:

```typescript
async function checkMonthlyLimit(orgId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  // 組織のティアを取得
  const billingDoc = await db.collection('org_billing').doc(orgId).get();
  const billing = billingDoc.data() as OrgBillingDoc | undefined;

  // ティアの判定
  let monthlyLimit: number;
  if (!billing || billing.planType === 'inactive') {
    monthlyLimit = 10; // トライアル
  } else if (billing.isCircleMember) {
    monthlyLimit = 30; // サークル会員
  } else if (billing.planType === 'enterprise_manual' || billing.planType === 'special_admin') {
    monthlyLimit = 999999; // 無制限
  } else {
    // Stripe課金ユーザー: seatLimitからティアを推定
    const seatLimit = billing.seatLimit || 5;
    if (seatLimit <= 5) monthlyLimit = 30;
    else if (seatLimit <= 15) monthlyLimit = 100;
    else if (seatLimit <= 40) monthlyLimit = 300;
    else monthlyLimit = 999999;
  }

  // 今月の利用回数を取得
  const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const ref = db.collection('orgs').doc(orgId).collection('ai-usage-monthly').doc(yearMonth);
  const doc = await ref.get();
  const used = doc.exists ? (doc.data()?.count || 0) : 0;

  if (used >= monthlyLimit) {
    return { allowed: false, used, limit: monthlyLimit };
  }

  // カウントをインクリメント
  if (doc.exists) {
    await ref.update({ count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  } else {
    await ref.set({ count: 1, updatedAt: FieldValue.serverTimestamp() });
  }

  return { allowed: true, used: used + 1, limit: monthlyLimit };
}
```

`OrgBillingDoc` は `functions/src/lib/billing.ts` からインポート。

### Step 4: bulk-import.ts の既存エンドポイントに月間チェック追加

既存の `/bulk-import/parse` と `/bulk-import/parse-file` の `checkRateLimit` の後に `checkMonthlyLimit` を追加:

```typescript
// 日次レート制限（既存）
const rateCheck = await checkRateLimit(uid, userOrgId);
if (!rateCheck.allowed) {
  res.status(429).json({ error: `本日の利用上限（${DAILY_PARSE_LIMIT}回/日）に達しました。` });
  return;
}

// 月間レート制限（新規追加）
const monthlyCheck = await checkMonthlyLimit(userOrgId);
if (!monthlyCheck.allowed) {
  res.status(429).json({
    error: `今月のAI利用上限（${monthlyCheck.limit}回/月）に達しました。プランのアップグレードをご検討ください。`,
    monthlyUsed: monthlyCheck.used,
    monthlyLimit: monthlyCheck.limit,
  });
  return;
}
```

レスポンスにも月間情報を追加:

```typescript
res.json({
  items: data.items,
  warnings: data.warnings,
  remaining: rateCheck.remaining,
  monthlyUsed: monthlyCheck.used,
  monthlyLimit: monthlyCheck.limit,
});
```

### Step 5: フロントエンドに残り回数表示

`web/src/components/BulkImportModal.tsx` に月間利用状況を表示:

```tsx
{monthlyUsed !== undefined && monthlyLimit !== undefined && (
  <p className="text-xs text-slate-400 mt-2">
    AI利用: {monthlyUsed}/{monthlyLimit}回（今月）
  </p>
)}
```

パースレスポンスの型を更新（`web/src/lib/types.ts`）:

```typescript
export interface BulkImportParseResponse {
  items: ParsedItem[];
  warnings: string[];
  remaining?: number;
  monthlyUsed?: number;   // 追加
  monthlyLimit?: number;  // 追加
}
```

### Step 6: エラーハンドリング（429レスポンス）

BulkImportModal で429エラーをキャッチした場合、月間上限超過のメッセージを表示:

```tsx
} catch (err: any) {
  if (err.status === 429 && err.monthlyLimit) {
    toast.error(`今月のAI利用上限（${err.monthlyLimit}回）に達しました`);
  } else {
    toast.error(err.message || 'AI解析に失敗しました');
  }
}
```

## 完了条件

1. `pnpm --filter functions build` が成功する
2. `pnpm --filter web build` が成功する
3. 月間AI利用回数がFirestoreの `orgs/{orgId}/ai-usage-monthly/{YYYY-MM}` に記録される
4. ティアに応じた月間上限が適用される
5. 月間上限超過時に適切なエラーメッセージが表示される
6. 既存の日次レート制限（10回/日）はそのまま維持される
7. BulkImportModal に月間利用状況が表示される
8. 新しいパッケージのインストールは不要

## やらないこと

- 管理画面での利用統計ダッシュボード（将来検討）
- 超過時の追加購入フロー（将来検討）
- 個人別の月間制限（組織単位のみ）
- テストファイルの作成
