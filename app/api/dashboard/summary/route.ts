import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type GroupByRow = {
  _sum: {
    impressions: number | null;
    clicks: number | null;
    cost: number | null;
    conversions: number | null;
  };
};

function aggregateMetrics(rows: GroupByRow[]) {
  const totals = rows.reduce(
    (acc, m) => ({
      impressions: acc.impressions + (m._sum.impressions ?? 0),
      clicks: acc.clicks + (m._sum.clicks ?? 0),
      cost: acc.cost + (m._sum.cost ?? 0),
      conversions: acc.conversions + (m._sum.conversions ?? 0),
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
  );
  return {
    ...totals,
    ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
    cpc: totals.clicks > 0 ? totals.cost / totals.clicks : 0,
    cpa: totals.conversions > 0 ? totals.cost / totals.conversions : 0,
    cvr: totals.clicks > 0 ? totals.conversions / totals.clicks : 0,
  };
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** end を当日 23:59:59 UTC に揃える */
function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platformParam = searchParams.get('platform') ?? 'all';
  const adTypeParam = searchParams.get('adType') ?? 'all';

  const start = parseDate(searchParams.get('start'));
  const end   = parseDate(searchParams.get('end'));
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  // 比較期間: 明示指定 or 自動（同じ日数分だけ前）
  let prevStart: Date;
  let prevEnd: Date;
  const cs = parseDate(searchParams.get('compareStart'));
  const ce = parseDate(searchParams.get('compareEnd'));
  if (cs && ce) {
    prevStart = cs;
    prevEnd = endOfDay(ce);
  } else {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd.getTime() - days * 86_400_000);
  }

  const platformFilter = platformParam !== 'all' ? { platform: platformParam } : {};
  const adTypeFilter = adTypeParam !== 'all' ? { campaign: { adType: adTypeParam } } : {};

  try {
    const whereBase = { ...platformFilter, ...adTypeFilter };

    const [currentRows, prevRows] = await Promise.all([
      prisma.dailyMetric.groupBy({
        by: ['platform'],
        where: { ...whereBase, date: { gte: start, lte: endOfDay(end) } },
        _sum: { impressions: true, clicks: true, cost: true, conversions: true },
      }),
      prisma.dailyMetric.groupBy({
        by: ['platform'],
        where: { ...whereBase, date: { gte: prevStart, lte: prevEnd } },
        _sum: { impressions: true, clicks: true, cost: true, conversions: true },
      }),
    ]);

    const current = aggregateMetrics(currentRows);
    const previous = aggregateMetrics(prevRows);
    const byPlatform = currentRows.map((m) => ({
      platform: m.platform,
      ...aggregateMetrics([m]),
    }));

    return NextResponse.json({ platform: platformParam, current, previous, byPlatform });
  } catch (error) {
    console.error('ダッシュボードサマリー取得エラー:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}
