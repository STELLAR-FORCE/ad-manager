'use client';

import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { ExternalLink, Briefcase, Trophy, Percent, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DateRangeValue } from '@/components/ui/date-range-picker';
import type {
  SfPipelineRow,
  SfTrendRow,
  SfLeadSummary,
  SfOpportunitySummary,
} from '@/lib/types/salesforce';

const dateShort = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });
const numFormat = new Intl.NumberFormat('ja-JP');
const pct1Format = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const days1Format = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const KIND_COLORS = {
  open: '#6366f1',
  won: '#10b981',
  lost: '#ef4444',
} as const;

// ForecastCategoryName → 色（SFDC フォーキャスト構造に準拠）
const FORECAST_COLORS: Record<string, string> = {
  パイプライン: '#6366f1',
  最善達成予測: '#8b5cf6',
  達成予測: '#06b6d4',
  完了: '#10b981',
  売上予測から除外: '#94a3b8',
};
const FORECAST_FALLBACK = '#cbd5e1';

function forecastColor(category: string | null): string {
  if (!category) return FORECAST_FALLBACK;
  return FORECAST_COLORS[category] ?? FORECAST_FALLBACK;
}

type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

function toDateParam(d: Date): string {
  // JST → UTC 変換で前日にずれないよう、ローカルカレンダー日付を使う
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mediaColor(media: string): string {
  if (media === 'google') return '#3b82f6';
  if (media === 'yahoo') return '#ef4444';
  if (media === 'bing') return '#14b8a6';
  return '#94a3b8';
}

function SfKpiCard<T>({
  title,
  icon: Icon,
  state,
  render,
  subRender,
}: {
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  state: LoadState<T>;
  render: (data: T) => string;
  subRender?: (data: T) => string;
}) {
  const main =
    state.status === 'success'
      ? render(state.data)
      : state.status === 'loading'
        ? '…'
        : state.status === 'error'
          ? '—'
          : '—';
  const sub =
    state.status === 'success' && subRender
      ? subRender(state.data)
      : state.status === 'error'
        ? state.message
        : '';
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums tracking-tight">{main}</p>
            {sub && (
              <p className="text-xs text-muted-foreground/70 mt-1.5 truncate" title={sub}>
                {sub}
              </p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-primary/8 shrink-0">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SalesforceSection({ dateRange }: { dateRange: DateRangeValue }) {
  const [summary, setSummary] = useState<LoadState<SfOpportunitySummary>>({ status: 'idle' });
  const [pipeline, setPipeline] = useState<LoadState<SfPipelineRow[]>>({ status: 'idle' });
  const [trend, setTrend] = useState<LoadState<SfTrendRow[]>>({ status: 'idle' });
  const [leads, setLeads] = useState<LoadState<SfLeadSummary>>({ status: 'idle' });

  const startParam = useMemo(() => toDateParam(dateRange.main.start), [dateRange.main.start]);
  const endParam = useMemo(() => toDateParam(dateRange.main.end), [dateRange.main.end]);

  useEffect(() => {
    const qs = new URLSearchParams({ start: startParam, end: endParam });
    const controller = new AbortController();

    setSummary({ status: 'loading' });
    setPipeline({ status: 'loading' });
    setTrend({ status: 'loading' });
    setLeads({ status: 'loading' });

    const fetchJson = async <T,>(
      url: string,
      pick: (json: unknown) => T,
      set: (s: LoadState<T>) => void,
    ) => {
      try {
        const r = await fetch(url, { signal: controller.signal });
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        set({ status: 'success', data: pick(json) });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        set({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    };

    fetchJson<SfOpportunitySummary>(
      `/api/salesforce/summary?${qs}`,
      (j) => j as SfOpportunitySummary,
      setSummary,
    );
    fetchJson<SfPipelineRow[]>(
      `/api/salesforce/pipeline?${qs}`,
      (j) => (j as { rows: SfPipelineRow[] }).rows,
      setPipeline,
    );
    fetchJson<SfTrendRow[]>(
      `/api/salesforce/trend?${qs}`,
      (j) => (j as { rows: SfTrendRow[] }).rows,
      setTrend,
    );
    fetchJson<SfLeadSummary>(
      `/api/salesforce/leads?${qs}`,
      (j) => j as SfLeadSummary,
      setLeads,
    );

    return () => controller.abort();
  }, [startParam, endParam]);

  const trendChartData = useMemo(() => {
    if (trend.status !== 'success') return [];
    return trend.data.map((r) => ({
      date: r.date,
      label: dateShort.format(new Date(r.date)),
      新規: r.created,
      成約: r.won,
      失注: r.lost,
    }));
  }, [trend]);

  // 進行中・成約をひとまとめにし、失注は理由ごとに個別バーで表示する
  type StageBucket = {
    /** バーに表示するラベル */
    bucket: string;
    /** バーの色 */
    color: string;
    /** 件数（合計） */
    件数: number;
    /** ツールチップ表示用の内訳ステージ */
    breakdown: { stage: string; count: number }[];
  };
  const stageBarData = useMemo<StageBucket[]>(() => {
    if (pipeline.status !== 'success') return [];
    const open: StageBucket = { bucket: '進行中', color: '#6366f1', 件数: 0, breakdown: [] };
    const won: StageBucket = { bucket: '成約', color: '#10b981', 件数: 0, breakdown: [] };
    const lost: StageBucket[] = [];
    for (const r of pipeline.data) {
      if (r.kind === 'open') {
        open.件数 += r.count;
        open.breakdown.push({ stage: r.stageName, count: r.count });
      } else if (r.kind === 'won') {
        won.件数 += r.count;
        won.breakdown.push({ stage: r.stageName, count: r.count });
      } else {
        lost.push({
          bucket: r.stageName,
          color: '#ef4444',
          件数: r.count,
          breakdown: [{ stage: r.stageName, count: r.count }],
        });
      }
    }
    open.breakdown.sort((a, b) => b.count - a.count);
    won.breakdown.sort((a, b) => b.count - a.count);
    lost.sort((a, b) => b.件数 - a.件数);
    const aggregated: StageBucket[] = [];
    if (open.件数 > 0) aggregated.push(open);
    if (won.件数 > 0) aggregated.push(won);
    return [...aggregated, ...lost];
  }, [pipeline]);

  const mediaBarData = useMemo(() => {
    if (leads.status !== 'success') return [];
    return leads.data.byMedia.slice(0, 8).map((r) => ({ media: r.media, 件数: r.count }));
  }, [leads]);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">営業パイプライン 詳細</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            ステージ別 / 媒体別 / 日別のブレイクダウン
          </p>
        </div>
        <Link
          href="/salesforce"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          詳細を見る
          <ExternalLink className="size-3" aria-hidden="true" />
        </Link>
      </div>

      {/* KPI タイル */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SfKpiCard
          title="案件"
          icon={Briefcase}
          state={summary}
          render={(d) => numFormat.format(d.total) + '件'}
          subRender={(d) => `期間内に作成された案件（うち成立 ${numFormat.format(d.won)}件）`}
        />
        <SfKpiCard
          title="案件成立"
          icon={Trophy}
          state={summary}
          render={(d) => numFormat.format(d.won) + '件'}
          subRender={(d) => `失注 ${numFormat.format(d.lost)}件 / 進行中 ${numFormat.format(d.open)}件`}
        />
        <SfKpiCard
          title="Win率"
          icon={Percent}
          state={summary}
          render={(d) => (d.winRate != null ? pct1Format.format(d.winRate) : '—')}
          subRender={() => '成立 / (成立 + 失注)'}
        />
        <SfKpiCard
          title="平均リードタイム"
          icon={Clock}
          state={summary}
          render={(d) =>
            d.avgLeadTimeDays != null ? `${days1Format.format(d.avgLeadTimeDays)} 日` : '—'
          }
          subRender={() => '案件成立までの所要日数'}
        />
      </div>

      {/* 日別推移 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">商談 日別推移</CardTitle>
        </CardHeader>
        <CardContent>
          {trend.status === 'success' && trendChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} width={40} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="新規" stroke={KIND_COLORS.open} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="成約" stroke={KIND_COLORS.won} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="失注" stroke={KIND_COLORS.lost} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
              {trend.status === 'loading'
                ? '読み込み中…'
                : trend.status === 'error'
                  ? `エラー: ${trend.message}`
                  : 'データなし'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ステージ別 + 媒体別 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ステージ別件数</CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline.status === 'success' && stageBarData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={Math.max(180, stageBarData.length * 28 + 20)}>
                  <BarChart
                    data={stageBarData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="bucket"
                      tick={{ fontSize: 11 }}
                      width={140}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as (typeof stageBarData)[number];
                        const showBreakdown = d.breakdown.length > 1;
                        return (
                          <div className="rounded-lg border border-border bg-background shadow-md p-3 text-xs space-y-1.5 min-w-[180px]">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: d.color }}
                              />
                              <span className="font-medium text-foreground">{d.bucket}</span>
                              <span className="ml-auto tabular-nums font-semibold">
                                {numFormat.format(d.件数)}件
                              </span>
                            </div>
                            {showBreakdown && (
                              <div className="pt-1 border-t border-border/50 space-y-0.5">
                                {d.breakdown.map((b) => (
                                  <div key={b.stage} className="flex justify-between gap-4 text-muted-foreground">
                                    <span className="truncate">{b.stage}</span>
                                    <span className="tabular-nums shrink-0">{numFormat.format(b.count)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="件数" radius={[0, 4, 4, 0]}>
                      {stageBarData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6366f1' }} aria-hidden="true" />
                    進行中
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10b981' }} aria-hidden="true" />
                    成約
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444' }} aria-hidden="true" />
                    失注（理由別）
                  </span>
                </div>
              </>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                {pipeline.status === 'loading'
                  ? '読み込み中…'
                  : pipeline.status === 'error'
                    ? `エラー: ${pipeline.message}`
                    : 'データなし'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">媒体別リード件数</CardTitle>
          </CardHeader>
          <CardContent>
            {leads.status === 'success' && mediaBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={mediaBarData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="media"
                    tick={{ fontSize: 11 }}
                    width={120}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="件数" radius={[0, 4, 4, 0]}>
                    {mediaBarData.map((d, i) => (
                      <Cell key={i} fill={mediaColor(d.media)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                {leads.status === 'loading'
                  ? '読み込み中…'
                  : leads.status === 'error'
                    ? `エラー: ${leads.message}`
                    : 'データなし'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
