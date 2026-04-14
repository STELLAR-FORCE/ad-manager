"""環境変数・設定管理."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """ETL パイプライン設定.

    環境変数 or .env ファイルから読み込む。
    Cloud Run 上では Secret Manager 経由で注入する。
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── GCP ──
    gcp_project_id: str = ""
    bq_dataset: str = "ad_manager"
    bq_location: str = "asia-northeast1"

    # ── Google Ads ──
    google_ads_customer_id: str = ""
    google_ads_developer_token: str = ""
    google_ads_client_id: str = ""
    google_ads_client_secret: str = ""
    google_ads_refresh_token: str = ""
    google_ads_login_customer_id: str = ""  # MCC 経由の場合

    # ── Yahoo!広告 ──
    yahoo_ads_account_id: str = ""
    yahoo_ads_client_id: str = ""
    yahoo_ads_client_secret: str = ""
    yahoo_ads_refresh_token: str = ""

    # ── Bing Ads ──
    bing_ads_account_id: str = ""
    bing_ads_customer_id: str = ""
    bing_ads_client_id: str = ""
    bing_ads_client_secret: str = ""
    bing_ads_refresh_token: str = ""
    bing_ads_developer_token: str = ""

    # ── 実行設定 ──
    sync_days_back: int = Field(default=7, ge=1, le=90)
    sync_platform: str = "all"  # "all" | "google" | "yahoo" | "bing"
    dry_run: bool = False
    log_level: str = "INFO"

    # ── Secret Manager ──
    use_secret_manager: bool = False
    secret_manager_prefix: str = "ad-manager-etl"


def get_settings() -> Settings:
    """Settings シングルトンを返す."""
    return Settings()
