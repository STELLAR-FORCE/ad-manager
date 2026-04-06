'use client';

import { useState, useMemo } from 'react';
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

// ─── 型定義 ────────────────────────────────────────────────────

type CampaignStatus = 'active' | 'active_limited' | 'paused' | 'ended';
type Platform = 'google' | 'yahoo' | 'bing';
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

type Campaign = {
  id: string;
  name: string;
  platform: Platform;
  type: string;
  status: CampaignStatus;
  dailyBudget: number | null;
  bidStrategy: string;
  optimizationScore: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  cpc: number;
  conversions: number;
  cpa: number | null;
};

// ─── 定数 ──────────────────────────────────────────────────────

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

// ─── モックデータ（各媒体CSVより、2026年3月実績）─────────────────
// ※ Bingのみ 3/25〜3/31（7日間）、Google/Yahoo!は 3/1〜3/31

function c(
  id: string,
  name: string,
  platform: Platform,
  type: string,
  status: CampaignStatus,
  dailyBudget: number | null,
  bidStrategy: string,
  optimizationScore: number | null,
  impressions: number,
  clicks: number,
  ctr: number,
  cost: number,
  cpc: number,
  conversions: number,
  cpa: number | null,
): Campaign {
  return { id, name, platform, type, status, dailyBudget, bidStrategy, optimizationScore, impressions, clicks, ctr, cost, cpc, conversions, cpa };
}

const MOCK_CAMPAIGNS: Campaign[] = [
  // ── Google（3/1〜3/31） ──────────────────────────────────────
  c('g1',  'K:コア LP【monthly-order】',          'google', '検索',                  'active_limited', 40000,  '目標CPA',      64.74, 26472,   2371,  0.0896, 1662719, 701,  172,  9667),
  c('g2',  'デマンドジェン',                       'google', 'デマンドジェネレーション', 'active',         5000,   '目標CPC',      96.83, 2488012, 22474, 0.0109, 147158,  5,    0,    null),
  c('g3',  'K：指名',                              'google', '検索',                  'active_limited', 2000,   '拡張CPC',      59.26, 456,     38,    0.0833, 13257,   349,  5,    2651),
  c('g4',  '新規業種トライアル（新卒研修切り口）',  'google', '検索',                  'active_limited', 5000,   '目標CPA',      58.89, 1312,    120,   0.0915, 87411,   728,  9,    9712),
  c('g5',  'K：コア LP2 RE #2',                   'google', '検索',                  'paused',         75000,  '目標CPA',      null,  0, 0, 0, 0, 0, 0, null),
  c('g6',  '手動入札',                             'google', '検索',                  'paused',         60000,  '手動CPC',      null,  0, 0, 0, 0, 0, 0, null),
  c('g7',  'P-MAX',                               'google', 'P-MAX',                'paused',         30000,  '目標CPA',      null,  0, 0, 0, 0, 0, 0, null),
  c('g8',  'K：P-MAX',                            'google', 'P-MAX',                'paused',         15000,  '目標CPA',      null,  0, 0, 0, 0, 0, 0, null),
  c('g9',  'K：コア LP2 RE_クリック最大化',         'google', '検索',                  'paused',         20000,  'クリック最大化', null,  0, 0, 0, 0, 0, 0, null),
  c('g10', 'Leads-Display-1',                     'google', 'ディスプレイ',           'paused',         5000,   '手動CPC',      null,  0, 0, 0, 0, 0, 0, null),
  c('g11', 'K：指名 LPテスト_202409',               'google', '検索',                  'ended',          2000,   '拡張CPC',      null,  0, 0, 0, 0, 0, 0, null),
  c('g12', 'K：コア (LP2) LPテスト_202409',         'google', '検索',                  'ended',          10000,  '目標CPA',      null,  0, 0, 0, 0, 0, 0, null),

  // ── Yahoo!（3/1〜3/31） ─────────────────────────────────────
  c('y1',  'K：コア 【monthly-order】',             'yahoo',  '検索',                  'active_limited', 20000,  '目標CPA',      null,  96546, 3417, 0.0354, 1363586, 399,  134,  10176),
  c('y2',  '新規業種トライアル',                    'yahoo',  '検索',                  'active',         5000,   '目標CPA',      null,  1014,  43,   0.0424, 11618,   270,  1,    11618),
  c('y3',  'K：指名',                              'yahoo',  '検索',                  'active',         2000,   '手動CPC',      null,  79,    6,    0.0759, 850,     142,  0,    null),
  c('y4',  'K：コア 【standard/express】',          'yahoo',  '検索',                  'paused',         20000,  'CV最大化',     null,  0, 0, 0, 0, 0, 0, null),
  c('y5',  '手動入札',                             'yahoo',  '検索',                  'paused',         85000,  '手動CPC',      null,  0, 0, 0, 0, 0, 0, null),
  c('y6',  'K：コア LP2 RE_クリック最大化',          'yahoo',  '検索',                  'paused',         50000,  'クリック最大化', null,  0, 0, 0, 0, 0, 0, null),
  c('y7',  'K：コア LP2 RE',                       'yahoo',  '検索',                  'paused',         40000,  '目標CPA',      null,  0, 0, 0, 0, 0, 0, null),
  c('y8',  '検証KW',                              'yahoo',  '検索',                  'paused',         10000,  '手動CPC',      null,  0, 0, 0, 0, 0, 0, null),

  // ── Bing（3/25〜3/31・7日間） ────────────────────────────────
  // 検索キャンペーンの表示回数・クリックはCSV上非公開のため合計から比例配分した推計値
  c('b1',  'K：コア【monthly-order】',              'bing',   '検索',                  'active_limited', 40000,  'CV最大化',     55.4,  9375,   1028,  0.1097, 495194, 481,  49,   10106),
  c('b2',  'リタゲ 20250722',                      'bing',   'オーディエンス',          'active_limited', 3000,   '拡張CPC',      100,   264186, 2030,  0.0077, 24160,  12,   0,    null),
  c('b3',  'K：指名',                              'bing',   '検索',                  'active',         2000,   '拡張CPC',      93.8,  100,    11,    0.11,   643,    58,   1,    643),
  c('b4',  '新規業種トライアル',                    'bing',   '検索',                  'active_limited', 5000,   'CV最大化',     100,   92,     10,    0.1087, 24927,  2493, 1,    24927),
];

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
    let data = MOCK_CAMPAIGNS;

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
  }, [platformFilter, statusFilter, sort]);

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
              2026年3月2日〜2026年3月31日
            </p>
          </div>
        </div>

        {/* サンプルデータバナー */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
          <InfoIcon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            サンプルデータを表示しています。API連携後に実データが反映されます。
            <span className="ml-2 opacity-75">※ Bingのみデータ期間が3月25日〜31日（7日間）のため他媒体と数値の単純比較はできません。</span>
          </span>
        </div>

        {/* フィルター */}
        <div className="flex flex-wrap items-center gap-3">
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

                      {/* キャンペーン名 */}
                      <TableCell className="font-medium max-w-xs">
                        <div className="truncate" title={c.name}>{c.name}</div>
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
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
