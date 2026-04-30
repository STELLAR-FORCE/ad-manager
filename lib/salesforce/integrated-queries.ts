/**
 * 入居日ベース・CV発生日ベース・日次累積の SQL ビルダー。
 *
 * Issue #63 — スプレッドシート「広告運用管理」の主要 4 タブを BQ から再現する。
 * シートは正としない。広告 (ad_manager) と SFDC (staging.sf_*) を一次ソースとする。
 *
 * 業務上の主軸:
 *  - sf_Lead.Field9__c   = 受付日（CV発生日）— NULL は CreatedDate でフォールバック
 *  - sf_Lead.Field5__c   = 利用期間始期 = 希望入居日（入居日ベースの軸）
 *  - sf_Lead.Field8__c   = 利用期間日数（ルームデイズ算出済み）
 *  - sf_Lead.need_number_of_room__c       = 必要戸数 = CV室数
 *  - sf_contract_management__c.contracted_number_of_room__c = 成約室数
 *  - sf_contract_management__c.total_sales_gross_profit__c  = 粗利
 *  - sf_contract_management__c.billed_amount_to_tenant__c   = 売上（借主請求額）
 *  - sf_contract_management__c.is_contracted_monthly_inhouse__c = 自社物件チェック
 */

import { table } from '@/lib/bigquery';
import {
  SF_LEAD,
  SF_OPPORTUNITY,
  SF_CONTRACT,
  SF_STAGE_WON,
  PLATFORM_FROM_MEDIA_CASE,
  contractKindCase,
} from './queries';

/**
 * Lead 集計 CTE。集計軸を `dateExpr` で切り替えて再利用する。
 * dateExpr は l.Field5__c (入居日ベース) または IFNULL(l.Field9__c, l.CreatedDate) (CV発生日ベース)。
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
      SUM(IFNULL(l.need_number_of_room__c, 0)) AS cv_rooms,
      SUM(IFNULL(l.Field8__c, 0)) AS room_days,
      COUNTIF(opp.StageName = @wonStage) AS won_cv
    FROM ${SF_LEAD} l
    LEFT JOIN ${SF_OPPORTUNITY} opp ON opp.Id = l.ConvertedOpportunityId
    WHERE DATE(${dateExpr}) BETWEEN @start AND @end
    GROUP BY 1, 2
  `;
}

/**
 * 契約管理 CTE。Lead と JOIN して媒体・期間で絞り込む。
 * 契約区分 (新規/更新/延長/キャンセル) も内訳で返す。
 */
function contractCte(dateExpr: string, granularity: 'month' | 'day'): string {
  const bucket =
    granularity === 'month'
      ? `FORMAT_DATE('%Y-%m', DATE(${dateExpr}))`
      : `DATE(${dateExpr})`;
  const kind = contractKindCase('con.Name');
  return `
    SELECT
      ${bucket} AS bucket,
      ${PLATFORM_FROM_MEDIA_CASE} AS platform,
      SUM(IFNULL(con.contracted_number_of_room__c, 0)) AS contracted_rooms,
      SUM(IFNULL(con.total_sales_gross_profit__c, 0)) AS gross_profit,
      SUM(IFNULL(con.billed_amount_to_tenant__c, 0)) AS revenue,
      COUNTIF(con.is_contracted_monthly_inhouse__c = TRUE) AS inhouse_won_count,
      COUNTIF(${kind} = 'new') AS new_cnt,
      COUNTIF(${kind} = 'renewal') AS renewal_cnt,
      COUNTIF(${kind} = 'extension') AS extension_cnt,
      COUNTIF(${kind} = 'cancel') AS cancel_cnt
    FROM ${SF_LEAD} l
    JOIN ${SF_OPPORTUNITY} opp ON opp.Id = l.ConvertedOpportunityId
    JOIN ${SF_CONTRACT} con ON con.opportunity__c = opp.Id
    WHERE DATE(${dateExpr}) BETWEEN @start AND @end
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
 * 軸: sf_Lead.Field9__c (NULL は CreatedDate にフォールバック)
 * 媒体 × 月の Imp/Click/Cost + CV/室数/RD/成約/粗利/売上 + 契約区分内訳
 */
export const CV_BASED_SQL = `
  WITH lead_m AS (${leadCte('IFNULL(l.Field9__c, l.CreatedDate)', 'month')}),
       contract_m AS (${contractCte('IFNULL(l.Field9__c, l.CreatedDate)', 'month')}),
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
 * 軸: sf_Lead.Field5__c (希望入居日)。広告メトリクスは結合しない（軸が違うため）。
 */
export const MOVE_IN_SQL = `
  WITH lead_m AS (${leadCte('l.Field5__c', 'month')}),
       contract_m AS (${contractCte('l.Field5__c', 'month')})
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
 * 軸: sf_Lead 受付日（Field9__c → CreatedDate フォールバック）+ 広告 m.date を日次で揃える。
 * 累積（PARTITION BY platform ORDER BY date）も同時に返す。
 */
export const CV_DAILY_SQL = `
  WITH lead_d AS (${leadCte('IFNULL(l.Field9__c, l.CreatedDate)', 'day')}),
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
    FORMAT_DATE('%Y-%m', DATE(l.Field5__c)) AS move_in_month,
    FORMAT_DATE('%Y-%m', DATE(IFNULL(l.Field9__c, l.CreatedDate))) AS cv_month,
    COUNT(*) AS cv,
    SUM(IFNULL(l.need_number_of_room__c, 0)) AS cv_rooms,
    SUM(IFNULL(l.Field8__c, 0)) AS request_room_days
  FROM ${SF_LEAD} l
  WHERE DATE(l.Field5__c) BETWEEN @periodStart AND @periodEnd
  GROUP BY 1, 2
  ORDER BY move_in_month, cv_month
`;

/**
 * 入居月別のサマリ（成約 / 粗利 / 売上 / 成約ルームデイズ）。
 *
 * 中冨さん確認:
 *  - 成約判定 = 「契約管理レコードに移行すれば間違いない」→ con.Id IS NOT NULL でカウント。
 *    staging.sf_Opportunity の StageName 同期遅延を避けるため、契約管理ベースの方が確実。
 *  - 成約ルームデイズ = use_days_contracted__c × contracted_number_of_room__c の合計
 *    （依頼側の Field8__c が既に「必要戸数 × 期間」のルームデイズなので対称性で揃える）
 */
export const MOVE_IN_SUMMARY_SQL = `
  SELECT
    FORMAT_DATE('%Y-%m', DATE(l.Field5__c)) AS move_in_month,
    COUNT(DISTINCT IF(con.Id IS NOT NULL, l.Id, NULL)) AS won_cv,
    SUM(IFNULL(con.contracted_number_of_room__c, 0)) AS contracted_rooms,
    SUM(IFNULL(con.total_sales_gross_profit__c, 0)) AS gross_profit,
    SUM(IFNULL(con.billed_amount_to_tenant__c, 0)) AS revenue,
    SUM(IFNULL(con.use_days_contracted__c, 0) * IFNULL(con.contracted_number_of_room__c, 0)) AS contracted_room_days
  FROM ${SF_LEAD} l
  LEFT JOIN ${SF_OPPORTUNITY} opp ON opp.Id = l.ConvertedOpportunityId
  LEFT JOIN ${SF_CONTRACT} con ON con.opportunity__c = opp.Id
  WHERE DATE(l.Field5__c) BETWEEN @periodStart AND @periodEnd
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
