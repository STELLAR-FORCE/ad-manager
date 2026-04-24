import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import {
  SF_OPPORTUNITY,
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

  // CreatedDate ベースの日別新規件数 + Won/Lost を LastStageChangeDate ベースで別集計
  // 単一クエリで完結させるため、日付ディメンションを生成して LEFT JOIN する
  const sql = `
    WITH dates AS (
      SELECT d AS date
      FROM UNNEST(GENERATE_DATE_ARRAY(DATE(@start), DATE(@end))) AS d
    ),
    created AS (
      SELECT DATE(CreatedDate) AS date, COUNT(*) AS n
      FROM ${SF_OPPORTUNITY}
      WHERE DATE(CreatedDate) BETWEEN DATE(@start) AND DATE(@end)
      GROUP BY 1
    ),
    won AS (
      SELECT DATE(LastStageChangeDate) AS date, COUNT(*) AS n
      FROM ${SF_OPPORTUNITY}
      WHERE StageName = @wonStage
        AND DATE(LastStageChangeDate) BETWEEN DATE(@start) AND DATE(@end)
      GROUP BY 1
    ),
    lost AS (
      SELECT DATE(LastStageChangeDate) AS date, COUNT(*) AS n
      FROM ${SF_OPPORTUNITY}
      WHERE StageName IN (${lostStagesSqlList()})
        AND DATE(LastStageChangeDate) BETWEEN DATE(@start) AND DATE(@end)
      GROUP BY 1
    )
    SELECT
      d.date,
      IFNULL(c.n, 0) AS created,
      IFNULL(w.n, 0) AS won,
      IFNULL(l.n, 0) AS lost
    FROM dates d
    LEFT JOIN created c ON c.date = d.date
    LEFT JOIN won w ON w.date = d.date
    LEFT JOIN lost l ON l.date = d.date
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
