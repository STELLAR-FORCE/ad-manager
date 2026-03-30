import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type PeriodKey = '7d' | '14d' | '30d' | 'month' | 'lastmonth';

function getPeriodDates(period: PeriodKey) {
  const now = new Date();
  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevEnd: Date;

  if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now);
    const daysElapsed = now.getDate();
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - daysElapsed + 1);
  } else if (period === 'lastmonth') {
    end = new Date(now.getFullYear(), now.getMonth(), 0);
    start = new Date(end.getFullYear(), end.getMonth(), 1);
    prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
  } else {
    const days = period === '30d' ? 30 : period === '14d' ? 14 : 7;
    end = new Date(now);
    start = new Date(now);
    start.setDate(start.getDate() - days);
    prevEnd = new Date(start);
    prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - days);
  }

  return { start, end, prevStart, prevEnd };
}

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') ?? '7d') as PeriodKey;
  const platformParam = searchParams.get('platform') ?? 'all';

  const { start, end, prevStart, prevEnd } = getPeriodDates(period);

  const platformFilter = platformParam !== 'all' ? { platform: platformParam } : {};
  const baseWhere = {
    campaignId: { not: null },
    adGroupId: null,
    creativeId: null,
    ...platformFilter,
  };

  try {
    const [currentRows, prevRows] = await Promise.all([
      prisma.dailyMetric.groupBy({
        by: ['platform'],
        where: { ...baseWhere, date: { gte: start, lte: end } },
        _sum: { impressions: true, clicks: true, cost: true, conversions: true },
      }),
      prisma.dailyMetric.groupBy({
        by: ['platform'],
        where: { ...baseWhere, date: { gte: prevStart, lte: prevEnd } },
        _sum: { impressions: true, clicks: true, cost: true, conversions: true },
      }),
    ]);

    const current = aggregateMetrics(currentRows);
    const previous = aggregateMetrics(prevRows);
    const byPlatform = currentRows.map((m) => ({
      platform: m.platform,
      ...aggregateMetrics([m]),
    }));

    return NextResponse.json({ period, platform: platformParam, current, previous, byPlatform });
  } catch (error) {
    console.error('ダッシュボードサマリー取得エラー:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}
