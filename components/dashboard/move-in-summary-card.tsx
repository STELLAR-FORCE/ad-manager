'use client';

/**
 * Issue #64 — 入居月サマリーカード
 *
 * 入居月単位で「着地見込み」を一目で掴むためのカード。
 * 営業/経営は時系列、マーケはリードタイム逆算で施策タイミングを判断する想定。
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@heroui/react';
import { TrendingDown, TrendingUp, Minus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { jpyCompact, numFormat, pctFormat, formatMonthLabel } from '@/lib/format';

export type MoveInSummaryCardData = {
  moveInMonth: string; // 'YYYY-MM'
  cv: number;
  cvTarget: number | null;
  rooms: number;
  roomTarget: number | null;
  /** 成約数 (契約管理ベース)。CV のうち成約済みを歩留まりバーで重ねる */
  wonCv: number;
  /** 成約室数 (契約管理ベース) */
  wonRooms: number;
  confirmedGrossProfit: number;
  pipelineForecastGrossProfit: number;
  grossProfitTarget: number | null;
  actualUnitPriceMedian: number | null;
  assumedUnitPrice: number;
  introducedRooms: number;
  earlyRooms: number;
};

type Props = {
  data: MoveInSummaryCardData;
  /** 今日の日付（リードタイク計算用）。テストや SSR の都合で外部注入可 */
  today?: Date;
};

type Status = 'good' | 'warn' | 'risk' | 'achieved' | 'failed';

/**
 * 進行中の月: 予想粗利 (確定 + 見込) vs 目標 → 「順調 / 注意 / 危険」
 * 月終了後: 確定粗利のみ vs 目標 → 「達成 / 未達」(見込分は楽観的なので除く厳格判定)
 */
function statusFromAchievement(
  forecast: number,
  confirmed: number,
  target: number | null,
  ended: boolean,
): Status {
  if (target == null || target === 0) return 'good';
  if (ended) {
    const ratio = confirmed / target;
    return ratio >= 1 ? 'achieved' : 'failed';
  }
  const ratio = forecast / target;
  if (ratio >= 1) return 'good';
  if (ratio >= 0.7) return 'warn';
  return 'risk';
}

const STATUS_LABEL: Record<Status, string> = {
  good: '順調',
  warn: '注意',
  risk: '危険',
  achieved: '達成',
  failed: '未達',
};

const STATUS_COLOR: Record<Status, 'success' | 'warning' | 'danger'> = {
  good: 'success',
  warn: 'warning',
  risk: 'danger',
  achieved: 'success',
  failed: 'danger',
};

/** 入居月が終了したか (= 翌月 1 日以降か) */
function isMoveInMonthEnded(month: string, today: Date): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return false;
  const nextMonthFirst = new Date(Number(m[1]), Number(m[2]), 1);
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayDay >= nextMonthFirst;
}

/** 月初の日付。'2026-07' → 2026-07-01 (ローカル) */
function monthFirstDay(month: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

/** 入居月初日までの日数。負数 = 既に経過 */
function daysUntilMoveIn(month: string, today: Date): number {
  const target = monthFirstDay(month).getTime();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((target - start) / (1000 * 60 * 60 * 24));
}

type LeadTimePhase = {
  label: string;
  /** 該当時の Chip color */
  color: 'success' | 'warning' | 'danger' | 'default';
  /** 詳細サブテキスト */
  hint: string;
};

function leadTimePhase(days: number): LeadTimePhase {
  if (days < 0) return { label: '入居期間中', color: 'default', hint: '実績確定フェーズ' };
  if (days < 30) return { label: '終盤', color: 'danger', hint: 'リード追加は反映困難' };
  if (days <= 45) return { label: '注力期間', color: 'warning', hint: 'CV 取得スイートスポット' };
  return { label: '余裕あり', color: 'success', hint: `あと ${days} 日 → CV 取得期に向けて準備` };
}

function pct(numer: number, denom: number | null): string {
  if (denom == null || denom === 0) return '—';
  return pctFormat.format(numer / denom);
}

function arrow(actual: number, target: number | null) {
  if (target == null || target === 0) return <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
  if (actual >= target) return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />;
  return <TrendingDown className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />;
}

/**
 * 達成率バー内での「成約 / 未成約」の幅 (%)。目標を 100% 幅とする。
 * 目標が無い場合は CV 合計を 100% として歩留まり比率で表示。
 */
function yieldWidths(won: number, total: number, target: number | null): { won: number; rest: number } {
  if (target == null || target <= 0) {
    if (total <= 0) return { won: 0, rest: 0 };
    return { won: (won / total) * 100, rest: ((total - won) / total) * 100 };
  }
  const wonW = Math.min(100, (won / target) * 100);
  const restW = Math.min(Math.max(0, 100 - wonW), (Math.max(0, total - won) / target) * 100);
  return { won: wonW, rest: restW };
}

/** CV数 / CV室数 を「成約(濃) / 未成約(淡)」の歩留まり積み上げバーで表示 */
function YieldBar({
  label,
  won,
  total,
  target,
}: {
  label: string;
  won: number;
  total: number;
  target: number | null;
}) {
  const w = yieldWidths(won, total, target);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5 text-xs tabular-nums">
          {arrow(total, target)}
          <span className="font-semibold">{numFormat.format(total)}</span>
          <span className="text-muted-foreground">
            / {target != null ? numFormat.format(target) : '—'}
          </span>
          <span className="text-muted-foreground">({pct(total, target)})</span>
        </div>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${label} (成約 / 未成約)`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(w.won + w.rest)}
      >
        <div className="flex h-full w-full">
          <div className="bg-emerald-500" style={{ width: `${w.won}%` }} />
          <div className="bg-emerald-300/70" style={{ width: `${w.rest}%` }} />
        </div>
      </div>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground tabular-nums">
        <span className="flex items-center gap-1">
          <span className="block size-2 rounded-sm bg-emerald-500" aria-hidden="true" />
          成約 {numFormat.format(won)}
        </span>
        <span className="flex items-center gap-1">
          <span className="block size-2 rounded-sm bg-emerald-300/70" aria-hidden="true" />
          未成約 {numFormat.format(Math.max(0, total - won))}
        </span>
      </div>
    </div>
  );
}

export function MoveInSummaryCard({ data, today = new Date() }: Props) {
  const [expanded, setExpanded] = useState(false);
  const forecastTotal = data.confirmedGrossProfit + data.pipelineForecastGrossProfit;
  const monthEnded = isMoveInMonthEnded(data.moveInMonth, today);
  const status = statusFromAchievement(
    forecastTotal,
    data.confirmedGrossProfit,
    data.grossProfitTarget,
    monthEnded,
  );
  const days = daysUntilMoveIn(data.moveInMonth, today);
  const phase = leadTimePhase(days);

  const unitPriceRatio =
    data.actualUnitPriceMedian == null || data.assumedUnitPrice === 0
      ? null
      : data.actualUnitPriceMedian / data.assumedUnitPrice;

  return (
    <Card className={cn(
      'flex flex-col',
      (status === 'risk' || status === 'failed') && 'border-rose-200',
      status === 'warn' && 'border-amber-200',
      status === 'achieved' && 'border-emerald-200',
    )}>
      <CardContent className="flex flex-col gap-4 p-5">
        {/* ヘッダ: 入居月 + ステータス + リードタイク */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">{formatMonthLabel(data.moveInMonth)}入居</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{phase.hint}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Chip color={STATUS_COLOR[status]} variant="soft" size="sm">
              {STATUS_LABEL[status]}
            </Chip>
            <Chip color={phase.color} variant="soft" size="sm" className="text-[10px]">
              <Chip.Label>{phase.label}{days >= 0 && ` ・残${numFormat.format(days)}日`}</Chip.Label>
            </Chip>
          </div>
        </div>

        {/* CV数 / CV室数 (成約/未成約の歩留まりバー・簡易表示) */}
        <YieldBar label="CV数" won={data.wonCv} total={data.cv} target={data.cvTarget} />
        <YieldBar label="CV室数" won={data.wonRooms} total={data.rooms} target={data.roomTarget} />

        {/* 予想粗利 (簡易表示・常時) */}
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">予想粗利</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              目標 {data.grossProfitTarget != null ? jpyCompact.format(data.grossProfitTarget) : '—'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums">{jpyCompact.format(forecastTotal)}</span>
            <span className="text-xs text-muted-foreground">({pct(forecastTotal, data.grossProfitTarget)})</span>
          </div>
          {/* 確定/見込 を積み上げ進捗バーで可視化 (目標 = 100% 幅) */}
          {data.grossProfitTarget != null && data.grossProfitTarget > 0 && (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="予想粗利 内訳 (確定 / 見込)"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, (forecastTotal / data.grossProfitTarget) * 100)}
            >
              <div className="flex h-full w-full">
                <div
                  className="bg-emerald-500"
                  style={{
                    width: `${Math.min(100, (data.confirmedGrossProfit / data.grossProfitTarget) * 100)}%`,
                  }}
                />
                <div
                  className="bg-emerald-300/70"
                  style={{
                    width: `${Math.min(
                      Math.max(0, 100 - (data.confirmedGrossProfit / data.grossProfitTarget) * 100),
                      (data.pipelineForecastGrossProfit / data.grossProfitTarget) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 詳細トグル */}
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
          {expanded ? '閉じる' : '詳細'}
        </button>

        {/* 詳細 (確定/見込 内訳 / 実態単価) */}
        {expanded && (
          <div className="flex flex-col gap-4">
            {/* 確定 / 見込 内訳 */}
            <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
              <div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="block size-2 rounded-sm bg-emerald-500" aria-hidden="true" />
                  確定
                  {forecastTotal > 0 && (
                    <span className="opacity-70">
                      ({pctFormat.format(data.confirmedGrossProfit / forecastTotal)})
                    </span>
                  )}
                </div>
                <div className="font-semibold">{jpyCompact.format(data.confirmedGrossProfit)}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="block size-2 rounded-sm bg-emerald-300/70" aria-hidden="true" />
                  見込粗利
                  {forecastTotal > 0 && (
                    <span className="opacity-70">
                      ({pctFormat.format(data.pipelineForecastGrossProfit / forecastTotal)})
                    </span>
                  )}
                </div>
                <div className="font-semibold">{jpyCompact.format(data.pipelineForecastGrossProfit)}</div>
                <div className="text-muted-foreground text-[10px]">
                  紹介後 {numFormat.format(data.introducedRooms)}室・早期 {numFormat.format(data.earlyRooms)}室
                </div>
              </div>
            </div>

            {/* 想定 vs 実態 単価 (= 成約 1 室あたりの確定粗利) */}
            <div className="flex items-center justify-between rounded-md border-l-2 border-amber-300 bg-amber-50/40 px-3 py-1.5 text-xs dark:bg-amber-950/20">
              <span
                className="text-muted-foreground"
                title="成約 1 室あたりの確定粗利（総売上_粗利 ÷ 成約室数）の中央値。想定は ¥100,000/室"
              >
                実態単価（粗利/室・中央値）
              </span>
              <div className="text-right tabular-nums">
                <div className="font-semibold">
                  {data.actualUnitPriceMedian != null
                    ? `${jpyCompact.format(data.actualUnitPriceMedian)}/室`
                    : '—'}
                  <span className="text-muted-foreground font-normal">
                    {' '}/ 想定 {jpyCompact.format(data.assumedUnitPrice)}/室
                  </span>
                </div>
                {unitPriceRatio != null && (
                  <div className={cn('text-[10px]', unitPriceRatio < 0.8 ? 'text-amber-700' : 'text-muted-foreground')}>
                    想定の {pctFormat.format(unitPriceRatio)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
