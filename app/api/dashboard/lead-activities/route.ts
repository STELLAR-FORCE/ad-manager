/**
 * GET /api/dashboard/lead-activities
 *
 * ダッシュボードの「直近 7 日の依頼（リード）」フィード用 API。
 *
 * 直近 7 日（rolling）に受付された LP 経由のリードを時系列で返す。
 * bizdev / 紹介 / その他経路は除外（業務的に「広告反響」と区別したい意図）。
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import { SF_MART, SF_COLS, lpRyuunyuumotoSqlList } from '@/lib/salesforce/queries';

type Row = {
  received_at: { value: string } | string;
  lead_id: string;
  company_name: string | null;
  contact_name: string | null;
  use_period_start: { value: string } | string | null;
  use_period_end: { value: string } | string | null;
  use_period_days: number | null;
  need_rooms: number | null;
  lp_source: string | null;
  media_source: string | null;
};

export type LeadActivityItem = {
  receivedAt: string;
  leadId: string;
  companyName: string | null;
  contactName: string | null;
  /** 入居予定日 = 利用期間_始期 */
  useStart: string | null;
  /** 退去予定日 = 利用期間_終期 */
  useEnd: string | null;
  /** 利用日数 */
  useDays: number;
  /** 必要戸数 */
  needRooms: number;
  /** LP の種類 (monthly-order / express / standard / site) */
  lpSource: string | null;
  /** 流入元_媒体別 (google / yahoo / bing / null) */
  mediaSource: string | null;
};

export type LeadActivitiesResponse = {
  start: string;
  end: string;
  items: LeadActivityItem[];
};

function fmt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoDate(v: Row['received_at'] | Row['use_period_start']): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return v.value.slice(0, 10);
}

export async function GET() {
  const now = new Date();
  const end = fmt(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 6); // 直近 7 日（today 含む）
  const start = fmt(startDate);

  const sql = `
    SELECT
      ${SF_COLS.receivedAt} AS received_at,
      ${SF_COLS.leadId} AS lead_id,
      \`会社名\` AS company_name,
      \`名前\` AS contact_name,
      ${SF_COLS.usePeriodStart} AS use_period_start,
      ${SF_COLS.usePeriodEnd} AS use_period_end,
      ${SF_COLS.usePeriodDays} AS use_period_days,
      ${SF_COLS.needRooms} AS need_rooms,
      ${SF_COLS.lpSource} AS lp_source,
      ${SF_COLS.media} AS media_source
    FROM ${SF_MART}
    WHERE DATE(${SF_COLS.receivedAt}) BETWEEN DATE(@start) AND DATE(@end)
      AND ${SF_COLS.lpSource} IN (${lpRyuunyuumotoSqlList()})
    ORDER BY ${SF_COLS.receivedAt} DESC
  `;

  const cacheKey = `dashboard-lead-activities:${end}`;
  try {
    const cacheResult = await cached(cacheKey, async () => {
      const rows = await query<Row>(sql, { start, end });
      const items: LeadActivityItem[] = rows.map((r) => ({
        receivedAt: isoDate(r.received_at) ?? '',
        leadId: r.lead_id,
        companyName: r.company_name,
        contactName: r.contact_name,
        useStart: isoDate(r.use_period_start),
        useEnd: isoDate(r.use_period_end),
        useDays: Number(r.use_period_days ?? 0),
        needRooms: Number(r.need_rooms ?? 0),
        lpSource: r.lp_source,
        mediaSource: r.media_source,
      }));
      const result: LeadActivitiesResponse = { start, end, items };
      return result;
    });

    return NextResponse.json(cacheResult.value, {
      headers: {
        'X-Cache-Fetched-At': new Date(cacheResult.fetchedAt).toISOString(),
        'X-Cache-Hit': String(cacheResult.hit),
      },
    });
  } catch (err) {
    console.error('lead-activities API error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
