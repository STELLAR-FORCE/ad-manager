"""BigQuery テーブルスキーマ定義.

全7テーブルのスキーマを SchemaField のリストとして定義する。
setup_bigquery.py とクライアントの両方から参照される。
"""

from __future__ import annotations

from google.cloud.bigquery import SchemaField, TimePartitioning, TimePartitioningType

# ── campaigns ─────────────────────────────────────────────────────

CAMPAIGNS_SCHEMA = [
    SchemaField("id", "STRING", mode="REQUIRED"),
    SchemaField("name", "STRING", mode="REQUIRED"),
    SchemaField("platform", "STRING", mode="REQUIRED"),
    SchemaField("ad_type", "STRING", mode="REQUIRED"),
    SchemaField("type", "STRING", mode="REQUIRED"),
    SchemaField("status", "STRING", mode="REQUIRED"),
    SchemaField("daily_budget", "FLOAT64", mode="NULLABLE"),
    SchemaField("monthly_budget", "FLOAT64", mode="NULLABLE"),
    SchemaField("bid_strategy", "STRING", mode="NULLABLE"),
    SchemaField("optimization_score", "FLOAT64", mode="NULLABLE"),
    SchemaField("synced_at", "TIMESTAMP", mode="REQUIRED"),
]

CAMPAIGNS_MERGE_KEYS = ["id", "platform"]

# ── ad_groups ─────────────────────────────────────────────────────

AD_GROUPS_SCHEMA = [
    SchemaField("id", "STRING", mode="REQUIRED"),
    SchemaField("campaign_id", "STRING", mode="REQUIRED"),
    SchemaField("name", "STRING", mode="REQUIRED"),
    SchemaField("status", "STRING", mode="REQUIRED"),
    SchemaField("type", "STRING", mode="REQUIRED"),
    SchemaField("bid_strategy", "STRING", mode="NULLABLE"),
    SchemaField("target_cpa", "FLOAT64", mode="NULLABLE"),
    SchemaField("quality_score", "FLOAT64", mode="NULLABLE"),
    SchemaField("impressions", "INT64", mode="REQUIRED"),
    SchemaField("clicks", "INT64", mode="REQUIRED"),
    SchemaField("ctr", "FLOAT64", mode="REQUIRED"),
    SchemaField("cost", "FLOAT64", mode="REQUIRED"),
    SchemaField("cpc", "FLOAT64", mode="REQUIRED"),
    SchemaField("conversions", "INT64", mode="REQUIRED"),
    SchemaField("cvr", "FLOAT64", mode="REQUIRED"),
    SchemaField("cpa", "FLOAT64", mode="NULLABLE"),
    SchemaField("top_impr_rate", "STRING", mode="NULLABLE"),
    SchemaField("abs_top_impr_rate", "STRING", mode="NULLABLE"),
    SchemaField("viewable_impressions", "INT64", mode="NULLABLE"),
    SchemaField("cpm", "FLOAT64", mode="NULLABLE"),
    SchemaField("synced_at", "TIMESTAMP", mode="REQUIRED"),
]

AD_GROUPS_MERGE_KEYS = ["id", "campaign_id"]

# ── ads ───────────────────────────────────────────────────────────

ADS_SCHEMA = [
    SchemaField("id", "STRING", mode="REQUIRED"),
    SchemaField("ad_group_id", "STRING", mode="REQUIRED"),
    SchemaField("name", "STRING", mode="REQUIRED"),
    SchemaField("status", "STRING", mode="REQUIRED"),
    SchemaField("ad_format", "STRING", mode="REQUIRED"),
    SchemaField("headline_1", "STRING", mode="NULLABLE"),
    SchemaField("headline_2", "STRING", mode="NULLABLE"),
    SchemaField("headline_3", "STRING", mode="NULLABLE"),
    SchemaField("description_1", "STRING", mode="NULLABLE"),
    SchemaField("description_2", "STRING", mode="NULLABLE"),
    SchemaField("final_url", "STRING", mode="NULLABLE"),
    SchemaField("image_file_name", "STRING", mode="NULLABLE"),
    SchemaField("image_size", "STRING", mode="NULLABLE"),
    SchemaField("impressions", "INT64", mode="REQUIRED"),
    SchemaField("clicks", "INT64", mode="REQUIRED"),
    SchemaField("ctr", "FLOAT64", mode="REQUIRED"),
    SchemaField("cost", "FLOAT64", mode="REQUIRED"),
    SchemaField("cpc", "FLOAT64", mode="REQUIRED"),
    SchemaField("conversions", "INT64", mode="REQUIRED"),
    SchemaField("cpa", "FLOAT64", mode="NULLABLE"),
    SchemaField("synced_at", "TIMESTAMP", mode="REQUIRED"),
]

ADS_MERGE_KEYS = ["id", "ad_group_id"]

# ── keywords ──────────────────────────────────────────────────────

KEYWORDS_SCHEMA = [
    SchemaField("id", "STRING", mode="REQUIRED"),
    SchemaField("ad_group_id", "STRING", mode="REQUIRED"),
    SchemaField("keyword", "STRING", mode="REQUIRED"),
    SchemaField("match_type", "STRING", mode="REQUIRED"),
    SchemaField("status", "STRING", mode="REQUIRED"),
    SchemaField("quality_score", "FLOAT64", mode="NULLABLE"),
    SchemaField("impressions", "INT64", mode="REQUIRED"),
    SchemaField("clicks", "INT64", mode="REQUIRED"),
    SchemaField("ctr", "FLOAT64", mode="REQUIRED"),
    SchemaField("cost", "FLOAT64", mode="REQUIRED"),
    SchemaField("cpc", "FLOAT64", mode="REQUIRED"),
    SchemaField("conversions", "INT64", mode="REQUIRED"),
    SchemaField("cvr", "FLOAT64", mode="REQUIRED"),
    SchemaField("cpa", "FLOAT64", mode="NULLABLE"),
    SchemaField("top_impr_rate", "STRING", mode="NULLABLE"),
    SchemaField("abs_top_impr_rate", "STRING", mode="NULLABLE"),
    SchemaField("synced_at", "TIMESTAMP", mode="REQUIRED"),
]

KEYWORDS_MERGE_KEYS = ["id", "ad_group_id"]

# ── daily_metrics ─────────────────────────────────────────────────

DAILY_METRICS_SCHEMA = [
    SchemaField("date", "DATE", mode="REQUIRED"),
    SchemaField("campaign_id", "STRING", mode="REQUIRED"),
    SchemaField("platform", "STRING", mode="REQUIRED"),
    SchemaField("impressions", "INT64", mode="REQUIRED"),
    SchemaField("clicks", "INT64", mode="REQUIRED"),
    SchemaField("cost", "FLOAT64", mode="REQUIRED"),
    SchemaField("conversions", "INT64", mode="REQUIRED"),
    SchemaField("ctr", "FLOAT64", mode="REQUIRED"),
    SchemaField("cpc", "FLOAT64", mode="REQUIRED"),
    SchemaField("cpa", "FLOAT64", mode="REQUIRED"),
    SchemaField("cvr", "FLOAT64", mode="REQUIRED"),
]

DAILY_METRICS_MERGE_KEYS = ["date", "campaign_id", "platform"]

DAILY_METRICS_PARTITIONING = TimePartitioning(
    type_=TimePartitioningType.DAY,
    field="date",
)

DAILY_METRICS_CLUSTERING = ["platform", "campaign_id"]

# ── search_term_reports ───────────────────────────────────────────

SEARCH_TERM_REPORTS_SCHEMA = [
    SchemaField("date", "DATE", mode="REQUIRED"),
    SchemaField("platform", "STRING", mode="REQUIRED"),
    SchemaField("campaign_id", "STRING", mode="REQUIRED"),
    SchemaField("campaign_name", "STRING", mode="REQUIRED"),
    SchemaField("search_term", "STRING", mode="REQUIRED"),
    SchemaField("impressions", "INT64", mode="REQUIRED"),
    SchemaField("clicks", "INT64", mode="REQUIRED"),
    SchemaField("cost", "FLOAT64", mode="REQUIRED"),
    SchemaField("conversions", "INT64", mode="REQUIRED"),
    SchemaField("ctr", "FLOAT64", mode="REQUIRED"),
    SchemaField("cpa", "FLOAT64", mode="REQUIRED"),
    SchemaField("is_excluded", "BOOL", mode="REQUIRED"),
]

SEARCH_TERM_REPORTS_MERGE_KEYS = ["date", "campaign_id", "search_term", "platform"]

SEARCH_TERM_REPORTS_PARTITIONING = TimePartitioning(
    type_=TimePartitioningType.DAY,
    field="date",
)

SEARCH_TERM_REPORTS_CLUSTERING = ["platform", "campaign_id"]

# ── budget_logs ───────────────────────────────────────────────────

BUDGET_LOGS_SCHEMA = [
    SchemaField("id", "STRING", mode="REQUIRED"),
    SchemaField("campaign_id", "STRING", mode="REQUIRED"),
    SchemaField("month", "STRING", mode="REQUIRED"),
    SchemaField("budget", "FLOAT64", mode="REQUIRED"),
    SchemaField("spent", "FLOAT64", mode="REQUIRED"),
]

BUDGET_LOGS_MERGE_KEYS = ["campaign_id", "month"]

# ── sync_logs ─────────────────────────────────────────────────────

SYNC_LOGS_SCHEMA = [
    SchemaField("id", "STRING", mode="REQUIRED"),
    SchemaField("platform", "STRING", mode="REQUIRED"),
    SchemaField("sync_type", "STRING", mode="REQUIRED"),
    SchemaField("status", "STRING", mode="REQUIRED"),
    SchemaField("message", "STRING", mode="NULLABLE"),
    SchemaField("started_at", "TIMESTAMP", mode="REQUIRED"),
    SchemaField("finished_at", "TIMESTAMP", mode="NULLABLE"),
]

# sync_logs は MERGE ではなく INSERT（追記）のみ

# ── テーブル定義の一覧 ────────────────────────────────────────────

TABLE_DEFINITIONS: dict[str, dict] = {
    "campaigns": {
        "schema": CAMPAIGNS_SCHEMA,
        "merge_keys": CAMPAIGNS_MERGE_KEYS,
    },
    "ad_groups": {
        "schema": AD_GROUPS_SCHEMA,
        "merge_keys": AD_GROUPS_MERGE_KEYS,
    },
    "ads": {
        "schema": ADS_SCHEMA,
        "merge_keys": ADS_MERGE_KEYS,
    },
    "keywords": {
        "schema": KEYWORDS_SCHEMA,
        "merge_keys": KEYWORDS_MERGE_KEYS,
    },
    "daily_metrics": {
        "schema": DAILY_METRICS_SCHEMA,
        "merge_keys": DAILY_METRICS_MERGE_KEYS,
        "partitioning": DAILY_METRICS_PARTITIONING,
        "clustering": DAILY_METRICS_CLUSTERING,
    },
    "search_term_reports": {
        "schema": SEARCH_TERM_REPORTS_SCHEMA,
        "merge_keys": SEARCH_TERM_REPORTS_MERGE_KEYS,
        "partitioning": SEARCH_TERM_REPORTS_PARTITIONING,
        "clustering": SEARCH_TERM_REPORTS_CLUSTERING,
    },
    "budget_logs": {
        "schema": BUDGET_LOGS_SCHEMA,
        "merge_keys": BUDGET_LOGS_MERGE_KEYS,
    },
    "sync_logs": {
        "schema": SYNC_LOGS_SCHEMA,
    },
}
