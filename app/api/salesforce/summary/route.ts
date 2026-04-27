import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import {
  SF_OPPORTUNITY,
  SF_STAGE_WON,
  lostStagesSqlList,
} from '@/lib/salesforce/queries';
import type { SfOpportunitySummary } from '@/lib/types/salesforce';

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

type Row = {
  total: number | null;
  won: number | null;
  lost: number | null;
  avg_lead_time_days: number | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = parseDate(searchParams.get('start'));
  const end = parseDate(searchParams.get('end'));
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  const sql = `
    SELECT
      COUNT(*) AS total,
      COUNTIF(StageName = @wonStage) AS won,
      COUNTIF(StageName IN (${lostStagesSqlList()})) AS lost,
      AVG(IF(StageName = @wonStage, elapsed_lead_time__c, NULL)) AS avg_lead_time_days
    FROM ${SF_OPPORTUNITY}
    WHERE DATE(CreatedDate) BETWEEN DATE(@start) AND DATE(@end)
  `;

  try {
    const rows = await query<Row>(sql, { start, end, wonStage: SF_STAGE_WON });
    const r = rows[0] ?? { total: 0, won: 0, lost: 0, avg_lead_time_days: null };
    const total = Number(r.total ?? 0);
    const won = Number(r.won ?? 0);
    const lost = Number(r.lost ?? 0);
    const open = Math.max(0, total - won - lost);
    const closed = won + lost;
    const result: SfOpportunitySummary = {
      total,
      won,
      lost,
      open,
      winRate: closed > 0 ? won / closed : null,
      avgLeadTimeDays: r.avg_lead_time_days != null ? Number(r.avg_lead_time_days) : null,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
