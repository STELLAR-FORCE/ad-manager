/**
 * GET /api/targets/csv?mode=template|current&year=YYYY
 *
 * 目標値の CSV ダウンロード。
 *   - mode=template: 指定年の 12 ヶ月 × (入居日/発生日) を空欄で出力
 *   - mode=current:  指定年に登録済みの目標値を出力 (未登録月は出さない)
 *
 * 日本語ヘッダ + UTF-8 BOM で Excel 互換。
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import {
  rowsToCsv,
  buildTemplateRows,
  type TargetCsvRow,
  type CsvAxis,
} from '@/lib/targets-csv';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const TARGETS_TABLE = `\`${PROJECT_ID}.dashboard.targets_monthly\``;

type RawRow = {
  month: { value: string } | string;
  platform: string | null;
  axis: string | null;
  cv_target: number | null;
  room_target: number | null;
  room_days_target: number | null;
  gross_profit_target: number | null;
  revenue_target: number | null;
  won_target: number | null;
};

function toMonth(v: RawRow['month']): string {
  return typeof v === 'string' ? v : v.value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') === 'current' ? 'current' : 'template';
  const yearParam = searchParams.get('year');
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'invalid year' }, { status: 400 });
  }

  let rows: TargetCsvRow[];
  if (mode === 'template') {
    rows = buildTemplateRows(year);
  } else {
    try {
      const raw = await query<RawRow>(
        `SELECT month, platform, IFNULL(axis, 'movein') AS axis,
                cv_target, room_target, room_days_target,
                gross_profit_target, revenue_target, won_target
         FROM ${TARGETS_TABLE}
         WHERE EXTRACT(YEAR FROM month) = @year
         ORDER BY month, IFNULL(platform, ''), axis`,
        { year },
      );
      rows = raw.map((r) => ({
        month: toMonth(r.month),
        platform: r.platform,
        axis: (r.axis === 'received' ? 'received' : 'movein') as CsvAxis,
        cvTarget: r.cv_target,
        roomTarget: r.room_target,
        roomDaysTarget: r.room_days_target,
        grossProfitTarget: r.gross_profit_target == null ? null : Number(r.gross_profit_target),
        revenueTarget: r.revenue_target == null ? null : Number(r.revenue_target),
        wonTarget: r.won_target,
      }));
    } catch (err) {
      console.error('targets/csv error:', err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const csv = rowsToCsv(rows);
  const filename = `targets_${mode}_${year}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
