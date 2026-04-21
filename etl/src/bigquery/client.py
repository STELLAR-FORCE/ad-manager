"""BigQuery クライアント.

MERGE（upsert）パターンでデータを書き込む。
ステージングテーブルにロード → MERGE → ステージング削除の3ステップ。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import google.auth
from google.cloud import bigquery
from pydantic import BaseModel

from src.bigquery.table_schemas import TABLE_DEFINITIONS
from src.config import Settings
from src.utils.logging import get_logger
from src.utils.retry import with_retry

logger = get_logger(__name__)


def _get_credentials():
    """認証情報を取得する（ADC → gcloud SDK の順にフォールバック）."""
    try:
        credentials, project = google.auth.default()
        return credentials, project
    except google.auth.exceptions.DefaultCredentialsError:
        pass

    # ADC が無い場合、gcloud CLI の認証情報を使う
    try:
        from google.auth import _cloud_sdk
        credentials = _cloud_sdk.get_application_default_credentials()
        return credentials, None
    except Exception:
        pass

    # 最終フォールバック: gcloud のアクセストークンを直接利用
    import subprocess
    from google.oauth2.credentials import Credentials as OAuth2Credentials
    result = subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        capture_output=True, text=True,
    )
    if result.returncode == 0 and result.stdout.strip():
        return OAuth2Credentials(token=result.stdout.strip()), None

    raise RuntimeError(
        "GCP 認証情報が見つかりません。"
        "'gcloud auth login' または 'gcloud auth application-default login' を実行してください。"
    )


class BigQueryClient:
    """BigQuery 読み書きクライアント."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._project = settings.gcp_project_id
        self._dataset = settings.bq_dataset
        self._location = settings.bq_location
        self._client: bigquery.Client | None = None

    def _get_client(self) -> bigquery.Client:
        if self._client is None:
            credentials, _ = _get_credentials()
            self._client = bigquery.Client(
                project=self._project,
                location=self._location,
                credentials=credentials,
            )
        return self._client

    def _table_ref(self, table_name: str) -> str:
        """完全修飾テーブル名を返す."""
        return f"`{self._project}.{self._dataset}.{table_name}`"

    def _staging_table_ref(self, table_name: str) -> str:
        """ステージングテーブルの完全修飾名を返す."""
        return f"`{self._project}.{self._dataset}.{table_name}_staging`"

    # ── MERGE (upsert) ────────────────────────────────────────────

    @with_retry(max_attempts=3, retryable_exceptions=(Exception,))
    def upsert(
        self,
        table_name: str,
        rows: list[BaseModel],
        add_synced_at: bool = True,
    ) -> None:
        """Pydantic モデルのリストをステージング経由で MERGE する.

        Args:
            table_name: テーブル名（例: "adm_campaigns"）
            rows: 書き込むデータ（Pydantic モデルのリスト）
            add_synced_at: synced_at カラムを自動追加するか
        """
        if not rows:
            logger.info("%s: 書き込むデータがありません", table_name)
            return

        if self._settings.dry_run:
            logger.info("[DRY RUN] %s: %d 行をスキップしました", table_name, len(rows))
            return

        table_def = TABLE_DEFINITIONS.get(table_name)
        if not table_def:
            raise ValueError(f"未定義のテーブル: {table_name}")

        merge_keys = table_def.get("merge_keys")
        if not merge_keys:
            # merge_keys がない場合は INSERT のみ（sync_logs 等）
            self._insert_rows(table_name, rows, add_synced_at)
            return

        client = self._get_client()
        now = datetime.now(timezone.utc).isoformat()
        staging = f"{self._dataset}.{table_name}_staging"
        target = self._table_ref(table_name)
        staging_ref = self._staging_table_ref(table_name)

        # 1. ステージングテーブルにデータをロード
        row_dicts = self._to_row_dicts(rows, add_synced_at, now)
        schema = table_def["schema"]

        # ステージングテーブルを作成（WRITE_TRUNCATE で上書き）
        job_config = bigquery.LoadJobConfig(
            schema=schema,
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        )

        staging_table = bigquery.TableReference.from_string(
            f"{self._project}.{staging}", default_project=self._project
        )
        job = client.load_table_from_json(
            row_dicts, staging_table, job_config=job_config
        )
        job.result()  # 完了を待つ

        # 2. MERGE クエリを実行
        # 全カラム名を取得（merge_keys 以外が UPDATE 対象）
        all_columns = [field.name for field in schema]
        update_columns = [c for c in all_columns if c not in merge_keys]

        on_clause = " AND ".join(f"T.{k} = S.{k}" for k in merge_keys)
        update_set = ", ".join(f"T.{c} = S.{c}" for c in update_columns)
        insert_cols = ", ".join(all_columns)
        insert_vals = ", ".join(f"S.{c}" for c in all_columns)

        merge_sql = f"""
            MERGE {target} T
            USING {staging_ref} S
            ON {on_clause}
            WHEN MATCHED THEN
                UPDATE SET {update_set}
            WHEN NOT MATCHED THEN
                INSERT ({insert_cols})
                VALUES ({insert_vals})
        """

        query_job = client.query(merge_sql)
        query_job.result()

        # 3. ステージングテーブルを削除
        client.delete_table(staging_table, not_found_ok=True)

        logger.info("%s: %d 行を MERGE しました", table_name, len(rows))

    # ── INSERT（追記のみ） ────────────────────────────────────────

    def _insert_rows(
        self,
        table_name: str,
        rows: list[BaseModel],
        add_synced_at: bool,
    ) -> None:
        """行を INSERT で追記する（sync_logs 等 MERGE 不要なテーブル用）."""
        if self._settings.dry_run:
            logger.info("[DRY RUN] %s: %d 行の INSERT をスキップ", table_name, len(rows))
            return

        client = self._get_client()
        table_ref = f"{self._project}.{self._dataset}.{table_name}"
        now = datetime.now(timezone.utc).isoformat()
        row_dicts = self._to_row_dicts(rows, add_synced_at, now)

        errors = client.insert_rows_json(table_ref, row_dicts)
        if errors:
            logger.error("%s: INSERT エラー: %s", table_name, errors)
            raise RuntimeError(f"BigQuery INSERT エラー: {errors}")

        logger.info("%s: %d 行を INSERT しました", table_name, len(rows))

    # ── ヘルパー ──────────────────────────────────────────────────

    @staticmethod
    def _to_row_dicts(
        rows: list[BaseModel],
        add_synced_at: bool,
        now: str,
    ) -> list[dict[str, Any]]:
        """Pydantic モデルのリストを BQ ロード用の dict リストに変換する."""
        result = []
        for row in rows:
            d = row.model_dump(mode="json")
            if add_synced_at and "synced_at" not in d:
                d["synced_at"] = now
            result.append(d)
        return result

    # ── sync_logs 専用ショートカット ───────────────────────────────

    def insert_sync_log(self, sync_log: BaseModel) -> None:
        """SyncLog を1行 INSERT する（DRY_RUN 時はスキップ）."""
        if self._settings.dry_run:
            logger.info("[DRY RUN] adm_sync_logs: 1 行の INSERT をスキップ")
            return
        # load_table_from_json を使う（streaming buffer 制約を回避）
        client = self._get_client()
        table_ref = f"{self._project}.{self._dataset}.adm_sync_logs"
        job_config = bigquery.LoadJobConfig(
            schema=TABLE_DEFINITIONS["adm_sync_logs"]["schema"],
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        )
        row = sync_log.model_dump(mode="json")
        job = client.load_table_from_json([row], table_ref, job_config=job_config)
        job.result()
        logger.info("adm_sync_logs: 1 行を INSERT しました")

    def update_sync_log_status(
        self,
        sync_log_id: str,
        status: str,
        message: str | None = None,
    ) -> None:
        """SyncLog のステータスを UPDATE する."""
        if self._settings.dry_run:
            logger.info("[DRY RUN] sync_log %s → %s", sync_log_id, status)
            return

        client = self._get_client()
        now = datetime.now(timezone.utc).isoformat()
        target = self._table_ref("adm_sync_logs")

        query = f"""
            UPDATE {target}
            SET status = @status,
                finished_at = TIMESTAMP(@finished_at),
                message = @message
            WHERE id = @sync_log_id
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("status", "STRING", status),
                bigquery.ScalarQueryParameter("finished_at", "STRING", now),
                bigquery.ScalarQueryParameter("message", "STRING", message),
                bigquery.ScalarQueryParameter("sync_log_id", "STRING", sync_log_id),
            ]
        )
        job = client.query(query, job_config=job_config)
        job.result()
        logger.info("sync_log %s → %s", sync_log_id, status)
