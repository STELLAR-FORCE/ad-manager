'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Inbox } from 'lucide-react';
import type { LeadActivitiesResponse } from '@/app/api/dashboard/lead-activities/route';
import { DataSourceTooltip } from '@/components/ui/data-source-tooltip';

const numFormat = new Intl.NumberFormat('ja-JP');
const dateShort = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
});

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return dateShort.format(new Date(iso));
}

/** LP コードから日本語ラベルへ */
function lpLabel(lp: string | null): string {
  switch (lp) {
    case 'monthly-order':
      return '依頼用 LP';
    case 'express':
      return '速達 LP';
    case 'standard':
      return '標準 LP';
    case 'site':
      return '資料 DL';
    default:
      return lp ?? '';
  }
}

export function LeadActivityFeed() {
  const [data, setData] = useState<LeadActivitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dashboard/lead-activities', { signal: controller.signal })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        return json as LeadActivitiesResponse;
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
          <Inbox className="h-4 w-4 text-primary" aria-hidden="true" />
          直近 7 日の新規依頼
          <DataSourceTooltip
            info={{
              label: '直近 7 日の新規依頼',
              source: 'Salesforce (mart.salesforce_all_obj)',
              filters:
                'LP 経由のみ (流入元_LP反響 ∈ monthly-order/express/standard/site)',
              target: 'リードを 1 件として表示。希望室数・利用期間・LP 種別を併記',
              period: '受付日時 が直近 7 日',
              cache: '1 時間キャッシュ',
            }}
          />
          <span className="text-xs font-normal text-muted-foreground/60">LP 経由のみ</span>
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
          <p className="text-sm text-muted-foreground">直近 7 日に新規依頼はありません</p>
        ) : (
          <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto pr-2">
            {data.items.map((item) => (
              <li key={item.leadId} className="py-2 flex items-start gap-3 text-sm">
                <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0 w-10 mt-0.5">
                  {fmtDate(item.receivedAt)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {item.companyName ?? item.contactName ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground/70 truncate">
                    <span className="text-muted-foreground/50">
                      [{lpLabel(item.lpSource)}
                      {item.mediaSource ? ` / ${item.mediaSource}` : ''}]
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 tabular-nums mt-0.5 flex gap-2">
                    {item.useStart && (
                      <span>
                        入居予定 {fmtDate(item.useStart)}
                        {item.useEnd && ` 〜 ${fmtDate(item.useEnd)}`}
                      </span>
                    )}
                    {item.useDays > 0 && (
                      <span>利用 {numFormat.format(item.useDays)} 日</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right pr-1">
                  <p className="text-xs text-muted-foreground/70 tabular-nums">必要</p>
                  <p className="text-sm font-semibold tabular-nums whitespace-nowrap">
                    {numFormat.format(item.needRooms)} 室
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
