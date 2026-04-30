/**
 * Issue #63 Phase 2.5 — 入居日ベース ピボット API
 *
 * GET /api/dashboard/move-in/pivot?periodType=quarter&year=2026&index=2
 *
 * 返却:
 *   {
 *     period: { type, year, index, label, start, end, months[] }
 *     pivot: [{ moveInMonth, cvMonth, cv, cvRooms, requestRoomDays }]
 *       - cvMonth は 'YYYY-MM' か特殊値 '__before__'（選択期間より前のCV）
 *     summary: [{ moveInMonth, wonCv, contractedRooms, grossProfit, revenue, contractedRoomDays }]
 *     targets: [{ month, platform=null, cvTarget, roomTarget, ..., useDaysTarget, grossProfitTarget }]
 *   }
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import {
  MOVE_IN_PIVOT_SQL,
  MOVE_IN_SUMMARY_SQL,
  type MoveInPivotRawRow,
  type MoveInSummaryRawRow,
} from '@/lib/salesforce/integrated-queries';
import {
  periodFromSearchParams,
  periodRange,
  toIsoDate,
  type Period,
} from '@/lib/period';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const TARGETS_TABLE = `\`${PROJECT_ID}.dashboard.targets_monthly\``;

function n(v: number | null | undefined): number {
  return v == null ? 0 : Number(v);
}

type RawTargetRow = {
  month: { value: string } | string;
  platform: string | null;
  cv_target: number | null;
  room_target: number | null;
  room_days_target: number | null;
  gross_profit_target: number | null;
  revenue_target: number | null;
  use_days_target: number | null;
  inhouse_unit_price: number | null;
};

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
  const cacheKey = `move-in-pivot:${period.type}:${period.year}:${period.index}`;

  try {
    const result = await cached(cacheKey, async () => {
      const [pivot, summary, targets] = await Promise.all([
        query<MoveInPivotRawRow>(MOVE_IN_PIVOT_SQL, {
          periodStart,
          periodEnd,
        }),
        query<MoveInSummaryRawRow>(MOVE_IN_SUMMARY_SQL, { periodStart, periodEnd }),
        // targets は dashboard データセット未作成だと落ちるので、その場合は空配列
        query<RawTargetRow>(
          `SELECT month, platform, cv_target, room_target, room_days_target,
                  gross_profit_target, revenue_target, use_days_target, inhouse_unit_price
           FROM ${TARGETS_TABLE}
           WHERE month BETWEEN DATE(@periodStart) AND DATE(@periodEnd)
             AND platform IS NULL
           ORDER BY month`,
          { periodStart, periodEnd },
        ).catch(() => [] as RawTargetRow[]),
      ]);
      return { pivot, summary, targets };
    });

    const pivotRows = result.value.pivot.map((r) => ({
      moveInMonth: r.move_in_month,
      cvMonth: r.cv_month,
      cv: n(r.cv),
      cvRooms: n(r.cv_rooms),
      requestRoomDays: n(r.request_room_days),
    }));

    const summaryRows = result.value.summary.map((r) => ({
      moveInMonth: r.move_in_month,
      wonCv: n(r.won_cv),
      contractedRooms: n(r.contracted_rooms),
      grossProfit: n(r.gross_profit),
      revenue: n(r.revenue),
      contractedRoomDays: n(r.contracted_room_days),
    }));

    const targets = result.value.targets.map((r) => ({
      month: toIso(r.month).slice(0, 7),
      platform: r.platform,
      cvTarget: r.cv_target,
      roomTarget: r.room_target,
      roomDaysTarget: r.room_days_target,
      grossProfitTarget:
        r.gross_profit_target == null ? null : Number(r.gross_profit_target),
      revenueTarget: r.revenue_target == null ? null : Number(r.revenue_target),
      useDaysTarget: r.use_days_target == null ? null : Number(r.use_days_target),
      inhouseUnitPrice:
        r.inhouse_unit_price == null ? null : Number(r.inhouse_unit_price),
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
        pivot: pivotRows,
        summary: summaryRows,
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
    console.error('入居日ピボット取得エラー:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
