"""Secret Manager アクセス.

Cloud Run 上では Secret Manager からクレデンシャルを取得する。
ローカルでは環境変数 / .env ファイルにフォールバックする。
"""

from __future__ import annotations

from src.utils.logging import get_logger

logger = get_logger(__name__)


class SecretManagerClient:
    """GCP Secret Manager のラッパー."""

    def __init__(self, project_id: str, prefix: str = "ad-manager-etl") -> None:
        self._project_id = project_id
        self._prefix = prefix
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google.cloud import secretmanager

            self._client = secretmanager.SecretManagerServiceClient()
        return self._client

    def get_secret(self, name: str) -> str:
        """シークレットの最新バージョンを取得する.

        Args:
            name: シークレット名（プレフィックスなし）。
                  例: "google-refresh-token"
                  → projects/{project}/secrets/{prefix}-google-refresh-token/versions/latest

        Returns:
            シークレットの値（文字列）
        """
        secret_id = f"{self._prefix}-{name}"
        resource_name = (
            f"projects/{self._project_id}/secrets/{secret_id}/versions/latest"
        )
        logger.debug("Secret Manager からシークレットを取得: %s", secret_id)

        client = self._get_client()
        response = client.access_secret_version(request={"name": resource_name})
        return response.payload.data.decode("utf-8")
