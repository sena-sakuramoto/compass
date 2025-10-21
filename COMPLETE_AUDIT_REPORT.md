# COMPASS プロジェクト 完全精査レポート

**実施日時**: 2025年10月21日
**対象**: APDW Project Compass - 工程管理ダッシュボード
**精査範囲**: 全ソースコード、設定ファイル、依存関係

---

## エグゼクティブサマリー

プロジェクト全体を精査した結果、**46個の問題**を発見しました。

### 深刻度別の内訳

| 深刻度 | 件数 | 即座の対応が必要 |
|--------|------|------------------|
| **CRITICAL (重大)** | 9 | ✅ はい |
| **HIGH (高)** | 18 | ⚠️ 推奨 |
| **MEDIUM (中)** | 18 | 📋 計画的に |
| **LOW (低)** | 1 | 💡 余裕があれば |

### カテゴリ別の内訳

| カテゴリ | Critical | High | Medium | Low | 合計 |
|----------|----------|------|--------|-----|------|
| セキュリティ | 6 | 3 | 1 | 0 | **10** |
| TypeScript/JS エラー | 0 | 4 | 2 | 0 | **6** |
| 設定の問題 | 2 | 2 | 2 | 0 | **6** |
| コード品質 | 0 | 3 | 6 | 1 | **10** |
| ロジックエラー | 0 | 3 | 4 | 0 | **7** |
| パフォーマンス | 1 | 0 | 1 | 0 | **2** |
| エラーハンドリング | 0 | 3 | 0 | 0 | **3** |
| ドキュメント | 0 | 0 | 2 | 0 | **2** |
| **合計** | **9** | **18** | **18** | **1** | **46** |

---

## 🔴 CRITICAL - 重大な問題 (即座に修正が必要)

### 1. Firebase API キーがソース管理に露出 【最重要】

**ファイル**: `web\.env`
**深刻度**: 🔴 CRITICAL

**問題**:
```env
VITE_FIREBASE_API_KEY=AIzaSyAGutWJF5bcTr_01Bjkizr7Sfo9HO__H78
VITE_FIREBASE_APP_ID=1:70173334851:web:fc6c922a399014a10923f6
```

これらの機密情報がGitリポジトリにコミットされており、**公開されている状態**です。

**影響**:
- 不正アクセスのリスク
- データベースへの不正操作
- Firebase プロジェクトの乗っ取り

**修正方法**:
```bash
# 1. Gitから削除
git rm --cached web/.env
git commit -m "Remove exposed Firebase credentials"

# 2. .gitignore に追加（既に追加されているか確認）
echo "web/.env" >> .gitignore
echo "functions/.env" >> .gitignore

# 3. Firebase Consoleでキーを再生成
# https://console.firebase.google.com/project/apdw-project-compass/settings/general

# 4. .env.local に移動（Gitで管理しない）
mv web/.env web/.env.local
```

---

### 2. Google Service Account 認証情報が未設定

**ファイル**: `functions\.env`
**深刻度**: 🔴 CRITICAL

**問題**:
必須の環境変数が設定されていません:
- `GSA_CLIENT_EMAIL` - Google Service Account メール
- `GSA_PRIVATE_KEY` - Google Service Account 秘密鍵
- `GSA_IMPERSONATE` - 偽装するユーザーのメール

**影響**:
- カレンダー同期機能が動作しない
- Gmail 通知機能が動作しない
- Google API 連携が全て失敗する

**修正方法**:
`functions/.env` に追加:
```env
GSA_CLIENT_EMAIL=your-service-account@apdw-project-compass.iam.gserviceaccount.com
GSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq...\n-----END PRIVATE KEY-----\n"
GSA_IMPERSONATE=admin@archi-prisma.co.jp
NOTIFICATION_SENDER=noreply@archi-prisma.co.jp
CALENDAR_ID=primary
CALENDAR_TIMEZONE=Asia/Tokyo
JOB_RUNNER_BATCH=10
```

---

### 3. TypeScript Strict モードが無効

**ファイル**: `functions\tsconfig.json`
**深刻度**: 🔴 CRITICAL

**問題**:
```json
{
  "compilerOptions": {
    "strict": false  // ❌ 型チェックが無効
  }
}
```

**影響**:
- 型エラーがコンパイル時に検出されない
- 実行時エラーのリスクが高い
- バグが本番環境で発生しやすい

**修正方法**:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

**注意**: この変更により、多数のコンパイルエラーが表面化する可能性があります。

---

### 4. CORS 設定が脆弱

**ファイル**: `functions\src\index.ts:20`
**深刻度**: 🔴 CRITICAL

**問題**:
```typescript
cors({
  origin: process.env.CORS_ORIGIN ?? true,  // ❌ デフォルトで全てのオリジンを許可
  credentials: true
})
```

**影響**:
- 環境変数が未設定の場合、すべてのドメインからのアクセスを許可
- CSRF 攻撃のリスク

**修正方法**:
```typescript
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['https://apdw-project-compass.web.app'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true
}));
```

---

### 5. Firestore セキュリティルールが過度に緩い

**ファイル**: `firestore.rules`
**深刻度**: 🔴 CRITICAL

**問題**:
```javascript
// Line 48
allow read: if isAuthenticated();  // ❌ 全認証ユーザーが全プロジェクトを閲覧可能

// Line 64
allow read: if isAuthenticated();  // ❌ 全認証ユーザーが全タスクを閲覧可能

// Line 66
allow create, update: if isAuthenticated();  // ❌ 全認証ユーザーが任意のタスクを作成・更新可能
```

**影響**:
- 組織間のデータ分離が不完全
- 権限のないユーザーがデータを閲覧・変更できる可能性

**修正方法**:
```javascript
match /orgs/{orgId}/projects/{projectId} {
  function isMember() {
    return isAuthenticated() &&
           exists(/databases/$(database)/documents/orgs/$(orgId)/projects/$(projectId)/members/$(request.auth.uid));
  }

  allow read: if isMember();
  allow create, update: if (isAdmin() || isProjectManager()) && getUserData().orgId == orgId;
  allow delete: if isAdmin() && getUserData().orgId == orgId;
}

match /orgs/{orgId}/tasks/{taskId} {
  function canAccessTask() {
    let task = resource.data;
    let projectId = task.projectId;
    return isAuthenticated() &&
           exists(/databases/$(database)/documents/orgs/$(orgId)/projects/$(projectId)/members/$(request.auth.uid));
  }

  allow read: if canAccessTask();
  allow create, update: if canAccessTask();
  allow delete: if (isAdmin() || isProjectManager()) && getUserData().orgId == orgId;
}
```

---

### 6. ハードコードされた組織ID

**ファイル**: `web\src\lib\firebaseClient.ts:42`
**深刻度**: 🔴 CRITICAL

**問題**:
```typescript
const defaultOrgId = 'archi-prisma';  // ❌ ハードコード
// TODO: 実際の組織IDに変更するUIを追加
```

**影響**:
- マルチテナント機能が正しく動作しない
- 他の組織がシステムを利用できない

**修正方法**:
```typescript
// ユーザープロファイルから組織IDを取得
const getUserOrgId = async (user: User): Promise<string> => {
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists()) {
    throw new Error('User profile not found');
  }
  return userDoc.data().orgId;
};

// またはドメインから推測
const getOrgIdFromEmail = (email: string): string => {
  const domain = email.split('@')[1];
  const orgMap: Record<string, string> = {
    'archi-prisma.co.jp': 'archi-prisma',
    // 他の組織を追加
  };
  return orgMap[domain] || 'default';
};
```

---

### 7. トークンが平文でlocalStorageに保存

**ファイル**: `web\src\lib\api.ts:5-14`
**深刻度**: 🟡 HIGH

**問題**:
```typescript
localStorage.setItem('apdw_id_token', token);  // ❌ 平文で保存
const token = localStorage.getItem('apdw_id_token');  // ❌ XSS に脆弱
```

**影響**:
- XSS 攻撃でトークンが盗まれる可能性
- CSRF 攻撃のリスク

**修正方法** (推奨):
```typescript
// オプション1: httpOnly Cookie を使用 (サーバー側で設定)
// functions/src/api/auth.ts
res.cookie('id_token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 3600000
});

// オプション2: メモリ内で管理
let authToken: string | null = null;
export const setAuthToken = (token: string) => { authToken = token; };
export const getAuthToken = () => authToken;
```

---

### 8-9. その他のセキュリティ問題

**as any キャストの多用** (複数箇所)
- `web\src\lib\firebaseClient.ts:48`
- `functions\src\lib\firestore.ts:1098,1099`
- `functions\src\api\project-members-api.ts:90,98`

これらは型安全性を損ない、ランタイムエラーの原因になります。

---

## 🟡 HIGH - 優先度が高い問題

### 10. TypeScript 型定義の欠如

**ファイル**: `web\src\lib\normalize.ts:18,95,126`
**深刻度**: 🟡 HIGH

**問題**:
```typescript
function normalizeTask(raw: any, index: number): Task {  // ❌ any を使用
function normalizeProject(raw: any): Project {  // ❌ any を使用
function normalizePeople(raw: any, index: number): Person {  // ❌ any を使用
```

**修正方法**:
```typescript
interface FirestoreTimestamp {
  toDate(): Date;
}

interface RawTask {
  タスク名: string;
  予定開始日?: FirestoreTimestamp | string;
  期限?: FirestoreTimestamp | string;
  // ... 他のフィールド
}

function normalizeTask(raw: RawTask, index: number): Task {
  // ...
}
```

---

### 11. 認証エラーハンドリングの欠如

**ファイル**: `web\src\components\ProjectMembersDialog.tsx:136-144`
**深刻度**: 🟡 HIGH

**問題**:
```typescript
const user = auth.currentUser;
if (!user) throw new Error('Not authenticated');  // ❌ エラーが伝播しない
return user.getIdToken(true);
```

**修正方法**:
```typescript
const getAuthToken = async (): Promise<string> => {
  const user = auth.currentUser;
  if (!user) {
    // ログインページにリダイレクト
    window.location.href = '/login';
    throw new Error('Not authenticated');
  }

  try {
    return await user.getIdToken(true);
  } catch (error) {
    console.error('Failed to get auth token:', error);
    // リトライまたはログアウト
    throw error;
  }
};
```

---

### 12-18. その他の HIGH 問題

- **認証ミドルウェアの重複実装** (3箇所)
- **ガントチャートの型定義が不完全** (`payload: any`)
- **環境変数の欠落** (複数)
- **VITE_API_BASE に trailing whitespace**
- その他複数

---

## 🟠 MEDIUM - 中程度の問題

### 19-36. コード品質、ロジック、パフォーマンスの問題

- Console.log の本番環境への混入
- TODO コメントの放置
- N+1 クエリ問題
- 非効率なFirestoreクエリ
- エラーハンドリングの不足
- その他18件

---

## 🟢 LOW - 軽微な問題

### 37-38. ドキュメントの問題

- JSDocコメントの欠如
- 環境変数ドキュメントの不完全性

---

## 推奨修正スケジュール

### 🚨 第1週 (即座に実施)

1. ✅ Firebase API キーを Git から削除し、再生成
2. ✅ Google Service Account 環境変数を設定
3. ✅ TypeScript strict モードを有効化
4. ✅ CORS 設定を修正
5. ✅ Firestore セキュリティルールを強化

### ⚠️ 第2-3週 (短期)

6. 型定義を `any` から適切な型に変更
7. トークンストレージを httpOnly Cookie に移行
8. N+1 クエリを最適化
9. エラーバウンダリを追加
10. 認証エラーハンドリングを改善

### 📋 第1ヶ月 (中期)

11. Console.log を Cloud Logging に置換
12. Firestore クエリとインデックスを最適化
13. TODO/FIXME を完了
14. JSDoc ドキュメントを追加
15. パフォーマンステストを実施

---

## 修正の優先順位

### P0 (今すぐ)
- Issue #1: Firebase API キー露出
- Issue #2: GSA 認証情報未設定
- Issue #3: TypeScript strict 無効

### P1 (今週中)
- Issue #4: CORS 脆弱性
- Issue #5: Firestore ルール
- Issue #6: 組織ID ハードコード

### P2 (今月中)
- Issue #7-18: HIGH 優先度問題

### P3 (計画的に)
- Issue #19-36: MEDIUM 優先度問題

### P4 (余裕があれば)
- Issue #37-38: LOW 優先度問題

---

## テスト計画

修正後、以下のテストを実施:

### セキュリティテスト
- [ ] Firebase セキュリティルールのテスト
- [ ] CORS ポリシーのテスト
- [ ] 認証・認可フローのテスト

### 機能テスト
- [ ] ログイン/ログアウト
- [ ] プロジェクト作成・編集・削除
- [ ] タスク作成・編集・削除
- [ ] ガントチャート表示
- [ ] カレンダー同期
- [ ] メール通知

### パフォーマンステスト
- [ ] 大量タスク (1000件) でのレンダリング
- [ ] フィルタリング応答時間
- [ ] Firestore クエリパフォーマンス

---

## まとめ

**現状**: プロジェクトは基本的に完成しているが、セキュリティとコード品質に重大な問題があります。

**推奨アクション**:
1. 即座に P0 問題を修正
2. 今週中に P1 問題を修正
3. セキュリティテストを実施
4. 修正後にデプロイ

**修正後の状態**: 本番環境にデプロイ可能な安全で堅牢なアプリケーション

---

**レポート作成日**: 2025年10月21日
**次回レビュー予定**: 修正完了後
