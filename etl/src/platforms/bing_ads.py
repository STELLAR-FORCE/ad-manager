"""Microsoft Advertising (Bing Ads) API クライアント.

bingads Python SDK を使用。
レポートは ReportingServiceManager 経由で
submit → poll → download (ZIP/CSV) の一括処理。

注意:
- コスト列は Spend（Google の cost_micros とは異なる）
- CV列は ConversionsQualified（Conversions は非推奨）
- ダウンロードは ZIP 圧縮の CSV
"""

from __future__ import annotations

import csv
import io
import os
import tempfile
from datetime import date

from bingads.authorization import AuthorizationData, OAuthWebAuthCodeGrant
from bingads.service_client import ServiceClient
from bingads.v13.reporting import ReportingDownloadParameters, ReportingServiceManager

from src.auth.oauth import OAuthManager
from src.config import Settings
from src.models.schemas import (
    AdGroupRow,
    AdRow,
    CampaignRow,
    DailyMetricRow,
    KeywordRow,
    SearchTermRow,
    compute_metrics,
)
from src.platforms.base import AdPlatformClient
from src.utils.logging import get_logger
from src.utils.retry import with_retry

logger = get_logger(__name__)

ENVIRONMENT = "production"
API_VERSION = 13

# ── ステータスマッピング ──────────────────────────────────────────

_STATUS_MAP = {
    "Active": "active",
    "Paused": "paused",
    "Deleted": "ended",
    "BudgetPaused": "active_limited",
    "BudgetAndManualPaused": "paused",
    "Suspended": "paused",
}

_BID_STRATEGY_MAP = {
    "TargetCpa": "目標CPA",
    "TargetRoas": "目標ROAS",
    "MaxConversions": "CV最大化",
    "MaxClicks": "クリック最大化",
    "ManualCpc": "手動CPC",
    "EnhancedCpc": "拡張CPC",
    "MaxConversionValue": "CV値最大化",
    "TargetImpressionShare": "目標IS",
}

_MATCH_TYPE_MAP = {
    "Exact": "完全一致",
    "Phrase": "フレーズ一致",
    "Broad": "部分一致",
}

_CAMPAIGN_TYPE_MAP = {
    "Search": "検索",
    "DynamicSearchAds": "動的検索",
    "Shopping": "ショッピング",
    "Audience": "オーディエンス",
    "PerformanceMax": "P-MAX",
    "Hotel": "ホテル",
}

_AD_TYPE_MAP = {
    "Search": "search",
    "DynamicSearchAds": "search",
    "Shopping": "display",
    "Audience": "display",
    "PerformanceMax": "display",
}


class BingAdsClient(AdPlatformClient):
    """Microsoft Advertising (Bing Ads) クライアント."""

    def __init__(self, settings: Settings, oauth_manager: OAuthManager) -> None:
        self._settings = settings
        self._oauth = oauth_manager
        self._account_id = settings.bing_ads_account_id
        self._customer_id = settings.bing_ads_customer_id
        self._authorization_data: AuthorizationData | None = None
        self._reporting_service: ServiceClient | None = None
        self._reporting_manager: ReportingServiceManager | None = None

    @property
    def platform(self) -> str:
        return "bing"

    def authenticate(self) -> None:
        """OAuth2 認証を行い SDK クライアントを初期化する."""
        creds = self._oauth.get_bing_ads_credentials()

        oauth = OAuthWebAuthCodeGrant(
            client_id=creds["client_id"],
            client_secret=creds["client_secret"],
            env=ENVIRONMENT,
            redirection_uri="https://login.microsoftonline.com/common/oauth2/nativeclient",
        )
        oauth.request_oauth_tokens_by_refresh_token(creds["refresh_token"])

        self._authorization_data = AuthorizationData(
            authentication=oauth,
            customer_id=creds["customer_id"],
            account_id=creds["account_id"],
            developer_token=creds["developer_token"],
        )

        self._reporting_service = ServiceClient(
            service="ReportingService",
            version=API_VERSION,
            authorization_data=self._authorization_data,
            environment=ENVIRONMENT,
        )

        self._reporting_manager = ReportingServiceManager(
            authorization_data=self._authorization_data,
            poll_interval_in_milliseconds=5000,
            environment=ENVIRONMENT,
        )

        logger.info(
            "Bing Ads API に認証しました (account_id=%s)", self._account_id
        )

    # ── レポートダウンロード共通 ──────────────────────────────────

    def _download_report(self, report_request) -> list[dict[str, str]]:
        """レポートをダウンロードして CSV の dict リストを返す."""
        with tempfile.TemporaryDirectory() as tmpdir:
            params = ReportingDownloadParameters(
                report_request=report_request,
                result_file_directory=tmpdir,
                result_file_name="report.csv",
                timeout_in_milliseconds=600_000,  # 10分
                overwrite_result_file=True,
            )

            result_file = self._reporting_manager.download_report(params)

            if result_file is None:
                logger.info("Bing Ads: レポートデータなし")
                return []

            # download_report は ZIP を展開して CSV ファイルを返す
            result_path = os.path.join(tmpdir, "report.csv")
            if not os.path.exists(result_path):
                # result_file がパスを返す場合
                result_path = str(result_file)

            with open(result_path, encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                return list(reader)

    def _create_time(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
        predefined: str | None = None,
    ):
        """ReportTime オブジェクトを作成する."""
        time = self._reporting_service.factory.create("ReportTime")
        if predefined:
            time.PredefinedTime = predefined
            time.CustomDateRangeStart = None
            time.CustomDateRangeEnd = None
        elif start_date and end_date:
            time.PredefinedTime = None
            start = self._reporting_service.factory.create("Date")
            start.Day = start_date.day
            start.Month = start_date.month
            start.Year = start_date.year
            end = self._reporting_service.factory.create("Date")
            end.Day = end_date.day
            end.Month = end_date.month
            end.Year = end_date.year
            time.CustomDateRangeStart = start
            time.CustomDateRangeEnd = end
        return time

    def _create_scope(self):
        """AccountThroughCampaignReportScope を作成する."""
        scope = self._reporting_service.factory.create(
            "AccountThroughCampaignReportScope"
        )
        scope.AccountIds = {"long": [int(self._account_id)]}
        return scope

    def _create_adgroup_scope(self):
        """AccountThroughAdGroupReportScope を作成する."""
        scope = self._reporting_service.factory.create(
            "AccountThroughAdGroupReportScope"
        )
        scope.AccountIds = {"long": [int(self._account_id)]}
        return scope

    @staticmethod
    def _safe_int(value: str | None) -> int:
        if not value:
            return 0
        try:
            return int(float(value.replace(",", "")))
        except (ValueError, TypeError):
            return 0

    @staticmethod
    def _safe_float(value: str | None) -> float:
        if not value:
            return 0.0
        try:
            return float(value.replace(",", "").replace("%", ""))
        except (ValueError, TypeError):
            return 0.0

    @staticmethod
    def _safe_rate(value: str | None) -> str | None:
        if not value or value == "0" or value == "0.00%":
            return None
        if "%" not in value:
            try:
                v = float(value)
                return f"{v:.2f}%" if v > 0 else None
            except (ValueError, TypeError):
                return None
        return value

    # ── キャンペーン ──────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_campaigns(self) -> list[CampaignRow]:
        request = self._reporting_service.factory.create(
            "CampaignPerformanceReportRequest"
        )
        request.Aggregation = "Summary"
        request.Format = "Csv"
        request.ExcludeReportHeader = True
        request.ExcludeReportFooter = True
        request.ExcludeColumnHeaders = False
        request.Columns.CampaignPerformanceReportColumn = [
            "CampaignId",
            "CampaignName",
            "CampaignStatus",
            "CampaignType",
            "QualityScore",
            "Impressions",
            "Clicks",
            "Spend",
            "ConversionsQualified",
        ]
        request.Time = self._create_time(predefined="Last30Days")
        request.Scope = self._create_scope()

        rows = self._download_report(request)

        seen: dict[str, CampaignRow] = {}
        for r in rows:
            cid = r.get("CampaignId", "")
            if not cid or cid in seen:
                continue

            campaign_type = r.get("CampaignType", "Search")
            seen[cid] = CampaignRow(
                id=cid,
                name=r.get("CampaignName", ""),
                platform="bing",
                ad_type=_AD_TYPE_MAP.get(campaign_type, "search"),
                type=_CAMPAIGN_TYPE_MAP.get(campaign_type, campaign_type),
                status=_STATUS_MAP.get(r.get("CampaignStatus", ""), "active"),
                daily_budget=None,  # CampaignPerformanceReport に予算カラムなし
                monthly_budget=None,
                bid_strategy=None,  # Campaign レポートには BidStrategyType がない
                optimization_score=self._safe_float(r.get("QualityScore")) or None,
            )

        campaigns = list(seen.values())
        logger.info("Bing Ads: %d キャンペーンを取得しました", len(campaigns))
        return campaigns

    # ── 広告グループ ──────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_ad_groups(self) -> list[AdGroupRow]:
        request = self._reporting_service.factory.create(
            "AdGroupPerformanceReportRequest"
        )
        request.Aggregation = "Summary"
        request.Format = "Csv"
        request.ExcludeReportHeader = True
        request.ExcludeReportFooter = True
        request.ExcludeColumnHeaders = False
        request.Columns.AdGroupPerformanceReportColumn = [
            "CampaignId",
            "AdGroupId",
            "AdGroupName",
            "Status",
            "QualityScore",
            "Impressions",
            "Clicks",
            "Spend",
            "ConversionsQualified",
            "TopImpressionRatePercent",
            "AbsoluteTopImpressionRatePercent",
        ]
        request.Time = self._create_time(predefined="Last30Days")
        request.Scope = self._create_adgroup_scope()

        rows = self._download_report(request)

        seen: dict[str, AdGroupRow] = {}
        for r in rows:
            agid = r.get("AdGroupId", "")
            if not agid or agid in seen:
                continue

            impressions = self._safe_int(r.get("Impressions"))
            clicks = self._safe_int(r.get("Clicks"))
            cost = self._safe_float(r.get("Spend"))
            conversions = self._safe_int(r.get("ConversionsQualified"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            seen[agid] = AdGroupRow(
                id=agid,
                campaign_id=r.get("CampaignId", ""),
                name=r.get("AdGroupName", ""),
                status=_STATUS_MAP.get(r.get("Status", ""), "active"),
                type="標準",
                bid_strategy=None,
                target_cpa=None,
                quality_score=self._safe_float(r.get("QualityScore")) or None,
                impressions=impressions,
                clicks=clicks,
                ctr=derived["ctr"],
                cost=cost,
                cpc=derived["cpc"],
                conversions=conversions,
                cvr=derived["cvr"],
                cpa=derived["cpa"] if conversions > 0 else None,
                top_impr_rate=self._safe_rate(
                    r.get("TopImpressionRatePercent")
                ),
                abs_top_impr_rate=self._safe_rate(
                    r.get("AbsoluteTopImpressionRatePercent")
                ),
            )

        ad_groups = list(seen.values())
        logger.info("Bing Ads: %d 広告グループを取得しました", len(ad_groups))
        return ad_groups

    # ── 広告 ──────────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_ads(self) -> list[AdRow]:
        request = self._reporting_service.factory.create(
            "AdPerformanceReportRequest"
        )
        request.Aggregation = "Summary"
        request.Format = "Csv"
        request.ExcludeReportHeader = True
        request.ExcludeReportFooter = True
        request.ExcludeColumnHeaders = False
        request.Columns.AdPerformanceReportColumn = [
            "AdGroupId",
            "AdId",
            "AdType",
            "TitlePart1",
            "TitlePart2",
            "TitlePart3",
            "AdDescription",
            "AdDescription2",
            "FinalUrl",
            "Impressions",
            "Clicks",
            "Spend",
            "ConversionsQualified",
        ]
        request.Time = self._create_time(predefined="Last30Days")
        request.Scope = self._create_adgroup_scope()

        rows = self._download_report(request)

        seen: dict[str, AdRow] = {}
        for r in rows:
            ad_id = r.get("AdId", "")
            if not ad_id or ad_id in seen:
                continue

            impressions = self._safe_int(r.get("Impressions"))
            clicks = self._safe_int(r.get("Clicks"))
            cost = self._safe_float(r.get("Spend"))
            conversions = self._safe_int(r.get("ConversionsQualified"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            ad_type = r.get("AdType", "")
            ad_format_map = {
                "ResponsiveSearchAd": "レスポンシブ検索",
                "ExpandedText": "拡張テキスト",
                "ResponsiveAd": "レスポンシブディスプレイ",
                "Image": "イメージ",
                "DynamicSearch": "動的検索",
            }

            seen[ad_id] = AdRow(
                id=ad_id,
                ad_group_id=r.get("AdGroupId", ""),
                name=r.get("TitlePart1", "") or f"広告 {ad_id}",
                status="active",  # Ad レポートには status がない
                ad_format=ad_format_map.get(ad_type, ad_type),
                headline_1=r.get("TitlePart1") or None,
                headline_2=r.get("TitlePart2") or None,
                headline_3=r.get("TitlePart3") or None,
                description_1=r.get("AdDescription") or None,
                description_2=r.get("AdDescription2") or None,
                final_url=r.get("FinalUrl") or None,
                impressions=impressions,
                clicks=clicks,
                ctr=derived["ctr"],
                cost=cost,
                cpc=derived["cpc"],
                conversions=conversions,
                cpa=derived["cpa"] if conversions > 0 else None,
            )

        ads = list(seen.values())
        logger.info("Bing Ads: %d 広告を取得しました", len(ads))
        return ads

    # ── キーワード ────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_keywords(self) -> list[KeywordRow]:
        request = self._reporting_service.factory.create(
            "KeywordPerformanceReportRequest"
        )
        request.Aggregation = "Summary"
        request.Format = "Csv"
        request.ExcludeReportHeader = True
        request.ExcludeReportFooter = True
        request.ExcludeColumnHeaders = False
        request.Columns.KeywordPerformanceReportColumn = [
            "AdGroupId",
            "KeywordId",
            "Keyword",
            "KeywordStatus",
            "BidMatchType",
            "QualityScore",
            "Impressions",
            "Clicks",
            "Spend",
            "ConversionsQualified",
            "TopImpressionRatePercent",
            "AbsoluteTopImpressionRatePercent",
        ]
        request.Time = self._create_time(predefined="Last30Days")
        request.Scope = self._create_adgroup_scope()

        rows = self._download_report(request)

        seen: dict[str, KeywordRow] = {}
        for r in rows:
            kw_id = r.get("KeywordId", "")
            if not kw_id or kw_id in seen:
                continue

            impressions = self._safe_int(r.get("Impressions"))
            clicks = self._safe_int(r.get("Clicks"))
            cost = self._safe_float(r.get("Spend"))
            conversions = self._safe_int(r.get("ConversionsQualified"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            match_type = r.get("BidMatchType", "")

            seen[kw_id] = KeywordRow(
                id=kw_id,
                ad_group_id=r.get("AdGroupId", ""),
                keyword=r.get("Keyword", ""),
                match_type=_MATCH_TYPE_MAP.get(match_type, match_type),
                status=_STATUS_MAP.get(r.get("KeywordStatus", ""), "active"),
                quality_score=self._safe_float(r.get("QualityScore")) or None,
                impressions=impressions,
                clicks=clicks,
                ctr=derived["ctr"],
                cost=cost,
                cpc=derived["cpc"],
                conversions=conversions,
                cvr=derived["cvr"],
                cpa=derived["cpa"] if conversions > 0 else None,
                top_impr_rate=self._safe_rate(
                    r.get("TopImpressionRatePercent")
                ),
                abs_top_impr_rate=self._safe_rate(
                    r.get("AbsoluteTopImpressionRatePercent")
                ),
            )

        keywords = list(seen.values())
        logger.info("Bing Ads: %d キーワードを取得しました", len(keywords))
        return keywords

    # ── 日次指標 ──────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_daily_metrics(
        self, start_date: date, end_date: date
    ) -> list[DailyMetricRow]:
        request = self._reporting_service.factory.create(
            "CampaignPerformanceReportRequest"
        )
        request.Aggregation = "Daily"
        request.Format = "Csv"
        request.ExcludeReportHeader = True
        request.ExcludeReportFooter = True
        request.ExcludeColumnHeaders = False
        request.Columns.CampaignPerformanceReportColumn = [
            "TimePeriod",
            "CampaignId",
            "Impressions",
            "Clicks",
            "Spend",
            "ConversionsQualified",
        ]
        request.Time = self._create_time(start_date=start_date, end_date=end_date)
        request.Scope = self._create_scope()

        rows = self._download_report(request)

        metrics = []
        for r in rows:
            day_str = r.get("TimePeriod", "")
            if not day_str:
                continue

            # TimePeriod フォーマット: "2026-04-01" or "4/1/2026"
            try:
                if "-" in day_str:
                    d = date.fromisoformat(day_str)
                else:
                    parts = day_str.split("/")
                    d = date(int(parts[2]), int(parts[0]), int(parts[1]))
            except (ValueError, IndexError):
                logger.warning("Bing Ads: 日付パース失敗: %s", day_str)
                continue

            impressions = self._safe_int(r.get("Impressions"))
            clicks = self._safe_int(r.get("Clicks"))
            cost = self._safe_float(r.get("Spend"))
            conversions = self._safe_int(r.get("ConversionsQualified"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            metrics.append(
                DailyMetricRow(
                    date=d,
                    campaign_id=r.get("CampaignId", ""),
                    platform="bing",
                    impressions=impressions,
                    clicks=clicks,
                    cost=cost,
                    conversions=conversions,
                    ctr=derived["ctr"],
                    cpc=derived["cpc"],
                    cpa=derived["cpa"],
                    cvr=derived["cvr"],
                )
            )

        logger.info(
            "Bing Ads: %d 日次指標を取得しました (%s〜%s)",
            len(metrics),
            start_date,
            end_date,
        )
        return metrics

    # ── 検索語句レポート ──────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_search_term_report(
        self, start_date: date, end_date: date
    ) -> list[SearchTermRow]:
        request = self._reporting_service.factory.create(
            "SearchQueryPerformanceReportRequest"
        )
        request.Aggregation = "Daily"
        request.Format = "Csv"
        request.ExcludeReportHeader = True
        request.ExcludeReportFooter = True
        request.ExcludeColumnHeaders = False
        request.Columns.SearchQueryPerformanceReportColumn = [
            "TimePeriod",
            "CampaignId",
            "CampaignName",
            "SearchQuery",
            "Impressions",
            "Clicks",
            "Spend",
            "ConversionsQualified",
        ]
        request.Time = self._create_time(start_date=start_date, end_date=end_date)
        request.Scope = self._create_adgroup_scope()

        rows = self._download_report(request)

        terms = []
        for r in rows:
            day_str = r.get("TimePeriod", "")
            query = r.get("SearchQuery", "")
            if not day_str or not query:
                continue

            try:
                if "-" in day_str:
                    d = date.fromisoformat(day_str)
                else:
                    parts = day_str.split("/")
                    d = date(int(parts[2]), int(parts[0]), int(parts[1]))
            except (ValueError, IndexError):
                continue

            impressions = self._safe_int(r.get("Impressions"))
            clicks = self._safe_int(r.get("Clicks"))
            cost = self._safe_float(r.get("Spend"))
            conversions = self._safe_int(r.get("ConversionsQualified"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            terms.append(
                SearchTermRow(
                    date=d,
                    platform="bing",
                    campaign_id=r.get("CampaignId", ""),
                    campaign_name=r.get("CampaignName", ""),
                    search_term=query,
                    impressions=impressions,
                    clicks=clicks,
                    cost=cost,
                    conversions=conversions,
                    ctr=derived["ctr"],
                    cpa=derived["cpa"],
                )
            )

        logger.info(
            "Bing Ads: %d 検索語句を取得しました (%s〜%s)",
            len(terms),
            start_date,
            end_date,
        )
        return terms
