/**
 * POST /api/budget-plan/daily
 * Body: { month: 'YYYY-MM', platform: 'google'|'yahoo'|'bing', adType: 'search'|'display',
 *         days: [{ date: 'YYYY-MM-DD', plannedCost: number }, ...] }
 *
 * 媒体×種別×日次の planned_cost を 1 月分まとめて UPSERT する。
 * 個別編集 UI から呼ばれる (媒体タブ + 種別タブで切り替え、保存ごとに 1 媒体×1 種別)。
 *
 * GET /api/budget-plan/daily?month=YYYY-MM&platform=bing&adType=search
 *   - 既存の planned_cost を返す (UI の初期値用)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bq, query, tableIn } from '@/lib/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const TABLE = `\`${PROJECT_ID}.dashboard.cost_plan_daily_by_platform\``;
const LOCATION = process.env.BQ_LOCATION ?? 'asia-northeast1';

const VALID_PLATFORMS = new Set(['google', 'yahoo', 'bing']);
const VALID_AD_TYPES = new Set(['search', 'display']);

type Row = { date: { value: string } | string; planned_cost: number | string | null };

function isoDate(v: Row['date']): string {
  return typeof v === 'string' ? v.slice(0, 10) : v.value.slice(0, 10);
}

function monthBounds(month: string): { start: string; end: string; daysInMonth: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const endDay = new Date(y, mo, 0).getDate();
  return {
    start: `${y}-${String(mo).padStart(2, '0')}-01`,
    end: `${y}-${String(mo).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    daysInMonth: endDay,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  const platform = searchParams.get('platform');
  const adType = searchParams.get('adType');
  if (!month || !platform || !adType) {
    return NextResponse.json(
      { error: 'month, platform, adType are required' },
      { status: 400 },
    );
  }
  if (!VALID_PLATFORMS.has(platform) || !VALID_AD_TYPES.has(adType)) {
    return NextResponse.json({ error: 'invalid platform or adType' }, { status: 400 });
  }
  const bounds = monthBounds(month);
  if (!bounds) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  try {
    const rows = await query<Row>(
      `SELECT date, planned_cost
       FROM ${tableIn('dashboard', 'cost_plan_daily_by_platform')}
       WHERE date BETWEEN DATE(@start) AND DATE(@end)
         AND platform = @platform AND ad_type = @adType
       ORDER BY date`,
      { start: bounds.start, end: bounds.end, platform, adType },
    );
    const map = new Map<string, number>(
      rows.map((r) => [isoDate(r.date), Number(r.planned_cost ?? 0)]),
    );
    const days: { date: string; plannedCost: number }[] = [];
    for (let d = 1; d <= bounds.daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      days.push({ date: dateStr, plannedCost: map.get(dateStr) ?? 0 });
    }
    return NextResponse.json({ month, platform, adType, days });
  } catch (err) {
    console.error('budget-plan/daily GET error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: {
    month?: string;
    platform?: string;
    adType?: string;
    days?: Array<{ date?: string; plannedCost?: number }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { month, platform, adType, days } = body;
  if (
    !month ||
    !platform ||
    !adType ||
    !VALID_PLATFORMS.has(platform) ||
    !VALID_AD_TYPES.has(adType) ||
    !Array.isArray(days)
  ) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const validDays = days.filter(
    (d): d is { date: string; plannedCost: number } =>
      typeof d.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
      typeof d.plannedCost === 'number' &&
      Number.isFinite(d.plannedCost),
  );
  if (validDays.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const sq = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
  const structs = validDays
    .map(
      (d) => `STRUCT(
    DATE(${sq(d.date)}) AS date,
    ${sq(platform)} AS platform,
    ${sq(adType)} AS ad_type,
    CAST(${d.plannedCost} AS NUMERIC) AS planned_cost,
    ${sq(email)} AS updated_by
  )`,
    )
    .join(',\n');

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

  try {
    await bq.query({ query: sql, location: LOCATION });
    return NextResponse.json({ ok: true, updated: validDays.length });
  } catch (err) {
    console.error('budget-plan/daily POST error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
