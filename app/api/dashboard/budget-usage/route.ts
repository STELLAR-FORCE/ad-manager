import { NextResponse } from 'next/server';
import { query, table } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';

type BudgetRow = { platform: string; monthly_budget: number | null };
type SpendRow = { platform: string; cost: number | null };

export async function GET() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  try {
    const [budgetResult, spendResult] = await Promise.all([
      cached('budget-usage:budgets', () =>
        query<BudgetRow>(
          `SELECT platform, SUM(monthly_budget) AS monthly_budget
           FROM ${table('adm_campaigns')}
           WHERE monthly_budget IS NOT NULL AND status != 'ended'
           GROUP BY platform`,
        ),
      ),
      cached(`budget-usage:spend:${monthStart}`, () =>
        query<SpendRow>(
          `SELECT platform, SUM(cost) AS cost
           FROM ${table('adm_daily_metrics')}
           WHERE date >= DATE(@monthStart)
           GROUP BY platform`,
          { monthStart },
        ),
      ),
    ]);
    const budgetRows = budgetResult.value;
    const spendRows = spendResult.value;
    const fetchedAt = Math.min(budgetResult.fetchedAt, spendResult.fetchedAt);
    const cacheHeaders = {
      'X-Cache-Fetched-At': new Date(fetchedAt).toISOString(),
      'X-Cache-Hit': String(budgetResult.hit && spendResult.hit),
    };

    const spendMap = new Map<string, number>(
      spendRows.map((s) => [s.platform, Number(s.cost ?? 0)]),
    );
    const budgetMap = new Map<string, number>(
      budgetRows.map((b) => [b.platform, Number(b.monthly_budget ?? 0)]),
    );

    const byPlatform = Array.from(budgetMap.entries()).map(([platform, budget]) => {
      const spent = spendMap.get(platform) ?? 0;
      return { platform, budget, spent, utilization: budget > 0 ? spent / budget : 0 };
    });

    if (byPlatform.length === 0) {
      const spendOnly = Array.from(spendMap.entries()).map(([platform, spent]) => ({
        platform,
        budget: 0,
        spent,
        utilization: 0,
      }));
      return NextResponse.json(
        {
          totalBudget: 0,
          totalSpent: spendOnly.reduce((s, p) => s + p.spent, 0),
          byPlatform: spendOnly,
        },
        { headers: cacheHeaders },
      );
    }

    const totalBudget = byPlatform.reduce((s, p) => s + p.budget, 0);
    const totalSpent = byPlatform.reduce((s, p) => s + p.spent, 0);

    return NextResponse.json(
      {
        totalBudget,
        totalSpent,
        utilization: totalBudget > 0 ? totalSpent / totalBudget : 0,
        byPlatform,
      },
      { headers: cacheHeaders },
    );
  } catch (error) {
    console.error('予算消化率取得エラー:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}
