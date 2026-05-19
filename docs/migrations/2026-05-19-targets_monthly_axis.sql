-- Issue #93 — targets_monthly に「集計軸」を追加
--
-- ダッシュボード進捗カードは Phase 3c で「入居日 / 発生日」の軸切り替えに
-- 対応したが、目標値はこれまで両軸で共有していた。業務側では入居日ベースと
-- 発生日ベースで別の目標値を運用しているため、targets_monthly のキーに
-- axis を追加して両軸の目標を独立して持てるようにする。
--
-- 1 レコード = 月 × 軸 (movein|received) × platform
--
-- 適用コマンド:
--   bq --location=asia-northeast1 query --use_legacy_sql=false \
--     "$(cat docs/migrations/2026-05-19-targets_monthly_axis.sql)"

-- 1. axis カラム追加 (NULL 許容で追加してから既存レコードを埋める)
ALTER TABLE `stellarforce-bi.dashboard.targets_monthly`
  ADD COLUMN IF NOT EXISTS axis STRING
  OPTIONS (description = '集計軸: movein (入居日ベース) | received (発生日ベース)');

-- 2. 既存レコードを 'movein' で埋める (従来の挙動を維持)
UPDATE `stellarforce-bi.dashboard.targets_monthly`
SET axis = 'movein'
WHERE axis IS NULL;

-- 3. (任意) 確認クエリ
-- SELECT axis, COUNT(*) AS n
-- FROM `stellarforce-bi.dashboard.targets_monthly`
-- GROUP BY axis;
--
-- 一意制約は BQ では強制できないので、書き込み時は MERGE の ON 句に axis を加える運用にする:
--
-- MERGE T USING S
--   ON T.month = S.month
--   AND IFNULL(T.platform, '') = IFNULL(S.platform, '')
--   AND IFNULL(T.axis, 'movein') = IFNULL(S.axis, 'movein')
