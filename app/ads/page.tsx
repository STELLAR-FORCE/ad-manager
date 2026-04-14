'use client';

import { useMemo, useState } from 'react';
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
import { ChevronUp, ChevronDown, ChevronsUpDown, InfoIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ADS,
  CAMPAIGNS,
  getCampaignMap,
  getAdGroupMap,
  type AdData,
  type Platform,
  type AdType,
} from '@/lib/campaign-mock-data';

// ─── 定数・フォーマット ──────────────────────────────────────────

const PLATFORM_CONFIG = {
  google: { label: 'Google',  className: 'bg-blue-100 text-blue-700' },
  yahoo:  { label: 'Yahoo!',  className: 'bg-red-100 text-red-700' },
  bing:   { label: 'Bing',    className: 'bg-teal-100 text-teal-700' },
} as const;

const fmtInt = new Intl.NumberFormat('ja-JP');
const fmtJpy = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SortKey =
  | 'name'
  | 'campaignName'
  | 'adGroupName'
  | 'impressions'
  | 'clicks'
  | 'ctr'
  | 'cost'
  | 'cpc'
  | 'conversions'
  | 'cpa';

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

// ─── 拡張型（親情報付き） ──────────────────────────────────────

type AdWithContext = AdData & {
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  platform: Platform;
  adType: AdType;
};

// ─── ページ ──────────────────────────────────────────────────────

export default function AdsListPage() {
  const campaignMap = useMemo(() => getCampaignMap(), []);
  const adGroupMap = useMemo(() => getAdGroupMap(), []);

  // 全広告に親情報を付与
  const allAds: AdWithContext[] = useMemo(() => {
    return ADS.map((ad) => {
      const ag = adGroupMap.get(ad.adGroupId);
      const campaign = ag ? campaignMap.get(ag.campaignId) : undefined;
      return {
        ...ad,
        campaignId: campaign?.id ?? '',
        campaignName: campaign?.name ?? '',
        adGroupName: ag?.name ?? '',
        platform: campaign?.platform ?? 'google',
        adType: campaign?.adType ?? 'search',
      };
    });
  }, [campaignMap, adGroupMap]);

  // フィルター
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [adTypeFilter, setAdTypeFilter] = useState<AdType | 'all'>('all');

  // ソート
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

  // フィルター＋ソート
  const filtered = useMemo(() => {
    let result = allAds.filter((ad) => {
      if (platformFilter !== 'all' && ad.platform !== platformFilter) return false;
      if (adTypeFilter !== 'all' && ad.adType !== adTypeFilter) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sort.col === 'name') {
        return sort.dir === 'asc'
          ? a.name.localeCompare(b.name, 'ja')
          : b.name.localeCompare(a.name, 'ja');
      }
      if (sort.col === 'campaignName') {
        return sort.dir === 'asc'
          ? a.campaignName.localeCompare(b.campaignName, 'ja')
          : b.campaignName.localeCompare(a.campaignName, 'ja');
      }
      if (sort.col === 'adGroupName') {
        return sort.dir === 'asc'
          ? a.adGroupName.localeCompare(b.adGroupName, 'ja')
          : b.adGroupName.localeCompare(a.adGroupName, 'ja');
      }
      const av = (a[sort.col as keyof AdData] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      const bv = (b[sort.col as keyof AdData] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      return sort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return result;
  }, [allAds, platformFilter, adTypeFilter, sort]);

  // 合計
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const ad of filtered) {
      t.impressions += ad.impressions;
      t.clicks += ad.clicks;
      t.cost += ad.cost;
      t.conversions += ad.conversions;
    }
    return {
      ...t,
      ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
      cpc: t.clicks > 0 ? t.cost / t.clicks : 0,
      cpa: t.conversions > 0 ? t.cost / t.conversions : null,
    };
  }, [filtered]);

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* ヘッダー */}
        <div>
          <h1 className="text-2xl font-bold">広告</h1>
          <p className="text-sm text-muted-foreground mt-1">
            全キャンペーンの広告一覧 — 2026年3月
          </p>
        </div>

        {/* サンプルデータバナー */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
          <InfoIcon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>サンプルデータを表示しています。</span>
        </div>

        {/* フィルター */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as Platform | 'all')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="媒体" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての媒体</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="yahoo">Yahoo!</SelectItem>
              <SelectItem value="bing">Bing</SelectItem>
            </SelectContent>
          </Select>

          <Select value={adTypeFilter} onValueChange={(v) => setAdTypeFilter(v as AdType | 'all')}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="種別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての種別</SelectItem>
              <SelectItem value="search">検索</SelectItem>
              <SelectItem value="display">ディスプレイ</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-sm text-muted-foreground tabular-nums ml-auto">
            {fmtInt.format(filtered.length)} 広告
          </span>
        </div>

        {/* テーブル */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6 pl-4" />
                  <SortHeader col="name"          label="広告名"       sort={sort} onSort={toggleSort} className="min-w-48" />
                  <SortHeader col="campaignName"   label="キャンペーン" sort={sort} onSort={toggleSort} className="min-w-36" />
                  <SortHeader col="adGroupName"    label="広告グループ" sort={sort} onSort={toggleSort} className="min-w-36" />
                  <TableHead>媒体</TableHead>
                  <TableHead>広告種類</TableHead>
                  <SortHeader col="impressions"    label="表示回数"    sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="clicks"         label="クリック"    sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="ctr"            label="CTR"         sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cost"           label="費用"        sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpc"            label="CPC"         sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="conversions"    label="CV"          sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpa"            label="CPA"         sort={sort} onSort={toggleSort} className="text-right pr-4" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((ad) => {
                  const platformCfg = PLATFORM_CONFIG[ad.platform];
                  // 検索広告は見出し1行目を表示名に、ディスプレイは広告名
                  const displayName = ad.adType === 'search' && ad.headlines.length > 0
                    ? ad.headlines[0]
                    : ad.name;

                  return (
                    <TableRow key={ad.id} className="text-sm">
                      {/* ステータスドット */}
                      <TableCell className="pl-4">
                        <span
                          className={cn(
                            'inline-block h-2 w-2 rounded-full',
                            ad.status === 'active' ? 'bg-green-500' : 'bg-gray-400',
                          )}
                          title={ad.status === 'active' ? '有効' : '一時停止'}
                          aria-label={`ステータス: ${ad.status === 'active' ? '有効' : '一時停止'}`}
                        />
                      </TableCell>

                      {/* 広告名 */}
                      <TableCell className="font-medium max-w-xs">
                        <div className="truncate" title={displayName}>{displayName}</div>
                        {ad.adType === 'search' && ad.descriptions.length > 0 && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs" title={ad.descriptions[0]}>
                            {ad.descriptions[0]}
                          </div>
                        )}
                      </TableCell>

                      {/* キャンペーン名 */}
                      <TableCell className="max-w-[200px]">
                        <Link
                          href={`/campaigns/${ad.campaignId}`}
                          className="hover:underline text-muted-foreground text-xs"
                        >
                          <div className="truncate" title={ad.campaignName}>{ad.campaignName}</div>
                        </Link>
                      </TableCell>

                      {/* 広告グループ名 */}
                      <TableCell className="max-w-[200px]">
                        <Link
                          href={`/campaigns/${ad.campaignId}/${ad.adGroupId}`}
                          className="hover:underline text-muted-foreground text-xs"
                        >
                          <div className="truncate" title={ad.adGroupName}>{ad.adGroupName}</div>
                        </Link>
                      </TableCell>

                      {/* 媒体バッジ */}
                      <TableCell>
                        <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', platformCfg.className)}>
                          {platformCfg.label}
                        </span>
                      </TableCell>

                      {/* 広告種類 */}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {ad.adFormat}
                      </TableCell>

                      {/* 指標 */}
                      <TableCell className="text-right tabular-nums">
                        {ad.impressions > 0 ? fmtInt.format(ad.impressions) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ad.clicks > 0 ? fmtInt.format(ad.clicks) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ad.impressions > 0 ? fmtPct.format(ad.ctr) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ad.cost > 0 ? fmtJpy.format(ad.cost) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ad.clicks > 0 ? fmtJpy.format(ad.cpc) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ad.conversions > 0 ? fmtInt.format(ad.conversions) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums pr-4">
                        {ad.cpa != null ? fmtJpy.format(ad.cpa) : '—'}
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
                    合計 ({fmtInt.format(filtered.length)} 広告)
                  </TableCell>
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
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
