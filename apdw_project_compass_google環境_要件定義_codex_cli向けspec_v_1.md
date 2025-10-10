# APDW Project Compass — Google環境 要件定義 (Codex CLI向けSpec v1.0)

> 本ドキュメントは **Codex CLI** 等のコード生成器に読み込ませることを前提とした実装仕様です。Google 環境のみで完結させるための **2モード** を用意しています。
> 既定は **mode: firebase**（Firebase Hosting + Cloud Functions + Firestore + Google Auth）。代替として **mode: gas**（Google Apps Script + Google Sheets + HtmlService）。

```yaml
meta:
  name: "APDW Project Compass — Google Edition"
  version: 1.0.0
  owner: "Archi-Prisma Design works"
  default_mode: firebase   # firebase | gas
  language: ja-JP
  timezone: Asia/Tokyo
  repo_style: monorepo    # web + api(functions) 同一リポジトリ

requirements:
  goals:
    - プロジェクト/タスク/人員管理、進捗、ガント、担当者別負荷を1つのWebアプリで可視化
    - スマホ最適化（モバイルの下部固定アクション、カードUI）
    - 追加/編集/完了の直感操作、検索・フィルタ（プロジェクト/担当/ステータス）
    - Excel/CSV 取り込み・出力（Projects/Tasks/People 構造）
    - JSON スナップショットの取り込み・出力（Excelと同じ構造、ローカル保存/復元用）
    - 認証は Google ログインで、組織メール許可リスト制御
  non_goals:
    - 外部SaaS(DB)は使わない（Google環境で完結）
    - 複雑な承認ワークフローは初期スコープ外

modes:
  firebase:       # 推奨：リアルタイム・多人数編集・拡張性
    hosting: Firebase Hosting
    auth: Firebase Authentication (Google provider)
    db: Firestore (native, serverTimestamp)
    functions: Cloud Functions for Firebase (Node 20, TypeScript)
    storage: Firebase Storage (Excel入出力ファイル一時保管)
  gas:            # 代替：Google Apps Script + Sheets
    spreadsheet_id: "${TODO_SPREADSHEET_ID}"  # Projects/Tasks/People を持つスプシ
    auth: Google アカウント/ドメイン制限
    webapp_access: "Anyone with Google login in allowlist"

security:
  allow_emails:   # 許可メール（ワイルドカード可）
    - "*@archi-prisma.co.jp"
    - "s.sakuramoto@archi-prisma.co.jp"
  roles:
    - id: admin
      can: [projects:crud, tasks:crud, people:crud, export, import, settings]
    - id: member
      can: [projects:read, tasks:crud, people:read, export]
    - id: viewer
      can: [projects:read, tasks:read, people:read]

# ============================
# データモデル（共通）
# ============================
models:
  Project:
    id: string     # 例: P-0001 (= ProjectID)
    物件名: string
    クライアント: string
    LS担当者: string
    自社PM: string
    ステータス: enum[計画中, 設計中, 見積, 実施中, 完了]
    優先度: enum[高, 中, 低]
    開始日: date | null
    予定完了日: date | null
    所在地/現地: string | null
    フォルダURL: string | null
    備考: string | null
    createdAt: timestamp
    updatedAt: timestamp

  Task:
    id: string     # 例: T001（全体連番 / TaskID）
    projectId: string (ref->Project)
    タスク名: string
    タスク種別: string | null
    担当者: string | null  # 表示名（People.name）
    assignee: string | null  # 担当者の表示名キャッシュ（People.name と同期）
    優先度: enum[高, 中, 低] | null
    ステータス: enum[未着手, 進行中, 確認待ち, 保留, 完了]
    予定開始日: date | null
    期限: date | null
    実績開始日: date | null
    実績完了日: date | null
    工数見積(h): number | null
    工数実績(h): number | null
    依頼元: string | null  # alias: 依頼元/連絡先
    start: date | null      # 予定開始日 or 実績開始日（UI向け派生値）
    end: date | null        # 期限 or 実績完了日（UI向け派生値）
    duration_days: number | null  # start/end から導出（>=0）
    progress: number (0..1)  # 実績/見積があれば優先、無ければステータス推定
    createdAt: timestamp
    updatedAt: timestamp

  Person:
    氏名: string (primary key)
    役割: string | null
    メール: string | null
    電話: string | null
    createdAt: timestamp
    updatedAt: timestamp

# ステータス→進捗の推定
progress_rules:
  未着手: 0
  進行中: 0.5
  確認待ち: 0.6
  保留: 0.2
  完了: 1

# ============================
# 派生ルール / 正規化
# ============================
derived_fields:
  Task:
    - field: progress
      rule: |
        優先: 工数実績(h)/工数見積(h) の比率（両方数値のとき）。
        次善: 入力データに progress が数値で存在する場合はそのまま利用。
        最後: progress_rules[ステータス] を適用。すべて 0..1 にクリップ。
    - field: start
      rule: "start, 予定開始日, 実績開始日 の順で最初に値があるものを yyyy-mm-dd で整形。"
    - field: end
      rule: "end, 期限, 実績完了日 の順で値を採用し yyyy-mm-dd で整形。"
    - field: duration_days
      rule: "start/end が揃う場合は (end-start) を日数で算出（>=0）。未設定時は 0。"
    - field: assignee
      rule: "担当者 or People.氏名 を優先し表示名としてキャッシュ。未設定時は空文字。"
    - field: TaskID_auto
      rule: "TaskID が無い場合は T001 形式でゼロ埋め連番を採番。"
  Project:
    - field: progressAggregate
      rule: |
        子タスクの progress を工数見積(h) で加重平均。工数未入力のみの場合はタスク数で平均。
    - field: span
      rule: "所属タスクの start/end の最小〜最大を保持。UIのガント・概要カードで使用。"

# ============================
# Firestore 設計（firebase mode）
# ============================
firestore:
  collections:
    - name: orgs
      doc: {id: "${ORG_ID}"}
      subcollections:
        - name: projects
          docId: projectId
          indexes:
            - [ステータス]
            - [予定完了日]
        - name: tasks
          docId: taskId
          indexes:
            - [projectId, ステータス]
            - [担当者]
            - [期限]
        - name: people
          docId: 氏名

  security_rules: |
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        function allowed() { return request.auth != null && (
          request.auth.token.email.matches(".*@archi-prisma\\.co\\.jp$") ||
          request.auth.token.email == "s.sakuramoto@archi-prisma.co.jp"
        ); }
        match /orgs/{orgId}/{coll}/{docId} {
          allow read: if allowed();
          allow write: if allowed();
        }
      }
    }

# ============================
# API（firebase functions / gas webapp）
# ============================
api:
  base_path: /api
  endpoints:
    - id: listProjects
      method: GET
      path: /projects
      query: { status?: string }
      resp: { projects: Project[] }

    - id: createProject
      method: POST
      path: /projects
      body: Project (without id, createdAt/updatedAt)
      resp: { id: string }

    - id: listTasks
      method: GET
      path: /tasks
      query: { projectId?: string, assignee?: string, status?: string, q?: string }
      resp: { tasks: Task[] }
      notes: q は TaskID/タスク名/タスク種別/担当者/ステータス/Project.物件名 を部分一致で検索

    - id: createTask
      method: POST
      path: /tasks
      body: Task (without id/createdAt/updatedAt)
      resp: { id: string }

    - id: updateTask
      method: PATCH
      path: /tasks/{id}
      body: Partial<Task>
      resp: { ok: true }

    - id: completeTask
      method: POST
      path: /tasks/{id}/complete
      body: { done: boolean }
      resp: { ok: true }
      behavior:
        on_true: { ステータス: 完了, 実績完了日: serverTimestamp(yyyy-mm-dd), progress: 1 }
        on_false: { ステータス: 最終更新前 or "進行中", progress: progress_rules[ステータス] }

    - id: importExcel
      method: POST
      path: /import
      body: multipart/form-data (xlsx)
      resp: { imported: { projects: number, tasks: number, people: number } }

    - id: exportExcel
      method: GET
      path: /export
      resp: file(xlsx)

    - id: exportJson
      method: GET
      path: /snapshot
      resp: { projects: Project[], tasks: Task[], people: Person[] }

    - id: importJson
      method: POST
      path: /snapshot
      body: { projects: Project[], tasks: Task[], people: Person[] }
      resp: { imported: { projects: number, tasks: number, people: number } }

# ============================
# GAS（代替モード）
# ============================
gas:
  spreadsheet:
    sheets:
      - name: Projects
        key: ProjectID
      - name: Tasks
        key: TaskID
      - name: People
        key: 氏名
  webapp:
    doGet: returns index.html
    doPost: JSON API (path routing via q param)
  mapping:
    Projects: [ProjectID, 物件名, クライアント, LS担当者, 自社PM, ステータス, 優先度, 開始日, 予定完了日, 所在地/現地, フォルダURL, 備考]
    Tasks: [TaskID, ProjectID, タスク名, タスク種別, 担当者, 優先度, ステータス, 予定開始日, 期限, 実績開始日, 実績完了日, start, end, duration_days, 工数見積(h), 工数実績(h), 依頼元, progress]  # start/end/duration/progress は計算列でも可
    People: [氏名, 役割, メール, 電話]

# ============================
# フロントエンド（共通）
# ============================
frontend:
  tech:
    - React 18 + Vite
    - TailwindCSS
    - Recharts (ガント/負荷グラフ)
    - lucide-react (アイコン)
  layout:
    header:
      title: "APDW Project Compass"
      subtitle: "全プロジェクト・タスク反映／ガント（プロジェクト・タスク切替）／モバイル最適化"
      actions:
        - id: export_json
          label: "JSON"
          icon: Download
          behavior: "GET /api/snapshot -> ブラウザダウンロード"
        - id: export_excel
          label: "Excel"
          icon: Download
          behavior: "GET /api/export"
        - id: import_json
          label: "JSON読み込み"
          icon: FileJson
          behavior: "input[type=file] accept application/json -> POST /api/snapshot"
        - id: import_excel
          label: "Excel読み込み"
          icon: FileSpreadsheet
          behavior: "input[type=file] accept .xlsx -> POST /api/import"
    stats_bar:
      cards:
        - id: tasks_visible
          label: "タスク(表示中)"
          value: filteredTasks.length
        - id: members
          label: "メンバー"
          value: people.length
        - id: projects
          label: "プロジェクト"
          value: projects.length
        - id: open_tasks
          label: "未完了タスク"
          value: "filteredTasks where ステータス!=完了"
  filters:
    fields:
      - id: project
        type: select
        placeholder: "すべてのプロジェクト"
      - id: assignee
        type: select
        placeholder: "担当者"
      - id: status
        type: select
        placeholder: "ステータス"
      - id: search
        type: text
        placeholder: "検索（タスク名・担当者・プロジェクト）"
    scope: [overview, tasks, gantt, workload]
    behavior: 同一状態をタブ間で共有し、フィルタ結果を各ビューに反映
  routes:
    - path: "/"
      name: Dashboard
      sections:
        - id: project_summary
          type: card_grid
          card:
            fields: [name, status, schedule_range, progressPercent, taskCount]
            progress_bar: true
            animation: fade_in (framer-motion)
            notes: schedule_range は start → due を yyyy-mm-dd で表示
    - path: "/tasks"
      name: TaskList
      desktop_table:
        columns:
          - key: complete
            type: checkbox
            action: "POST /api/tasks/{id}/complete"
          - key: タスク名
          - key: プロジェクト
            render: Project.物件名 or projectId
          - key: 担当者
          - key: 予定
            render: "start → end"
          - key: 工数(h)
          - key: 進捗
            type: progress_bar
          - key: 優先度
          - key: ステータス
            render: Badge
      mobile_cards:
        fields: [タスク名, プロジェクト, 担当者, 予定, progress_bar]
        actions:
          - icon: CheckCircle2
            action: "POST /api/tasks/{id}/complete (done=true)"
            tooltip: "完了にする"
    - path: "/gantt"
      name: Gantt
      controls:
        - shared_filters
        - toggle: { name: ganttMode, options: ["tasks", "projects"] }
      chart:
        type: vertical_stacked_bar
        width: responsive
        show_today_line: true
        tooltip: duration/start offset を表示
        period_label: "minDate → maxDate（span日）"
    - path: "/workload"
      name: Workload
      charts:
        - type: bar
          data: sum(工数見積(h)) by assignee (desc)
        - type: card_list
          fields: [assignee, taskCount, estimatedHoursRounded]
  dialogs:
    - id: add_task
      title: "タスク追加"
      fields:
        - name: ProjectID
          type: select
          required: true
        - name: 担当者
          type: select
        - name: タスク名
          type: text
          required: true
        - name: 予定開始日
          type: date
        - name: 期限
          type: date
        - name: 優先度
          type: select
          default: "中"
          options: [高, 中, 低]
        - name: ステータス
          type: select
          default: "未着手"
          options: [未着手, 進行中, 確認待ち, 保留, 完了]
        - name: 工数見積(h)
          type: number
          default: 4
      submit: "createTask -> refresh list"
    - id: add_project
      title: "プロジェクト追加"
      fields:
        - name: 物件名
          type: text
          required: true
        - name: 開始日
          type: date
        - name: 予定完了日
          type: date
        - name: ステータス
          type: select
          default: "計画中"
          options: [計画中, 設計中, 見積, 実施中, 完了]
        - name: 優先度
          type: select
          default: "中"
          options: [高, 中, 低]
      submit: "createProject -> refresh list"
  mobile:
    bottom_bar:
      buttons:
        - id: add_task
          label: "タスク追加"
        - id: add_project
          label: "プロジェクト追加"
  components_shared:
    - Filters (project/assignee/status/search)
    - ProjectCard
    - TaskCard
    - TaskTable
    - GanttChart (stacked bar with offset/duration)

# ============================
# データ入出力
# ============================
data_io:
  excel:
    import:
      header_required: true
      sheet_names: [Projects, Tasks, People]
      date_format: "yyyy-mm-dd"
      upsert: true     # key列で更新/追加
      alias_mapping:
        "Tasks.依頼元/連絡先": 依頼元
    export:
      file_name: APDW_Export_${yyyy}-${mm}-${dd}.xlsx
  json:
    export:
      file_name: apdw_compass_${yyyy}-${mm}-${dd}.json
      payload: { projects: Project[], tasks: Task[], people: Person[], generated_at: timestamp }
    import:
      schema: { projects: Project[], tasks: Task[], people: Person[] }
      upsert: true
      validation: missing_keys -> error("Projects/Tasks/People が必要です")

# ============================
# テスト（最小）
# ============================
tests:
  unit:
    - name: progress_calc_ratio
      input: { 工数見積: 10, 工数実績: 5, ステータス: 進行中 }
      expect: { progress: 0.5 }
    - name: progress_fallback_status
      input: { 工数見積: null, 工数実績: null, ステータス: 完了 }
      expect: { progress: 1 }
    - name: duration_days
      input: { start: 2025-01-01, end: 2025-01-03 }
      expect: { days: 2 }
    - name: progress_clip_upper
      input: { 工数見積: 4, 工数実績: 10, ステータス: 進行中 }
      expect: { progress: 1 }
    - name: task_id_autogen
      input: { existing: ["T001"], nextIndex: 1 }
      expect: { TaskID: "T002" }
    - name: assignee_fallback
      input: { 担当者: null, People: [{ 氏名: "櫻本" }] }
      expect: { assignee: "櫻本" }
  e2e:
    - name: add_task_mobile
      steps:
        - open: /tasks (mobile)
        - tap: "タスク追加"
        - fill: { タスク名: "確認図書作成", Project: "P-0002", 期限: "2025-01-20" }
        - submit: true
        - assert: row_exists(タスク名="確認図書作成")
    - name: complete_task_checkbox
      steps:
        - open: /tasks (desktop)
        - check: row(TaskID="T001").完了
        - assert: row(TaskID="T001").ステータス == "完了"

# ============================
# 生成対象のディレクトリ構成（firebase）
# ============================
file_tree:
  firebase:
    - web/
      - index.html
      - src/
        - main.tsx
        - App.tsx
        - components/
          - Filters.tsx
          - GanttChart.tsx
          - ProjectCard.tsx
          - TaskTable.tsx
          - TaskCard.tsx
        - lib/
          - api.ts   # fetch wrapper
          - date.ts
      - vite.config.ts
      - tailwind.config.ts
    - functions/
      - src/
        - index.ts   # express app bootstrap
        - api/
          - projects.ts
          - tasks.ts
          - excel.ts
        - lib/
          - firestore.ts
          - auth.ts   # Google token verify
          - progress.ts
      - package.json
      - tsconfig.json
    - firestore.rules
    - firebase.json

  gas:
    - src/
      - Code.gs       # doGet/doPost, routing
      - Sheets.gs     # CRUD for Projects/Tasks/People
      - Progress.gs   # progress/duration logic
      - Html/
        - index.html  # ビルド済みReactを埋め込み or バニラ
        - app.js      # UIロジック（バニラ or ビルド出力）
    - appsscript.json

# ============================
# コード生成ガイド（Codex CLI 向け）
# ============================
codegen:
  mode: firebase  # または gas
  prompts:
    - id: scaffold_firebase
      when: mode==firebase
      text: |
        Create a Firebase monorepo with the file_tree.firebase structure. Implement REST endpoints per api.endpoints using Express on Cloud Functions (Node 20, TypeScript). Use Firestore with the data models in models. Implement excel import/export using xlsx. Implement Google Auth (ID token) verification middleware. Implement frontend React pages per frontend.routes with Tailwind and Recharts. Respect progress_rules.
    - id: scaffold_gas
      when: mode==gas
      text: |
        Create a Google Apps Script project with files in file_tree.gas. Implement doGet to serve HtmlService (index.html). Implement doPost JSON router for api.endpoints. CRUD must read/write to the Spreadsheet sheets defined in gas.spreadsheet. Implement progress_rules and duration logic in Progress.gs. Provide a minimal vanilla JS UI (or accept prebuilt React bundle) with mobile-friendly layout.

# ============================
# デプロイ手順（実行時に出力させるメッセージの雛形）
# ============================
deploy:
  firebase:
    steps:
      - run: npm i -g firebase-tools
      - run: firebase login
      - run: firebase init hosting firestore functions
      - run: firebase deploy --only functions,hosting,firestore:rules
  gas:
    steps:
      - run: npm i -g @google/clasp
      - run: clasp login
      - run: clasp create --type webapp --title "APDW Project Compass"
      - run: clasp push && clasp deploy --description "v1"

# ============================
# 既知の制約・今後の拡張
# ============================
notes:
  - ガントの期間はフィルタ結果の最小開始〜最大終了を採用。期限未設定タスクは現状非表示（要件変更時は単日バーを描画）
  - 完了時の工数自動補正は未実装（要件に応じてBまたはCへ拡張）
  - 監査ログ（変更履歴）は将来の拡張で追加（Firestore: /orgs/{orgId}/audit）
  - JSON スナップショットを localStorage にキャッシュする軽量オフライン対応は任意（復元操作があるため）
```

---

## 生成のためのサンプル・プロンプト（貼り付け用）

### Firebaseモード（既定）
```
Read the YAML spec above and generate the Firebase monorepo. Use TypeScript. Implement: functions/src/index.ts bootstrapping Express; functions/src/api/{projects,tasks,excel}.ts for endpoints; Firestore access in functions/src/lib/firestore.ts; ID token middleware in lib/auth.ts. Frontend uses React+Vite+Tailwind+Recharts with routes and components as specified. Include minimal styling and mobile bottom action bar. Respect progress_rules and tests.
```

### GASモード（代替）
```
Read the YAML spec above and generate a Google Apps Script project. Implement Code.gs(doGet/doPost), Sheets.gs(CRUD), Progress.gs(progress & duration). Html/ にバンドル済みの app.js を読み込む index.html を作成。Spreadsheet のヘッダ名はモデルに一致させること。Excel I/O は Drive API 経由で一時ファイル化せず、アップロードはBase64で受け取りシートへ反映する簡易版でもよい。
```

---

## 参考サンプル: Firestore ルール（再掲）
```bash
firebase deploy --only firestore:rules
```

---

## 期待される受け入れ基準（要約）
1. Google ログイン後、ダッシュボード・タスク・ガント・人別負荷の各画面が閲覧できること。
2. モバイルで下部固定バーから「タスク追加」「プロジェクト追加」が動作すること。
3. 進捗は 工数実績/工数見積 を優先、無い場合はステータス推定となること。
4. Excel のインポート/エクスポートが Projects/Tasks/People の3シートで正しく往復可能であること。
5. Firestore（またはSpreadsheet）に保存されたデータが即時UIへ反映されること。

---

## サンプルデータ（抜粋）
```json
{
  "generated_at": "2025-10-04 15:19:48",
  "projects": [
    {
      "ProjectID": "P-0001",
      "物件名": "LS_新宿南口 店舗新装",
      "クライアント": "LS",
      "LS担当者": "鈴木 花子",
      "自社PM": "櫻本 聖成",
      "ステータス": "設計中",
      "優先度": "高",
      "開始日": "2025-08-22",
      "予定完了日": "2025-10-06",
      "所在地/現地": "新宿区"
    }
  ],
  "people": [
    { "氏名": "櫻本", "役割": "PM/設計統括", "メール": "s.sakuramoto@archi-prisma.co.jp" },
    { "氏名": "中村", "役割": "管理建築士/設計", "メール": "s.nakamura@archi-prisma.co.jp" }
  ],
  "tasks": [
    {
      "TaskID": "T001",
      "ProjectID": "P-0001",
      "タスク名": "基本設計_レイアウト案",
      "タスク種別": "設計",
      "担当者": "櫻本",
      "優先度": "高",
      "ステータス": "進行中",
      "予定開始日": "2025-09-01",
      "期限": "2025-09-08",
      "工数見積(h)": 16,
      "工数実績(h)": 10,
      "依頼元/連絡先": "LS",
      "progress": 0.625,
      "start": "2025-09-01",
      "end": "2025-09-08",
      "duration_days": 7
    },
    {
      "TaskID": "T002",
      "ProjectID": "P-0001",
      "タスク名": "設備レイアウト調整",
      "タスク種別": "設備",
      "担当者": "中村",
      "優先度": "中",
      "ステータス": "未着手",
      "予定開始日": "2025-09-05",
      "期限": "2025-09-12",
      "工数見積(h)": 12,
      "progress": 0,
      "start": "2025-09-05",
      "end": "2025-09-12",
      "duration_days": 7
    }
  ]
}
```
