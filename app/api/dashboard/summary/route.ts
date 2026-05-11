import { NextResponse } from 'next/server';
import { query, table } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';

type PlatformAggregateRow = {
  platform: string;
  ad_type: string | null;
  impressions: number | null;
  clicks: number | null;
  cost: number | null;
  conversions: number | null;
};

function aggregateMetrics(rows: PlatformAggregateRow[]) {
  const totals = rows.reduce(
    (acc, m) => ({
      impressions: acc.impressions + Number(m.impressions ?? 0),
      clicks: acc.clicks + Number(m.clicks ?? 0),
      cost: acc.cost + Number(m.cost ?? 0),
      conversions: acc.conversions + Number(m.conversions ?? 0),
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
  );
  return {
    ...totals,
    ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
    cpc: totals.clicks > 0 ? totals.cost / totals.clicks : 0,
    cpa: totals.conversions > 0 ? totals.cost / totals.conversions : 0,
    cvr: totals.clicks > 0 ? totals.conversions / totals.clicks : 0,
  };
}

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateDiffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / 86_400_000);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platformParam = searchParams.get('platform') ?? 'all';
  const adTypeParam = searchParams.get('adType') ?? 'all';

  const start = parseDate(searchParams.get('start'));
  const end = parseDate(searchParams.get('end'));
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  let prevStart: string;
  let prevEnd: string;
  const cs = parseDate(searchParams.get('compareStart'));
  const ce = parseDate(searchParams.get('compareEnd'));
  if (cs && ce) {
    prevStart = cs;
    prevEnd = ce;
  } else {
    const days = dateDiffDays(start, end);
    prevEnd = shiftDate(start, -1);
    prevStart = shiftDate(prevEnd, -days);
  }

  try {
    // adType フィルタ有無に関わらず、ad_type を取得して platform × ad_type で集計する。
    // クライアントで「検索/ディスプレイ並列表示」が必要なので常に内訳を返す。
    const adTypeFilter = adTypeParam !== 'all' ? `AND c.ad_type = @adType` : '';
    const platformFilter = platformParam !== 'all' ? `AND m.platform = @platform` : '';

    const sql = `
      SELECT
        m.platform AS platform,
        c.ad_type AS ad_type,
        SUM(m.impressions) AS impressions,
        SUM(m.clicks) AS clicks,
        SUM(m.cost) AS cost,
        SUM(m.conversions) AS conversions
      FROM ${table('adm_daily_metrics')} m
      LEFT JOIN ${table('adm_campaigns')} c ON c.id = m.campaign_id AND c.platform = m.platform
      WHERE m.date BETWEEN DATE(@start) AND DATE(@end)
        ${platformFilter}
        ${adTypeFilter}
      GROUP BY m.platform, c.ad_type
    `;

    const cacheKeyBase = `summary:${platformParam}:${adTypeParam}`;
    const [currentResult, prevResult] = await Promise.all([
      cached(`${cacheKeyBase}:${start}:${end}`, () =>
        query<PlatformAggregateRow>(sql, {
          start,
          end,
          ...(platformParam !== 'all' ? { platform: platformParam } : {}),
          ...(adTypeParam !== 'all' ? { adType: adTypeParam } : {}),
        }),
      ),
      cached(`${cacheKeyBase}:${prevStart}:${prevEnd}`, () =>
        query<PlatformAggregateRow>(sql, {
          start: prevStart,
          end: prevEnd,
          ...(platformParam !== 'all' ? { platform: platformParam } : {}),
          ...(adTypeParam !== 'all' ? { adType: adTypeParam } : {}),
        }),
      ),
    ]);

    const current = aggregateMetrics(currentResult.value);
    const previous = aggregateMetrics(prevResult.value);

    // 媒体別の合計（ad_type を畳む）
    const platformGroups = new Map<string, PlatformAggregateRow[]>();
    for (const row of currentResult.value) {
      if (!platformGroups.has(row.platform)) platformGroups.set(row.platform, []);
      platformGroups.get(row.platform)!.push(row);
    }
    const byPlatform = Array.from(platformGroups.entries()).map(
      ([platform, rows]) => {
        const search = rows.filter((r) => r.ad_type === 'search');
        const display = rows.filter((r) => r.ad_type === 'display');
        return {
          platform,
          ...aggregateMetrics(rows),
          search: aggregateMetrics(search),
          display: aggregateMetrics(display),
        };
      },
    );

    // 検索/ディスプレイ別の全媒体合計
    const byAdType = {
      search: aggregateMetrics(
        currentResult.value.filter((r) => r.ad_type === 'search'),
      ),
      display: aggregateMetrics(
        currentResult.value.filter((r) => r.ad_type === 'display'),
      ),
    };

    const fetchedAt = Math.min(currentResult.fetchedAt, prevResult.fetchedAt);
    return NextResponse.json(
      { platform: platformParam, current, previous, byPlatform, byAdType },
      {
        headers: {
          'X-Cache-Fetched-At': new Date(fetchedAt).toISOString(),
          'X-Cache-Hit': String(currentResult.hit && prevResult.hit),
        },
      },
    );
  } catch (error) {
    console.error('ダッシュボードサマリー取得エラー:', error);
    return NextResponse.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}
