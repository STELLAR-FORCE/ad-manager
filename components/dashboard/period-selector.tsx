'use client';

/**
 * Issue #63 Phase 2.5 — 期間セレクタ。
 * 年 + 期種（月/Q/半期/年）+ 期 index + 前後ナビ。
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type Period,
  type PeriodType,
  nextPeriod,
  periodLabel,
  previousPeriod,
} from '@/lib/period';

const TYPE_LABELS: Record<PeriodType, string> = {
  month: '月次',
  quarter: 'クオーター',
  half: '上下半期',
  year: '年',
};

const QUARTER_LABELS = ['Q1（1-3月）', 'Q2（4-6月）', 'Q3（7-9月）', 'Q4（10-12月）'];
const HALF_LABELS = ['上半期（1-6月）', '下半期（7-12月）'];

function indexOptions(type: PeriodType): { value: number; label: string }[] {
  switch (type) {
    case 'month':
      return Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}月` }));
    case 'quarter':
      return QUARTER_LABELS.map((label, i) => ({ value: i + 1, label }));
    case 'half':
      return HALF_LABELS.map((label, i) => ({ value: i + 1, label }));
    case 'year':
      return [];
  }
}

export function PeriodSelector({
  value,
  onChange,
  yearRange,
}: {
  value: Period;
  onChange: (p: Period) => void;
  /** プルダウンに出す年のリスト。省略時は現在年±2 */
  yearRange?: number[];
}) {
  const years =
    yearRange ??
    (() => {
      const cur = new Date().getFullYear();
      return [cur - 2, cur - 1, cur, cur + 1, cur + 2];
    })();

  function setType(t: PeriodType) {
    if (t === 'year') {
      onChange({ type: 'year', year: value.year, index: 1 });
    } else {
      // 期種を変えたら index は 1 にリセット（範囲外を避ける）
      onChange({ type: t, year: value.year, index: 1 });
    }
  }

  const indexOpts = indexOptions(value.type);

  return (
    <div className="inline-flex items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(previousPeriod(value))}
        aria-label="前の期間"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>

      <Select value={String(value.year)} onValueChange={(v) => onChange({ ...value, year: Number(v) })}>
        <SelectTrigger className="w-24 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}年
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.type} onValueChange={(v) => setType(v as PeriodType)}>
        <SelectTrigger className="w-32 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(TYPE_LABELS) as [PeriodType, string][]).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {indexOpts.length > 0 && (
        <Select
          value={String(value.index)}
          onValueChange={(v) => onChange({ ...value, index: Number(v) })}
        >
          <SelectTrigger className="w-36 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {indexOpts.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(nextPeriod(value))}
        aria-label="次の期間"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <span className="ml-1 text-xs text-muted-foreground tabular-nums">{periodLabel(value)}</span>
    </div>
  );
}
