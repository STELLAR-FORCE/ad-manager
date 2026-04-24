'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { KpiTile } from './kpi-tile';
import { METRICS, type MetricKey } from './metric-defs';
import { cn } from '@/lib/utils';

type KpiStripProps = {
  /** 表示中のタイル（順序保持） */
  tileKeys: MetricKey[];
  onTileKeysChange: (keys: MetricKey[]) => void;
  /** 選択中（チャートで表示）のメトリクス */
  selected: MetricKey;
  onSelect: (key: MetricKey) => void;
  /** 各タイルに表示するサマリー値 */
  getValue: (key: MetricKey) => number | null;
  /** 追加で選べる追加メトリクス（デフォルトタイルに無いもの） */
  availableExtras?: MetricKey[];
};

export function KpiStrip({
  tileKeys,
  onTileKeysChange,
  selected,
  onSelect,
  getValue,
  availableExtras,
}: KpiStripProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const extras = (availableExtras ?? (['ctr', 'cvr', 'cpa'] as MetricKey[])).filter(
    (k) => !tileKeys.includes(k),
  );

  function addTile(k: MetricKey) {
    onTileKeysChange([...tileKeys, k]);
    onSelect(k);
    setPopoverOpen(false);
  }

  function removeTile(k: MetricKey) {
    const next = tileKeys.filter((x) => x !== k);
    onTileKeysChange(next);
    if (selected === k && next.length > 0) onSelect(next[0]);
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {tileKeys.map((k) => {
        const metric = METRICS[k];
        const isDefault = (['impressions', 'cost', 'conversions', 'clicks', 'cpc', 'cpa'] as MetricKey[]).includes(k);
        return (
          <div key={k} className="relative group">
            <KpiTile
              metric={metric}
              value={getValue(k)}
              active={selected === k}
              onClick={() => onSelect(k)}
            />
            {!isDefault && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTile(k);
                }}
                aria-label={`${metric.label}タイルを削除`}
                className={cn(
                  'absolute top-1 right-1 p-0.5 rounded-sm text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-opacity motion-reduce:transition-none',
                )}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
      {extras.length > 0 && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            aria-label="指標を追加"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-transparent px-3 py-2.5 text-xs text-muted-foreground hover:border-border hover:bg-muted/40 transition-colors motion-reduce:transition-none"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            指標を追加
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            <ul className="text-sm">
              {extras.map((k) => {
                const m = METRICS[k];
                return (
                  <li key={k}>
                    <button
                      type="button"
                      onClick={() => addTile(k)}
                      className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted transition-colors motion-reduce:transition-none"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: m.color }}
                        aria-hidden="true"
                      />
                      <span>{m.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
