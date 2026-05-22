/**
 * POST /api/targets/import
 *   Content-Type: text/csv (本文に CSV テキスト)
 *
 * CSV を受け取って dashboard.targets_monthly に MERGE。
 *
 * フォーマットは lib/targets-csv.ts の CSV_HEADER を参照。
 * 各行は (月 × 媒体 × 軸) でユニーク。値が空欄の指標は **既存値を維持** する。
 *
 * レスポンス:
 *   { ok: true, imported: N }
 *   { ok: false, errors: [{ line, message }] }
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bq } from '@/lib/bigquery';
import { parseTargetCsv, type TargetCsvRow } from '@/lib/targets-csv';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const TARGETS_TABLE = `\`${PROJECT_ID}.dashboard.targets_monthly\``;
const LOCATION = process.env.BQ_LOCATION ?? 'asia-northeast1';

const BATCH_SIZE = 50;

function structLiteral(r: TargetCsvRow, updatedBy: string): string {
  // SQL リテラルとして展開。シングルクオートエスケープ
  const sq = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
  const orNull = (n: number | null, cast: 'INT64' | 'NUMERIC') =>
    n == null ? 'NULL' : `CAST(${n} AS ${cast})`;
  return `STRUCT(
    DATE(${sq(r.month)}) AS month,
    ${r.platform == null ? 'CAST(NULL AS STRING)' : sq(r.platform)} AS platform,
    ${sq(r.axis)} AS axis,
    ${orNull(r.cvTarget, 'INT64')} AS cv_target,
    ${orNull(r.roomTarget, 'INT64')} AS room_target,
    ${orNull(r.roomDaysTarget, 'INT64')} AS room_days_target,
    ${orNull(r.grossProfitTarget, 'NUMERIC')} AS gross_profit_target,
    ${orNull(r.revenueTarget, 'NUMERIC')} AS revenue_target,
    ${orNull(r.useDaysTarget, 'NUMERIC')} AS use_days_target,
    ${orNull(r.wonTarget, 'INT64')} AS won_target,
    ${sq(updatedBy)} AS updated_by
  )`;
}

async function mergeBatch(rows: TargetCsvRow[], updatedBy: string): Promise<void> {
  if (rows.length === 0) return;
  const structs = rows.map((r) => structLiteral(r, updatedBy)).join(',\n');
  const sql = `
    MERGE ${TARGETS_TABLE} T
    USING (
      SELECT * FROM UNNEST([${structs}])
    ) S
    ON T.month = S.month
      AND IFNULL(T.platform, '') = IFNULL(S.platform, '')
      AND IFNULL(T.axis, 'movein') = S.axis
    WHEN MATCHED THEN
      UPDATE SET
        cv_target           = IFNULL(S.cv_target,           T.cv_target),
        room_target         = IFNULL(S.room_target,         T.room_target),
        room_days_target    = IFNULL(S.room_days_target,    T.room_days_target),
        gross_profit_target = IFNULL(S.gross_profit_target, T.gross_profit_target),
        revenue_target      = IFNULL(S.revenue_target,      T.revenue_target),
        use_days_target     = IFNULL(S.use_days_target,     T.use_days_target),
        won_target          = IFNULL(S.won_target,          T.won_target),
        axis                = S.axis,
        updated_at          = CURRENT_TIMESTAMP(),
        updated_by          = S.updated_by
    WHEN NOT MATCHED THEN
      INSERT (month, platform, axis, cv_target, room_target, room_days_target,
              gross_profit_target, revenue_target, use_days_target, won_target,
              updated_at, updated_by)
      VALUES (S.month, S.platform, S.axis, S.cv_target, S.room_target, S.room_days_target,
              S.gross_profit_target, S.revenue_target, S.use_days_target, S.won_target,
              CURRENT_TIMESTAMP(), S.updated_by)
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
  if (!text || text.trim() === '') {
    return NextResponse.json({ error: 'empty body' }, { status: 400 });
  }

  const parsed = parseTargetCsv(text);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0 });
  }

  try {
    // BQ DML はトランザクション無しで連続実行
    for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
      const batch = parsed.rows.slice(i, i + BATCH_SIZE);
      await mergeBatch(batch, email);
    }
    return NextResponse.json({ ok: true, imported: parsed.rows.length });
  } catch (err) {
    console.error('targets/import error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, errors: [{ line: 0, message }] }, { status: 500 });
  }
}
