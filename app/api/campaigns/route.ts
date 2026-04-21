import { query, table } from '@/lib/bigquery';

type CampaignRow = {
  id: string;
  name: string;
  platform: string;
  ad_type: string;
  type: string;
  status: string;
  daily_budget: number | null;
  monthly_budget: number | null;
  bid_strategy: string | null;
  optimization_score: number | null;
  synced_at: { value: string } | string;
};

function toIso(v: CampaignRow['synced_at']): string {
  return typeof v === 'string' ? v : v.value;
}

export async function GET() {
  try {
    const rows = await query<CampaignRow>(
      `SELECT id, name, platform, ad_type, type, status,
              daily_budget, monthly_budget, bid_strategy, optimization_score, synced_at
       FROM ${table('adm_campaigns')}
       ORDER BY synced_at DESC`,
    );
    const campaigns = rows.map((r) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      adType: r.ad_type,
      type: r.type,
      status: r.status,
      dailyBudget: r.daily_budget,
      monthlyBudget: r.monthly_budget,
      bidStrategy: r.bid_strategy,
      optimizationScore: r.optimization_score,
      syncedAt: toIso(r.synced_at),
    }));
    return Response.json(campaigns);
  } catch (error) {
    console.error('キャンペーン一覧取得エラー:', error);
    return Response.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST() {
  return Response.json(
    { error: 'BigQuery は読み取り専用です。キャンペーン作成は広告プラットフォーム側で行ってください。' },
    { status: 501 },
  );
}
