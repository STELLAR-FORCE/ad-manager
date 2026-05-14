/**
 * GET /api/dashboard/search-keywords?platform=bing|google|yahoo
 *
 * ダッシュボードの検索キーワードセクション用 API。
 * adm_search_term_reports から「CV つき探索語句」と「新規語句」を返す。
 *
 * 仕様:
 *   - cvKeywords はキラーワード（マンスリー / ウィークリー 等）も含む（業務側で
 *     キラーワード経由の CV 量を把握したいため、敢えて除外しない）
 *   - newKeywords ではキラーワードを除外（メインターゲットの「新規発見」目的のため）
 *   - is_excluded = true（媒体側で既に除外設定済み）は除外
 *   - 日付は MAX(date) ベースで「直近 7 日」「直近 30 日」を判定（ETL 2 日遅延に追従）
 *
 * レスポンス:
 *   - cvKeywords: 直近 30 日で conversions > 0 の語句（全件）。conversions 降順
 *   - newKeywords: 直近 7 日に出現 + clicks >= 1、かつ過去 30 日窓に未出現の語句。clicks 降順 TOP30
 *   - asOf: データ最新日（'YYYY-MM-DD'）
 */

import { NextResponse } from 'next/server';
import { query, table } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';

const VALID_PLATFORMS = new Set(['bing', 'google', 'yahoo']);

// キラーワード判定: 表記揺れ対応で末尾の長音 / 半角カナまで含める
// 'マンスリ-' 'マンスリ' 'マンスリー' / 'ﾏﾝｽﾘｰ' なども全部ヒットさせるため短い prefix を使う
const KILLER_PATTERNS = [
  '%マンスリ%',
  '%ﾏﾝｽﾘ%',
  '%ウィークリ%',
  '%ウイークリ%',
  '%ｳｨｰｸﾘ%',
  '%ｳｲｰｸﾘ%',
  '%weekly%',
  '%monthly%',
];

function killerExclusionSql(): string {
  // search_term を LOWER して 5 パターンを LIKE 比較。いずれかに該当するなら除外
  const conditions = KILLER_PATTERNS.map((p) => `LOWER(search_term) LIKE '${p}'`).join(' OR ');
  return `NOT (${conditions})`;
}

type CvKeywordRow = {
  search_term: string;
  total_clicks: number | null;
  total_impressions: number | null;
  total_cost: number | null;
  total_conversions: number | null;
};

type NewKeywordRow = {
  search_term: string;
  clicks: number | null;
  impressions: number | null;
  cost: number | null;
};

export type CvKeywordItem = {
  searchTerm: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
  cpa: number | null;
};

export type NewKeywordItem = {
  searchTerm: string;
  clicks: number;
  impressions: number;
  cost: number;
};

export type SearchKeywordsResponse = {
  platform: string;
  asOf: string;
  cvKeywords: CvKeywordItem[];
  newKeywords: NewKeywordItem[];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platformParam = searchParams.get('platform') ?? 'bing';
  if (!VALID_PLATFORMS.has(platformParam)) {
    return NextResponse.json(
      { error: 'platform must be one of bing/google/yahoo' },
      { status: 400 },
    );
  }
  const platform = platformParam;

  const cacheKey = `search-keywords:${platform}`;
  try {
    const cacheResult = await cached(cacheKey, async () => {
      const stTable = table('adm_search_term_reports');

      // データ最新日（その媒体で）
      const [asOfRows] = await Promise.all([
        query<{ d: { value: string } | string }>(
          `SELECT MAX(date) AS d FROM ${stTable} WHERE platform = @platform`,
          { platform },
        ),
      ]);
      const asOfRaw = asOfRows[0]?.d;
      const asOf = asOfRaw == null ? '' : typeof asOfRaw === 'string' ? asOfRaw : asOfRaw.value;
      if (!asOf) {
        const result: SearchKeywordsResponse = {
          platform,
          asOf: '',
          cvKeywords: [],
          newKeywords: [],
        };
        return result;
      }

      // CV つき語句: 直近 30 日（asOf 含む）、conversions > 0、is_excluded 除外
      // ※ キラーワード（マンスリー / ウィークリー 等）も含めて返す（CV 量把握目的）
      // ※ 全件返す前提なので LIMIT は安全弁として 500 程度の上限のみ
      const cvSql = `
        SELECT
          search_term,
          SUM(clicks) AS total_clicks,
          SUM(impressions) AS total_impressions,
          SUM(cost) AS total_cost,
          SUM(conversions) AS total_conversions
        FROM ${stTable}
        WHERE platform = @platform
          AND date BETWEEN DATE_SUB(DATE(@asOf), INTERVAL 29 DAY) AND DATE(@asOf)
          AND search_term IS NOT NULL
          AND IFNULL(is_excluded, FALSE) = FALSE
        GROUP BY search_term
        HAVING total_conversions > 0
        ORDER BY total_conversions DESC, total_clicks DESC
        LIMIT 500
      `;

      // 新規語句: 直近 7 日に clicks >= 1 で出現、かつ過去 30 日（asOf-37 〜 asOf-7）に未出現
      // alias とベース列名の衝突回避で SUM の出力名を r_* にする
      const newSql = `
        WITH recent AS (
          SELECT
            search_term,
            SUM(clicks) AS r_clicks,
            SUM(impressions) AS r_imps,
            SUM(cost) AS r_cost
          FROM ${stTable}
          WHERE platform = @platform
            AND date BETWEEN DATE_SUB(DATE(@asOf), INTERVAL 6 DAY) AND DATE(@asOf)
            AND search_term IS NOT NULL
            AND IFNULL(is_excluded, FALSE) = FALSE
            AND ${killerExclusionSql()}
          GROUP BY search_term
          HAVING r_clicks >= 1
        ),
        past AS (
          SELECT DISTINCT search_term
          FROM ${stTable}
          WHERE platform = @platform
            AND date BETWEEN DATE_SUB(DATE(@asOf), INTERVAL 36 DAY) AND DATE_SUB(DATE(@asOf), INTERVAL 7 DAY)
            AND search_term IS NOT NULL
        )
        SELECT r.search_term, r.r_clicks AS clicks, r.r_imps AS impressions, r.r_cost AS cost
        FROM recent r
        LEFT JOIN past p ON p.search_term = r.search_term
        WHERE p.search_term IS NULL
        ORDER BY r.r_clicks DESC
        LIMIT 30
      `;

      const [cvRows, newRows] = await Promise.all([
        query<CvKeywordRow>(cvSql, { platform, asOf }),
        query<NewKeywordRow>(newSql, { platform, asOf }),
      ]);

      const cvKeywords: CvKeywordItem[] = cvRows.map((r) => {
        const cost = Number(r.total_cost ?? 0);
        const conv = Number(r.total_conversions ?? 0);
        return {
          searchTerm: r.search_term,
          clicks: Number(r.total_clicks ?? 0),
          impressions: Number(r.total_impressions ?? 0),
          cost,
          conversions: conv,
          cpa: conv > 0 ? Math.round(cost / conv) : null,
        };
      });
      const newKeywords: NewKeywordItem[] = newRows.map((r) => ({
        searchTerm: r.search_term,
        clicks: Number(r.clicks ?? 0),
        impressions: Number(r.impressions ?? 0),
        cost: Number(r.cost ?? 0),
      }));

      const result: SearchKeywordsResponse = { platform, asOf, cvKeywords, newKeywords };
      return result;
    });

    return NextResponse.json(cacheResult.value, {
      headers: {
        'X-Cache-Fetched-At': new Date(cacheResult.fetchedAt).toISOString(),
        'X-Cache-Hit': String(cacheResult.hit),
      },
    });
  } catch (err) {
    console.error('search-keywords API error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
