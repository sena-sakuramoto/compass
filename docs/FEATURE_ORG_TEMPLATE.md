# 組織テンプレート機能（将来実装予定）

## 概要

組織ごとにプロジェクトテンプレート（工程・タスク）を設定し、PJ作成時に自動生成する機能。

## ユースケース

```
組織A（設計事務所）
  └─ テンプレート: 基本設計 → 実施設計 → 確認申請 → 施工監理

組織B（ゼネコン）
  └─ テンプレート: 見積 → 契約 → 施工計画 → 施工 → 引渡

↓ PJ追加時

[新規PJ作成] → 組織のテンプレートに基づいて工程/タスク自動生成
```

## データ構造（案）

### Firestore

```
orgs/{orgId}/settings/projectTemplate
├── stages: [
│   { name: "初期設計", order: 1, defaultDays: 30 },
│   { name: "詳細設計", order: 2, defaultDays: 45 },
│   { name: "施工準備", order: 3, defaultDays: 14 },
│   { name: "施工", order: 4, defaultDays: 90 },
│   { name: "竣工", order: 5, defaultDays: 7 }
│ ]
├── defaultTasks: [
│   { stageName: "初期設計", taskName: "ヒアリング", assigneeRole: "designer" },
│   { stageName: "初期設計", taskName: "コンセプト作成", assigneeRole: "designer" }
│ ]
├── autoCreateOnProjectCreate: true
├── createdAt: Timestamp
└── updatedAt: Timestamp
```

## 実装箇所

### バックエンド

1. **API追加**: `functions/src/api/org-templates.ts`
   - `GET /api/org-templates` - テンプレート取得
   - `PUT /api/org-templates` - テンプレート更新

2. **プロジェクト作成時の自動生成**: `functions/src/api/projects.ts`
   ```typescript
   // POST / のハンドラ内
   const id = await createProject(payload, effectiveOrgId, req.uid);

   // テンプレートから工程を自動生成
   const template = await getOrgProjectTemplate(effectiveOrgId);
   if (template?.autoCreateOnProjectCreate && template.stages) {
     for (const stage of template.stages) {
       await createStage({
         projectId: id,
         orgId: effectiveOrgId,
         タスク名: stage.name,
         orderIndex: stage.order
       });
     }
   }
   ```

### フロントエンド

1. **設定画面**: 組織管理 → テンプレート設定タブ
2. **工程の並び替え**: ドラッグ&ドロップUI
3. **デフォルトタスク設定**: 各工程に紐づくタスク一覧

## 優先度

低（将来実装予定）

## 関連ファイル

- `functions/src/api/projects.ts` - PJ作成API
- `functions/src/api/stages.ts` - 工程API
- `functions/src/lib/firestore.ts:1037-1173` - 工程操作
