# Functions 環境変数・サービスアカウント設定メモ

## ローカル開発 (.env.local)
- `functions/.env.local` に下記の変数を定義済みです。
  - `PROJECT_ID=compass-31e9e`
  - `REGION=asia-northeast1`
  - `GSA_CLIENT_EMAIL=svc-notifier@compass-31e9e.iam.gserviceaccount.com`
  - `GSA_IMPERSONATE=s.sakuramoto@archi-prisma.co.jp`
  - `NOTIFICATION_SENDER=compass@archi-prisma.co.jp`
  - `GSA_PRIVATE_KEY` … サービスアカウント鍵（\n エスケープ済み 1 行）
- `.env` / `.env.local` は `functions/.gitignore` に追加済み。コミットしないこと。
- ローカル実行例:
  ```bash
  cd functions
  npx dotenv -e .env.local -- firebase emulators:start --only functions
  ```

## 本番デプロイ時の Firebase Secrets
以下コマンドで Secrets に登録してから `firebase deploy --only functions`。

```bash
firebase functions:secrets:set GSA_CLIENT_EMAIL --project compass-31e9e --data "svc-notifier@compass-31e9e.iam.gserviceaccount.com"
firebase functions:secrets:set GSA_PRIVATE_KEY --project compass-31e9e --data "$(jq -r '.GSA_PRIVATE_KEY' < functions/.env.local)"
firebase functions:secrets:set GSA_IMPERSONATE --project compass-31e9e --data "s.sakuramoto@archi-prisma.co.jp"
firebase functions:secrets:set NOTIFICATION_SENDER --project compass-31e9e --data "compass@archi-prisma.co.jp"
```

`jq` が無い環境では `GSA_PRIVATE_KEY` は PEM 全文を手作業で貼り付け。

## サービスアカウント運用
- 使用アカウント: `svc-notifier@compass-31e9e.iam.gserviceaccount.com`
- 権限: Secret Manager アクセス + Gmail/Calendar 用ドメインワイド委任
- 送信元 (`NOTIFICATION_SENDER`) に Google グループを使う場合は、
  - `GSA_IMPERSONATE` のユーザー側でエイリアス登録
  - 管理コンソールで該当グループの送信許可
- 秘密鍵は流出リスクがあるため、定期的にローテーション推奨。今回は共有チャンネルに掲載されたため、状況に応じて再発行を検討してください。

## 参考
- `docs/cloud-scheduler-compass.md`
- `functions/src/lib/googleClients.ts`
- `functions/src/lib/notifications.ts`
