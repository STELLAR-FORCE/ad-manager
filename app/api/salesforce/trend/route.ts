import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import {
  SF_MART,
  SF_COLS,
  SF_STAGE_WON,
  lostStagesSqlList,
} from '@/lib/salesforce/queries';
import type { SfTrendRow } from '@/lib/types/salesforce';

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

type Row = {
  date: { value: string } | string;
  created: number | null;
  won: number | null;
  lost: number | null;
};

function dateStr(v: Row['date']): string {
  if (typeof v === 'string') return v.slice(0, 10);
  return v.value.slice(0, 10);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = parseDate(searchParams.get('start'));
  const end = parseDate(searchParams.get('end'));
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  // mart は LastStageChangeDate を持たないため、案件側 `受付日` を共通の日付軸として使う。
  // → 「対象期間中に発生した案件のうち、現時点で成約 / 失注のもの」を日次でカウントする。
  //   日次の遷移（その日に成約状態になった件数）とは意味が異なる点に留意。
  const sql = `
    WITH dates AS (
      SELECT d AS date
      FROM UNNEST(GENERATE_DATE_ARRAY(DATE(@start), DATE(@end))) AS d
    ),
    base AS (
      SELECT
        DATE(${SF_COLS.oppReceptionDate}) AS date,
        ${SF_COLS.oppStage} AS stage
      FROM ${SF_MART}
      WHERE ${SF_COLS.oppId} IS NOT NULL
        AND DATE(${SF_COLS.oppReceptionDate}) BETWEEN DATE(@start) AND DATE(@end)
    ),
    daily AS (
      SELECT
        date,
        COUNT(*) AS created,
        COUNTIF(stage = @wonStage) AS won,
        COUNTIF(stage IN (${lostStagesSqlList()})) AS lost
      FROM base
      GROUP BY date
    )
    SELECT
      d.date,
      IFNULL(daily.created, 0) AS created,
      IFNULL(daily.won, 0) AS won,
      IFNULL(daily.lost, 0) AS lost
    FROM dates d
    LEFT JOIN daily ON daily.date = d.date
    ORDER BY d.date
  `;

  try {
    const rows = await query<Row>(sql, { start, end, wonStage: SF_STAGE_WON });
    const result: SfTrendRow[] = rows.map((r) => ({
      date: dateStr(r.date),
      created: Number(r.created ?? 0),
      won: Number(r.won ?? 0),
      lost: Number(r.lost ?? 0),
    }));
    return NextResponse.json({ rows: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
