import { NextResponse } from 'next/server';
import { query, table } from '@/lib/bigquery';

const PLATFORMS = ['google', 'yahoo', 'bing'] as const;
type Platform = (typeof PLATFORMS)[number];

type SyncLogRow = {
  platform: string;
  status: string;
  finished_at: { value: string } | string | null;
};

function toIso(v: SyncLogRow['finished_at']): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.value;
}

export async function GET() {
  try {
    const rows = await query<SyncLogRow>(
      `WITH ranked AS (
         SELECT platform, status, finished_at,
                ROW_NUMBER() OVER (PARTITION BY platform ORDER BY COALESCE(finished_at, started_at) DESC) AS rn
         FROM ${table('adm_sync_logs')}
         WHERE status != 'running' AND platform IN UNNEST(@platforms)
       )
       SELECT platform, status, finished_at FROM ranked WHERE rn = 1`,
      { platforms: [...PLATFORMS, 'all'] },
    );

    const latestByPlatform = new Map(rows.map((r) => [r.platform, r]));

    const result = PLATFORMS.map((platform: Platform) => {
      const latest = latestByPlatform.get(platform) ?? latestByPlatform.get('all');
      if (!latest) return { platform, lastSync: null, status: 'never' as const };
      return {
        platform,
        lastSync: toIso(latest.finished_at),
        status: latest.status === 'success' ? ('success' as const) : ('failed' as const),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('同期ステータス取得エラー:', error);
    return NextResponse.json(
      PLATFORMS.map((platform) => ({ platform, lastSync: null, status: 'never' as const })),
    );
  }
}
