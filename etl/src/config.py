"""環境変数・設定管理."""

from __future__ import annotations

from datetime import date

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
    yahoo_ads_account_id: str = ""  # 検索広告アカウントID（後方互換）
    yahoo_ads_base_account_id: str = ""  # MCC ベースアカウントID（x-z-base-account-id）
    yahoo_ads_search_account_id: str = ""  # 検索広告アカウントID
    yahoo_ads_display_account_id: str = ""  # ディスプレイ広告アカウントID
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

    # ── バックフィル（明示的な日付範囲指定） ──
    # CLI 引数 --start-date / --end-date でも指定可能。両方指定された場合に
    # バックフィルモードとして動作し、sync_days_back の 90 日上限を回避する。
    # 通常運用では未設定のままで sync_days_back ベースで動く。
    sync_start_date: date | None = None
    sync_end_date: date | None = None

    # ── Secret Manager ──
    use_secret_manager: bool = False
    secret_manager_prefix: str = "ad-manager-etl"


def get_settings() -> Settings:
    """Settings シングルトンを返す."""
    return Settings()
