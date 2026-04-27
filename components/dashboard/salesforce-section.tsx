'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DateRangeValue } from '@/components/ui/date-range-picker';
import type {
  SfPipelineRow,
  SfTrendRow,
  SfLeadSummary,
} from '@/lib/types/salesforce';

const dateShort = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });

const KIND_COLORS = {
  open: '#6366f1',
  won: '#10b981',
  lost: '#ef4444',
} as const;

type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mediaColor(media: string): string {
  if (media === 'google') return '#3b82f6';
  if (media === 'yahoo') return '#ef4444';
  if (media === 'bing') return '#14b8a6';
  return '#94a3b8';
}

export function SalesforceSection({ dateRange }: { dateRange: DateRangeValue }) {
  const [pipeline, setPipeline] = useState<LoadState<SfPipelineRow[]>>({ status: 'idle' });
  const [trend, setTrend] = useState<LoadState<SfTrendRow[]>>({ status: 'idle' });
  const [leads, setLeads] = useState<LoadState<SfLeadSummary>>({ status: 'idle' });

  const startParam = useMemo(() => toDateParam(dateRange.main.start), [dateRange.main.start]);
  const endParam = useMemo(() => toDateParam(dateRange.main.end), [dateRange.main.end]);

  useEffect(() => {
    const qs = new URLSearchParams({ start: startParam, end: endParam });
    const controller = new AbortController();

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

  const stageBarData = useMemo(() => {
    if (pipeline.status !== 'success') return [];
    return [...pipeline.data]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((r) => ({ stage: r.stageName, 件数: r.count, kind: r.kind }));
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
            <CardTitle className="text-base">ステージ別件数（上位 10）</CardTitle>
          </CardHeader>
          <CardContent>
            {pipeline.status === 'success' && stageBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
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
                    width={120}
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
