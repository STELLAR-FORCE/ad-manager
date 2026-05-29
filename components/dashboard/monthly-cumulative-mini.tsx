'use client';

/**
 * ダッシュボードトップに横並び 4 つの小型累計グラフを表示するセクション。
 *
 * 4 指標: CV 数 / CV 室数 / ルームデイズ / 消化予算 (旧 /dashboard/cv-daily ページから移行)
 * 軸 (入居日 / 発生日) と 月 をセレクタで切替可能。
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CumChartBody } from '@/components/dashboard/cum-chart-body';
import { jpyCompact, jpyFormat, numFormat } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  MonthlyCumulativeResponse,
  MonthlyCumulativePoint,
} from '@/app/api/dashboard/monthly-cumulative/route';

type Axis = 'movein' | 'received';

const AXIS_TABS: { key: Axis; label: string; hint: string }[] = [
  { key: 'received', label: '発生日', hint: '受付日時 が期間内' },
  { key: 'movein', label: '入居日', hint: '利用期間_始期 が期間内' },
];

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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

type ChartRow = {
  day: number;
  cvCum: number;
  cvRoomsCum: number;
  roomDaysCum: number;
  costCum: number;
  cvTargetCum: number | null;
  cvRoomsTargetCum: number | null;
  roomDaysTargetCum: number | null;
  costPlanCum: number | null;
};

function buildCumulative(
  days: MonthlyCumulativePoint[],
  monthlyTarget: MonthlyCumulativeResponse['monthlyTarget'],
): ChartRow[] {
  const n = days.length;
  const totalPlanned = days.reduce((s, d) => s + d.plannedCost, 0);
  const monthlyBudget = monthlyTarget.cost ?? 0;
  const effectiveTotal = Math.max(monthlyBudget, totalPlanned);
  const filledDays = days.reduce((s, d) => s + (d.plannedCost > 0 ? 1 : 0), 0);
  const emptyDays = n - filledDays;
  const remainingBudget = Math.max(0, effectiveTotal - totalPlanned);
  const perEmptyDay = emptyDays > 0 ? remainingBudget / emptyDays : 0;

  let cvCum = 0;
  let cvRoomsCum = 0;
  let roomDaysCum = 0;
  let costCum = 0;
  let plannedCostCum = 0;
  return days.map((d, i) => {
    cvCum += d.cv;
    cvRoomsCum += d.cvRooms;
    roomDaysCum += d.roomDays;
    costCum += d.cost;
    const effectivePlan = d.plannedCost > 0 ? d.plannedCost : perEmptyDay;
    plannedCostCum += effectivePlan;
    const ratio = (i + 1) / n;
    const proRated = (total: number | null) => (total == null ? null : Math.round(total * ratio));
    return {
      day: Number(d.date.slice(8, 10)),
      cvCum,
      cvRoomsCum,
      roomDaysCum,
      costCum,
      cvTargetCum: proRated(monthlyTarget.cv),
      cvRoomsTargetCum: proRated(monthlyTarget.cvRooms),
      roomDaysTargetCum: proRated(monthlyTarget.roomDays),
      costPlanCum: effectiveTotal === 0 ? null : Math.round(plannedCostCum),
    };
  });
}

const CHART_HEIGHT = 180;

export function MonthlyCumulativeMini() {
  const [axis, setAxis] = useState<Axis>('received');
  const [month, setMonth] = useState<string>(thisMonth());
  const monthOptions = useMemo(() => recentMonths(), []);
  const [data, setData] = useState<MonthlyCumulativeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-red-600">取得エラー: {error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* 軸 + 月 セレクタ */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">月次累計推移</span>
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
                'text-xs px-2.5 py-1 rounded-md transition-colors',
                axis === tab.key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-7 px-2 rounded-md border bg-background text-xs tabular-nums"
          aria-label="対象月"
        >
          {monthOptions.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MiniChartCard
        title="CV 数"
        data={chartData}
        loading={!data}
        actualKey="cvCum"
        targetKey="cvTargetCum"
        formatTick={(v) => numFormat.format(v)}
        formatTooltip={(v) => `${numFormat.format(v)} 件`}
      />
      <MiniChartCard
        title="CV 室数"
        data={chartData}
        loading={!data}
        actualKey="cvRoomsCum"
        targetKey="cvRoomsTargetCum"
        formatTick={(v) => numFormat.format(v)}
        formatTooltip={(v) => `${numFormat.format(v)} 室`}
      />
      <MiniChartCard
        title="ルームデイズ"
        data={chartData}
        loading={!data}
        actualKey="roomDaysCum"
        targetKey="roomDaysTargetCum"
        formatTick={(v) => numFormat.format(v)}
        formatTooltip={(v) => `${numFormat.format(v)} 日`}
      />
      <MiniChartCard
        title="消化予算"
        data={chartData}
        loading={!data}
        actualKey="costCum"
        targetKey="costPlanCum"
        formatTick={(v) => jpyCompact.format(v)}
        formatTooltip={(v) => jpyFormat.format(v)}
        targetLabel="消化予定"
      />
      </div>
    </div>
  );
}

function MiniChartCard({
  title,
  data,
  loading,
  actualKey,
  targetKey,
  formatTick,
  formatTooltip,
  targetLabel = '目標累計',
}: {
  title: string;
  data: ChartRow[];
  loading: boolean;
  actualKey: string;
  targetKey: string;
  formatTick: (v: number) => string;
  formatTooltip: (v: number) => string;
  targetLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        {loading ? (
          <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
            読み込み中…
          </div>
        ) : (
          <CumChartBody
            data={data}
            actualKey={actualKey}
            targetKey={targetKey}
            formatTick={formatTick}
            formatTooltip={formatTooltip}
            actualLabel="実績累計"
            targetLabel={targetLabel}
            height={CHART_HEIGHT}
          />
        )}
      </CardContent>
    </Card>
  );
}
