'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  BedDouble,
  Target,
  Trophy,
  DoorOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProgressResponse } from '@/app/api/dashboard/progress/route';
import { DataSourceTooltip } from '@/components/ui/data-source-tooltip';
import type { SourceTagKey } from '@/components/ui/data-source-tags';

const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const jpyCompact = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const numFormat = new Intl.NumberFormat('ja-JP');
const pct1Format = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type PeriodKey = keyof ProgressResponse['metrics']['grossProfit'];
type Axis = 'movein' | 'received';

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: '今週' },
  { key: 'month', label: '今月' },
  { key: 'quarter', label: 'Q' },
  { key: 'halfYear', label: '半期' },
  { key: 'year', label: '年次' },
];

const AXIS_TABS: { key: Axis; label: string; hint: string }[] = [
  { key: 'movein', label: '入居日', hint: '利用期間始期が期間内' },
  { key: 'received', label: '発生日', hint: '受付日時が期間内' },
];

// 並び順: CV → CV室数 → ルームデイズ → 成約 → 粗利
const METRICS: ReadonlyArray<{
  key: 'cv' | 'cvRooms' | 'roomDays' | 'won' | 'grossProfit';
  label: string;
  icon: typeof Target;
  format: (v: number) => string;
  formatCompact: (v: number) => string;
  target: string;
  sources: SourceTagKey[];
}> = [
  {
    key: 'cv',
    label: 'CV',
    icon: Target,
    format: (v: number) => numFormat.format(Math.round(v)) + ' 件',
    formatCompact: (v: number) => numFormat.format(Math.round(v)) + ' 件',
    target: 'LP 経由リード件数 (COUNT)',
    sources: ['lead'],
  },
  {
    key: 'cvRooms',
    label: 'CV 室数',
    icon: DoorOpen,
    format: (v: number) => numFormat.format(Math.round(v)) + ' 室',
    formatCompact: (v: number) => numFormat.format(Math.round(v)) + ' 室',
    target: '必要戸数_数値 の合計 (SUM)',
    sources: ['lead'],
  },
  {
    key: 'roomDays',
    label: 'ルームデイズ',
    icon: BedDouble,
    format: (v: number) => numFormat.format(Math.round(v)) + ' RD',
    formatCompact: (v: number) => numFormat.format(Math.round(v)) + ' RD',
    target: '利用期間_日数 の合計 (SUM) — このカラムは SF 側で既に 日数 × 必要戸数 で算出済',
    sources: ['lead', 'contract'],
  },
  {
    key: 'won',
    label: '成約',
    icon: Trophy,
    format: (v: number) => numFormat.format(Math.round(v)) + ' 件',
    formatCompact: (v: number) => numFormat.format(Math.round(v)) + ' 件',
    target: '契約管理ID が NOT NULL のリードを COUNT DISTINCT',
    sources: ['lead', 'contract'],
  },
  {
    key: 'grossProfit',
    label: '粗利',
    icon: Wallet,
    format: (v: number) => jpyFormat.format(v),
    formatCompact: (v: number) => jpyCompact.format(v),
    target: '総売上_粗利 の合計 (SUM)',
    sources: ['contract'],
  },
];

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-xs text-muted-foreground/40">—</span>;
  const positive = delta > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs tabular-nums',
        positive ? 'text-green-600' : 'text-red-500',
      )}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? '+' : ''}
      {pct1Format.format(delta)}
    </span>
  );
}

export function ProgressView() {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PeriodKey>('month');
  const [axis, setAxis] = useState<Axis>('movein');

  useEffect(() => {
    setData(null);
    setError(null);
    const controller = new AbortController();
    fetch(`/api/dashboard/progress?axis=${axis}`, { signal: controller.signal })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        return json as ProgressResponse;
      })
      .then(setData)
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, [axis]);

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-red-600">
          進捗データ取得エラー: {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">読み込み中…</CardContent>
      </Card>
    );
  }

  const period = data.periods[activeTab];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span>進捗</span>
            <div className="flex gap-1" role="tablist" aria-label="集計軸">
              {AXIS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={axis === tab.key}
                  title={tab.hint}
                  onClick={() => setAxis(tab.key)}
                  className={cn(
                    'text-xs px-2 py-1 rounded-md transition-colors',
                    axis === tab.key
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'text-xs px-2 py-1 rounded-md transition-colors tabular-nums',
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardTitle>
        <p className="text-xs text-muted-foreground/70 tabular-nums mt-1">
          {period.label}: {period.start} 〜 {period.end}
          <span className="ml-2 text-muted-foreground/50">
            ({axis === 'movein' ? '入居日ベース' : '発生日ベース'})
          </span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {METRICS.map(({ key, label, icon: Icon, format, target: aggTarget, sources }) => {
            const m = data.metrics[key][activeTab];
            const delta = deltaPct(m.current, m.previous);
            const achievementPct =
              m.target != null && m.target > 0 ? m.current / m.target : null;

            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <DataSourceTooltip
                    info={{
                      label,
                      sources,
                      source: 'Salesforce (mart.salesforce_all_obj)',
                      filters:
                        'LP 経由のみ (流入元_LP反響 ∈ monthly-order/express/standard/site)',
                      target: aggTarget,
                      period: `${period.start} 〜 ${period.end}`,
                      axis:
                        axis === 'movein'
                          ? '利用期間_始期 が期間内 (入居日ベース)'
                          : '受付日時 が期間内 (発生日ベース)',
                      cache: '1 時間キャッシュ',
                      note:
                        m.target != null
                          ? `目標は dashboard.targets_monthly を ${activeTab === 'week' ? '月目標 ÷ 4 (週相当)' : '期間合算'}。※ 現状は入居日/発生日で同じ目標値を共有 (Issue 化予定)`
                          : undefined,
                    }}
                  />
                </div>
                <p className="text-lg font-bold tabular-nums tracking-tight">
                  {format(m.current)}
                </p>
                {achievementPct != null ? (
                  <>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          // 30% 未満: 赤 / 70% 未満: 黄 / 70% 以上: 緑
                          achievementPct >= 0.7
                            ? 'bg-green-500'
                            : achievementPct >= 0.3
                              ? 'bg-yellow-500'
                              : 'bg-red-500',
                        )}
                        style={{ width: `${Math.min(100, achievementPct * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 tabular-nums">
                      {pct1Format.format(achievementPct)} / 目標 {format(m.target!)}
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <DeltaBadge delta={delta} />
                    <span className="text-[10px] text-muted-foreground/50">前期間比</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
