-- Issue #112: RD目標 と 利用日数目標 の運用統合
--
-- `room_days_target` (INT64) と `use_days_target` (NUMERIC) は同一概念
-- (ルームデイズ = 利用日数 × 必要戸数) として並列管理されていたが、
-- 業務的に二重管理する意義がないため、RD目標 (room_days_target) に統一する。
--
-- 適用先: Dashboard SQL Editor で実行 (or bq query)
-- 適用順:
--   1. データ移行 (room_days_target が NULL で use_days_target に値がある行)
--   2. カラム DROP

-- Step 1: room_days_target が NULL の行で、use_days_target に値があれば移行
UPDATE `stellarforce-bi.dashboard.targets_monthly`
SET room_days_target = CAST(use_days_target AS INT64)
WHERE room_days_target IS NULL AND use_days_target IS NOT NULL;

-- Step 2: use_days_target カラムを削除
ALTER TABLE `stellarforce-bi.dashboard.targets_monthly`
DROP COLUMN use_days_target;
