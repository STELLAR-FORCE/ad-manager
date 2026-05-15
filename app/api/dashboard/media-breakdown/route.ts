/**
 * GET /api/dashboard/media-breakdown
 *
 * ダッシュボードの「媒体ブレイクダウン」セクション用 API。
 *
 * 発生日（adm_daily_metrics.date）ベースで以下を返す:
 *   - 媒体 (google / yahoo / bing) × 種別 (search / display) = 最大 6 行
 *   - 今週 (月起点 〜 今日) と 先週 同曜日の CV / cost / CPA
 *   - 前週比 (% delta)
 *   - 過去 14 日の CV 日次推移 (sparkline 用)
 *
 * データ無しの組み合わせ (ETL 未対応) は cost=0 / cv=0 で返す。フロント側で「—」表示する。
 */

import { NextResponse } from 'next/server';
import { query, table } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import { calcProgressRanges } from '@/lib/dashboard-progress';

type Platform = 'google' | 'yahoo' | 'bing';
type AdType = 'search' | 'display';

const PLATFORMS: Platform[] = ['google', 'yahoo', 'bing'];
const AD_TYPES: AdType[] = ['search', 'display'];

const SPARK_DAYS = 14;

type AggregateRow = {
  platform: string;
  ad_type: string;
  cur_cost: number | null;
  cur_cv: number | null;
  prev_cost: number | null;
  prev_cv: number | null;
};

type SparkRow = {
  platform: string;
  ad_type: string;
  date: { value: string } | string;
  cv: number | null;
};

export type MediaBreakdownItem = {
  platform: Platform;
  adType: AdType;
  current: { cost: number; conversions: number; cpa: number | null };
  previous: { cost: number; conversions: number; cpa: number | null };
  cvDeltaPct: number | null;
  costDeltaPct: number | null;
  sparkline: { date: string; cv: number }[];
};

export type MediaBreakdownResponse = {
  current: { start: string; end: string };
  previous: { start: string; end: string };
  sparkRange: { start: string; end: string };
  items: MediaBreakdownItem[];
};

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

function normalizeDate(v: SparkRow['date']): string {
  return typeof v === 'string' ? v.slice(0, 10) : v.value.slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function fmt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function GET() {
  const now = new Date();
  const ranges = calcProgressRanges(now);
  const week = ranges.week;
  const sparkStart = fmt(addDays(now, -(SPARK_DAYS - 1)));
  const sparkEnd = week.end;

  const cacheKey = `media-breakdown:${week.end}`;
  try {
    const cacheResult = await cached(cacheKey, async () => {
      const dailyMetrics = table('adm_daily_metrics');
      const campaigns = table('adm_campaigns');

      // CTE: 14 日ぶんの daily metrics × ad_type を 1 度だけ走査
      const srcCte = `
        WITH src AS (
          SELECT
            m.platform AS platform,
            c.ad_type AS ad_type,
            m.date AS date,
            IFNULL(m.cost, 0) AS cost,
            IFNULL(m.conversions, 0) AS conversions
          FROM ${dailyMetrics} m
          LEFT JOIN ${campaigns} c ON c.id = m.campaign_id AND c.platform = m.platform
          WHERE m.date BETWEEN DATE(@sparkStart) AND DATE(@sparkEnd)
            AND m.platform IN ('google','yahoo','bing')
            AND c.ad_type IN ('search','display')
        )
      `;

      // 今週 / 先週 を一括集計
      const aggregateSql = `
        ${srcCte}
        SELECT
          platform,
          ad_type,
          SUM(IF(date BETWEEN DATE(@curStart) AND DATE(@curEnd), cost, 0)) AS cur_cost,
          SUM(IF(date BETWEEN DATE(@curStart) AND DATE(@curEnd), conversions, 0)) AS cur_cv,
          SUM(IF(date BETWEEN DATE(@prevStart) AND DATE(@prevEnd), cost, 0)) AS prev_cost,
          SUM(IF(date BETWEEN DATE(@prevStart) AND DATE(@prevEnd), conversions, 0)) AS prev_cv
        FROM src
        GROUP BY platform, ad_type
      `;

      // 過去 14 日の日次 CV
      const sparkSql = `
        ${srcCte}
        SELECT platform, ad_type, date, SUM(conversions) AS cv
        FROM src
        GROUP BY platform, ad_type, date
        ORDER BY date
      `;

      const [aggRows, sparkRows] = await Promise.all([
        query<AggregateRow>(aggregateSql, {
          sparkStart,
          sparkEnd,
          curStart: week.start,
          curEnd: week.end,
          prevStart: week.prevStart,
          prevEnd: week.prevEnd,
        }),
        query<SparkRow>(sparkSql, { sparkStart, sparkEnd }),
      ]);

      // platform×adType ごとの集計を Map に
      const aggMap = new Map<string, AggregateRow>();
      for (const r of aggRows) {
        aggMap.set(`${r.platform}:${r.ad_type}`, r);
      }

      // sparkline は 14 日分の全日付を 0 埋めで構築
      const dateAxis: string[] = [];
      for (let i = SPARK_DAYS - 1; i >= 0; i--) {
        dateAxis.push(fmt(addDays(now, -i)));
      }
      const sparkMap = new Map<string, Map<string, number>>();
      for (const row of sparkRows) {
        const key = `${row.platform}:${row.ad_type}`;
        const m = sparkMap.get(key) ?? new Map<string, number>();
        m.set(normalizeDate(row.date), Number(row.cv ?? 0));
        sparkMap.set(key, m);
      }

      const items: MediaBreakdownItem[] = [];
      for (const platform of PLATFORMS) {
        for (const adType of AD_TYPES) {
          const key = `${platform}:${adType}`;
          const a = aggMap.get(key);
          const curCost = Number(a?.cur_cost ?? 0);
          const curCv = Number(a?.cur_cv ?? 0);
          const prevCost = Number(a?.prev_cost ?? 0);
          const prevCv = Number(a?.prev_cv ?? 0);
          const sparkBuckets = sparkMap.get(key);
          const sparkline = dateAxis.map((d) => ({
            date: d,
            cv: sparkBuckets?.get(d) ?? 0,
          }));
          items.push({
            platform,
            adType,
            current: {
              cost: curCost,
              conversions: curCv,
              cpa: curCv > 0 ? Math.round(curCost / curCv) : null,
            },
            previous: {
              cost: prevCost,
              conversions: prevCv,
              cpa: prevCv > 0 ? Math.round(prevCost / prevCv) : null,
            },
            cvDeltaPct: deltaPct(curCv, prevCv),
            costDeltaPct: deltaPct(curCost, prevCost),
            sparkline,
          });
        }
      }

      const result: MediaBreakdownResponse = {
        current: { start: week.start, end: week.end },
        previous: { start: week.prevStart, end: week.prevEnd },
        sparkRange: { start: sparkStart, end: sparkEnd },
        items,
      };
      return result;
    });

    return NextResponse.json(cacheResult.value, {
      headers: {
        'X-Cache-Fetched-At': new Date(cacheResult.fetchedAt).toISOString(),
        'X-Cache-Hit': String(cacheResult.hit),
      },
    });
  } catch (err) {
    console.error('media-breakdown API error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
