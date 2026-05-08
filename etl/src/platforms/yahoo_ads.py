"""Yahoo!広告 API クライアント.

REST API を直接叩く（公式SDKなし）。
検索広告とディスプレイ広告でベースURLが異なるが、OAuth2 トークンは共通。
レポートは非同期ダウンロード方式（ジョブ作成 → ポーリング → CSV DL）。
"""

from __future__ import annotations

import csv
import io
from datetime import date

import httpx

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
from src.utils.retry import poll_until_complete, with_retry

logger = get_logger(__name__)

# ── API ベース URL ────────────────────────────────────────────────

SEARCH_API_BASE = "https://ads-search.yahooapis.jp/api/v18"
DISPLAY_API_BASE = "https://ads-display.yahooapis.jp/api/v19"

# ── ステータスマッピング ──────────────────────────────────────────

_STATUS_MAP = {
    # v18 DISTRIBUTION_STATUS 値
    "SERVING": "active",
    "ENDED": "ended",
    "PENDING": "paused",
    "STOP": "paused",
    # ディスプレイ広告
    "ACTIVE": "active",
    # EN 表示名
    "ON": "active",
    "OFF": "paused",
    # 旧互換
    "ENABLED": "active",
    "PAUSED": "paused",
    "REMOVED": "ended",
}

_BID_STRATEGY_MAP = {
    "TARGET_CPA": "目標CPA",
    "TARGET_ROAS": "目標ROAS",
    "MAXIMIZE_CONVERSIONS": "CV最大化",
    "MAXIMIZE_CLICKS": "クリック最大化",
    "MANUAL_CPC": "手動CPC",
    "ENHANCED_CPC": "拡張CPC",
    "TARGET_SPEND": "予算内で最大化",
    # EN 表示名（reportLanguage=EN 時の CSV 値）
    "Maximize Conversions": "CV最大化",
    "Maximize Clicks": "クリック最大化",
    "Target CPA": "目標CPA",
    "Target ROAS": "目標ROAS",
    "Manual CPC": "手動CPC",
    "Enhanced CPC": "拡張CPC",
    "Target Spend": "予算内で最大化",
}

_MATCH_TYPE_MAP = {
    "EXACT": "完全一致",
    "PHRASE": "フレーズ一致",
    "BROAD": "部分一致",
    # EN 表示名
    "Exact match": "完全一致",
    "Phrase match": "フレーズ一致",
    "Broad match": "部分一致",
}

# ── レポートフィールド定義 ────────────────────────────────────────

# 検索広告レポート
# v18 フィールド名
# https://ads-developers.yahoo.co.jp/reference/ads-search-api/v18/
SEARCH_CAMPAIGN_REPORT_FIELDS = [
    "CAMPAIGN_ID",
    "CAMPAIGN_NAME",
    "CAMPAIGN_TYPE",
    "CAMPAIGN_DISTRIBUTION_STATUS",
    "DAILY_SPENDING_LIMIT",
    "BID_STRATEGY_TYPE",
    "DAY",
    "IMPS",
    "CLICKS",
    "COST",
    "CONVERSIONS",
]

SEARCH_ADGROUP_REPORT_FIELDS = [
    "CAMPAIGN_ID",
    "ADGROUP_ID",
    "ADGROUP_NAME",
    "ADGROUP_DISTRIBUTION_SETTINGS",
    "DAY",
    "IMPS",
    "CLICKS",
    "COST",
    "CONVERSIONS",
    "TOP_IMPRESSION_PERCENTAGE",
    "ABSOLUTE_TOP_IMPRESSION_PERCENTAGE",
]

SEARCH_AD_REPORT_FIELDS = [
    "ADGROUP_ID",
    "AD_ID",
    "AD_NAME",
    "AD_TYPE",
    "AD_DISTRIBUTION_SETTINGS",
    "TITLE1",
    "TITLE2",
    "TITLE3",
    "DESCRIPTION1",
    "DESCRIPTION2",
    "FINAL_URL",
    "IMPS",
    "CLICKS",
    "COST",
    "CONVERSIONS",
]

SEARCH_KEYWORD_REPORT_FIELDS = [
    "ADGROUP_ID",
    "KEYWORD_ID",
    "KEYWORD",
    "KEYWORD_MATCH_TYPE",
    "KEYWORD_DISTRIBUTION_SETTINGS",
    "QUALITY_INDEX",
    "IMPS",
    "CLICKS",
    "COST",
    "CONVERSIONS",
    "TOP_IMPRESSION_PERCENTAGE",
    "ABSOLUTE_TOP_IMPRESSION_PERCENTAGE",
]

SEARCH_DAILY_REPORT_FIELDS = [
    "CAMPAIGN_ID",
    "DAY",
    "IMPS",
    "CLICKS",
    "COST",
    "CONVERSIONS",
]

SEARCH_QUERY_REPORT_FIELDS = [
    "CAMPAIGN_ID",
    "CAMPAIGN_NAME",
    "SEARCH_QUERY",
    "DAY",
    "IMPS",
    "CLICKS",
    "COST",
    "CONVERSIONS",
]


# ── CSV ヘッダー（EN表示名）→ API フィールド名マッピング ──────────

_CSV_EN_HEADER_TO_FIELD: dict[str, str] = {
    # 検索広告（v18）EN ヘッダー
    "CampaignID": "CAMPAIGN_ID",
    "Campaign name": "CAMPAIGN_NAME",
    "Campaign type": "CAMPAIGN_TYPE",
    "Distribution Status": "CAMPAIGN_DISTRIBUTION_STATUS",
    "Distribution Settings": "DISTRIBUTION_SETTINGS",
    "Daily Spending Limit": "DAILY_SPENDING_LIMIT",
    "Bid strategy": "BID_STRATEGY_TYPE",
    "Day": "DAY",
    "Impressions": "IMPS",
    "Clicks": "CLICKS",
    "Cost": "COST",
    "Conversions": "CONVERSIONS",
    "Ad group ID": "ADGROUP_ID",
    "Ad group name": "ADGROUP_NAME",
    "Search top impression rate": "TOP_IMPRESSION_PERCENTAGE",
    "Search absolute top impression rate": "ABSOLUTE_TOP_IMPRESSION_PERCENTAGE",
    "Ad ID": "AD_ID",
    "Ad Name": "AD_NAME",
    "Ad Type": "AD_TYPE",
    "Title1": "TITLE1",
    "Title2": "TITLE2",
    "Title3": "TITLE3",
    "Description 1": "DESCRIPTION1",
    "Description 2": "DESCRIPTION2",
    "Final URL": "FINAL_URL",
    "Keyword ID": "KEYWORD_ID",
    "Keyword": "KEYWORD",
    "Match Type": "KEYWORD_MATCH_TYPE",
    "Quality index": "QUALITY_INDEX",
    "Search Query": "SEARCH_QUERY",
    # ディスプレイ広告（v19）EN ヘッダー
    "Campaign ID": "CAMPAIGN_ID",
    "Campaign Name": "CAMPAIGN_NAME",
    "Campaign Type": "CAMPAIGN_TYPE",
    "Daily": "DAY",
    "Ad Group ID": "ADGROUP_ID",
    "Ad Group Name": "ADGROUP_NAME",
    "Display URL": "DISPLAY_URL",
    "Tracking URL": "TRACKING_URL",
    "Impression Share": "IMPRESSION_SHARE",
}


class YahooAdsClient(AdPlatformClient):
    """Yahoo!広告 API クライアント."""

    def __init__(self, settings: Settings, oauth_manager: OAuthManager) -> None:
        self._settings = settings
        self._oauth = oauth_manager
        # MCC ベースアカウントID（x-z-base-account-id ヘッダー用）
        self._base_account_id = settings.yahoo_ads_base_account_id
        # 検索・ディスプレイ別のアカウントID（リクエストボディ用）
        self._search_account_id = (
            settings.yahoo_ads_search_account_id
            or settings.yahoo_ads_account_id
        )
        self._display_account_id = settings.yahoo_ads_display_account_id
        self._access_token: str | None = None

    @property
    def platform(self) -> str:
        return "yahoo"

    def authenticate(self) -> None:
        """OAuth2 アクセストークンを取得する."""
        self._access_token = self._oauth.get_yahoo_access_token()
        logger.info(
            "Yahoo!広告 API に認証しました (search=%s, display=%s)",
            self._search_account_id,
            self._display_account_id or "未設定",
        )

    def _account_id_for(self, base_url: str) -> str:
        """API ベース URL に対応するアカウントIDを返す."""
        if base_url == DISPLAY_API_BASE and self._display_account_id:
            return self._display_account_id
        return self._search_account_id

    def _headers(self, base_url: str | None = None) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }
        if self._base_account_id:
            headers["x-z-base-account-id"] = self._base_account_id
        return headers

    # ── 汎用 API 呼び出し ────────────────────────────────────────

    @with_retry(max_attempts=3, retryable_exceptions=(httpx.HTTPStatusError,))
    def _post(self, base_url: str, service: str, action: str, body: dict) -> dict:
        """Yahoo! 広告 API に POST リクエストを送る."""
        url = f"{base_url}/{service}/{action}"
        response = httpx.post(
            url,
            json=body,
            headers=self._headers(base_url),
            timeout=60,
        )
        if response.status_code >= 400:
            logger.error(
                "Yahoo! API エラー: %s %s → %d\nリクエストボディ: %s\nレスポンスボディ: %s",
                "POST", url, response.status_code, body, response.text,
            )
        response.raise_for_status()
        return response.json()

    def _post_download(self, base_url: str, service: str, body: dict) -> str:
        """レポートをダウンロードして CSV テキストを返す."""
        url = f"{base_url}/{service}/download"
        response = httpx.post(
            url,
            json=body,
            headers=self._headers(base_url),
            timeout=120,
        )
        response.raise_for_status()
        return response.text

    # ── レポート生成・ダウンロード共通フロー ──────────────────────

    def _request_report(
        self,
        base_url: str,
        fields: list[str],
        report_type: str,
        date_range_type: str = "CUSTOM_DATE",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> str:
        """レポートジョブを作成し、完了を待ち、CSV テキストを返す."""
        # 1. レポートジョブ作成
        acct_id = int(self._account_id_for(base_url))
        import time
        report_name = f"etl_{report_type}_{int(time.time())}"
        is_display = base_url == DISPLAY_API_BASE
        operand: dict = {
            "accountId": acct_id,
            "reportName": report_name,
            "fields": fields,
            "reportDateRangeType": date_range_type,
            "reportDownloadFormat": "CSV",
            "reportDownloadEncode": "UTF8",
            "reportLanguage": "EN",
            "reportSkipReportSummary": "TRUE",
            # 削除済み・停止済みも含めて取得する（過去キャンペーンのバックフィル整合性のため）
            "reportIncludeDeleted": "TRUE",
        }
        # Display Ads API v19 には reportType フィールドがない
        if not is_display:
            operand["reportType"] = report_type

        if date_range_type == "CUSTOM_DATE" and start_date and end_date:
            operand["dateRange"] = {
                "startDate": start_date.strftime("%Y%m%d"),
                "endDate": end_date.strftime("%Y%m%d"),
            }

        add_body = {
            "accountId": acct_id,
            "operand": [operand],
        }

        result = self._post(base_url, "ReportDefinitionService", "add", add_body)
        logger.debug("Yahoo! レポートジョブ作成レスポンス: %s", result)
        values = result.get("rval", {}).get("values", [])
        if not values or not values[0].get("operationSucceeded"):
            errors = values[0].get("errors", []) if values else []
            logger.error(
                "Yahoo! レポートジョブ作成に失敗 (rval=%s)",
                result.get("rval"),
            )
            raise RuntimeError(f"Yahoo! レポートジョブ作成に失敗: {errors}")

        report_job_id = values[0]["reportDefinition"]["reportJobId"]
        logger.info("Yahoo! レポートジョブを作成しました (jobId=%s)", report_job_id)

        # 2. ポーリングで完了を待つ
        def check_status() -> str:
            get_body = {
                "accountId": acct_id,
                "reportJobIds": [report_job_id],
            }
            resp = self._post(
                base_url, "ReportDefinitionService", "get", get_body
            )
            vals = resp.get("rval", {}).get("values", [])
            if not vals:
                return "WAIT"
            return vals[0].get("reportDefinition", {}).get("reportJobStatus", "WAIT")

        poll_until_complete(
            check_fn=check_status,
            complete_statuses={"COMPLETED"},
            failed_statuses={"FAILED", "CANCELED"},
            initial_delay=5.0,
            max_delay=30.0,
            timeout=600.0,
        )

        # 3. ダウンロード
        download_body = {
            "accountId": acct_id,
            "reportJobId": report_job_id,
        }
        csv_text = self._post_download(
            base_url, "ReportDefinitionService", download_body
        )
        logger.info(
            "Yahoo! レポートをダウンロードしました (jobId=%s, %d bytes)",
            report_job_id,
            len(csv_text),
        )
        return csv_text

    def _parse_csv(self, csv_text: str) -> list[dict[str, str]]:
        """Yahoo! レポートの CSV を dict のリストにパースする.

        Yahoo! のレポート CSV は先頭数行にメタ情報、末尾に集計行が含まれる場合がある。
        ヘッダー行を見つけてそこから DictReader でパースする。
        """
        lines = csv_text.strip().split("\n")

        # ヘッダー行を探す（カラム名が含まれる最初の行）
        header_idx = 0
        for i, line in enumerate(lines):
            # メタ行（"--" で始まる等）をスキップ
            if line.startswith('"') or "," in line:
                header_idx = i
                break

        # 末尾の集計行を除外（空行 or "合計" 等）
        data_lines = []
        for line in lines[header_idx:]:
            stripped = line.strip()
            if not stripped or stripped.startswith("--") or stripped.startswith("合計") or stripped.startswith("Total"):
                continue
            data_lines.append(stripped)

        if len(data_lines) < 2:
            return []

        # ヘッダー行の表示名を API フィールド名にリマップ
        header_line = data_lines[0]
        headers = next(csv.reader(io.StringIO(header_line)))
        mapped_headers = [
            _CSV_EN_HEADER_TO_FIELD.get(h.strip(), h.strip()) for h in headers
        ]
        data_lines[0] = ",".join(mapped_headers)

        reader = csv.DictReader(io.StringIO("\n".join(data_lines)))
        return list(reader)

    # ── 安全な数値変換 ────────────────────────────────────────────

    @staticmethod
    def _safe_int(value: str | None) -> int:
        if not value or value == "--":
            return 0
        try:
            return int(float(value.replace(",", "")))
        except (ValueError, TypeError):
            return 0

    @staticmethod
    def _safe_float(value: str | None) -> float:
        if not value or value == "--":
            return 0.0
        try:
            return float(value.replace(",", ""))
        except (ValueError, TypeError):
            return 0.0

    @staticmethod
    def _safe_rate(value: str | None) -> str | None:
        """パーセント文字列をそのまま返す。無効値は None。"""
        if not value or value == "--":
            return None
        return value

    # ── キャンペーン ──────────────────────────────────────────────

    def _date_range_kwargs(
        self, start_date: date | None, end_date: date | None
    ) -> dict:
        """マスタ系 fetch で渡す date_range 引数を組み立てる.

        start_date / end_date が両方指定されている場合は CUSTOM_DATE。
        無指定なら LAST_30_DAYS にフォールバック（通常運用での挙動を維持）。
        """
        if start_date and end_date:
            return {
                "date_range_type": "CUSTOM_DATE",
                "start_date": start_date,
                "end_date": end_date,
            }
        return {"date_range_type": "LAST_30_DAYS"}

    @with_retry(max_attempts=3)
    def fetch_campaigns(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[CampaignRow]:
        date_kwargs = self._date_range_kwargs(start_date, end_date)
        # 検索広告のキャンペーンをレポート経由で取得
        csv_text = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_CAMPAIGN_REPORT_FIELDS,
            report_type="CAMPAIGN",
            **date_kwargs,
        )
        rows = self._parse_csv(csv_text)

        # キャンペーンID → 最新データ（重複排除）
        seen: dict[str, CampaignRow] = {}
        for r in rows:
            cid = r.get("CAMPAIGN_ID", "")
            if not cid or cid in seen:
                continue

            campaign_type = r.get("CAMPAIGN_TYPE", "SEARCH")
            is_display = campaign_type in ("DISPLAY", "APP")

            seen[cid] = CampaignRow(
                id=cid,
                name=r.get("CAMPAIGN_NAME", ""),
                platform="yahoo",
                ad_type="display" if is_display else "search",
                type="ディスプレイ" if is_display else "検索",
                status=_STATUS_MAP.get(
                    r.get("CAMPAIGN_DISTRIBUTION_STATUS", ""), "active"
                ),
                daily_budget=self._safe_float(r.get("DAILY_SPENDING_LIMIT")) or None,
                monthly_budget=None,
                bid_strategy=_BID_STRATEGY_MAP.get(
                    r.get("BID_STRATEGY_TYPE", ""), r.get("BIDDING_STRATEGY_TYPE")
                ),
                optimization_score=None,  # Yahoo! にはない
            )

        # ディスプレイ広告のキャンペーンも取得
        # Display Ads API v19: reportType 不要、CAMPAIGN_STATUS フィールドなし
        try:
            display_csv = self._request_report(
                base_url=DISPLAY_API_BASE,
                fields=["CAMPAIGN_ID", "CAMPAIGN_NAME", "DAY", "IMPS", "CLICKS", "COST", "CONVERSIONS"],
                report_type="AD",
                **date_kwargs,
            )
            display_rows = self._parse_csv(display_csv)
            for r in display_rows:
                cid = r.get("CAMPAIGN_ID", "")
                if not cid or cid in seen:
                    continue
                seen[cid] = CampaignRow(
                    id=cid,
                    name=r.get("CAMPAIGN_NAME", ""),
                    platform="yahoo",
                    ad_type="display",
                    type="ディスプレイ",
                    status="active",
                    daily_budget=None,
                    monthly_budget=None,
                    bid_strategy=None,
                    optimization_score=None,
                )
        except Exception as e:
            logger.warning("Yahoo! ディスプレイ広告のキャンペーン取得に失敗: %s", e)

        campaigns = list(seen.values())
        logger.info("Yahoo!広告: %d キャンペーンを取得しました", len(campaigns))
        return campaigns

    # ── 広告グループ ──────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_ad_groups(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[AdGroupRow]:
        csv_text = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_ADGROUP_REPORT_FIELDS,
            report_type="ADGROUP",
            **self._date_range_kwargs(start_date, end_date),
        )
        rows = self._parse_csv(csv_text)

        seen: dict[str, AdGroupRow] = {}
        for r in rows:
            agid = r.get("ADGROUP_ID", "")
            if not agid or agid in seen:
                continue

            impressions = self._safe_int(r.get("IMPS"))
            clicks = self._safe_int(r.get("CLICKS"))
            cost = self._safe_float(r.get("COST"))
            conversions = self._safe_int(r.get("CONVERSIONS"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            bid_type = r.get("BID_STRATEGY_TYPE", "")

            seen[agid] = AdGroupRow(
                id=agid,
                campaign_id=r.get("CAMPAIGN_ID", ""),
                name=r.get("ADGROUP_NAME", ""),
                status=_STATUS_MAP.get(r.get("DISTRIBUTION_SETTINGS", ""), "active"),
                type="標準",
                bid_strategy=_BID_STRATEGY_MAP.get(bid_type, bid_type) or None,
                target_cpa=None,  # v18 ADGROUP レポートに TARGET_CPA フィールドなし
                quality_score=self._safe_float(r.get("QUALITY_INDEX")) or None,
                impressions=impressions,
                clicks=clicks,
                ctr=derived["ctr"],
                cost=cost,
                cpc=derived["cpc"],
                conversions=conversions,
                cvr=derived["cvr"],
                cpa=derived["cpa"] if conversions > 0 else None,
                top_impr_rate=self._safe_rate(r.get("TOP_IMPRESSION_PERCENTAGE")),
                abs_top_impr_rate=self._safe_rate(r.get("ABSOLUTE_TOP_IMPRESSION_PERCENTAGE")),
            )

        ad_groups = list(seen.values())
        logger.info("Yahoo!広告: %d 広告グループを取得しました", len(ad_groups))
        return ad_groups

    # ── 広告 ──────────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_ads(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[AdRow]:
        csv_text = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_AD_REPORT_FIELDS,
            report_type="AD",
            **self._date_range_kwargs(start_date, end_date),
        )
        rows = self._parse_csv(csv_text)

        seen: dict[str, AdRow] = {}
        for r in rows:
            ad_id = r.get("AD_ID", "")
            if not ad_id or ad_id in seen:
                continue

            impressions = self._safe_int(r.get("IMPS"))
            clicks = self._safe_int(r.get("CLICKS"))
            cost = self._safe_float(r.get("COST"))
            conversions = self._safe_int(r.get("CONVERSIONS"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            ad_type = r.get("AD_TYPE", "")
            ad_format = "レスポンシブ検索" if "RESPONSIVE" in ad_type else ad_type

            seen[ad_id] = AdRow(
                id=ad_id,
                ad_group_id=r.get("ADGROUP_ID", ""),
                name=r.get("AD_NAME", f"広告 {ad_id}"),
                status=_STATUS_MAP.get(r.get("DISTRIBUTION_SETTINGS", ""), "active"),
                ad_format=ad_format,
                headline_1=r.get("TITLE1") or None,
                headline_2=r.get("TITLE2") or None,
                headline_3=r.get("TITLE3") or None,
                description_1=r.get("DESCRIPTION1") or None,
                description_2=r.get("DESCRIPTION2") or None,
                final_url=r.get("FINAL_URL") or None,
                impressions=impressions,
                clicks=clicks,
                ctr=derived["ctr"],
                cost=cost,
                cpc=derived["cpc"],
                conversions=conversions,
                cpa=derived["cpa"] if conversions > 0 else None,
            )

        ads = list(seen.values())
        logger.info("Yahoo!広告: %d 広告を取得しました", len(ads))
        return ads

    # ── キーワード ────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_keywords(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[KeywordRow]:
        csv_text = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_KEYWORD_REPORT_FIELDS,
            report_type="KEYWORDS",
            **self._date_range_kwargs(start_date, end_date),
        )
        rows = self._parse_csv(csv_text)

        seen: dict[str, KeywordRow] = {}
        for r in rows:
            kw_id = r.get("KEYWORD_ID", "")
            if not kw_id or kw_id in seen:
                continue

            impressions = self._safe_int(r.get("IMPS"))
            clicks = self._safe_int(r.get("CLICKS"))
            cost = self._safe_float(r.get("COST"))
            conversions = self._safe_int(r.get("CONVERSIONS"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            match_type = r.get("KEYWORD_MATCH_TYPE", "")

            seen[kw_id] = KeywordRow(
                id=kw_id,
                ad_group_id=r.get("ADGROUP_ID", ""),
                keyword=r.get("KEYWORD", ""),
                match_type=_MATCH_TYPE_MAP.get(match_type, match_type),
                status=_STATUS_MAP.get(r.get("DISTRIBUTION_SETTINGS", ""), "active"),
                quality_score=self._safe_float(r.get("QUALITY_INDEX")) or None,
                impressions=impressions,
                clicks=clicks,
                ctr=derived["ctr"],
                cost=cost,
                cpc=derived["cpc"],
                conversions=conversions,
                cvr=derived["cvr"],
                cpa=derived["cpa"] if conversions > 0 else None,
                top_impr_rate=self._safe_rate(r.get("TOP_IMPRESSION_PERCENTAGE")),
                abs_top_impr_rate=self._safe_rate(r.get("ABSOLUTE_TOP_IMPRESSION_PERCENTAGE")),
            )

        keywords = list(seen.values())
        logger.info("Yahoo!広告: %d キーワードを取得しました", len(keywords))
        return keywords

    # ── 日次指標 ──────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_daily_metrics(
        self, start_date: date, end_date: date
    ) -> list[DailyMetricRow]:
        # 検索広告
        search_csv = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_DAILY_REPORT_FIELDS,
            report_type="CAMPAIGN",
            date_range_type="CUSTOM_DATE",
            start_date=start_date,
            end_date=end_date,
        )
        search_rows = self._parse_csv(search_csv)

        # ディスプレイ広告（Display Ads API v19: reportType 不要）
        display_rows: list[dict[str, str]] = []
        try:
            display_csv = self._request_report(
                base_url=DISPLAY_API_BASE,
                fields=["CAMPAIGN_ID", "DAY", "IMPS", "CLICKS", "COST", "CONVERSIONS"],
                report_type="AD",
                date_range_type="CUSTOM_DATE",
                start_date=start_date,
                end_date=end_date,
            )
            display_rows = self._parse_csv(display_csv)
        except Exception as e:
            logger.warning("Yahoo! ディスプレイ広告の日次指標取得に失敗: %s", e)

        metrics = []
        for r in search_rows + display_rows:
            day_str = r.get("DAY", "")
            if not day_str:
                continue

            # 日付フォーマット: "20260101" or "2026-01-01"
            if "-" in day_str:
                d = date.fromisoformat(day_str)
            else:
                d = date(int(day_str[:4]), int(day_str[4:6]), int(day_str[6:8]))

            impressions = self._safe_int(r.get("IMPS"))
            clicks = self._safe_int(r.get("CLICKS"))
            cost = self._safe_float(r.get("COST"))
            conversions = self._safe_int(r.get("CONVERSIONS"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            metrics.append(
                DailyMetricRow(
                    date=d,
                    campaign_id=r.get("CAMPAIGN_ID", ""),
                    platform="yahoo",
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
            "Yahoo!広告: %d 日次指標を取得しました (%s〜%s)",
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
        csv_text = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_QUERY_REPORT_FIELDS,
            report_type="SEARCH_QUERY",
            date_range_type="CUSTOM_DATE",
            start_date=start_date,
            end_date=end_date,
        )
        rows = self._parse_csv(csv_text)

        terms = []
        for r in rows:
            day_str = r.get("DAY", "")
            query = r.get("SEARCH_QUERY", "")
            if not day_str or not query:
                continue

            if "-" in day_str:
                d = date.fromisoformat(day_str)
            else:
                d = date(int(day_str[:4]), int(day_str[4:6]), int(day_str[6:8]))

            impressions = self._safe_int(r.get("IMPS"))
            clicks = self._safe_int(r.get("CLICKS"))
            cost = self._safe_float(r.get("COST"))
            conversions = self._safe_int(r.get("CONVERSIONS"))
            derived = compute_metrics(impressions, clicks, cost, conversions)

            terms.append(
                SearchTermRow(
                    date=d,
                    platform="yahoo",
                    campaign_id=r.get("CAMPAIGN_ID", ""),
                    campaign_name=r.get("CAMPAIGN_NAME", ""),
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
            "Yahoo!広告: %d 検索語句を取得しました (%s〜%s)",
            len(terms),
            start_date,
            end_date,
        )
        return terms
