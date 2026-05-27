'use client';

/**
 * 統合アラートセンター (Issue #123)
 *
 * ダッシュボード横断の「要注意」をヘッダーのベル + Popover で表示する。
 * 各アラートはクリックで該当ページに遷移。データは /api/dashboard/alerts から。
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { DashboardAlert, AlertSeverity } from '@/app/api/dashboard/alerts/route';

const SEVERITY_ICON: Record<AlertSeverity, typeof AlertTriangle> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  critical: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

export function AlertCenter() {
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dashboard/alerts', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        setAlerts(Array.isArray(d.alerts) ? d.alerts : []);
        setTotal(Number(d.total ?? 0));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    return () => controller.abort();
  }, []);

  const hasCritical = alerts.some((a) => a.severity === 'critical');

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`アラート${total > 0 ? ` ${total} 件` : ''}`}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {total > 0 && (
          <span
            className={cn(
              'absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums text-white',
              hasCritical ? 'bg-red-500' : 'bg-amber-500',
            )}
          >
            {total}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium">アラート</p>
          {total > 0 && <span className="text-xs text-muted-foreground">{total} 件</span>}
        </div>
        {alerts.length > 0 ? (
          <div className="divide-y divide-border">
            {alerts.map((a, i) => {
              const Icon = SEVERITY_ICON[a.severity];
              return (
                <Link
                  key={i}
                  href={a.href}
                  className="flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <Icon
                    className={cn('mt-0.5 h-4 w-4 shrink-0', SEVERITY_COLOR[a.severity])}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        {a.category}
                      </span>
                      <span className="font-medium text-foreground truncate">{a.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.message}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {loaded ? '現在アラートはありません' : '読み込み中…'}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
