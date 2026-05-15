'use client';

/**
 * 数値の隣に置く (i) アイコン + Tooltip。
 *
 * 業務メンバーが「この数字どこから来てるの？」と聞かれたとき即答できるよう、
 * BigQuery のテーブル名・集計対象カラム・フィルタ・期間・軸を自然言語で示す。
 *
 * 数字検証時にも、同じ画面上で集計ロジックを確認できることが目的。
 */

import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type DataSourceInfo = {
  /** 表題（指標名など）。省略すると見出し行を出さない */
  label?: string;
  /** データソース。例: "Salesforce (mart.salesforce_all_obj)" */
  source: string;
  /** 適用しているフィルタ。例: "LP 経由のみ"。省略可 */
  filters?: string;
  /** 集計対象。例: "必要戸数_数値 の合計" */
  target: string;
  /** 対象期間。例: "2026-05-01 〜 2026-05-15" */
  period?: string;
  /** 軸の説明。例: "利用期間_始期 が期間内 (入居日ベース)" */
  axis?: string;
  /** 更新頻度・キャッシュ。例: "1 時間キャッシュ" */
  cache?: string;
  /** 補足説明 */
  note?: string;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[11px] leading-snug">
      <span className="opacity-60">{label}: </span>
      <span>{value}</span>
    </p>
  );
}

export function DataSourceTooltip({
  info,
  ariaLabel,
  className,
}: {
  info: DataSourceInfo;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          aria-label={ariaLabel ?? `${info.label ?? 'データ'} のデータソース`}
          className={cn(
            'inline-flex items-center justify-center rounded-full text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-help',
            className,
          )}
        >
          <Info className="h-3 w-3" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-sm text-left flex-col items-stretch gap-0.5 px-3 py-2 whitespace-normal"
        >
          {info.label && (
            <p className="font-semibold text-[11px] mb-1">{info.label}</p>
          )}
          <Row label="ソース" value={info.source} />
          {info.filters && <Row label="フィルタ" value={info.filters} />}
          <Row label="対象" value={info.target} />
          {info.period && <Row label="期間" value={info.period} />}
          {info.axis && <Row label="軸" value={info.axis} />}
          {info.cache && <Row label="更新" value={info.cache} />}
          {info.note && (
            <p className="pt-1 text-[10px] opacity-70">※ {info.note}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
