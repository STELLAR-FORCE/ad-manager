'use client';

import { cn } from '@/lib/utils';

export type TrendMode = 'daily' | 'cumulative';

export function TrendModeToggle({
  mode,
  onChange,
}: {
  mode: TrendMode;
  onChange: (m: TrendMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="トレンド表示モード"
      className="inline-flex items-center rounded-md border border-border bg-background p-0.5 text-xs font-normal"
    >
      {(['daily', 'cumulative'] as const).map((m) => {
        const active = mode === m;
        const label = m === 'daily' ? '日別' : '累積';
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(m)}
            className={cn(
              'px-2.5 py-0.5 rounded transition-colors motion-reduce:transition-none',
              active
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
