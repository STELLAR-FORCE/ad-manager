'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { PLATFORM_CONFIG, type Platform } from '@/lib/campaign-mock-data';
import type { MetricDef } from './metric-defs';
import { LINE_COLORS } from './metric-defs';

export type TrendChartItem = {
  id: string;
  name: string;
  /** 色を外部指定したい場合（例: 媒体系統カラー）。未指定なら LINE_COLORS で循環 */
  color?: string;
  /** 媒体（ツールチップにバッジ表示） */
  platform?: Platform;
  dailyTotals: {
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
  }[];
};

type TrendChartProps = {
  items: TrendChartItem[];
  dates: string[];
  metric: MetricDef;
  topN?: number;
};

const dateShort = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });

export function TrendChart({ items, dates, metric, topN = 8 }: TrendChartProps) {
  const reducedMotion = usePrefersReducedMotion();

  // クリック数上位 N 件に絞る（残りは合計して「その他」）
  const ranked = useMemo(() => {
    const scored = items.map((it) => {
      const total = it.dailyTotals.reduce((acc, d) => acc + d.clicks, 0);
      return { item: it, score: total };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map((s, idx) => ({
      ...s.item,
      color: s.item.color ?? LINE_COLORS[idx % LINE_COLORS.length],
    }));
  }, [items, topN]);

  // chart data: 各日に item ごとの値を持つレコード
  const chartData = useMemo(() => {
    return dates.map((date, i) => {
      const row: Record<string, number | string | null> = { date, label: dateShort.format(new Date(date)) };
      for (const it of ranked) {
        const daily = it.dailyTotals[i];
        row[it.id] = daily ? metric.compute(daily) : null;
      }
      return row;
    });
  }, [dates, ranked, metric]);

  if (items.length === 0 || dates.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        表示するデータがありません
      </div>
    );
  }

  const axisFmt = metric.axisFormat ?? ((v: number) => new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 0 }).format(v));

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => axisFmt(v)}
            width={64}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const rows = ranked
                .map((it) => {
                  const pl = payload.find((p) => p.dataKey === it.id);
                  return {
                    id: it.id,
                    name: it.name,
                    color: it.color,
                    platform: it.platform,
                    value: pl?.value as number | null | undefined,
                  };
                })
                .filter((r) => r.value != null);
              if (rows.length === 0) return null;
              return (
                <div className="rounded-lg border border-border bg-background shadow-md p-3 text-xs space-y-1.5 min-w-[240px] max-w-sm">
                  <p className="font-medium text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{metric.label}</p>
                  {rows.map((r) => {
                    const platformCfg = r.platform ? PLATFORM_CONFIG[r.platform] : null;
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                          {platformCfg && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${platformCfg.className}`}>
                              {platformCfg.label}
                            </span>
                          )}
                          <span className="text-muted-foreground truncate" title={r.name}>{r.name}</span>
                        </span>
                        <span className="tabular-nums shrink-0">{metric.format(r.value ?? null)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          {ranked.map((it) => (
            <Line
              key={it.id}
              type="monotone"
              dataKey={it.id}
              name={it.name}
              stroke={it.color}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={!reducedMotion}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {items.length > ranked.length && (
        <p className="text-[11px] text-muted-foreground text-right mt-1">
          上位 {ranked.length} 件を表示（全 {items.length} 件）
        </p>
      )}
    </div>
  );
}
