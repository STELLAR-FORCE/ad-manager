/**
 * Issue #63 — CV発生日ベース統合ビュー
 *
 * 軸: sf_Lead.Field9__c（受付日）。NULL は CreatedDate にフォールバック。
 * 媒体 × 月別の Imp / Click / Cost + CV / 室数 / RD / 成約 / 粗利 / 売上 + 契約区分内訳。
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import {
  CV_BASED_SQL,
  QUERY_PARAMS,
  type CvBasedRawRow,
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = parseDate(searchParams.get('start'));
  const end = parseDate(searchParams.get('end'));
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  try {
    const result = await cached(`cv-based:${start}:${end}`, () =>
      query<CvBasedRawRow>(CV_BASED_SQL, { start, end, ...QUERY_PARAMS }),
    );

    const rows = result.value.map((r) => ({
      month: r.month,
      platform: mapMediaToPlatform(r.platform),
      impressions: n(r.impressions),
      clicks: n(r.clicks),
      cost: n(r.cost),
      cv: n(r.cv),
      cvRooms: n(r.cv_rooms),
      roomDays: n(r.room_days),
      wonCv: n(r.won_cv),
      contractedRooms: n(r.contracted_rooms),
      grossProfit: n(r.gross_profit),
      revenue: n(r.revenue),
      inhouseWonCount: n(r.inhouse_won_count),
      byContractKind: {
        new: n(r.new_cnt),
        renewal: n(r.renewal_cnt),
        extension: n(r.extension_cnt),
        cancel: n(r.cancel_cnt),
      },
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
    console.error('CV発生日ベース取得エラー:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
