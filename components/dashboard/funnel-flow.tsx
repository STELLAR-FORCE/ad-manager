'use client';

import { Fragment, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Chip } from '@heroui/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CountingNumber } from '@/components/animate-ui/counting-number';
import { cn } from '@/lib/utils';

export type FunnelMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cvr: number;
  cpc: number;
  cpa: number;
};

const numFormat = new Intl.NumberFormat('ja-JP');
const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const pctFormat = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Stage = {
  key: 'impressions' | 'clicks' | 'conversions';
  label: string;
  value: number;
  helperLabel: string;
  helperValue: string;
  heightRatio: number;
  ariaLabel: string;
};

type Rate = {
  key: 'ctr' | 'cvr';
  label: string;
  valueLabel: string;
};

// 最小42% — バー内部（上段: ラベル+値、下段: ラベル+値）を確実に収める下限
const MIN_RATIO = 0.42;
const STAGE_STAGGER_MS = 140;

// 下段（右）ほど薄く
const BAR_OPACITY = [1, 0.92, 0.84];

// コンテナ高さ（カラムが立つ舞台の高さ）
const CHART_HEIGHT_PX = 340;

export function FunnelFlow({
  metrics,
  isMock,
}: {
  metrics: FunnelMetrics;
  isMock: boolean;
}) {
  const { impressions, clicks, cost, conversions, ctr, cvr, cpc, cpa } = metrics;
  const [hovered, setHovered] = useState<number | null>(null);

  // 対数スケール — 線形だと下段が潰れるため
  const logBase = Math.log10(Math.max(impressions, 10));
  const logRatio = (val: number) => {
    if (logBase <= 0) return 1;
    const v = Math.log10(Math.max(val, 1));
    return Math.max(v / logBase, MIN_RATIO);
  };
  const clickRatio = logRatio(clicks);
  const cvRatio = logRatio(conversions);

  const stages: Stage[] = [
    {
      key: 'impressions',
      label: '表示',
      value: impressions,
      helperLabel: '費用',
      helperValue: jpyFormat.format(Math.round(cost)),
      heightRatio: 1,
      ariaLabel: `表示数 ${numFormat.format(impressions)}`,
    },
    {
      key: 'clicks',
      label: 'クリック',
      value: clicks,
      helperLabel: 'CPC',
      helperValue: cpc > 0 ? jpyFormat.format(Math.round(cpc)) : '—',
      heightRatio: clickRatio,
      ariaLabel: `クリック数 ${numFormat.format(clicks)}`,
    },
    {
      key: 'conversions',
      label: 'CV',
      value: conversions,
      helperLabel: 'CPA',
      helperValue: cpa > 0 ? jpyFormat.format(Math.round(cpa)) : '—',
      heightRatio: cvRatio,
      ariaLabel: `CV数 ${numFormat.format(Math.round(conversions))}`,
    },
  ];

  const rates: Rate[] = [
    { key: 'ctr', label: 'CTR', valueLabel: pctFormat.format(ctr) },
    { key: 'cvr', label: 'CVR', valueLabel: pctFormat.format(cvr) },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          表示 → クリック → CV フロー
          {isMock && (
            <Badge variant="secondary" className="text-xs font-normal">
              サンプル
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="flex items-end justify-center gap-3 sm:gap-5 mx-auto max-w-3xl"
          style={{ height: `${CHART_HEIGHT_PX}px` }}
          aria-label="表示→クリック→CV ファネル"
        >
          {stages.map((stage, i) => {
            const delay = i * STAGE_STAGGER_MS;
            const rate = i < rates.length ? rates[i] : null;
            const rateDelay = delay + STAGE_STAGGER_MS / 2;

            return (
              <Fragment key={stage.key}>
                <FunnelColumn
                  stage={stage}
                  index={i}
                  delay={delay}
                  isHovered={hovered === i}
                  isDimmed={hovered !== null && hovered !== i}
                  onEnter={() => setHovered(i)}
                  onLeave={() => setHovered(null)}
                />
                {rate && (
                  <RateConnector rate={rate} delay={rateDelay} />
                )}
              </Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelColumn({
  stage,
  index,
  delay,
  isHovered,
  isDimmed,
  onEnter,
  onLeave,
}: {
  stage: Stage;
  index: number;
  delay: number;
  isHovered: boolean;
  isDimmed: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const heightPct = stage.heightRatio * 100;
  const opacity = BAR_OPACITY[index] ?? 1;

  return (
    <div
      className={cn(
        'relative flex-1 min-w-0 max-w-[220px] h-full flex flex-col justify-end',
        'transition-opacity duration-200',
        isDimmed && 'opacity-60',
      )}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      <div
        role="img"
        aria-label={stage.ariaLabel}
        tabIndex={0}
        className={cn(
          'w-full rounded-xl px-3 sm:px-4 py-3 sm:py-4 text-white shadow-sm',
          'bg-gradient-to-b from-indigo-400 to-indigo-500',
          'dark:from-indigo-400 dark:to-indigo-500',
          'outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 dark:focus-visible:ring-indigo-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'transition-[box-shadow,transform] duration-150',
          'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both',
          'flex flex-col justify-between',
          isHovered &&
            'ring-2 ring-indigo-300 dark:ring-indigo-400/60 ring-offset-2 ring-offset-background',
        )}
        style={{
          height: `${heightPct}%`,
          opacity,
          animationDelay: `${delay}ms`,
          animationDuration: '450ms',
        }}
      >
        <div>
          <p className="text-xs font-medium text-white/80">{stage.label}</p>
          <p className="text-lg sm:text-2xl font-bold tabular-nums tracking-tight mt-0.5 leading-tight">
            <CountingNumber
              number={stage.value}
              transition={{ stiffness: 260, damping: 32 }}
              delay={delay}
              format={(v) => numFormat.format(Math.round(v))}
            />
          </p>
        </div>
        <div className="mt-2">
          <p className="text-xs font-medium text-white/80">
            {stage.helperLabel}
          </p>
          <p className="text-lg sm:text-2xl font-bold tabular-nums tracking-tight mt-0.5 leading-tight">
            {stage.helperValue}
          </p>
        </div>
      </div>
    </div>
  );
}

function RateConnector({ rate, delay }: { rate: Rate; delay: number }) {
  return (
    <div
      className={cn(
        'shrink-0 flex flex-col items-center gap-1.5 pb-4',
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:fill-mode-both',
      )}
      style={{
        animationDelay: `${delay}ms`,
        animationDuration: '300ms',
      }}
    >
      <Chip
        size="sm"
        variant="primary"
        color="default"
        className="font-semibold shadow-sm"
      >
        <Chip.Label>
          <span className="opacity-80">{rate.label}</span>{' '}
          <span className="tabular-nums">{rate.valueLabel}</span>
        </Chip.Label>
      </Chip>
      <ArrowRight
        className="size-4 text-muted-foreground/40"
        aria-hidden="true"
      />
    </div>
  );
}
