'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
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
import {
  TrendingUp,
  TrendingDown,
  MousePointerClick,
  Wallet,
  Target,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Info,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

// ─── 型定義 ────────────────────────────────────────────────

type Period = '7d' | '14d' | '30d' | 'month' | 'lastmonth';
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
  period: Period;
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
};

type BudgetPlatform = {
  platform: string;
  budget: number;
  spent: number;
  utilization: number;
};

type BudgetUsage = {
  totalBudget: number;
  totalSpent: number;
  utilization: number;
  byPlatform: BudgetPlatform[];
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

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7d', label: '直近7日' },
  { value: '14d', label: '直近14日' },
  { value: '30d', label: '直近30日' },
  { value: 'month', label: '今月' },
  { value: 'lastmonth', label: '先月' },
];

const PERIOD_SUBTITLE: Record<Period, string> = {
  '7d': '直近7日間',
  '14d': '直近14日間',
  '30d': '直近30日間',
  month: '今月',
  lastmonth: '先月',
};

const DELTA_LABEL: Record<Period, string> = {
  '7d': '前7日比',
  '14d': '前14日比',
  '30d': '前30日比',
  month: '前月比',
  lastmonth: '前月比',
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
const dateShort = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// ─── モックデータ ───────────────────────────────────────────

const MOCK_SUMMARY: SummaryData = {
  period: '7d',
  platform: 'all',
  current: {
    impressions: 1_234_567,
    clicks: 18_234,
    cost: 1_245_000,
    conversions: 215,
    ctr: 0.01477,
    cpc: 68.3,
    cpa: 5790,
    cvr: 0.0118,
  },
  previous: {
    impressions: 1_102_345,
    clicks: 16_543,
    cost: 1_123_000,
    conversions: 189,
    ctr: 0.01501,
    cpc: 67.9,
    cpa: 5942,
    cvr: 0.01142,
  },
  byPlatform: [
    {
      platform: 'google',
      impressions: 756_234,
      clicks: 11_234,
      cost: 756_000,
      conversions: 132,
      ctr: 0.01486,
      cpc: 67.3,
      cpa: 5727,
      cvr: 0.01175,
    },
    {
      platform: 'yahoo',
      impressions: 378_456,
      clicks: 5_234,
      cost: 356_000,
      conversions: 63,
      ctr: 0.01383,
      cpc: 68.0,
      cpa: 5651,
      cvr: 0.01204,
    },
    {
      platform: 'bing',
      impressions: 99_877,
      clicks: 1_766,
      cost: 133_000,
      conversions: 20,
      ctr: 0.01768,
      cpc: 75.3,
      cpa: 6650,
      cvr: 0.01133,
    },
  ],
};

const MOCK_BUDGET: BudgetUsage = {
  totalBudget: 2_000_000,
  totalSpent: 1_245_000,
  utilization: 0.6225,
  byPlatform: [
    { platform: 'google', budget: 1_200_000, spent: 756_000, utilization: 0.63 },
    { platform: 'yahoo', budget: 600_000, spent: 356_000, utilization: 0.593 },
    { platform: 'bing', budget: 200_000, spent: 133_000, utilization: 0.665 },
  ],
};

function getMockTrendData(period: Period): TrendPoint[] {
  const today = new Date('2026-03-27');
  const days =
    period === '14d'
      ? 14
      : period === '30d'
        ? 30
        : period === 'month'
          ? 27
          : period === 'lastmonth'
            ? 28
            : 7;

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1) + i);
    const t = i / Math.max(days - 1, 1);
    const wave = Math.sin(i * 2.3) * 0.12 + Math.sin(i * 5.7) * 0.06;
    const google = Math.round((58 + wave * 58 + t * 25) * 1000);
    const yahoo = Math.round((33 + wave * 33 + t * 15) * 1000);
    const bing = Math.round((14 + wave * 14 + t * 8) * 1000);
    const cost = google + yahoo + bing;
    const conversions = Math.max(1, Math.round(cost / 6100));
    return {
      date: date.toISOString().split('T')[0],
      google,
      yahoo,
      bing,
      cost,
      cpa: Math.round(cost / conversions),
    };
  });
}

// ─── ユーティリティ ─────────────────────────────────────────

function calcDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function buildAnomalies(current: Metrics, previous: Metrics): Anomaly[] {
  const list: Anomaly[] = [];
  const costDelta = calcDelta(current.cost, previous.cost);
  const cvDelta = calcDelta(current.conversions, previous.conversions);
  const cpaDelta = calcDelta(current.cpa, previous.cpa);

  if (costDelta !== null && costDelta > 0.3)
    list.push({ type: 'warning', message: `費用が前期比 ${pctFormat.format(costDelta)} 急増しています` });
  if (cvDelta !== null && cvDelta < -0.2)
    list.push({ type: 'warning', message: `CV数が前期比 ${pctFormat.format(Math.abs(cvDelta))} 急落しています` });
  if (cpaDelta !== null && cpaDelta > 0.2)
    list.push({ type: 'warning', message: `CPA が前期比 ${pctFormat.format(cpaDelta)} 悪化しています` });
  if (costDelta !== null && costDelta < -0.3)
    list.push({ type: 'info', message: `費用が前期比 ${pctFormat.format(Math.abs(costDelta))} 大幅減少しています（予算未消化の可能性）` });

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

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  delta,
  lowerIsBetter,
  deltaLabel,
  target,
  targetFormat,
  actual,
  onSetTarget,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  delta?: number | null;
  lowerIsBetter?: boolean;
  deltaLabel: string;
  target?: number | null;
  targetFormat?: (v: number) => string;
  actual?: number;
  onSetTarget?: (val: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500">{title}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>

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
                      className="text-slate-400 hover:text-slate-600"
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
                      className="text-slate-300 hover:text-slate-500 transition-colors"
                      aria-label="目標値を編集"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startEdit}
                    className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                    aria-label="目標値を設定"
                  >
                    <Pencil className="h-3 w-3" />
                    目標を設定
                  </button>
                )}
              </div>
            )}

            {sub && !onSetTarget && (
              <p className="text-xs text-slate-400 mt-1">{sub}</p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-blue-50 shrink-0">
            <Icon className="h-5 w-5 text-blue-600" aria-hidden="true" />
          </div>
        </div>
        {delta != null && (
          <div className="flex items-center gap-1.5 mt-3 pt-2 border-t">
            <DeltaBadge delta={delta} lowerIsBetter={lowerIsBetter} />
            <span className="text-xs text-slate-400">{deltaLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelFlow({ metrics, isMock }: { metrics: Metrics; isMock: boolean }) {
  const { impressions, clicks, cost, conversions, ctr, cvr, cpc, cpa } = metrics;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          表示→クリック→CV フロー
          {isMock && (
            <Badge variant="secondary" className="text-xs font-normal">
              サンプル
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center gap-1 flex-wrap">
          <div className="text-center px-3 py-2">
            <p className="text-xs text-slate-500 mb-1">表示数</p>
            <p className="text-2xl font-bold tabular-nums text-slate-800">
              {numFormat.format(impressions)}
            </p>
          </div>
          <div className="flex flex-col items-center gap-0.5 px-1">
            <span className="text-sm font-semibold tabular-nums text-blue-600">
              {pctFormat.format(ctr)}
            </span>
            <span className="text-xs text-slate-400">CTR</span>
            <ArrowRight className="h-4 w-4 text-slate-300 mt-0.5" aria-hidden="true" />
          </div>
          <div className="text-center px-3 py-2">
            <p className="text-xs text-slate-500 mb-1">クリック数</p>
            <p className="text-2xl font-bold tabular-nums text-blue-700">
              {numFormat.format(clicks)}
            </p>
          </div>
          <div className="flex flex-col items-center gap-0.5 px-1">
            <span className="text-sm font-semibold tabular-nums text-green-600">
              {pctFormat.format(cvr)}
            </span>
            <span className="text-xs text-slate-400">CVR</span>
            <ArrowRight className="h-4 w-4 text-slate-300 mt-0.5" aria-hidden="true" />
          </div>
          <div className="text-center px-3 py-2">
            <p className="text-xs text-slate-500 mb-1">CV数</p>
            <p className="text-2xl font-bold tabular-nums text-green-700">
              {numFormat.format(Math.round(conversions))}
            </p>
          </div>
        </div>
        <div className="flex justify-center gap-6 lg:gap-12 mt-4 pt-4 border-t">
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">費用</p>
            <p className="font-semibold tabular-nums text-sm">{jpyFormat.format(Math.round(cost))}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">CPC</p>
            <p className="font-semibold tabular-nums text-sm">
              {cpc > 0 ? jpyFormat.format(Math.round(cpc)) : '—'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">CPA</p>
            <p className="font-semibold tabular-nums text-sm">
              {cpa > 0 ? jpyFormat.format(Math.round(cpa)) : '—'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetBar({
  spent,
  budget,
  utilization,
  label,
}: {
  spent: number;
  budget: number;
  utilization: number;
  label: string;
}) {
  const pct = Math.min(utilization * 100, 100);
  const color =
    utilization >= 0.9
      ? 'bg-red-500'
      : utilization >= 0.75
        ? 'bg-amber-400'
        : 'bg-blue-500';

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-slate-600 font-medium">{label}</span>
        <span className="text-slate-500 tabular-nums">
          {jpyFormat.format(Math.round(spent))}
          {budget > 0 && (
            <span className="text-slate-400"> / {jpyFormat.format(Math.round(budget))}</span>
          )}
          {budget > 0 && (
            <span
              className={cn(
                'ml-1.5 font-semibold tabular-nums',
                utilization >= 0.9 ? 'text-red-600' : utilization >= 0.75 ? 'text-amber-600' : 'text-slate-700'
              )}
            >
              {new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 1 }).format(utilization)}
            </span>
          )}
        </span>
      </div>
      {budget > 0 ? (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn('h-2 rounded-full transition-all', color)}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} 予算消化率 ${Math.round(pct)}%`}
          />
        </div>
      ) : (
        <div className="h-2 bg-slate-100 rounded-full" aria-label="予算未設定" />
      )}
    </div>
  );
}

// ─── メインページ ───────────────────────────────────────────

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [platform, setPlatform] = useState<Platform>('all');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [budget, setBudget] = useState<BudgetUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 目標CPA（localStorage永続化）
  const [cpaTarget, setCpaTarget] = useState<number | null>(null);
  const [cvTarget, setCvTarget] = useState<number | null>(null);
  useEffect(() => {
    const storedCpa = localStorage.getItem('dashboard_cpa_target');
    const storedCv = localStorage.getItem('dashboard_cv_target');
    if (storedCpa) setCpaTarget(Number(storedCpa));
    if (storedCv) setCvTarget(Number(storedCv));
  }, []);

  function handleSetCpaTarget(val: number | null) {
    setCpaTarget(val);
    val ? localStorage.setItem('dashboard_cpa_target', String(val)) : localStorage.removeItem('dashboard_cpa_target');
  }
  function handleSetCvTarget(val: number | null) {
    setCvTarget(val);
    val ? localStorage.setItem('dashboard_cv_target', String(val)) : localStorage.removeItem('dashboard_cv_target');
  }

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const [sRes, tRes, bRes] = await Promise.all([
          fetch(`/api/dashboard/summary?period=${period}&platform=${platform}`),
          fetch(`/api/dashboard/trend?period=${period}&platform=${platform}`),
          fetch('/api/dashboard/budget-usage'),
        ]);
        const [sData, tData, bData] = await Promise.all([sRes.json(), tRes.json(), bRes.json()]);
        setSummary(sData.current ? sData : null);
        setTrend(Array.isArray(tData) ? tData : []);
        setBudget(bData.byPlatform ? bData : null);
        setLastUpdated(new Date());
      } catch {
        setSummary(null);
        setTrend([]);
        setBudget(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period, platform]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isMock = !summary?.current.impressions;
  const displaySummary = isMock ? MOCK_SUMMARY : summary!;
  const displayTrend = trend.length > 0 ? trend : getMockTrendData(period);
  const displayBudget = budget?.byPlatform.length ? budget : MOCK_BUDGET;

  const { current, previous, byPlatform } = displaySummary;
  const deltaLabel = DELTA_LABEL[period];
  const anomalies = isMock ? [] : buildAnomalies(current, previous);

  // チャート用データ（日付ラベル + 目標ラインを埋め込む）
  const chartData = displayTrend.map((d) => ({
    ...d,
    label: dateShort.format(new Date(d.date)),
    cpaTargetLine: cpaTarget ?? undefined,
  }));

  // 最終更新テキスト
  function formatLastUpdated(d: Date | null): string {
    if (!d) return '';
    const diffMs = Date.now() - d.getTime();
    const diffM = Math.floor(diffMs / 60_000);
    if (diffM < 1) return '今更新';
    if (diffM < 60) return `${diffM}分前に更新`;
    return `${timeFormat.format(d)} に更新`;
  }

  return (
    <MainLayout>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        メインコンテンツへスキップ
      </a>
      <div id="main-content" className="space-y-6">

        {/* ─── ヘッダー ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">ダッシュボード</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-slate-500">{PERIOD_SUBTITLE[period]}の実績サマリー</p>
              {lastUpdated && (
                <span className="text-xs text-slate-400 tabular-nums">
                  · {formatLastUpdated(lastUpdated)}
                </span>
              )}
            </div>
          </div>

          {/* 期間プルダウン */}
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 媒体プルダウン */}
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全媒体</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="yahoo">Yahoo!</SelectItem>
              <SelectItem value="bing">Bing</SelectItem>
            </SelectContent>
          </Select>

          {/* 更新ボタン */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            aria-label="データを更新"
          >
            <RefreshCw
              className={cn('h-4 w-4', refreshing && 'animate-spin')}
              aria-hidden="true"
            />
            {refreshing ? '更新中…' : 'データ更新'}
          </Button>
        </div>

        {/* ─── 異常値バナー ─── */}
        {anomalies.length > 0 && (
          <div className="space-y-2">
            {anomalies.map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 rounded-md px-4 py-3 text-sm border',
                  a.type === 'warning'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                )}
                role="alert"
              >
                {a.type === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                )}
                {a.message}
              </div>
            ))}
          </div>
        )}

        {/* ─── サンプルデータ通知 ─── */}
        {isMock && !loading && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700 flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            API連携前のため、サンプルデータを表示しています
          </div>
        )}

        {/* ─── ファネルフロー ─── */}
        {loading ? (
          <Card>
            <CardContent className="pt-6 text-center text-slate-400">読み込み中…</CardContent>
          </Card>
        ) : (
          <FunnelFlow metrics={current} isMock={isMock} />
        )}

        {/* ─── KPIカード ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="総費用"
            value={jpyFormat.format(Math.round(current.cost))}
            sub={PERIOD_SUBTITLE[period] + '累計'}
            icon={Wallet}
            delta={calcDelta(current.cost, previous.cost)}
            deltaLabel={deltaLabel}
          />
          <KpiCard
            title="CV数"
            value={numFormat.format(Math.round(current.conversions))}
            icon={Target}
            delta={calcDelta(current.conversions, previous.conversions)}
            deltaLabel={deltaLabel}
            target={cvTarget}
            targetFormat={(v) => numFormat.format(v) + '件'}
            actual={current.conversions}
            onSetTarget={handleSetCvTarget}
          />
          <KpiCard
            title="CPA"
            value={current.cpa > 0 ? jpyFormat.format(Math.round(current.cpa)) : '—'}
            icon={TrendingUp}
            delta={calcDelta(current.cpa, previous.cpa)}
            lowerIsBetter
            deltaLabel={deltaLabel}
            target={cpaTarget}
            targetFormat={(v) => jpyFormat.format(v)}
            actual={current.cpa}
            onSetTarget={handleSetCpaTarget}
          />
          <KpiCard
            title="CVR"
            value={current.cvr > 0 ? pctFormat.format(current.cvr) : '—'}
            sub="クリック→CV率"
            icon={MousePointerClick}
            delta={calcDelta(current.cvr, previous.cvr)}
            deltaLabel={deltaLabel}
          />
        </div>

        {/* ─── 予算消化率 ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              予算消化率（当月）
              {isMock && (
                <Badge variant="secondary" className="text-xs font-normal">
                  サンプル
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 全体 */}
            <BudgetBar
              label="全媒体合計"
              spent={displayBudget.totalSpent}
              budget={displayBudget.totalBudget}
              utilization={displayBudget.utilization}
            />
            {/* 媒体別 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t">
              {displayBudget.byPlatform.map((p) => (
                <BudgetBar
                  key={p.platform}
                  label={PLATFORM_LABELS[p.platform] ?? p.platform}
                  spent={p.spent}
                  budget={p.budget}
                  utilization={p.utilization}
                />
              ))}
            </div>
            {displayBudget.totalBudget === 0 && (
              <p className="text-xs text-slate-400">
                キャンペーンに月次予算を設定すると消化率が表示されます
              </p>
            )}
          </CardContent>
        </Card>

        {/* ─── チャート ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* 費用推移 */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">費用推移</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => jpyCompact.format(v)}
                    width={52}
                  />
                  <Tooltip
                    formatter={(v) => [jpyFormat.format(Number(v ?? 0)), '']}
                    labelFormatter={(l) => l}
                  />
                  <Legend iconSize={10} />
                  {platform === 'all' ? (
                    <>
                      <Bar dataKey="bing" name="Bing" fill={PLATFORM_COLORS.bing} stackId="s" />
                      <Bar dataKey="yahoo" name="Yahoo!" fill={PLATFORM_COLORS.yahoo} stackId="s" />
                      <Bar
                        dataKey="google"
                        name="Google"
                        fill={PLATFORM_COLORS.google}
                        stackId="s"
                        radius={[2, 2, 0, 0]}
                      />
                    </>
                  ) : (
                    <Bar
                      dataKey={platform}
                      name={PLATFORM_LABELS[platform]}
                      fill={PLATFORM_COLORS[platform]}
                      radius={[2, 2, 0, 0]}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* CPA推移 */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                CPA推移
                {cpaTarget && (
                  <span className="text-xs font-normal text-slate-400 tabular-nums">
                    目標 {jpyFormat.format(cpaTarget)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => jpyCompact.format(v)}
                    width={52}
                  />
                  <Tooltip
                    formatter={(v) => [jpyFormat.format(Number(v ?? 0)), 'CPA']}
                    labelFormatter={(l) => l}
                  />
                  {/* 目標ライン */}
                  {cpaTarget && (
                    <Line
                      type="monotone"
                      dataKey="cpaTargetLine"
                      name="目標CPA"
                      stroke="#d1d5db"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="cpa"
                    name="CPA"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#6366f1' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ─── 媒体別サマリー（全媒体時のみ） ─── */}
        {platform === 'all' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(isMock ? MOCK_SUMMARY.byPlatform : byPlatform).map((s) => (
              <Card key={s.platform}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[s.platform] }}
                      aria-hidden="true"
                    />
                    {PLATFORM_LABELS[s.platform]}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-slate-500">費用</p>
                      <p className="font-semibold tabular-nums">
                        {jpyFormat.format(Math.round(s.cost))}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CV数</p>
                      <p className="font-semibold tabular-nums">
                        {numFormat.format(Math.round(s.conversions))}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CPA</p>
                      <p className="font-semibold tabular-nums">
                        {s.cpa > 0 ? jpyFormat.format(Math.round(s.cpa)) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CVR</p>
                      <p className="font-semibold tabular-nums">
                        {s.cvr > 0 ? pctFormat.format(s.cvr) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CTR</p>
                      <p className="font-semibold tabular-nums">
                        {s.ctr > 0 ? pctFormat.format(s.ctr) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">CPC</p>
                      <p className="font-semibold tabular-nums">
                        {s.cpc > 0 ? jpyFormat.format(Math.round(s.cpc)) : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
