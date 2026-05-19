/**
 * GET /api/dashboard/progress?axis=movein|received
 *
 * ダッシュボードのサマリー（進捗ビュー）用 API。
 *
 * 集計の「軸」を 2 種類サポート (Phase 3c):
 *   - axis=movein (デフォルト): 入居日ベース。`利用期間_始期` が期間内
 *   - axis=received:           発生日ベース。`受付日時` が期間内 (マーケ視点)
 *
 * 以下 5 期間 × 5 指標を集計する:
 *   期間: 今週 / 今月 / Q / 上期下期 / 年（いずれも開始日 〜 today までの累計）
 *   指標: CV / CV室数 / ルームデイズ / 成約数 / 粗利
 *
 * 各値について「current（今期間）」「previous（前期間の同経過日数）」を返す。
 * 目標 (target) は `dashboard.targets_monthly` を期間ごとに合算した値を入れる。
 * 月次目標が無い月は 0 として扱う（合算しても OK）。両軸で同じ目標を共有する。
 */

import { NextResponse } from 'next/server';
import { query, tableIn } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import { SF_MART, SF_COLS, LP_LEAD_FILTER_SQL } from '@/lib/salesforce/queries';
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
  cv_rooms: number | null;
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
    cvRooms: ProgressMetric;
    won: ProgressMetric;
  };
};

type Axis = 'movein' | 'received';

/** 軸に応じた WHERE 句の日付カラム */
function axisDateColumn(axis: Axis): string {
  return axis === 'received' ? SF_COLS.receivedAt : SF_COLS.usePeriodStart;
}

/**
 * 1 期間 (start, end) で mart を集計する SQL（軸ごとに日付カラムを差し替え）
 *
 * このダッシュボードは LP 経由のみを対象とするので、Salesforce 由来の集計には
 * すべて LP_LEAD_FILTER_SQL を適用する（流入元_LP反響 ∈ monthly-order/express/standard/site）。
 *
 * 重要 (Issue #97): mart は契約管理単位で行展開されているため、リード単位の集計
 * (cv / cv_rooms / room_days) はサブクエリで先にリード単位に集約してから集計する。
 *
 * 粗利は契約管理単位の値なので SUM のままで OK（複数契約合算）。
 * 成約数は元から COUNT DISTINCT リードID で対応済。
 *
 * `利用期間_日数` は SF 側で既に「日数 × 必要戸数」で算出される計算項目。
 */
function buildAggregateSql(axis: Axis): string {
  const dateCol = axisDateColumn(axis);
  return `
    WITH lead_level AS (
      SELECT
        ${SF_COLS.leadId} AS lead_id,
        ANY_VALUE(${SF_COLS.needRooms}) AS need_rooms,
        ANY_VALUE(${SF_COLS.usePeriodDays}) AS use_period_days,
        MAX(IF(${SF_COLS.contractId} IS NOT NULL, 1, 0)) AS has_contract
      FROM ${SF_MART}
      WHERE DATE(${dateCol}) BETWEEN DATE(@start) AND DATE(@end)
        AND ${LP_LEAD_FILTER_SQL}
      GROUP BY lead_id
    ),
    gross AS (
      SELECT IFNULL(SUM(${SF_COLS.grossProfit}), 0) AS gross_profit
      FROM ${SF_MART}
      WHERE DATE(${dateCol}) BETWEEN DATE(@start) AND DATE(@end)
        AND ${LP_LEAD_FILTER_SQL}
    )
    SELECT
      (SELECT gross_profit FROM gross) AS gross_profit,
      IFNULL(SUM(use_period_days), 0) AS room_days,
      COUNT(*) AS cv,
      IFNULL(SUM(need_rooms), 0) AS cv_rooms,
      SUM(has_contract) AS won
    FROM lead_level
  `;
}

async function aggregate(axis: Axis, start: string, end: string): Promise<AggregateRow> {
  const rows = await query<AggregateRow>(buildAggregateSql(axis), { start, end });
  return rows[0] ?? { gross_profit: 0, room_days: 0, cv: 0, cv_rooms: 0, won: 0 };
}

/**
 * 期間タブごとの「目標値カバー範囲」を返す。
 * 今までは current 期間の start〜end のみ参照していたため、Q/半期/年は経過月だけ、
 * 週は月目標まるごとが入って達成率の意味がおかしくなっていた（#82）。
 *
 * 修正: 期間タブごとに「全期間の月リスト」を返す:
 *   - week:     その週が含まれる月の月目標 ÷ 4 を週相当として扱う
 *   - month:    その月の 1 ヶ月分
 *   - quarter:  Q の 3 ヶ月分 全て
 *   - halfYear: 半期の 6 ヶ月分 全て
 *   - year:     1月〜12月の 12 ヶ月分 全て
 */
function targetMonthsForPeriod(
  key: 'week' | 'month' | 'quarter' | 'halfYear' | 'year',
  today: Date,
): { firstMonth: string; lastMonth: string; weekDivisor: number } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = today.getFullYear();
  const m = today.getMonth() + 1; // 1-12
  switch (key) {
    case 'week':
      // 月目標をそのまま渡して、結果を 4 で割る（≒ 月の 1/4 を週分とみなす近似）
      return { firstMonth: `${y}-${pad(m)}-01`, lastMonth: `${y}-${pad(m)}-01`, weekDivisor: 4 };
    case 'month':
      return { firstMonth: `${y}-${pad(m)}-01`, lastMonth: `${y}-${pad(m)}-01`, weekDivisor: 1 };
    case 'quarter': {
      const qIdx = Math.floor((m - 1) / 3); // 0..3
      const qStart = qIdx * 3 + 1;
      const qEnd = qStart + 2;
      return {
        firstMonth: `${y}-${pad(qStart)}-01`,
        lastMonth: `${y}-${pad(qEnd)}-01`,
        weekDivisor: 1,
      };
    }
    case 'halfYear': {
      const hIdx = m <= 6 ? 0 : 1;
      const hStart = hIdx * 6 + 1;
      const hEnd = hStart + 5;
      return {
        firstMonth: `${y}-${pad(hStart)}-01`,
        lastMonth: `${y}-${pad(hEnd)}-01`,
        weekDivisor: 1,
      };
    }
    case 'year':
      return { firstMonth: `${y}-01-01`, lastMonth: `${y}-12-01`, weekDivisor: 1 };
  }
}

/** targets_monthly から指定月範囲の目標を合算（週タブは結果を ÷ 4 する） */
async function aggregateTargetsForPeriod(
  key: 'week' | 'month' | 'quarter' | 'halfYear' | 'year',
  today: Date,
): Promise<{ gross: number; rooms: number; days: number; cv: number }> {
  const { firstMonth, lastMonth, weekDivisor } = targetMonthsForPeriod(key, today);
  const sql = `
    SELECT
      IFNULL(SUM(gross_profit_target), 0) AS gross,
      IFNULL(SUM(room_target), 0) AS rooms,
      IFNULL(SUM(room_days_target), 0) AS days,
      IFNULL(SUM(cv_target), 0) AS cv
    FROM ${TARGETS_TABLE}
    WHERE month BETWEEN DATE(@firstMonth) AND DATE(@lastMonth)
      AND platform IS NULL
  `;
  try {
    const rows = await query<{ gross: number; rooms: number; days: number; cv: number }>(
      sql,
      { firstMonth, lastMonth },
    );
    const r = rows[0] ?? { gross: 0, rooms: 0, days: 0, cv: 0 };
    return {
      gross: Number(r.gross ?? 0) / weekDivisor,
      rooms: Number(r.rooms ?? 0) / weekDivisor,
      days: Number(r.days ?? 0) / weekDivisor,
      cv: Number(r.cv ?? 0) / weekDivisor,
    };
  } catch {
    // targets_monthly テーブルが無い / 権限無いなど → 目標 0 として扱う
    return { gross: 0, rooms: 0, days: 0, cv: 0 };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const axisParam = searchParams.get('axis');
  const axis: Axis = axisParam === 'received' ? 'received' : 'movein';

  const now = new Date();
  const ranges = calcProgressRanges(now);

  // v4: リード単位 GROUP BY でダブルカウント解消 (Issue #97)
  const cacheKey = `dashboard-progress:v4:${axis}:${ranges.year.end}`;
  try {
    const cacheResult = await cached(cacheKey, async () => {
      // 各期間 × current/previous の集計を並列実行
      const keys: ProgressPeriodKey[] = ['week', 'month', 'quarter', 'halfYear', 'year'];
      const aggregatePairs = await Promise.all(
        keys.map(async (k) => {
          const r = ranges[k];
          const [cur, prev, tgt] = await Promise.all([
            aggregate(axis, r.start, r.end),
            aggregate(axis, r.prevStart, r.prevEnd),
            aggregateTargetsForPeriod(k, now),
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
      const cvRooms: ProgressMetric = { ...empty };
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
        // 室数目標 (room_target) は「CV 室数の目標」として CV 室数側に紐付ける。
        // 成約 (won) は専用の目標カラムが無いため、目標なし（前期間比表示）。
        cvRooms[key] = {
          current: Number(cur.cv_rooms ?? 0),
          previous: Number(prev.cv_rooms ?? 0),
          target: tgt.rooms > 0 ? tgt.rooms : null,
        };
        won[key] = {
          current: Number(cur.won ?? 0),
          previous: Number(prev.won ?? 0),
          target: null,
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
        metrics: { grossProfit, roomDays, cv, cvRooms, won },
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
