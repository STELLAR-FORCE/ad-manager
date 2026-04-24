'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
import { cn } from '@/lib/utils';
import {
  getCampaign,
  getAdGroupsByCampaign,
  PLATFORM_CONFIG,
  type AdGroupData,
} from '@/lib/campaign-mock-data';
import { MetricTooltip } from '@/components/ui/metric-tooltip';
import { KpiStrip } from '@/components/ad-insights/kpi-strip';
import { TrendChart, type TrendChartItem } from '@/components/ad-insights/trend-chart';
import {
  METRICS,
  DEFAULT_KPI_KEYS,
  type MetricKey,
} from '@/components/ad-insights/metric-defs';
import { generateItemTrend } from '@/lib/trend-mock';

// ─── 定数・フォーマット ──────────────────────────────────────────

const fmtInt = new Intl.NumberFormat('ja-JP');
const fmtJpy = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TODAY = new Date();

function buildDates(period: { start: Date; end: Date }): string[] {
  const days = Math.max(
    1,
    Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000) + 1,
  );
  return Array.from({ length: days }, (_, i) =>
    new Date(period.start.getTime() + i * 86_400_000).toISOString().split('T')[0],
  );
}

function defaultDateRange(): DateRangeValue {
  const prevMonth = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
  const prevMonthEnd = new Date(TODAY.getFullYear(), TODAY.getMonth(), 0);
  return {
    main: { start: prevMonth, end: prevMonthEnd },
    compareEnabled: false,
    preset: 'lastmonth',
  };
}

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
  const adGroups = useMemo(() => getAdGroupsByCampaign(id), [id]);
  const isSearch = campaign?.adType === 'search';

  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tileKeys, setTileKeys] = useState<MetricKey[]>(DEFAULT_KPI_KEYS);
  const [selected, setSelected] = useState<MetricKey>('clicks');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ col: SortKey; dir: 'asc' | 'desc' }>({
    col: 'cost',
    dir: 'desc',
  });

  const dates = useMemo(() => buildDates(dateRange.main), [dateRange.main]);

  const filteredAdGroups = useMemo(() => {
    return adGroups.filter((ag) => {
      if (statusFilter !== 'all' && ag.status !== statusFilter) return false;
      return true;
    });
  }, [adGroups, statusFilter]);

  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const ag of filteredAdGroups) {
      t.impressions += ag.impressions;
      t.clicks += ag.clicks;
      t.cost += ag.cost;
      t.conversions += ag.conversions;
    }
    return {
      ...t,
      conversionValue: 0,
      ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
      cpc: t.clicks > 0 ? t.cost / t.clicks : 0,
      cvr: t.clicks > 0 ? t.conversions / t.clicks : 0,
      cpa: t.conversions > 0 ? t.cost / t.conversions : null,
    };
  }, [filteredAdGroups]);

  const toggleSort = (col: SortKey) => {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'desc' }
    );
  };

  const sorted = useMemo(() => {
    return [...filteredAdGroups].sort((a, b) => {
      if (sort.col === 'name') {
        return sort.dir === 'asc'
          ? a.name.localeCompare(b.name, 'ja')
          : b.name.localeCompare(a.name, 'ja');
      }
      const av = (a[sort.col] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      const bv = (b[sort.col] as number | null) ?? (sort.dir === 'asc' ? Infinity : -Infinity);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
  }, [filteredAdGroups, sort]);

  // フィルター変更時、表外の選択 ID を外す
  useEffect(() => {
    setSelectedIds((prev) => {
      const rowIds = new Set(filteredAdGroups.map((r) => r.id));
      const next = new Set(Array.from(prev).filter((id) => rowIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredAdGroups]);

  // デフォルト選択（クリック数上位3件）
  useEffect(() => {
    if (selectedIds.size > 0 || filteredAdGroups.length === 0) return;
    const top = [...filteredAdGroups].sort((a, b) => b.clicks - a.clicks).slice(0, 3);
    setSelectedIds(new Set(top.map((r) => r.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredAdGroups]);

  const chartItems: TrendChartItem[] = useMemo(() => {
    return filteredAdGroups
      .filter((ag) => selectedIds.has(ag.id))
      .map((ag) => ({
        id: ag.id,
        name: ag.name,
        platform: campaign?.platform,
        dailyTotals: generateItemTrend(
          ag.id,
          {
            impressions: ag.impressions,
            clicks: ag.clicks,
            cost: ag.cost,
            conversions: ag.conversions,
            conversionValue: 0,
          },
          dateRange.main,
        ),
      }));
  }, [filteredAdGroups, selectedIds, dateRange.main, campaign?.platform]);

  const getKpiValue = (key: MetricKey): number | null => METRICS[key].compute(totals);
  const selectedMetric = METRICS[selected];

  if (!campaign) {
    return (
      <div className="p-8 text-center text-muted-foreground">キャンペーンが見つかりません</div>
    );
  }

  const platformCfg = PLATFORM_CONFIG[campaign.platform];
  const colSpanBase = isSearch ? 12 : 11;
  const totalsLabelColSpan = isSearch ? 4 : 3;

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', platformCfg.className)}>
              {platformCfg.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            広告グループ一覧 — {campaign.type}
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} today={TODAY} />
      </div>

      {/* サンプルデータバナー */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
        <InfoIcon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>サンプルデータを表示しています。</span>
      </div>

      {/* KPI + チャート + テーブル */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">実績</CardTitle>
            <div className="flex items-center gap-2">
              <label htmlFor="filter-status" className="text-xs text-muted-foreground">
                ステータス
              </label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
                <SelectTrigger id="filter-status" className="h-8 w-28 text-sm">
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
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <KpiStrip
            tileKeys={tileKeys}
            onTileKeysChange={setTileKeys}
            selected={selected}
            onSelect={setSelected}
            getValue={getKpiValue}
          />
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">
                {chartItems.length > 0
                  ? `${fmtInt.format(chartItems.length)} 件を表示中`
                  : '下の表から広告グループを選択するとチャートに表示されます'}
              </p>
              {chartItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors motion-reduce:transition-none"
                >
                  選択をクリア
                </button>
              )}
            </div>
            <TrendChart items={chartItems} dates={dates} metric={selectedMetric} topN={20} />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pl-3">
                    <input
                      type="checkbox"
                      aria-label="全選択"
                      className="size-3.5 rounded border-border accent-primary cursor-pointer"
                      checked={filteredAdGroups.length > 0 && selectedIds.size === filteredAdGroups.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredAdGroups.length;
                      }}
                      onChange={(e) => {
                        setSelectedIds(e.target.checked ? new Set(filteredAdGroups.map((r) => r.id)) : new Set());
                      }}
                    />
                  </TableHead>
                  <TableHead className="w-6" />
                  <SortHeader col="name" label="広告グループ名" sort={sort} onSort={toggleSort} className="min-w-44" />
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
                {sorted.map((ag: AdGroupData) => {
                  const checked = selectedIds.has(ag.id);
                  return (
                    <TableRow key={ag.id} className="text-sm">
                      <TableCell className="pl-3">
                        <input
                          type="checkbox"
                          aria-label={`${ag.name}をチャートに表示`}
                          className="size-3.5 rounded border-border accent-primary cursor-pointer"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(ag.id);
                              else next.delete(ag.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusChip status={ag.status} />
                      </TableCell>

                      <TableCell className="font-medium max-w-xs">
                        <Link
                          href={`/campaigns/${id}/${ag.id}`}
                          className="hover:underline text-foreground"
                        >
                          <div className="truncate" title={ag.name}>{ag.name}</div>
                        </Link>
                      </TableCell>

                      <TableCell className="text-muted-foreground">{ag.type}</TableCell>

                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {ag.bidStrategy}
                        {ag.targetCpa != null && (
                          <span className="text-xs ml-1">({fmtJpy.format(ag.targetCpa)})</span>
                        )}
                      </TableCell>

                      {isSearch && (
                        <TableCell className="text-right tabular-nums">
                          {ag.qualityScore != null ? (
                            <span className={ag.qualityScore >= 7 ? 'text-green-600' : ag.qualityScore >= 4 ? 'text-yellow-600' : 'text-red-500'}>
                              {ag.qualityScore}/10
                            </span>
                          ) : '—'}
                        </TableCell>
                      )}

                      <TableCell className="text-right tabular-nums">
                        {ag.impressions > 0 ? fmtInt.format(ag.impressions) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.clicks > 0 ? fmtInt.format(ag.clicks) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.impressions > 0 ? (
                          <MetricTooltip
                            label="CTR = クリック数 ÷ 表示回数"
                            numerator={{ label: 'クリック数', value: fmtInt.format(ag.clicks) }}
                            denominator={{ label: '表示回数', value: fmtInt.format(ag.impressions) }}
                          >
                            {fmtPct.format(ag.ctr)}
                          </MetricTooltip>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.cost > 0 ? fmtJpy.format(ag.cost) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.clicks > 0 ? (
                          <MetricTooltip
                            label="平均CPC = 費用 ÷ クリック数"
                            numerator={{ label: '費用', value: fmtJpy.format(ag.cost) }}
                            denominator={{ label: 'クリック数', value: fmtInt.format(ag.clicks) }}
                          >
                            {fmtJpy.format(ag.cpc)}
                          </MetricTooltip>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.conversions > 0 ? fmtInt.format(ag.conversions) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ag.clicks > 0 ? (
                          <MetricTooltip
                            label="CVR = CV ÷ クリック数"
                            numerator={{ label: 'CV', value: fmtInt.format(ag.conversions) }}
                            denominator={{ label: 'クリック数', value: fmtInt.format(ag.clicks) }}
                          >
                            {fmtPct.format(ag.cvr)}
                          </MetricTooltip>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums pr-4">
                        {ag.cpa != null ? (
                          <MetricTooltip
                            label="CPA = 費用 ÷ CV"
                            numerator={{ label: '費用', value: fmtJpy.format(ag.cost) }}
                            denominator={{ label: 'CV', value: fmtInt.format(ag.conversions) }}
                          >
                            {fmtJpy.format(ag.cpa)}
                          </MetricTooltip>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={colSpanBase} className="text-center text-sm text-muted-foreground py-8">
                      広告グループがありません
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>

              {sorted.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="pl-3" />
                    <TableCell />
                    <TableCell className="font-semibold" colSpan={totalsLabelColSpan}>
                      合計 ({fmtInt.format(filteredAdGroups.length)})
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
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
