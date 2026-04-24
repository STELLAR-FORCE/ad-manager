import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import {
  SF_OPPORTUNITY,
  SF_OPPORTUNITY_STAGE,
  SF_STAGE_WON,
  SF_STAGES_LOST_SET,
} from '@/lib/salesforce/queries';
import type { SfPipelineRow, SfOpportunityStageKind } from '@/lib/types/salesforce';

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

type Row = {
  stage_name: string;
  forecast_category: string | null;
  sort_order: number | null;
  count: number;
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
      o.StageName AS stage_name,
      ANY_VALUE(s.ForecastCategoryName) AS forecast_category,
      ANY_VALUE(s.SortOrder) AS sort_order,
      COUNT(*) AS count
    FROM ${SF_OPPORTUNITY} AS o
    LEFT JOIN ${SF_OPPORTUNITY_STAGE} AS s
      ON s.MasterLabel = o.StageName
    WHERE DATE(o.CreatedDate) BETWEEN DATE(@start) AND DATE(@end)
    GROUP BY o.StageName
    ORDER BY sort_order NULLS LAST, count DESC
  `;

  try {
    const rows = await query<Row>(sql, { start, end });
    const result: SfPipelineRow[] = rows.map((r) => {
      let kind: SfOpportunityStageKind = 'open';
      if (r.stage_name === SF_STAGE_WON) kind = 'won';
      else if (SF_STAGES_LOST_SET.has(r.stage_name)) kind = 'lost';
      return {
        stageName: r.stage_name,
        forecastCategory: r.forecast_category,
        sortOrder: r.sort_order != null ? Number(r.sort_order) : null,
        count: Number(r.count),
        kind,
      };
    });
    return NextResponse.json({ rows: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
