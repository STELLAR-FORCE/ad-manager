'use client';

/**
 * Issue #63 Phase 2.5 — 入居日ベース ピボットビュー
 *
 * 1 つのテーブル内で 件数 と 室数 を 入居月ごとに並列表示する:
 *
 *                       [1月入居]                          [2月入居]
 *                  件数        室数                  件数        室数
 *               目標 実績    目標 実績            目標 実績    目標 実績
 *   前期間以前   -   174     -   345            -    43      -   107
 *   2026年1月   -    75     -   113            -   138      -   194
 *   ...
 *   入居月合計  199  249    537  458           378  280    1021  459
 *   必要件数/室数      +50         -79                -98         -562
 *   成約件数/室数       21          44                  3           3
 *   目標粗利       ¥10.1M       ─                  ¥10.4M       ─
 *   粗利            ¥1.9M       ─                  ¥162K        ─
 *   利用日数（目標） ─           ─                    ─           ─
 *   利用日数（依頼） ─           4,971                ─           …
 *   利用日数（成約） ─           4,971                ─           …
 */

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RefreshCw, Pencil, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';
import { Meter, Label } from '@heroui/react';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import {
  MoveInSummaryCard,
  type MoveInSummaryCardData,
} from '@/components/dashboard/move-in-summary-card';
import { jpyFormat, jpyCompact, jpyCompact2, numFormat, pctFormat, formatMonthLabel } from '@/lib/format';
import { currentPeriod, periodLabel, periodRange, type Period } from '@/lib/period';
import { DataSourceTooltip } from '@/components/ui/data-source-tooltip';
import { DataSourceTags } from '@/components/ui/data-source-tags';
import { cn } from '@/lib/utils';

const TODAY = new Date();
const BEFORE_KEY = '__before__';

type PivotRow = {
  moveInMonth: string;
  cvMonth: string;
  cv: number;
  cvRooms: number;
  requestRoomDays: number;
};

type SummaryRow = {
  moveInMonth: string;
  wonCv: number;
  contractedRooms: number;
  grossProfit: number;
  revenue: number;
  contractedRoomDays: number;
};

type TargetRow = {
  month: string;
  cvTarget: number | null;
  roomTarget: number | null;
  roomDaysTarget: number | null;
  grossProfitTarget: number | null;
};

type ApiResponse = {
  period: { months: string[]; label: string };
  pivot: PivotRow[];
  summary: SummaryRow[];
  targets: TargetRow[];
};

type ForecastRow = {
  moveInMonth: string;
  confirmedGrossProfit: number;
  confirmedRooms: number;
  actualUnitPriceMedian: number | null;
  introducedRooms: number;
  earlyRooms: number;
  pipelineWeightedRooms: number;
  pipelineForecastGrossProfit: number;
  assumedUnitPrice: number;
};

type LeadAggRow = {
  moveInMonth: string;
  cv: number;
  cvRooms: number;
  requestRoomDays: number;
};

type SummaryApiResponse = {
  period: { months: string[]; label: string };
  forecast: ForecastRow[];
  leadAgg: LeadAggRow[];
  summary: SummaryRow[];
  targets: TargetRow[];
};

type SortMode = 'chrono' | 'risk';

export default function MoveInPivotPage() {
  const [period, setPeriod] = useState<Period>(() => currentPeriod(TODAY, 'half'));
  const [data, setData] = useState<ApiResponse | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('chrono');
  const [showPivot, setShowPivot] = useState(false);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({
        periodType: period.type,
        year: String(period.year),
        index: String(period.index),
      });
      const [pivotRes, summaryRes] = await Promise.all([
        fetch(`/api/dashboard/move-in/pivot?${params}`).then((r) => r.json()),
        fetch(`/api/dashboard/move-in/summary?${params}`).then((r) => r.json()),
      ]);
      if (pivotRes.error) {
        console.error(pivotRes.error);
        setData(null);
      } else {
        setData(pivotRes);
      }
      if (summaryRes.error) {
        console.error(summaryRes.error);
        setSummaryData(null);
      } else {
        setSummaryData(summaryRes);
      }
    } catch {
      setData(null);
      setSummaryData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const months = useMemo(() => data?.period.months ?? periodRange(period).months, [data, period]);

  const lookups = useMemo(() => {
    const cellMap = new Map<string, PivotRow>();
    for (const r of data?.pivot ?? []) cellMap.set(`${r.cvMonth}|${r.moveInMonth}`, r);
    const summaryMap = new Map<string, SummaryRow>();
    for (const r of data?.summary ?? []) summaryMap.set(r.moveInMonth, r);
    const targetMap = new Map<string, TargetRow>();
    for (const r of data?.targets ?? []) targetMap.set(r.month, r);
    return { cellMap, summaryMap, targetMap };
  }, [data]);

  const cvMonthRows = useMemo(() => [BEFORE_KEY, ...months], [months]);

  /**
   * 「前期間以前」のセル（入居月別）の月別内訳。
   * tooltip 表示用に moveInMonth → [{cvMonth, cv, cvRooms}, ...] の Map を構築。
   * 月降順（直近月を先頭）。
   */
  const beforeBreakdown = useMemo(() => {
    const periodStart = months[0] ?? '';
    const map = new Map<string, PivotRow[]>();
    for (const r of data?.pivot ?? []) {
      // 受付日時が NULL のレコード（cvMonth=null）も除外
      if (!r.cvMonth || r.cvMonth >= periodStart) continue;
      const list = map.get(r.moveInMonth) ?? [];
      list.push(r);
      map.set(r.moveInMonth, list);
    }
    for (const list of map.values())
      list.sort((a, b) => (b.cvMonth ?? '').localeCompare(a.cvMonth ?? ''));
    return map;
  }, [data, months]);

  /** 月間CV合計列（前期間以前 行）用に CV月ごとに横断集計した内訳 */
  const beforeBreakdownTotal = useMemo(() => {
    const periodStart = months[0] ?? '';
    const agg = new Map<string, { cv: number; cvRooms: number; requestRoomDays: number }>();
    for (const r of data?.pivot ?? []) {
      if (!r.cvMonth || r.cvMonth >= periodStart) continue;
      const cur = agg.get(r.cvMonth) ?? { cv: 0, cvRooms: 0, requestRoomDays: 0 };
      cur.cv += r.cv;
      cur.cvRooms += r.cvRooms;
      cur.requestRoomDays += r.requestRoomDays;
      agg.set(r.cvMonth, cur);
    }
    return Array.from(agg.entries())
      .map(([cvMonth, v]) => ({ moveInMonth: '__total__', cvMonth, ...v }))
      .sort((a, b) => b.cvMonth.localeCompare(a.cvMonth));
  }, [data, months]);

  // 個別アクセサ。BEFORE_KEY が来たら前期間以前のすべての月を合算する
  function aggregateField(cv: string, m: string, field: 'cv' | 'cvRooms' | 'requestRoomDays') {
    if (cv === BEFORE_KEY) {
      return (beforeBreakdown.get(m) ?? []).reduce((s, r) => s + r[field], 0);
    }
    return lookups.cellMap.get(`${cv}|${m}`)?.[field] ?? 0;
  }
  const cellCv = (cv: string, m: string) => aggregateField(cv, m, 'cv');
  const cellRooms = (cv: string, m: string) => aggregateField(cv, m, 'cvRooms');
  const cellReqRd = (cv: string, m: string) => aggregateField(cv, m, 'requestRoomDays');

  const cvTarget = (m: string) => lookups.targetMap.get(m)?.cvTarget ?? null;
  const roomTarget = (m: string) => lookups.targetMap.get(m)?.roomTarget ?? null;
  const grossTarget = (m: string) => lookups.targetMap.get(m)?.grossProfitTarget ?? null;
  const roomDaysTarget = (m: string) => lookups.targetMap.get(m)?.roomDaysTarget ?? null;

  const monthCvTotal = (m: string) => cvMonthRows.reduce((s, cv) => s + cellCv(cv, m), 0);
  const monthRoomTotal = (m: string) => cvMonthRows.reduce((s, cv) => s + cellRooms(cv, m), 0);
  const monthReqRdTotal = (m: string) => cvMonthRows.reduce((s, cv) => s + cellReqRd(cv, m), 0);

  const wonCv = (m: string) => lookups.summaryMap.get(m)?.wonCv ?? 0;
  const wonRooms = (m: string) => lookups.summaryMap.get(m)?.contractedRooms ?? 0;
  const grossProfit = (m: string) => lookups.summaryMap.get(m)?.grossProfit ?? 0;
  const contractedRd = (m: string) => lookups.summaryMap.get(m)?.contractedRoomDays ?? 0;

  /** 列ごとの最大値（CV発生月 行のヒートマップ正規化用）*/
  const colMax = useMemo(() => {
    const cvMaxByMonth = new Map<string, number>();
    const roomMaxByMonth = new Map<string, number>();
    for (const m of months) {
      let mxCv = 0;
      let mxRoom = 0;
      for (const cv of cvMonthRows) {
        mxCv = Math.max(mxCv, cellCv(cv, m));
        mxRoom = Math.max(mxRoom, cellRooms(cv, m));
      }
      cvMaxByMonth.set(m, mxCv);
      roomMaxByMonth.set(m, mxRoom);
    }
    // 月間CV合計列（横方向の sum）の中での最大値
    let totalCvMax = 0;
    let totalRoomMax = 0;
    for (const cv of cvMonthRows) {
      const cvSum = months.reduce((s, m) => s + cellCv(cv, m), 0);
      const roomSum = months.reduce((s, m) => s + cellRooms(cv, m), 0);
      totalCvMax = Math.max(totalCvMax, cvSum);
      totalRoomMax = Math.max(totalRoomMax, roomSum);
    }
    return { cvMaxByMonth, roomMaxByMonth, totalCvMax, totalRoomMax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, months]);

  /** サマリーカード用データ（入居月別） */
  const summaryCards = useMemo<MoveInSummaryCardData[]>(() => {
    if (!summaryData) return [];
    const forecastMap = new Map(summaryData.forecast.map((r) => [r.moveInMonth, r]));
    const leadMap = new Map(summaryData.leadAgg.map((r) => [r.moveInMonth, r]));
    const targetMap = new Map(summaryData.targets.map((r) => [r.month, r]));
    const summaryMap = new Map(summaryData.summary.map((r) => [r.moveInMonth, r]));
    return months.map<MoveInSummaryCardData>((m) => {
      const f = forecastMap.get(m);
      const l = leadMap.get(m);
      const t = targetMap.get(m);
      const s = summaryMap.get(m);
      return {
        moveInMonth: m,
        cv: l?.cv ?? 0,
        cvTarget: t?.cvTarget ?? null,
        rooms: l?.cvRooms ?? 0,
        roomTarget: t?.roomTarget ?? null,
        wonCv: s?.wonCv ?? 0,
        wonRooms: s?.contractedRooms ?? 0,
        confirmedGrossProfit: f?.confirmedGrossProfit ?? 0,
        pipelineForecastGrossProfit: f?.pipelineForecastGrossProfit ?? 0,
        grossProfitTarget: t?.grossProfitTarget ?? null,
        actualUnitPriceMedian: f?.actualUnitPriceMedian ?? null,
        assumedUnitPrice: f?.assumedUnitPrice ?? 100000,
        introducedRooms: f?.introducedRooms ?? 0,
        earlyRooms: f?.earlyRooms ?? 0,
      };
    });
  }, [summaryData, months]);

  /** 並び替え後のカード（時系列 / 危険度順）*/
  const sortedCards = useMemo(() => {
    if (sortMode === 'chrono') return summaryCards;
    // 危険度順: 粗利達成率の低い順（targetが無いものは末尾）
    return [...summaryCards].sort((a, b) => {
      const af = a.confirmedGrossProfit + a.pipelineForecastGrossProfit;
      const bf = b.confirmedGrossProfit + b.pipelineForecastGrossProfit;
      const ar = a.grossProfitTarget && a.grossProfitTarget > 0 ? af / a.grossProfitTarget : Infinity;
      const br = b.grossProfitTarget && b.grossProfitTarget > 0 ? bf / b.grossProfitTarget : Infinity;
      return ar - br;
    });
  }, [summaryCards, sortMode]);

  /** 期間合計タイル用 */
  const periodTotal = useMemo(() => {
    const confirmed = summaryCards.reduce((s, c) => s + c.confirmedGrossProfit, 0);
    const pipeline = summaryCards.reduce((s, c) => s + c.pipelineForecastGrossProfit, 0);
    const forecastTotal = confirmed + pipeline;
    const target = summaryCards.reduce((s, c) => s + (c.grossProfitTarget ?? 0), 0);
    const cv = summaryCards.reduce((s, c) => s + c.cv, 0);
    const cvTarget = summaryCards.reduce((s, c) => s + (c.cvTarget ?? 0), 0);
    const rooms = summaryCards.reduce((s, c) => s + c.rooms, 0);
    const roomTarget = summaryCards.reduce((s, c) => s + (c.roomTarget ?? 0), 0);
    return { confirmed, pipeline, forecastTotal, target, cv, cvTarget, rooms, roomTarget };
  }, [summaryCards]);

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            入居日ベース
            <DataSourceTooltip
              info={{
                label: '入居日ベース',
                sources: ['lead', 'contract'],
                source: 'Salesforce (mart.salesforce_all_obj)',
                filters:
                  'LP 経由のみ (流入元_LP反響 ∈ monthly-order/express/standard/site)。成約は新規のみ(更新/延長/キャンセルを除外)+ 借主請求>0 または 粗利>0 + 失注フェーズ除外',
                target:
                  'CV: LP流入リード件数 / CV室数: 必要戸数_数値 SUM / 成約件数・室数: 新規成約 / 粗利・売上: 確定値',
                period: '画面上の期間セレクタで指定した範囲を入居月別に集計',
                axis: '利用期間_始期 が期間内 (入居日ベース)',
                cache: '1 時間キャッシュ (再読み込みで更新)',
                note: '入居月合計と当月以前累計を集計。目標値は dashboard.targets_monthly',
              }}
            />
          </h1>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground/90">
            {periodLabel(period)}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            入居月ごとの着地見込み（LP流入のリード全件）。営業/経営は時系列、マーケはリードタイム逆算で施策タイミングを判断。
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
        <Link
          href="/targets"
          aria-label="目標値を編集"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[min(var(--radius-md),12px)] border border-border bg-background text-[0.8rem] font-medium hover:bg-muted transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          目標値編集
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={fetchData}
          disabled={refreshing}
          aria-label="再読み込み"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" />
          {refreshing ? '読み込み中…' : '再読み込み'}
        </Button>
      </div>

      {loading && !data ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">読み込み中…</CardContent>
        </Card>
      ) : (
        <>
          {/* ─── 期間合計タイル ─── */}
          <Card className="bg-gradient-to-br from-background to-muted/30">
            <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-4">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">予想粗利（期間合計）</span>
                  <DataSourceTags sources={['contract', 'opportunity']} />
                  <DataSourceTooltip
                    info={{
                      label: '予想粗利',
                      source: 'Salesforce (mart.salesforce_all_obj)',
                      filters: 'LP 経由のみ',
                      target: '確定粗利 + 見込粗利（進行中の加重）の合計 = 期間内の着地見込み粗利',
                      period: '画面上の期間セレクタで指定した範囲',
                      axis: '利用期間_始期 (入居日)',
                      cache: '1 時間キャッシュ',
                      note: '確定粗利 = 成約済みの粗利、見込粗利 = 案件フェーズ別の確度で粗利を見積',
                    }}
                  />
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {jpyCompact2.format(periodTotal.forecastTotal)}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  目標 {periodTotal.target > 0 ? jpyCompact2.format(periodTotal.target) : '—'}
                  {periodTotal.target > 0 && (
                    <span className="ml-1.5">
                      （{pctFormat.format(periodTotal.forecastTotal / periodTotal.target)}）
                    </span>
                  )}
                </div>
                {periodTotal.target > 0 && (
                  <>
                    <div
                      className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label="予想粗利 内訳 (確定 / 進行中)"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(
                        100,
                        ((periodTotal.confirmed + periodTotal.pipeline) / periodTotal.target) * 100,
                      )}
                    >
                      <div className="flex h-full w-full">
                        <div
                          className="bg-emerald-500"
                          style={{
                            width: `${Math.min(100, (periodTotal.confirmed / periodTotal.target) * 100)}%`,
                          }}
                        />
                        <div
                          className="bg-emerald-300/70"
                          style={{
                            width: `${Math.min(
                              Math.max(0, 100 - (periodTotal.confirmed / periodTotal.target) * 100),
                              (periodTotal.pipeline / periodTotal.target) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-1">
                        <span className="block size-2 rounded-sm bg-emerald-500" aria-hidden="true" />
                        確定 {jpyCompact2.format(periodTotal.confirmed)}
                        {periodTotal.forecastTotal > 0 && (
                          <span className="opacity-70">
                            ({pctFormat.format(periodTotal.confirmed / periodTotal.forecastTotal)})
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="block size-2 rounded-sm bg-emerald-300/70" aria-hidden="true" />
                        進行中 {jpyCompact2.format(periodTotal.pipeline)}
                        {periodTotal.forecastTotal > 0 && (
                          <span className="opacity-70">
                            ({pctFormat.format(periodTotal.pipeline / periodTotal.forecastTotal)})
                          </span>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">確定粗利</span>
                  <DataSourceTags sources={['contract']} />
                  <DataSourceTooltip
                    info={{
                      label: '確定粗利',
                      source: 'Salesforce (mart.salesforce_all_obj)',
                      filters: 'LP 経由のみ + 契約管理ID NOT NULL',
                      target: '契約管理レコードの 総売上_粗利 合計 (= 既に成約済みの確定値)',
                      period: '画面上の期間セレクタで指定した範囲',
                      axis: '利用期間_始期 (入居日)',
                      cache: '1 時間キャッシュ',
                    }}
                  />
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {jpyCompact2.format(periodTotal.confirmed)}
                </div>
                <div className="text-[11px] text-muted-foreground">契約管理レコードの粗利合計</div>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">見込粗利</span>
                  <DataSourceTags sources={['opportunity']} />
                  <DataSourceTooltip
                    info={{
                      label: '見込粗利（進行中案件の加重）',
                      source: 'Salesforce (mart.salesforce_all_obj)',
                      filters: 'LP 経由のみ + 案件フェーズが進行中 (紹介後 / 早期)',
                      target: '案件フェーズ別の確度 × 必要戸数 × ¥100,000/室 — 確定前の見込み粗利',
                      period: '画面上の期間セレクタで指定した範囲',
                      axis: '利用期間_始期 (入居日)',
                      cache: '1 時間キャッシュ',
                      note: '紹介後 50% / 早期 25% で加重。確度マスタは /targets で編集可能',
                    }}
                  />
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {jpyCompact2.format(periodTotal.pipeline)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  紹介後 50% / 早期 25% × ¥100,000/室
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">CV数</span>
                    <DataSourceTags sources={['lead']} />
                  </div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {numFormat.format(periodTotal.cv)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      / {periodTotal.cvTarget > 0 ? numFormat.format(periodTotal.cvTarget) : '—'}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">CV室数</span>
                    <DataSourceTags sources={['lead']} />
                  </div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {numFormat.format(periodTotal.rooms)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      / {periodTotal.roomTarget > 0 ? numFormat.format(periodTotal.roomTarget) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── 並び替えトグル ─── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">入居月別サマリー</h2>
              <DataSourceTooltip
                info={{
                  label: '入居月別サマリー (ピボット)',
                  sources: ['lead', 'contract'],
                  source: 'Salesforce (mart.salesforce_all_obj) /api/dashboard/move-in/pivot',
                  filters: 'LP 経由のみ。成約は新規のみ(更新/延長/キャンセル除外)',
                  target:
                    '入居月 × 受付月のリード件数 / 室数 を縦横ピボット表示。目標は targets_monthly',
                  period: '画面上の期間セレクタで指定した範囲',
                  axis: '利用期間_始期 (入居日)',
                  cache: '1 時間キャッシュ',
                }}
              />
            </div>
            <div className="inline-flex rounded-md border bg-background p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSortMode('chrono')}
                className={cn(
                  'px-2.5 py-1 rounded transition-colors',
                  sortMode === 'chrono' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50',
                )}
              >
                時系列
              </button>
              <button
                type="button"
                onClick={() => setSortMode('risk')}
                className={cn(
                  'px-2.5 py-1 rounded transition-colors',
                  sortMode === 'risk' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50',
                )}
              >
                危険度順
              </button>
            </div>
          </div>

          {/* ─── サマリーカードグリッド ─── */}
          {sortedCards.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                サマリーデータが取得できませんでした
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedCards.map((card) => (
                <MoveInSummaryCard key={card.moveInMonth} data={card} today={TODAY} />
              ))}
            </div>
          )}

          {/* ─── 全月詳細（既存ピボット表）— デフォルト折りたたみ ─── */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowPivot((s) => !s)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={showPivot}
            >
              {showPivot ? (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              )}
              全月詳細（CV発生月 × 入居月のピボット）
            </button>
            {showPivot && (
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
              {/* ─── ヘッダ 2 段 (目標列削除、件数/室数 実績のみ) ─── */}
              <TableHeader>
                {/* 1 段目: 入居月 (件数 + 室数 = colspan=2)。corner = CV発生月ラベル */}
                <TableRow>
                  <TableHead
                    rowSpan={2}
                    className="sticky left-0 bg-background z-10 min-w-[160px] align-bottom border-r"
                  >
                    <div className="flex items-end gap-1 pb-2 text-xs text-muted-foreground">
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="font-semibold text-foreground">CV発生月</span>
                      <span className="text-[10px]">／ 入居月 →</span>
                    </div>
                  </TableHead>
                  {months.map((m) => (
                    <TableHead
                      key={m}
                      colSpan={2}
                      className="text-center bg-muted/30 border-l font-semibold"
                    >
                      {formatMonthLabel(m).replace('年', '/')}入居
                    </TableHead>
                  ))}
                  <TableHead colSpan={2} className="text-center bg-muted/50 border-l font-semibold">
                    月間CV合計
                  </TableHead>
                </TableRow>
                {/* 2 段目: 件数 / 室数 */}
                <TableRow>
                  {months.map((m) => (
                    <CountRoomHeaderCells key={m} />
                  ))}
                  <CountRoomHeaderCells />
                </TableRow>
              </TableHeader>

              <TableBody>
                {/* ── CV発生月行（件数実績 + 室数実績 のみ + 列内ヒートマップ）── */}
                {cvMonthRows.map((cv) => {
                  const isBefore = cv === BEFORE_KEY;
                  const rowCvTotal = months.reduce((s, m) => s + cellCv(cv, m), 0);
                  const rowRoomTotal = months.reduce((s, m) => s + cellRooms(cv, m), 0);
                  return (
                    <TableRow key={cv}>
                      <TableCell
                        className={cn(
                          'sticky left-0 bg-background z-10 font-medium tabular-nums border-r',
                          isBefore && 'text-muted-foreground italic',
                        )}
                      >
                        {isBefore ? '前期間以前' : formatMonthLabel(cv)}
                      </TableCell>
                      {months.map((m) => (
                        <CountRoomCells
                          key={`${cv}|${m}`}
                          countActual={cellCv(cv, m)}
                          roomActual={cellRooms(cv, m)}
                          formatV={numFormat.format}
                          breakdown={isBefore ? beforeBreakdown.get(m) : undefined}
                          countMax={colMax.cvMaxByMonth.get(m) ?? 0}
                          roomMax={colMax.roomMaxByMonth.get(m) ?? 0}
                        />
                      ))}
                      <CountRoomCells
                        countActual={rowCvTotal}
                        roomActual={rowRoomTotal}
                        formatV={numFormat.format}
                        highlight
                        breakdown={isBefore ? beforeBreakdownTotal : undefined}
                        countMax={colMax.totalCvMax}
                        roomMax={colMax.totalRoomMax}
                      />
                    </TableRow>
                  );
                })}

                {/* ── 入居月合計（目標も埋まる）── */}
                <TableRow className="border-t-2 border-border">
                  <TableCell className="sticky left-0 bg-background z-10 font-semibold">
                    入居月合計
                  </TableCell>
                  {months.map((m) => (
                    <CountRoomCells
                      key={m}
                      countActual={monthCvTotal(m)}
                      roomActual={monthRoomTotal(m)}
                      formatV={numFormat.format}
                      bold
                    />
                  ))}
                  <CountRoomCells
                    countActual={months.reduce((s, m) => s + monthCvTotal(m), 0)}
                    roomActual={months.reduce((s, m) => s + monthRoomTotal(m), 0)}
                    formatV={numFormat.format}
                    bold
                    highlight
                  />
                </TableRow>

                {/* ── 必要件数 / 必要室数（並列）── */}
                <TableRow>
                  <TableCell className="sticky left-0 bg-background z-10 font-semibold">
                    必要件数 / 必要室数
                  </TableCell>
                  {months.map((m) => (
                    <NeedPair
                      key={m}
                      need1={diff(monthCvTotal(m), cvTarget(m))}
                      need2={diff(monthRoomTotal(m), roomTarget(m))}
                      formatV={numFormat.format}
                    />
                  ))}
                  <NeedPair
                    need1={diff(
                      months.reduce((s, m) => s + monthCvTotal(m), 0),
                      sumNullable(months, cvTarget),
                    )}
                    need2={diff(
                      months.reduce((s, m) => s + monthRoomTotal(m), 0),
                      sumNullable(months, roomTarget),
                    )}
                    formatV={numFormat.format}
                    highlight
                  />
                </TableRow>

                {/* ── 成約件数 / 成約室数（並列）── */}
                <TableRow>
                  <TableCell className="sticky left-0 bg-background z-10 font-semibold">
                    成約件数 / 成約室数
                  </TableCell>
                  {months.map((m) => (
                    <ValuePair
                      key={m}
                      v1={wonCv(m)}
                      v2={wonRooms(m)}
                      formatV={numFormat.format}
                    />
                  ))}
                  <ValuePair
                    v1={months.reduce((s, m) => s + wonCv(m), 0)}
                    v2={months.reduce((s, m) => s + wonRooms(m), 0)}
                    formatV={numFormat.format}
                    highlight
                  />
                </TableRow>

                {/* ── 目標粗利（件数側のみ）── */}
                <TableRow>
                  <TableCell className="sticky left-0 bg-background z-10 font-semibold">
                    目標粗利
                  </TableCell>
                  {months.map((m) => (
                    <CountOnlyPair
                      key={m}
                      value={grossTarget(m)}
                      formatV={(v) => jpyFormat.format(v)}
                    />
                  ))}
                  <CountOnlyPair
                    value={sumNullable(months, grossTarget)}
                    formatV={(v) => jpyFormat.format(v)}
                    highlight
                  />
                </TableRow>

                {/* ── 粗利（件数側のみ）── */}
                <TableRow>
                  <TableCell className="sticky left-0 bg-background z-10 font-semibold">粗利</TableCell>
                  {months.map((m) => (
                    <CountOnlyPair
                      key={m}
                      value={grossProfit(m)}
                      formatV={(v) => jpyFormat.format(v)}
                    />
                  ))}
                  <CountOnlyPair
                    value={months.reduce((s, m) => s + grossProfit(m), 0)}
                    formatV={(v) => jpyFormat.format(v)}
                    highlight
                  />
                </TableRow>

                {/* ── 粗利 − 目標（差分・赤緑）── */}
                <TableRow>
                  <TableCell className="sticky left-0 bg-background z-10 text-xs text-muted-foreground">
                    粗利 − 目標
                  </TableCell>
                  {months.map((m) => (
                    <DeltaCountOnlyPair
                      key={m}
                      delta={diff(grossProfit(m), grossTarget(m))}
                      formatV={(v) => jpyFormat.format(v)}
                    />
                  ))}
                  <DeltaCountOnlyPair
                    delta={diff(
                      months.reduce((s, m) => s + grossProfit(m), 0),
                      sumNullable(months, grossTarget),
                    )}
                    formatV={(v) => jpyFormat.format(v)}
                    highlight
                  />
                </TableRow>

                {/* ── RD目標（旧「利用日数（目標）」と統合、Issue #112）── */}
                <TableRow className="border-t-2 border-border">
                  <TableCell className="sticky left-0 bg-background z-10 font-semibold">
                    RD目標
                  </TableCell>
                  {months.map((m) => (
                    <RoomOnlyPair
                      key={m}
                      value={roomDaysTarget(m)}
                      formatV={numFormat.format}
                    />
                  ))}
                  <RoomOnlyPair
                    value={sumNullable(months, roomDaysTarget)}
                    formatV={numFormat.format}
                    highlight
                  />
                </TableRow>

                {/* ── 利用日数（依頼）室数側のみ ── */}
                <TableRow>
                  <TableCell className="sticky left-0 bg-background z-10 font-semibold">
                    利用日数（依頼）
                  </TableCell>
                  {months.map((m) => (
                    <RoomOnlyPair
                      key={m}
                      value={monthReqRdTotal(m)}
                      formatV={numFormat.format}
                    />
                  ))}
                  <RoomOnlyPair
                    value={months.reduce((s, m) => s + monthReqRdTotal(m), 0)}
                    formatV={numFormat.format}
                    highlight
                  />
                </TableRow>

                {/* ── 利用日数（成約）室数側のみ ── */}
                <TableRow>
                  <TableCell className="sticky left-0 bg-background z-10 font-semibold">
                    利用日数（成約）
                  </TableCell>
                  {months.map((m) => (
                    <RoomOnlyPair
                      key={m}
                      value={contractedRd(m)}
                      formatV={numFormat.format}
                    />
                  ))}
                  <RoomOnlyPair
                    value={months.reduce((s, m) => s + contractedRd(m), 0)}
                    formatV={numFormat.format}
                    highlight
                  />
                </TableRow>

                {/* ── 決定率（成約/依頼）室数側のみ ── */}
                <TableRow>
                  <TableCell className="sticky left-0 bg-background z-10 text-xs text-muted-foreground">
                    決定率（成約/依頼）
                  </TableCell>
                  {months.map((m) => {
                    const den = monthReqRdTotal(m);
                    const num = contractedRd(m);
                    return (
                      <RoomOnlyRatioPair key={m} ratio={den > 0 ? num / den : null} />
                    );
                  })}
                  <RoomOnlyRatioPair
                    ratio={(() => {
                      const den = months.reduce((s, m) => s + monthReqRdTotal(m), 0);
                      const num = months.reduce((s, m) => s + contractedRd(m), 0);
                      return den > 0 ? num / den : null;
                    })()}
                    highlight
                  />
                </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
    </TooltipProvider>
  );
}

/* ─────────────────────────────────────────────────────────────
 * ヘルパー
 * ───────────────────────────────────────────────────────────── */

function diff(actual: number, target: number | null): number | null {
  return target == null ? null : actual - target;
}

function sumNullable(months: string[], get: (m: string) => number | null): number | null {
  let sum = 0;
  let any = false;
  for (const m of months) {
    const v = get(m);
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

/* ─────────────────────────────────────────────────────────────
 * ヘッダーセル
 * ───────────────────────────────────────────────────────────── */

function CountRoomHeaderCells() {
  return (
    <>
      <TableHead className="text-center text-xs bg-blue-50/40 border-l font-medium text-blue-900 w-[80px]">
        件数
      </TableHead>
      <TableHead className="text-center text-xs bg-emerald-50/40 border-l font-medium text-emerald-900 w-[80px]">
        室数
      </TableHead>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
 * セルペア（4 サブ列単位）
 * ───────────────────────────────────────────────────────────── */

function CountRoomCells({
  countActual,
  roomActual,
  formatV,
  bold,
  highlight,
  breakdown,
  countMax,
  roomMax,
}: {
  countActual: number;
  roomActual: number;
  formatV: (v: number) => string;
  bold?: boolean;
  highlight?: boolean;
  /** あれば 実績セル(件数/室数)に CV発生月別の内訳ツールチップを付ける */
  breakdown?: { cvMonth: string; cv: number; cvRooms: number }[];
  /** 列内最大値。指定されている時のみ実績セルにヒートマップを適用 */
  countMax?: number;
  roomMax?: number;
}) {
  const heatEnabled = countMax !== undefined && roomMax !== undefined;

  const baseCls = cn('text-right tabular-nums px-2', bold && 'font-semibold');
  const cellCls = cn(baseCls, 'border-l', highlight && !heatEnabled && 'bg-muted/40');

  // 件数 = 青系、室数 = 緑系。最大 60% 不透明度でカラースケールを強調。
  const cvHeatStyle =
    heatEnabled && countMax > 0 && countActual > 0
      ? { backgroundColor: `rgba(59, 130, 246, ${((countActual / countMax) * 0.6).toFixed(3)})` }
      : undefined;
  const roomHeatStyle =
    heatEnabled && roomMax > 0 && roomActual > 0
      ? { backgroundColor: `rgba(16, 185, 129, ${((roomActual / roomMax) * 0.6).toFixed(3)})` }
      : undefined;

  const hasBreakdown = breakdown && breakdown.length > 0;

  const renderActual = (value: number) =>
    hasBreakdown ? (
      <Tooltip>
        <TooltipTrigger
          render={<span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2 outline-hidden" />}
        >
          {formatV(value)}
        </TooltipTrigger>
        <TooltipContent className="px-3 py-2">
          <BreakdownPopup rows={breakdown!} formatV={formatV} />
        </TooltipContent>
      </Tooltip>
    ) : (
      formatV(value)
    );

  return (
    <>
      <td className={cellCls} style={cvHeatStyle}>
        {renderActual(countActual)}
      </td>
      <td className={cellCls} style={roomHeatStyle}>
        {renderActual(roomActual)}
      </td>
    </>
  );
}

function BreakdownPopup({
  rows,
  formatV,
}: {
  rows: { cvMonth: string; cv: number; cvRooms: number }[];
  formatV: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5 min-w-[200px]">
      <p className="text-[11px] font-semibold opacity-80">CV発生月の内訳</p>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
        <span className="opacity-60">月</span>
        <span className="opacity-60 text-right">件数</span>
        <span className="opacity-60 text-right">室数</span>
        {rows.map((r) => (
          <Fragment key={r.cvMonth}>
            <span>{formatMonthLabel(r.cvMonth)}</span>
            <span className="text-right">{formatV(r.cv)}</span>
            <span className="text-right">{formatV(r.cvRooms)}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** 件数側 colspan=2 + 室数側 colspan=2 で 1 つの値ずつ表示 */
function ValuePair({
  v1,
  v2,
  formatV,
  highlight,
}: {
  v1: number;
  v2: number;
  formatV: (v: number) => string;
  highlight?: boolean;
}) {
  const cls = cn(
    'text-right tabular-nums px-2 border-l',
    highlight && 'bg-muted/40 font-semibold',
  );
  return (
    <>
      <td className={cls}>{formatV(v1)}</td>
      <td className={cn(cls, 'border-l-2 border-l-border/60')}>{formatV(v2)}</td>
    </>
  );
}

/** 必要件数 / 必要室数（差分の赤緑） */
function NeedPair({
  need1,
  need2,
  formatV,
  highlight,
}: {
  need1: number | null;
  need2: number | null;
  formatV: (v: number) => string;
  highlight?: boolean;
}) {
  return (
    <>
      <NeedHalfCell value={need1} formatV={formatV} highlight={highlight} />
      <NeedHalfCell value={need2} formatV={formatV} highlight={highlight} extraBorder />
    </>
  );
}

function NeedHalfCell({
  value,
  formatV,
  highlight,
  extraBorder,
}: {
  value: number | null;
  formatV: (v: number) => string;
  highlight?: boolean;
  extraBorder?: boolean;
}) {
  const borderCls = extraBorder ? 'border-l-2 border-l-border/60' : 'border-l';
  if (value == null) {
    return (
      <td className={cn('text-right tabular-nums px-2 text-muted-foreground', borderCls, highlight && 'bg-muted/40')}>
        —
      </td>
    );
  }
  const positive = value > 0;
  const negative = value < 0;
  return (
    <td
      className={cn(
        'text-right tabular-nums px-2 font-semibold',
        borderCls,
        positive && 'bg-green-100 text-green-800',
        negative && 'bg-red-100 text-red-800',
        !positive && !negative && highlight && 'bg-muted/40',
      )}
    >
      {value > 0 ? `+${formatV(value)}` : formatV(value)}
    </td>
  );
}

/** 件数側のみ値、室数側はグレーアウト */
function CountOnlyPair({
  value,
  formatV,
  highlight,
}: {
  value: number | null;
  formatV: (v: number) => string;
  highlight?: boolean;
}) {
  return (
    <>
      <td
        className={cn(
          'text-right tabular-nums px-2 border-l',
          highlight && 'bg-muted/40 font-semibold',
        )}
      >
        {value == null ? <span className="text-muted-foreground">—</span> : formatV(value)}
      </td>
      <td className="border-l-2 border-l-border/60 bg-muted/10" aria-hidden="true" />
    </>
  );
}

function DeltaCountOnlyPair({
  delta,
  formatV,
  highlight,
}: {
  delta: number | null;
  formatV: (v: number) => string;
  highlight?: boolean;
}) {
  return (
    <>
      <td
        className={cn(
          'text-right tabular-nums px-2 border-l text-xs',
          delta == null
            ? 'text-muted-foreground'
            : delta < 0
              ? 'text-red-600 font-semibold'
              : 'text-green-600 font-semibold',
          highlight && 'bg-muted/40',
        )}
      >
        {delta == null ? '—' : formatV(delta)}
      </td>
      <td className="border-l-2 border-l-border/60 bg-muted/10" aria-hidden="true" />
    </>
  );
}

/** 室数側のみ値、件数側はグレーアウト */
function RoomOnlyPair({
  value,
  formatV,
  highlight,
}: {
  value: number | null;
  formatV: (v: number) => string;
  highlight?: boolean;
}) {
  return (
    <>
      <td className="border-l bg-muted/10" aria-hidden="true" />
      <td
        className={cn(
          'text-right tabular-nums px-2 border-l-2 border-l-border/60',
          highlight && 'bg-muted/40 font-semibold',
        )}
      >
        {value == null ? <span className="text-muted-foreground">—</span> : formatV(value)}
      </td>
    </>
  );
}

function RoomOnlyRatioPair({ ratio, highlight }: { ratio: number | null; highlight?: boolean }) {
  return (
    <>
      <td className="border-l bg-muted/10" aria-hidden="true" />
      <td
        className={cn(
          'text-right tabular-nums px-2 border-l-2 border-l-border/60 text-xs',
          highlight && 'bg-muted/40 font-semibold',
        )}
      >
        {ratio == null ? <span className="text-muted-foreground">—</span> : pctFormat.format(ratio)}
      </td>
    </>
  );
}
