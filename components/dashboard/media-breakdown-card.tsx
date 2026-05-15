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

import { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Layers, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataSourceTooltip } from '@/components/ui/data-source-tooltip';
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

function Sparkline({ data }: { data: { date: string; cv: number }[] }) {
  // 全部 0 のときは線が描けないので「—」を表示
  const hasAny = data.some((d) => d.cv > 0);
  if (!hasAny) {
    return <span className="text-xs text-muted-foreground/40">—</span>;
  }
  return (
    <div className="h-7 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <YAxis hide domain={[0, 'dataMax']} />
          <Line
            type="monotone"
            dataKey="cv"
            stroke="currentColor"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Row({ item }: { item: MediaBreakdownItem }) {
  const { current, cvDeltaPct } = item;
  const hasData = current.cost > 0 || current.conversions > 0;
  return (
    <tr className="border-t border-border/50">
      <td className="py-2 pr-2 text-sm">{PLATFORM_LABEL[item.platform]}</td>
      <td className="py-2 pr-2 text-sm text-muted-foreground">
        {ADTYPE_LABEL[item.adType]}
      </td>
      <td className="py-2 pr-2 text-sm tabular-nums text-right">
        {hasData ? numFormat.format(current.conversions) : '—'}
      </td>
      <td className="py-2 pr-2 text-sm tabular-nums text-right">
        {hasData ? jpyFormat.format(current.cost) : '—'}
      </td>
      <td className="py-2 pr-2 text-sm tabular-nums text-right">
        {current.cpa != null ? jpyFormat.format(current.cpa) : '—'}
      </td>
      <td className="py-2 pr-2 text-right">
        <DeltaCell delta={cvDeltaPct} />
      </td>
      <td className="py-2 pl-2 text-primary">
        <Sparkline data={item.sparkline} />
      </td>
    </tr>
  );
}

export function MediaBreakdownCard() {
  const [data, setData] = useState<MediaBreakdownResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
          媒体ブレイクダウン
          <DataSourceTooltip
            info={{
              label: '媒体ブレイクダウン',
              source: 'BigQuery (ad_manager.adm_daily_metrics × adm_campaigns)',
              filters: 'platform ∈ {google, yahoo, bing} / ad_type ∈ {search, display}',
              target:
                'CV: SUM(conversions) / cost: SUM(cost) / CPA: cost÷CV / 前週比: CV の対先週比 / spark: 14 日の CV 日次合計',
              period:
                '今週 = 月起点〜今日。先週 = 前週月曜〜前週同曜日。spark は過去 14 日',
              axis: '広告の発生日 (adm_daily_metrics.date)',
              cache: '1 時間キャッシュ',
              note: '6 行 = google/yahoo/bing × search/display。ETL 未対応の組合せは「—」',
            }}
          />
          <span className="text-xs font-normal text-muted-foreground/60">
            発生日 / 今週 (月起点) vs 先週
          </span>
          {data && (
            <span className="text-xs font-normal text-muted-foreground/60 tabular-nums ml-auto">
              {fmtRangeLabel(data.current.start)}〜{fmtRangeLabel(data.current.end)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600">取得エラー: {error}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">読み込み中…</p>
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
                  <th className="py-1 pl-2 text-left font-medium">14 日 CV 推移</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
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
