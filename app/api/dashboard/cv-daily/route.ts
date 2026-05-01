/**
 * Issue #63 — 日次 CV 詳細（gid=335163595 + gid=554788506 グラフ相当）
 *
 * 日次の検索エンジン × CV / 室数 / コスト + 期間先頭からの累積。
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import {
  CV_DAILY_SQL,
  QUERY_PARAMS,
  type CvDailyRawRow,
} from '@/lib/salesforce/integrated-queries';
import { mapMediaToPlatform } from '@/lib/salesforce/queries';

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function n(v: number | null | undefined): number {
  return v == null ? 0 : Number(v);
}

function dateToIso(v: CvDailyRawRow['date']): string {
  return typeof v === 'string' ? v : v.value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = parseDate(searchParams.get('start'));
  const end = parseDate(searchParams.get('end'));
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  try {
    const result = await cached(`cv-daily:${start}:${end}`, () =>
      query<CvDailyRawRow>(CV_DAILY_SQL, { start, end, ...QUERY_PARAMS }),
    );

    const rows = result.value.map((r) => ({
      date: dateToIso(r.date),
      platform: mapMediaToPlatform(r.platform),
      cv: n(r.cv),
      rooms: n(r.rooms),
      cost: n(r.cost),
      cumulativeCv: n(r.cumulative_cv),
      cumulativeRooms: n(r.cumulative_rooms),
      cumulativeCost: n(r.cumulative_cost),
    }));

    return NextResponse.json(
      { rows },
      {
        headers: {
          'X-Cache-Fetched-At': new Date(result.fetchedAt).toISOString(),
          'X-Cache-Hit': String(result.hit),
        },
      },
    );
  } catch (err) {
    console.error('日次CV取得エラー:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
