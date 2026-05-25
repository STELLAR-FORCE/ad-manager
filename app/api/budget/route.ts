import { NextRequest } from 'next/server';
import { query, table, tableIn } from '@/lib/bigquery';

type CampaignRow = {
  id: string;
  name: string;
  platform: string;
  ad_type: string;
  status: string;
  monthly_budget: number | null;
};

type SpendRow = { campaign_id: string; platform: string; cost: number | null };
type PlannedRow = { total: number | string | null };

function firstDayOfMonth(month: string): string {
  return `${month}-01`;
}

function firstDayOfNextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  return next.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7);

  try {
    const start = firstDayOfMonth(month);
    const end = firstDayOfNextMonth(month);

    // cost_plan_daily の月合計を当月総予算とする (cv-daily の消化予定編集で入力)
    const [campaigns, metrics, plannedRows] = await Promise.all([
      query<CampaignRow>(
        `SELECT id, name, platform, ad_type, status, monthly_budget
         FROM ${table('adm_campaigns')}
         ORDER BY synced_at ASC`,
      ),
      query<SpendRow>(
        `SELECT campaign_id, platform, SUM(cost) AS cost
         FROM ${table('adm_daily_metrics')}
         WHERE date >= DATE(@start) AND date < DATE(@end)
         GROUP BY campaign_id, platform`,
        { start, end },
      ),
      query<PlannedRow>(
        `SELECT IFNULL(SUM(planned_cost), 0) AS total
         FROM ${tableIn('dashboard', 'cost_plan_daily')}
         WHERE date >= DATE(@start) AND date < DATE(@end)`,
        { start, end },
      ).catch(() => [] as PlannedRow[]),
    ]);

    const spentByCampaign = new Map<string, number>(
      metrics.map((m) => [`${m.platform}:${m.campaign_id}`, Number(m.cost ?? 0)]),
    );
    const totalPlanned = Number(plannedRows[0]?.total ?? 0);

    const result = campaigns.map((c) => {
      const spent = spentByCampaign.get(`${c.platform}:${c.id}`) ?? 0;
      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        adType: c.ad_type,
        status: c.status,
        // monthly_budget はキャンペーンマスタ側の参考値 (UI 表示はしないが互換のため残す)
        monthlyBudget: Number(c.monthly_budget ?? 0),
        spent,
      };
    });

    return Response.json({ month, campaigns: result, totalPlannedBudget: totalPlanned });
  } catch (error) {
    console.error('budget GET error:', error);
    return Response.json({ month, campaigns: [], totalPlannedBudget: 0 });
  }
}
