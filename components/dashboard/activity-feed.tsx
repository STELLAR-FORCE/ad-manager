'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy } from 'lucide-react';
import type { ActivitiesResponse } from '@/app/api/dashboard/activities/route';

const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const dateShort = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
});

function fmtDate(iso: string): string {
  if (!iso) return '';
  return dateShort.format(new Date(iso));
}

export function ActivityFeed() {
  const [data, setData] = useState<ActivitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dashboard/activities', { signal: controller.signal })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        return json as ActivitiesResponse;
      })
      .then(setData)
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
          直近 7 日の新規成約
          {data && (
            <span className="text-xs font-normal text-muted-foreground/60 tabular-nums ml-auto">
              {data.items.length} 件
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600">取得エラー: {error}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">読み込み中…</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">直近 7 日に新規成約はありません</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {data.items.map((item) => (
              <li key={item.contractId} className="py-2 flex items-start gap-3 text-sm">
                <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0 w-10 mt-0.5">
                  {fmtDate(item.decisionDate)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {item.tenantName ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground/70 truncate">
                    {item.propertyName ?? '物件名未設定'}
                    {item.contractStart && (
                      <span className="ml-1.5">
                        / 入居 {fmtDate(item.contractStart)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground/70 tabular-nums">
                    {item.contractedRooms} 室
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {jpyFormat.format(item.grossProfit)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
