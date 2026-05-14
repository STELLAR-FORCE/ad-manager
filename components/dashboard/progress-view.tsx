'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, BedDouble, Target, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProgressResponse } from '@/app/api/dashboard/progress/route';

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

const PERIOD_ORDER: PeriodKey[] = ['week', 'month', 'quarter', 'halfYear', 'year'];

const METRICS = [
  {
    key: 'grossProfit' as const,
    label: '粗利',
    icon: Wallet,
    format: (v: number) => jpyCompact.format(v),
  },
  {
    key: 'roomDays' as const,
    label: 'ルームデイズ',
    icon: BedDouble,
    format: (v: number) => numFormat.format(Math.round(v)) + ' RD',
  },
  {
    key: 'cv' as const,
    label: 'CV',
    icon: Target,
    format: (v: number) => numFormat.format(Math.round(v)) + ' 件',
  },
  {
    key: 'won' as const,
    label: '成約',
    icon: Trophy,
    format: (v: number) => numFormat.format(Math.round(v)) + ' 件',
  },
] as const;

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  const positive = delta > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] tabular-nums',
        positive ? 'text-green-600' : 'text-red-500',
      )}
    >
      {positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {positive ? '+' : ''}
      {pct1Format.format(delta)}
    </span>
  );
}

export function ProgressView() {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <CardContent className="pt-6 text-sm text-muted-foreground">
          読み込み中…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {METRICS.map(({ key, label, icon: Icon, format }) => {
        const metric = data.metrics[key];
        return (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {PERIOD_ORDER.map((pkey) => {
                const m = metric[pkey];
                const period = data.periods[pkey];
                const delta = deltaPct(m.current, m.previous);
                const achievementPct =
                  m.target != null && m.target > 0 ? m.current / m.target : null;

                return (
                  <div
                    key={pkey}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-xs text-muted-foreground w-12 shrink-0">
                      {period.label}
                    </span>
                    <span className="font-semibold tabular-nums tracking-tight w-28 shrink-0">
                      {format(m.current)}
                    </span>
                    {achievementPct != null ? (
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              achievementPct >= 1
                                ? 'bg-green-500'
                                : achievementPct >= 0.7
                                  ? 'bg-yellow-500'
                                  : 'bg-blue-500',
                            )}
                            style={{
                              width: `${Math.min(100, achievementPct * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {pct1Format.format(achievementPct)} / {format(m.target!)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0 flex items-center justify-end">
                        <DeltaBadge delta={delta} />
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
