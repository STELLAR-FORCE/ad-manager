'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
import {
  TrendingUp,
  TrendingDown,
  MousePointerClick,
  Wallet,
  Target,
  RefreshCw,
  AlertTriangle,
  Info,
  Pencil,
  Check,
  X,
  Bell,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Chip, Meter, ProgressCircle } from '@heroui/react';
import { CountingNumber } from '@/components/animate-ui/counting-number';
import { IntegratedFunnel } from '@/components/dashboard/integrated-funnel';
import { SalesforceSection } from '@/components/dashboard/salesforce-section';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { useSidebarCollapsed } from '@/components/layout/MainLayout';
import { TrendModeToggle, type TrendMode } from '@/components/ad-insights/trend-mode-toggle';
import { type AdType } from '@/lib/campaign-mock-data';

// ─── 型定義 ────────────────────────────────────────────────

type Platform = 'all' | 'google' | 'yahoo' | 'bing';

type Metrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
  cvr: number;
};

type PlatformMetrics = Metrics & { platform: string };

type SummaryData = {
  platform: Platform;
  current: Metrics;
  previous: Metrics;
  byPlatform: PlatformMetrics[];
};

type TrendPoint = {
  date: string;
  google: number;
  yahoo: number;
  bing: number;
  cost: number;
  cpa: number | null;
  conversions: number;
  google_cv: number;
  yahoo_cv: number;
  bing_cv: number;
  google_cpa: number | null;
  yahoo_cpa: number | null;
  bing_cpa: number | null;
};

type BudgetUsage = {
  totalBudget: number;
  totalSpent: number;
  utilization: number;
  byPlatform: { platform: string; budget: number; spent: number; utilization: number }[];
};

type Anomaly = { type: 'warning' | 'info'; message: string };

// ─── 定数 ──────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google',
  yahoo: 'Yahoo!',
  bing: 'Bing',
};

const PLATFORM_COLORS: Record<string, string> = {
  google: '#4285F4',
  yahoo: '#FF0033',
  bing: '#00897B',
};


// ─── フォーマッター ─────────────────────────────────────────

const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const jpyCompact = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  notation: 'compact',
  maximumFractionDigits: 0,
});
const numFormat = new Intl.NumberFormat('ja-JP');
const pctFormat = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const pct1Format = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  maximumFractionDigits: 1,
});
const dateShort = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });
const dateLong = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// ─── 定数 ──────────────────────────────────────────────────

const EMPTY_METRICS: Metrics = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  ctr: 0,
  cpc: 0,
  cpa: 0,
  cvr: 0,
};

// ─── ユーティリティ ─────────────────────────────────────────

function calcDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function buildAnomalies(
  current: Metrics,
  previous: Metrics,
  budget: BudgetUsage | null,
  cpaTarget: number | null,
): Anomaly[] {
  const list: Anomaly[] = [];

  const costDelta = calcDelta(current.cost, previous.cost);
  const cvDelta   = calcDelta(current.conversions, previous.conversions);
  const cpaDelta  = calcDelta(current.cpa, previous.cpa);
  const ctrDelta  = calcDelta(current.ctr, previous.ctr);

  // ── 警告 ─────────────────────────────────────────
  // 目標CPA 20%超過
  if (cpaTarget && current.cpa > 0 && current.cpa > cpaTarget * 1.2)
    list.push({ type: 'warning', message: `CPA が目標値の ${pct1Format.format(current.cpa / cpaTarget)} に達しています（目標 ${jpyFormat.format(cpaTarget)}、実績 ${jpyFormat.format(Math.round(current.cpa))}）` });

  // CPA 前期比 20%悪化
  if (cpaDelta !== null && cpaDelta > 0.2)
    list.push({ type: 'warning', message: `CPA が前期比 ${pctFormat.format(cpaDelta)} 悪化しています` });

  // CV 前期比 30%急落
  if (cvDelta !== null && cvDelta < -0.3)
    list.push({ type: 'warning', message: `CV数が前期比 ${pctFormat.format(Math.abs(cvDelta))} 急落しています` });

  // 予算超過
  if (budget && budget.totalBudget > 0 && budget.utilization > 1)
    list.push({ type: 'warning', message: `月次予算を超過しています（消化率 ${pct1Format.format(budget.utilization)}）` });

  // ── 注意 ─────────────────────────────────────────
  // 費用 前期比 30%急増
  if (costDelta !== null && costDelta > 0.3)
    list.push({ type: 'info', message: `費用が前期比 ${pctFormat.format(costDelta)} 急増しています` });

  // 費用 前期比 30%急減（予算未消化の可能性）
  if (costDelta !== null && costDelta < -0.3)
    list.push({ type: 'info', message: `費用が前期比 ${pctFormat.format(Math.abs(costDelta))} 大幅減少しています（予算未消化の可能性）` });

  // CTR 前期比 20%低下（クリエイティブ疲弊）
  if (ctrDelta !== null && ctrDelta < -0.2)
    list.push({ type: 'info', message: `CTR が前期比 ${pctFormat.format(Math.abs(ctrDelta))} 低下しています（クリエイティブ疲弊の可能性）` });

  // 予算残り 10%未満
  if (budget && budget.totalBudget > 0 && budget.utilization >= 0.9 && budget.utilization <= 1)
    list.push({ type: 'info', message: `月次予算の残り ${pct1Format.format(1 - budget.utilization)} です（消化率 ${pct1Format.format(budget.utilization)}）` });

  return list;
}

// ─── サブコンポーネント ─────────────────────────────────────

function DeltaBadge({
  delta,
  lowerIsBetter = false,
}: {
  delta: number | null;
  lowerIsBetter?: boolean;
}) {
  if (delta === null) return null;
  const isPositive = delta > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  const sign = isPositive ? '+' : '';
  return (
    <span
      className={cn('flex items-center gap-0.5 text-xs tabular-nums', isGood ? 'text-green-600' : 'text-red-500')}
    >
      {isPositive ? (
        <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <TrendingDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      {sign}{pctFormat.format(delta)}
    </span>
  );
}

function TargetBadge({
  actual,
  target,
  lowerIsBetter = false,
  format,
}: {
  actual: number;
  target: number;
  lowerIsBetter?: boolean;
  format: (v: number) => string;
}) {
  const achieved = lowerIsBetter ? actual <= target : actual >= target;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums',
        achieved ? 'text-green-600' : 'text-amber-600'
      )}
    >
      目標 {format(target)}
      <span
        className={cn(
          'inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold',
          achieved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        )}
        aria-label={achieved ? '達成' : '未達'}
      >
        {achieved ? '✓' : '!'}
      </span>
    </span>
  );
}

type KpiProgress = {
  /** 0–100 の達成率・消化率（100超は100に丸めて表示） */
  value: number;
  color: 'accent' | 'success' | 'warning' | 'danger' | 'default';
  label: string;
};

function KpiCard({
  title,
  value,
  rawValue,
  format,
  decimalPlaces,
  fallback,
  sub,
  icon: Icon,
  delta,
  lowerIsBetter,
  deltaLabel,
  target,
  targetFormat,
  actual,
  onSetTarget,
  progress,
}: {
  title: string;
  value?: string;
  rawValue?: number | null;
  format?: (v: number) => string;
  decimalPlaces?: number;
  fallback?: string;
  sub?: string;
  icon: React.ElementType;
  delta?: number | null;
  lowerIsBetter?: boolean;
  deltaLabel: string;
  target?: number | null;
  targetFormat?: (v: number) => string;
  actual?: number;
  onSetTarget?: (val: number | null) => void;
  progress?: KpiProgress | null;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 初回マウントで 0 → target にアニメーション（CSS transition: stroke-dashoffset を活用）
  const [ringValue, setRingValue] = useState(0);
  const targetRing = progress ? Math.max(0, Math.min(progress.value, 100)) : 0;
  useEffect(() => {
    if (!progress) {
      setRingValue(0);
      return;
    }
    const raf = requestAnimationFrame(() => setRingValue(targetRing));
    return () => cancelAnimationFrame(raf);
  }, [progress, targetRing]);

  function startEdit() {
    setInputVal(target ? String(target) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commitEdit() {
    const num = Number(inputVal.replace(/[^0-9]/g, ''));
    onSetTarget?.(num > 0 ? num : null);
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums tracking-tight">
              {rawValue != null && format ? (
                <CountingNumber
                  number={rawValue}
                  format={format}
                  decimalPlaces={decimalPlaces ?? 0}
                  transition={{ stiffness: 260, damping: 32 }}
                />
              ) : (
                value ?? fallback ?? '—'
              )}
            </p>

            {/* 目標比表示 */}
            {onSetTarget && (
              <div className="mt-1.5 flex items-center gap-1.5 min-h-[20px]">
                {editing ? (
                  <>
                    <Input
                      ref={inputRef}
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="h-6 text-xs px-2 w-28"
                      placeholder="例: 6000"
                      aria-label={`${title}の目標値`}
                    />
                    <button
                      onClick={commitEdit}
                      className="text-green-600 hover:text-green-700"
                      aria-label="確定"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                      aria-label="キャンセル"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : target && targetFormat && actual !== undefined ? (
                  <>
                    <TargetBadge
                      actual={actual}
                      target={target}
                      lowerIsBetter={lowerIsBetter}
                      format={targetFormat}
                    />
                    <button
                      onClick={startEdit}
                      className="text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                      aria-label="目標値を編集"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startEdit}
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 transition-colors"
                    aria-label="目標値を設定"
                  >
                    <Pencil className="h-3 w-3" />
                    目標を設定
                  </button>
                )}
              </div>
            )}

            {sub && !onSetTarget && (
              <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>
            )}
          </div>
          {progress ? (
            <div className="relative grid place-items-center size-11 shrink-0">
              <ProgressCircle
                value={ringValue}
                maxValue={100}
                color={progress.color}
                size="lg"
                aria-label={progress.label}
                className="absolute inset-0"
              >
                <ProgressCircle.Track>
                  <ProgressCircle.TrackCircle />
                  <ProgressCircle.FillCircle />
                </ProgressCircle.Track>
              </ProgressCircle>
              <Icon className="h-4 w-4 text-primary relative" aria-hidden="true" />
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-primary/8 shrink-0">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
          )}
        </div>
        {delta != null && (
          <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-border/50">
            <DeltaBadge delta={delta} lowerIsBetter={lowerIsBetter} />
            <span className="text-xs text-muted-foreground/60">{deltaLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}



// ─── メインページ ───────────────────────────────────────────

const TODAY = new Date();

function defaultDateRange(): DateRangeValue {
  // デフォルト：先月
  const prevMonth = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
  const prevMonthEnd = new Date(TODAY.getFullYear(), TODAY.getMonth(), 0);
  return {
    main: { start: prevMonth, end: prevMonthEnd },
    compareEnabled: false,
    preset: 'lastmonth',
  };
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);
  const [platform, setPlatform] = useState<Platform>('all');
  const [adType, setAdType] = useState<AdType | 'all'>('search');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [compareTrend, setCompareTrend] = useState<TrendPoint[]>([]);
  const [budget, setBudget] = useState<BudgetUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialized = useRef(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const { collapsed: sidebarCollapsed } = useSidebarCollapsed();

  // 目標CPA（localStorage永続化）
  const [cpaTarget, setCpaTarget] = useState<number | null>(null);
  const [cvTarget, setCvTarget] = useState<number | null>(null);
  // トレンド表示モード（日別 / 累積）— URL query + localStorage で永続化
  const [trendMode, setTrendModeState] = useState<TrendMode>('daily');
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    const storedCpa = localStorage.getItem('dashboard_cpa_target');
    const storedCv = localStorage.getItem('dashboard_cv_target');
    if (storedCpa) setCpaTarget(Number(storedCpa));
    if (storedCv) setCvTarget(Number(storedCv));
    const urlMode = new URLSearchParams(window.location.search).get('trendMode');
    const storedMode = localStorage.getItem('dashboard_trend_mode');
    const resolved = (urlMode === 'cumulative' || urlMode === 'daily')
      ? urlMode
      : (storedMode === 'cumulative' || storedMode === 'daily')
        ? storedMode
        : 'daily';
    setTrendModeState(resolved);
  }, []);

  function handleSetCpaTarget(val: number | null) {
    setCpaTarget(val);
    val ? localStorage.setItem('dashboard_cpa_target', String(val)) : localStorage.removeItem('dashboard_cpa_target');
  }
  function handleSetCvTarget(val: number | null) {
    setCvTarget(val);
    val ? localStorage.setItem('dashboard_cv_target', String(val)) : localStorage.removeItem('dashboard_cv_target');
  }
  function setTrendMode(mode: TrendMode) {
    setTrendModeState(mode);
    localStorage.setItem('dashboard_trend_mode', mode);
    const url = new URL(window.location.href);
    if (mode === 'daily') url.searchParams.delete('trendMode');
    else url.searchParams.set('trendMode', mode);
    window.history.replaceState(null, '', url.toString());
  }

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh || initialized.current) setRefreshing(true);
      else setLoading(true);
      try {
        if (isRefresh) {
          await fetch('/api/dashboard/revalidate', { method: 'POST' }).catch(() => {});
        }
        // ローカルカレンダー日付を YYYY-MM-DD に。toISOString() を使うと
        // JST(+09:00) → UTC 変換で前日にずれてしまうので使わない
        const fmt = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        const { main, compare, compareEnabled } = dateRange;
        const summaryParams = new URLSearchParams({
          start: fmt(main.start),
          end: fmt(main.end),
          platform,
          adType,
        });
        if (compareEnabled && compare) {
          summaryParams.set('compareStart', fmt(compare.start));
          summaryParams.set('compareEnd', fmt(compare.end));
        }
        const trendParams = new URLSearchParams({
          start: fmt(main.start),
          end: fmt(main.end),
          platform,
          adType,
        });
        const cmpTrendParams = compareEnabled && compare
          ? new URLSearchParams({
              start: fmt(compare.start),
              end: fmt(compare.end),
              platform,
              adType,
            })
          : null;

        const fetches: Promise<Response>[] = [
          fetch(`/api/dashboard/summary?${summaryParams}`),
          fetch(`/api/dashboard/trend?${trendParams}`),
          fetch('/api/dashboard/budget-usage'),
          ...(cmpTrendParams ? [fetch(`/api/dashboard/trend?${cmpTrendParams}`)] : []),
        ];
        const responses = await Promise.all(fetches);
        const [sData, tData, bData, cmpData] = await Promise.all(responses.map((r) => r.json()));
        setSummary(sData.current ? sData : null);
        setTrend(Array.isArray(tData) ? tData : []);
        setCompareTrend(cmpData && Array.isArray(cmpData) ? cmpData : []);
        setBudget(bData.byPlatform ? bData : null);
        setLastUpdated(new Date());

        const fetchedAtTimes = responses
          .map((r) => r.headers.get('X-Cache-Fetched-At'))
          .filter((s): s is string => Boolean(s))
          .map((s) => new Date(s).getTime())
          .filter((t) => !Number.isNaN(t));
        setCacheFetchedAt(fetchedAtTimes.length ? new Date(Math.min(...fetchedAtTimes)) : null);
      } catch {
        setSummary(null);
        setTrend([]);
        setCompareTrend([]);
        setBudget(null);
      } finally {
        initialized.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateRange, platform, adType]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasSummary = summary !== null && summary.current.impressions > 0;
  const hasTrend = trend.length > 0;
  const current: Metrics = summary?.current ?? EMPTY_METRICS;
  const previous: Metrics = summary?.previous ?? EMPTY_METRICS;
  const byPlatform: PlatformMetrics[] = summary?.byPlatform ?? [];
  const displayTrend = trend;
  const deltaLabel = dateRange.compareEnabled ? '比較期間比' : '前期間比';
  const anomalies = hasSummary ? buildAnomalies(current, previous, budget, cpaTarget) : [];

  // 比較トレンドをインデックス合わせでマージ + 累積計算
  const showCompare = dateRange.compareEnabled && compareTrend.length > 0;
  const chartData = useMemo(() => {
    let cumCost = 0;
    let cumCv = 0;
    let cumGoogleCost = 0;
    let cumYahooCost = 0;
    let cumBingCost = 0;
    let cumGoogleCv = 0;
    let cumYahooCv = 0;
    let cumBingCv = 0;
    let cumCmpCost = 0;
    let cumCmpCv = 0;
    return displayTrend.map((d, i) => {
      const cmp = compareTrend[i];
      cumCost += d.cost;
      cumCv += d.conversions;
      cumGoogleCost += d.google;
      cumYahooCost += d.yahoo;
      cumBingCost += d.bing;
      cumGoogleCv += d.google_cv;
      cumYahooCv += d.yahoo_cv;
      cumBingCv += d.bing_cv;
      if (cmp) {
        cumCmpCost += cmp.cost;
        cumCmpCv += cmp.conversions;
      }
      return {
        ...d,
        label: dateShort.format(new Date(d.date)),
        cpaTargetLine: cpaTarget ?? undefined,
        cmp_cpa: cmp?.cpa ?? null,
        cmp_cv: cmp?.conversions ?? null,
        cmp_date: cmp?.date ?? null,
        cpa_cum: cumCv > 0 ? Math.round(cumCost / cumCv) : null,
        cv_cum: cumCv,
        google_cv_cum: cumGoogleCv,
        yahoo_cv_cum: cumYahooCv,
        bing_cv_cum: cumBingCv,
        google_cpa_cum: cumGoogleCv > 0 ? Math.round(cumGoogleCost / cumGoogleCv) : null,
        yahoo_cpa_cum: cumYahooCv > 0 ? Math.round(cumYahooCost / cumYahooCv) : null,
        bing_cpa_cum: cumBingCv > 0 ? Math.round(cumBingCost / cumBingCv) : null,
        cmp_cpa_cum: cmp ? (cumCmpCv > 0 ? Math.round(cumCmpCost / cumCmpCv) : null) : null,
        cmp_cv_cum: cmp ? cumCmpCv : null,
      };
    });
  }, [displayTrend, compareTrend, cpaTarget]);


  // 最終更新テキスト
  function formatLastUpdated(d: Date | null): string {
    if (!d) return '';
    const diffMs = Date.now() - d.getTime();
    const diffM = Math.floor(diffMs / 60_000);
    if (diffM < 1) return '今更新';
    if (diffM < 60) return `${diffM}分前に更新`;
    return `${timeFormat.format(d)} に更新`;
  }

  // サーバーキャッシュの取得時刻からの経過テキスト（nowTick で 30 秒ごとに再評価）
  function formatCacheAge(d: Date | null, now: number): string {
    if (!d) return '';
    const diffMs = now - d.getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return 'たった今のデータ';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} 分前のデータ`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour} 時間前のデータ`;
    return `${timeFormat.format(d)} のデータ`;
  }

  return (
      <div className="space-y-6">

        {/* ─── ヘッダー ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground/50 tabular-nums mt-0.5">
                {formatLastUpdated(lastUpdated)}
              </p>
            )}
          </div>

          {/* 日付範囲ピッカー */}
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            today={TODAY}
          />

          {/* 媒体プルダウン */}
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <SelectTrigger className="w-40" aria-label="媒体">
              <span className="text-xs text-muted-foreground/70 mr-1.5 shrink-0">媒体</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全媒体</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="yahoo">Yahoo!</SelectItem>
              <SelectItem value="bing">Bing</SelectItem>
            </SelectContent>
          </Select>

          {/* 種別プルダウン */}
          <Select value={adType} onValueChange={(v) => setAdType(v as AdType | 'all')}>
            <SelectTrigger className="w-44" aria-label="種別">
              <span className="text-xs text-muted-foreground/70 mr-1.5 shrink-0">種別</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての種別</SelectItem>
              <SelectItem value="search">検索</SelectItem>
              <SelectItem value="display">ディスプレイ</SelectItem>
            </SelectContent>
          </Select>

          {/* 通知ベル（常時表示） */}
          <Popover>
            <PopoverTrigger
              className="relative p-2 rounded-md hover:bg-accent transition-colors"
              aria-label={anomalies.length > 0 ? `通知 ${anomalies.length}件` : '通知なし'}
            >
              <Bell
                className={cn('h-4 w-4', anomalies.length > 0 ? 'text-foreground' : 'text-muted-foreground/50')}
                aria-hidden="true"
              />
              {anomalies.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white tabular-nums">
                  {anomalies.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-medium">アラート</p>
                {anomalies.length > 0 && (
                  <span className="text-xs text-muted-foreground">{anomalies.length}件</span>
                )}
              </div>
              {anomalies.length > 0 ? (
                <div className="divide-y divide-border">
                  {anomalies.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                      {a.type === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
                      ) : (
                        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" aria-hidden="true" />
                      )}
                      <span className="text-muted-foreground leading-relaxed">{a.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  現在アラートはありません
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* 再読み込みボタン */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            aria-label="再読み込み"
          >
            <RefreshCw
              className={cn('h-4 w-4', refreshing && 'animate-spin')}
              aria-hidden="true"
            />
            {refreshing ? '読み込み中…' : '再読み込み'}
          </Button>
        </div>

        {/* ─── ファネルフロー ─── */}
        {loading ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">読み込み中…</CardContent>
          </Card>
        ) : (
          <IntegratedFunnel
            adMetrics={{
              impressions: current.impressions,
              clicks: current.clicks,
              cost: current.cost,
              conversions: current.conversions,
            }}
            dateRange={dateRange}
          />
        )}

        {/* ─── KPIカード ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="総費用"
            rawValue={Math.round(current.cost)}
            format={(v) => jpyFormat.format(v)}
            sub="期間累計"
            icon={Wallet}
            delta={calcDelta(current.cost, previous.cost)}
            deltaLabel={deltaLabel}
            progress={(() => {
              if (!budget?.totalBudget) return null;
              const rawPct = (budget.totalSpent / budget.totalBudget) * 100;
              const color: KpiProgress['color'] = rawPct >= 100 ? 'danger' : rawPct >= 80 ? 'warning' : 'success';
              return {
                value: rawPct,
                color,
                label: `予算消化率 ${pct1Format.format(budget.totalSpent / budget.totalBudget)}`,
              };
            })()}
          />
          <KpiCard
            title="CV数"
            rawValue={Math.round(current.conversions)}
            format={(v) => numFormat.format(v)}
            icon={Target}
            delta={calcDelta(current.conversions, previous.conversions)}
            deltaLabel={deltaLabel}
            target={cvTarget}
            targetFormat={(v) => numFormat.format(v) + '件'}
            actual={current.conversions}
            onSetTarget={handleSetCvTarget}
            progress={(() => {
              if (!cvTarget || cvTarget <= 0) return null;
              const rawPct = (current.conversions / cvTarget) * 100;
              return {
                value: rawPct,
                color: rawPct >= 100 ? 'success' : 'accent',
                label: `CV目標達成率 ${pct1Format.format(current.conversions / cvTarget)}`,
              };
            })()}
          />
          <KpiCard
            title="CPA"
            rawValue={current.cpa > 0 ? Math.round(current.cpa) : null}
            format={(v) => jpyFormat.format(v)}
            fallback="—"
            icon={TrendingUp}
            delta={calcDelta(current.cpa, previous.cpa)}
            lowerIsBetter
            deltaLabel={deltaLabel}
            target={cpaTarget}
            targetFormat={(v) => jpyFormat.format(v)}
            actual={current.cpa}
            onSetTarget={handleSetCpaTarget}
            progress={(() => {
              if (!cpaTarget || cpaTarget <= 0 || current.cpa <= 0) return null;
              const ratio = cpaTarget / current.cpa;
              const rawPct = ratio * 100;
              const color: KpiProgress['color'] =
                current.cpa <= cpaTarget ? 'success' : current.cpa <= cpaTarget * 1.2 ? 'warning' : 'danger';
              return {
                value: rawPct,
                color,
                label: `CPA目標達成率 ${pct1Format.format(ratio)}`,
              };
            })()}
          />
          <KpiCard
            title="CVR"
            rawValue={current.cvr > 0 ? current.cvr : null}
            format={(v) => pctFormat.format(v)}
            decimalPlaces={4}
            fallback="—"
            sub="クリック→CV率"
            icon={MousePointerClick}
            delta={calcDelta(current.cvr, previous.cvr)}
            deltaLabel={deltaLabel}
          />
        </div>

        {/* ─── チャート ─── */}
        <div className="grid grid-cols-1 gap-4">
          {/* CPA推移・CV推移 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  CPA推移
                  <span className="text-xs font-normal text-muted-foreground/60">広告経由のCV</span>
                  {cpaTarget && (
                    <span className="text-xs font-normal text-muted-foreground/60 tabular-nums">
                      目標 {jpyFormat.format(cpaTarget)}
                    </span>
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!hasTrend ? (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  選択期間のデータがありません
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => jpyCompact.format(v)}
                    width={52}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as typeof chartData[0];
                      return (
                        <div className="rounded-lg border border-border bg-background shadow-md p-3 text-xs space-y-1.5 min-w-[180px]">
                          <p className="font-medium text-foreground">{label}</p>
                          <div className="flex justify-between gap-4">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#6366f1] shrink-0" />
                              <span className="text-muted-foreground">当日</span>
                            </span>
                            <span className="tabular-nums font-semibold">{d.cpa != null ? jpyFormat.format(d.cpa) : '—'}</span>
                          </div>
                          {showCompare && (
                            <div className="flex justify-between gap-4">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[#f97316] shrink-0" />
                                <span className="text-muted-foreground">
                                  比較{d.cmp_date ? `（${dateShort.format(new Date(d.cmp_date))}）` : ''}
                                </span>
                              </span>
                              <span className="tabular-nums">{d.cmp_cpa != null ? jpyFormat.format(d.cmp_cpa) : '—'}</span>
                            </div>
                          )}
                          {platform === 'all' && (
                            <div className="pt-1 border-t border-border/50 space-y-1.5">
                              {(['google', 'yahoo', 'bing'] as const).map((p) => {
                                const v = d[`${p}_cpa`];
                                return (
                                  <div key={p} className="flex justify-between gap-4">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                                      <span className="text-muted-foreground">{PLATFORM_LABELS[p]}</span>
                                    </span>
                                    <span className="tabular-nums">{v != null ? jpyFormat.format(v) : '—'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {cpaTarget && (
                            <div className="flex justify-between gap-4 pt-1 border-t border-border/50">
                              <span className="text-muted-foreground">目標</span>
                              <span className="tabular-nums">{jpyFormat.format(cpaTarget)}</span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* 目標ライン */}
                  {cpaTarget && (
                    <Line
                      type="monotone"
                      dataKey="cpaTargetLine"
                      name="目標CPA"
                      stroke="hsl(var(--border))"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                      isAnimationActive={!reducedMotion}
                    />
                  )}
                  {showCompare && (
                    <Line
                      type="monotone"
                      dataKey="cmp_cpa"
                      name="比較期間"
                      stroke="#f97316"
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      dot={false}
                      connectNulls
                      isAnimationActive={!reducedMotion}
                    />
                  )}
                  {platform === 'all' ? (
                    (['google', 'yahoo', 'bing'] as const).map((p) => (
                      <Line
                        key={p}
                        type="monotone"
                        dataKey={`${p}_cpa`}
                        name={PLATFORM_LABELS[p]}
                        stroke={PLATFORM_COLORS[p]}
                        strokeWidth={1.75}
                        dot={{ r: 2.5, fill: PLATFORM_COLORS[p] }}
                        connectNulls
                        isAnimationActive={!reducedMotion}
                      />
                    ))
                  ) : (
                    <Line
                      type="monotone"
                      dataKey="cpa"
                      name="当日"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#6366f1' }}
                      connectNulls
                      isAnimationActive={!reducedMotion}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* CV推移 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  CV推移
                  <span className="text-xs font-normal text-muted-foreground/60">広告経由のCV</span>
                </span>
                <TrendModeToggle mode={trendMode} onChange={setTrendMode} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!hasTrend ? (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  選択期間のデータがありません
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={220}>
                {trendMode === 'cumulative' ? (
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      {(['google', 'yahoo', 'bing'] as const).map((p) => (
                        <linearGradient key={p} id={`cv-cum-${p}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.08} />
                        </linearGradient>
                      ))}
                      <linearGradient id="cv-cum-single" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => numFormat.format(v)}
                      width={36}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as typeof chartData[0];
                        return (
                          <div className="rounded-lg border border-border bg-background shadow-md p-3 text-xs space-y-1.5 min-w-[180px]">
                            <p className="font-medium text-foreground">
                              {label}
                              <span className="ml-1.5 text-muted-foreground font-normal">までの累計</span>
                            </p>
                            <div className="flex justify-between gap-4">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[#10b981] shrink-0" />
                                <span className="text-muted-foreground">期間累計</span>
                              </span>
                              <span className="tabular-nums font-semibold">{numFormat.format(d.cv_cum)}</span>
                            </div>
                            {showCompare && (
                              <div className="flex justify-between gap-4">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-[#f97316] shrink-0" />
                                  <span className="text-muted-foreground">
                                    比較期間累計{d.cmp_date ? `（${dateShort.format(new Date(d.cmp_date))}）` : ''}
                                  </span>
                                </span>
                                <span className="tabular-nums">{d.cmp_cv_cum != null ? numFormat.format(d.cmp_cv_cum) : '—'}</span>
                              </div>
                            )}
                            {platform === 'all' && (
                              <div className="pt-1 border-t border-border/50 space-y-1.5">
                                {(['google', 'yahoo', 'bing'] as const).map((p) => (
                                  <div key={p} className="flex justify-between gap-4">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                                      <span className="text-muted-foreground">{PLATFORM_LABELS[p]}</span>
                                    </span>
                                    <span className="tabular-nums">{numFormat.format(d[`${p}_cv_cum`])}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {showCompare && (
                      <Area
                        type="monotone"
                        dataKey="cmp_cv_cum"
                        name="比較期間"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                        fill="#f97316"
                        fillOpacity={0.05}
                        isAnimationActive={!reducedMotion}
                      />
                    )}
                    {platform === 'all' ? (
                      (['google', 'yahoo', 'bing'] as const).map((p) => (
                        <Area
                          key={p}
                          type="monotone"
                          dataKey={`${p}_cv_cum`}
                          name={PLATFORM_LABELS[p]}
                          stackId="cv"
                          stroke={PLATFORM_COLORS[p]}
                          strokeWidth={1.5}
                          fill={`url(#cv-cum-${p})`}
                          isAnimationActive={!reducedMotion}
                        />
                      ))
                    ) : (
                      <Area
                        type="monotone"
                        dataKey="cv_cum"
                        name="期間累計"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#cv-cum-single)"
                        isAnimationActive={!reducedMotion}
                      />
                    )}
                  </AreaChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => numFormat.format(v)}
                      width={36}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as typeof chartData[0];
                        return (
                          <div className="rounded-lg border border-border bg-background shadow-md p-3 text-xs space-y-1.5 min-w-[180px]">
                            <p className="font-medium text-foreground">{label}</p>
                            <div className="flex justify-between gap-4">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[#10b981] shrink-0" />
                                <span className="text-muted-foreground">当日</span>
                              </span>
                              <span className="tabular-nums font-semibold">{numFormat.format(d.conversions)}</span>
                            </div>
                            {showCompare && (
                              <div className="flex justify-between gap-4">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-[#f97316] shrink-0" />
                                  <span className="text-muted-foreground">
                                    比較{d.cmp_date ? `（${dateShort.format(new Date(d.cmp_date))}）` : ''}
                                  </span>
                                </span>
                                <span className="tabular-nums">{d.cmp_cv != null ? numFormat.format(d.cmp_cv) : '—'}</span>
                              </div>
                            )}
                            {platform === 'all' && (
                              <div className="pt-1 border-t border-border/50 space-y-1.5">
                                {(['google', 'yahoo', 'bing'] as const).map((p) => (
                                  <div key={p} className="flex justify-between gap-4">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                                      <span className="text-muted-foreground">{PLATFORM_LABELS[p]}</span>
                                    </span>
                                    <span className="tabular-nums">{numFormat.format(d[`${p}_cv`])}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {showCompare && (
                      <Line
                        type="monotone"
                        dataKey="cmp_cv"
                        name="比較期間"
                        stroke="#f97316"
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                        dot={false}
                        connectNulls
                        isAnimationActive={!reducedMotion}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="conversions"
                      name="当日"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#10b981' }}
                      connectNulls
                      isAnimationActive={!reducedMotion}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          </div>
        </div>

        {/* ─── 媒体別サマリー（全媒体時のみ） ─── */}
        {platform === 'all' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {byPlatform.map((s) => {
              const budgetRow = budget?.byPlatform.find((b) => b.platform === s.platform);
              const utilPct = budgetRow ? budgetRow.utilization * 100 : null;
              const meterColor: 'success' | 'warning' | 'danger' =
                utilPct == null ? 'success' : utilPct > 100 ? 'danger' : utilPct > 80 ? 'warning' : 'success';
              return (
              <Card key={s.platform}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Chip size="sm" variant="soft" className="gap-1.5 font-semibold">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: PLATFORM_COLORS[s.platform] }}
                        aria-hidden="true"
                      />
                      <Chip.Label>{PLATFORM_LABELS[s.platform]}</Chip.Label>
                    </Chip>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs mb-0.5">費用</p>
                      <p className="font-semibold tabular-nums">
                        {jpyFormat.format(Math.round(s.cost))}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-0.5">CV数</p>
                      <p className="font-semibold tabular-nums">
                        {numFormat.format(Math.round(s.conversions))}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-0.5">CPA</p>
                      <p className="font-semibold tabular-nums">
                        {s.cpa > 0 ? jpyFormat.format(Math.round(s.cpa)) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-0.5">CVR</p>
                      <p className="font-semibold tabular-nums">
                        {s.cvr > 0 ? pctFormat.format(s.cvr) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-0.5">CTR</p>
                      <p className="font-semibold tabular-nums">
                        {s.ctr > 0 ? pctFormat.format(s.ctr) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-0.5">CPC</p>
                      <p className="font-semibold tabular-nums">
                        {s.cpc > 0 ? jpyFormat.format(Math.round(s.cpc)) : '—'}
                      </p>
                    </div>
                  </div>
                  {budgetRow && utilPct != null && (
                    <div className="mt-4 pt-3 border-t border-border/50 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">予算消化率</span>
                        <span className="tabular-nums font-medium">
                          {pct1Format.format(budgetRow.utilization)}
                          <span className="text-muted-foreground/60 ml-1">
                            （{jpyCompact.format(budgetRow.spent)} / {jpyCompact.format(budgetRow.budget)}）
                          </span>
                        </span>
                      </div>
                      <Meter
                        aria-label={`${PLATFORM_LABELS[s.platform]} 予算消化率`}
                        value={Math.min(100, utilPct)}
                        maxValue={100}
                        size="sm"
                        color={meterColor}
                        className="w-full"
                      >
                        <Meter.Track>
                          <Meter.Fill />
                        </Meter.Track>
                      </Meter>
                    </div>
                  )}
                </CardContent>
              </Card>
            );})}
          </div>
        )}

        {/* ─── 営業パイプライン（Salesforce） ─── */}
        <SalesforceSection dateRange={dateRange} />

        {/* ─── キャッシュ取得時刻インジケーター（左下固定） ─── */}
        {cacheFetchedAt && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-4 z-40 px-3 py-1.5 rounded-full border bg-background/85 backdrop-blur text-xs text-muted-foreground tabular-nums shadow-sm pointer-events-none"
            style={{ left: `calc(${sidebarCollapsed ? '4rem' : '15rem'} + 1rem)` }}
          >
            {formatCacheAge(cacheFetchedAt, nowTick)}
          </div>
        )}
      </div>
  );
}
