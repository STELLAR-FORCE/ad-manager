"""OAuth2 トークンリフレッシュヘルパー.

各広告プラットフォームの OAuth2 トークンを取得・リフレッシュする。
Cloud Run 上では Secret Manager からリフレッシュトークンを取得。
ローカルでは環境変数を直接使用。
"""

from __future__ import annotations

import httpx

from src.auth.secret_manager import SecretManagerClient
from src.config import Settings
from src.utils.logging import get_logger

logger = get_logger(__name__)


class OAuthManager:
    """OAuth2 トークン管理."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._sm: SecretManagerClient | None = None
        if settings.use_secret_manager:
            self._sm = SecretManagerClient(
                project_id=settings.gcp_project_id,
                prefix=settings.secret_manager_prefix,
            )

    def _get_secret_or_env(self, secret_name: str, env_value: str) -> str:
        """Secret Manager → 環境変数の優先順位で値を取得する."""
        if self._sm:
            try:
                return self._sm.get_secret(secret_name)
            except Exception as e:
                logger.warning(
                    "Secret Manager から %s を取得できませんでした (%s). "
                    "環境変数にフォールバックします.",
                    secret_name,
                    e,
                )
        return env_value

    # ── Google Ads ────────────────────────────────────────────────

    def get_google_ads_credentials(self) -> dict[str, str]:
        """Google Ads API 用のクレデンシャルを返す.

        google-ads ライブラリの GoogleAdsClient.load_from_dict() に
        そのまま渡せる形式で返す。
        """
        s = self._settings
        return {
            "developer_token": self._get_secret_or_env(
                "google-developer-token", s.google_ads_developer_token
            ),
            "client_id": self._get_secret_or_env(
                "google-client-id", s.google_ads_client_id
            ),
            "client_secret": self._get_secret_or_env(
                "google-client-secret", s.google_ads_client_secret
            ),
            "refresh_token": self._get_secret_or_env(
                "google-refresh-token", s.google_ads_refresh_token
            ),
            "login_customer_id": s.google_ads_login_customer_id or None,
        }

    # ── Yahoo!広告 ────────────────────────────────────────────────

    def get_yahoo_access_token(self) -> str:
        """Yahoo!広告 API 用のアクセストークンを取得する.

        リフレッシュトークンを使って新しいアクセストークンを発行する。
        """
        s = self._settings
        client_id = self._get_secret_or_env(
            "yahoo-client-id", s.yahoo_ads_client_id
        )
        client_secret = self._get_secret_or_env(
            "yahoo-client-secret", s.yahoo_ads_client_secret
        )
        refresh_token = self._get_secret_or_env(
            "yahoo-refresh-token", s.yahoo_ads_refresh_token
        )

        response = httpx.post(
            "https://biz-oauth.yahoo.co.jp/oauth/v1/token",
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
            },
            timeout=30,
        )
        response.raise_for_status()
        token_data = response.json()
        logger.info("Yahoo! アクセストークンを取得しました")
        return token_data["access_token"]

    # ── Bing Ads ──────────────────────────────────────────────────

    def get_bing_ads_credentials(self) -> dict[str, str]:
        """Bing Ads SDK 用のクレデンシャルを返す.

        bingads.AuthorizationData に渡すための値を返す。
        """
        s = self._settings
        return {
            "client_id": self._get_secret_or_env(
                "bing-client-id", s.bing_ads_client_id
            ),
            "client_secret": self._get_secret_or_env(
                "bing-client-secret", s.bing_ads_client_secret
            ),
            "refresh_token": self._get_secret_or_env(
                "bing-refresh-token", s.bing_ads_refresh_token
            ),
            "developer_token": self._get_secret_or_env(
                "bing-developer-token", s.bing_ads_developer_token
            ),
            "account_id": s.bing_ads_account_id,
            "customer_id": s.bing_ads_customer_id,
        }
