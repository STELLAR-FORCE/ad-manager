'use client';

/**
 * 累計推移グラフ (実績累計 + 目標/予定累計) の汎用ボディ。
 *
 * 用途:
 * - /dashboard/cv-daily の月次累計推移 (CV / CV 室数 / 消化予算 / 粗利 など)
 * - /dashboard/ad-detail の媒体カード下「日次消化予定 vs 実績」グラフ
 *
 * 実線 (青) = 実績累計、破線 (緑) = 予定/目標累計。Tooltip で差分も表示。
 */

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
import { cn } from '@/lib/utils';

export type CumChartBodyProps = {
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
  /** グラフ高さ。デフォルト 280 (媒体カード下用に小型化したい場合に 180 等を渡す) */
  height?: number;
};

export function CumChartBody({
  data,
  actualKey,
  targetKey,
  formatTick,
  formatTooltip,
  actualLabel,
  targetLabel,
  height = 280,
}: CumChartBodyProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
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
