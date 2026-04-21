import { NextRequest } from 'next/server';
import { query, table } from '@/lib/bigquery';

type SyncLogRow = {
  id: string;
  platform: string;
  sync_type: string;
  status: string;
  message: string | null;
  started_at: { value: string } | string;
  finished_at: { value: string } | string | null;
};

function toIso(v: { value: string } | string | null): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.value;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limitParam = parseInt(searchParams.get('limit') ?? '50', 10);
  const limit = Math.max(1, Math.min(500, limitParam));

  try {
    const rows = await query<SyncLogRow>(
      `SELECT id, platform, sync_type, status, message, started_at, finished_at
       FROM ${table('adm_sync_logs')}
       ORDER BY started_at DESC
       LIMIT @limit`,
      { limit },
    );

    const logs = rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      syncType: r.sync_type,
      status: r.status,
      message: r.message,
      startedAt: toIso(r.started_at) ?? '',
      finishedAt: toIso(r.finished_at),
    }));

    return Response.json(logs);
  } catch (error) {
    console.error('sync logs GET error:', error);
    return Response.json([]);
  }
}
