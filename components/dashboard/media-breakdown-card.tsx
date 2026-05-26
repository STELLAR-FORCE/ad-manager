'use client';

/**
 * 媒体ブレイクダウンカード（Phase 3b）
 *
 * 発生日ベースで「今週 (月起点) vs 先週」の媒体 × 種別パフォーマンスを
 * 1 表で確認するためのサマリーカード。
 *
 * 列構成:
 *   媒体 / 種別 / CV / cost / CPA / 前週比 (CV) / 14 日 CV 推移 (sparkline)
 *
 * データ無しの組み合わせ (Google 全般 / display 系) は cost=0 / cv=0 で
 * API から返るので「—」表示にして「ETL 未対応」が混乱しないようにする。
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Layers, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataSourceTooltip } from '@/components/ui/data-source-tooltip';

type AdTypeFilter = 'search' | 'display' | 'all';
const AD_TYPE_TABS: { key: AdTypeFilter; label: string }[] = [
  { key: 'search', label: '検索' },
  { key: 'display', label: 'ディスプレイ' },
  { key: 'all', label: '両方' },
];
import type {
  MediaBreakdownResponse,
  MediaBreakdownItem,
} from '@/app/api/dashboard/media-breakdown/route';

const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const numFormat = new Intl.NumberFormat('ja-JP');
const pct1Format = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateShort = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
});

function fmtRangeLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return dateShort.format(new Date(y, m - 1, d));
}

const PLATFORM_LABEL: Record<MediaBreakdownItem['platform'], string> = {
  google: 'Google',
  yahoo: 'Yahoo!',
  bing: 'Bing',
};

const ADTYPE_LABEL: Record<MediaBreakdownItem['adType'], string> = {
  search: '検索',
  display: 'ディスプレイ',
};

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="text-xs text-muted-foreground/40 tabular-nums">—</span>;
  }
  const positive = delta > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs tabular-nums',
        positive ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-muted-foreground',
      )}
    >
      {positive ? (
        <TrendingUp className="h-3 w-3" aria-hidden="true" />
      ) : delta < 0 ? (
        <TrendingDown className="h-3 w-3" aria-hidden="true" />
      ) : null}
      {positive ? '+' : ''}
      {pct1Format.format(delta)}
    </span>
  );
}

function PrevLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-muted-foreground/60 tabular-nums mt-0.5">
      先週 {children}
    </p>
  );
}

function Row({ item }: { item: MediaBreakdownItem }) {
  const { current, previous, cvDeltaPct } = item;
  const hasData = current.cost > 0 || current.conversions > 0;
  const hasPrev = previous.cost > 0 || previous.conversions > 0;
  return (
    <tr className="border-t border-border/50 align-top">
      <td className="py-2 pr-2 text-sm">{PLATFORM_LABEL[item.platform]}</td>
      <td className="py-2 pr-2 text-sm text-muted-foreground">
        {ADTYPE_LABEL[item.adType]}
      </td>
      <td className="py-2 pr-2 text-sm tabular-nums text-right">
        <p>{hasData ? numFormat.format(current.conversions) : '—'}</p>
        {hasPrev && <PrevLine>{numFormat.format(previous.conversions)}</PrevLine>}
      </td>
      <td className="py-2 pr-2 text-sm tabular-nums text-right">
        <p>{hasData ? jpyFormat.format(current.cost) : '—'}</p>
        {hasPrev && <PrevLine>{jpyFormat.format(previous.cost)}</PrevLine>}
      </td>
      <td className="py-2 pr-2 text-sm tabular-nums text-right">
        <p>{current.cpa != null ? jpyFormat.format(current.cpa) : '—'}</p>
        {previous.cpa != null && <PrevLine>{jpyFormat.format(previous.cpa)}</PrevLine>}
      </td>
      <td className="py-2 pr-2 text-right">
        <DeltaCell delta={cvDeltaPct} />
      </td>
    </tr>
  );
}

export function MediaBreakdownCard() {
  const [data, setData] = useState<MediaBreakdownResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adTypeFilter, setAdTypeFilter] = useState<AdTypeFilter>('search');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dashboard/media-breakdown', { signal: controller.signal })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        return json as MediaBreakdownResponse;
      })
      .then(setData)
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, []);

  const visibleItems = useMemo(() => {
    if (!data) return [];
    if (adTypeFilter === 'all') return data.items;
    return data.items.filter((i) => i.adType === adTypeFilter);
  }, [data, adTypeFilter]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
          媒体ブレイクダウン
          <DataSourceTooltip
            info={{
              label: '媒体ブレイクダウン',
              sources: ['ad_console'],
              source: 'BigQuery (ad_manager.adm_daily_metrics × adm_campaigns)',
              filters: 'platform ∈ {google, yahoo, bing} / ad_type ∈ {search, display}',
              target:
                'CV: SUM(conversions) / cost: SUM(cost) / CPA: cost÷CV / 前週比: CV の対先週比 / 各セル下に先週分を併記',
              period: '今週 = 月起点〜今日。先週 = 前週月曜〜前週同曜日',
              axis: '広告の発生日 (adm_daily_metrics.date)',
              cache: '1 時間キャッシュ',
              note: '6 行 = google/yahoo/bing × search/display。ETL 未対応の組合せは「—」',
            }}
          />
          <span className="text-xs font-normal text-muted-foreground/60">
            発生日 / 今週 (月起点) vs 先週
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex rounded-md border bg-background p-0.5 text-xs" role="tablist" aria-label="種別フィルタ">
              {AD_TYPE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={adTypeFilter === tab.key}
                  onClick={() => setAdTypeFilter(tab.key)}
                  className={cn(
                    'px-2 py-0.5 rounded transition-colors font-normal',
                    adTypeFilter === tab.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {data && (
              <span className="text-xs font-normal text-muted-foreground/60 tabular-nums">
                {fmtRangeLabel(data.current.start)}〜{fmtRangeLabel(data.current.end)}
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600">取得エラー: {error}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">読み込み中…</p>
        ) : visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">該当データがありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-muted-foreground/70 uppercase tracking-wide">
                  <th className="py-1 pr-2 text-left font-medium">媒体</th>
                  <th className="py-1 pr-2 text-left font-medium">種別</th>
                  <th className="py-1 pr-2 text-right font-medium">CV</th>
                  <th className="py-1 pr-2 text-right font-medium">cost</th>
                  <th className="py-1 pr-2 text-right font-medium">CPA</th>
                  <th className="py-1 pr-2 text-right font-medium">前週比 (CV)</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <Row key={`${item.platform}:${item.adType}`} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
