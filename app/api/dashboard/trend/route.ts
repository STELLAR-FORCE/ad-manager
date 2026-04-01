import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') ?? '7d';
  const platformParam = searchParams.get('platform') ?? 'all';

  const now = new Date();
  let start: Date;
  let end: Date = new Date(now);
  if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'lastmonth') {
    end = new Date(now.getFullYear(), now.getMonth(), 0);
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else {
    const days = period === '30d' ? 30 : period === '14d' ? 14 : 7;
    start = new Date(now);
    start.setDate(start.getDate() - days);
  }

  const platformFilter = platformParam !== 'all' ? { platform: platformParam } : {};

  try {
    const rows = await prisma.dailyMetric.groupBy({
      by: ['date', 'platform'],
      where: {
        date: { gte: start, lte: end },
        ...platformFilter,
      },
      _sum: { cost: true, conversions: true },
      orderBy: { date: 'asc' },
    });

    const byDate = new Map<
      string,
      {
        google: number; yahoo: number; bing: number;
        cost: number; conversions: number;
        google_cv: number; yahoo_cv: number; bing_cv: number;
      }
    >();

    for (const row of rows) {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      const existing = byDate.get(dateStr) ?? {
        google: 0, yahoo: 0, bing: 0,
        cost: 0, conversions: 0,
        google_cv: 0, yahoo_cv: 0, bing_cv: 0,
      };
      const c = row._sum.cost ?? 0;
      const cv = row._sum.conversions ?? 0;
      existing.cost += c;
      existing.conversions += cv;
      if (row.platform === 'google') { existing.google += c; existing.google_cv += cv; }
      if (row.platform === 'yahoo')  { existing.yahoo  += c; existing.yahoo_cv  += cv; }
      if (row.platform === 'bing')   { existing.bing   += c; existing.bing_cv   += cv; }
      byDate.set(dateStr, existing);
    }

    const result = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        google: d.google,
        yahoo: d.yahoo,
        bing: d.bing,
        cost: d.cost,
        conversions: d.conversions,
        cpa: d.conversions > 0 ? Math.round(d.cost / d.conversions) : null,
        google_cv: d.google_cv,
        yahoo_cv: d.yahoo_cv,
        bing_cv: d.bing_cv,
        google_cpa: d.google_cv > 0 ? Math.round(d.google / d.google_cv) : null,
        yahoo_cpa:  d.yahoo_cv  > 0 ? Math.round(d.yahoo  / d.yahoo_cv)  : null,
        bing_cpa:   d.bing_cv   > 0 ? Math.round(d.bing   / d.bing_cv)   : null,
      }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('トレンドデータ取得エラー:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}
