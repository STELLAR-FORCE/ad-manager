"""Google Ads API クライアント.

google-ads Python SDK を使用して GAQL でデータを取得する。
コスト値は micros（1/1,000,000）で返されるため円に変換する。
"""

from __future__ import annotations

from datetime import date

from google.ads.googleads.client import GoogleAdsClient

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

# Google Ads の cost は micros 単位。JPY は小数なしなので整数に丸める。
MICROS = 1_000_000


def _micros_to_jpy(micros: int) -> float:
    """micros 値を日本円に変換する."""
    return round(micros / MICROS)


def _format_date(d: date) -> str:
    """date を GAQL の日付リテラル形式に変換する."""
    return d.strftime("%Y-%m-%d")


# ── キャンペーンタイプのマッピング ────────────────────────────────

_CAMPAIGN_TYPE_MAP = {
    "SEARCH": "検索",
    "DISPLAY": "ディスプレイ",
    "SHOPPING": "ショッピング",
    "VIDEO": "動画",
    "PERFORMANCE_MAX": "P-MAX",
    "DEMAND_GEN": "デマンドジェネレーション",
    "SMART": "スマート",
    "LOCAL": "ローカル",
}

_AD_TYPE_MAP = {
    "SEARCH": "search",
    "DISPLAY": "display",
    "SHOPPING": "display",
    "VIDEO": "display",
    "PERFORMANCE_MAX": "display",
    "DEMAND_GEN": "display",
    "SMART": "search",
    "LOCAL": "display",
}

_STATUS_MAP = {
    "ENABLED": "active",
    "PAUSED": "paused",
    "REMOVED": "ended",
}

_BID_STRATEGY_MAP = {
    "TARGET_CPA": "目標CPA",
    "TARGET_ROAS": "目標ROAS",
    "MAXIMIZE_CONVERSIONS": "CV最大化",
    "MAXIMIZE_CONVERSION_VALUE": "CV値最大化",
    "MAXIMIZE_CLICKS": "クリック最大化",
    "MANUAL_CPC": "手動CPC",
    "ENHANCED_CPC": "拡張CPC",
    "MANUAL_CPM": "手動CPM",
    "TARGET_IMPRESSION_SHARE": "目標IS",
}

_MATCH_TYPE_MAP = {
    "EXACT": "完全一致",
    "PHRASE": "フレーズ一致",
    "BROAD": "部分一致",
}

_AD_FORMAT_MAP = {
    "RESPONSIVE_SEARCH_AD": "レスポンシブ検索",
    "EXPANDED_TEXT_AD": "拡張テキスト",
    "RESPONSIVE_DISPLAY_AD": "レスポンシブディスプレイ",
    "IMAGE_AD": "イメージ",
    "VIDEO_AD": "動画",
    "APP_AD": "アプリ",
}


class GoogleAdsClient_(AdPlatformClient):
    """Google Ads API クライアント."""

    def __init__(self, settings: Settings, oauth_manager: OAuthManager) -> None:
        self._settings = settings
        self._oauth = oauth_manager
        self._client: GoogleAdsClient | None = None
        self._customer_id = settings.google_ads_customer_id

    @property
    def platform(self) -> str:
        return "google"

    def authenticate(self) -> None:
        """Google Ads SDK クライアントを初期化する."""
        credentials = self._oauth.get_google_ads_credentials()
        config = {
            "developer_token": credentials["developer_token"],
            "client_id": credentials["client_id"],
            "client_secret": credentials["client_secret"],
            "refresh_token": credentials["refresh_token"],
            "use_proto_plus": True,
        }
        if credentials.get("login_customer_id"):
            config["login_customer_id"] = credentials["login_customer_id"]

        self._client = GoogleAdsClient.load_from_dict(config)
        logger.info("Google Ads API に認証しました (customer_id=%s)", self._customer_id)

    def _search(self, query: str) -> list:
        """GAQL クエリを実行して結果リストを返す."""
        service = self._client.get_service("GoogleAdsService")
        response = service.search(customer_id=self._customer_id, query=query)
        return list(response)

    # ── キャンペーン ──────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_campaigns(self) -> list[CampaignRow]:
        query = """
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                campaign.bidding_strategy_type,
                campaign.optimization_score,
                campaign_budget.amount_micros
            FROM campaign
            WHERE campaign.status != 'REMOVED'
        """
        rows = self._search(query)
        campaigns = []
        for row in rows:
            c = row.campaign
            channel = c.advertising_channel_type.name
            bid_type = c.bidding_strategy_type.name

            campaigns.append(
                CampaignRow(
                    id=str(c.id),
                    name=c.name,
                    platform="google",
                    ad_type=_AD_TYPE_MAP.get(channel, "search"),
                    type=_CAMPAIGN_TYPE_MAP.get(channel, channel),
                    status=_STATUS_MAP.get(c.status.name, c.status.name.lower()),
                    daily_budget=_micros_to_jpy(row.campaign_budget.amount_micros)
                    if row.campaign_budget.amount_micros
                    else None,
                    monthly_budget=None,  # Google は日予算ベース
                    bid_strategy=_BID_STRATEGY_MAP.get(bid_type, bid_type),
                    optimization_score=round(c.optimization_score * 100, 2)
                    if c.optimization_score
                    else None,
                )
            )

        logger.info("Google Ads: %d キャンペーンを取得しました", len(campaigns))
        return campaigns

    # ── 広告グループ ──────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_ad_groups(self) -> list[AdGroupRow]:
        query = """
            SELECT
                ad_group.id,
                ad_group.name,
                ad_group.status,
                ad_group.type,
                campaign.id,
                campaign.bidding_strategy_type,
                ad_group.cpc_bid_micros,
                ad_group.target_cpa_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.average_cpc,
                ad_group_criterion.quality_info.quality_score
            FROM ad_group
            WHERE ad_group.status != 'REMOVED'
        """
        # quality_score は ad_group レベルでは取得不可な場合がある。
        # その場合は別クエリが必要だが、まずはこの形で取得を試みる。
        try:
            rows = self._search(query)
        except Exception:
            # quality_score 抜きで再取得
            query_no_qs = """
                SELECT
                    ad_group.id,
                    ad_group.name,
                    ad_group.status,
                    ad_group.type,
                    campaign.id,
                    campaign.bidding_strategy_type,
                    ad_group.target_cpa_micros,
                    metrics.impressions,
                    metrics.clicks,
                    metrics.cost_micros,
                    metrics.conversions
                FROM ad_group
                WHERE ad_group.status != 'REMOVED'
            """
            rows = self._search(query_no_qs)

        ad_groups = []
        for row in rows:
            ag = row.ad_group
            m = row.metrics
            bid_type = row.campaign.bidding_strategy_type.name
            impressions = m.impressions
            clicks = m.clicks
            cost = _micros_to_jpy(m.cost_micros)
            conversions = int(m.conversions)
            derived = compute_metrics(impressions, clicks, cost, conversions)

            ad_groups.append(
                AdGroupRow(
                    id=str(ag.id),
                    campaign_id=str(row.campaign.id),
                    name=ag.name,
                    status=_STATUS_MAP.get(ag.status.name, ag.status.name.lower()),
                    type=ag.type.name if ag.type else "標準",
                    bid_strategy=_BID_STRATEGY_MAP.get(bid_type, bid_type),
                    target_cpa=_micros_to_jpy(ag.target_cpa_micros)
                    if ag.target_cpa_micros
                    else None,
                    quality_score=None,  # 広告グループ単位では取得困難
                    impressions=impressions,
                    clicks=clicks,
                    ctr=derived["ctr"],
                    cost=cost,
                    cpc=derived["cpc"],
                    conversions=conversions,
                    cvr=derived["cvr"],
                    cpa=derived["cpa"] if conversions > 0 else None,
                )
            )

        logger.info("Google Ads: %d 広告グループを取得しました", len(ad_groups))
        return ad_groups

    # ── 広告 ──────────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_ads(self) -> list[AdRow]:
        query = """
            SELECT
                ad_group_ad.ad.id,
                ad_group_ad.ad.name,
                ad_group_ad.ad.type,
                ad_group_ad.status,
                ad_group_ad.ad.final_urls,
                ad_group_ad.ad.responsive_search_ad.headlines,
                ad_group_ad.ad.responsive_search_ad.descriptions,
                ad_group_ad.ad.image_ad.image_url,
                ad_group.id,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions
            FROM ad_group_ad
            WHERE ad_group_ad.status != 'REMOVED'
        """
        rows = self._search(query)
        ads = []
        for row in rows:
            ad = row.ad_group_ad.ad
            m = row.metrics
            impressions = m.impressions
            clicks = m.clicks
            cost = _micros_to_jpy(m.cost_micros)
            conversions = int(m.conversions)
            derived = compute_metrics(impressions, clicks, cost, conversions)

            # レスポンシブ検索広告の見出し・説明文を抽出
            headlines = []
            descriptions = []
            if ad.responsive_search_ad:
                headlines = [h.text for h in ad.responsive_search_ad.headlines[:3]]
                descriptions = [
                    d.text for d in ad.responsive_search_ad.descriptions[:2]
                ]

            ad_type_name = ad.type.name if ad.type else "UNKNOWN"

            ads.append(
                AdRow(
                    id=str(ad.id),
                    ad_group_id=str(row.ad_group.id),
                    name=ad.name or f"広告 {ad.id}",
                    status=_STATUS_MAP.get(
                        row.ad_group_ad.status.name,
                        row.ad_group_ad.status.name.lower(),
                    ),
                    ad_format=_AD_FORMAT_MAP.get(ad_type_name, ad_type_name),
                    headline_1=headlines[0] if len(headlines) > 0 else None,
                    headline_2=headlines[1] if len(headlines) > 1 else None,
                    headline_3=headlines[2] if len(headlines) > 2 else None,
                    description_1=descriptions[0] if len(descriptions) > 0 else None,
                    description_2=descriptions[1] if len(descriptions) > 1 else None,
                    final_url=ad.final_urls[0] if ad.final_urls else None,
                    impressions=impressions,
                    clicks=clicks,
                    ctr=derived["ctr"],
                    cost=cost,
                    cpc=derived["cpc"],
                    conversions=conversions,
                    cpa=derived["cpa"] if conversions > 0 else None,
                )
            )

        logger.info("Google Ads: %d 広告を取得しました", len(ads))
        return ads

    # ── キーワード ────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_keywords(self) -> list[KeywordRow]:
        query = """
            SELECT
                ad_group_criterion.criterion_id,
                ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type,
                ad_group_criterion.status,
                ad_group_criterion.quality_info.quality_score,
                ad_group.id,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.search_impression_share,
                metrics.search_top_impression_share,
                metrics.search_absolute_top_impression_share
            FROM keyword_view
        """
        rows = self._search(query)
        keywords = []
        for row in rows:
            kw = row.ad_group_criterion
            m = row.metrics
            impressions = m.impressions
            clicks = m.clicks
            cost = _micros_to_jpy(m.cost_micros)
            conversions = int(m.conversions)
            derived = compute_metrics(impressions, clicks, cost, conversions)

            match_type = kw.keyword.match_type.name if kw.keyword.match_type else ""
            quality = (
                kw.quality_info.quality_score if kw.quality_info else None
            )

            # IS はパーセント文字列に変換
            top_is = (
                f"{m.search_top_impression_share:.2%}"
                if m.search_top_impression_share
                else None
            )
            abs_top_is = (
                f"{m.search_absolute_top_impression_share:.2%}"
                if m.search_absolute_top_impression_share
                else None
            )

            keywords.append(
                KeywordRow(
                    id=str(kw.criterion_id),
                    ad_group_id=str(row.ad_group.id),
                    keyword=kw.keyword.text,
                    match_type=_MATCH_TYPE_MAP.get(match_type, match_type),
                    status=_STATUS_MAP.get(kw.status.name, kw.status.name.lower()),
                    quality_score=quality,
                    impressions=impressions,
                    clicks=clicks,
                    ctr=derived["ctr"],
                    cost=cost,
                    cpc=derived["cpc"],
                    conversions=conversions,
                    cvr=derived["cvr"],
                    cpa=derived["cpa"] if conversions > 0 else None,
                    top_impr_rate=top_is,
                    abs_top_impr_rate=abs_top_is,
                )
            )

        logger.info("Google Ads: %d キーワードを取得しました", len(keywords))
        return keywords

    # ── 日次指標 ──────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_daily_metrics(
        self, start_date: date, end_date: date
    ) -> list[DailyMetricRow]:
        query = f"""
            SELECT
                segments.date,
                campaign.id,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions
            FROM campaign
            WHERE segments.date BETWEEN '{_format_date(start_date)}'
                AND '{_format_date(end_date)}'
        """
        rows = self._search(query)
        metrics = []
        for row in rows:
            m = row.metrics
            impressions = m.impressions
            clicks = m.clicks
            cost = _micros_to_jpy(m.cost_micros)
            conversions = int(m.conversions)
            derived = compute_metrics(impressions, clicks, cost, conversions)

            metrics.append(
                DailyMetricRow(
                    date=date.fromisoformat(row.segments.date),
                    campaign_id=str(row.campaign.id),
                    platform="google",
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
            "Google Ads: %d 日次指標を取得しました (%s〜%s)",
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
        query = f"""
            SELECT
                search_term_view.search_term,
                segments.date,
                campaign.id,
                campaign.name,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions
            FROM search_term_view
            WHERE segments.date BETWEEN '{_format_date(start_date)}'
                AND '{_format_date(end_date)}'
        """
        rows = self._search(query)

        # search_term_view は (search_term × ad_group) 粒度で返るため、
        # MERGE キー (date, campaign_id, search_term) に合わせてここで集約する
        aggregated: dict[tuple[str, str, str], dict] = {}
        for row in rows:
            key = (
                row.segments.date,
                str(row.campaign.id),
                row.search_term_view.search_term,
            )
            entry = aggregated.setdefault(
                key,
                {
                    "campaign_name": row.campaign.name,
                    "impressions": 0,
                    "clicks": 0,
                    "cost_micros": 0,
                    "conversions": 0.0,
                },
            )
            entry["impressions"] += row.metrics.impressions
            entry["clicks"] += row.metrics.clicks
            entry["cost_micros"] += row.metrics.cost_micros
            entry["conversions"] += row.metrics.conversions

        terms = []
        for (seg_date, campaign_id, search_term), entry in aggregated.items():
            impressions = entry["impressions"]
            clicks = entry["clicks"]
            cost = _micros_to_jpy(entry["cost_micros"])
            conversions = int(entry["conversions"])
            derived = compute_metrics(impressions, clicks, cost, conversions)

            terms.append(
                SearchTermRow(
                    date=date.fromisoformat(seg_date),
                    platform="google",
                    campaign_id=campaign_id,
                    campaign_name=entry["campaign_name"],
                    search_term=search_term,
                    impressions=impressions,
                    clicks=clicks,
                    cost=cost,
                    conversions=conversions,
                    ctr=derived["ctr"],
                    cpa=derived["cpa"],
                )
            )

        logger.info(
            "Google Ads: %d 検索語句を取得しました (%s〜%s)",
            len(terms),
            start_date,
            end_date,
        )
        return terms
