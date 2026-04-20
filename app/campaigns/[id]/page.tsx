'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronUp, ChevronDown, ChevronsUpDown, InfoIcon } from 'lucide-react';
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import {
  getCampaign,
  getAdGroupsByCampaign,
  type AdGroupData,
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

export default function AdGroupsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const campaign = getCampaign(id);
  const adGroups = getAdGroupsByCampaign(id);
  const isSearch = campaign?.adType === 'search';

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

  const sorted = useMemo(() => {
    return [...adGroups].sort((a, b) => {
      if (sort.col === 'name') {
        return sort.dir === 'asc'
          ? a.name.localeCompare(b.name, 'ja')
          : b.name.localeCompare(a.name, 'ja');
      }
      const av = (a[sort.col] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      const bv = (b[sort.col] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
  }, [adGroups, sort]);

  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const ag of adGroups) {
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
  }, [adGroups]);

  if (!campaign) {
    return (
        <div className="p-8 text-center text-muted-foreground">キャンペーンが見つかりません</div>
    );
  }

  const platformCfg = PLATFORM_CONFIG[campaign.platform];

  return (
      <div className="space-y-4">
        {/* パンくず */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/campaigns" />}>
                キャンペーン
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{campaign.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* ヘッダー */}
        <div className="flex items-start gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', platformCfg.className)}>
                {platformCfg.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              広告グループ一覧 — {campaign.type} — 2026年3月
            </p>
          </div>
        </div>

        {/* サンプルデータバナー */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
          <InfoIcon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>サンプルデータを表示しています。</span>
        </div>

        {/* 広告グループ件数 */}
        <div className="text-sm text-muted-foreground tabular-nums">
          {fmtInt.format(adGroups.length)} 広告グループ
        </div>

        {/* テーブル */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6 pl-4" />
                  <SortHeader col="name"         label="広告グループ名" sort={sort} onSort={toggleSort} className="min-w-44" />
                  <TableHead>タイプ</TableHead>
                  <TableHead>入札戦略</TableHead>
                  {isSearch && (
                    <SortHeader col="qualityScore" label="品質スコア" sort={sort} onSort={toggleSort} className="text-right" />
                  )}
                  <SortHeader col="impressions"  label="表示回数"    sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="clicks"       label="クリック数"  sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="ctr"          label="CTR"          sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cost"         label="費用"         sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpc"          label="平均CPC"      sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="conversions"  label="CV"           sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cvr"          label="CVR"          sort={sort} onSort={toggleSort} className="text-right" />
                  <SortHeader col="cpa"          label="CPA"          sort={sort} onSort={toggleSort} className="text-right pr-4" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {sorted.map((ag) => (
                  <TableRow key={ag.id} className="text-sm">
                    {/* ステータス */}
                    <TableCell className="pl-4">
                      <StatusChip status={ag.status} />
                    </TableCell>

                    {/* 広告グループ名（ドリルダウンリンク） */}
                    <TableCell className="font-medium max-w-xs">
                      <Link
                        href={`/campaigns/${id}/${ag.id}`}
                        className="hover:underline text-foreground"
                      >
                        <div className="truncate" title={ag.name}>{ag.name}</div>
                      </Link>
                    </TableCell>

                    {/* タイプ */}
                    <TableCell className="text-muted-foreground">{ag.type}</TableCell>

                    {/* 入札戦略 */}
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {ag.bidStrategy}
                      {ag.targetCpa != null && (
                        <span className="text-xs ml-1">({fmtJpy.format(ag.targetCpa)})</span>
                      )}
                    </TableCell>

                    {/* 品質スコア（検索のみ） */}
                    {isSearch && (
                      <TableCell className="text-right tabular-nums">
                        {ag.qualityScore != null ? (
                          <span className={ag.qualityScore >= 7 ? 'text-green-600' : ag.qualityScore >= 4 ? 'text-yellow-600' : 'text-red-500'}>
                            {ag.qualityScore}/10
                          </span>
                        ) : '—'}
                      </TableCell>
                    )}

                    {/* 表示回数 */}
                    <TableCell className="text-right tabular-nums">
                      {ag.impressions > 0 ? fmtInt.format(ag.impressions) : '—'}
                    </TableCell>

                    {/* クリック数 */}
                    <TableCell className="text-right tabular-nums">
                      {ag.clicks > 0 ? fmtInt.format(ag.clicks) : '—'}
                    </TableCell>

                    {/* CTR */}
                    <TableCell className="text-right tabular-nums">
                      {ag.impressions > 0 ? fmtPct.format(ag.ctr) : '—'}
                    </TableCell>

                    {/* 費用 */}
                    <TableCell className="text-right tabular-nums">
                      {ag.cost > 0 ? fmtJpy.format(ag.cost) : '—'}
                    </TableCell>

                    {/* 平均CPC */}
                    <TableCell className="text-right tabular-nums">
                      {ag.clicks > 0 ? fmtJpy.format(ag.cpc) : '—'}
                    </TableCell>

                    {/* CV */}
                    <TableCell className="text-right tabular-nums">
                      {ag.conversions > 0 ? fmtInt.format(ag.conversions) : '—'}
                    </TableCell>

                    {/* CVR */}
                    <TableCell className="text-right tabular-nums">
                      {ag.clicks > 0 ? fmtPct.format(ag.cvr) : '—'}
                    </TableCell>

                    {/* CPA */}
                    <TableCell className="text-right tabular-nums pr-4">
                      {ag.cpa != null ? fmtJpy.format(ag.cpa) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>

              {/* 合計行 */}
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4" />
                  <TableCell className="font-semibold" colSpan={isSearch ? 4 : 3}>
                    合計 ({fmtInt.format(adGroups.length)} 広告グループ)
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
