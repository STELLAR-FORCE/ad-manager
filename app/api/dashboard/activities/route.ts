/**
 * GET /api/dashboard/activities
 *
 * ダッシュボードのアクティビティフィード用 API。
 *
 * 直近 7 日（rolling）に「契約管理レコードが作成された成約」を時系列で返す。
 * mart には契約管理レコードの作成日時カラムが無いので、`決定日_粗利益計上日` で代用
 * （業務側がレコードを成立として確定した日 = 経理粗利計上日）。
 *
 * mart は 1 リード 1 行のワイドビューなので、同じ契約管理 ID で複数行返ることがある。
 * 契約管理 ID で集約して 1 件として返す。
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import { SF_MART, SF_COLS, lpRyuunyuumotoSqlList, lostStagesSqlList } from '@/lib/salesforce/queries';

type Row = {
  decision_date: { value: string } | string;
  contract_id: string;
  contract_name: string | null;
  tenant_name: string | null;
  property_name: string | null;
  contracted_rooms: number | null;
  use_days_contracted: number | null;
  gross_profit: number | null;
  contract_start: { value: string } | string | null;
};

export type ActivityItem = {
  decisionDate: string;
  contractId: string;
  contractName: string | null;
  tenantName: string | null;
  propertyName: string | null;
  contractedRooms: number;
  /** 利用日数（成約） */
  useDaysContracted: number;
  grossProfit: number;
  /** 入居予定日（= 契約開始日） */
  contractStart: string | null;
};

export type ActivitiesResponse = {
  start: string;
  end: string;
  items: ActivityItem[];
};

function fmt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoDate(v: Row['decision_date'] | Row['contract_start']): string | null {
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

  // LP 関連リードに紐付く成約のみに絞る（bizdev / 紹介などを除外）
  // 同じ 契約管理ID に対して mart は複数行持ち得るので集約する
  //
  // Issue #129:
  //   - 失注/キャンセルフェーズは「成約」ではないので除外
  //   - 総売上(粗利) > 0 を必須化。粗利は SF で 借主請求 - 業者請求 - 紹介料 の自動計算なので、
  //     借主請求 NULL で業者請求だけ先行入力されたケースはマイナス、ヒアリング段階の中途半端
  //     なレコードは 0 になる。プラスの粗利が立っているもの = 実質的な成約 とみなす。
  const sql = `
    SELECT
      ANY_VALUE(${SF_COLS.decisionDate}) AS decision_date,
      ${SF_COLS.contractId} AS contract_id,
      ANY_VALUE(${SF_COLS.contractName}) AS contract_name,
      ANY_VALUE(\`借主名\`) AS tenant_name,
      ANY_VALUE(\`物件名称\`) AS property_name,
      ANY_VALUE(${SF_COLS.contractedRooms}) AS contracted_rooms,
      ANY_VALUE(${SF_COLS.useDaysContracted}) AS use_days_contracted,
      ANY_VALUE(${SF_COLS.grossProfit}) AS gross_profit,
      ANY_VALUE(${SF_COLS.contractStart}) AS contract_start
    FROM ${SF_MART}
    WHERE ${SF_COLS.contractId} IS NOT NULL
      AND ${SF_COLS.decisionDate} BETWEEN DATE(@start) AND DATE(@end)
      AND ${SF_COLS.lpSource} IN (${lpRyuunyuumotoSqlList()})
      AND (${SF_COLS.oppStage} IS NULL OR ${SF_COLS.oppStage} NOT IN (${lostStagesSqlList()}))
      AND ${SF_COLS.grossProfit} > 0
    GROUP BY ${SF_COLS.contractId}
    ORDER BY decision_date DESC, ${SF_COLS.contractId} DESC
  `;

  const cacheKey = `dashboard-activities:${end}`;
  try {
    const cacheResult = await cached(cacheKey, async () => {
      const rows = await query<Row>(sql, { start, end });
      const items: ActivityItem[] = rows.map((r) => ({
        decisionDate: isoDate(r.decision_date) ?? '',
        contractId: r.contract_id,
        contractName: r.contract_name,
        tenantName: r.tenant_name,
        propertyName: r.property_name,
        contractedRooms: Number(r.contracted_rooms ?? 0),
        useDaysContracted: Number(r.use_days_contracted ?? 0),
        grossProfit: Number(r.gross_profit ?? 0),
        contractStart: isoDate(r.contract_start),
      }));
      const result: ActivitiesResponse = { start, end, items };
      return result;
    });

    return NextResponse.json(cacheResult.value, {
      headers: {
        'X-Cache-Fetched-At': new Date(cacheResult.fetchedAt).toISOString(),
        'X-Cache-Hit': String(cacheResult.hit),
      },
    });
  } catch (err) {
    console.error('activities API error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
