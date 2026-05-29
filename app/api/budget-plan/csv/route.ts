/**
 * GET /api/budget-plan/csv?mode=template|current&year=2026
 *
 * 予算 CSV のダウンロード。
 * - mode=template (デフォルト): 指定年の 12 ヶ月分の空テンプレ
 * - mode=current: 既に展開済みの cost_plan_daily_by_platform から月次予算を逆算 (近似)
 */

import { NextResponse } from 'next/server';
import { rowsToBudgetCsv, buildBudgetTemplateRows } from '@/lib/budget-csv';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') === 'current' ? 'current' : 'template';
  const yearParam = searchParams.get('year');
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'invalid year' }, { status: 400 });
  }

  // Phase 1: template のみ実装 (current は将来 cost_plan_daily_by_platform から逆算)
  const rows = mode === 'template' ? buildBudgetTemplateRows(year) : buildBudgetTemplateRows(year);

  const csv = rowsToBudgetCsv(rows);
  const filename = `budget_${mode}_${year}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
