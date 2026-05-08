"""広告プラットフォームクライアントの抽象基底クラス."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

from src.models.schemas import (
    AdGroupRow,
    AdRow,
    CampaignRow,
    DailyMetricRow,
    KeywordRow,
    SearchTermRow,
)


class AdPlatformClient(ABC):
    """各広告プラットフォーム（Google / Yahoo! / Bing）の共通インターフェース.

    サブクラスは platform プロパティと全抽象メソッドを実装すること。
    """

    @property
    @abstractmethod
    def platform(self) -> str:
        """プラットフォーム識別子を返す ("google" | "yahoo" | "bing")."""
        ...

    @abstractmethod
    def authenticate(self) -> None:
        """API 認証を行う（OAuth トークン取得等）."""
        ...

    @abstractmethod
    def fetch_campaigns(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[CampaignRow]:
        """キャンペーンを取得する.

        start_date / end_date を渡すと、その期間にアクティブだったキャンペーンを取得する。
        Bing / Yahoo! はレポート API ベースで実装されているため、期間指定が無いと
        直近 30 日のキャンペーンしか取得できない（バックフィル時は必須）。
        Google Ads はステータスベースで全期間取得するため、渡しても無視される。
        """
        ...

    @abstractmethod
    def fetch_ad_groups(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[AdGroupRow]:
        """広告グループを実績指標付きで取得する."""
        ...

    @abstractmethod
    def fetch_ads(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[AdRow]:
        """広告を見出し・説明文・画像情報付きで取得する."""
        ...

    @abstractmethod
    def fetch_keywords(
        self, start_date: date | None = None, end_date: date | None = None
    ) -> list[KeywordRow]:
        """キーワードを品質スコア・IS付きで取得する."""
        ...

    @abstractmethod
    def fetch_daily_metrics(
        self, start_date: date, end_date: date
    ) -> list[DailyMetricRow]:
        """指定期間の日次指標を取得する."""
        ...

    @abstractmethod
    def fetch_search_term_report(
        self, start_date: date, end_date: date
    ) -> list[SearchTermRow]:
        """指定期間の検索語句レポートを取得する."""
        ...
