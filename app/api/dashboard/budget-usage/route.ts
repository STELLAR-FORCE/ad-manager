import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const [campaigns, spendRows] = await Promise.all([
      prisma.campaign.findMany({
        where: { monthlyBudget: { not: null }, status: { not: 'ended' } },
        select: { platform: true, monthlyBudget: true },
      }),
      prisma.dailyMetric.groupBy({
        by: ['platform'],
        where: { date: { gte: monthStart } },
        _sum: { cost: true },
      }),
    ]);

    const spendMap = new Map(spendRows.map((s) => [s.platform, s._sum.cost ?? 0]));

    const budgetMap = campaigns.reduce((acc, c) => {
      acc.set(c.platform, (acc.get(c.platform) ?? 0) + (c.monthlyBudget ?? 0));
      return acc;
    }, new Map<string, number>());

    const byPlatform = Array.from(budgetMap.entries()).map(([platform, budget]) => {
      const spent = spendMap.get(platform) ?? 0;
      return { platform, budget, spent, utilization: budget > 0 ? spent / budget : 0 };
    });

    // 予算未設定の場合は費用だけ返す
    if (byPlatform.length === 0) {
      const spendOnly = Array.from(spendMap.entries()).map(([platform, spent]) => ({
        platform,
        budget: 0,
        spent,
        utilization: 0,
      }));
      return NextResponse.json({ totalBudget: 0, totalSpent: spendOnly.reduce((s, p) => s + p.spent, 0), byPlatform: spendOnly });
    }

    const totalBudget = byPlatform.reduce((s, p) => s + p.budget, 0);
    const totalSpent = byPlatform.reduce((s, p) => s + p.spent, 0);

    return NextResponse.json({
      totalBudget,
      totalSpent,
      utilization: totalBudget > 0 ? totalSpent / totalBudget : 0,
      byPlatform,
    });
  } catch (error) {
    console.error('予算消化率取得エラー:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}
