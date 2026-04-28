import { NextResponse } from 'next/server';
import { query } from '@/lib/bigquery';
import { SF_LEAD, SF_LEAD_FIELDS, mapMediaToPlatform } from '@/lib/salesforce/queries';
import type { SfLeadSummary, SfPlatform } from '@/lib/types/salesforce';

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

type TotalsRow = { total: number | null; converted: number | null };
type MediaRow = { media: string | null; count: number | null };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = parseDate(searchParams.get('start'));
  const end = parseDate(searchParams.get('end'));
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  // 受付日時（Field9__c）が NULL のリードが約 5% あるため、CreatedDate にフォールバック
  const receivedAt = `COALESCE(${SF_LEAD_FIELDS.receivedAt}, CreatedDate)`;

  const totalsSql = `
    SELECT
      COUNT(*) AS total,
      COUNTIF(IsConverted = TRUE) AS converted
    FROM ${SF_LEAD}
    WHERE DATE(${receivedAt}) BETWEEN DATE(@start) AND DATE(@end)
  `;

  const mediaSql = `
    SELECT TrafficSourceMedia__c AS media, COUNT(*) AS count
    FROM ${SF_LEAD}
    WHERE DATE(${receivedAt}) BETWEEN DATE(@start) AND DATE(@end)
      AND TrafficSourceMedia__c IS NOT NULL
    GROUP BY TrafficSourceMedia__c
    ORDER BY count DESC
  `;

  try {
    const [totalsRows, mediaRows] = await Promise.all([
      query<TotalsRow>(totalsSql, { start, end }),
      query<MediaRow>(mediaSql, { start, end }),
    ]);

    const t = totalsRows[0] ?? { total: 0, converted: 0 };
    const total = Number(t.total ?? 0);
    const converted = Number(t.converted ?? 0);

    // 媒体ラベルを Platform にマッピングして集約
    const platformCounts = new Map<SfPlatform | string, number>();
    for (const r of mediaRows) {
      if (!r.media) continue;
      const p = mapMediaToPlatform(r.media);
      const key: SfPlatform | string = p === 'other' ? `other (${r.media})` : p;
      platformCounts.set(key, (platformCounts.get(key) ?? 0) + Number(r.count ?? 0));
    }

    const byMedia = Array.from(platformCounts.entries())
      .map(([media, count]) => ({ media, count }))
      .sort((a, b) => b.count - a.count);

    const result: SfLeadSummary = {
      total,
      converted,
      conversionRate: total > 0 ? converted / total : null,
      byMedia,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
