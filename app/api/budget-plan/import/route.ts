/**
 * POST /api/budget-plan/import
 * Body: CSV テキスト (Content-Type: text/csv)
 *
 * 予算 CSV を受け取り、distributeMonthlyBudget で日次×媒体×種別に展開、
 * dashboard.cost_plan_daily_by_platform に MERGE する。
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bq } from '@/lib/bigquery';
import { parseBudgetCsv } from '@/lib/budget-csv';
import { distributeMonthlyBudget, type DailyPlanRow } from '@/lib/budget-plan-distribute';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const TABLE = `\`${PROJECT_ID}.dashboard.cost_plan_daily_by_platform\``;
const LOCATION = process.env.BQ_LOCATION ?? 'asia-northeast1';

function sq(s: string): string {
  return `'${s.replace(/'/g, "\\'")}'`;
}

function structLiteral(r: DailyPlanRow, updatedBy: string): string {
  return `STRUCT(
    DATE(${sq(r.date)}) AS date,
    ${sq(r.platform)} AS platform,
    ${sq(r.adType)} AS ad_type,
    CAST(${r.plannedCost} AS NUMERIC) AS planned_cost,
    ${sq(updatedBy)} AS updated_by
  )`;
}

async function mergeBatch(rows: DailyPlanRow[], updatedBy: string): Promise<void> {
  if (rows.length === 0) return;
  // BQ の MERGE は USING で UNNEST([STRUCT...]) を渡せる
  const structs = rows.map((r) => structLiteral(r, updatedBy)).join(',\n');
  const sql = `
    MERGE ${TABLE} T
    USING (SELECT * FROM UNNEST([${structs}])) S
    ON T.date = S.date AND T.platform = S.platform AND T.ad_type = S.ad_type
    WHEN MATCHED THEN
      UPDATE SET
        planned_cost = S.planned_cost,
        updated_at = CURRENT_TIMESTAMP(),
        updated_by = S.updated_by
    WHEN NOT MATCHED THEN
      INSERT (date, platform, ad_type, planned_cost, updated_at, updated_by)
      VALUES (S.date, S.platform, S.ad_type, S.planned_cost, CURRENT_TIMESTAMP(), S.updated_by)
  `;
  await bq.query({ query: sql, location: LOCATION });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: 'failed to read body' }, { status: 400 });
  }

  const parsed = parseBudgetCsv(text);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });
  }

  // 月ごとに展開して MERGE (1 月 = 約 90〜150 行 → 大きすぎない)
  let totalRows = 0;
  const summaries: Array<{ month: string; rows: number }> = [];
  try {
    for (const csvRow of parsed.rows) {
      const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(csvRow.month);
      if (!m) continue;
      const year = Number(m[1]);
      const month = Number(m[2]);
      const { rows } = distributeMonthlyBudget({
        year,
        month,
        searchMonthly: csvRow.searchMonthly,
        displayMonthly: csvRow.displayMonthly,
        applyWeekWeight: csvRow.applyWeekWeight,
      });
      await mergeBatch(rows, email);
      totalRows += rows.length;
      summaries.push({ month: `${year}-${String(month).padStart(2, '0')}`, rows: rows.length });
    }
    return NextResponse.json({ ok: true, imported: parsed.rows.length, totalRows, summaries });
  } catch (err) {
    console.error('budget-plan/import error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
