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
    "ENABLED": "active",
    "PAUSED": "paused",
    "REMOVED": "ended",
    # ディスプレイ広告
    "ACTIVE": "active",
}

_BID_STRATEGY_MAP = {
    "TARGET_CPA": "目標CPA",
    "TARGET_ROAS": "目標ROAS",
    "MAXIMIZE_CONVERSIONS": "CV最大化",
    "MAXIMIZE_CLICKS": "クリック最大化",
    "MANUAL_CPC": "手動CPC",
    "ENHANCED_CPC": "拡張CPC",
    "TARGET_SPEND": "予算内で最大化",
}

_MATCH_TYPE_MAP = {
    "EXACT": "完全一致",
    "PHRASE": "フレーズ一致",
    "BROAD": "部分一致",
}

# ── レポートフィールド定義 ────────────────────────────────────────

# 検索広告レポート
SEARCH_CAMPAIGN_REPORT_FIELDS = [
    "CAMPAIGN_ID",
    "CAMPAIGN_NAME",
    "CAMPAIGN_TYPE",
    "CAMPAIGN_STATUS",
    "DAILY_BUDGET",
    "BIDDING_STRATEGY_TYPE",
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
    "ADGROUP_STATUS",
    "ADGROUP_BID_STRATEGY_TYPE",
    "TARGET_CPA",
    "QUALITY_SCORE",
    "DAY",
    "IMPS",
    "CLICKS",
    "COST",
    "CONVERSIONS",
    "TOP_IMPR_RATE",
    "ABS_TOP_IMPR_RATE",
]

SEARCH_AD_REPORT_FIELDS = [
    "ADGROUP_ID",
    "AD_ID",
    "AD_NAME",
    "AD_TYPE",
    "AD_STATUS",
    "TITLE1",
    "TITLE2",
    "TITLE3",
    "DESC1",
    "DESC2",
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
    "MATCH_TYPE",
    "KEYWORD_STATUS",
    "QUALITY_SCORE",
    "IMPS",
    "CLICKS",
    "COST",
    "CONVERSIONS",
    "TOP_IMPR_RATE",
    "ABS_TOP_IMPR_RATE",
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
    "QUERY",
    "DAY",
    "IMPS",
    "CLICKS",
    "COST",
    "CONVERSIONS",
]


class YahooAdsClient(AdPlatformClient):
    """Yahoo!広告 API クライアント."""

    def __init__(self, settings: Settings, oauth_manager: OAuthManager) -> None:
        self._settings = settings
        self._oauth = oauth_manager
        self._account_id = settings.yahoo_ads_account_id
        self._access_token: str | None = None

    @property
    def platform(self) -> str:
        return "yahoo"

    def authenticate(self) -> None:
        """OAuth2 アクセストークンを取得する."""
        self._access_token = self._oauth.get_yahoo_access_token()
        logger.info("Yahoo!広告 API に認証しました (account_id=%s)", self._account_id)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    # ── 汎用 API 呼び出し ────────────────────────────────────────

    @with_retry(max_attempts=3, retryable_exceptions=(httpx.HTTPStatusError,))
    def _post(self, base_url: str, service: str, action: str, body: dict) -> dict:
        """Yahoo! 広告 API に POST リクエストを送る."""
        url = f"{base_url}/{service}/{action}"
        response = httpx.post(
            url,
            json=body,
            headers=self._headers(),
            timeout=60,
        )
        response.raise_for_status()
        return response.json()

    def _post_download(self, base_url: str, service: str, body: dict) -> str:
        """レポートをダウンロードして CSV テキストを返す."""
        url = f"{base_url}/{service}/download"
        response = httpx.post(
            url,
            json=body,
            headers=self._headers(),
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
        operand: dict = {
            "accountId": int(self._account_id),
            "fields": fields,
            "reportType": report_type,
            "reportDateRangeType": date_range_type,
            "reportDownloadFormat": "CSV",
            "reportDownloadEncode": "UTF8",
        }

        if date_range_type == "CUSTOM_DATE" and start_date and end_date:
            operand["dateRange"] = {
                "startDate": start_date.strftime("%Y%m%d"),
                "endDate": end_date.strftime("%Y%m%d"),
            }

        add_body = {
            "accountId": int(self._account_id),
            "operand": [operand],
        }

        result = self._post(base_url, "ReportDefinitionService", "add", add_body)
        values = result.get("rval", {}).get("values", [])
        if not values or not values[0].get("operationSucceeded"):
            errors = values[0].get("errors", []) if values else []
            raise RuntimeError(f"Yahoo! レポートジョブ作成に失敗: {errors}")

        report_job_id = values[0]["reportDefinition"]["reportJobId"]
        logger.info("Yahoo! レポートジョブを作成しました (jobId=%s)", report_job_id)

        # 2. ポーリングで完了を待つ
        def check_status() -> str:
            get_body = {
                "accountId": int(self._account_id),
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
            "accountId": int(self._account_id),
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
            if not stripped or stripped.startswith("--") or stripped.startswith("合計"):
                continue
            data_lines.append(stripped)

        if len(data_lines) < 2:
            return []

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

    @with_retry(max_attempts=3)
    def fetch_campaigns(self) -> list[CampaignRow]:
        # 検索広告のキャンペーンをレポート経由で取得
        csv_text = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_CAMPAIGN_REPORT_FIELDS,
            report_type="CAMPAIGN",
            date_range_type="LAST_30_DAYS",
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
                    r.get("CAMPAIGN_STATUS", ""), "active"
                ),
                daily_budget=self._safe_float(r.get("DAILY_BUDGET")) or None,
                monthly_budget=None,
                bid_strategy=_BID_STRATEGY_MAP.get(
                    r.get("BIDDING_STRATEGY_TYPE", ""), r.get("BIDDING_STRATEGY_TYPE")
                ),
                optimization_score=None,  # Yahoo! にはない
            )

        # ディスプレイ広告のキャンペーンも取得
        try:
            display_csv = self._request_report(
                base_url=DISPLAY_API_BASE,
                fields=["CAMPAIGN_ID", "CAMPAIGN_NAME", "CAMPAIGN_STATUS", "DAY", "IMPS", "CLICKS", "COST", "CONVERSIONS"],
                report_type="CAMPAIGN",
                date_range_type="LAST_30_DAYS",
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
                    status=_STATUS_MAP.get(r.get("CAMPAIGN_STATUS", ""), "active"),
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
    def fetch_ad_groups(self) -> list[AdGroupRow]:
        csv_text = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_ADGROUP_REPORT_FIELDS,
            report_type="ADGROUP",
            date_range_type="LAST_30_DAYS",
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

            bid_type = r.get("ADGROUP_BID_STRATEGY_TYPE", "")

            seen[agid] = AdGroupRow(
                id=agid,
                campaign_id=r.get("CAMPAIGN_ID", ""),
                name=r.get("ADGROUP_NAME", ""),
                status=_STATUS_MAP.get(r.get("ADGROUP_STATUS", ""), "active"),
                type="標準",
                bid_strategy=_BID_STRATEGY_MAP.get(bid_type, bid_type) or None,
                target_cpa=self._safe_float(r.get("TARGET_CPA")) or None,
                quality_score=self._safe_float(r.get("QUALITY_SCORE")) or None,
                impressions=impressions,
                clicks=clicks,
                ctr=derived["ctr"],
                cost=cost,
                cpc=derived["cpc"],
                conversions=conversions,
                cvr=derived["cvr"],
                cpa=derived["cpa"] if conversions > 0 else None,
                top_impr_rate=self._safe_rate(r.get("TOP_IMPR_RATE")),
                abs_top_impr_rate=self._safe_rate(r.get("ABS_TOP_IMPR_RATE")),
            )

        ad_groups = list(seen.values())
        logger.info("Yahoo!広告: %d 広告グループを取得しました", len(ad_groups))
        return ad_groups

    # ── 広告 ──────────────────────────────────────────────────────

    @with_retry(max_attempts=3)
    def fetch_ads(self) -> list[AdRow]:
        csv_text = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_AD_REPORT_FIELDS,
            report_type="AD",
            date_range_type="LAST_30_DAYS",
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
                status=_STATUS_MAP.get(r.get("AD_STATUS", ""), "active"),
                ad_format=ad_format,
                headline_1=r.get("TITLE1") or None,
                headline_2=r.get("TITLE2") or None,
                headline_3=r.get("TITLE3") or None,
                description_1=r.get("DESC1") or None,
                description_2=r.get("DESC2") or None,
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
    def fetch_keywords(self) -> list[KeywordRow]:
        csv_text = self._request_report(
            base_url=SEARCH_API_BASE,
            fields=SEARCH_KEYWORD_REPORT_FIELDS,
            report_type="KEYWORDS",
            date_range_type="LAST_30_DAYS",
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

            match_type = r.get("MATCH_TYPE", "")

            seen[kw_id] = KeywordRow(
                id=kw_id,
                ad_group_id=r.get("ADGROUP_ID", ""),
                keyword=r.get("KEYWORD", ""),
                match_type=_MATCH_TYPE_MAP.get(match_type, match_type),
                status=_STATUS_MAP.get(r.get("KEYWORD_STATUS", ""), "active"),
                quality_score=self._safe_float(r.get("QUALITY_SCORE")) or None,
                impressions=impressions,
                clicks=clicks,
                ctr=derived["ctr"],
                cost=cost,
                cpc=derived["cpc"],
                conversions=conversions,
                cvr=derived["cvr"],
                cpa=derived["cpa"] if conversions > 0 else None,
                top_impr_rate=self._safe_rate(r.get("TOP_IMPR_RATE")),
                abs_top_impr_rate=self._safe_rate(r.get("ABS_TOP_IMPR_RATE")),
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

        # ディスプレイ広告
        display_rows: list[dict[str, str]] = []
        try:
            display_csv = self._request_report(
                base_url=DISPLAY_API_BASE,
                fields=["CAMPAIGN_ID", "DAY", "IMPS", "CLICKS", "COST", "CONVERSIONS"],
                report_type="CAMPAIGN",
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
            query = r.get("QUERY", "")
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
