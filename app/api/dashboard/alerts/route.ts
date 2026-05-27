/**
 * GET /api/dashboard/alerts
 *
 * ダッシュボードの統合アラートセンター用 API。
 * 広告の日次データ (adm_daily_metrics) を週次比較 (直近 7 日 vs 前 7 日) で評価し、
 * 「最近の変化」に気づけるアラートを重要度順に集約する。
 *
 * - CV 急落: 直近 7 日の CV が前 7 日比で 30% 以上減
 * - CPA 急騰: 直近 7 日の CPA が前 7 日比で 20% 以上悪化
 * - 予算ペース: 今月の消化ペースから月末着地を予測し、超過 / 大幅未消化を警告
 *
 * 各アラートは遷移先 href を持つ。
 */

import { NextResponse } from 'next/server';
import { query, table } from '@/lib/bigquery';
import { cached } from '@/lib/dashboard-cache';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type DashboardAlert = {
  severity: AlertSeverity;
  category: string;
  title: string;
  message: string;
  href: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

type DailyRow = { date: { value: string } | string; cost: number | null; cv: number | null };
type BudgetRow = { total_budget: number | null };
type MonthCostRow = { total_cost: number | null };

function isoDate(v: DailyRow['date']): string {
  return typeof v === 'string' ? v.slice(0, 10) : v.value.slice(0, 10);
}

export async function GET() {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedDays = now.getDate();

  try {
    const result = await cached(`dashboard-alerts:${monthStart}:${elapsedDays}`, async () => {
      const [budgetRes, monthCostRes, dailyRes] = await Promise.all([
        query<BudgetRow>(
          `SELECT IFNULL(SUM(monthly_budget), 0) AS total_budget
           FROM ${table('adm_campaigns')}
           WHERE monthly_budget IS NOT NULL AND status != 'ended'`,
        ).catch(() => [{ total_budget: 0 }] as BudgetRow[]),
        query<MonthCostRow>(
          `SELECT IFNULL(SUM(cost), 0) AS total_cost
           FROM ${table('adm_daily_metrics')}
           WHERE date >= DATE(@monthStart)`,
          { monthStart },
        ).catch(() => [{ total_cost: 0 }] as MonthCostRow[]),
        query<DailyRow>(
          `SELECT date, SUM(cost) AS cost, SUM(conversions) AS cv
           FROM ${table('adm_daily_metrics')}
           WHERE date >= DATE_SUB((SELECT MAX(date) FROM ${table('adm_daily_metrics')}), INTERVAL 13 DAY)
           GROUP BY date
           ORDER BY date DESC`,
        ).catch(() => [] as DailyRow[]),
      ]);

      const alerts: DashboardAlert[] = [];

      // ── 予算ペース (月末着地予測) ──
      const totalBudget = Number(budgetRes[0]?.total_budget ?? 0);
      const monthCost = Number(monthCostRes[0]?.total_cost ?? 0);
      if (totalBudget > 0 && elapsedDays > 0) {
        const curUtil = monthCost / totalBudget;
        const projected = monthCost * (daysInMonth / elapsedDays);
        const projUtil = projected / totalBudget;
        if (curUtil > 1) {
          alerts.push({
            severity: 'critical',
            category: '予算',
            title: '月次予算を超過',
            message: `今月の広告費が既に予算を超過しています（消化率 ${Math.round(curUtil * 100)}%）`,
            href: '/budget',
          });
        } else if (projUtil > 1.05) {
          alerts.push({
            severity: 'warning',
            category: '予算ペース',
            title: '月末に予算超過の見込み',
            message: `現在の消化ペースだと月末で予算の ${Math.round(projUtil * 100)}% に達する見込みです`,
            href: '/budget',
          });
        } else if (projUtil < 0.7) {
          alerts.push({
            severity: 'info',
            category: '予算ペース',
            title: '予算が大幅に余る見込み',
            message: `現在の消化ペースだと月末で予算の ${Math.round(projUtil * 100)}% にとどまる見込みです`,
            href: '/budget',
          });
        }
      }

      // ── 週次比較 (直近 7 日 vs 前 7 日) ──
      const daily = dailyRes.map((r) => ({
        date: isoDate(r.date),
        cost: Number(r.cost ?? 0),
        cv: Number(r.cv ?? 0),
      }));
      // date DESC で並んでいる前提。上位 7 = 直近、次 7 = 前週
      if (daily.length >= 14) {
        const last7 = daily.slice(0, 7);
        const prev7 = daily.slice(7, 14);
        const sum = (arr: typeof daily, key: 'cost' | 'cv') =>
          arr.reduce((s, d) => s + d[key], 0);

        const last7Cv = sum(last7, 'cv');
        const prev7Cv = sum(prev7, 'cv');
        const last7Cost = sum(last7, 'cost');
        const prev7Cost = sum(prev7, 'cost');

        // CV 急落
        if (prev7Cv > 0) {
          const delta = (last7Cv - prev7Cv) / prev7Cv;
          if (delta <= -0.3) {
            alerts.push({
              severity: 'warning',
              category: 'CV',
              title: 'CV が急落',
              message: `直近 7 日の CV が前週比 ${Math.round(Math.abs(delta) * 100)}% 減少しています（${Math.round(prev7Cv)} → ${Math.round(last7Cv)} 件）`,
              href: '/dashboard/ad-detail',
            });
          }
        }

        // CPA 急騰
        const last7Cpa = last7Cv > 0 ? last7Cost / last7Cv : 0;
        const prev7Cpa = prev7Cv > 0 ? prev7Cost / prev7Cv : 0;
        if (prev7Cpa > 0 && last7Cpa > 0) {
          const delta = (last7Cpa - prev7Cpa) / prev7Cpa;
          if (delta >= 0.2) {
            alerts.push({
              severity: 'warning',
              category: 'CPA',
              title: 'CPA が急騰',
              message: `直近 7 日の CPA が前週比 ${Math.round(delta * 100)}% 悪化しています`,
              href: '/dashboard/ad-detail',
            });
          }
        }
      }

      alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
      return { alerts: alerts.slice(0, 5), total: alerts.length };
    });

    return NextResponse.json(result.value, {
      headers: {
        'X-Cache-Fetched-At': new Date(result.fetchedAt).toISOString(),
        'X-Cache-Hit': String(result.hit),
      },
    });
  } catch (err) {
    console.error('dashboard alerts API error:', err);
    return NextResponse.json({ alerts: [], total: 0 }, { status: 200 });
  }
}
