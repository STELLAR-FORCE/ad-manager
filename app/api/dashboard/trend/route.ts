import { NextResponse } from 'next/server';
import { query, table } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';

type TrendRow = {
  date: { value: string } | string;
  platform: string;
  cost: number | null;
  conversions: number | null;
};

function normalizeDate(v: TrendRow['date']): string {
  if (typeof v === 'string') return v.slice(0, 10);
  return v.value.slice(0, 10);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platformParam = searchParams.get('platform') ?? 'all';
  const adTypeParam = searchParams.get('adType') ?? 'all';

  const startStr = searchParams.get('start');
  const endStr = searchParams.get('end');
  if (!startStr || !endStr) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  const adTypeJoin =
    adTypeParam !== 'all'
      ? `JOIN ${table('adm_campaigns')} c ON c.id = m.campaign_id AND c.platform = m.platform`
      : '';
  const adTypeFilter = adTypeParam !== 'all' ? 'AND c.ad_type = @adType' : '';
  const platformFilter = platformParam !== 'all' ? 'AND m.platform = @platform' : '';

  try {
    const sql = `
      SELECT
        m.date AS date,
        m.platform AS platform,
        SUM(m.cost) AS cost,
        SUM(m.conversions) AS conversions
      FROM ${table('adm_daily_metrics')} m
      ${adTypeJoin}
      WHERE m.date BETWEEN DATE(@start) AND DATE(@end)
        ${platformFilter}
        ${adTypeFilter}
      GROUP BY date, platform
      ORDER BY date ASC
    `;

    const cacheKey = `trend:${platformParam}:${adTypeParam}:${startStr}:${endStr}`;
    const cacheResult = await cached(cacheKey, () =>
      query<TrendRow>(sql, {
        start: startStr,
        end: endStr,
        ...(platformParam !== 'all' ? { platform: platformParam } : {}),
        ...(adTypeParam !== 'all' ? { adType: adTypeParam } : {}),
      }),
    );
    const rows = cacheResult.value;

    const byDate = new Map<
      string,
      {
        google: number; yahoo: number; bing: number;
        cost: number; conversions: number;
        google_cv: number; yahoo_cv: number; bing_cv: number;
      }
    >();

    for (const row of rows) {
      const dateStr = normalizeDate(row.date);
      const existing = byDate.get(dateStr) ?? {
        google: 0, yahoo: 0, bing: 0,
        cost: 0, conversions: 0,
        google_cv: 0, yahoo_cv: 0, bing_cv: 0,
      };
      const c = Number(row.cost ?? 0);
      const cv = Number(row.conversions ?? 0);
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

    return NextResponse.json(result, {
      headers: {
        'X-Cache-Fetched-At': new Date(cacheResult.fetchedAt).toISOString(),
        'X-Cache-Hit': String(cacheResult.hit),
      },
    });
  } catch (error) {
    console.error('トレンドデータ取得エラー:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}
