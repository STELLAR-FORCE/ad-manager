import { NextRequest } from 'next/server';
import { query, table } from '@/lib/bigquery';

type SearchTermRow = {
  date: { value: string } | string;
  platform: string;
  campaign_id: string;
  campaign_name: string;
  search_term: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cpa: number;
  is_excluded: boolean;
};

function normalizeDate(v: SearchTermRow['date']): string {
  return typeof v === 'string' ? v.slice(0, 10) : v.value.slice(0, 10);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const platform = searchParams.get('platform') ?? '';
  const excluded = searchParams.get('excluded') ?? '';
  const sort = searchParams.get('sort') ?? 'cost';
  const order = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc';

  const allowedSorts = ['impressions', 'clicks', 'cost', 'conversions', 'ctr', 'cpa'];
  const sortField = allowedSorts.includes(sort) ? sort : 'cost';
  const orderDir = order === 'asc' ? 'ASC' : 'DESC';

  try {
    const platformFilter = platform ? 'AND platform = @platform' : '';
    const excludedFilter =
      excluded === 'true' ? 'AND is_excluded = TRUE'
      : excluded === 'false' ? 'AND is_excluded = FALSE'
      : '';

    const rows = await query<SearchTermRow>(
      `SELECT date, platform, campaign_id, campaign_name, search_term,
              impressions, clicks, cost, conversions, ctr, cpa, is_excluded
       FROM ${table('adm_search_term_reports')}
       WHERE 1 = 1
         ${platformFilter}
         ${excludedFilter}
       ORDER BY ${sortField} ${orderDir}
       LIMIT 500`,
      {
        ...(platform ? { platform } : {}),
      },
    );

    const terms = rows.map((r) => ({
      id: `${r.platform}:${r.campaign_id}:${r.search_term}:${normalizeDate(r.date)}`,
      searchTerm: r.search_term,
      platform: r.platform,
      campaignName: r.campaign_name,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      cost: Number(r.cost ?? 0),
      conversions: Number(r.conversions ?? 0),
      ctr: Number(r.ctr ?? 0),
      cpa: Number(r.cpa ?? 0),
      isExcluded: Boolean(r.is_excluded),
    }));

    return Response.json(terms);
  } catch (error) {
    console.error('search-terms GET error:', error);
    return Response.json([]);
  }
}
