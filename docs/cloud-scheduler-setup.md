# Cloud Scheduler で jobRunner を実行する手順

## 1. 前提
- Firebase Functions `jobRunner` をデプロイ済み (`firebase deploy --only functions`)
- `gcloud` CLI がインストールされ、`gcloud auth login` 済み
- サービスアカウントに Gmail / Calendar / Cloud Tasks など必要な権限を付与済み

## 2. 変数
```
PROJECT_ID="your-project-id"
REGION="asia-northeast1"
APP_SA="$PROJECT_ID@appspot.gserviceaccount.com"   # Functions 実行 SA
PROJECT_NUM="$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')"
SCHED_AGENT="service-$PROJECT_NUM@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
FUNC_NAME="jobRunner"
FUNC_URL="$(gcloud functions describe $FUNC_NAME --region=$REGION --gen2 --format='value(serviceConfig.uri)')"
```

## 3. 関数へ呼び出し権限を付与 (Cloud Run Invoker)
```
gcloud functions add-iam-policy-binding $FUNC_NAME \
  --region=$REGION --gen2 \
  --member="serviceAccount:$APP_SA" \
  --role="roles/run.invoker"
```

## 4. Cloud Scheduler にトークン発行権限を与える
```
gcloud iam service-accounts add-iam-policy-binding $APP_SA \
  --member="serviceAccount:$SCHED_AGENT" \
  --role="roles/iam.serviceAccountTokenCreator"
```

## 5. Cloud Scheduler ジョブを作成
```
gcloud scheduler jobs create http job-runner \
  --schedule="0 9 * * *" \
  --time-zone="Asia/Tokyo" \
  --uri="$FUNC_URL" \
  --http-method=POST \
  --oidc-service-account-email="$APP_SA" \
  --oidc-token-audience="$FUNC_URL"
```

## 6. 動作確認
- Cloud Scheduler コンソールから「ジョブを実行」。
- `firebase functions:log --only jobRunner` などでログを確認。
- Firestore `orgs/{ORG_ID}/jobs` でジョブが `completed` に更新されているか確認。
