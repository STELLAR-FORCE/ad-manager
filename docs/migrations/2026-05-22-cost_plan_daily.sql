-- 消化予定の日次入力テーブル
--
-- 月次累計推移ページの「消化予算」グラフで使う「目標累計線」を、
-- これまでの「月予算 ÷ 日数」按分から、業務側が日次で入力する予定値に
-- 切り替えるためのテーブル。
--
-- 業務的に予定は日次で変動する (例: 月初は控えめ、月末強化など) ので、
-- 1 日 1 レコードで持つ。媒体別の細分は今は持たず、全体合計のみ。
--
-- 適用コマンド:
--   bq --location=asia-northeast1 query --use_legacy_sql=false \
--     "$(cat docs/migrations/2026-05-22-cost_plan_daily.sql)"

CREATE TABLE IF NOT EXISTS `stellarforce-bi.dashboard.cost_plan_daily` (
  -- 対象日
  date DATE NOT NULL,
  -- 計画消化額（円）。0 を許容するが NULL は無し
  planned_cost NUMERIC NOT NULL,
  -- メタ
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_by STRING
)
PARTITION BY DATE_TRUNC(date, MONTH)
OPTIONS (
  description = '消化予定の日次マスタ。月次累計推移ページから編集する。'
);
