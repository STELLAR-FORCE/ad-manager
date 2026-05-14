'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, BedDouble, Target, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProgressResponse } from '@/app/api/dashboard/progress/route';

const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const jpyCompact = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const numFormat = new Intl.NumberFormat('ja-JP');
const pct1Format = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type PeriodKey = keyof ProgressResponse['metrics']['grossProfit'];

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: '今週' },
  { key: 'month', label: '今月' },
  { key: 'quarter', label: 'Q' },
  { key: 'halfYear', label: '半期' },
  { key: 'year', label: '年次' },
];

const METRICS = [
  {
    key: 'grossProfit' as const,
    label: '粗利',
    icon: Wallet,
    format: (v: number) => jpyFormat.format(v),
    formatCompact: (v: number) => jpyCompact.format(v),
  },
  {
    key: 'roomDays' as const,
    label: 'ルームデイズ',
    icon: BedDouble,
    format: (v: number) => numFormat.format(Math.round(v)) + ' RD',
    formatCompact: (v: number) => numFormat.format(Math.round(v)) + ' RD',
  },
  {
    key: 'cv' as const,
    label: 'CV',
    icon: Target,
    format: (v: number) => numFormat.format(Math.round(v)) + ' 件',
    formatCompact: (v: number) => numFormat.format(Math.round(v)) + ' 件',
  },
  {
    key: 'won' as const,
    label: '成約',
    icon: Trophy,
    format: (v: number) => numFormat.format(Math.round(v)) + ' 件',
    formatCompact: (v: number) => numFormat.format(Math.round(v)) + ' 件',
  },
] as const;

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-xs text-muted-foreground/40">—</span>;
  const positive = delta > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs tabular-nums',
        positive ? 'text-green-600' : 'text-red-500',
      )}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? '+' : ''}
      {pct1Format.format(delta)}
    </span>
  );
}

export function ProgressView() {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PeriodKey>('month');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dashboard/progress', { signal: controller.signal })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        return json as ProgressResponse;
      })
      .then(setData)
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-red-600">
          進捗データ取得エラー: {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">読み込み中…</CardContent>
      </Card>
    );
  }

  const period = data.periods[activeTab];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-3">
          <span>進捗</span>
          <div className="flex gap-1">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'text-xs px-2 py-1 rounded-md transition-colors tabular-nums',
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardTitle>
        <p className="text-xs text-muted-foreground/70 tabular-nums mt-1">
          {period.label}: {period.start} 〜 {period.end}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {METRICS.map(({ key, label, icon: Icon, format }) => {
            const m = data.metrics[key][activeTab];
            const delta = deltaPct(m.current, m.previous);
            const achievementPct =
              m.target != null && m.target > 0 ? m.current / m.target : null;

            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className="text-lg font-bold tabular-nums tracking-tight">
                  {format(m.current)}
                </p>
                {achievementPct != null ? (
                  <>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          achievementPct >= 1
                            ? 'bg-green-500'
                            : achievementPct >= 0.7
                              ? 'bg-yellow-500'
                              : 'bg-blue-500',
                        )}
                        style={{ width: `${Math.min(100, achievementPct * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 tabular-nums">
                      {pct1Format.format(achievementPct)} / 目標 {format(m.target!)}
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <DeltaBadge delta={delta} />
                    <span className="text-[10px] text-muted-foreground/50">前期間比</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
