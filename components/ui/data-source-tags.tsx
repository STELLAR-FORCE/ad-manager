'use client';

import { Chip } from '@heroui/react';
import { cn } from '@/lib/utils';

export type SourceTagKey = 'lead' | 'contract' | 'opportunity' | 'ad_console';

type TagSpec = {
  label: string;
  description: string;
};

const TAG_SPECS: Record<SourceTagKey, TagSpec> = {
  lead: {
    label: 'リード',
    description: 'Salesforce「リード」オブジェクト由来',
  },
  contract: {
    label: '契約管理',
    description: 'Salesforce「契約管理」オブジェクト由来',
  },
  opportunity: {
    label: '案件',
    description: 'Salesforce「案件」オブジェクト由来',
  },
  ad_console: {
    label: '広告管理画面',
    description: 'Google / Yahoo! / Bing 各広告 API 由来',
  },
};

export function DataSourceTags({
  sources,
  size = 'sm',
  className,
}: {
  sources: SourceTagKey[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (sources.length === 0) return null;
  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1', className)} aria-label="参照ソース">
      {sources.map((key) => {
        const spec = TAG_SPECS[key];
        return (
          <Chip
            key={key}
            color="default"
            variant="soft"
            size={size}
            title={spec.description}
          >
            {spec.label}
          </Chip>
        );
      })}
    </div>
  );
}
