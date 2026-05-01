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
import { RefreshCw, Pencil, ArrowDown } from 'lucide-react';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { jpyFormat, numFormat, pctFormat, formatMonthLabel } from '@/lib/format';
import { currentPeriod, periodRange, type Period } from '@/lib/period';
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
  grossProfitTarget: number | null;
  useDaysTarget: number | null;
};

type ApiResponse = {
  period: { months: string[]; label: string };
  pivot: PivotRow[];
  summary: SummaryRow[];
  targets: TargetRow[];
};

export default function MoveInPivotPage() {
  const [period, setPeriod] = useState<Period>(() => currentPeriod(TODAY, 'half'));
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({
        periodType: period.type,
        year: String(period.year),
        index: String(period.index),
      });
      const res = await fetch(`/api/dashboard/move-in/pivot?${params}`);
      const json = await res.json();
      if (json.error) {
        console.error(json.error);
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setData(null);
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
      if (r.cvMonth >= periodStart) continue;
      const list = map.get(r.moveInMonth) ?? [];
      list.push(r);
      map.set(r.moveInMonth, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.cvMonth.localeCompare(a.cvMonth));
    return map;
  }, [data, months]);

  /** 月間CV合計列（前期間以前 行）用に CV月ごとに横断集計した内訳 */
  const beforeBreakdownTotal = useMemo(() => {
    const periodStart = months[0] ?? '';
    const agg = new Map<string, { cv: number; cvRooms: number; requestRoomDays: number }>();
    for (const r of data?.pivot ?? []) {
      if (r.cvMonth >= periodStart) continue;
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
  const useDaysTarget = (m: string) => lookups.targetMap.get(m)?.useDaysTarget ?? null;

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

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">入居日ベース</h1>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            行 = CV発生月、列 = 入居月（件数＋室数を並列表示）。マーケ課以外がメインで見る KPI ビュー。
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
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              {/* ─── ヘッダ 3 段 ─── */}
              <TableHeader>
                {/* 1 段目: 入居月（colspan=4 = 件数 2 + 室数 2）。corner = CV発生月ラベル */}
                <TableRow>
                  <TableHead
                    rowSpan={3}
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
                      colSpan={4}
                      className="text-center bg-muted/30 border-l font-semibold"
                    >
                      {formatMonthLabel(m).replace('年', '/')}入居
                    </TableHead>
                  ))}
                  <TableHead colSpan={4} className="text-center bg-muted/50 border-l font-semibold">
                    月間CV合計
                  </TableHead>
                </TableRow>
                {/* 2 段目: 件数 / 室数（colspan=2 ずつ）*/}
                <TableRow>
                  {months.map((m) => (
                    <CountRoomHeaderCells key={m} />
                  ))}
                  <CountRoomHeaderCells />
                </TableRow>
                {/* 3 段目: 目標 / 実績 */}
                <TableRow>
                  {months.map((m) => (
                    <TargetActualHeaderCells key={m} />
                  ))}
                  <TargetActualHeaderCells />
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
                          countTarget={null}
                          countActual={cellCv(cv, m)}
                          roomTarget={null}
                          roomActual={cellRooms(cv, m)}
                          formatV={numFormat.format}
                          breakdown={isBefore ? beforeBreakdown.get(m) : undefined}
                          countMax={colMax.cvMaxByMonth.get(m) ?? 0}
                          roomMax={colMax.roomMaxByMonth.get(m) ?? 0}
                        />
                      ))}
                      <CountRoomCells
                        countTarget={null}
                        countActual={rowCvTotal}
                        roomTarget={null}
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
                      countTarget={cvTarget(m)}
                      countActual={monthCvTotal(m)}
                      roomTarget={roomTarget(m)}
                      roomActual={monthRoomTotal(m)}
                      formatV={numFormat.format}
                      bold
                    />
                  ))}
                  <CountRoomCells
                    countTarget={sumNullable(months, cvTarget)}
                    countActual={months.reduce((s, m) => s + monthCvTotal(m), 0)}
                    roomTarget={sumNullable(months, roomTarget)}
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

                {/* ── 利用日数（目標）室数側のみ ── */}
                <TableRow className="border-t-2 border-border">
                  <TableCell className="sticky left-0 bg-background z-10 font-semibold">
                    利用日数（目標）
                  </TableCell>
                  {months.map((m) => (
                    <RoomOnlyPair
                      key={m}
                      value={useDaysTarget(m)}
                      formatV={numFormat.format}
                    />
                  ))}
                  <RoomOnlyPair
                    value={sumNullable(months, useDaysTarget)}
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
      <TableHead colSpan={2} className="text-center text-xs bg-blue-50/40 border-l font-medium text-blue-900">
        件数
      </TableHead>
      <TableHead colSpan={2} className="text-center text-xs bg-emerald-50/40 border-l font-medium text-emerald-900">
        室数
      </TableHead>
    </>
  );
}

function TargetActualHeaderCells() {
  return (
    <>
      <TableHead className="text-right text-[11px] bg-amber-50/30 font-medium text-amber-900 border-l w-[68px]">
        目標
      </TableHead>
      <TableHead className="text-right text-[11px] font-medium w-[68px]">実績</TableHead>
      <TableHead className="text-right text-[11px] bg-amber-50/30 font-medium text-amber-900 border-l w-[68px]">
        目標
      </TableHead>
      <TableHead className="text-right text-[11px] font-medium w-[68px]">実績</TableHead>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
 * セルペア（4 サブ列単位）
 * ───────────────────────────────────────────────────────────── */

function CountRoomCells({
  countTarget,
  countActual,
  roomTarget,
  roomActual,
  formatV,
  bold,
  highlight,
  breakdown,
  countMax,
  roomMax,
}: {
  countTarget: number | null;
  countActual: number;
  roomTarget: number | null;
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
  // ヒートマップ有効時はハイライト bg を上書き（heat 色を優先）。
  // 無効時は従来の muted/40 を使う。
  const targetHighlightCls = highlight ? 'bg-muted/40' : '';
  const actualHighlightCls = highlight && !heatEnabled ? 'bg-muted/40' : '';

  const targetCls = cn(baseCls, 'bg-amber-50/30 text-muted-foreground border-l', targetHighlightCls);
  const actualCls = cn(baseCls, actualHighlightCls);

  // 件数 = 青系、室数 = 緑系。最大 35% 不透明度で文字を残す。
  const cvHeatStyle =
    heatEnabled && countMax > 0 && countActual > 0
      ? { backgroundColor: `rgba(59, 130, 246, ${((countActual / countMax) * 0.35).toFixed(3)})` }
      : undefined;
  const roomHeatStyle =
    heatEnabled && roomMax > 0 && roomActual > 0
      ? { backgroundColor: `rgba(16, 185, 129, ${((roomActual / roomMax) * 0.35).toFixed(3)})` }
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
      <td className={targetCls}>{countTarget == null ? '' : formatV(countTarget)}</td>
      <td className={actualCls} style={cvHeatStyle}>
        {renderActual(countActual)}
      </td>
      <td className={cn(targetCls, 'border-l-2 border-l-border/60')}>
        {roomTarget == null ? '' : formatV(roomTarget)}
      </td>
      <td className={actualCls} style={roomHeatStyle}>
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
      <td colSpan={2} className={cls}>
        {formatV(v1)}
      </td>
      <td colSpan={2} className={cn(cls, 'border-l-2 border-l-border/60')}>
        {formatV(v2)}
      </td>
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
      <td
        colSpan={2}
        className={cn('text-right tabular-nums px-2 text-muted-foreground', borderCls, highlight && 'bg-muted/40')}
      >
        —
      </td>
    );
  }
  const positive = value > 0;
  const negative = value < 0;
  return (
    <td
      colSpan={2}
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
        colSpan={2}
        className={cn(
          'text-right tabular-nums px-2 border-l',
          highlight && 'bg-muted/40 font-semibold',
        )}
      >
        {value == null ? <span className="text-muted-foreground">—</span> : formatV(value)}
      </td>
      <td colSpan={2} className="border-l-2 border-l-border/60 bg-muted/10" aria-hidden="true" />
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
        colSpan={2}
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
      <td colSpan={2} className="border-l-2 border-l-border/60 bg-muted/10" aria-hidden="true" />
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
      <td colSpan={2} className="border-l bg-muted/10" aria-hidden="true" />
      <td
        colSpan={2}
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
      <td colSpan={2} className="border-l bg-muted/10" aria-hidden="true" />
      <td
        colSpan={2}
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
