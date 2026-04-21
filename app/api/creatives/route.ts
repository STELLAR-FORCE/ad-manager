import { NextRequest } from 'next/server';
import { query, table } from '@/lib/bigquery';

type CreativeRow = {
  id: string;
  name: string;
  status: string;
  ad_format: string;
  headline_1: string | null;
  headline_2: string | null;
  headline_3: string | null;
  description_1: string | null;
  description_2: string | null;
  ad_group_id: string;
  ad_group_name: string | null;
  campaign_platform: string | null;
  campaign_name: string | null;
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const platform = searchParams.get('platform') ?? '';
  const status = searchParams.get('status') ?? '';

  try {
    const platformFilter = platform ? 'AND c.platform = @platform' : '';
    const statusFilter = status ? 'AND a.status = @status' : '';

    const rows = await query<CreativeRow>(
      `SELECT
         a.id,
         a.name,
         a.status,
         a.ad_format,
         a.headline_1,
         a.headline_2,
         a.headline_3,
         a.description_1,
         a.description_2,
         a.ad_group_id,
         g.name AS ad_group_name,
         c.platform AS campaign_platform,
         c.name AS campaign_name
       FROM ${table('adm_ads')} a
       LEFT JOIN ${table('adm_ad_groups')} g ON g.id = a.ad_group_id
       LEFT JOIN ${table('adm_campaigns')} c ON c.id = g.campaign_id
       WHERE 1 = 1
         ${statusFilter}
         ${platformFilter}
       ORDER BY a.id DESC
       LIMIT 500`,
      {
        ...(platform ? { platform } : {}),
        ...(status ? { status } : {}),
      },
    );

    const creatives = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.ad_format,
      status: r.status,
      headline1: r.headline_1,
      headline2: r.headline_2,
      headline3: r.headline_3,
      description1: r.description_1,
      description2: r.description_2,
      adGroup: {
        id: r.ad_group_id,
        name: r.ad_group_name ?? '',
        campaign: {
          platform: r.campaign_platform ?? '',
          name: r.campaign_name ?? '',
        },
      },
    }));

    return Response.json(creatives);
  } catch (error) {
    console.error('creatives GET error:', error);
    return Response.json([]);
  }
}

export async function POST() {
  return Response.json(
    { error: 'BigQuery は読み取り専用です。広告の作成は広告プラットフォーム側で行ってください。' },
    { status: 501 },
  );
}
