'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
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
  Bell,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Chip } from '@heroui/react';
import { cn } from '@/lib/utils';
import {
  aggregateCampaigns,
  aggregateCampaignsByPlatform,
  type AdType,
} from '@/lib/campaign-mock-data';

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

// ─── モックデータ ───────────────────────────────────────────

// MOCK_SUMMARY は削除 — campaign-mock-data.ts の aggregateCampaigns() で動的生成

function getMockTrendData(main: { start: Date; end: Date }): TrendPoint[] {
  const msMs = main.start.getTime();
  const days = Math.max(1, Math.round((main.end.getTime() - msMs) / 86_400_000) + 1);

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(msMs + i * 86_400_000);
    const t = i / Math.max(days - 1, 1);
    const wave = Math.sin(i * 2.3) * 0.12 + Math.sin(i * 5.7) * 0.06;
    const google = Math.round((58 + wave * 58 + t * 25) * 1000);
    const yahoo = Math.round((33 + wave * 33 + t * 15) * 1000);
    const bing = Math.round((14 + wave * 14 + t * 8) * 1000);
    const cost = google + yahoo + bing;
    const conversions = Math.max(1, Math.round(cost / 6100));
    const google_cv = Math.max(0, Math.round(google / 6800));
    const yahoo_cv = Math.max(0, Math.round(yahoo / 6500));
    const bing_cv = Math.max(0, Math.round(bing / 7200));
    return {
      date: date.toISOString().split('T')[0],
      google,
      yahoo,
      bing,
      cost,
      conversions,
      cpa: Math.round(cost / conversions),
      google_cv,
      yahoo_cv,
      bing_cv,
      google_cpa: google_cv > 0 ? Math.round(google / google_cv) : null,
      yahoo_cpa:  yahoo_cv  > 0 ? Math.round(yahoo  / yahoo_cv)  : null,
      bing_cpa:   bing_cv   > 0 ? Math.round(bing   / bing_cv)   : null,
    };
  });
}

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
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums tracking-tight">{value}</p>

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
          <div className="p-2 rounded-lg bg-primary/8 shrink-0">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
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

function FunnelFlow({ metrics, isMock }: { metrics: Metrics; isMock: boolean }) {
  const { impressions, clicks, cost, conversions, ctr, cvr, cpc, cpa } = metrics;
  const [hovered, setHovered] = useState<number | null>(null);

  // 各ステージの高さ比率（対数スケール、最小15%保証）
  const logMax = Math.log10(Math.max(impressions, 1));
  const ratio = (val: number) => {
    if (logMax === 0) return 1;
    return Math.max(Math.log10(Math.max(val, 1)) / logMax, 0.15);
  };

  const heights = [1, ratio(clicks), ratio(conversions)];

  // SVG パラメータ（縦をコンパクトに）
  const W = 400;
  const H = 90;
  const padTop = 6;
  const baseY = H - 2;

  // 各ステージのX位置（3等分）
  const xs = [0, W / 3, (W * 2) / 3, W];

  // 各ステージのY座標（上辺）
  const topY = (r: number) => baseY - (baseY - padTop) * r;

  // ベジェ曲線で滑らかな上辺パスを生成
  const pts = heights.map((r, i) => ({ x: xs[i], y: topY(r) }));
  pts.push({ x: W, y: topY(heights[heights.length - 1]) });

  let topPath = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const curr = pts[i];
    const next = pts[i + 1];
    const cpx = (curr.x + next.x) / 2;
    topPath += ` C${cpx},${curr.y} ${cpx},${next.y} ${next.x},${next.y}`;
  }
  const fillPath = `${topPath} L${W},${baseY} L0,${baseY} Z`;

  // 各セクションのクリップパス（ホバー用に領域を分割）
  const sectionClips = [0, 1, 2].map((i) => {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    return `M${x1},0 L${x2},0 L${x2},${H} L${x1},${H} Z`;
  });

  const stages = [
    {
      label: '表示数',
      value: numFormat.format(impressions),
      sub: `費用 ${jpyFormat.format(Math.round(cost))}`,
    },
    {
      label: 'クリック数',
      value: numFormat.format(clicks),
      sub: `CPC ${cpc > 0 ? jpyFormat.format(Math.round(cpc)) : '—'}`,
    },
    {
      label: 'CV数',
      value: numFormat.format(Math.round(conversions)),
      sub: `CPA ${cpa > 0 ? jpyFormat.format(Math.round(cpa)) : '—'}`,
    },
  ];

  // ホバー時の詳細情報
  const details = [
    [
      { label: '表示回数', value: numFormat.format(impressions) },
      { label: '費用', value: jpyFormat.format(Math.round(cost)) },
      { label: 'CTR', value: pctFormat.format(ctr) },
    ],
    [
      { label: 'クリック数', value: numFormat.format(clicks) },
      { label: '平均CPC', value: cpc > 0 ? jpyFormat.format(Math.round(cpc)) : '—' },
      { label: 'CTR', value: pctFormat.format(ctr) },
      { label: 'CVR', value: pctFormat.format(cvr) },
    ],
    [
      { label: 'CV数', value: numFormat.format(Math.round(conversions)) },
      { label: 'CPA', value: cpa > 0 ? jpyFormat.format(Math.round(cpa)) : '—' },
      { label: 'CVR', value: pctFormat.format(cvr) },
      { label: '費用', value: jpyFormat.format(Math.round(cost)) },
    ],
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          表示 → クリック → CV フロー
          {isMock && (
            <Badge variant="secondary" className="text-xs font-normal">
              サンプル
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* SVG ファネル曲線 */}
        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseLeave={() => setHovered(null)}
          >
            <defs>
              <linearGradient id="funnel-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="50%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#818cf8" />
              </linearGradient>
              <linearGradient id="funnel-grad-fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity="0.25" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* メインのファネル塗り */}
            <path d={fillPath} fill="url(#funnel-grad)" opacity="0.85" />
            <path d={fillPath} fill="url(#funnel-grad-fade)" />

            {/* ホバーハイライト用セクション */}
            {sectionClips.map((clip, i) => (
              <g key={i}>
                <clipPath id={`funnel-section-${i}`}>
                  <path d={clip} />
                </clipPath>
                <rect
                  x={xs[i]}
                  y={0}
                  width={xs[i + 1] - xs[i]}
                  height={H}
                  fill="white"
                  opacity={hovered === i ? 0.15 : 0}
                  clipPath={`url(#funnel-section-${i})`}
                  className="transition-opacity duration-150"
                  onMouseEnter={() => setHovered(i)}
                  style={{ cursor: 'default' }}
                />
              </g>
            ))}

            {/* ステージ区切り線（白い実線） */}
            {[1, 2].map((i) => (
              <line
                key={i}
                x1={xs[i]}
                y1={padTop - 2}
                x2={xs[i]}
                y2={baseY}
                stroke="white"
                strokeOpacity="0.6"
                strokeWidth="1.5"
              />
            ))}
          </svg>

          {/* ホバーツールチップ（グラフ下に表示） */}
          {hovered !== null && (
            <div
              className="absolute z-10 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md"
              style={{
                left: `${((xs[hovered] + xs[hovered + 1]) / 2 / W) * 100}%`,
                bottom: '-8px',
                transform: 'translate(-50%, 100%)',
              }}
            >
              <p className="text-xs font-semibold mb-1">{stages[hovered].label}</p>
              <div className="space-y-0.5">
                {details[hovered].map((d) => (
                  <div key={d.label} className="flex items-center justify-between gap-4 text-xs">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-medium tabular-nums">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ステージ数値 + 変換率（指標の間に配置） */}
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-x-2 gap-y-0">
          {stages.map((s, i) => {
            const rates = [
              { label: 'CTR', value: pctFormat.format(ctr) },
              { label: 'CVR', value: pctFormat.format(cvr) },
            ];

            return (
              <React.Fragment key={s.label}>
                {/* 指標カード */}
                <div
                  className={cn(
                    'text-center rounded-md px-2 py-1.5 transition-colors duration-150',
                    hovered === i && 'bg-muted/50',
                  )}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <p className="text-2xl font-bold tabular-nums tracking-tight">{s.value}</p>
                  <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground/70 tabular-nums mt-0.5">{s.sub}</p>
                </div>

                {/* 変換率（指標の間） */}
                {i < 2 && (
                  <div className="flex flex-col items-center gap-0.5 px-1">
                    <ArrowRight className="size-3.5 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-2xl font-bold tabular-nums tracking-tight text-violet-600 dark:text-violet-400">
                      {rates[i].value}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground">{rates[i].label}</p>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
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
  const [adType, setAdType] = useState<AdType | 'all'>('all');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [compareTrend, setCompareTrend] = useState<TrendPoint[]>([]);
  const [budget, setBudget] = useState<BudgetUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialized = useRef(false);
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
      if (isRefresh || initialized.current) setRefreshing(true);
      else setLoading(true);
      try {
        const fmt = (d: Date) => d.toISOString().split('T')[0];
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
        const trendParams = new URLSearchParams({ start: fmt(main.start), end: fmt(main.end), platform });
        const cmpTrendParams = compareEnabled && compare
          ? new URLSearchParams({ start: fmt(compare.start), end: fmt(compare.end), platform })
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

  const isMock = !summary?.current.impressions;
  // モック時はcampaign-mock-dataからadType対応で集計
  const mockSummary: SummaryData = React.useMemo(() => {
    const curr = aggregateCampaigns({ platform, adType });
    // 前期間はダミーで10%減
    const prev = {
      impressions: Math.round(curr.impressions * 0.9),
      clicks: Math.round(curr.clicks * 0.9),
      cost: Math.round(curr.cost * 0.92),
      conversions: Math.round(curr.conversions * 0.88),
      ctr: curr.ctr * 0.98,
      cpc: curr.cpc * 1.02,
      cpa: curr.cpa * 1.05,
      cvr: curr.cvr * 0.97,
    };
    return {
      platform,
      current: curr,
      previous: prev,
      byPlatform: aggregateCampaignsByPlatform({ adType }),
    };
  }, [platform, adType]);
  const displaySummary = isMock ? mockSummary : summary!;
  const displayTrend = trend.length > 0 ? trend : getMockTrendData(dateRange.main);
  const { current, previous, byPlatform } = displaySummary;
  const deltaLabel = dateRange.compareEnabled ? '比較期間比' : '前期間比';
  const anomalies = isMock ? [] : buildAnomalies(current, previous, budget, cpaTarget);

  // 比較トレンドをインデックス合わせでマージ
  const showCompare = dateRange.compareEnabled && compareTrend.length > 0;
  const chartData = displayTrend.map((d, i) => {
    const cmp = compareTrend[i];
    return {
      ...d,
      label: dateShort.format(new Date(d.date)),
      cpaTargetLine: cpaTarget ?? undefined,
      cmp_cpa: cmp?.cpa ?? null,
      cmp_cv: cmp?.conversions ?? null,
      cmp_date: cmp?.date ?? null,
    };
  });


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

          {/* 種別プルダウン */}
          <Select value={adType} onValueChange={(v) => setAdType(v as AdType | 'all')}>
            <SelectTrigger className="w-36">
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

        {/* ─── サンプルデータ通知 ─── */}
        {isMock && !loading && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700 flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            API連携前のため、サンプルデータを表示しています
          </div>
        )}

        {/* ─── ファネルフロー ─── */}
        {loading ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">読み込み中…</CardContent>
          </Card>
        ) : (
          <FunnelFlow metrics={current} isMock={isMock} />
        )}

        {/* ─── KPIカード ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="総費用"
            value={jpyFormat.format(Math.round(current.cost))}
            sub="期間累計"
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

        {/* ─── チャート ─── */}
        <div className="grid grid-cols-1 gap-4">
          {/* CPA推移・CV推移 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                CPA推移
                {cpaTarget && (
                  <span className="text-xs font-normal text-muted-foreground/60 tabular-nums">
                    目標 {jpyFormat.format(cpaTarget)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                              <span className="text-muted-foreground">表示期間</span>
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
                              {(['google', 'yahoo', 'bing'] as const).map((p) => (
                                <div key={p} className="flex justify-between gap-4">
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                                    <span className="text-muted-foreground">{PLATFORM_LABELS[p]}</span>
                                  </span>
                                  <span className="tabular-nums">{d[`${p}_cpa`] != null ? jpyFormat.format(d[`${p}_cpa`]!) : '—'}</span>
                                </div>
                              ))}
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
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="cpa"
                    name="表示期間"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#6366f1' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* CV推移 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">CV推移</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
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
                              <span className="text-muted-foreground">表示期間</span>
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
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="conversions"
                    name="表示期間"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#10b981' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          </div>
        </div>

        {/* ─── 媒体別サマリー（全媒体時のみ） ─── */}
        {platform === 'all' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(isMock ? mockSummary.byPlatform : byPlatform).map((s) => (
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
