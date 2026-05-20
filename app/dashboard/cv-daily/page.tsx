'use client';

/**
 * 月次累計推移
 *
 * 指定月（デフォルト今月）の日次データを「累計（実績）」と「目標累計（破線）」で
 * グラフ表示する。CV / CV 室数 / ルームデイズ / 消化予算 / 粗利 / 売上 の 6 指標を
 * 2 列で表示。軸 (発生日 / 入居日) と 月セレクタで切り替え可能。
 *
 * URL は /dashboard/cv-daily のまま（サイドバーのラベルは「月次累計推移」）。
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { jpyCompact, jpyFormat, numFormat } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DataSourceTooltip } from '@/components/ui/data-source-tooltip';
import type {
  MonthlyCumulativeResponse,
  MonthlyCumulativePoint,
} from '@/app/api/dashboard/monthly-cumulative/route';

type Axis = 'movein' | 'received';
const AXIS_TABS: { key: Axis; label: string; hint: string }[] = [
  { key: 'received', label: '発生日', hint: '受付日時 が期間内で集計' },
  { key: 'movein', label: '入居日', hint: '利用期間_始期 が期間内で集計' },
];

/** 直近 12 ヶ月の YYYY-MM 文字列を返す（最新が先頭） */
function recentMonths(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: `${d.getFullYear()}年${d.getMonth() + 1}月` });
  }
  return out;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 日次データから累計を計算し、月目標も日数で按分した目標累計を作る */
function buildCumulative(
  days: MonthlyCumulativePoint[],
  monthlyTarget: {
    cv: number | null;
    cvRooms: number | null;
    roomDays: number | null;
    cost: number | null;
    grossProfit: number | null;
    revenue: number | null;
  },
): Array<{
  date: string;
  day: number;
  cvCum: number;
  cvRoomsCum: number;
  roomDaysCum: number;
  costCum: number;
  grossProfitCum: number;
  revenueCum: number;
  cvTargetCum: number | null;
  cvRoomsTargetCum: number | null;
  roomDaysTargetCum: number | null;
  costTargetCum: number | null;
  grossProfitTargetCum: number | null;
  revenueTargetCum: number | null;
}> {
  const n = days.length;
  let cvCum = 0;
  let cvRoomsCum = 0;
  let roomDaysCum = 0;
  let costCum = 0;
  let grossProfitCum = 0;
  let revenueCum = 0;
  return days.map((d, i) => {
    cvCum += d.cv;
    cvRoomsCum += d.cvRooms;
    roomDaysCum += d.roomDays;
    costCum += d.cost;
    grossProfitCum += d.grossProfit;
    revenueCum += d.revenue;
    // 目標は月内日数で線形按分 ((i+1) / n)、整数指標は四捨五入で表示
    const ratio = (i + 1) / n;
    const proRated = (total: number | null) =>
      total == null ? null : Math.round(total * ratio);
    return {
      date: d.date,
      day: Number(d.date.slice(8, 10)),
      cvCum,
      cvRoomsCum,
      roomDaysCum,
      costCum,
      grossProfitCum,
      revenueCum,
      cvTargetCum: proRated(monthlyTarget.cv),
      cvRoomsTargetCum: proRated(monthlyTarget.cvRooms),
      roomDaysTargetCum: proRated(monthlyTarget.roomDays),
      costTargetCum: proRated(monthlyTarget.cost),
      grossProfitTargetCum: proRated(monthlyTarget.grossProfit),
      revenueTargetCum: proRated(monthlyTarget.revenue),
    };
  });
}

export default function MonthlyCumulativePage() {
  const [data, setData] = useState<MonthlyCumulativeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [axis, setAxis] = useState<Axis>('received');
  const [month, setMonth] = useState<string>(thisMonth());

  const monthOptions = useMemo(() => recentMonths(), []);

  useEffect(() => {
    setData(null);
    setError(null);
    const controller = new AbortController();
    fetch(`/api/dashboard/monthly-cumulative?axis=${axis}&month=${month}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        return json as MonthlyCumulativeResponse;
      })
      .then(setData)
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, [axis, month]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return buildCumulative(data.days, data.monthlyTarget);
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            月次累計推移
            <DataSourceTooltip
              info={{
                label: '月次累計推移',
                source:
                  'Salesforce (mart.salesforce_all_obj) + BigQuery (ad_manager.adm_daily_metrics) + dashboard.targets_monthly',
                filters: 'LP 経由のみ (流入元_LP反響 ∈ monthly-order/express/standard/site)',
                target:
                  'CV: リード件数 / CV室数: 必要戸数_数値 SUM / 消化予算: 広告 cost SUM。各日まで累計、目標は月目標を日数按分',
                period: `${month} の 1 日〜月末`,
                axis: axis === 'received' ? '受付日時 (発生日)' : '利用期間_始期 (入居日)',
                cache: '1 時間キャッシュ',
                note: '消化予算は広告 date ベース集計のため軸切替の影響を受けない',
              }}
            />
          </h1>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            実線が実績累計 / 破線が目標累計。月セレクタで対象月を切り替え可能。
          </p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 px-3 rounded-md border bg-background text-sm tabular-nums"
          aria-label="対象月"
        >
          {monthOptions.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="flex gap-1" role="tablist" aria-label="集計軸">
          {AXIS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={axis === tab.key}
              title={tab.hint}
              onClick={() => setAxis(tab.key)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md transition-colors',
                axis === tab.key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-red-600">取得エラー: {error}</CardContent>
        </Card>
      ) : !data ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">読み込み中…</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CumChart
            title="CV 数"
            data={chartData}
            actualKey="cvCum"
            targetKey="cvTargetCum"
            formatTick={(v) => numFormat.format(v)}
            formatTooltip={(v) => `${numFormat.format(v)} 件`}
            actualLabel="実績累計"
            targetLabel="目標累計"
          />
          <CumChart
            title="CV 室数"
            data={chartData}
            actualKey="cvRoomsCum"
            targetKey="cvRoomsTargetCum"
            formatTick={(v) => numFormat.format(v)}
            formatTooltip={(v) => `${numFormat.format(v)} 室`}
            actualLabel="実績累計"
            targetLabel="目標累計"
          />
          <CumChart
            title="ルームデイズ"
            data={chartData}
            actualKey="roomDaysCum"
            targetKey="roomDaysTargetCum"
            formatTick={(v) => numFormat.format(v)}
            formatTooltip={(v) => `${numFormat.format(v)} RD`}
            actualLabel="実績累計"
            targetLabel="目標累計"
          />
          <CumChart
            title="消化予算"
            data={chartData}
            actualKey="costCum"
            targetKey="costTargetCum"
            formatTick={(v) => jpyCompact.format(v)}
            formatTooltip={(v) => jpyFormat.format(v)}
            actualLabel="実績累計"
            targetLabel="消化予定"
            note="広告 date ベース (軸切替の影響なし)。消化予定 = adm_campaigns.monthly_budget の合計を日数按分"
          />
          <CumChart
            title="粗利"
            data={chartData}
            actualKey="grossProfitCum"
            targetKey="grossProfitTargetCum"
            formatTick={(v) => jpyCompact.format(v)}
            formatTooltip={(v) => jpyFormat.format(v)}
            actualLabel="実績累計"
            targetLabel="目標累計"
          />
          <CumChart
            title="売上"
            data={chartData}
            actualKey="revenueCum"
            targetKey="revenueTargetCum"
            formatTick={(v) => jpyCompact.format(v)}
            formatTooltip={(v) => jpyFormat.format(v)}
            actualLabel="実績累計"
            targetLabel="目標累計"
          />
        </div>
      )}
    </div>
  );
}

type CumChartProps = {
  title: string;
  data: Array<{
    day: number;
    [k: string]: number | string | null;
  }>;
  actualKey: string;
  targetKey: string | null;
  formatTick: (v: number) => string;
  formatTooltip: (v: number) => string;
  actualLabel: string;
  targetLabel: string;
  note?: string;
};

function CumChart({
  title,
  data,
  actualKey,
  targetKey,
  formatTick,
  formatTooltip,
  actualLabel,
  targetLabel,
  note,
}: CumChartProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {note && <p className="text-[11px] text-muted-foreground/70 mt-1">{note}</p>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(d) => `${d}日`}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              width={64}
              tickFormatter={formatTick}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, number | string | null>;
                const actualRaw = row[actualKey];
                const targetRaw = targetKey ? row[targetKey] : null;
                const actual = typeof actualRaw === 'number' ? actualRaw : null;
                const target = typeof targetRaw === 'number' ? targetRaw : null;
                const diff = actual != null && target != null ? actual - target : null;
                return (
                  <div className="rounded-lg border border-border bg-background shadow-md p-2.5 text-xs space-y-1 min-w-[160px]">
                    <div className="font-medium text-foreground">{label}日</div>
                    {actual != null && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6366f1' }} aria-hidden="true" />
                          {actualLabel}
                        </span>
                        <span className="tabular-nums font-semibold">{formatTooltip(actual)}</span>
                      </div>
                    )}
                    {target != null && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }} aria-hidden="true" />
                          {targetLabel}
                        </span>
                        <span className="tabular-nums">{formatTooltip(target)}</span>
                      </div>
                    )}
                    {diff != null && (
                      <div className="pt-1 mt-1 border-t border-border/50 flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">差分</span>
                        <span
                          className={cn(
                            'tabular-nums font-semibold',
                            diff >= 0 ? 'text-green-600' : 'text-red-500',
                          )}
                        >
                          {diff >= 0 ? '+' : ''}
                          {formatTooltip(diff)}
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                            ({diff >= 0 ? '達成' : 'ショート'})
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey={actualKey}
              name={actualLabel}
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
            {targetKey && (
              <Line
                type="monotone"
                dataKey={targetKey}
                name={targetLabel}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
