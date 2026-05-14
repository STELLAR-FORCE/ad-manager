-- ダッシュボード進捗カードの「成約数」用目標カラムを追加
--
-- 経緯: targets_monthly は当初「室数目標 (room_target)」のみを持っていたが、
-- 進捗カードで CV 室数と成約数を別指標として並べる方針に変わったため、
-- 成約件数の目標を独立した won_target カラムとして持つ。
--
-- room_target は「CV 室数の目標」として継続使用する（リード時点の希望室数合計の目標）。
--
-- 適用コマンド:
--   bq --location=asia-northeast1 query --use_legacy_sql=false \
--     "$(cat docs/migrations/2026-05-14-targets_monthly_won.sql)"

ALTER TABLE `stellarforce-bi.dashboard.targets_monthly`
  ADD COLUMN IF NOT EXISTS won_target INT64
  OPTIONS (description = '成約件数の月次目標');
