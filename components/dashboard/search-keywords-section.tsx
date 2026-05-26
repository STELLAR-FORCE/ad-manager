'use client';

/**
 * 検索キーワードセクション（Phase 3a）
 *
 * ダッシュボードに「直近の検索キーワード」を 2 カラムで表示する。
 * 左: CV つき探索語句（直近 30 日 / conversions > 0 / TOP20）
 * 右: 新規語句（直近 7 日に出現 / 過去 30 日窓に未出現 / TOP30）
 *
 * 媒体タブ（Bing / Google / Yahoo）で切り替える。
 * キラーワード（マンスリ系 / ウィークリ系 / weekly / monthly）は API 側で除外済。
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Search, Sparkles, ChevronRight } from 'lucide-react';
import type {
  SearchKeywordsResponse,
  CvKeywordItem,
  NewKeywordItem,
} from '@/app/api/dashboard/search-keywords/route';
import { DataSourceTooltip } from '@/components/ui/data-source-tooltip';

// 「キラーワード」= フレーズ一致で意図的に取りに行っているメインターゲット語群。
// デフォルトの CV あり語句リストでは折り畳んでサマリ行にし、クリックで詳細展開する。
const KILLER_REGEX =
  /(マンスリ|ﾏﾝｽﾘ|ウィークリ|ウイークリ|ｳｨｰｸﾘ|ｳｲｰｸﾘ|weekly|monthly)/i;

function isKillerTerm(term: string): boolean {
  return KILLER_REGEX.test(term);
}

const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const numFormat = new Intl.NumberFormat('ja-JP');
const dateShort = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
});

function fmtAsOf(iso: string): string {
  if (!iso) return '';
  // 'YYYY-MM-DD' を JST のままラベル化
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return dateShort.format(new Date(y, m - 1, d));
}

type Platform = 'bing' | 'google' | 'yahoo';

const PLATFORM_LABEL: Record<Platform, string> = {
  bing: 'Bing',
  google: 'Google',
  yahoo: 'Yahoo!',
};

function PlatformPanel({ platform }: { platform: Platform }) {
  const [data, setData] = useState<SearchKeywordsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    const controller = new AbortController();
    fetch(`/api/dashboard/search-keywords?platform=${platform}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        return json as SearchKeywordsResponse;
      })
      .then(setData)
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, [platform]);

  if (error) {
    return <p className="text-sm text-red-600">取得エラー: {error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">読み込み中…</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground/70">
        基準日: {fmtAsOf(data.asOf) || '—'}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CvKeywordList items={data.cvKeywords} />
        <NewKeywordList items={data.newKeywords} />
      </div>
    </div>
  );
}

function CvKeywordRow({ k }: { k: CvKeywordItem }) {
  return (
    <li className="py-1.5 flex items-baseline gap-2 text-sm">
      <p className="flex-1 min-w-0 truncate">{k.searchTerm}</p>
      <p className="text-xs text-muted-foreground/70 tabular-nums shrink-0 whitespace-nowrap">
        CV {numFormat.format(k.conversions)}
      </p>
      <p className="text-xs text-muted-foreground/70 tabular-nums shrink-0 whitespace-nowrap">
        {k.cpa != null ? `CPA ${jpyFormat.format(k.cpa)}` : '—'}
      </p>
    </li>
  );
}

function CvKeywordList({ items }: { items: CvKeywordItem[] }) {
  // キラーワードは折り畳み: 件数 / 合計 CV / 合計 cost を集約表示し、詳細はダイアログで開く
  const { mainItems, killerItems, killerTotals } = useMemo(() => {
    const main: CvKeywordItem[] = [];
    const killer: CvKeywordItem[] = [];
    for (const k of items) {
      if (isKillerTerm(k.searchTerm)) killer.push(k);
      else main.push(k);
    }
    const totals = killer.reduce(
      (acc, k) => {
        acc.cv += k.conversions;
        acc.clicks += k.clicks;
        acc.cost += k.cost;
        return acc;
      },
      { cv: 0, clicks: 0, cost: 0 },
    );
    return { mainItems: main, killerItems: killer, killerTotals: totals };
  }, [items]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Search className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">CV あり語句</h3>
        <DataSourceTooltip
          info={{
            label: 'CV あり語句',
            sources: ['ad_console'],
            source: 'BigQuery (ad_manager.adm_search_term_reports)',
            filters:
              'is_excluded=false。マンスリ/ウィークリ系も含む (1 行に折り畳み)',
            target: 'conversions > 0 の語句。conversions 降順 (TOP 500)',
            period: '直近 30 日 (asOf-29 〜 asOf)',
            axis: 'asOf = 媒体ごとの MAX(date)',
            cache: '1 時間キャッシュ',
          }}
        />
        <span className="text-[11px] text-muted-foreground/60">
          直近 30 日 / {items.length} 件
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">該当する語句がありません</p>
      ) : (
        <ul className="divide-y divide-border/50 max-h-[420px] overflow-y-auto pr-2">
          {killerItems.length > 0 && (
            <li className="py-1">
              <Dialog>
                <DialogTrigger className="w-full flex items-baseline gap-2 text-sm rounded-md hover:bg-accent/40 px-1 py-1 -mx-1 transition-colors text-left cursor-pointer">
                  <ChevronRight
                    className="h-3.5 w-3.5 text-muted-foreground/60 self-center shrink-0"
                    aria-hidden="true"
                  />
                  <span className="flex-1 min-w-0 truncate text-muted-foreground">
                    マンスリー / ウィークリー系 語句
                    <span className="text-[11px] text-muted-foreground/60 ml-1.5">
                      ({killerItems.length} 件)
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0 whitespace-nowrap">
                    CV {numFormat.format(killerTotals.cv)}
                  </span>
                  <span className="text-xs text-muted-foreground/70 tabular-nums shrink-0 whitespace-nowrap">
                    {jpyFormat.format(killerTotals.cost)}
                  </span>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                      <Search className="h-4 w-4 text-primary" aria-hidden="true" />
                      マンスリー / ウィークリー系 語句
                      <span className="text-xs font-normal text-muted-foreground/70">
                        直近 30 日 / {killerItems.length} 件 / CV{' '}
                        {numFormat.format(killerTotals.cv)} /{' '}
                        {jpyFormat.format(killerTotals.cost)}
                      </span>
                    </DialogTitle>
                  </DialogHeader>
                  <ul className="divide-y divide-border/50 max-h-[60vh] overflow-y-auto pr-2">
                    {killerItems.map((k) => (
                      <CvKeywordRow key={k.searchTerm} k={k} />
                    ))}
                  </ul>
                </DialogContent>
              </Dialog>
            </li>
          )}
          {mainItems.map((k) => (
            <CvKeywordRow key={k.searchTerm} k={k} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewKeywordList({ items }: { items: NewKeywordItem[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">新規語句</h3>
        <DataSourceTooltip
          info={{
            label: '新規語句',
            sources: ['ad_console'],
            source: 'BigQuery (ad_manager.adm_search_term_reports)',
            filters:
              'is_excluded=false + キラーワード (マンスリ/ウィークリ系) 除外',
            target:
              'clicks≥1 で直近 7 日に出現 + 過去 30 日窓 (asOf-37〜asOf-7) に未出現の語句 (TOP 30)',
            period: '直近 7 日 vs 過去 30 日窓',
            axis: 'asOf = 媒体ごとの MAX(date)',
            cache: '1 時間キャッシュ',
          }}
        />
        <span className="text-[11px] text-muted-foreground/60">
          直近 7 日 / TOP {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">新規の語句がありません</p>
      ) : (
        <ul className="divide-y divide-border/50 max-h-[420px] overflow-y-auto pr-2">
          {items.map((k) => (
            <li
              key={k.searchTerm}
              className="py-1.5 flex items-baseline gap-2 text-sm"
            >
              <p className="flex-1 min-w-0 truncate">{k.searchTerm}</p>
              <p className="text-xs text-muted-foreground/70 tabular-nums shrink-0 whitespace-nowrap">
                {numFormat.format(k.clicks)} クリック
              </p>
              <p className="text-xs text-muted-foreground/70 tabular-nums shrink-0 whitespace-nowrap">
                {jpyFormat.format(k.cost)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SearchKeywordsSection() {
  const [platform, setPlatform] = useState<Platform>('bing');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" aria-hidden="true" />
          直近の検索キーワード
          <span className="text-xs font-normal text-muted-foreground/60">
            マンスリー / ウィークリー系語句はクリックで展開
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs
          value={platform}
          onValueChange={(v) => setPlatform(v as Platform)}
          className="space-y-3"
        >
          <TabsList>
            {(['bing', 'google', 'yahoo'] as const).map((p) => (
              <TabsTrigger key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </TabsTrigger>
            ))}
          </TabsList>
          {(['bing', 'google', 'yahoo'] as const).map((p) => (
            <TabsContent key={p} value={p}>
              <PlatformPanel platform={p} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
