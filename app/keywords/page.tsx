'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
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
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import {
  KEYWORDS,
  getCampaignMap,
  getAdGroupMap,
  type KeywordData,
  type Platform,
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

function qsColor(score: number): string {
  if (score >= 7) return 'text-green-600';
  if (score >= 4) return 'text-yellow-600';
  return 'text-red-500';
}

function matchTypeBadge(matchType: string): { label: string; className: string } {
  switch (matchType) {
    case 'フレーズ一致':     return { label: 'フレーズ', className: 'bg-purple-100 text-purple-700' };
    case 'インテントマッチ': return { label: 'インテント', className: 'bg-blue-100 text-blue-700' };
    case '完全一致':         return { label: '完全', className: 'bg-green-100 text-green-700' };
    default:                 return { label: matchType, className: 'bg-gray-100 text-gray-700' };
  }
}

type SortKey =
  | 'keyword'
  | 'campaignName'
  | 'adGroupName'
  | 'impressions'
  | 'clicks'
  | 'ctr'
  | 'cost'
  | 'cpc'
  | 'conversions'
  | 'cvr'
  | 'cpa'
  | 'qualityScore';

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

type KeywordWithContext = KeywordData & {
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  platform: Platform;
};

// ─── ページ ──────────────────────────────────────────────────────

export default function KeywordsListPage() {
  const campaignMap = useMemo(() => getCampaignMap(), []);
  const adGroupMap = useMemo(() => getAdGroupMap(), []);

  // 全キーワードに親情報を付与
  const allKeywords: KeywordWithContext[] = useMemo(() => {
    return KEYWORDS.map((kw) => {
      const ag = adGroupMap.get(kw.adGroupId);
      const campaign = ag ? campaignMap.get(ag.campaignId) : undefined;
      return {
        ...kw,
        campaignId: campaign?.id ?? '',
        campaignName: campaign?.name ?? '',
        adGroupName: ag?.name ?? '',
        platform: campaign?.platform ?? 'google',
      };
    });
  }, [campaignMap, adGroupMap]);

  // フィルター
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');

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
    let result = allKeywords.filter((kw) => {
      if (platformFilter !== 'all' && kw.platform !== platformFilter) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sort.col === 'keyword') {
        return sort.dir === 'asc'
          ? a.keyword.localeCompare(b.keyword, 'ja')
          : b.keyword.localeCompare(a.keyword, 'ja');
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
      const av = (a[sort.col as keyof KeywordData] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      const bv = (b[sort.col as keyof KeywordData] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      return sort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return result;
  }, [allKeywords, platformFilter, sort]);

  // 合計
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const kw of filtered) {
      t.impressions += kw.impressions;
      t.clicks += kw.clicks;
      t.cost += kw.cost;
      t.conversions += kw.conversions;
    }
    return {
      ...t,
      ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
      cpc: t.clicks > 0 ? t.cost / t.clicks : 0,
      cvr: t.clicks > 0 ? t.conversions / t.clicks : 0,
      cpa: t.conversions > 0 ? t.cost / t.conversions : null,
    };
  }, [filtered]);

  return (
      <div className="space-y-4">
        {/* ヘッダー */}
        <div>
          <h1 className="text-2xl font-bold">キーワード</h1>
          <p className="text-sm text-muted-foreground mt-1">
            全検索キャンペーンのキーワード一覧 — 2026年3月
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

          <span className="text-sm text-muted-foreground tabular-nums ml-auto">
            {fmtInt.format(filtered.length)} キーワード
          </span>
        </div>

        {/* テーブル */}
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <EmptyState
                icon={SearchXIcon}
                title="該当するキーワードがありません"
                description="フィルター条件を変更してお試しください"
              />
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6 pl-4" />
                  <SortHeader col="keyword"        label="キーワード"   sort={sort} onSort={toggleSort} className="min-w-40" />
                  <TableHead>マッチタイプ</TableHead>
                  <SortHeader col="campaignName"    label="キャンペーン" sort={sort} onSort={toggleSort} className="min-w-36" />
                  <SortHeader col="adGroupName"     label="広告グループ" sort={sort} onSort={toggleSort} className="min-w-36" />
                  <TableHead>媒体</TableHead>
                  <SortHeader col="qualityScore"    label="品質スコア"   sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="impressions"     label="表示回数"    sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="clicks"          label="クリック"    sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="ctr"             label="CTR"         sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cost"            label="費用"        sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpc"             label="CPC"         sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="conversions"     label="CV"          sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cvr"             label="CVR"         sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpa"             label="CPA"         sort={sort} onSort={toggleSort} className="text-right pr-4" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((kw) => {
                  const mt = matchTypeBadge(kw.matchType);
                  const platformCfg = PLATFORM_CONFIG[kw.platform];

                  return (
                    <TableRow key={kw.id} className="text-sm">
                      {/* ステータス */}
                      <TableCell className="pl-4">
                        <StatusChip status={kw.status} />
                      </TableCell>

                      {/* キーワード */}
                      <TableCell className="font-medium">{kw.keyword}</TableCell>

                      {/* マッチタイプ */}
                      <TableCell>
                        <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', mt.className)}>
                          {mt.label}
                        </span>
                      </TableCell>

                      {/* キャンペーン名 */}
                      <TableCell className="max-w-[200px]">
                        <Link
                          href={`/campaigns/${kw.campaignId}`}
                          className="hover:underline text-muted-foreground text-xs"
                        >
                          <div className="truncate" title={kw.campaignName}>{kw.campaignName}</div>
                        </Link>
                      </TableCell>

                      {/* 広告グループ名 */}
                      <TableCell className="max-w-[200px]">
                        <Link
                          href={`/campaigns/${kw.campaignId}/${kw.adGroupId}`}
                          className="hover:underline text-muted-foreground text-xs"
                        >
                          <div className="truncate" title={kw.adGroupName}>{kw.adGroupName}</div>
                        </Link>
                      </TableCell>

                      {/* 媒体バッジ */}
                      <TableCell>
                        <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', platformCfg.className)}>
                          {platformCfg.label}
                        </span>
                      </TableCell>

                      {/* 品質スコア */}
                      <TableCell className="text-right tabular-nums">
                        {kw.qualityScore != null ? (
                          <span className={qsColor(kw.qualityScore)}>{kw.qualityScore}/10</span>
                        ) : '—'}
                      </TableCell>

                      {/* 指標 */}
                      <TableCell className="text-right tabular-nums">
                        {kw.impressions > 0 ? fmtInt.format(kw.impressions) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kw.clicks > 0 ? fmtInt.format(kw.clicks) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kw.impressions > 0 ? fmtPct.format(kw.ctr) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kw.cost > 0 ? fmtJpy.format(kw.cost) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kw.clicks > 0 ? fmtJpy.format(kw.cpc) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kw.conversions > 0 ? fmtInt.format(kw.conversions) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kw.clicks > 0 ? fmtPct.format(kw.cvr) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums pr-4">
                        {kw.cpa != null ? fmtJpy.format(kw.cpa) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>

              {/* 合計行 */}
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4" />
                  <TableCell className="font-semibold" colSpan={6}>
                    合計 ({fmtInt.format(filtered.length)} キーワード)
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
                  <TableCell className="text-right tabular-nums font-semibold">
                    {totals.clicks > 0 ? fmtPct.format(totals.cvr) : '—'}
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
  );
}
