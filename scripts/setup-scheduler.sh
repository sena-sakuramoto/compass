#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <PROJECT_ID> [REGION=asia-northeast1] [FUNCTION_NAME=jobRunner]"
  exit 1
fi

PROJECT_ID="$1"
REGION="${2:-asia-northeast1}"
FUNC_NAME="${3:-jobRunner}"

PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
APP_SA="$PROJECT_ID@appspot.gserviceaccount.com"
SCHED_AGENT="service-$PROJECT_NUM@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
FUNC_URL=$(gcloud functions describe "$FUNC_NAME" --region="$REGION" --gen2 --format='value(serviceConfig.uri)')

cat <<INFO
Using project: $PROJECT_ID ($PROJECT_NUM)
Function URL: $FUNC_URL
App Service Account: $APP_SA
Scheduler Agent: $SCHED_AGENT
INFO

gcloud functions add-iam-policy-binding "$FUNC_NAME" \
  --region="$REGION" --gen2 \
  --member="serviceAccount:$APP_SA" \
  --role="roles/run.invoker"

gcloud iam service-accounts add-iam-policy-binding "$APP_SA" \
  --member="serviceAccount:$SCHED_AGENT" \
  --role="roles/iam.serviceAccountTokenCreator"

gcloud scheduler jobs create http job-runner \
  --project="$PROJECT_ID" \
  --schedule="0 9 * * *" \
  --time-zone="Asia/Tokyo" \
  --uri="$FUNC_URL" \
  --http-method=POST \
  --oidc-service-account-email="$APP_SA" \
  --oidc-token-audience="$FUNC_URL"
