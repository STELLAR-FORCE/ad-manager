'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
import { cn } from '@/lib/utils';
import {
  AD_GROUPS,
  getCampaignMap,
  PLATFORM_CONFIG,
  type AdGroupData,
  type Platform,
  type AdType,
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

type SectionTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
};

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

// ─── セクション ──────────────────────────────────────────────────

type SectionProps = {
  title: string;
  adType: AdType;
  period: { start: Date; end: Date };
};

function Section({ title, adType, period }: SectionProps) {
  const campaignMap = useMemo(() => getCampaignMap(), []);
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tileKeys, setTileKeys] = useState<MetricKey[]>(DEFAULT_KPI_KEYS);
  const [selected, setSelected] = useState<MetricKey>('clicks');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  const dates = useMemo(() => buildDates(period), [period]);

  const { rows, totals } = useMemo(() => {
    const filtered = AD_GROUPS.filter((ag) => {
      const c = campaignMap.get(ag.campaignId);
      if (!c || c.adType !== adType) return false;
      if (platform !== 'all' && c.platform !== platform) return false;
      if (statusFilter !== 'all' && ag.status !== statusFilter) return false;
      return true;
    });

    const totals: SectionTotals = filtered.reduce<SectionTotals>(
      (acc, ag) => ({
        impressions: acc.impressions + ag.impressions,
        clicks: acc.clicks + ag.clicks,
        cost: acc.cost + ag.cost,
        conversions: acc.conversions + ag.conversions,
        conversionValue: 0,
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
    );

    return { rows: filtered, totals };
  }, [adType, platform, statusFilter, campaignMap]);

  // 選択中の広告グループだけチャートに表示（選択順を保持）
  const chartItems: TrendChartItem[] = useMemo(() => {
    return rows
      .filter((ag) => selectedIds.has(ag.id))
      .map((ag) => ({
        id: ag.id,
        name: ag.name,
        platform: campaignMap.get(ag.campaignId)?.platform,
        dailyTotals: generateItemTrend(
          ag.id,
          {
            impressions: ag.impressions,
            clicks: ag.clicks,
            cost: ag.cost,
            conversions: ag.conversions,
            conversionValue: 0,
          },
          period,
        ),
      }));
  }, [rows, selectedIds, period, campaignMap]);

  // フィルター条件が変わったら、表に残らない選択 ID を外す
  useEffect(() => {
    setSelectedIds((prev) => {
      const rowIds = new Set(rows.map((r) => r.id));
      const next = new Set(Array.from(prev).filter((id) => rowIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  // 初期選択: クリック数上位3件をデフォルト選択（選択が空のとき、表が更新された直後のみ）
  useEffect(() => {
    if (selectedIds.size > 0 || rows.length === 0) return;
    const top = [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, 3);
    setSelectedIds(new Set(top.map((r) => r.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const sortedRows = useMemo(() => {
    const getCampaignName = (ag: AdGroupData) => campaignMap.get(ag.campaignId)?.name ?? '';
    return [...rows].sort((a, b) => {
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
  }, [rows, sort, campaignMap]);

  const rowTotals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const ag of sortedRows) {
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
  }, [sortedRows]);

  const getKpiValue = (key: MetricKey): number | null => {
    return METRICS[key].compute(totals);
  };

  const selectedMetric = METRICS[selected];

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor={`platform-${adType}`} className="text-xs text-muted-foreground">
                媒体
              </label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform | 'all')}>
                <SelectTrigger id={`platform-${adType}`} className="h-8 w-28 text-sm">
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
              <label htmlFor={`status-${adType}`} className="text-xs text-muted-foreground">
                ステータス
              </label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
                <SelectTrigger id={`status-${adType}`} className="h-8 w-28 text-sm">
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
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < rows.length;
                    }}
                    onChange={(e) => {
                      setSelectedIds(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set());
                    }}
                  />
                </TableHead>
                <TableHead className="w-6" />
                <SortHeader col="name" label="広告グループ" sort={sort} onSort={toggleSort} className="min-w-40" />
                <SortHeader col="campaignName" label="キャンペーン" sort={sort} onSort={toggleSort} className="min-w-32" />
                <SortHeader col="impressions" label="表示" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader col="clicks" label="クリック" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader col="ctr" label="CTR" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader col="cost" label="費用" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader col="cpc" label="CPC" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader col="conversions" label="CV" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader col="cvr" label="CVR" sort={sort} onSort={toggleSort} className="text-right" />
                <SortHeader col="cpa" label="CPA" sort={sort} onSort={toggleSort} className="text-right pr-3" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {sortedRows.map((ag) => {
                const c = campaignMap.get(ag.campaignId);
                const platformCfg = c ? PLATFORM_CONFIG[c.platform] : null;
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
                    <TableCell className="font-medium max-w-[180px]">
                      <Link
                        href={`/campaigns/${ag.campaignId}/${ag.id}`}
                        className="hover:underline text-foreground"
                      >
                        <div className="truncate" title={ag.name}>{ag.name}</div>
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <Link
                        href={`/campaigns/${ag.campaignId}`}
                        className="hover:underline text-muted-foreground text-xs flex items-center gap-1.5"
                      >
                        {platformCfg && (
                          <span className={cn('text-[10px] font-medium px-1 py-0.5 rounded-full shrink-0', platformCfg.className)}>
                            {platformCfg.label}
                          </span>
                        )}
                        <span className="truncate" title={c?.name}>{c?.name ?? '—'}</span>
                      </Link>
                    </TableCell>
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
                    <TableCell className="text-right tabular-nums pr-3">
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
              {sortedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-8">
                    該当する広告グループはありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>

            {sortedRows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-3" />
                  <TableCell />
                  <TableCell className="font-semibold" colSpan={2}>
                    合計 ({fmtInt.format(sortedRows.length)})
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtInt.format(rowTotals.impressions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtInt.format(rowTotals.clicks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {rowTotals.impressions > 0 ? fmtPct.format(rowTotals.ctr) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtJpy.format(rowTotals.cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {rowTotals.clicks > 0 ? fmtJpy.format(Math.round(rowTotals.cpc)) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtInt.format(rowTotals.conversions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {rowTotals.clicks > 0 ? fmtPct.format(rowTotals.cvr) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold pr-3">
                    {rowTotals.cpa != null ? fmtJpy.format(Math.round(rowTotals.cpa)) : '—'}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ページ ──────────────────────────────────────────────────────

export default function AdGroupsListPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">広告グループ</h1>
          <p className="text-sm text-muted-foreground mt-1">
            全キャンペーンの広告グループ一覧
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} today={TODAY} />
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
        <InfoIcon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>サンプルデータを表示しています。</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="検索" adType="search" period={dateRange.main} />
        <Section title="ディスプレイ" adType="display" period={dateRange.main} />
      </div>
    </div>
  );
}
