-- Issue #63 — 月別目標値マスタ
--
-- スプレッドシート脱却のため、目標値を BigQuery で持つ。
-- ダッシュボード上の編集 UI から DML で INSERT/MERGE する。
--
-- 想定 Project: stellarforce-bi
-- 想定 Dataset: dashboard
--
-- 適用前に dataset が無ければ作成する:
--   bq --location=asia-northeast1 mk -d --description "ダッシュボード運用データ" stellarforce-bi:dashboard

CREATE TABLE IF NOT EXISTS `stellarforce-bi.dashboard.targets_monthly` (
  -- 対象月（その月の 1 日。'2026-04-01' のように扱う）
  month DATE NOT NULL,
  -- 媒体: 'google' | 'yahoo' | 'bing' | NULL=全体
  platform STRING,
  -- CV 件数目標
  cv_target INT64,
  -- 室数目標（必要戸数の合計）
  room_target INT64,
  -- ルームデイズ目標
  room_days_target INT64,
  -- 粗利目標（円）
  gross_profit_target NUMERIC,
  -- 売上目標（円・借主請求額ベース）
  revenue_target NUMERIC,
  -- ルームデイズ目標（利用日数 × 室数）
  use_days_target NUMERIC,
  -- 自社物件分の日額単価（自社ポータル連携が入るまでの暫定値）
  inhouse_unit_price NUMERIC,
  -- メタ情報
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_by STRING
)
PARTITION BY DATE_TRUNC(month, MONTH)
OPTIONS (
  description = 'Issue #63: 月別目標値マスタ。ダッシュボード上で編集する。'
);

-- 既にテーブルが存在する場合は以下で列追加（idempotent ではないので 1 度だけ）:
--   ALTER TABLE `stellarforce-bi.dashboard.targets_monthly` ADD COLUMN IF NOT EXISTS use_days_target NUMERIC;

-- 一意制約は BQ では強制できないので、書き込み時は MERGE で UPSERT する想定:
--
-- MERGE `stellarforce-bi.dashboard.targets_monthly` T
-- USING (SELECT @month AS month, @platform AS platform, ...) S
-- ON T.month = S.month AND IFNULL(T.platform, '') = IFNULL(S.platform, '')
-- WHEN MATCHED THEN UPDATE SET ...
-- WHEN NOT MATCHED THEN INSERT (...) VALUES (...)
