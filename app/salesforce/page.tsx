'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
import type {
  SfOpportunitySummary,
  SfPipelineRow,
  SfTrendRow,
  SfLeadSummary,
} from '@/lib/types/salesforce';

const fmtInt = new Intl.NumberFormat('ja-JP');
const fmtPct = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fmtDec = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

const dateShort = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });

const TODAY = new Date();

function defaultDateRange(): DateRangeValue {
  const start = new Date(TODAY.getFullYear() - 1, TODAY.getMonth(), TODAY.getDate());
  return {
    main: { start, end: TODAY },
    compareEnabled: false,
  };
}

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const KIND_COLORS = {
  open: '#6366f1',
  won: '#10b981',
  lost: '#ef4444',
} as const;

const KIND_LABELS = {
  open: 'パイプライン',
  won: '成約',
  lost: '失注',
} as const;

type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function SalesforcePage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);
  const [summary, setSummary] = useState<LoadState<SfOpportunitySummary>>({ status: 'idle' });
  const [pipeline, setPipeline] = useState<LoadState<SfPipelineRow[]>>({ status: 'idle' });
  const [trend, setTrend] = useState<LoadState<SfTrendRow[]>>({ status: 'idle' });
  const [leads, setLeads] = useState<LoadState<SfLeadSummary>>({ status: 'idle' });

  const { start, end } = dateRange.main;
  const startParam = useMemo(() => toDateParam(start), [start]);
  const endParam = useMemo(() => toDateParam(end), [end]);

  useEffect(() => {
    const qs = new URLSearchParams({ start: startParam, end: endParam });
    const controller = new AbortController();

    setSummary({ status: 'loading' });
    setPipeline({ status: 'loading' });
    setTrend({ status: 'loading' });
    setLeads({ status: 'loading' });

    fetch(`/api/salesforce/summary?${qs}`, { signal: controller.signal })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        return json as SfOpportunitySummary;
      })
      .then((data) => setSummary({ status: 'success', data }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setSummary({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });

    fetch(`/api/salesforce/pipeline?${qs}`, { signal: controller.signal })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        return json.rows as SfPipelineRow[];
      })
      .then((data) => setPipeline({ status: 'success', data }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setPipeline({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });

    fetch(`/api/salesforce/trend?${qs}`, { signal: controller.signal })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        return json.rows as SfTrendRow[];
      })
      .then((data) => setTrend({ status: 'success', data }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setTrend({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });

    fetch(`/api/salesforce/leads?${qs}`, { signal: controller.signal })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        return json as SfLeadSummary;
      })
      .then((data) => setLeads({ status: 'success', data }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setLeads({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });

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

  const pipelineBuckets = useMemo(() => {
    if (pipeline.status !== 'success') return { open: [], won: [], lost: [] };
    const open: SfPipelineRow[] = [];
    const won: SfPipelineRow[] = [];
    const lost: SfPipelineRow[] = [];
    for (const r of pipeline.data) {
      if (r.kind === 'won') won.push(r);
      else if (r.kind === 'lost') lost.push(r);
      else open.push(r);
    }
    return { open, won, lost };
  }, [pipeline]);

  // ステージ別 bar chart 用（件数が多い順 top 12）
  const stageBarData = useMemo(() => {
    if (pipeline.status !== 'success') return [];
    return [...pipeline.data]
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map((r) => ({
        stage: r.stageName,
        件数: r.count,
        kind: r.kind,
      }));
  }, [pipeline]);

  // リード媒体別 bar chart 用
  const mediaBarData = useMemo(() => {
    if (leads.status !== 'success') return [];
    return leads.data.byMedia.slice(0, 10).map((r) => ({
      media: r.media,
      件数: r.count,
    }));
  }, [leads]);

  const mediaColor = (media: string): string => {
    if (media === 'google') return '#3b82f6';
    if (media === 'yahoo') return '#ef4444';
    if (media === 'bing') return '#14b8a6';
    return '#94a3b8';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">営業パイプライン</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Salesforce の商談データを表示（CreatedDate 基準）
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} today={TODAY} />
      </div>

      {/* KPI タイル */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {summary.status === 'loading' && (
          <div className="col-span-full text-sm text-muted-foreground">読み込み中…</div>
        )}
        {summary.status === 'error' && (
          <div className="col-span-full text-sm text-red-600">
            エラー: {summary.message}
          </div>
        )}
        {summary.status === 'success' && (
          <>
            <KpiTile label="新規商談数" value={fmtInt.format(summary.data.total)} />
            <KpiTile
              label="成約"
              value={fmtInt.format(summary.data.won)}
              hint={`進行中 ${fmtInt.format(summary.data.open)}`}
            />
            <KpiTile
              label="失注"
              value={fmtInt.format(summary.data.lost)}
              hint="失注＋キャンセル合計"
            />
            <KpiTile
              label="Win 率"
              value={summary.data.winRate != null ? fmtPct.format(summary.data.winRate) : '—'}
              hint="成約 ÷ (成約 + 失注)"
            />
            <KpiTile
              label="平均リードタイム"
              value={
                summary.data.avgLeadTimeDays != null
                  ? `${fmtDec.format(summary.data.avgLeadTimeDays)} 日`
                  : '—'
              }
              hint="成約案件のみ"
            />
          </>
        )}
      </div>

      {/* Lead KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {leads.status === 'loading' && (
          <div className="col-span-full text-sm text-muted-foreground">Lead 読み込み中…</div>
        )}
        {leads.status === 'error' && (
          <div className="col-span-full text-sm text-red-600">Lead エラー: {leads.message}</div>
        )}
        {leads.status === 'success' && (
          <>
            <KpiTile
              label="新規リード数"
              value={fmtInt.format(leads.data.total)}
              hint="sf_Lead.Field9__c（受付日時）基準。NULL は CreatedDate でフォールバック"
            />
            <KpiTile
              label="コンバージョン済"
              value={fmtInt.format(leads.data.converted)}
              hint="IsConverted = TRUE"
            />
            <KpiTile
              label="リード CV 率"
              value={
                leads.data.conversionRate != null
                  ? fmtPct.format(leads.data.conversionRate)
                  : '—'
              }
              hint="Converted ÷ Total"
            />
          </>
        )}
      </div>

      {/* トレンドチャート */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">日別推移</CardTitle>
        </CardHeader>
        <CardContent>
          {trend.status === 'loading' && (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              読み込み中…
            </div>
          )}
          {trend.status === 'error' && (
            <div className="h-64 flex items-center justify-center text-sm text-red-600">
              エラー: {trend.message}
            </div>
          )}
          {trend.status === 'success' && (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} width={48} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 500 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="新規" stroke={KIND_COLORS.open} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="成約" stroke={KIND_COLORS.won} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="失注" stroke={KIND_COLORS.lost} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ステージ別 bar chart + 媒体別 bar chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ステージ別件数（上位 12）</CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline.status === 'success' && stageBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={stageBarData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tick={{ fontSize: 11 }}
                    width={140}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="件数" radius={[0, 4, 4, 0]}>
                    {stageBarData.map((d, i) => (
                      <Cell key={i} fill={KIND_COLORS[d.kind]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                {pipeline.status === 'loading' ? '読み込み中…' : 'データなし'}
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
              <ResponsiveContainer width="100%" height={320}>
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
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                {leads.status === 'loading' ? '読み込み中…' : 'データなし'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ステージ別テーブル */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ステージ別内訳（全件）</CardTitle>
        </CardHeader>
        <CardContent>
          {pipeline.status === 'loading' && (
            <div className="text-sm text-muted-foreground">読み込み中…</div>
          )}
          {pipeline.status === 'error' && (
            <div className="text-sm text-red-600">エラー: {pipeline.message}</div>
          )}
          {pipeline.status === 'success' && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">区分</TableHead>
                    <TableHead>ステージ</TableHead>
                    <TableHead>予測カテゴリ</TableHead>
                    <TableHead className="text-right">件数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipeline.data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                        期間内にデータがありません
                      </TableCell>
                    </TableRow>
                  )}
                  {pipeline.data.map((r) => (
                    <TableRow key={r.stageName} className="text-sm">
                      <TableCell>
                        <span
                          className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${KIND_COLORS[r.kind]}1a`,
                            color: KIND_COLORS[r.kind],
                          }}
                        >
                          {KIND_LABELS[r.kind]}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{r.stageName}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {r.forecastCategory ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtInt.format(r.count)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pipeline.status === 'success' && (
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span>成約 {pipelineBuckets.won.reduce((a, r) => a + r.count, 0)} 件</span>
              <span>進行中 {pipelineBuckets.open.reduce((a, r) => a + r.count, 0)} 件</span>
              <span>失注 {pipelineBuckets.lost.reduce((a, r) => a + r.count, 0)} 件</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
