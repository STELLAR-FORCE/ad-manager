/**
 * GET /api/dashboard/monthly-cumulative?axis=movein|received&month=YYYY-MM
 *
 * 「月次累計推移」ページ用 API。
 * 指定月（デフォルト今月）の 1 日〜月末日の **日次** データを返す:
 *   - CV (LP 経由リード件数)
 *   - CV 室数 (必要戸数_数値 の合計)
 *   - 消化予算 (adm_daily_metrics.cost の合計)
 *
 * + 月目標値 (targets_monthly、axis 別、platform IS NULL):
 *   - CV / CV 室数
 *   (消化予算の月目標は targets_monthly に専用カラムが無いため null)
 *
 * 累計化はフロント側で実施する（軸切替で fetch するため、サーバ側で累計化しない）。
 *
 * 軸 (axis):
 *   - movein:   利用期間_始期 が期間内 (入居日ベース)
 *   - received: 受付日時 が期間内 (発生日ベース、デフォルト)
 */

import { NextResponse } from 'next/server';
import { query, table, tableIn } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';
import {
  SF_MART,
  SF_COLS,
  LP_LEAD_FILTER_SQL,
  establishedContractFilterSql,
} from '@/lib/salesforce/queries';

type Axis = 'movein' | 'received';

function axisDateColumn(axis: Axis): string {
  return axis === 'movein' ? SF_COLS.usePeriodStart : SF_COLS.receivedAt;
}

type SfRow = {
  date: { value: string } | string;
  cv: number | null;
  cv_rooms: number | null;
  room_days: number | null;
};
type SfGrossRow = {
  date: { value: string } | string;
  gross_profit: number | null;
  revenue: number | null;
};
type CostRow = { date: { value: string } | string; cost: number | null };
type PlannedCostRow = { date: { value: string } | string; planned_cost: number | string | null };
type TargetRow = {
  cv_target: number | null;
  room_target: number | null;
  room_days_target: number | null;
  gross_profit_target: number | null;
  revenue_target: number | null;
};
type BudgetRow = { total_budget: number | null };

function isoDate(v: SfRow['date']): string {
  return typeof v === 'string' ? v.slice(0, 10) : v.value.slice(0, 10);
}

export type MonthlyCumulativePoint = {
  /** 'YYYY-MM-DD' */
  date: string;
  cv: number;
  cvRooms: number;
  roomDays: number;
  cost: number;
  /** 粗利 (総売上_粗利 SUM)。契約管理単位の確定値なので axis に従った日付で集計 */
  grossProfit: number;
  /** 売上 (借主への請求額 SUM) */
  revenue: number;
  /** 日次の消化予定 (cost_plan_daily)。未入力日は 0 */
  plannedCost: number;
};

export type MonthlyCumulativeResponse = {
  axis: Axis;
  month: string;
  /** その月の 1 日〜月末日の全日付（データ無くても 0 で埋め） */
  days: MonthlyCumulativePoint[];
  /** 月目標 */
  monthlyTarget: {
    /** CV 目標 (targets_monthly.cv_target、axis 別) */
    cv: number | null;
    /** CV 室数 目標 (targets_monthly.room_target、axis 別) */
    cvRooms: number | null;
    /** ルームデイズ 目標 (targets_monthly.room_days_target、axis 別) */
    roomDays: number | null;
    /** 消化予算 目標 (adm_campaigns.monthly_budget の合計、axis 共通) */
    cost: number | null;
    /** 粗利 目標 (targets_monthly.gross_profit_target、axis 別) */
    grossProfit: number | null;
    /** 売上 目標 (targets_monthly.revenue_target、axis 別) */
    revenue: number | null;
  };
};

/** 'YYYY-MM' → 月初日と月末日を返す */
function monthBounds(month: string): { start: string; end: string; daysInMonth: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = `${y}-${String(mo).padStart(2, '0')}-01`;
  // 月末日: 翌月 0 日 = 当月末
  const endDate = new Date(y, mo, 0);
  const endDay = endDate.getDate();
  const end = `${y}-${String(mo).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  return { start, end, daysInMonth: endDay };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const axisParam = searchParams.get('axis');
  const axis: Axis = axisParam === 'movein' ? 'movein' : 'received';
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.get('month') ?? defaultMonth;
  const bounds = monthBounds(month);
  if (!bounds) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const { start: startDate, end: endDate, daysInMonth } = bounds;
  const dateCol = axisDateColumn(axis);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // v5: 日次消化予定 (cost_plan_daily) を追加
  const cacheKey = `monthly-cumulative:v5:${axis}:${month}:${todayStr}`;

  try {
    const result = await cached(cacheKey, async () => {
      // mart はリード単位サブクエリ + LP フィルタ (Issue #97)
      // 利用期間_日数 は SF 側で既に「日数 × 必要戸数」算出済なので SUM のみで OK
      const sfSql = `
        SELECT
          date_value AS date,
          COUNT(*) AS cv,
          SUM(IFNULL(need_rooms, 0)) AS cv_rooms,
          SUM(IFNULL(use_period_days, 0)) AS room_days
        FROM (
          SELECT
            ${SF_COLS.leadId} AS lead_id,
            ANY_VALUE(DATE(${dateCol})) AS date_value,
            ANY_VALUE(${SF_COLS.needRooms}) AS need_rooms,
            ANY_VALUE(${SF_COLS.usePeriodDays}) AS use_period_days
          FROM ${SF_MART}
          WHERE DATE(${dateCol}) BETWEEN DATE(@startDate) AND DATE(@endDate)
            AND ${LP_LEAD_FILTER_SQL}
          GROUP BY lead_id
        )
        GROUP BY date
        ORDER BY date
      `;

      // 粗利・売上 (契約管理単位の確定値)
      // - mart は契約管理ID 以外でも行展開されるため (#118)、契約管理単位で重複除去
      // - 入力途中・失注フェーズの混入を除外 (#129)
      const sfGrossSql = `
        SELECT
          date,
          SUM(IFNULL(gross_profit, 0)) AS gross_profit,
          SUM(IFNULL(revenue, 0)) AS revenue
        FROM (
          SELECT
            ${SF_COLS.contractId} AS contract_id,
            ANY_VALUE(DATE(${dateCol})) AS date,
            ANY_VALUE(${SF_COLS.grossProfit}) AS gross_profit,
            ANY_VALUE(${SF_COLS.revenue}) AS revenue
          FROM ${SF_MART}
          WHERE DATE(${dateCol}) BETWEEN DATE(@startDate) AND DATE(@endDate)
            AND ${LP_LEAD_FILTER_SQL}
            AND ${SF_COLS.contractId} IS NOT NULL
            AND ${establishedContractFilterSql()}
          GROUP BY contract_id
        )
        GROUP BY date
        ORDER BY date
      `;

      // 広告コスト (date ベース)
      const costSql = `
        SELECT
          date,
          SUM(cost) AS cost
        FROM ${table('adm_daily_metrics')}
        WHERE date BETWEEN DATE(@startDate) AND DATE(@endDate)
        GROUP BY date
        ORDER BY date
      `;

      // 月目標 (axis × platform=null)
      const targetSql = `
        SELECT
          cv_target,
          room_target,
          room_days_target,
          gross_profit_target,
          revenue_target
        FROM ${tableIn('dashboard', 'targets_monthly')}
        WHERE month = DATE(@startDate)
          AND platform IS NULL
          AND IFNULL(axis, 'movein') = @axis
        LIMIT 1
      `;

      // 消化予算 目標 = 全キャンペーンの monthly_budget 合計 (axis 共通)
      // cost_plan_daily にデータが無い月のフォールバック
      const budgetSql = `
        SELECT IFNULL(SUM(monthly_budget), 0) AS total_budget
        FROM ${table('adm_campaigns')}
      `;

      // 日次消化予定 (cost_plan_daily)
      const plannedSql = `
        SELECT date, planned_cost
        FROM ${tableIn('dashboard', 'cost_plan_daily')}
        WHERE date BETWEEN DATE(@startDate) AND DATE(@endDate)
        ORDER BY date
      `;

      const [sfRows, sfGrossRows, costRows, targetRows, budgetRows, plannedRows] =
        await Promise.all([
          query<SfRow>(sfSql, { startDate, endDate }),
          query<SfGrossRow>(sfGrossSql, { startDate, endDate }),
          query<CostRow>(costSql, { startDate, endDate }),
          query<TargetRow>(targetSql, { startDate, axis }).catch(() => [] as TargetRow[]),
          query<BudgetRow>(budgetSql).catch(() => [] as BudgetRow[]),
          query<PlannedCostRow>(plannedSql, { startDate, endDate }).catch(
            () => [] as PlannedCostRow[],
          ),
        ]);

      const sfMap = new Map(sfRows.map((r) => [isoDate(r.date), r]));
      const sfGrossMap = new Map(sfGrossRows.map((r) => [isoDate(r.date), r]));
      const costMap = new Map(costRows.map((r) => [isoDate(r.date), r]));
      const plannedMap = new Map(
        plannedRows.map((r) => [isoDate(r.date), Number(r.planned_cost ?? 0)]),
      );

      const days: MonthlyCumulativePoint[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${month}-${String(d).padStart(2, '0')}`;
        const sf = sfMap.get(dateKey);
        const sfg = sfGrossMap.get(dateKey);
        const cost = costMap.get(dateKey);
        days.push({
          date: dateKey,
          cv: Number(sf?.cv ?? 0),
          cvRooms: Number(sf?.cv_rooms ?? 0),
          roomDays: Number(sf?.room_days ?? 0),
          cost: Number(cost?.cost ?? 0),
          grossProfit: Number(sfg?.gross_profit ?? 0),
          revenue: Number(sfg?.revenue ?? 0),
          plannedCost: plannedMap.get(dateKey) ?? 0,
        });
      }

      const t = targetRows[0];
      const totalBudget = budgetRows[0]?.total_budget == null ? null : Number(budgetRows[0].total_budget);
      const response: MonthlyCumulativeResponse = {
        axis,
        month,
        days,
        monthlyTarget: {
          cv: t?.cv_target == null ? null : Number(t.cv_target),
          cvRooms: t?.room_target == null ? null : Number(t.room_target),
          roomDays: t?.room_days_target == null ? null : Number(t.room_days_target),
          cost: totalBudget != null && totalBudget > 0 ? totalBudget : null,
          grossProfit: t?.gross_profit_target == null ? null : Number(t.gross_profit_target),
          revenue: t?.revenue_target == null ? null : Number(t.revenue_target),
        },
      };
      return response;
    });

    return NextResponse.json(result.value, {
      headers: {
        'X-Cache-Fetched-At': new Date(result.fetchedAt).toISOString(),
        'X-Cache-Hit': String(result.hit),
      },
    });
  } catch (err) {
    console.error('monthly-cumulative API error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
