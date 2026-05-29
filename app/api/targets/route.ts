/**
 * Issue #63 + Issue #93 — 月別目標値マスタ API
 *
 * GET  /api/targets?from=YYYY-MM&to=YYYY-MM&axis=movein|received
 *   指定範囲の目標値を取得（axis 別、デフォルト movein）。
 *
 * PUT  /api/targets
 *   { month: 'YYYY-MM-01', platform: 'google'|'yahoo'|'bing'|null, axis: 'movein'|'received', ... }
 *   1 行 UPSERT (MERGE)。axis 省略時は 'movein'。
 *
 * スキーマ:
 *   docs/migrations/2026-04-30-targets_monthly.sql (元テーブル)
 *   docs/migrations/2026-05-19-targets_monthly_axis.sql (axis カラム追加)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bq, query } from '@/lib/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const TARGETS_TABLE = `\`${PROJECT_ID}.dashboard.targets_monthly\``;
const LOCATION = process.env.BQ_LOCATION ?? 'asia-northeast1';

type RawTargetRow = {
  month: { value: string } | string;
  platform: string | null;
  axis: string | null;
  cv_target: number | null;
  room_target: number | null;
  room_days_target: number | null;
  gross_profit_target: number | null;
  revenue_target: number | null;
  won_target: number | null;
  inhouse_unit_price: number | null;
};

function dateToIso(v: RawTargetRow['month']): string {
  return typeof v === 'string' ? v : v.value;
}

function parseMonth(s: string | null): string | null {
  if (!s) return null;
  // 'YYYY-MM' or 'YYYY-MM-DD' → 月初の日付に正規化
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

const VALID_PLATFORMS = new Set(['google', 'yahoo', 'bing']);
const VALID_AXES = new Set(['movein', 'received']);

/** axis パラメータをパース。未指定 / 不正値は 'movein' フォールバック */
function parseAxis(raw: string | null | undefined): 'movein' | 'received' {
  return raw === 'received' ? 'received' : 'movein';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = parseMonth(searchParams.get('from'));
  const to = parseMonth(searchParams.get('to'));
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to (YYYY-MM) are required' }, { status: 400 });
  }
  const axis = parseAxis(searchParams.get('axis'));
  try {
    const rows = await query<RawTargetRow>(
      `SELECT month, platform, IFNULL(axis, 'movein') AS axis,
              cv_target, room_target, room_days_target,
              gross_profit_target, revenue_target, won_target,
              inhouse_unit_price
       FROM ${TARGETS_TABLE}
       WHERE month BETWEEN DATE(@from) AND DATE(@to)
         AND IFNULL(axis, 'movein') = @axis
       ORDER BY month, platform`,
      { from, to, axis },
    );
    return NextResponse.json({
      axis,
      rows: rows.map((r) => ({
        month: dateToIso(r.month),
        platform: r.platform,
        axis: r.axis ?? 'movein',
        cvTarget: r.cv_target,
        roomTarget: r.room_target,
        roomDaysTarget: r.room_days_target,
        grossProfitTarget: r.gross_profit_target == null ? null : Number(r.gross_profit_target),
        revenueTarget: r.revenue_target == null ? null : Number(r.revenue_target),
        wonTarget: r.won_target,
        inhouseUnitPrice: r.inhouse_unit_price == null ? null : Number(r.inhouse_unit_price),
      })),
    });
  } catch (err) {
    // Phase 1: テーブル未作成時は空配列を返してフロントの初期表示を壊さない
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Not found') || message.includes('does not exist')) {
      return NextResponse.json({ rows: [], axis, warning: 'targets_monthly が未作成です' });
    }
    console.error('目標値取得エラー:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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

  const month = parseMonth(typeof body.month === 'string' ? body.month : null);
  if (!month) {
    return NextResponse.json({ error: 'month (YYYY-MM) is required' }, { status: 400 });
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

  const num = (k: string): number | null => {
    const v = body[k];
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const params = {
    month,
    platform,
    axis,
    cvTarget: num('cvTarget'),
    roomTarget: num('roomTarget'),
    roomDaysTarget: num('roomDaysTarget'),
    grossProfitTarget: num('grossProfitTarget'),
    revenueTarget: num('revenueTarget'),
    wonTarget: num('wonTarget'),
    inhouseUnitPrice: num('inhouseUnitPrice'),
    updatedBy: email,
  };

  const sql = `
    MERGE ${TARGETS_TABLE} T
    USING (
      SELECT
        DATE(@month) AS month,
        @platform AS platform,
        @axis AS axis,
        @cvTarget AS cv_target,
        @roomTarget AS room_target,
        @roomDaysTarget AS room_days_target,
        CAST(@grossProfitTarget AS NUMERIC) AS gross_profit_target,
        CAST(@revenueTarget AS NUMERIC) AS revenue_target,
        @wonTarget AS won_target,
        CAST(@inhouseUnitPrice AS NUMERIC) AS inhouse_unit_price,
        @updatedBy AS updated_by
    ) S
    ON T.month = S.month
      AND IFNULL(T.platform, '') = IFNULL(S.platform, '')
      AND IFNULL(T.axis, 'movein') = S.axis
    WHEN MATCHED THEN
      UPDATE SET
        cv_target = S.cv_target,
        room_target = S.room_target,
        room_days_target = S.room_days_target,
        gross_profit_target = S.gross_profit_target,
        revenue_target = S.revenue_target,
        won_target = S.won_target,
        inhouse_unit_price = S.inhouse_unit_price,
        axis = S.axis,
        updated_at = CURRENT_TIMESTAMP(),
        updated_by = S.updated_by
    WHEN NOT MATCHED THEN
      INSERT (month, platform, axis, cv_target, room_target, room_days_target,
              gross_profit_target, revenue_target, won_target,
              inhouse_unit_price, updated_at, updated_by)
      VALUES (S.month, S.platform, S.axis, S.cv_target, S.room_target, S.room_days_target,
              S.gross_profit_target, S.revenue_target, S.won_target,
              S.inhouse_unit_price, CURRENT_TIMESTAMP(), S.updated_by)
  `;

  try {
    await bq.query({
      query: sql,
      location: LOCATION,
      params,
      types: {
        month: 'STRING',
        platform: 'STRING',
        axis: 'STRING',
        cvTarget: 'INT64',
        roomTarget: 'INT64',
        roomDaysTarget: 'INT64',
        grossProfitTarget: 'NUMERIC',
        revenueTarget: 'NUMERIC',
        wonTarget: 'INT64',
        inhouseUnitPrice: 'NUMERIC',
        updatedBy: 'STRING',
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('目標値更新エラー:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
