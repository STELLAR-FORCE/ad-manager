#!/usr/bin/env bash
# Cloud Run Jobs デプロイスクリプト
# 使い方: ./scripts/deploy.sh
#
# 1. Artifact Registry にリポジトリを作成（初回のみ）
# 2. Docker イメージをビルド & プッシュ
# 3. Cloud Run Job を作成/更新（Secret Manager 参照付き）
# 4. Cloud Scheduler で日次スケジュールを設定
set -euo pipefail

# ── 設定 ──
PROJECT_ID="stellarforce-bi"
REGION="asia-northeast1"
REPO_NAME="ad-manager"
JOB_NAME="ad-manager-etl"
SA_EMAIL="ad-manager-etl@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${JOB_NAME}"
SECRET_PREFIX="ad-manager-etl"
SCHEDULER_NAME="ad-manager-etl-daily"
# 毎日 AM 6:00 JST に実行
SCHEDULER_CRON="0 6 * * *"
SCHEDULER_TZ="Asia/Tokyo"

# ── スクリプトのディレクトリ（etl/ をルートとする） ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ETL_DIR="${SCRIPT_DIR}/.."

echo "=== Cloud Run Jobs デプロイ ==="
echo "プロジェクト: $PROJECT_ID"
echo "リージョン: $REGION"
echo "ジョブ名: $JOB_NAME"
echo ""

# ── 1. Artifact Registry リポジトリ作成（初回のみ） ──
echo "--- Artifact Registry リポジトリを確認 ---"
if ! gcloud artifacts repositories describe "$REPO_NAME" \
  --project="$PROJECT_ID" \
  --location="$REGION" &>/dev/null; then
  echo "リポジトリを作成: $REPO_NAME"
  gcloud artifacts repositories create "$REPO_NAME" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --repository-format=docker \
    --description="Ad Manager ETL パイプライン"
else
  echo "リポジトリは既に存在します: $REPO_NAME"
fi

# ── 2. Docker イメージをビルド & プッシュ ──
echo ""
echo "--- Docker イメージをビルド ---"

# Artifact Registry の認証設定
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ビルド & プッシュ
docker build --platform linux/amd64 -t "${IMAGE}:latest" "$ETL_DIR"
docker push "${IMAGE}:latest"

echo "イメージをプッシュしました: ${IMAGE}:latest"

# ── 3. Cloud Run Job を作成/更新 ──
echo ""
echo "--- Cloud Run Job を設定 ---"

# Secret Manager のシークレットを環境変数としてマウントする引数を構築
# 形式: ENV_VAR=secret-name:latest
SECRETS_ARGS=""
declare -A SECRET_MAP=(
  # Google Ads
  ["GOOGLE_ADS_CUSTOMER_ID"]="google-ads-customer-id"
  ["GOOGLE_ADS_DEVELOPER_TOKEN"]="google-ads-developer-token"
  ["GOOGLE_ADS_CLIENT_ID"]="google-ads-client-id"
  ["GOOGLE_ADS_CLIENT_SECRET"]="google-ads-client-secret"
  ["GOOGLE_ADS_REFRESH_TOKEN"]="google-ads-refresh-token"
  ["GOOGLE_ADS_LOGIN_CUSTOMER_ID"]="google-ads-login-customer-id"
  # Yahoo! 広告
  ["YAHOO_ADS_BASE_ACCOUNT_ID"]="yahoo-ads-base-account-id"
  ["YAHOO_ADS_SEARCH_ACCOUNT_ID"]="yahoo-ads-search-account-id"
  ["YAHOO_ADS_DISPLAY_ACCOUNT_ID"]="yahoo-ads-display-account-id"
  ["YAHOO_ADS_CLIENT_ID"]="yahoo-ads-client-id"
  ["YAHOO_ADS_CLIENT_SECRET"]="yahoo-ads-client-secret"
  ["YAHOO_ADS_REFRESH_TOKEN"]="yahoo-ads-refresh-token"
  # Bing Ads
  ["BING_ADS_ACCOUNT_ID"]="bing-ads-account-id"
  ["BING_ADS_CUSTOMER_ID"]="bing-ads-customer-id"
  ["BING_ADS_CLIENT_ID"]="bing-ads-client-id"
  ["BING_ADS_CLIENT_SECRET"]="bing-ads-client-secret"
  ["BING_ADS_REFRESH_TOKEN"]="bing-ads-refresh-token"
  ["BING_ADS_DEVELOPER_TOKEN"]="bing-ads-developer-token"
)

for env_var in "${!SECRET_MAP[@]}"; do
  secret_id="${SECRET_PREFIX}-${SECRET_MAP[$env_var]}"
  if [ -n "$SECRETS_ARGS" ]; then
    SECRETS_ARGS="${SECRETS_ARGS},${env_var}=${secret_id}:latest"
  else
    SECRETS_ARGS="${env_var}=${secret_id}:latest"
  fi
done

# Cloud Run Job が既に存在するか確認
if gcloud run jobs describe "$JOB_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" &>/dev/null; then
  echo "Cloud Run Job を更新: $JOB_NAME"
  gcloud run jobs update "$JOB_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="${IMAGE}:latest" \
    --service-account="$SA_EMAIL" \
    --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BQ_DATASET=ad_manager,BQ_LOCATION=${REGION},SYNC_PLATFORM=all,SYNC_DAYS_BACK=7,DRY_RUN=false,LOG_LEVEL=INFO" \
    --set-secrets="$SECRETS_ARGS" \
    --memory="1Gi" \
    --cpu="1" \
    --task-timeout="30m" \
    --max-retries=1
else
  echo "Cloud Run Job を作成: $JOB_NAME"
  gcloud run jobs create "$JOB_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="${IMAGE}:latest" \
    --service-account="$SA_EMAIL" \
    --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BQ_DATASET=ad_manager,BQ_LOCATION=${REGION},SYNC_PLATFORM=all,SYNC_DAYS_BACK=7,DRY_RUN=false,LOG_LEVEL=INFO" \
    --set-secrets="$SECRETS_ARGS" \
    --memory="1Gi" \
    --cpu="1" \
    --task-timeout="30m" \
    --max-retries=1
fi

# ── 4. Cloud Scheduler で日次スケジュール ──
echo ""
echo "--- Cloud Scheduler を設定 ---"

if gcloud scheduler jobs describe "$SCHEDULER_NAME" \
  --project="$PROJECT_ID" \
  --location="$REGION" &>/dev/null; then
  echo "スケジューラを更新: $SCHEDULER_NAME"
  gcloud scheduler jobs update http "$SCHEDULER_NAME" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --schedule="$SCHEDULER_CRON" \
    --time-zone="$SCHEDULER_TZ" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="$SA_EMAIL"
else
  echo "スケジューラを作成: $SCHEDULER_NAME"
  gcloud scheduler jobs create http "$SCHEDULER_NAME" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --schedule="$SCHEDULER_CRON" \
    --time-zone="$SCHEDULER_TZ" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="$SA_EMAIL"
fi

echo ""
echo "=== デプロイ完了 ==="
echo ""
echo "手動実行: gcloud run jobs execute $JOB_NAME --project=$PROJECT_ID --region=$REGION"
echo "ログ確認: gcloud run jobs executions list --job=$JOB_NAME --project=$PROJECT_ID --region=$REGION"
