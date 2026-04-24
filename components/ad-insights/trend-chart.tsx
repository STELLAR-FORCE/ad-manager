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
import { LINE_COLORS, PLATFORM_PALETTES } from './metric-defs';
import type { TrendMode } from './trend-mode-toggle';

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
  /** 'daily'（既定）は日別値、'cumulative' は累積値で描画 */
  mode?: TrendMode;
};

const dateShort = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });

export function TrendChart({ items, dates, metric, topN = 8, mode = 'daily' }: TrendChartProps) {
  const reducedMotion = usePrefersReducedMotion();

  // クリック数上位 N 件に絞る（残りは合計して「その他」）
  // 色割り当て: 明示色 → 媒体パレット（同媒体内で循環） → LINE_COLORS フォールバック
  const ranked = useMemo(() => {
    const scored = items.map((it) => {
      const total = it.dailyTotals.reduce((acc, d) => acc + d.clicks, 0);
      return { item: it, score: total };
    });
    scored.sort((a, b) => b.score - a.score);
    const platformIndex: Record<Platform, number> = { google: 0, yahoo: 0, bing: 0 };
    return scored.slice(0, topN).map((s, idx) => {
      let color = s.item.color;
      if (!color) {
        if (s.item.platform) {
          const palette = PLATFORM_PALETTES[s.item.platform];
          color = palette[platformIndex[s.item.platform] % palette.length];
          platformIndex[s.item.platform] += 1;
        } else {
          color = LINE_COLORS[idx % LINE_COLORS.length];
        }
      }
      return { ...s.item, color };
    });
  }, [items, topN]);

  // chart data: 各日に item ごとの値を持つレコード
  // cumulative: dailyTotals を累積してから metric.compute することで、
  // 比率系メトリクス（CTR・CPC・CPA 等）も正しく累積平均になる
  const chartData = useMemo(() => {
    const cumulativeByItem = new Map<string, TrendChartItem['dailyTotals'][number]>();
    if (mode === 'cumulative') {
      for (const it of ranked) {
        cumulativeByItem.set(it.id, {
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          conversionValue: 0,
        });
      }
    }

    return dates.map((date, i) => {
      const row: Record<string, number | string | null> = { date, label: dateShort.format(new Date(date)) };
      for (const it of ranked) {
        const daily = it.dailyTotals[i];
        if (!daily) {
          row[it.id] = null;
          continue;
        }
        if (mode === 'cumulative') {
          const acc = cumulativeByItem.get(it.id)!;
          acc.impressions += daily.impressions;
          acc.clicks += daily.clicks;
          acc.cost += daily.cost;
          acc.conversions += daily.conversions;
          acc.conversionValue += daily.conversionValue;
          row[it.id] = metric.compute(acc);
        } else {
          row[it.id] = metric.compute(daily);
        }
      }
      return row;
    });
  }, [dates, ranked, metric, mode]);

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
