/**
 * Issue #64 — 入居日ベース サマリー API
 *
 * GET /api/dashboard/move-in/summary?periodType=quarter&year=2026&index=2
 *
 * 入居月別のサマリーカード用データを返す。
 *  - 確定粗利（契約管理側）
 *  - 進行中パイプライン（紹介後 / 早期 の希望室数）
 *  - 予想粗利 = 確定 + 進行中×想定単価×確度
 *  - 想定単価 ¥100,000/室 と実績粗利単価中央値の併記
 *  - 目標値（targets_monthly）と CV/室数/RD の現状実績
 *
 * 対象は LP 経由リード (`ryuunyuumoto__c IN (LP値)`) → 案件化済のみ。
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import {
  MOVE_IN_FORECAST_SQL,
  MOVE_IN_SUMMARY_SQL,
  type MoveInForecastRawRow,
  type MoveInSummaryRawRow,
} from '@/lib/salesforce/integrated-queries';
import {
  SF_LEAD,
  SF_OPPORTUNITY,
  LP_LEAD_FILTER_SQL,
} from '@/lib/salesforce/queries';
import {
  periodFromSearchParams,
  periodRange,
  toIsoDate,
  type Period,
} from '@/lib/period';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const TARGETS_TABLE = `\`${PROJECT_ID}.dashboard.targets_monthly\``;

/**
 * LP 経由リードの CV / 室数 / RD を入居月別に集計する SQL。
 * MOVE_IN_SUMMARY_SQL は LP フィルタ無しで全リードを集計しているため、
 * サマリーカード用には LP 限定の集計を別に取る。
 */
const LP_LEAD_AGG_SQL = `
  SELECT
    FORMAT_DATE('%Y-%m', DATE(l.Field5__c)) AS move_in_month,
    COUNT(*) AS cv,
    SUM(IFNULL(l.need_number_of_room__c, 0)) AS cv_rooms,
    SUM(IFNULL(l.Field8__c, 0)) AS request_room_days
  FROM ${SF_LEAD} l
  JOIN ${SF_OPPORTUNITY} opp ON opp.Id = l.ConvertedOpportunityId
  WHERE DATE(l.Field5__c) BETWEEN @periodStart AND @periodEnd
    AND ${LP_LEAD_FILTER_SQL}
  GROUP BY 1
  ORDER BY 1
`;

type LpLeadAggRow = {
  move_in_month: string;
  cv: number | null;
  cv_rooms: number | null;
  request_room_days: number | null;
};

type RawTargetRow = {
  month: { value: string } | string;
  cv_target: number | null;
  room_target: number | null;
  room_days_target: number | null;
  gross_profit_target: number | null;
  revenue_target: number | null;
  use_days_target: number | null;
};

function n(v: number | null | undefined): number {
  return v == null ? 0 : Number(v);
}

function toIso(v: RawTargetRow['month']): string {
  return typeof v === 'string' ? v : v.value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fallback: Period = { type: 'half', year: new Date().getFullYear(), index: 1 };
  const period = periodFromSearchParams(searchParams, fallback);
  const range = periodRange(period);
  const periodStart = toIsoDate(range.start);
  const periodEnd = toIsoDate(range.end);
  const cacheKey = `move-in-summary:${period.type}:${period.year}:${period.index}`;

  try {
    const result = await cached(cacheKey, async () => {
      const [forecast, leadAgg, summary, targets] = await Promise.all([
        query<MoveInForecastRawRow>(MOVE_IN_FORECAST_SQL, { periodStart, periodEnd }),
        query<LpLeadAggRow>(LP_LEAD_AGG_SQL, { periodStart, periodEnd }),
        // 全リードベースの成約サマリ（LPフィルタ無し）— 既存ピボットビューと数値を揃えるため
        query<MoveInSummaryRawRow>(MOVE_IN_SUMMARY_SQL, { periodStart, periodEnd }),
        query<RawTargetRow>(
          `SELECT month, cv_target, room_target, room_days_target,
                  gross_profit_target, revenue_target, use_days_target
           FROM ${TARGETS_TABLE}
           WHERE month BETWEEN DATE(@periodStart) AND DATE(@periodEnd)
             AND platform IS NULL
           ORDER BY month`,
          { periodStart, periodEnd },
        ).catch(() => [] as RawTargetRow[]),
      ]);
      return { forecast, leadAgg, summary, targets };
    });

    const forecast = result.value.forecast.map((r) => ({
      moveInMonth: r.move_in_month,
      confirmedGrossProfit: n(r.confirmed_gross_profit),
      confirmedRooms: n(r.confirmed_rooms),
      actualUnitPriceMedian:
        r.actual_unit_price_median == null ? null : Number(r.actual_unit_price_median),
      introducedRooms: n(r.introduced_rooms),
      earlyRooms: n(r.early_rooms),
      pipelineWeightedRooms: Number(r.pipeline_weighted_rooms ?? 0),
      pipelineForecastGrossProfit: n(r.pipeline_forecast_gross_profit),
      assumedUnitPrice: n(r.assumed_unit_price),
    }));

    const leadAgg = result.value.leadAgg.map((r) => ({
      moveInMonth: r.move_in_month,
      cv: n(r.cv),
      cvRooms: n(r.cv_rooms),
      requestRoomDays: n(r.request_room_days),
    }));

    const summary = result.value.summary.map((r) => ({
      moveInMonth: r.move_in_month,
      wonCv: n(r.won_cv),
      contractedRooms: n(r.contracted_rooms),
      grossProfit: n(r.gross_profit),
      revenue: n(r.revenue),
      contractedRoomDays: n(r.contracted_room_days),
    }));

    const targets = result.value.targets.map((r) => ({
      month: toIso(r.month).slice(0, 7),
      cvTarget: r.cv_target,
      roomTarget: r.room_target,
      roomDaysTarget: r.room_days_target,
      grossProfitTarget:
        r.gross_profit_target == null ? null : Number(r.gross_profit_target),
      revenueTarget: r.revenue_target == null ? null : Number(r.revenue_target),
      useDaysTarget: r.use_days_target == null ? null : Number(r.use_days_target),
    }));

    return NextResponse.json(
      {
        period: {
          ...period,
          label: range.label,
          start: periodStart,
          end: periodEnd,
          months: range.months,
        },
        forecast,
        leadAgg,
        summary,
        targets,
      },
      {
        headers: {
          'X-Cache-Fetched-At': new Date(result.fetchedAt).toISOString(),
          'X-Cache-Hit': String(result.hit),
        },
      },
    );
  } catch (err) {
    console.error('入居日サマリー取得エラー:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
