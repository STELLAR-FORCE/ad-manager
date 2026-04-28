'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CountingNumber } from '@/components/animate-ui/counting-number';
import type { DateRangeValue } from '@/components/ui/date-range-picker';
import type { SfOpportunitySummary, SfLeadSummary } from '@/lib/types/salesforce';
import { cn } from '@/lib/utils';

const numFormat = new Intl.NumberFormat('ja-JP');
const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const pctFormat = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const decFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

const STAGGER_MS = 110;

type AdMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
};

type StageDef = {
  key: string;
  group: 'ad' | 'sales';
  label: string;
  value: number | null;
  format: (v: number) => string;
  /** 注釈（hover で出る） */
  note?: string;
};

type RateDef = {
  key: string;
  label: string;
  value: number | null;
  /** リード化率は同期間の合計比較なので注意書きが必要 */
  caveat?: string;
};

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function IntegratedFunnel({
  adMetrics,
  dateRange,
}: {
  adMetrics: AdMetrics;
  dateRange: DateRangeValue;
}) {
  const [sfSummary, setSfSummary] = useState<SfOpportunitySummary | null>(null);
  const [sfLeads, setSfLeads] = useState<SfLeadSummary | null>(null);
  const [sfError, setSfError] = useState<string | null>(null);

  const startParam = useMemo(() => toDateParam(dateRange.main.start), [dateRange.main.start]);
  const endParam = useMemo(() => toDateParam(dateRange.main.end), [dateRange.main.end]);

  useEffect(() => {
    const qs = new URLSearchParams({ start: startParam, end: endParam });
    const controller = new AbortController();

    setSfError(null);

    Promise.all([
      fetch(`/api/salesforce/summary?${qs}`, { signal: controller.signal }).then((r) => r.json()),
      fetch(`/api/salesforce/leads?${qs}`, { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([summary, leads]) => {
        if (summary?.error) throw new Error(summary.error);
        if (leads?.error) throw new Error(leads.error);
        setSfSummary(summary as SfOpportunitySummary);
        setSfLeads(leads as SfLeadSummary);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setSfError(err instanceof Error ? err.message : String(err));
        setSfSummary(null);
        setSfLeads(null);
      });

    return () => controller.abort();
  }, [startParam, endParam]);

  const stages: StageDef[] = [
    {
      key: 'impressions',
      group: 'ad',
      label: '表示',
      value: adMetrics.impressions,
      format: (v) => numFormat.format(Math.round(v)),
    },
    {
      key: 'clicks',
      group: 'ad',
      label: 'クリック',
      value: adMetrics.clicks,
      format: (v) => numFormat.format(Math.round(v)),
    },
    {
      key: 'ad_cv',
      group: 'ad',
      label: '広告 CV',
      value: adMetrics.conversions,
      format: (v) => numFormat.format(Math.round(v)),
    },
    {
      key: 'sf_lead',
      group: 'sales',
      label: 'リード',
      value: sfLeads?.total ?? null,
      format: (v) => numFormat.format(Math.round(v)),
    },
    {
      key: 'sf_converted',
      group: 'sales',
      label: '商談化',
      value: sfLeads?.converted ?? null,
      format: (v) => numFormat.format(Math.round(v)),
      note: 'sf_Lead.IsConverted = TRUE',
    },
    {
      key: 'sf_won',
      group: 'sales',
      label: '成約',
      value: sfSummary?.won ?? null,
      format: (v) => numFormat.format(Math.round(v)),
      note: 'sf_Opportunity.StageName = 案件成立',
    },
  ];

  const ratio = (num: number | null, den: number | null): number | null => {
    if (num == null || den == null || den <= 0) return null;
    return num / den;
  };

  const rates: RateDef[] = [
    {
      key: 'ctr',
      label: 'CTR',
      value: ratio(adMetrics.clicks, adMetrics.impressions),
    },
    {
      key: 'cvr',
      label: 'CVR',
      value: ratio(adMetrics.conversions, adMetrics.clicks),
    },
    {
      key: 'lead_match',
      label: 'リード化',
      value: ratio(sfLeads?.total ?? null, adMetrics.conversions),
      caveat: '同期間の合計同士の比率です。広告流入から発生したリードの実数ではありません',
    },
    {
      key: 'opp_rate',
      label: '商談化率',
      value: ratio(sfLeads?.converted ?? null, sfLeads?.total ?? null),
    },
    {
      key: 'win_rate',
      label: 'Win 率',
      value: sfSummary?.winRate ?? null,
      caveat: '成約 ÷ (成約 + 失注)',
    },
  ];

  const cpo =
    sfSummary?.won && sfSummary.won > 0 && adMetrics.cost > 0
      ? adMetrics.cost / sfSummary.won
      : null;
  const cpl =
    sfLeads?.total && sfLeads.total > 0 && adMetrics.cost > 0
      ? adMetrics.cost / sfLeads.total
      : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          広告 → 営業 統合ファネル
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider delay={200}>
          {/* グループラベル */}
          <div className="hidden md:grid grid-cols-6 gap-3 text-[11px] font-medium text-muted-foreground mb-2 px-1">
            <div className="col-span-3 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
              広告フェーズ
            </div>
            <div className="col-span-3 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              営業フェーズ（Salesforce）
            </div>
          </div>

          {/* ファネル本体 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            {stages.map((stage, i) => (
              <FunnelStage
                key={stage.key}
                stage={stage}
                index={i}
                rate={i < rates.length ? rates[i] : null}
                isFirst={i === 0}
                isLast={i === stages.length - 1}
                isErrored={stage.group === 'sales' && sfError !== null}
              />
            ))}
          </div>

          {/* サマリー帯 */}
          <div className="mt-5 pt-4 border-t border-border/60 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <SummaryItem label="広告費" value={jpyFormat.format(Math.round(adMetrics.cost))} />
            <ArrowRight className="size-3.5 text-muted-foreground/40 shrink-0" aria-hidden="true" />
            <SummaryItem
              label="リード単価"
              value={cpl != null ? jpyFormat.format(Math.round(cpl)) : '—'}
              hint="CPL = 広告費 / リード"
            />
            <ArrowRight className="size-3.5 text-muted-foreground/40 shrink-0" aria-hidden="true" />
            <SummaryItem
              label="成約単価"
              value={cpo != null ? jpyFormat.format(Math.round(cpo)) : '—'}
              hint="CPO = 広告費 / 成約数"
            />
            <span className="mx-1 h-6 w-px bg-border/60" aria-hidden="true" />
            <SummaryItem
              label="平均リードタイム"
              value={
                sfSummary?.avgLeadTimeDays != null
                  ? `${decFormat.format(sfSummary.avgLeadTimeDays)} 日`
                  : '—'
              }
              hint="成約案件のみ"
            />
            <span className="ml-auto text-xs text-muted-foreground">
              ※ 売上・ROAS・室数は BQ テーブル整理後に追加
            </span>
          </div>

          {sfError && (
            <div className="mt-3 text-xs text-red-600 dark:text-red-400">
              Salesforce データ取得エラー: {sfError}
            </div>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function FunnelStage({
  stage,
  index,
  rate,
  isFirst,
  isLast,
  isErrored,
}: {
  stage: StageDef;
  index: number;
  rate: RateDef | null;
  isFirst: boolean;
  isLast: boolean;
  isErrored: boolean;
}) {
  const delay = index * STAGGER_MS;
  const isAd = stage.group === 'ad';

  return (
    <div className="relative">
      <div
        className={cn(
          'rounded-lg border p-3 sm:p-4 h-full flex flex-col justify-between gap-3',
          'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both',
          isAd
            ? 'bg-indigo-50/60 border-indigo-200/70 dark:bg-indigo-950/30 dark:border-indigo-800/50'
            : 'bg-emerald-50/60 border-emerald-200/70 dark:bg-emerald-950/30 dark:border-emerald-800/50',
        )}
        style={{ animationDelay: `${delay}ms`, animationDuration: '420ms' }}
      >
        <div className="flex items-center justify-between gap-1">
          <p
            className={cn(
              'text-xs font-medium',
              isAd
                ? 'text-indigo-700 dark:text-indigo-300'
                : 'text-emerald-700 dark:text-emerald-300',
            )}
          >
            {stage.label}
          </p>
          {stage.note && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    aria-label={`${stage.label}の定義`}
                  />
                }
              >
                <Info className="size-3" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[240px]">
                {stage.note}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div>
          <p className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight leading-none">
            {stage.value == null ? (
              <span className="text-muted-foreground/60">{isErrored ? '—' : '…'}</span>
            ) : (
              <CountingNumber
                number={stage.value}
                transition={{ stiffness: 260, damping: 32 }}
                delay={delay}
                format={stage.format}
              />
            )}
          </p>
        </div>
        {!isFirst && rate != null && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <ArrowRight className="size-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              <span className="opacity-70">{rate.label}</span>{' '}
              <span className="tabular-nums font-medium text-foreground/80">
                {rate.value != null ? pctFormat.format(rate.value) : '—'}
              </span>
            </span>
            {rate.caveat && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="text-muted-foreground/60 hover:text-muted-foreground transition-colors shrink-0"
                      aria-label={`${rate.label}の注釈`}
                    />
                  }
                >
                  <Info className="size-2.5" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[260px]">
                  {rate.caveat}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
        {isFirst && <div className="h-[18px]" aria-hidden="true" />}
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="ml-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  aria-label={`${label}の定義`}
                />
              }
            >
              <Info className="size-2.5 inline" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {hint}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}
