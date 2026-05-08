/**
 * 入居日ベース・CV発生日ベース・日次累積の SQL ビルダー。
 *
 * Issue #63 — スプレッドシート「広告運用管理」の主要 4 タブを BQ から再現する。
 * シートは正としない。広告 (ad_manager) と SFDC (mart.salesforce_all_obj) を一次ソースとする。
 *
 * mart.salesforce_all_obj は Lead + Opportunity + 契約管理を JOIN 済みの
 * ワイドビュー（1リード1行）。日本語カラムをそのまま参照する。
 *
 * 業務上の主軸:
 *  - `受付日時`            = CV発生日ベースの軸
 *  - `利用期間_始期`        = 希望入居日 = 入居日ベースの軸
 *  - `利用期間_日数`        = 利用日数（必要戸数 × 利用日数 → ルームデイズ算出に使う）
 *  - `必要戸数_数値`        = CV室数
 *  - `成約室数`             = 契約管理側の成約室数
 *  - `総売上_粗利`          = 粗利
 *  - `借主への請求額`        = 売上
 *  - `自社物件で決まった場合チェック` = 自社物件フラグ（true は粗利が 0 計上）
 */

import { table, tableIn } from '@/lib/bigquery';
import {
  SF_MART,
  SF_COLS,
  SF_STAGE_WON,
  PLATFORM_FROM_MEDIA_CASE,
  LP_LEAD_FILTER_SQL,
  contractKindCase,
} from './queries';

/**
 * Lead / Opportunity 集計 CTE。集計軸を `dateExpr` で切り替えて再利用する。
 *
 * dateExpr は `利用期間_始期` (入居日ベース) または `受付日時` (CV発生日ベース)。
 * mart は 1 リード 1 行なので JOIN 不要。
 */
function leadCte(dateExpr: string, granularity: 'month' | 'day'): string {
  const bucket =
    granularity === 'month'
      ? `FORMAT_DATE('%Y-%m', DATE(${dateExpr}))`
      : `DATE(${dateExpr})`;
  return `
    SELECT
      ${bucket} AS bucket,
      ${PLATFORM_FROM_MEDIA_CASE} AS platform,
      COUNT(*) AS cv,
      SUM(IFNULL(${SF_COLS.needRooms}, 0)) AS cv_rooms,
      SUM(IFNULL(${SF_COLS.usePeriodDays}, 0) * IFNULL(${SF_COLS.needRooms}, 0)) AS room_days,
      COUNTIF(${SF_COLS.oppStage} = @wonStage) AS won_cv
    FROM ${SF_MART}
    WHERE DATE(${dateExpr}) BETWEEN @start AND @end
    GROUP BY 1, 2
  `;
}

/**
 * 契約管理 CTE。mart 上では契約管理ID が NULL でないものが契約済み。
 * 契約区分 (新規/更新/延長/キャンセル) も内訳で返す。
 */
function contractCte(dateExpr: string, granularity: 'month' | 'day'): string {
  const bucket =
    granularity === 'month'
      ? `FORMAT_DATE('%Y-%m', DATE(${dateExpr}))`
      : `DATE(${dateExpr})`;
  const kind = contractKindCase(SF_COLS.contractName);
  return `
    SELECT
      ${bucket} AS bucket,
      ${PLATFORM_FROM_MEDIA_CASE} AS platform,
      SUM(IFNULL(${SF_COLS.contractedRooms}, 0)) AS contracted_rooms,
      SUM(IFNULL(${SF_COLS.grossProfit}, 0)) AS gross_profit,
      SUM(IFNULL(${SF_COLS.revenue}, 0)) AS revenue,
      COUNTIF(${SF_COLS.isInhouse} = TRUE) AS inhouse_won_count,
      COUNTIF(${kind} = 'new') AS new_cnt,
      COUNTIF(${kind} = 'renewal') AS renewal_cnt,
      COUNTIF(${kind} = 'extension') AS extension_cnt,
      COUNTIF(${kind} = 'cancel') AS cancel_cnt
    FROM ${SF_MART}
    WHERE ${SF_COLS.contractId} IS NOT NULL
      AND DATE(${dateExpr}) BETWEEN @start AND @end
    GROUP BY 1, 2
  `;
}

/** 広告メトリクス CTE（受付日ベースのみ使用。入居日ベースには結合しない）*/
function adMetricsCte(granularity: 'month' | 'day'): string {
  const bucket =
    granularity === 'month'
      ? `FORMAT_DATE('%Y-%m', m.date)`
      : `m.date`;
  return `
    SELECT
      ${bucket} AS bucket,
      m.platform AS platform,
      SUM(m.impressions) AS impressions,
      SUM(m.clicks) AS clicks,
      SUM(m.cost) AS cost
    FROM ${table('adm_daily_metrics')} m
    WHERE m.date BETWEEN @start AND @end
    GROUP BY 1, 2
  `;
}

/**
 * CV発生日ベースの集計 SQL。
 * 軸: `受付日時`
 * 媒体 × 月の Imp/Click/Cost + CV/室数/RD/成約/粗利/売上 + 契約区分内訳
 */
export const CV_BASED_SQL = `
  WITH lead_m AS (${leadCte(SF_COLS.receivedAt, 'month')}),
       contract_m AS (${contractCte(SF_COLS.receivedAt, 'month')}),
       ad_m AS (${adMetricsCte('month')})
  SELECT
    COALESCE(ad_m.bucket, lead_m.bucket, contract_m.bucket) AS month,
    COALESCE(ad_m.platform, lead_m.platform, contract_m.platform) AS platform,
    IFNULL(ad_m.impressions, 0) AS impressions,
    IFNULL(ad_m.clicks, 0) AS clicks,
    IFNULL(ad_m.cost, 0) AS cost,
    IFNULL(lead_m.cv, 0) AS cv,
    IFNULL(lead_m.cv_rooms, 0) AS cv_rooms,
    IFNULL(lead_m.room_days, 0) AS room_days,
    IFNULL(lead_m.won_cv, 0) AS won_cv,
    IFNULL(contract_m.contracted_rooms, 0) AS contracted_rooms,
    IFNULL(contract_m.gross_profit, 0) AS gross_profit,
    IFNULL(contract_m.revenue, 0) AS revenue,
    IFNULL(contract_m.inhouse_won_count, 0) AS inhouse_won_count,
    IFNULL(contract_m.new_cnt, 0) AS new_cnt,
    IFNULL(contract_m.renewal_cnt, 0) AS renewal_cnt,
    IFNULL(contract_m.extension_cnt, 0) AS extension_cnt,
    IFNULL(contract_m.cancel_cnt, 0) AS cancel_cnt
  FROM ad_m
  FULL OUTER JOIN lead_m USING (bucket, platform)
  FULL OUTER JOIN contract_m USING (bucket, platform)
  ORDER BY month, platform
`;

/**
 * 入居日ベースの集計 SQL。
 * 軸: `利用期間_始期` (希望入居日)。広告メトリクスは結合しない（軸が違うため）。
 */
export const MOVE_IN_SQL = `
  WITH lead_m AS (${leadCte(SF_COLS.usePeriodStart, 'month')}),
       contract_m AS (${contractCte(SF_COLS.usePeriodStart, 'month')})
  SELECT
    COALESCE(lead_m.bucket, contract_m.bucket) AS month,
    COALESCE(lead_m.platform, contract_m.platform) AS platform,
    IFNULL(lead_m.cv, 0) AS cv,
    IFNULL(lead_m.cv_rooms, 0) AS cv_rooms,
    IFNULL(lead_m.room_days, 0) AS room_days,
    IFNULL(lead_m.won_cv, 0) AS won_cv,
    IFNULL(contract_m.contracted_rooms, 0) AS contracted_rooms,
    IFNULL(contract_m.gross_profit, 0) AS gross_profit,
    IFNULL(contract_m.revenue, 0) AS revenue,
    IFNULL(contract_m.inhouse_won_count, 0) AS inhouse_won_count,
    IFNULL(contract_m.new_cnt, 0) AS new_cnt,
    IFNULL(contract_m.renewal_cnt, 0) AS renewal_cnt,
    IFNULL(contract_m.extension_cnt, 0) AS extension_cnt,
    IFNULL(contract_m.cancel_cnt, 0) AS cancel_cnt
  FROM lead_m
  FULL OUTER JOIN contract_m USING (bucket, platform)
  ORDER BY month, platform
`;

/**
 * 日次 CV 詳細 SQL。
 * 軸: 受付日時 + 広告 m.date を日次で揃える。
 * 累積（PARTITION BY platform ORDER BY date）も同時に返す。
 */
export const CV_DAILY_SQL = `
  WITH lead_d AS (${leadCte(SF_COLS.receivedAt, 'day')}),
       ad_d AS (${adMetricsCte('day')}),
       merged AS (
         SELECT
           COALESCE(ad_d.bucket, lead_d.bucket) AS date,
           COALESCE(ad_d.platform, lead_d.platform) AS platform,
           IFNULL(ad_d.cost, 0) AS cost,
           IFNULL(lead_d.cv, 0) AS cv,
           IFNULL(lead_d.cv_rooms, 0) AS rooms
         FROM ad_d
         FULL OUTER JOIN lead_d USING (bucket, platform)
       )
  SELECT
    date,
    platform,
    cv,
    rooms,
    cost,
    SUM(cv) OVER (PARTITION BY platform ORDER BY date) AS cumulative_cv,
    SUM(rooms) OVER (PARTITION BY platform ORDER BY date) AS cumulative_rooms,
    SUM(cost) OVER (PARTITION BY platform ORDER BY date) AS cumulative_cost
  FROM merged
  ORDER BY date, platform
`;

/** BQ から戻ってくる Raw 行（snake_case）。API 層で camelCase に整形する */
export type CvBasedRawRow = {
  month: string;
  platform: string;
  impressions: number | null;
  clicks: number | null;
  cost: number | null;
  cv: number | null;
  cv_rooms: number | null;
  room_days: number | null;
  won_cv: number | null;
  contracted_rooms: number | null;
  gross_profit: number | null;
  revenue: number | null;
  inhouse_won_count: number | null;
  new_cnt: number | null;
  renewal_cnt: number | null;
  extension_cnt: number | null;
  cancel_cnt: number | null;
};

export type MoveInRawRow = Omit<
  CvBasedRawRow,
  'impressions' | 'clicks' | 'cost'
>;

export type CvDailyRawRow = {
  date: { value: string } | string;
  platform: string;
  cv: number | null;
  rooms: number | null;
  cost: number | null;
  cumulative_cv: number | null;
  cumulative_rooms: number | null;
  cumulative_cost: number | null;
};

export const QUERY_PARAMS = { wonStage: SF_STAGE_WON } as const;

/**
 * 入居日ベースのピボット集計（CV発生月 × 入居月）。
 * cv_month は実際の発生月をそのまま返す。クライアント側で
 * cv_month < period_start を「前期間以前」行に集約しつつ、ツールチップ用の
 * 月別内訳を保持できるようにする。
 *
 * パラメータ:
 *   @periodStart  期間開始日（その月の 1 日）
 *   @periodEnd    期間終了日（その月の最終日）
 */
export const MOVE_IN_PIVOT_SQL = `
  SELECT
    FORMAT_DATE('%Y-%m', DATE(${SF_COLS.usePeriodStart})) AS move_in_month,
    FORMAT_DATE('%Y-%m', DATE(${SF_COLS.receivedAt})) AS cv_month,
    COUNT(*) AS cv,
    SUM(IFNULL(${SF_COLS.needRooms}, 0)) AS cv_rooms,
    SUM(IFNULL(${SF_COLS.usePeriodDays}, 0) * IFNULL(${SF_COLS.needRooms}, 0)) AS request_room_days
  FROM ${SF_MART}
  WHERE DATE(${SF_COLS.usePeriodStart}) BETWEEN @periodStart AND @periodEnd
  GROUP BY 1, 2
  ORDER BY move_in_month, cv_month
`;

/**
 * 入居月別のサマリ（成約 / 粗利 / 売上 / 成約ルームデイズ）。
 *
 * 成約判定 = 契約管理レコード存在（mart の `契約管理ID IS NOT NULL`）
 * 成約ルームデイズ = `利用日数_成約` × `成約室数` の合計
 *   （依頼側の `利用期間_日数 × 必要戸数_数値` と対称な算出）
 */
export const MOVE_IN_SUMMARY_SQL = `
  SELECT
    FORMAT_DATE('%Y-%m', DATE(${SF_COLS.usePeriodStart})) AS move_in_month,
    COUNT(DISTINCT IF(${SF_COLS.contractId} IS NOT NULL, ${SF_COLS.leadId}, NULL)) AS won_cv,
    SUM(IFNULL(${SF_COLS.contractedRooms}, 0)) AS contracted_rooms,
    SUM(IFNULL(${SF_COLS.grossProfit}, 0)) AS gross_profit,
    SUM(IFNULL(${SF_COLS.revenue}, 0)) AS revenue,
    SUM(IFNULL(${SF_COLS.useDaysContracted}, 0) * IFNULL(${SF_COLS.contractedRooms}, 0)) AS contracted_room_days
  FROM ${SF_MART}
  WHERE DATE(${SF_COLS.usePeriodStart}) BETWEEN @periodStart AND @periodEnd
  GROUP BY 1
  ORDER BY 1
`;

export type MoveInPivotRawRow = {
  move_in_month: string;
  cv_month: string;
  cv: number | null;
  cv_rooms: number | null;
  request_room_days: number | null;
};

export type MoveInSummaryRawRow = {
  move_in_month: string;
  won_cv: number | null;
  contracted_rooms: number | null;
  gross_profit: number | null;
  revenue: number | null;
  contracted_room_days: number | null;
};

/**
 * Issue #64 — 入居月別の予想粗利と進行中パイプライン。
 *
 * - LP 経由リード (`流入元_LP反響 IN (LP値)`) → 案件化済 (`案件ID IS NOT NULL`) のみが対象
 * - 確定粗利: 契約管理側の `総売上_粗利`（自社物件除外）
 * - 進行中: 案件のフェーズが 'introduced'/'early' のもの。`必要戸数_数値 × unit_price × probability`
 * - 実績粗利単価中央値: 直近の確定粗利 / 成約室数 の中央値（想定 ¥100,000/室 との乖離可視化用）
 *
 * 注:
 *   1. won グループ（物件決定〜案件成立）は契約管理側で確定粗利を取るため
 *      Opportunity 側の集計対象に含めない（重複防止）
 *   2. lost グループは確度 0% なので集計しても 0 になるが、明示的に除外する
 *   3. 契約管理レコードが既にある案件は確定粗利でカウント（重複防止のため pipeline 側から除外）
 *   4. unit_price は dashboard.unit_price_assumption の最新値（effective_from が NULL or 過去）を使う
 */
export const MOVE_IN_FORECAST_SQL = `
  WITH stage_prob AS (
    SELECT stage_name, stage_group, probability
    FROM ${tableIn('dashboard', 'stage_probability')}
  ),
  unit_price_cte AS (
    SELECT unit_price
    FROM ${tableIn('dashboard', 'unit_price_assumption')}
    WHERE effective_from IS NULL OR effective_from <= CURRENT_DATE()
    ORDER BY effective_from DESC NULLS LAST
    LIMIT 1
  ),
  confirmed AS (
    SELECT
      FORMAT_DATE('%Y-%m', DATE(${SF_COLS.usePeriodStart})) AS move_in_month,
      SUM(IFNULL(${SF_COLS.grossProfit}, 0)) AS confirmed_gross_profit,
      SUM(IFNULL(${SF_COLS.contractedRooms}, 0)) AS confirmed_rooms,
      ARRAY_AGG(
        SAFE_DIVIDE(${SF_COLS.grossProfit}, NULLIF(${SF_COLS.contractedRooms}, 0))
        IGNORE NULLS
      ) AS unit_prices
    FROM ${SF_MART}
    WHERE DATE(${SF_COLS.usePeriodStart}) BETWEEN @periodStart AND @periodEnd
      AND ${LP_LEAD_FILTER_SQL}
      AND ${SF_COLS.contractId} IS NOT NULL
      AND IFNULL(${SF_COLS.isInhouse}, FALSE) = FALSE
    GROUP BY 1
  ),
  pipeline AS (
    SELECT
      FORMAT_DATE('%Y-%m', DATE(${SF_COLS.usePeriodStart})) AS move_in_month,
      sp.stage_group,
      SUM(IFNULL(${SF_COLS.needRooms}, 0)) AS rooms,
      SUM(IFNULL(${SF_COLS.needRooms}, 0) * sp.probability) AS weighted_rooms
    FROM ${SF_MART}
    JOIN stage_prob sp ON sp.stage_name = ${SF_COLS.oppStage}
    WHERE DATE(${SF_COLS.usePeriodStart}) BETWEEN @periodStart AND @periodEnd
      AND ${LP_LEAD_FILTER_SQL}
      AND ${SF_COLS.oppId} IS NOT NULL
      AND ${SF_COLS.contractId} IS NULL
      AND sp.stage_group IN ('introduced', 'early')
    GROUP BY 1, 2
  ),
  pipeline_pivot AS (
    SELECT
      move_in_month,
      SUM(IF(stage_group = 'introduced', rooms, 0)) AS introduced_rooms,
      SUM(IF(stage_group = 'early', rooms, 0)) AS early_rooms,
      SUM(weighted_rooms) AS pipeline_weighted_rooms
    FROM pipeline
    GROUP BY 1
  )
  SELECT
    COALESCE(c.move_in_month, p.move_in_month) AS move_in_month,
    IFNULL(c.confirmed_gross_profit, 0) AS confirmed_gross_profit,
    IFNULL(c.confirmed_rooms, 0) AS confirmed_rooms,
    (
      SELECT APPROX_QUANTILES(x, 100)[OFFSET(50)]
      FROM UNNEST(IFNULL(c.unit_prices, [])) AS x
    ) AS actual_unit_price_median,
    IFNULL(p.introduced_rooms, 0) AS introduced_rooms,
    IFNULL(p.early_rooms, 0) AS early_rooms,
    IFNULL(p.pipeline_weighted_rooms, 0) AS pipeline_weighted_rooms,
    IFNULL(p.pipeline_weighted_rooms, 0) * (SELECT unit_price FROM unit_price_cte) AS pipeline_forecast_gross_profit,
    (SELECT unit_price FROM unit_price_cte) AS assumed_unit_price
  FROM confirmed c
  FULL OUTER JOIN pipeline_pivot p USING (move_in_month)
  ORDER BY move_in_month
`;

export type MoveInForecastRawRow = {
  move_in_month: string;
  confirmed_gross_profit: number | null;
  confirmed_rooms: number | null;
  actual_unit_price_median: number | null;
  introduced_rooms: number | null;
  early_rooms: number | null;
  pipeline_weighted_rooms: number | null;
  pipeline_forecast_gross_profit: number | null;
  assumed_unit_price: number | null;
};
