/**
 * GET /api/dashboard/media-daily-cost?platform=bing&month=YYYY-MM&adType=all|search|display
 *
 * 指定月・指定媒体・指定広告種別の日次「コスト実績 vs 消化予定」を返す。
 * ad-detail の媒体カード下グラフ用 (adType フィルタは ad-detail のセレクタと連動)。
 *
 * - 実績: adm_daily_metrics × adm_campaigns で date × platform [× ad_type] で SUM(cost)
 * - 予定: cost_plan_daily_by_platform で date × platform [× ad_type] で SUM(planned_cost)
 * - adType=all (デフォルト): search + display 合算
 * - adType=search: 検索広告のみ
 * - adType=display: ディスプレイ広告のみ
 * - 月内の全日付を 0 埋め
 */

import { NextResponse } from 'next/server';
import { query, table, tableIn } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';

type Platform = 'google' | 'yahoo' | 'bing';
type AdTypeFilter = 'all' | 'search' | 'display';
const VALID_PLATFORMS = new Set<Platform>(['google', 'yahoo', 'bing']);
const VALID_AD_TYPES = new Set<AdTypeFilter>(['all', 'search', 'display']);

type DailyCostRow = { date: { value: string } | string; cost: number | null };
type DailyPlanRow = { date: { value: string } | string; planned_cost: number | string | null };

export type MediaDailyCostPoint = {
  date: string;
  cost: number;
  plannedCost: number;
};

export type MediaDailyCostResponse = {
  platform: Platform;
  adType: AdTypeFilter;
  month: string;
  days: MediaDailyCostPoint[];
};

function isoDate(v: DailyCostRow['date']): string {
  return typeof v === 'string' ? v.slice(0, 10) : v.value.slice(0, 10);
}

function monthBounds(month: string): { start: string; end: string; daysInMonth: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = `${y}-${String(mo).padStart(2, '0')}-01`;
  const endDate = new Date(y, mo, 0);
  const endDay = endDate.getDate();
  const end = `${y}-${String(mo).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  return { start, end, daysInMonth: endDay };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPlatform = searchParams.get('platform');
  if (!rawPlatform || !VALID_PLATFORMS.has(rawPlatform as Platform)) {
    return NextResponse.json(
      { error: 'platform must be one of google/yahoo/bing' },
      { status: 400 },
    );
  }
  const platform = rawPlatform as Platform;

  const rawAdType = searchParams.get('adType') ?? 'all';
  if (!VALID_AD_TYPES.has(rawAdType as AdTypeFilter)) {
    return NextResponse.json(
      { error: 'adType must be all/search/display' },
      { status: 400 },
    );
  }
  const adType = rawAdType as AdTypeFilter;

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.get('month') ?? defaultMonth;
  const bounds = monthBounds(month);
  if (!bounds) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const { start: startDate, end: endDate, daysInMonth } = bounds;

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const cacheKey = `media-daily-cost:${platform}:${adType}:${month}:${todayStr}`;

  try {
    const result = await cached(cacheKey, async () => {
      // adType=all は ad_type フィルタなし、search/display なら adm_campaigns で絞り込み
      const adTypeJoinFilter =
        adType === 'all'
          ? ''
          : `AND c.ad_type = @adType`;
      const costSql =
        adType === 'all'
          ? `
            SELECT date, SUM(cost) AS cost
            FROM ${table('adm_daily_metrics')}
            WHERE date BETWEEN DATE(@startDate) AND DATE(@endDate)
              AND platform = @platform
            GROUP BY date
            ORDER BY date
          `
          : `
            SELECT m.date, SUM(m.cost) AS cost
            FROM ${table('adm_daily_metrics')} m
            JOIN ${table('adm_campaigns')} c
              ON c.id = m.campaign_id AND c.platform = m.platform
            WHERE m.date BETWEEN DATE(@startDate) AND DATE(@endDate)
              AND m.platform = @platform
              ${adTypeJoinFilter}
            GROUP BY m.date
            ORDER BY m.date
          `;
      const plannedSql = `
        SELECT date, SUM(planned_cost) AS planned_cost
        FROM ${tableIn('dashboard', 'cost_plan_daily_by_platform')}
        WHERE date BETWEEN DATE(@startDate) AND DATE(@endDate)
          AND platform = @platform
          ${adType === 'all' ? '' : 'AND ad_type = @adType'}
        GROUP BY date
        ORDER BY date
      `;

      const params: Record<string, string> = { startDate, endDate, platform };
      if (adType !== 'all') params.adType = adType;
      const [costRows, plannedRows] = await Promise.all([
        query<DailyCostRow>(costSql, params),
        query<DailyPlanRow>(plannedSql, params).catch(() => [] as DailyPlanRow[]),
      ]);

      const costMap = new Map<string, number>(
        costRows.map((r) => [isoDate(r.date), Number(r.cost ?? 0)]),
      );
      const planMap = new Map<string, number>(
        plannedRows.map((r) => [isoDate(r.date), Number(r.planned_cost ?? 0)]),
      );

      const days: MediaDailyCostPoint[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${month}-${String(d).padStart(2, '0')}`;
        days.push({
          date: dateKey,
          cost: costMap.get(dateKey) ?? 0,
          plannedCost: planMap.get(dateKey) ?? 0,
        });
      }

      const response: MediaDailyCostResponse = { platform, adType, month, days };
      return response;
    });

    return NextResponse.json(result.value, {
      headers: {
        'X-Cache-Fetched-At': new Date(result.fetchedAt).toISOString(),
        'X-Cache-Hit': String(result.hit),
      },
    });
  } catch (err) {
    console.error('media-daily-cost API error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
