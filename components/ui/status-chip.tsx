'use client';

import * as React from 'react';
import { Chip } from '@heroui/react';
import { getStatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

export interface StatusChipProps {
  status: string;
  /** 表示ラベルを上書き（省略時は lib/status.ts のデフォルト文言） */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatusChip({ status, label, size = 'sm', className }: StatusChipProps) {
  const tone = getStatusTone(status);
  return (
    <Chip size={size} variant="soft" color={tone.color} className={cn('gap-1.5', className)}>
      <span
        className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', tone.dotClass)}
        aria-hidden="true"
      />
      <Chip.Label>{label ?? tone.defaultLabel}</Chip.Label>
    </Chip>
  );
}

/**
 * テーブル先頭セルなど、ラベルを省いてドットだけ出したい場合に使う。
 * aria-label は内部で自動付与する。
 */
export function StatusDot({
  status,
  label,
  className,
}: Pick<StatusChipProps, 'status' | 'label' | 'className'>) {
  const tone = getStatusTone(status);
  const title = label ?? tone.defaultLabel;
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full shrink-0', tone.dotClass, className)}
      title={title}
      aria-label={`ステータス: ${title}`}
    />
  );
}
