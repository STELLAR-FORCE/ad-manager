'use client';

import { cn } from '@/lib/utils';
import type { MetricDef } from './metric-defs';

type KpiTileProps = {
  metric: MetricDef;
  value: number | null;
  active: boolean;
  onClick: () => void;
};

export function KpiTile({ metric, value, active, onClick }: KpiTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex flex-col items-start gap-1 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors motion-reduce:transition-none',
        active
          ? 'border-border shadow-sm'
          : 'border-border/60 hover:border-border hover:bg-muted/40',
      )}
    >
      <span className="text-[11px] font-medium text-muted-foreground">{metric.label}</span>
      <span className="text-base font-semibold tabular-nums leading-tight">
        {metric.format(value)}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-opacity motion-reduce:transition-none',
          active ? 'opacity-100' : 'opacity-0',
        )}
        style={{ backgroundColor: metric.color }}
      />
    </button>
  );
}
