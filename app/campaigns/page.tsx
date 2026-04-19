'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronUp, ChevronDown, ChevronsUpDown, InfoIcon, SearchXIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { CAMPAIGNS, type CampaignData, type CampaignStatus, type Platform, type AdType } from '@/lib/campaign-mock-data';

// ─── 定数 ──────────────────────────────────────────────────────

type SortKey =
  | 'name'
  | 'dailyBudget'
  | 'optimizationScore'
  | 'impressions'
  | 'clicks'
  | 'ctr'
  | 'cost'
  | 'cpc'
  | 'conversions'
  | 'cpa';

const STATUS_CONFIG: Record<CampaignStatus, { label: string; dot: string }> = {
  active:         { label: '有効',          dot: 'bg-green-500' },
  active_limited: { label: '有効（制限付き）', dot: 'bg-yellow-400' },
  paused:         { label: '一時停止',       dot: 'bg-gray-400' },
  ended:          { label: '終了',           dot: 'bg-gray-300' },
};

const PLATFORM_CONFIG: Record<Platform, { label: string; className: string }> = {
  google: { label: 'Google',  className: 'bg-blue-100 text-blue-700' },
  yahoo:  { label: 'Yahoo!',  className: 'bg-red-100 text-red-700' },
  bing:   { label: 'Bing',    className: 'bg-teal-100 text-teal-700' },
};

// ─── フォーマット関数 ───────────────────────────────────────────

const fmtInt  = new Intl.NumberFormat('ja-JP');
const fmtJpy  = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const fmtPct  = new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatMetric(value: number, key: SortKey): string {
  if (key === 'cost' || key === 'cpc' || key === 'cpa' || key === 'dailyBudget') return fmtJpy.format(value);
  if (key === 'ctr') return fmtPct.format(value);
  return fmtInt.format(value);
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-500';
}

// ─── ソートヘッダー ────────────────────────────────────────────

function SortHeader({
  col,
  label,
  sort,
  onSort,
  className,
}: {
  col: SortKey;
  label: string;
  sort: { col: SortKey; dir: 'asc' | 'desc' };
  onSort: (col: SortKey) => void;
  className?: string;
}) {
  const isActive = sort.col === col;
  return (
    <TableHead
      className={cn('cursor-pointer select-none', className)}
      onClick={() => onSort(col)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {isActive ? (
          sort.dir === 'asc'
            ? <ChevronUp   className="h-3 w-3" aria-hidden="true" />
            : <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" aria-hidden="true" />
        )}
      </div>
    </TableHead>
  );
}

// ─── ページコンポーネント ───────────────────────────────────────

export default function CampaignsPage() {
  const [adTypeFilter, setAdTypeFilter] = useState<AdType | 'all'>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter,   setStatusFilter]   = useState<string>('all');
  const [sort, setSort] = useState<{ col: SortKey; dir: 'asc' | 'desc' }>({
    col: 'cost',
    dir: 'desc',
  });

  const toggleSort = (col: SortKey) => {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'desc' }
    );
  };

  const filtered = useMemo(() => {
    let data: CampaignData[] = CAMPAIGNS;

    if (adTypeFilter !== 'all') {
      data = data.filter((c) => c.adType === adTypeFilter);
    }
    if (platformFilter !== 'all') {
      data = data.filter((c) => c.platform === platformFilter);
    }
    if (statusFilter === 'active') {
      data = data.filter((c) => c.status === 'active' || c.status === 'active_limited');
    } else if (statusFilter !== 'all') {
      data = data.filter((c) => c.status === statusFilter);
    }

    return [...data].sort((a, b) => {
      if (sort.col === 'name') {
        return sort.dir === 'asc'
          ? a.name.localeCompare(b.name, 'ja')
          : b.name.localeCompare(a.name, 'ja');
      }
      const av = (a[sort.col] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      const bv = (b[sort.col] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
  }, [adTypeFilter, platformFilter, statusFilter, sort]);

  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const c of filtered) {
      t.impressions  += c.impressions;
      t.clicks       += c.clicks;
      t.cost         += c.cost;
      t.conversions  += c.conversions;
    }
    return {
      ...t,
      ctr: t.impressions > 0 ? t.clicks       / t.impressions : 0,
      cpc: t.clicks      > 0 ? t.cost         / t.clicks      : 0,
      cpa: t.conversions > 0 ? t.cost         / t.conversions : null,
    };
  }, [filtered]);

  return (
    <MainLayout>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        メインコンテンツへスキップ
      </a>

      <div id="main-content" className="space-y-4">
        {/* ページヘッダー */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">キャンペーン</h1>
            <p className="text-sm text-muted-foreground mt-1">
              2026年3月1日〜2026年3月31日
            </p>
          </div>
        </div>

        {/* サンプルデータバナー */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
          <InfoIcon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            サンプルデータを表示しています。API連携後に実データが反映されます。
          </span>
        </div>

        {/* フィルター */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 検索/ディスプレイ切替 */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-adtype" className="text-sm text-muted-foreground whitespace-nowrap">
              種別
            </label>
            <Select value={adTypeFilter} onValueChange={(v) => setAdTypeFilter(v as AdType | 'all')}>
              <SelectTrigger id="filter-adtype" className="h-8 w-36 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="search">検索</SelectItem>
                <SelectItem value="display">ディスプレイ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="filter-platform" className="text-sm text-muted-foreground whitespace-nowrap">
              媒体
            </label>
            <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v ?? 'all')}>
              <SelectTrigger id="filter-platform" className="h-8 w-32 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="yahoo">Yahoo!</SelectItem>
                <SelectItem value="bing">Bing</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="filter-status" className="text-sm text-muted-foreground whitespace-nowrap">
              ステータス
            </label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
              <SelectTrigger id="filter-status" className="h-8 w-36 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="active">有効</SelectItem>
                <SelectItem value="paused">一時停止</SelectItem>
                <SelectItem value="ended">終了</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {fmtInt.format(filtered.length)} 件
          </span>
        </div>

        {/* テーブル */}
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <EmptyState
                icon={SearchXIcon}
                title="該当するキャンペーンがありません"
                description="フィルター条件を変更してお試しください"
              />
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6 pl-4" />
                  <SortHeader col="name"              label="キャンペーン名"  sort={sort} onSort={toggleSort} className="min-w-52" />
                  <TableHead>媒体</TableHead>
                  <TableHead>タイプ</TableHead>
                  <TableHead>入札戦略</TableHead>
                  <SortHeader col="dailyBudget"       label="日予算"         sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="optimizationScore" label="最適化スコア"   sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="impressions"       label="表示回数"       sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="clicks"            label="クリック数"     sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="ctr"               label="CTR"            sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cost"              label="費用"           sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpc"               label="平均CPC"        sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="conversions"       label="CV"             sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpa"               label="CPA"            sort={sort} onSort={toggleSort} className="text-right pr-4" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((c) => {
                  const { dot, label: statusLabel } = STATUS_CONFIG[c.status];
                  const { label: platformLabel, className: platformClass } = PLATFORM_CONFIG[c.platform];

                  return (
                    <TableRow key={c.id} className="text-sm">
                      {/* ステータスドット */}
                      <TableCell className="pl-4">
                        <span
                          className={cn('inline-block h-2 w-2 rounded-full', dot)}
                          title={statusLabel}
                          aria-label={`ステータス: ${statusLabel}`}
                        />
                      </TableCell>

                      {/* キャンペーン名（ドリルダウンリンク） */}
                      <TableCell className="font-medium max-w-xs">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="hover:underline text-foreground"
                        >
                          <div className="truncate" title={c.name}>{c.name}</div>
                        </Link>
                        <div className="text-xs text-muted-foreground">{statusLabel}</div>
                      </TableCell>

                      {/* 媒体 */}
                      <TableCell>
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', platformClass)}>
                          {platformLabel}
                        </span>
                      </TableCell>

                      {/* タイプ */}
                      <TableCell className="text-muted-foreground">{c.type}</TableCell>

                      {/* 入札戦略 */}
                      <TableCell className="text-muted-foreground">{c.bidStrategy}</TableCell>

                      {/* 日予算 */}
                      <TableCell className="text-right tabular-nums">
                        {c.dailyBudget != null ? fmtJpy.format(c.dailyBudget) : '—'}
                      </TableCell>

                      {/* 最適化スコア */}
                      <TableCell className="text-right tabular-nums">
                        {c.optimizationScore != null ? (
                          <span className={scoreColor(c.optimizationScore)}>
                            {new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(c.optimizationScore)}%
                          </span>
                        ) : '—'}
                      </TableCell>

                      {/* 表示回数 */}
                      <TableCell className="text-right tabular-nums">
                        {c.impressions > 0 ? fmtInt.format(c.impressions) : '—'}
                      </TableCell>

                      {/* クリック数 */}
                      <TableCell className="text-right tabular-nums">
                        {c.clicks > 0 ? fmtInt.format(c.clicks) : '—'}
                      </TableCell>

                      {/* CTR */}
                      <TableCell className="text-right tabular-nums">
                        {c.impressions > 0 ? fmtPct.format(c.ctr) : '—'}
                      </TableCell>

                      {/* 費用 */}
                      <TableCell className="text-right tabular-nums">
                        {c.cost > 0 ? fmtJpy.format(c.cost) : '—'}
                      </TableCell>

                      {/* 平均CPC */}
                      <TableCell className="text-right tabular-nums">
                        {c.clicks > 0 ? fmtJpy.format(c.cpc) : '—'}
                      </TableCell>

                      {/* CV */}
                      <TableCell className="text-right tabular-nums">
                        {c.conversions > 0 ? fmtInt.format(c.conversions) : '—'}
                      </TableCell>

                      {/* CPA */}
                      <TableCell className="text-right tabular-nums pr-4">
                        {c.cpa != null ? fmtJpy.format(c.cpa) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>

              {/* 合計行 */}
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4" />
                  <TableCell className="font-semibold" colSpan={5}>
                    合計 ({fmtInt.format(filtered.length)} キャンペーン)
                  </TableCell>
                  <TableCell className="text-right tabular-nums">—</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtInt.format(totals.impressions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtInt.format(totals.clicks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {totals.impressions > 0 ? fmtPct.format(totals.ctr) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtJpy.format(totals.cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {totals.clicks > 0 ? fmtJpy.format(Math.round(totals.cpc)) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtInt.format(totals.conversions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold pr-4">
                    {totals.cpa != null ? fmtJpy.format(Math.round(totals.cpa)) : '—'}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
