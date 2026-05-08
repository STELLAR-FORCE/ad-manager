import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import {
  SF_MART,
  SF_COLS,
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
  count: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = parseDate(searchParams.get('start'));
  const end = parseDate(searchParams.get('end'));
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  // mart には ForecastCategoryName / SortOrder を持つステージマスタは含まれないため、
  // フォーキャスト分類は API 側で返さない（forecastCategory / sortOrder は null）。
  // UI 側の色分けは kind (open/won/lost) ベースに統一済み。
  const sql = `
    SELECT
      ${SF_COLS.oppStage} AS stage_name,
      COUNT(*) AS count
    FROM ${SF_MART}
    WHERE ${SF_COLS.oppId} IS NOT NULL
      AND ${SF_COLS.oppStage} IS NOT NULL
      AND DATE(${SF_COLS.oppReceptionDate}) BETWEEN DATE(@start) AND DATE(@end)
    GROUP BY ${SF_COLS.oppStage}
    ORDER BY count DESC
  `;

  try {
    const rows = await query<Row>(sql, { start, end });
    const result: SfPipelineRow[] = rows.map((r) => {
      let kind: SfOpportunityStageKind = 'open';
      if (r.stage_name === SF_STAGE_WON) kind = 'won';
      else if (SF_STAGES_LOST_SET.has(r.stage_name)) kind = 'lost';
      return {
        stageName: r.stage_name,
        forecastCategory: null,
        sortOrder: null,
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
