#!/usr/bin/env bash
# Secret Manager にクレデンシャルを登録するスクリプト
# 使い方: ./scripts/setup_secrets.sh
#
# .env ファイルの値を Secret Manager に登録する。
# プレフィックス: ad-manager-etl-<name>
set -euo pipefail

PROJECT_ID="stellarforce-bi"
PREFIX="ad-manager-etl"

# .env ファイルのパス
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "エラー: .env ファイルが見つかりません: $ENV_FILE"
  exit 1
fi

# Secret Manager に登録する環境変数のリスト
# GCP_PROJECT_ID 等のインフラ設定は除外し、クレデンシャルのみ登録
SECRET_KEYS=(
  # Google Ads
  GOOGLE_ADS_CUSTOMER_ID
  GOOGLE_ADS_DEVELOPER_TOKEN
  GOOGLE_ADS_CLIENT_ID
  GOOGLE_ADS_CLIENT_SECRET
  GOOGLE_ADS_REFRESH_TOKEN
  GOOGLE_ADS_LOGIN_CUSTOMER_ID
  # Yahoo! 広告
  YAHOO_ADS_BASE_ACCOUNT_ID
  YAHOO_ADS_SEARCH_ACCOUNT_ID
  YAHOO_ADS_DISPLAY_ACCOUNT_ID
  YAHOO_ADS_CLIENT_ID
  YAHOO_ADS_CLIENT_SECRET
  YAHOO_ADS_REFRESH_TOKEN
  # Bing Ads
  BING_ADS_ACCOUNT_ID
  BING_ADS_CUSTOMER_ID
  BING_ADS_CLIENT_ID
  BING_ADS_CLIENT_SECRET
  BING_ADS_REFRESH_TOKEN
  BING_ADS_DEVELOPER_TOKEN
)

echo "=== Secret Manager セットアップ ==="
echo "プロジェクト: $PROJECT_ID"
echo "プレフィックス: $PREFIX"
echo ""

for key in "${SECRET_KEYS[@]}"; do
  # .env から値を読み取る（KEY=VALUE 形式）
  value=$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)

  if [ -z "$value" ]; then
    echo "スキップ: $key（値が空です）"
    continue
  fi

  # シークレット名: 大文字_をハイフン小文字に変換
  # 例: GOOGLE_ADS_CLIENT_ID → google-ads-client-id
  secret_name="${PREFIX}-$(echo "$key" | tr '[:upper:]_' '[:lower:]-')"

  # シークレットが存在するか確認
  if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
    # 既存シークレットに新しいバージョンを追加
    printf '%s' "$value" | gcloud secrets versions add "$secret_name" \
      --project="$PROJECT_ID" \
      --data-file=-
    echo "更新: $secret_name"
  else
    # 新規シークレットを作成
    printf '%s' "$value" | gcloud secrets create "$secret_name" \
      --project="$PROJECT_ID" \
      --replication-policy="user-managed" \
      --locations="asia-northeast1" \
      --data-file=-
    echo "作成: $secret_name"
  fi
done

echo ""
echo "=== 完了 ==="
echo "登録されたシークレット一覧:"
gcloud secrets list --project="$PROJECT_ID" --filter="name:${PREFIX}" --format="value(name)"
