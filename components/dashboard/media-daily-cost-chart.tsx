'use client';

/**
 * 媒体ごとの日次「消化予定 vs 実績累計」を表示する小型グラフ。
 * ad-detail の各媒体カード (Bing/Google/Yahoo) 下に並べる。
 *
 * - データソース: GET /api/dashboard/media-daily-cost?platform=bing&month=YYYY-MM
 * - 月初〜月末の全日付を累計に変換 (実績 cost / 予定 plannedCost)
 * - CumChartBody (青実線 = 実績、緑破線 = 予定) を再利用
 */

import { useEffect, useMemo, useState } from 'react';
import { jpyCompact, jpyFormat } from '@/lib/format';
import { CumChartBody } from '@/components/dashboard/cum-chart-body';
import type { MediaDailyCostResponse } from '@/app/api/dashboard/media-daily-cost/route';

type Platform = 'google' | 'yahoo' | 'bing';

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function MediaDailyCostChart({
  platform,
  month,
}: {
  platform: Platform;
  /** 'YYYY-MM'。省略時は今月 */
  month?: string;
}) {
  const targetMonth = month ?? thisMonth();
  const [data, setData] = useState<MediaDailyCostResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    const controller = new AbortController();
    fetch(`/api/dashboard/media-daily-cost?platform=${platform}&month=${targetMonth}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        return json as MediaDailyCostResponse;
      })
      .then(setData)
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, [platform, targetMonth]);

  const chartData = useMemo(() => {
    if (!data) return [];
    let costCum = 0;
    let plannedCum = 0;
    return data.days.map((d) => {
      costCum += d.cost;
      plannedCum += d.plannedCost;
      return {
        day: Number(d.date.slice(8, 10)),
        costCum,
        plannedCum,
      };
    });
  }, [data]);

  if (error) {
    return <div className="text-xs text-red-500 px-2 py-1">グラフ取得エラー: {error}</div>;
  }
  if (!data) {
    return <div className="text-xs text-muted-foreground px-2 py-1">読み込み中…</div>;
  }
  if (chartData.length === 0) {
    return <div className="text-xs text-muted-foreground px-2 py-1">データなし</div>;
  }

  return (
    <CumChartBody
      data={chartData}
      actualKey="costCum"
      targetKey="plannedCum"
      formatTick={(v) => jpyCompact.format(v)}
      formatTooltip={(v) => jpyFormat.format(v)}
      actualLabel="実績累計"
      targetLabel="消化予定"
      height={180}
    />
  );
}
