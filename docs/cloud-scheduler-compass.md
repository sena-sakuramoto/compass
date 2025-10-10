# Cloud Scheduler 設定手順（compass-31e9e）

このドキュメントは、`compass-31e9e` プロジェクトで Functions `jobRunner` を定期実行するための具体的なコマンド集です。

## 事前条件
- `gcloud auth login` で Google アカウントにログイン済み
- `firebase login` で CLI 認証済み
- `firebase deploy --only functions` 済み（`jobRunner` が存在すること）
- サービスアカウントの秘密鍵 (`GSA_CLIENT_EMAIL`, `GSA_PRIVATE_KEY`) を Firebase Secrets に登録済み

## 変数定義
```bash
PROJECT_ID="compass-31e9e"
REGION="asia-northeast1"
FUNC_NAME="jobRunner"
APP_SA="${PROJECT_ID}@appspot.gserviceaccount.com"
PROJECT_NUM="$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')"
SCHED_AGENT="service-${PROJECT_NUM}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
FUNC_URL="$(gcloud functions describe ${FUNC_NAME} --region=${REGION} --gen2 --format='value(serviceConfig.uri)' --project ${PROJECT_ID})"
```

## 1. 必要 API の有効化
```bash
gcloud services enable \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudtasks.googleapis.com \
  logging.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  gmail.googleapis.com \
  calendar-json.googleapis.com \
  --project ${PROJECT_ID}
```

## 2. Functions 実行サービスアカウントの権限整理
```bash
# Editor を外す（不要ならスキップ可能）
gcloud projects remove-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${APP_SA}" --role="roles/editor" --quiet || true

# 最小セット + 追加ロール
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${APP_SA}" --role="roles/datastore.user"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${APP_SA}" --role="roles/logging.logWriter"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${APP_SA}" --role="roles/cloudtasks.enqueuer"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${APP_SA}" --role="roles/secretmanager.secretAccessor"
```

## 3. jobRunner の URL 取得
```bash
echo "Function URL: ${FUNC_URL}"
```

## 4. Cloud Run Invoker 権限の付与
```bash
gcloud functions add-iam-policy-binding ${FUNC_NAME} \
  --region=${REGION} --gen2 \
  --member="serviceAccount:${APP_SA}" \
  --role="roles/run.invoker" \
  --project ${PROJECT_ID}
```

## 5. Cloud Scheduler エージェントに TokenCreator 付与
```bash
gcloud iam service-accounts add-iam-policy-binding ${APP_SA} \
  --member="serviceAccount:${SCHED_AGENT}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project ${PROJECT_ID}
```

## 6. Cloud Scheduler ジョブ作成（毎朝 09:00 JST）
```bash
# 既に存在する場合は update に置き換え
gcloud scheduler jobs create http job-runner \
  --schedule="0 9 * * *" \
  --time-zone="Asia/Tokyo" \
  --uri="${FUNC_URL}" \
  --http-method=POST \
  --oidc-service-account-email="${APP_SA}" \
  --oidc-token-audience="${FUNC_URL}" \
  --project ${PROJECT_ID} \
  --location ${REGION}
```

## 7. Firebase Functions の Secrets（参考）
```bash
firebase functions:secrets:set ORG_ID --project ${PROJECT_ID} --data "apdw"
firebase functions:secrets:set ALLOW_EMAILS --project ${PROJECT_ID} --data "*@archi-prisma.co.jp,s.sakuramoto@archi-prisma.co.jp"
firebase functions:secrets:set CALENDAR_TIMEZONE --project ${PROJECT_ID} --data "Asia/Tokyo"
firebase functions:secrets:set NOTIFICATION_SENDER --project ${PROJECT_ID} --data "no-reply@archi-prisma.co.jp"   # 任意
```
※ `GSA_CLIENT_EMAIL` / `GSA_PRIVATE_KEY` / `CALENDAR_ID` / `GSA_IMPERSONATE` は実環境に合わせて別途登録してください。

## 8. 動作確認
- Cloud Scheduler コンソールで `job-runner` の「今すぐ実行」をクリック
- `firebase functions:log --only jobRunner` でログ確認
- Firestore (`orgs/apdw/jobs`) の `state` が `completed` になっているか確認
- Gmail/Calendar で通知・予定が作成されているか確認

---
以上で `compass-31e9e` プロジェクトにおける Cloud Scheduler 設定は完了です。
