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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InfoIcon, ImageIcon } from 'lucide-react';
import { StatusChip, StatusDot } from '@/components/ui/status-chip';
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
  getAdGroup,
  getAdsByAdGroup,
  getKeywordsByAdGroup,
  PLATFORM_CONFIG,
  type AdData,
  type KeywordData,
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

function SelectionHeaderCheckbox({
  allIds,
  selectedIds,
  onChange,
}: {
  allIds: string[];
  selectedIds: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const allChecked = allIds.length > 0 && selectedIds.size === allIds.length;
  const indeterminate = selectedIds.size > 0 && selectedIds.size < allIds.length;
  return (
    <input
      type="checkbox"
      aria-label="全選択"
      className="size-3.5 rounded border-border accent-primary cursor-pointer"
      checked={allChecked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={(e) => onChange(e.target.checked ? new Set(allIds) : new Set())}
    />
  );
}

function RowCheckbox({
  id,
  label,
  selectedIds,
  onChange,
}: {
  id: string;
  label: string;
  selectedIds: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const checked = selectedIds.has(id);
  return (
    <input
      type="checkbox"
      aria-label={`${label}をチャートに表示`}
      className="size-3.5 rounded border-border accent-primary cursor-pointer"
      checked={checked}
      onChange={(e) => {
        const next = new Set(selectedIds);
        if (e.target.checked) next.add(id);
        else next.delete(id);
        onChange(next);
      }}
    />
  );
}

// ─── 広告テーブル（検索RSA） ─────────────────────────────────────

function SearchAdsTable({
  ads,
  selectedIds,
  onSelectedChange,
}: {
  ads: AdData[];
  selectedIds: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pl-4">
                <SelectionHeaderCheckbox
                  allIds={ads.map((a) => a.id)}
                  selectedIds={selectedIds}
                  onChange={onSelectedChange}
                />
              </TableHead>
              <TableHead className="w-6" />
              <TableHead className="min-w-48">広告見出し</TableHead>
              <TableHead className="min-w-56">説明文</TableHead>
              <TableHead>広告種類</TableHead>
              <TableHead className="text-right">表示回数</TableHead>
              <TableHead className="text-right">クリック</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">費用</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">CV</TableHead>
              <TableHead className="text-right pr-4">CPA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ads.map((ad) => (
              <TableRow key={ad.id} className="text-sm">
                <TableCell className="pl-4">
                  <RowCheckbox id={ad.id} label={ad.name} selectedIds={selectedIds} onChange={onSelectedChange} />
                </TableCell>
                <TableCell>
                  <StatusChip status={ad.status} />
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    {ad.headlines.slice(0, 3).map((h, i) => (
                      <div key={i} className={cn('text-sm', i === 0 ? 'font-medium text-blue-700' : 'text-muted-foreground')}>
                        {h}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground line-clamp-2 max-w-xs">
                    {ad.descriptions[0]}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{ad.adFormat}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.impressions > 0 ? fmtInt.format(ad.impressions) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.clicks > 0 ? fmtInt.format(ad.clicks) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {ad.impressions > 0 ? (
                    <MetricTooltip
                      label="CTR = クリック数 ÷ 表示回数"
                      numerator={{ label: 'クリック数', value: fmtInt.format(ad.clicks) }}
                      denominator={{ label: '表示回数', value: fmtInt.format(ad.impressions) }}
                    >
                      {fmtPct.format(ad.ctr)}
                    </MetricTooltip>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{ad.cost > 0 ? fmtJpy.format(ad.cost) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {ad.clicks > 0 ? (
                    <MetricTooltip
                      label="平均CPC = 費用 ÷ クリック数"
                      numerator={{ label: '費用', value: fmtJpy.format(ad.cost) }}
                      denominator={{ label: 'クリック数', value: fmtInt.format(ad.clicks) }}
                    >
                      {fmtJpy.format(ad.cpc)}
                    </MetricTooltip>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{ad.conversions > 0 ? fmtInt.format(ad.conversions) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums pr-4">
                  {ad.cpa != null ? (
                    <MetricTooltip
                      label="CPA = 費用 ÷ CV"
                      numerator={{ label: '費用', value: fmtJpy.format(ad.cost) }}
                      denominator={{ label: 'CV', value: fmtInt.format(ad.conversions) }}
                    >
                      {fmtJpy.format(ad.cpa)}
                    </MetricTooltip>
                  ) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── ディスプレイ広告テーブル ─────────────────────────────────────

function DisplayAdsTable({
  ads,
  selectedIds,
  onSelectedChange,
}: {
  ads: AdData[];
  selectedIds: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pl-4">
                <SelectionHeaderCheckbox
                  allIds={ads.map((a) => a.id)}
                  selectedIds={selectedIds}
                  onChange={onSelectedChange}
                />
              </TableHead>
              <TableHead className="w-6" />
              <TableHead className="min-w-40">広告名</TableHead>
              <TableHead>広告種類</TableHead>
              <TableHead>画像サイズ</TableHead>
              <TableHead className="text-right">表示回数</TableHead>
              <TableHead className="text-right">クリック</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">費用</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">CV</TableHead>
              <TableHead className="text-right pr-4">CPA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ads.map((ad) => (
              <TableRow key={ad.id} className="text-sm">
                <TableCell className="pl-4">
                  <RowCheckbox id={ad.id} label={ad.name} selectedIds={selectedIds} onChange={onSelectedChange} />
                </TableCell>
                <TableCell>
                  <StatusChip status={ad.status} />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="truncate max-w-xs" title={ad.name}>{ad.name}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{ad.adFormat}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{ad.imageSize ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.impressions > 0 ? fmtInt.format(ad.impressions) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.clicks > 0 ? fmtInt.format(ad.clicks) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.impressions > 0 ? fmtPct.format(ad.ctr) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.cost > 0 ? fmtJpy.format(ad.cost) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.clicks > 0 ? fmtJpy.format(ad.cpc) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.conversions > 0 ? fmtInt.format(ad.conversions) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums pr-4">{ad.cpa != null ? fmtJpy.format(ad.cpa) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── キーワードテーブル ──────────────────────────────────────────

function KeywordsTable({
  keywords,
  selectedIds,
  onSelectedChange,
}: {
  keywords: KeywordData[];
  selectedIds: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
}) {
  if (keywords.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">キーワードデータがありません</p>;
  }

  const sorted = [...keywords].sort((a, b) => b.cost - a.cost);

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pl-4">
                <SelectionHeaderCheckbox
                  allIds={sorted.map((k) => k.id)}
                  selectedIds={selectedIds}
                  onChange={onSelectedChange}
                />
              </TableHead>
              <TableHead className="w-6" />
              <TableHead className="min-w-40">キーワード</TableHead>
              <TableHead>マッチタイプ</TableHead>
              <TableHead className="text-right">品質スコア</TableHead>
              <TableHead className="text-right">表示回数</TableHead>
              <TableHead className="text-right">クリック</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">費用</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">CV</TableHead>
              <TableHead className="text-right">CVR</TableHead>
              <TableHead className="text-right">CPA</TableHead>
              <TableHead className="text-right pr-4">IS(上部)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((kw) => {
              const mt = matchTypeBadge(kw.matchType);
              return (
                <TableRow key={kw.id} className="text-sm">
                  <TableCell className="pl-4">
                    <RowCheckbox id={kw.id} label={kw.keyword} selectedIds={selectedIds} onChange={onSelectedChange} />
                  </TableCell>
                  <TableCell>
                    <StatusChip status={kw.status} />
                  </TableCell>
                  <TableCell className="font-medium">{kw.keyword}</TableCell>
                  <TableCell>
                    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', mt.className)}>
                      {mt.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {kw.qualityScore != null ? (
                      <span className={qsColor(kw.qualityScore)}>{kw.qualityScore}/10</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{kw.impressions > 0 ? fmtInt.format(kw.impressions) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.clicks > 0 ? fmtInt.format(kw.clicks) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.impressions > 0 ? fmtPct.format(kw.ctr) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.cost > 0 ? fmtJpy.format(kw.cost) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.clicks > 0 ? fmtJpy.format(kw.cpc) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.conversions > 0 ? fmtInt.format(kw.conversions) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.clicks > 0 ? fmtPct.format(kw.cvr) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.cpa != null ? fmtJpy.format(kw.cpa) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums pr-4 text-xs">{kw.topImprRate ?? '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── クリエイティブ一覧（ディスプレイ） ──────────────────────────

function CreativeGallery({ ads }: { ads: AdData[] }) {
  const displayAds = ads.filter((ad) => ad.imageFileName);
  if (displayAds.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">クリエイティブデータがありません</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayAds.map((ad) => (
        <Card key={ad.id} className="overflow-hidden">
          <div className="aspect-square bg-muted flex items-center justify-center border-b">
            <div className="text-center p-4">
              <ImageIcon className="size-10 text-muted-foreground/40 mx-auto mb-2" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">{ad.imageFileName}</p>
              {ad.imageSize && <p className="text-xs text-muted-foreground/60">{ad.imageSize}</p>}
            </div>
          </div>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate" title={ad.name}>{ad.name}</p>
              <StatusDot status={ad.status} className="ml-2" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">表示回数</p>
                <p className="text-sm font-medium tabular-nums">{fmtInt.format(ad.impressions)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">クリック</p>
                <p className="text-sm font-medium tabular-nums">{fmtInt.format(ad.clicks)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CTR</p>
                <p className="text-sm font-medium tabular-nums">{fmtPct.format(ad.ctr)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">費用</p>
                <p className="text-sm font-medium tabular-nums">{fmtJpy.format(ad.cost)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPC</p>
                <p className="text-sm font-medium tabular-nums">{fmtJpy.format(ad.cpc)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CV</p>
                <p className="text-sm font-medium tabular-nums">{fmtInt.format(ad.conversions)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── ページ ──────────────────────────────────────────────────────

export default function AdGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string; adGroupId: string }>;
}) {
  const { id, adGroupId } = use(params);
  const campaign = getCampaign(id);
  const adGroup = getAdGroup(adGroupId);
  const ads = useMemo(() => getAdsByAdGroup(adGroupId), [adGroupId]);
  const keywords = useMemo(() => getKeywordsByAdGroup(adGroupId), [adGroupId]);

  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<number>(0);
  const [tileKeys, setTileKeys] = useState<MetricKey[]>(DEFAULT_KPI_KEYS);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('clicks');
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set());
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<Set<string>>(new Set());

  const matchesStatus = (s: string) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return s === 'active' || s === 'active_limited';
    return s === statusFilter;
  };
  const filteredAds = useMemo(() => ads.filter((a) => matchesStatus(a.status)), [ads, statusFilter]);
  const filteredKeywords = useMemo(() => keywords.filter((k) => matchesStatus(k.status)), [keywords, statusFilter]);

  const dates = useMemo(() => buildDates(dateRange.main), [dateRange.main]);
  const isSearch = campaign?.adType === 'search';
  const isDisplay = campaign?.adType === 'display';

  // フィルター変更時、表外の選択 ID を外す
  useEffect(() => {
    setSelectedAdIds((prev) => {
      const ids = new Set(filteredAds.map((r) => r.id));
      const next = new Set(Array.from(prev).filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredAds]);
  useEffect(() => {
    setSelectedKeywordIds((prev) => {
      const ids = new Set(filteredKeywords.map((r) => r.id));
      const next = new Set(Array.from(prev).filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredKeywords]);

  // デフォルト選択: 広告・KW ともにクリック数上位3件
  useEffect(() => {
    if (selectedAdIds.size === 0 && filteredAds.length > 0) {
      const top = [...filteredAds].sort((a, b) => b.clicks - a.clicks).slice(0, 3);
      setSelectedAdIds(new Set(top.map((r) => r.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredAds]);
  useEffect(() => {
    if (selectedKeywordIds.size === 0 && filteredKeywords.length > 0) {
      const top = [...filteredKeywords].sort((a, b) => b.clicks - a.clicks).slice(0, 3);
      setSelectedKeywordIds(new Set(top.map((r) => r.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredKeywords]);

  // アクティブタブに応じてチャートの items を切り替え
  const { chartItems, chartScopeLabel, onClearSelection } = useMemo(() => {
    if (activeTab === 0) {
      const items: TrendChartItem[] = filteredAds
        .filter((a) => selectedAdIds.has(a.id))
        .map((a) => ({
          id: a.id,
          name: a.name,
          platform: campaign?.platform,
          dailyTotals: generateItemTrend(
            a.id,
            {
              impressions: a.impressions,
              clicks: a.clicks,
              cost: a.cost,
              conversions: a.conversions,
              conversionValue: 0,
            },
            dateRange.main,
          ),
        }));
      return {
        chartItems: items,
        chartScopeLabel: '広告',
        onClearSelection: () => setSelectedAdIds(new Set()),
      };
    }
    if (isSearch && activeTab === 1) {
      const items: TrendChartItem[] = filteredKeywords
        .filter((k) => selectedKeywordIds.has(k.id))
        .map((k) => ({
          id: k.id,
          name: k.keyword,
          platform: campaign?.platform,
          dailyTotals: generateItemTrend(
            k.id,
            {
              impressions: k.impressions,
              clicks: k.clicks,
              cost: k.cost,
              conversions: k.conversions,
              conversionValue: 0,
            },
            dateRange.main,
          ),
        }));
      return {
        chartItems: items,
        chartScopeLabel: 'キーワード',
        onClearSelection: () => setSelectedKeywordIds(new Set()),
      };
    }
    return { chartItems: [] as TrendChartItem[], chartScopeLabel: null as string | null, onClearSelection: null as (() => void) | null };
  }, [activeTab, filteredAds, filteredKeywords, selectedAdIds, selectedKeywordIds, isSearch, dateRange.main, campaign?.platform]);

  const selectedMetricDef = METRICS[selectedMetric];

  if (!campaign || !adGroup) {
    return (
      <div className="p-8 text-center text-muted-foreground">広告グループが見つかりません</div>
    );
  }

  const platformCfg = PLATFORM_CONFIG[campaign.platform];

  const kpiTotals = {
    impressions: adGroup.impressions,
    clicks: adGroup.clicks,
    cost: adGroup.cost,
    conversions: adGroup.conversions,
    conversionValue: 0,
  };
  const getKpiValue = (k: MetricKey): number | null => METRICS[k].compute(kpiTotals);

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
            <BreadcrumbLink render={<Link href={`/campaigns/${id}`} />}>
              {campaign.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{adGroup.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* ヘッダー */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{adGroup.name}</h1>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', platformCfg.className)}>
              {platformCfg.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {campaign.name} — {adGroup.type}
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} today={TODAY} />
      </div>

      {/* サンプルデータバナー */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
        <InfoIcon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>サンプルデータを表示しています。</span>
      </div>

      {/* KPI + チャート */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">広告グループ実績</CardTitle>
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
            selected={selectedMetric}
            onSelect={setSelectedMetric}
            getValue={getKpiValue}
          />
          {chartScopeLabel ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">
                  {chartItems.length > 0
                    ? `${chartScopeLabel}: ${fmtInt.format(chartItems.length)} 件を表示中`
                    : `下の表から${chartScopeLabel}を選択するとチャートに表示されます`}
                </p>
                {chartItems.length > 0 && onClearSelection && (
                  <button
                    type="button"
                    onClick={onClearSelection}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors motion-reduce:transition-none"
                  >
                    選択をクリア
                  </button>
                )}
              </div>
              <TrendChart items={chartItems} dates={dates} metric={selectedMetricDef} topN={20} />
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              クリエイティブタブではチャートは表示されません
            </div>
          )}
        </CardContent>
      </Card>

      {/* タブ */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(Number(v))}>
        <TabsList variant="line">
          <TabsTrigger value={0}>
            広告 ({filteredAds.length})
          </TabsTrigger>
          {isSearch && (
            <TabsTrigger value={1}>
              キーワード ({filteredKeywords.length})
            </TabsTrigger>
          )}
          {isDisplay && (
            <TabsTrigger value={1}>
              クリエイティブ一覧
            </TabsTrigger>
          )}
        </TabsList>

        {/* 広告タブ */}
        <TabsContent value={0}>
          {filteredAds.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">広告データがありません</p>
          ) : isSearch ? (
            <SearchAdsTable ads={filteredAds} selectedIds={selectedAdIds} onSelectedChange={setSelectedAdIds} />
          ) : (
            <DisplayAdsTable ads={filteredAds} selectedIds={selectedAdIds} onSelectedChange={setSelectedAdIds} />
          )}
        </TabsContent>

        {/* キーワードタブ（検索のみ） */}
        {isSearch && (
          <TabsContent value={1}>
            <KeywordsTable
              keywords={filteredKeywords}
              selectedIds={selectedKeywordIds}
              onSelectedChange={setSelectedKeywordIds}
            />
          </TabsContent>
        )}

        {/* クリエイティブ一覧タブ（ディスプレイのみ） */}
        {isDisplay && (
          <TabsContent value={1}>
            <CreativeGallery ads={filteredAds} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
