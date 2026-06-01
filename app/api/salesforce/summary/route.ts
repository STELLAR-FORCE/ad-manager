import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import {
  SF_MART,
  SF_COLS,
  SF_STAGE_WON,
  LP_LEAD_FILTER_SQL,
  lostStagesSqlList,
  establishedContractFilterSql,
  contractKindCase,
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

  // ad-detail の成約 (won) はダッシュボードと条件を揃える:
  //   - LP フィルタあり (流入元_LP反響 ∈ monthly-order/express/standard/site)
  //   - リード単位 (mart は契約管理単位で行展開されてる)
  //   - won 判定 = 成立した契約管理を持つリード、かつ新規のみ (更新/延長/キャンセル除外)
  // 案件件数 (total) / 失注 (lost) / 平均リードタイムは案件単位の集計を維持する。
  // 軸はリードの 受付日時 (= ダッシュボードの「発生日ベース」と同じ)。
  const sql = `
    WITH lead_level AS (
      SELECT
        ${SF_COLS.leadId} AS lead_id,
        ANY_VALUE(${SF_COLS.oppId}) AS opp_id,
        ANY_VALUE(${SF_COLS.oppStage}) AS stage,
        ANY_VALUE(${SF_COLS.elapsedLeadTime}) AS elapsed_lead_time,
        MAX(IF(
          ${SF_COLS.contractId} IS NOT NULL
          AND (${establishedContractFilterSql()})
          AND ${contractKindCase(SF_COLS.contractName)} = 'new',
          1, 0
        )) AS has_contract
      FROM ${SF_MART}
      WHERE DATE(${SF_COLS.receivedAt}) BETWEEN DATE(@start) AND DATE(@end)
        AND ${LP_LEAD_FILTER_SQL}
      GROUP BY lead_id
    ),
    opp_level AS (
      -- 案件単位の集計 (1 案件 1 行)
      SELECT
        opp_id,
        ANY_VALUE(stage) AS stage,
        ANY_VALUE(elapsed_lead_time) AS elapsed_lead_time
      FROM lead_level
      WHERE opp_id IS NOT NULL
      GROUP BY opp_id
    )
    SELECT
      (SELECT COUNT(*) FROM opp_level) AS total,
      (SELECT IFNULL(SUM(has_contract), 0) FROM lead_level) AS won,
      (SELECT COUNTIF(stage IN (${lostStagesSqlList()})) FROM opp_level) AS lost,
      (SELECT AVG(IF(stage = @wonStage, elapsed_lead_time, NULL)) FROM opp_level) AS avg_lead_time_days
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
