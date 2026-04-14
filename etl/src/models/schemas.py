"""Pydantic モデル定義.

各広告プラットフォーム API のレスポンスを正規化し、
BigQuery 書き込み前にバリデーションするためのモデル群。
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── ヘルパー ──────────────────────────────────────────────────────


def compute_metrics(
    impressions: int,
    clicks: int,
    cost: float,
    conversions: int,
) -> dict[str, float]:
    """基本指標から派生指標を算出する."""
    return {
        "ctr": clicks / impressions if impressions > 0 else 0.0,
        "cpc": cost / clicks if clicks > 0 else 0.0,
        "cpa": cost / conversions if conversions > 0 else 0.0,
        "cvr": conversions / clicks if clicks > 0 else 0.0,
    }


# ── キャンペーン ──────────────────────────────────────────────────


class CampaignRow(BaseModel):
    """campaigns テーブル行."""

    id: str
    name: str
    platform: Literal["google", "yahoo", "bing"]
    ad_type: Literal["search", "display"]
    type: str  # 検索 / ディスプレイ / P-MAX / デマンドジェネレーション 等
    status: str  # active / active_limited / paused / ended
    daily_budget: float | None = None
    monthly_budget: float | None = None
    bid_strategy: str | None = None
    optimization_score: float | None = None


# ── 広告グループ ──────────────────────────────────────────────────


class AdGroupRow(BaseModel):
    """ad_groups テーブル行."""

    id: str
    campaign_id: str
    name: str
    status: str  # active / paused
    type: str  # 標準 / ディスプレイ 等
    bid_strategy: str | None = None
    target_cpa: float | None = None
    quality_score: float | None = None
    impressions: int = 0
    clicks: int = 0
    ctr: float = 0.0
    cost: float = 0.0
    cpc: float = 0.0
    conversions: int = 0
    cvr: float = 0.0
    cpa: float | None = None
    top_impr_rate: str | None = None
    abs_top_impr_rate: str | None = None
    viewable_impressions: int | None = None
    cpm: float | None = None


# ── 広告 ──────────────────────────────────────────────────────────


class AdRow(BaseModel):
    """ads テーブル行."""

    id: str
    ad_group_id: str
    name: str
    status: str  # active / paused
    ad_format: str  # レスポンシブ検索 / 拡張テキスト / レスポンシブディスプレイ 等
    headline_1: str | None = None
    headline_2: str | None = None
    headline_3: str | None = None
    description_1: str | None = None
    description_2: str | None = None
    final_url: str | None = None
    image_file_name: str | None = None
    image_size: str | None = None
    impressions: int = 0
    clicks: int = 0
    ctr: float = 0.0
    cost: float = 0.0
    cpc: float = 0.0
    conversions: int = 0
    cpa: float | None = None


# ── キーワード ────────────────────────────────────────────────────


class KeywordRow(BaseModel):
    """keywords テーブル行."""

    id: str
    ad_group_id: str
    keyword: str
    match_type: str  # 完全一致 / フレーズ一致 / 部分一致
    status: str  # active / paused / limited
    quality_score: float | None = None
    impressions: int = 0
    clicks: int = 0
    ctr: float = 0.0
    cost: float = 0.0
    cpc: float = 0.0
    conversions: int = 0
    cvr: float = 0.0
    cpa: float | None = None
    top_impr_rate: str | None = None
    abs_top_impr_rate: str | None = None


# ── 日次指標 ──────────────────────────────────────────────────────


class DailyMetricRow(BaseModel):
    """daily_metrics テーブル行."""

    date: date
    campaign_id: str
    platform: Literal["google", "yahoo", "bing"]
    impressions: int = 0
    clicks: int = 0
    cost: float = 0.0
    conversions: int = 0
    ctr: float = 0.0
    cpc: float = 0.0
    cpa: float = 0.0
    cvr: float = 0.0


# ── 検索語句レポート ──────────────────────────────────────────────


class SearchTermRow(BaseModel):
    """search_term_reports テーブル行."""

    date: date
    platform: Literal["google", "yahoo", "bing"]
    campaign_id: str
    campaign_name: str
    search_term: str
    impressions: int = 0
    clicks: int = 0
    cost: float = 0.0
    conversions: int = 0
    ctr: float = 0.0
    cpa: float = 0.0
    is_excluded: bool = False


# ── 予算ログ ──────────────────────────────────────────────────────


class BudgetLogRow(BaseModel):
    """budget_logs テーブル行."""

    id: str
    campaign_id: str
    month: str  # "2026-03" 形式
    budget: float
    spent: float = Field(default=0.0, ge=0)


# ── 同期ログ ──────────────────────────────────────────────────────


class SyncLogRow(BaseModel):
    """sync_logs テーブル行."""

    id: str
    platform: str  # google / yahoo / bing / all
    sync_type: Literal["auto", "manual"]
    status: Literal["running", "success", "failed"]
    message: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
