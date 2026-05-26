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

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Pencil, Calculator } from 'lucide-react';
import { jpyCompact, jpyFormat, numFormat } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DataSourceTooltip } from '@/components/ui/data-source-tooltip';
import { DataSourceTags, type SourceTagKey } from '@/components/ui/data-source-tags';
import type {
  MonthlyCumulativeResponse,
  MonthlyCumulativePoint,
} from '@/app/api/dashboard/monthly-cumulative/route';
import type { CostPlanResponse } from '@/app/api/dashboard/cost-plan/route';

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
  plannedCostCum: number;
  cvTargetCum: number | null;
  cvRoomsTargetCum: number | null;
  roomDaysTargetCum: number | null;
  /** cost_plan_daily に入力があれば日次累計、無ければ月予算按分 */
  costPlanCum: number | null;
  grossProfitTargetCum: number | null;
  revenueTargetCum: number | null;
}> {
  const n = days.length;
  // 消化予定線:
  //   - cost_plan_daily に入力がある日 = その値
  //   - 入力がない日 = (monthly_budget - 入力済み合計) を空き日数で線形按分
  //   - 月予算 (monthlyTarget.cost) と cost_plan_daily 合計の大きい方を月末ゴールとする
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
  let grossProfitCum = 0;
  let revenueCum = 0;
  let plannedCostCum = 0;
  return days.map((d, i) => {
    cvCum += d.cv;
    cvRoomsCum += d.cvRooms;
    roomDaysCum += d.roomDays;
    costCum += d.cost;
    grossProfitCum += d.grossProfit;
    revenueCum += d.revenue;
    const effectivePlanForDay = d.plannedCost > 0 ? d.plannedCost : perEmptyDay;
    plannedCostCum += effectivePlanForDay;
    // 目標は月内日数で線形按分 ((i+1) / n)、整数指標は四捨五入で表示
    const ratio = (i + 1) / n;
    const proRated = (total: number | null) =>
      total == null ? null : Math.round(total * ratio);
    const costPlanCum = effectiveTotal === 0 ? null : Math.round(plannedCostCum);
    return {
      date: d.date,
      day: Number(d.date.slice(8, 10)),
      cvCum,
      cvRoomsCum,
      roomDaysCum,
      costCum,
      grossProfitCum,
      revenueCum,
      plannedCostCum,
      cvTargetCum: proRated(monthlyTarget.cv),
      cvRoomsTargetCum: proRated(monthlyTarget.cvRooms),
      roomDaysTargetCum: proRated(monthlyTarget.roomDays),
      costPlanCum,
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
  const [refreshKey, setRefreshKey] = useState(0);

  const monthOptions = useMemo(() => recentMonths(), []);

  // 消化予定保存時の再 fetch トリガー
  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1);
    window.addEventListener('cost-plan-saved', handler);
    return () => window.removeEventListener('cost-plan-saved', handler);
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    const controller = new AbortController();
    // cache-bust: refreshKey が変わったら都度新規 fetch
    const cacheBust = refreshKey > 0 ? `&_t=${refreshKey}` : '';
    fetch(`/api/dashboard/monthly-cumulative?axis=${axis}&month=${month}${cacheBust}`, {
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
  }, [axis, month, refreshKey]);

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
                sources: ['lead', 'contract', 'ad_console'],
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
            sources={['lead']}
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
            sources={['lead']}
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
            sources={['lead', 'contract']}
          />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span>消化予算</span>
                  <DataSourceTags sources={['ad_console']} />
                </span>
                <CostPlanEditButton
                  month={data!.month}
                  monthlyBudget={data!.monthlyTarget.cost}
                  onSaved={() => {
                    // 再 fetch を促す: axis/month 同じでも refresh 用に key を増やす
                    window.dispatchEvent(new CustomEvent('cost-plan-saved'));
                  }}
                />
              </CardTitle>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                広告 date ベース (軸切替の影響なし)。消化予定は cost_plan_daily を優先、未入力なら月予算 ÷ 日数の按分
              </p>
            </CardHeader>
            <CardContent>
              <CumChartBody
                data={chartData}
                actualKey="costCum"
                targetKey="costPlanCum"
                formatTick={(v) => jpyCompact.format(v)}
                formatTooltip={(v) => jpyFormat.format(v)}
                actualLabel="実績累計"
                targetLabel="消化予定"
              />
            </CardContent>
          </Card>
          <CumChart
            title="粗利"
            data={chartData}
            actualKey="grossProfitCum"
            targetKey="grossProfitTargetCum"
            formatTick={(v) => jpyCompact.format(v)}
            formatTooltip={(v) => jpyFormat.format(v)}
            actualLabel="実績累計"
            targetLabel="目標累計"
            sources={['contract']}
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
            sources={['contract']}
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
  sources?: SourceTagKey[];
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
  sources,
}: CumChartProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span>{title}</span>
          {sources && sources.length > 0 && <DataSourceTags sources={sources} />}
        </CardTitle>
        {note && <p className="text-[11px] text-muted-foreground/70 mt-1">{note}</p>}
      </CardHeader>
      <CardContent>
        <CumChartBody
          data={data}
          actualKey={actualKey}
          targetKey={targetKey}
          formatTick={formatTick}
          formatTooltip={formatTooltip}
          actualLabel={actualLabel}
          targetLabel={targetLabel}
        />
      </CardContent>
    </Card>
  );
}

type CumChartBodyProps = Omit<CumChartProps, 'title' | 'note'>;

function CumChartBody({
  data,
  actualKey,
  targetKey,
  formatTick,
  formatTooltip,
  actualLabel,
  targetLabel,
}: CumChartBodyProps) {
  return (
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
  );
}

/** 消化予定の編集ボタン (Dialog で 31 日入力) */
function CostPlanEditButton({
  month,
  monthlyBudget,
  onSaved,
}: {
  month: string;
  monthlyBudget: number | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Dialog を開いたとき現在値を fetch
  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/dashboard/cost-plan?month=${month}`);
      const json = (await res.json()) as CostPlanResponse;
      if (!res.ok) throw new Error((json as unknown as { error: string }).error ?? `HTTP ${res.status}`);
      const v: Record<string, string> = {};
      for (const d of json.days) {
        v[d.date] = d.plannedCost > 0 ? String(d.plannedCost) : '';
      }
      setValues(v);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function fillFromMonthlyBudget() {
    const dates = Object.keys(values).sort();
    if (dates.length === 0 || monthlyBudget == null || monthlyBudget <= 0) return;
    const per = Math.round(monthlyBudget / dates.length);
    const next: Record<string, string> = {};
    for (const d of dates) next[d] = String(per);
    setValues(next);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const days = Object.entries(values)
        .map(([date, vstr]) => {
          const n = Number(String(vstr).replace(/[^\d.-]/g, ''));
          return { date, plannedCost: Number.isFinite(n) ? n : 0 };
        })
        .filter((d) => d.plannedCost > 0); // 0 円は送らない (未入力扱い)
      const res = await fetch('/api/dashboard/cost-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, days }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setMessage(`${json.updated} 日分を保存しました`);
      onSaved();
      setOpen(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const dates = Object.keys(values).sort();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex items-center gap-1.5 text-xs h-7 px-2.5 rounded-md border bg-background hover:bg-muted transition-colors"
        aria-label="消化予定を編集"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        消化予定編集
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            消化予定 編集 ({month})
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 h-7 text-xs ml-2"
              onClick={fillFromMonthlyBudget}
              disabled={loading || saving || monthlyBudget == null}
              title={monthlyBudget != null ? `${jpyFormat.format(monthlyBudget)} ÷ ${dates.length} 日 で一括セット` : '月予算が未設定'}
            >
              <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
              月予算で初期化
            </Button>
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">読み込み中…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {dates.map((d) => (
              <label key={d} className="space-y-0.5 text-xs">
                <span className="text-muted-foreground tabular-nums">{Number(d.slice(8, 10))}日</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={values[d] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [d]: e.target.value }))
                    }
                    className="h-7 text-xs tabular-nums"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">円</span>
                </div>
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving ? '保存中…' : '保存'}
          </Button>
          {message && <span className="text-xs text-muted-foreground">{message}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
