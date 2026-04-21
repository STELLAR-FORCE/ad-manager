"""構造化ログ設定.

Cloud Run 上では Cloud Logging と自動統合される。
ローカルでは標準の StreamHandler を使用する。
"""

from __future__ import annotations

import logging
import os


def setup_logging(level: str = "INFO") -> None:
    """ロガーを初期化する.

    Cloud Run 上（K_SERVICE 環境変数が存在する場合）は
    google-cloud-logging のハンドラを使用。
    ローカルでは読みやすいフォーマットで標準出力に出す。
    """
    if os.environ.get("K_SERVICE"):
        # Cloud Run 上: Cloud Logging と統合
        try:
            import google.cloud.logging as cloud_logging

            client = cloud_logging.Client()
            client.setup_logging(log_level=getattr(logging, level))
        except Exception:
            _setup_local_logging(level)
    else:
        _setup_local_logging(level)


def _setup_local_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def get_logger(name: str) -> logging.Logger:
    """名前付きロガーを取得する."""
    return logging.getLogger(name)
