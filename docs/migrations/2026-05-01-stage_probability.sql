-- Issue #64 — フェーズ確度マスタ
--
-- 入居日ベースの予想粗利を算出するためのフェーズ確度マスタ。
-- StageName ごとにグループ・確度を持ち、ダッシュボード上で編集可能にする。
--
-- 設計思想:
--   1. 案件管理は「物件成立」まで。物件決定以降は契約管理側にレコードが作られる
--      → 「成立済」グループは契約管理の確定粗利を使う（このマスタの確度は名目上 100%）
--   2. 物件決定前のフェーズ（早期 / 紹介後）は Opportunity 側で確度加重して見込み粗利を算出
--   3. マスタに無いフェーズはダッシュボードに出さない（保険）
--
-- 想定 Project: stellarforce-bi
-- 想定 Dataset: dashboard

CREATE TABLE IF NOT EXISTS `stellarforce-bi.dashboard.stage_probability` (
  -- StageName（sf_OpportunityStage.MasterLabel と一致）
  stage_name STRING NOT NULL,
  -- グループ: 'won' | 'introduced' | 'early' | 'lost'
  stage_group STRING NOT NULL,
  -- 確度（0.0〜1.0）。'won' は契約管理側で確定粗利を使うため、計算上は使われない
  probability NUMERIC NOT NULL,
  -- 表示順（ダッシュボードで並び順を制御するための任意値）
  sort_order INT64,
  -- メタ情報
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_by STRING
)
OPTIONS (
  description = 'Issue #64: フェーズ確度マスタ。マンスリー転貸レコードタイプの想定 11 フェーズのみ管理。'
);

-- 初期値投入（マンスリー転貸レコードタイプの想定フェーズのみ）。
-- 既存レコードがある場合は MERGE で UPSERT。
MERGE `stellarforce-bi.dashboard.stage_probability` T
USING (
  SELECT * FROM UNNEST([
    STRUCT('物件決定'                AS stage_name, 'won'        AS stage_group, NUMERIC '1.00' AS probability,  10 AS sort_order),
    STRUCT('ドラフト承認申請'        AS stage_name, 'won'        AS stage_group, NUMERIC '1.00' AS probability,  11 AS sort_order),
    STRUCT('ドラフト送付'            AS stage_name, 'won'        AS stage_group, NUMERIC '1.00' AS probability,  12 AS sort_order),
    STRUCT('案件成立'                AS stage_name, 'won'        AS stage_group, NUMERIC '1.00' AS probability,  13 AS sort_order),
    STRUCT('物件紹介済'              AS stage_name, 'introduced' AS stage_group, NUMERIC '0.50' AS probability,  20 AS sort_order),
    STRUCT('新規受託'                AS stage_name, 'early'      AS stage_group, NUMERIC '0.25' AS probability,  30 AS sort_order),
    STRUCT('ヒアリング'              AS stage_name, 'early'      AS stage_group, NUMERIC '0.25' AS probability,  31 AS sort_order),
    STRUCT('失注（他決）'            AS stage_name, 'lost'       AS stage_group, NUMERIC '0.00' AS probability,  90 AS sort_order),
    STRUCT('失注（他決 / ウィークリー）' AS stage_name, 'lost'   AS stage_group, NUMERIC '0.00' AS probability,  91 AS sort_order),
    STRUCT('失注（理由不明）'        AS stage_name, 'lost'       AS stage_group, NUMERIC '0.00' AS probability,  92 AS sort_order),
    STRUCT('失注（対応不備・トラブル）' AS stage_name, 'lost'   AS stage_group, NUMERIC '0.00' AS probability,  93 AS sort_order),
    STRUCT('キャンセル'              AS stage_name, 'lost'       AS stage_group, NUMERIC '0.00' AS probability,  94 AS sort_order)
  ])
) S
ON T.stage_name = S.stage_name
WHEN MATCHED THEN UPDATE SET
  stage_group = S.stage_group,
  probability = S.probability,
  sort_order  = S.sort_order,
  updated_at  = CURRENT_TIMESTAMP(),
  updated_by  = 'migration:2026-05-01'
WHEN NOT MATCHED THEN INSERT (stage_name, stage_group, probability, sort_order, updated_by)
  VALUES (S.stage_name, S.stage_group, S.probability, S.sort_order, 'migration:2026-05-01');

-- 単価マスタ（想定粗利単価。マーケ運用基準で 1 室あたり ¥100,000）。
-- 将来的に媒体別 / 期間別に持てるよう柔軟に持つ。
CREATE TABLE IF NOT EXISTS `stellarforce-bi.dashboard.unit_price_assumption` (
  -- 適用開始月（NULL=全期間）
  effective_from DATE,
  -- 1 室あたりの想定粗利（円）
  unit_price NUMERIC NOT NULL,
  -- メモ
  note STRING,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_by STRING
)
OPTIONS (
  description = 'Issue #64: 1 室あたりの想定粗利単価マスタ。マーケ運用基準。'
);

-- 初期値: ¥100,000/室
MERGE `stellarforce-bi.dashboard.unit_price_assumption` T
USING (SELECT CAST(NULL AS DATE) AS effective_from, NUMERIC '100000' AS unit_price, 'マーケ運用基準（初期値）' AS note) S
ON T.effective_from IS NULL AND S.effective_from IS NULL
WHEN NOT MATCHED THEN INSERT (effective_from, unit_price, note, updated_by)
  VALUES (S.effective_from, S.unit_price, S.note, 'migration:2026-05-01');
