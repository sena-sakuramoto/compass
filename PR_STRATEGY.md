# PR分割戦略

## 概要

大規模なリファクタリング（memberType廃止、guest概念削除、フィールド名英語化）を安全に本番環境に適用するため、以下の段階的なPR戦略を採用します。

---

## PR #1: 型定義の更新とユーティリティ追加 📝

**目的**: 新しい型定義を導入し、後方互換性を確保するユーティリティを追加

**変更ファイル**:
- `functions/src/lib/auth-types.ts` - 新しい型定義
- `functions/src/lib/migration-utils.ts` - 新規作成（後方互換性ヘルパー）
- `functions/src/scripts/migrate-data.ts` - 新規作成（移行スクリプト）
- `functions/src/scripts/report-external-members.ts` - 新規作成（レポート）
- `web/src/lib/auth-types.ts` - フロントエンド型定義更新

**影響範囲**: 最小（既存コードは破壊しない）

**テスト**:
```bash
cd functions && npm run build
cd ../web && npm run build
```

**マージ条件**:
- TypeScriptコンパイル成功
- 既存の型定義と共存可能
- レビュー承認

**備考**:
- この段階ではまだ既存コードは動作する
- 移行スクリプトは含むが実行しない

---

## PR #2: バックエンドAPI層の更新 🔧

**目的**: API層を新しい型定義に適合させ、読み込み時の自動変換を実装

**変更ファイル**:
- `functions/src/lib/users.ts` - フィールド名変換、memberType処理削除
- `functions/src/lib/project-members.ts` - 同上
- `functions/src/lib/member-limits.ts` - guest関連ロジック削除
- `functions/src/api/users-api.ts` - memberType検証削除
- `functions/src/api/org-invitations.ts` - memberTypeパラメータ削除
- `functions/src/api/project-members-api.ts` - email必須化

**影響範囲**: バックエンドのみ

**テスト**:
```bash
# ユニットテスト（もしあれば）
cd functions && npm test

# 手動テスト
# 1. 既存ユーザーの取得
curl -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/users/me

# 2. プロジェクトメンバー一覧
curl -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/projects/{projectId}/members

# 3. 新規招待作成
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","role":"viewer"}' \
  http://localhost:5001/api/org-invitations
```

**マージ条件**:
- 全APIエンドポイントが正常動作
- 既存データ（日本語フィールド）が正しく読み込める
- 新規データ（英語フィールド）が正しく保存される
- レビュー承認

**備考**:
- migration-utils.tsの変換関数を使用
- フロントエンドはまだ古い型定義で動作可能

---

## PR #3: フロントエンドUI層の更新 🎨

**目的**: UI層を新しい型定義に適合させ、memberType選択UIを削除

**変更ファイル**:
- `web/src/lib/api.ts` - User型更新
- `web/src/lib/types.ts` - ManageableUserSummary更新
- `web/src/App.tsx` - 職種→jobTitle
- `web/src/components/UserManagement.tsx` - memberType UI削除
- `web/src/components/OrgMemberInvitationModal.tsx` - 同上
- `web/src/components/UserEditModal.tsx` - フィールド名更新
- `web/src/components/AdminPage.tsx` - memberTypeフォーム削除
- `web/src/components/ProjectEditDialog.tsx` - 職種Type→JobTitleType
- `web/src/components/ProjectMembersDialog.tsx` - 同上

**影響範囲**: フロントエンドのみ

**テスト**:
```bash
cd web && npm run build
cd web && npm run dev
```

**手動テスト**:
1. ユーザー管理画面でメンバー一覧表示
2. 新規メンバー招待（emailのみ）
3. ユーザー編集ダイアログでフィールド確認
4. プロジェクトメンバー追加・編集
5. 管理画面での招待作成

**マージ条件**:
- TypeScriptコンパイル成功
- 全UIコンポーネントが正常表示
- 既存データが正しく表示される
- レビュー承認

**備考**:
- PR #2がマージされていることが前提
- この時点で、新しいUIで既存データも新規データも扱える

---

## PR #4: データ移行実行 🚀

**目的**: 本番データを新形式に移行

**作業内容**:
1. **Dry-run実行** (本番環境で読み取り専用)
   ```bash
   cd functions
   npx ts-node src/scripts/migrate-data.ts --dry-run > migration-report.txt
   ```

2. **external メンバーレポート生成**
   ```bash
   npx ts-node src/scripts/report-external-members.ts
   ```

3. **レビューと手動対応**
   - migration-report.txt を確認
   - external-members-report.csv を確認
   - 必要に応じて手動修正スクリプト作成

4. **本番移行実行**
   ```bash
   # メンテナンスウィンドウを設定
   npx ts-node src/scripts/migrate-data.ts --execute
   ```

   **⚠️ 安全機能**: `orgId='external'`が残っている場合、スクリプトは自動的にエラーで停止します。ステップ3でexternalメンバーを全て解決してから実行してください。

5. **検証**
   - ユーザー一覧が正しく表示されるか
   - プロジェクトメンバーが正しく表示されるか
   - 新規招待が正常に動作するか

**影響範囲**: Firestoreデータベース全体

**ロールバック計画**:
- Firestoreバックアップを事前取得
- 問題発生時は古いフィールドから復元可能
  ```typescript
  // 緊急時の復元スクリプト
  await userDoc.ref.update({
    '職種': data.jobTitle,
    '部署': data.department,
    '電話番号': data.phoneNumber,
  });
  ```

**マージ条件**:
- Dry-runで問題なし
- external メンバーを手動で全て解決
- レビュー承認
- メンテナンスウィンドウ確保

---

## PR #5: クリーンアップと古いフィールド削除 🧹

**目的**: 旧フィールド名を完全削除し、コードベースを整理

**変更ファイル**:
- 移行スクリプトで古いフィールドを削除
- migration-utils.ts の後方互換性コードを削除
- 不要なコメントや一時コードの削除

**作業内容**:
```bash
# 本番環境で実行
npx ts-node src/scripts/migrate-data.ts --execute --cleanup
```

**影響範囲**: Firestoreデータベース（古いフィールド削除）

**マージ条件**:
- PR #4が正常に完了してから最低1週間経過
- 本番環境で問題報告がない
- 全ての external メンバーが解決済み

**備考**:
- この段階で完全に新仕様に移行完了
- 後方互換性コードも削除され、保守性向上

---

## タイムライン（推奨）

| Week | PR | 作業内容 | 環境 |
|------|-----|---------|------|
| Week 1 | PR #1 | 型定義とユーティリティ追加 | dev → staging → prod |
| Week 2 | PR #2 | バックエンドAPI更新 | dev → staging |
| Week 2-3 | - | Staging環境での動作確認 | staging |
| Week 3 | PR #2 | 本番環境デプロイ | prod |
| Week 3 | PR #3 | フロントエンド更新 | dev → staging |
| Week 4 | PR #3 | 本番環境デプロイ | prod |
| Week 4-5 | - | 本番環境での監視・問題修正 | prod |
| Week 5 | PR #4 | データ移行（Dry-run） | prod (read-only) |
| Week 5-6 | - | external メンバー手動対応 | prod |
| Week 6 | PR #4 | データ移行（実行） | prod (maintenance) |
| Week 7-8 | - | 移行後の監視 | prod |
| Week 8 | PR #5 | クリーンアップ | prod |

---

## リスク管理

### 高リスク項目

1. **orgId='external' メンバーの処理**
   - **リスク**: 実在組織IDが不明
   - **対策**: 事前レポート生成 → 手動確認 → 移行
   - **代替案**: デフォルト組織に一括割り当て

2. **データ移行中のダウンタイム**
   - **リスク**: ユーザーがアクセスできない
   - **対策**: メンテナンスウィンドウ設定、深夜実行
   - **代替案**: 読み取り専用モードで段階的移行

3. **予期しないデータ形式**
   - **リスク**: スクリプトがエラーで停止
   - **対策**: Dry-run徹底、エラーハンドリング充実
   - **代替案**: バッチ処理で継続、エラーログ記録

### 中リスク項目

1. **後方互換性の喪失**
   - **リスク**: 古いクライアントが動作しない
   - **対策**: PR #2で自動変換、段階的移行
   - **代替案**: APIバージョニング

2. **パフォーマンス劣化**
   - **リスク**: 変換処理でレスポンス遅延
   - **対策**: PR #4でデータ移行完了後、変換不要に
   - **代替案**: キャッシュ強化

---

## 成功基準

### PR #1-3
- [ ] TypeScriptコンパイル: 0エラー
- [ ] 全APIエンドポイント: 正常動作
- [ ] 全UIコンポーネント: 正常表示
- [ ] レビュー承認: 2名以上

### PR #4（データ移行）
- [ ] Dry-run: 警告・エラーゼロ
- [ ] external メンバー: 100%解決
- [ ] 移行実行: エラーゼロ
- [ ] 移行後検証: 全機能正常

### PR #5（クリーンアップ）
- [ ] 古いフィールド: 完全削除
- [ ] 後方互換性コード: 削除
- [ ] 本番環境: 1週間以上安定稼働

---

## 連絡体制

- **PR レビュアー**: [担当者名]
- **移行作業責任者**: [担当者名]
- **緊急連絡先**: [Slack Channel / Email]
- **メンテナンス告知**: [ユーザー通知方法]

---

## 参考資料

- [COMPASS_PROJECT_DOCUMENTATION.md](./COMPASS_PROJECT_DOCUMENTATION.md)
- [20251203指示.txt](./20251203指示.txt)
- [Migration Scripts](./functions/src/scripts/)
