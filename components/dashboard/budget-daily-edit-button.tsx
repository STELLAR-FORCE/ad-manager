'use client';

/**
 * 日次予算の個別編集 Dialog (Issue #117 課題 F)
 *
 * 自動配分された日次予定 (cost_plan_daily_by_platform) を媒体×種別ごとに手動修正する。
 * タブ切替時にその媒体×種別の 31 日分を fetch、保存時に該当組み合わせのみ MERGE。
 */

import { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Platform = 'google' | 'yahoo' | 'bing';
type AdType = 'search' | 'display';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'google', label: 'Google' },
  { value: 'yahoo', label: 'Yahoo!' },
  { value: 'bing', label: 'Bing' },
];

const AD_TYPES: { value: AdType; label: string }[] = [
  { value: 'search', label: '検索' },
  { value: 'display', label: 'ディスプレイ' },
];

export function BudgetDailyEditButton({ month }: { month: string }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('google');
  const [adType, setAdType] = useState<AdType>('search');
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/budget-plan/daily?month=${month}&platform=${platform}&adType=${adType}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const v: Record<string, string> = {};
      for (const d of json.days as { date: string; plannedCost: number }[]) {
        v[d.date] = d.plannedCost > 0 ? String(d.plannedCost) : '';
      }
      setValues(v);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [month, platform, adType]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const days = Object.entries(values).map(([date, vstr]) => {
        const n = Number(String(vstr).replace(/[^\d.-]/g, ''));
        return { date, plannedCost: Number.isFinite(n) ? n : 0 };
      });
      const res = await fetch('/api/budget-plan/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, platform, adType, days }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setMessage(`${json.updated} 日分を保存しました`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const dates = Object.keys(values).sort();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex items-center gap-2 h-8 px-3 rounded-md border bg-background text-sm hover:bg-muted transition-colors"
        aria-label="日次予算を個別編集"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        日次予算 編集
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            日次予算 個別編集 <span className="text-muted-foreground font-normal">({month})</span>
          </DialogTitle>
        </DialogHeader>

        {/* 媒体タブ */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1" role="tablist" aria-label="媒体">
            {PLATFORMS.map((p) => (
              <button
                key={p.value}
                type="button"
                role="tab"
                aria-selected={platform === p.value}
                onClick={() => setPlatform(p.value)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-md transition-colors border',
                  platform === p.value
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'text-muted-foreground border-transparent hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="tablist" aria-label="広告種別">
            {AD_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={adType === t.value}
                onClick={() => setAdType(t.value)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-md transition-colors border',
                  adType === t.value
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'text-muted-foreground border-transparent hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">読み込み中…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {dates.map((d) => (
              <label key={d} className="space-y-0.5 text-xs">
                <span className="text-muted-foreground tabular-nums">{Number(d.slice(8, 10))}日</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={values[d] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [d]: e.target.value }))}
                    className="h-7 text-xs tabular-nums"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">円</span>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving ? '保存中…' : '保存'}
          </Button>
          {message && <span className="text-xs text-muted-foreground">{message}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
