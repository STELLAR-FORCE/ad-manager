"""ETL パイプライン エントリポイント.

3社（Google Ads / Yahoo!広告 / Bing Ads）のデータを
順次取得して BigQuery に書き込む。

各プラットフォームは独立して実行され、1社が失敗しても他は続行する。
全社失敗した場合のみ exit code 1 で終了する。
"""

from __future__ import annotations

import argparse
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

from src.auth.oauth import OAuthManager
from src.bigquery.client import BigQueryClient
from src.config import Settings, get_settings
from src.models.schemas import BudgetLogRow, SyncLogRow
from src.platforms.base import AdPlatformClient
from src.platforms.google_ads import GoogleAdsClient_
from src.platforms.bing_ads import BingAdsClient
from src.platforms.yahoo_ads import YahooAdsClient
from src.utils.logging import get_logger, setup_logging

logger = get_logger(__name__)


def _create_platform_clients(
    settings: Settings, oauth: OAuthManager
) -> list[AdPlatformClient]:
    """有効なプラットフォームクライアントのリストを生成する."""
    all_clients: dict[str, AdPlatformClient] = {
        "google": GoogleAdsClient_(settings, oauth),
        "yahoo": YahooAdsClient(settings, oauth),
        "bing": BingAdsClient(settings, oauth),
    }

    if settings.sync_platform == "all":
        return list(all_clients.values())

    client = all_clients.get(settings.sync_platform)
    if client is None:
        logger.error("不明なプラットフォーム: %s", settings.sync_platform)
        return []
    return [client]


def _sync_platform(
    client: AdPlatformClient,
    bq: BigQueryClient,
    start_date: date,
    end_date: date,
) -> None:
    """1つのプラットフォームの全データを同期する."""
    platform = client.platform
    logger.info("=== %s の同期を開始します ===", platform.upper())

    # 1. 認証
    client.authenticate()

    # 2. キャンペーン
    campaigns = client.fetch_campaigns()
    bq.upsert("adm_campaigns", campaigns)

    # 3. 広告グループ
    ad_groups = client.fetch_ad_groups()
    bq.upsert("adm_ad_groups", ad_groups)

    # 4. 広告
    ads = client.fetch_ads()
    bq.upsert("adm_ads", ads)

    # 5. キーワード
    keywords = client.fetch_keywords()
    bq.upsert("adm_keywords", keywords)

    # 6. 日次指標
    daily_metrics = client.fetch_daily_metrics(start_date, end_date)
    bq.upsert("adm_daily_metrics", daily_metrics, add_synced_at=False)

    # 7. 検索語句レポート
    search_terms = client.fetch_search_term_report(start_date, end_date)
    bq.upsert("adm_search_term_reports", search_terms, add_synced_at=False)

    # 8. 予算ログ（当月分を daily_metrics から集計）
    _sync_budget_logs(campaigns, daily_metrics, bq)

    logger.info("=== %s の同期が完了しました ===", platform.upper())


def _sync_budget_logs(campaigns, daily_metrics, bq: BigQueryClient) -> None:
    """キャンペーンの月予算と日次コストから budget_logs を生成する."""
    # 当月の文字列
    current_month = date.today().strftime("%Y-%m")

    # キャンペーンごとの月間コスト集計
    cost_by_campaign: dict[str, float] = {}
    for m in daily_metrics:
        if m.date.strftime("%Y-%m") == current_month:
            cost_by_campaign[m.campaign_id] = (
                cost_by_campaign.get(m.campaign_id, 0.0) + m.cost
            )

    budget_logs = []
    for c in campaigns:
        budget = c.monthly_budget or (c.daily_budget * 30 if c.daily_budget else None)
        if budget is None:
            continue
        spent = cost_by_campaign.get(c.id, 0.0)
        budget_logs.append(
            BudgetLogRow(
                id=str(uuid.uuid4()),
                campaign_id=c.id,
                month=current_month,
                budget=budget,
                spent=spent,
            )
        )

    if budget_logs:
        bq.upsert("adm_budget_logs", budget_logs, add_synced_at=False)


def _parse_args() -> argparse.Namespace:
    """CLI 引数を解析する.

    --start-date / --end-date を両方指定するとバックフィルモードになり、
    sync_days_back の 90 日上限を超えた範囲も取得できる。
    指定しない場合は既存の sync_days_back ベースの日次運用ロジックで動く。
    """
    parser = argparse.ArgumentParser(
        description="広告データ ETL パイプライン (Google Ads / Yahoo!広告 / Bing Ads → BigQuery)"
    )
    parser.add_argument(
        "--start-date",
        type=date.fromisoformat,
        default=None,
        help="取得開始日 (YYYY-MM-DD)。--end-date とセットで指定するとバックフィルモード",
    )
    parser.add_argument(
        "--end-date",
        type=date.fromisoformat,
        default=None,
        help="取得終了日 (YYYY-MM-DD)。--start-date とセットで指定",
    )
    parser.add_argument(
        "--platform",
        choices=["all", "google", "yahoo", "bing"],
        default=None,
        help="対象プラットフォーム。指定時は SYNC_PLATFORM を上書き",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="dry_run を有効化（BQ への書き込みをスキップ）",
    )
    return parser.parse_args()


def _resolve_date_range(
    settings: Settings, args: argparse.Namespace
) -> tuple[date, date, str]:
    """CLI 引数 / 環境変数 / sync_days_back から取得日付範囲を決定する.

    優先順位: CLI 引数 > 環境変数 (SYNC_START_DATE / SYNC_END_DATE) > sync_days_back

    Returns: (start_date, end_date, mode) — mode は "backfill" or "daily"
    """
    start = args.start_date or settings.sync_start_date
    end = args.end_date or settings.sync_end_date

    if (start is None) ^ (end is None):
        logger.error(
            "--start-date と --end-date は両方指定してください "
            "(start=%s, end=%s)",
            start,
            end,
        )
        sys.exit(1)

    if start is not None and end is not None:
        if start > end:
            logger.error(
                "--start-date (%s) は --end-date (%s) 以前にしてください",
                start,
                end,
            )
            sys.exit(1)
        return start, end, "backfill"

    # 通常モード: 昨日までの sync_days_back 日分
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=settings.sync_days_back - 1)
    return start, end, "daily"


def main() -> None:
    """メインエントリポイント."""
    args = _parse_args()
    settings = get_settings()

    # CLI 引数で settings を上書き
    if args.platform is not None:
        settings.sync_platform = args.platform
    if args.dry_run:
        settings.dry_run = True

    setup_logging(settings.log_level)

    start_date, end_date, mode = _resolve_date_range(settings, args)

    if mode == "backfill":
        days = (end_date - start_date).days + 1
        logger.info(
            "ETL パイプラインを開始します "
            "(platform=%s, mode=backfill, range=%s〜%s, days=%d, dry_run=%s)",
            settings.sync_platform,
            start_date,
            end_date,
            days,
            settings.dry_run,
        )
    else:
        logger.info(
            "ETL パイプラインを開始します "
            "(platform=%s, mode=daily, days_back=%d, dry_run=%s)",
            settings.sync_platform,
            settings.sync_days_back,
            settings.dry_run,
        )

    oauth = OAuthManager(settings)
    bq = BigQueryClient(settings)
    clients = _create_platform_clients(settings, oauth)

    if not clients:
        logger.error("有効なプラットフォームクライアントがありません")
        sys.exit(1)

    succeeded = 0
    failed = 0

    for client in clients:
        sync_log_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        # SyncLog 開始（バックフィルモードは手動実行扱いとして "manual" で記録）
        sync_type = "manual" if mode == "backfill" else "auto"
        sync_log = SyncLogRow(
            id=sync_log_id,
            platform=client.platform,
            sync_type=sync_type,
            status="running",
            started_at=now,
        )
        bq.insert_sync_log(sync_log)

        try:
            _sync_platform(client, bq, start_date, end_date)
            bq.update_sync_log_status(sync_log_id, "success")
            succeeded += 1
        except Exception as e:
            logger.exception("%s の同期に失敗しました: %s", client.platform, e)
            bq.update_sync_log_status(
                sync_log_id, "failed", message=str(e)[:500]
            )
            failed += 1

    logger.info(
        "ETL パイプライン完了: 成功=%d, 失敗=%d", succeeded, failed
    )

    if succeeded == 0:
        logger.error("全プラットフォームの同期が失敗しました")
        sys.exit(1)


if __name__ == "__main__":
    main()
