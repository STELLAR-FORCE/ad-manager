"""リトライデコレータ（指数バックオフ）."""

from __future__ import annotations

import functools
import time
from typing import Any, Callable

from src.utils.logging import get_logger

logger = get_logger(__name__)


def with_retry(
    max_attempts: int = 3,
    backoff_base: float = 2.0,
    retryable_exceptions: tuple[type[Exception], ...] = (Exception,),
) -> Callable:
    """指数バックオフ付きリトライデコレータ.

    Args:
        max_attempts: 最大試行回数
        backoff_base: バックオフ基底（秒）。試行ごとに backoff_base ** attempt
        retryable_exceptions: リトライ対象の例外タプル
    """

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except retryable_exceptions as e:
                    if attempt == max_attempts:
                        logger.error(
                            "%s: 全 %d 回の試行が失敗しました: %s",
                            fn.__name__,
                            max_attempts,
                            e,
                        )
                        raise
                    delay = backoff_base**attempt
                    logger.warning(
                        "%s: 試行 %d/%d 失敗 (%s). %.1f秒後にリトライします…",
                        fn.__name__,
                        attempt,
                        max_attempts,
                        e,
                        delay,
                    )
                    time.sleep(delay)

        return wrapper

    return decorator


def poll_until_complete(
    check_fn: Callable[[], str],
    complete_statuses: set[str],
    failed_statuses: set[str],
    initial_delay: float = 5.0,
    max_delay: float = 60.0,
    timeout: float = 600.0,
) -> str:
    """ポーリングでステータス完了を待つ.

    Yahoo!広告・Bing Ads の非同期レポート生成に使用。

    Args:
        check_fn: 現在のステータスを返す関数
        complete_statuses: 完了とみなすステータス集合
        failed_statuses: 失敗とみなすステータス集合
        initial_delay: 初回待機秒数
        max_delay: 最大待機秒数
        timeout: タイムアウト秒数

    Returns:
        完了時のステータス文字列

    Raises:
        RuntimeError: レポート生成が失敗した場合
        TimeoutError: タイムアウトした場合
    """
    elapsed = 0.0
    delay = initial_delay

    while elapsed < timeout:
        status = check_fn()
        if status in complete_statuses:
            return status
        if status in failed_statuses:
            raise RuntimeError(f"レポート生成に失敗しました (status={status})")
        logger.info("レポート生成待ち… (status=%s, %.0f秒経過)", status, elapsed)
        time.sleep(delay)
        elapsed += delay
        delay = min(delay * 1.5, max_delay)

    raise TimeoutError(f"レポート生成がタイムアウトしました ({timeout}秒)")
