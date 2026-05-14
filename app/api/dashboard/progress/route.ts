/**
 * GET /api/dashboard/progress
 *
 * ダッシュボードのサマリー（進捗ビュー）用 API。
 *
 * 入居日ベース（mart の `利用期間_始期`）で、以下 5 期間 × 4 指標を集計する:
 *   期間: 今週 / 今月 / Q / 上期下期 / 年（いずれも開始日 〜 today までの累計）
 *   指標: 粗利 / ルームデイズ / CV / 成約数
 *
 * 各値について「current（今期間）」「previous（前期間の同経過日数）」を返す。
 * 目標 (target) は `dashboard.targets_monthly` を期間ごとに合算した値を入れる。
 * 月次目標が無い月は 0 として扱う（合算しても OK）。
 */

import { NextResponse } from 'next/server';
import { query, tableIn } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import { SF_MART, SF_COLS } from '@/lib/salesforce/queries';
import {
  calcProgressRanges,
  type ProgressPeriodKey,
  type ProgressRange,
} from '@/lib/dashboard-progress';

const TARGETS_TABLE = tableIn('dashboard', 'targets_monthly');

type AggregateRow = {
  gross_profit: number | null;
  room_days: number | null;
  cv: number | null;
  won: number | null;
};

type TargetRow = {
  month: { value: string } | string;
  gross_profit_target: number | null;
  room_days_target: number | null;
  cv_target: number | null;
  // 成約数の目標は targets_monthly に専用カラムが無いので、ひとまず room_target (室数目標) を流用
  room_target: number | null;
};

type MetricRow = {
  current: number;
  previous: number;
  target: number | null;
};

type ProgressMetric = Record<ProgressPeriodKey, MetricRow>;

export type ProgressResponse = {
  today: string;
  periods: Record<ProgressPeriodKey, Pick<ProgressRange, 'start' | 'end' | 'label'>>;
  metrics: {
    grossProfit: ProgressMetric;
    roomDays: ProgressMetric;
    cv: ProgressMetric;
    won: ProgressMetric;
  };
};

/** 1 期間 (start, end) で mart を集計する SQL */
const aggregateSql = `
  SELECT
    IFNULL(SUM(${SF_COLS.grossProfit}), 0) AS gross_profit,
    IFNULL(SUM(IFNULL(${SF_COLS.useDaysContracted}, 0) * IFNULL(${SF_COLS.contractedRooms}, 0)), 0) AS room_days,
    COUNT(*) AS cv,
    COUNT(DISTINCT IF(${SF_COLS.contractId} IS NOT NULL, ${SF_COLS.leadId}, NULL)) AS won
  FROM ${SF_MART}
  WHERE DATE(${SF_COLS.usePeriodStart}) BETWEEN DATE(@start) AND DATE(@end)
`;

async function aggregate(start: string, end: string): Promise<AggregateRow> {
  const rows = await query<AggregateRow>(aggregateSql, { start, end });
  return rows[0] ?? { gross_profit: 0, room_days: 0, cv: 0, won: 0 };
}

/** targets_monthly から指定範囲 (start, end を含む月) の目標を合算する */
async function aggregateTargets(
  start: string,
  end: string,
): Promise<{ gross: number; rooms: number; days: number; cv: number }> {
  const sql = `
    SELECT
      IFNULL(SUM(gross_profit_target), 0) AS gross,
      IFNULL(SUM(room_target), 0) AS rooms,
      IFNULL(SUM(room_days_target), 0) AS days,
      IFNULL(SUM(cv_target), 0) AS cv
    FROM ${TARGETS_TABLE}
    WHERE month BETWEEN DATE(DATE_TRUNC(DATE(@start), MONTH))
                    AND DATE(DATE_TRUNC(DATE(@end), MONTH))
      AND platform IS NULL
  `;
  try {
    const rows = await query<{ gross: number; rooms: number; days: number; cv: number }>(
      sql,
      { start, end },
    );
    return rows[0] ?? { gross: 0, rooms: 0, days: 0, cv: 0 };
  } catch {
    // targets_monthly テーブルが無い / 権限無いなど → 目標 0 として扱う
    return { gross: 0, rooms: 0, days: 0, cv: 0 };
  }
}

export async function GET() {
  const now = new Date();
  const ranges = calcProgressRanges(now);

  const cacheKey = `dashboard-progress:${ranges.year.end}`;
  try {
    const cacheResult = await cached(cacheKey, async () => {
      // 各期間 × current/previous の集計を並列実行
      const keys: ProgressPeriodKey[] = ['week', 'month', 'quarter', 'halfYear', 'year'];
      const aggregatePairs = await Promise.all(
        keys.map(async (k) => {
          const r = ranges[k];
          const [cur, prev, tgt] = await Promise.all([
            aggregate(r.start, r.end),
            aggregate(r.prevStart, r.prevEnd),
            aggregateTargets(r.start, r.end),
          ]);
          return { key: k, cur, prev, tgt };
        }),
      );

      const empty: ProgressMetric = {
        week: { current: 0, previous: 0, target: null },
        month: { current: 0, previous: 0, target: null },
        quarter: { current: 0, previous: 0, target: null },
        halfYear: { current: 0, previous: 0, target: null },
        year: { current: 0, previous: 0, target: null },
      };
      const grossProfit: ProgressMetric = { ...empty };
      const roomDays: ProgressMetric = { ...empty };
      const cv: ProgressMetric = { ...empty };
      const won: ProgressMetric = { ...empty };

      for (const { key, cur, prev, tgt } of aggregatePairs) {
        grossProfit[key] = {
          current: Number(cur.gross_profit ?? 0),
          previous: Number(prev.gross_profit ?? 0),
          target: tgt.gross > 0 ? tgt.gross : null,
        };
        roomDays[key] = {
          current: Number(cur.room_days ?? 0),
          previous: Number(prev.room_days ?? 0),
          target: tgt.days > 0 ? tgt.days : null,
        };
        cv[key] = {
          current: Number(cur.cv ?? 0),
          previous: Number(prev.cv ?? 0),
          target: tgt.cv > 0 ? tgt.cv : null,
        };
        won[key] = {
          current: Number(cur.won ?? 0),
          previous: Number(prev.won ?? 0),
          target: tgt.rooms > 0 ? tgt.rooms : null,
        };
      }

      const result: ProgressResponse = {
        today: ranges.year.end,
        periods: {
          week: { start: ranges.week.start, end: ranges.week.end, label: ranges.week.label },
          month: { start: ranges.month.start, end: ranges.month.end, label: ranges.month.label },
          quarter: {
            start: ranges.quarter.start,
            end: ranges.quarter.end,
            label: ranges.quarter.label,
          },
          halfYear: {
            start: ranges.halfYear.start,
            end: ranges.halfYear.end,
            label: ranges.halfYear.label,
          },
          year: { start: ranges.year.start, end: ranges.year.end, label: ranges.year.label },
        },
        metrics: { grossProfit, roomDays, cv, won },
      };
      return result;
    });

    return NextResponse.json(cacheResult.value, {
      headers: {
        'X-Cache-Fetched-At': new Date(cacheResult.fetchedAt).toISOString(),
        'X-Cache-Hit': String(cacheResult.hit),
      },
    });
  } catch (err) {
    console.error('progress API error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
