/**
 * POST /api/targets/yearly
 *
 * 年次目標を 12 ヶ月に均等に分けて dashboard.targets_monthly に MERGE する。
 * 既存の月別個別編集は /api/targets PUT がそのまま使える（本 API で書き込んだ後に
 * 月別調整も可能）。
 *
 * Body:
 *   {
 *     year: 2026,
 *     platform: 'google' | 'yahoo' | 'bing' | null,  // 通常 null = 全媒体合計
 *     axis: 'movein' | 'received',                    // Issue #93、デフォルト 'movein'
 *     cvTarget?: number,
 *     roomTarget?: number,
 *     roomDaysTarget?: number,
 *     grossProfitTarget?: number,
 *     revenueTarget?: number,
 *     useDaysTarget?: number,
 *   }
 *
 * 動作:
 *   - 各値を 12 等分（端数は最終月で吸収）して 1月〜12月の MERGE を実行
 *   - 値が undefined / null のフィールドは MERGE で更新しない（既存値を尊重）
 *   - 既に当該月 × platform × axis にレコードがあれば値を上書き、無ければ新規挿入
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bq } from '@/lib/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const TARGETS_TABLE = `\`${PROJECT_ID}.dashboard.targets_monthly\``;
const LOCATION = process.env.BQ_LOCATION ?? 'asia-northeast1';

const VALID_PLATFORMS = new Set(['google', 'yahoo', 'bing']);
const VALID_AXES = new Set(['movein', 'received']);

type DivideResult = { values: (number | null)[]; total: number | null };

/**
 * 年次合計値を 12 等分する。端数は最終月で吸収して合計が一致するようにする。
 * total が null/undefined のときは 12 要素すべて null を返す（更新しない意図）。
 */
function divide12(total: number | null | undefined): DivideResult {
  if (total == null || !Number.isFinite(total)) {
    return { values: Array(12).fill(null), total: null };
  }
  const base = Math.floor(total / 12);
  const remainder = total - base * 12;
  const values = Array(12).fill(base);
  values[11] = base + remainder; // 端数は 12 月で吸収
  return { values, total };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'year must be an integer (2020-2100)' }, { status: 400 });
  }

  const rawPlatform = body.platform;
  const platform =
    rawPlatform == null
      ? null
      : typeof rawPlatform === 'string' && VALID_PLATFORMS.has(rawPlatform)
        ? rawPlatform
        : undefined;
  if (platform === undefined) {
    return NextResponse.json(
      { error: 'platform must be one of google/yahoo/bing or null' },
      { status: 400 },
    );
  }
  const rawAxis = body.axis;
  const axis: 'movein' | 'received' =
    typeof rawAxis === 'string' && VALID_AXES.has(rawAxis) ? (rawAxis as 'movein' | 'received') : 'movein';

  const numOrNull = (k: string): number | null => {
    const v = body[k];
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // 年次合計を 12 等分
  const cv = divide12(numOrNull('cvTarget'));
  const room = divide12(numOrNull('roomTarget'));
  const roomDays = divide12(numOrNull('roomDaysTarget'));
  const grossProfit = divide12(numOrNull('grossProfitTarget'));
  const revenue = divide12(numOrNull('revenueTarget'));
  const useDays = divide12(numOrNull('useDaysTarget'));
  const won = divide12(numOrNull('wonTarget'));

  // 12 ヶ月分を 1 SQL で MERGE（UNNEST で行展開）
  // 各月: { month, cv, room, room_days, gross_profit, revenue, use_days }
  const monthsArray = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0');
    return `STRUCT(
      DATE('${year}-${month}-01') AS month,
      ${cv.values[i] == null ? 'NULL' : `CAST(${cv.values[i]} AS INT64)`} AS cv,
      ${room.values[i] == null ? 'NULL' : `CAST(${room.values[i]} AS INT64)`} AS room,
      ${roomDays.values[i] == null ? 'NULL' : `CAST(${roomDays.values[i]} AS INT64)`} AS room_days,
      ${grossProfit.values[i] == null ? 'NULL' : `CAST(${grossProfit.values[i]} AS NUMERIC)`} AS gross_profit,
      ${revenue.values[i] == null ? 'NULL' : `CAST(${revenue.values[i]} AS NUMERIC)`} AS revenue,
      ${useDays.values[i] == null ? 'NULL' : `CAST(${useDays.values[i]} AS NUMERIC)`} AS use_days,
      ${won.values[i] == null ? 'NULL' : `CAST(${won.values[i]} AS INT64)`} AS won
    )`;
  }).join(',\n');

  const sql = `
    MERGE ${TARGETS_TABLE} T
    USING (
      SELECT
        s.month,
        @platform AS platform,
        @axis AS axis,
        s.cv AS cv_target,
        s.room AS room_target,
        s.room_days AS room_days_target,
        s.gross_profit AS gross_profit_target,
        s.revenue AS revenue_target,
        s.use_days AS use_days_target,
        s.won AS won_target,
        @updatedBy AS updated_by
      FROM UNNEST([${monthsArray}]) AS s
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

  try {
    await bq.query({
      query: sql,
      location: LOCATION,
      params: {
        platform,
        axis,
        updatedBy: email,
      },
      types: {
        platform: 'STRING',
        axis: 'STRING',
        updatedBy: 'STRING',
      },
    });
    return NextResponse.json({
      ok: true,
      year,
      platform,
      axis,
      totals: {
        cvTarget: cv.total,
        roomTarget: room.total,
        roomDaysTarget: roomDays.total,
        grossProfitTarget: grossProfit.total,
        revenueTarget: revenue.total,
        useDaysTarget: useDays.total,
        wonTarget: won.total,
      },
    });
  } catch (err) {
    console.error('年次目標一括書き込みエラー:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
