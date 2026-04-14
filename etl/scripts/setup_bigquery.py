"""BigQuery データセット・テーブル初期作成スクリプト.

使い方:
    cd etl/
    python -m scripts.setup_bigquery

既存テーブルがあればスキップする（データは消えない）。
"""

from __future__ import annotations

import sys
from pathlib import Path

# etl/ をパスに追加して src をインポート可能にする
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google.cloud import bigquery

from src.bigquery.table_schemas import TABLE_DEFINITIONS
from src.config import get_settings
from src.utils.logging import get_logger, setup_logging

logger = get_logger(__name__)


def main() -> None:
    settings = get_settings()
    setup_logging(settings.log_level)

    client = bigquery.Client(
        project=settings.gcp_project_id, location=settings.bq_location
    )

    dataset_id = f"{settings.gcp_project_id}.{settings.bq_dataset}"

    # データセット作成
    dataset = bigquery.Dataset(dataset_id)
    dataset.location = settings.bq_location
    try:
        client.create_dataset(dataset, exists_ok=True)
        logger.info("データセット %s を確認しました", dataset_id)
    except Exception as e:
        logger.error("データセットの作成に失敗しました: %s", e)
        sys.exit(1)

    # テーブル作成
    for table_name, table_def in TABLE_DEFINITIONS.items():
        table_id = f"{dataset_id}.{table_name}"
        table = bigquery.Table(table_id, schema=table_def["schema"])

        # パーティショニング
        if "partitioning" in table_def:
            table.time_partitioning = table_def["partitioning"]

        # クラスタリング
        if "clustering" in table_def:
            table.clustering_fields = table_def["clustering"]

        try:
            client.create_table(table, exists_ok=True)
            logger.info("テーブル %s を確認しました", table_id)
        except Exception as e:
            logger.error("テーブル %s の作成に失敗しました: %s", table_name, e)
            sys.exit(1)

    logger.info("全テーブルのセットアップが完了しました")


if __name__ == "__main__":
    main()
