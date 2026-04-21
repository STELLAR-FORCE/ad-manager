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
import { ChevronUp, ChevronDown, ChevronsUpDown, InfoIcon } from 'lucide-react';
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import {
  AD_GROUPS,
  CAMPAIGNS,
  getCampaignMap,
  type AdGroupData,
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

// ─── ページ ──────────────────────────────────────────────────────

export default function AdGroupsListPage() {
  const campaignMap = useMemo(() => getCampaignMap(), []);

  // フィルター
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all');
  const [adTypeFilter, setAdTypeFilter] = useState<AdType | 'all'>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

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

  // フィルター適用済みキャンペーンリスト（キャンペーンフィルター用）
  const filteredCampaigns = useMemo(() => {
    return CAMPAIGNS.filter((c) => {
      if (platformFilter !== 'all' && c.platform !== platformFilter) return false;
      if (adTypeFilter !== 'all' && c.adType !== adTypeFilter) return false;
      return true;
    });
  }, [platformFilter, adTypeFilter]);

  // フィルター＋ソート
  const filtered = useMemo(() => {
    const campaignIds = new Set(filteredCampaigns.map((c) => c.id));

    let result = AD_GROUPS.filter((ag) => {
      if (!campaignIds.has(ag.campaignId)) return false;
      if (campaignFilter !== 'all' && ag.campaignId !== campaignFilter) return false;
      return true;
    });

    // campaignName はルックアップで取得
    const getCampaignName = (ag: AdGroupData) => campaignMap.get(ag.campaignId)?.name ?? '';

    result = [...result].sort((a, b) => {
      if (sort.col === 'name') {
        return sort.dir === 'asc'
          ? a.name.localeCompare(b.name, 'ja')
          : b.name.localeCompare(a.name, 'ja');
      }
      if (sort.col === 'campaignName') {
        const an = getCampaignName(a);
        const bn = getCampaignName(b);
        return sort.dir === 'asc'
          ? an.localeCompare(bn, 'ja')
          : bn.localeCompare(an, 'ja');
      }
      const av = (a[sort.col as keyof AdGroupData] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      const bv = (b[sort.col as keyof AdGroupData] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      return sort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return result;
  }, [filteredCampaigns, campaignFilter, campaignMap, sort]);

  // 合計
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const ag of filtered) {
      t.impressions += ag.impressions;
      t.clicks += ag.clicks;
      t.cost += ag.cost;
      t.conversions += ag.conversions;
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
          <h1 className="text-2xl font-bold">広告グループ</h1>
          <p className="text-sm text-muted-foreground mt-1">
            全キャンペーンの広告グループ一覧 — 2026年3月
          </p>
        </div>

        {/* サンプルデータバナー */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
          <InfoIcon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>サンプルデータを表示しています。</span>
        </div>

        {/* フィルター */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v as Platform | 'all'); setCampaignFilter('all'); }}>
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

          <Select value={adTypeFilter} onValueChange={(v) => { setAdTypeFilter(v as AdType | 'all'); setCampaignFilter('all'); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="種別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての種別</SelectItem>
              <SelectItem value="search">検索</SelectItem>
              <SelectItem value="display">ディスプレイ</SelectItem>
            </SelectContent>
          </Select>

          <Select value={campaignFilter} onValueChange={(v) => setCampaignFilter(v ?? 'all')}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="キャンペーン" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのキャンペーン</SelectItem>
              {filteredCampaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-sm text-muted-foreground tabular-nums ml-auto">
            {fmtInt.format(filtered.length)} 広告グループ
          </span>
        </div>

        {/* テーブル */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6 pl-4" />
                  <SortHeader col="name"          label="広告グループ名" sort={sort} onSort={toggleSort} className="min-w-44" />
                  <SortHeader col="campaignName"   label="キャンペーン"  sort={sort} onSort={toggleSort} className="min-w-40" />
                  <TableHead>媒体</TableHead>
                  <TableHead>入札戦略</TableHead>
                  <SortHeader col="impressions"    label="表示回数"     sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="clicks"         label="クリック数"   sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="ctr"            label="CTR"          sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cost"           label="費用"         sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpc"            label="平均CPC"      sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="conversions"    label="CV"           sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cvr"            label="CVR"          sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpa"            label="CPA"          sort={sort} onSort={toggleSort} className="text-right pr-4" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((ag) => {
                  const campaign = campaignMap.get(ag.campaignId);
                  const platformCfg = campaign ? PLATFORM_CONFIG[campaign.platform] : null;

                  return (
                    <TableRow key={ag.id} className="text-sm">
                      {/* ステータス */}
                      <TableCell className="pl-4">
                        <StatusChip status={ag.status} />
                      </TableCell>

                      {/* 広告グループ名（ドリルダウンリンク） */}
                      <TableCell className="font-medium max-w-xs">
                        <Link
                          href={`/campaigns/${ag.campaignId}/${ag.id}`}
                          className="hover:underline text-foreground"
                        >
                          <div className="truncate" title={ag.name}>{ag.name}</div>
                        </Link>
                      </TableCell>

                      {/* キャンペーン名 */}
                      <TableCell className="max-w-xs">
                        <Link
                          href={`/campaigns/${ag.campaignId}`}
                          className="hover:underline text-muted-foreground text-xs"
                        >
                          <div className="truncate" title={campaign?.name}>{campaign?.name ?? '—'}</div>
                        </Link>
                      </TableCell>

                      {/* 媒体バッジ */}
                      <TableCell>
                        {platformCfg && (
                          <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', platformCfg.className)}>
                            {platformCfg.label}
                          </span>
                        )}
                      </TableCell>

                      {/* 入札戦略 */}
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {ag.bidStrategy}
                        {ag.targetCpa != null && (
                          <span className="ml-1">({fmtJpy.format(ag.targetCpa)})</span>
                        )}
                      </TableCell>

                      {/* 指標 */}
                      <TableCell className="text-right tabular-nums">
                        {ag.impressions > 0 ? fmtInt.format(ag.impressions) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.clicks > 0 ? fmtInt.format(ag.clicks) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.impressions > 0 ? fmtPct.format(ag.ctr) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.cost > 0 ? fmtJpy.format(ag.cost) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.clicks > 0 ? fmtJpy.format(ag.cpc) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.conversions > 0 ? fmtInt.format(ag.conversions) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.clicks > 0 ? fmtPct.format(ag.cvr) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums pr-4">
                        {ag.cpa != null ? fmtJpy.format(ag.cpa) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>

              {/* 合計行 */}
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4" />
                  <TableCell className="font-semibold" colSpan={4}>
                    合計 ({fmtInt.format(filtered.length)} 広告グループ)
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
          </CardContent>
        </Card>
      </div>
  );
}
