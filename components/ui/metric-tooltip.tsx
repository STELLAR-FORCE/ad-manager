'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type MetricTooltipProps = {
  label: string;
  numerator: { label: string; value: string };
  denominator: { label: string; value: string };
  children: React.ReactNode;
};

export function MetricTooltip({ label, numerator, denominator, children }: MetricTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="cursor-help outline-hidden focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="px-3 py-2">
        <div className="space-y-1 min-w-[140px]">
          <p className="text-[11px] font-semibold">{label}</p>
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="opacity-70">{numerator.label}</span>
            <span className="tabular-nums">{numerator.value}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="opacity-70">{denominator.label}</span>
            <span className="tabular-nums">{denominator.value}</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
