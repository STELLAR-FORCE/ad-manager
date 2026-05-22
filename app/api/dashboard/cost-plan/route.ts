/**
 * 消化予定 日次入力 API
 *
 * GET /api/dashboard/cost-plan?month=YYYY-MM
 *   指定月 1 日〜月末日の日次予定金額を返す (未登録日は 0)
 *
 * PUT /api/dashboard/cost-plan
 *   Body: { month: 'YYYY-MM', days: [{ date: 'YYYY-MM-DD', plannedCost: 12000 }, ...] }
 *   指定月の日次予定を一括 MERGE (1 日 1 レコード)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bq, query } from '@/lib/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const TABLE = `\`${PROJECT_ID}.dashboard.cost_plan_daily\``;
const LOCATION = process.env.BQ_LOCATION ?? 'asia-northeast1';

type Row = { date: { value: string } | string; planned_cost: number | string | null };

export type CostPlanPoint = {
  date: string;
  plannedCost: number;
};

export type CostPlanResponse = {
  month: string;
  days: CostPlanPoint[];
};

function isoDate(v: Row['date']): string {
  return typeof v === 'string' ? v.slice(0, 10) : v.value.slice(0, 10);
}

function monthBounds(month: string): { start: string; end: string; daysInMonth: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const endDate = new Date(y, mo, 0).getDate();
  return {
    start: `${y}-${String(mo).padStart(2, '0')}-01`,
    end: `${y}-${String(mo).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`,
    daysInMonth: endDate,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.get('month') ?? defaultMonth;
  const bounds = monthBounds(month);
  if (!bounds) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const { start, end, daysInMonth } = bounds;

  try {
    const rows = await query<Row>(
      `SELECT date, planned_cost
       FROM ${TABLE}
       WHERE date BETWEEN DATE(@start) AND DATE(@end)
       ORDER BY date`,
      { start, end },
    );
    const map = new Map(rows.map((r) => [isoDate(r.date), Number(r.planned_cost ?? 0)]));

    const days: CostPlanPoint[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${month}-${String(d).padStart(2, '0')}`;
      days.push({ date: dateKey, plannedCost: map.get(dateKey) ?? 0 });
    }
    const response: CostPlanResponse = { month, days };
    return NextResponse.json(response);
  } catch (err) {
    console.error('cost-plan GET error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { month?: string; days?: { date: string; plannedCost: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const month = typeof body.month === 'string' ? body.month : '';
  if (!monthBounds(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const days = Array.isArray(body.days) ? body.days : [];
  if (days.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  // 各日付の入力値検証 + 同月のみ受け付ける
  const valid: { date: string; plannedCost: number }[] = [];
  for (const d of days) {
    if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    if (!d.date.startsWith(month + '-')) continue;
    const n = Number(d.plannedCost);
    if (!Number.isFinite(n) || n < 0) continue;
    valid.push({ date: d.date, plannedCost: Math.round(n) });
  }
  if (valid.length === 0) {
    return NextResponse.json({ error: 'no valid rows' }, { status: 400 });
  }

  // MERGE で UPSERT
  const structs = valid
    .map(
      (v) =>
        `STRUCT(DATE('${v.date}') AS date, CAST(${v.plannedCost} AS NUMERIC) AS planned_cost)`,
    )
    .join(',\n');
  const sql = `
    MERGE ${TABLE} T
    USING (SELECT * FROM UNNEST([${structs}])) S
    ON T.date = S.date
    WHEN MATCHED THEN
      UPDATE SET planned_cost = S.planned_cost, updated_at = CURRENT_TIMESTAMP(), updated_by = @updatedBy
    WHEN NOT MATCHED THEN
      INSERT (date, planned_cost, updated_at, updated_by)
      VALUES (S.date, S.planned_cost, CURRENT_TIMESTAMP(), @updatedBy)
  `;

  try {
    await bq.query({
      query: sql,
      location: LOCATION,
      params: { updatedBy: email },
      types: { updatedBy: 'STRING' },
    });
    return NextResponse.json({ ok: true, updated: valid.length });
  } catch (err) {
    console.error('cost-plan PUT error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
