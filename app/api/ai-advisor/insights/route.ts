import { NextRequest } from 'next/server';
import { query, table } from '@/lib/bigquery';

interface Insight {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  action: string;
}

const mockInsights: Insight[] = [
  {
    id: 'mock-1',
    priority: 'high',
    category: 'コスト最適化',
    title: '低CVRキャンペーンの予算見直しを推奨',
    description:
      'Google 検索キャンペーン「ブランド訴求」の過去7日間のCPAが目標値を35%上回っています。入札単価の調整またはキーワードの絞り込みが効果的です。',
    action: '入札戦略を「目標CPA」に切り替え、目標CPAを現在値の80%に設定してください。',
  },
  {
    id: 'mock-2',
    priority: 'high',
    category: '予算配分',
    title: 'Yahoo キャンペーンの予算消化が90%を超過',
    description:
      'Yahoo!広告の「季節限定プロモーション」キャンペーンの月次予算消化率が92%に達しています。月末前に予算が尽きる可能性があります。',
    action: '月次予算を15〜20%増額するか、入札単価を一時的に下げて残りの掲載期間を確保してください。',
  },
  {
    id: 'mock-3',
    priority: 'medium',
    category: 'CVR改善',
    title: 'レスポンシブ広告のアセット評価が低下',
    description:
      '3件のレスポンシブ検索広告でアセット評価が「低」のヘッドラインが検出されました。広告の関連性スコアを改善する機会があります。',
    action: '評価が低いヘッドラインを、上位コンバージョンキーワードを含む文言に差し替えてください。',
  },
  {
    id: 'mock-4',
    priority: 'medium',
    category: 'キーワード最適化',
    title: '除外候補キーワードが15件検出されました',
    description:
      '費用 ¥1,000以上でコンバージョンが0件の検索語句が15件あります。これらを除外キーワードに追加することでROIを改善できます。',
    action: '検索語句分析ページで「費用高・CV0」フィルタを適用し、一括除外設定を行ってください。',
  },
  {
    id: 'mock-5',
    priority: 'low',
    category: 'データ品質',
    title: 'Bing の同期が72時間以上未実施',
    description:
      'Microsoft広告（Bing）のデータが72時間以上更新されていません。最新のパフォーマンスデータが反映されていない可能性があります。',
    action: 'データ同期ページで Bing の手動同期を実行してください。',
  },
];

export async function GET(_request: NextRequest) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().slice(0, 10);

    const [campaignsCount, metrics, excludeCandidates] = await Promise.all([
      query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table('adm_campaigns')}`),
      query<{
        cost: number | null;
        conversions: number | null;
        clicks: number | null;
        impressions: number | null;
      }>(
        `SELECT
           SUM(cost) AS cost,
           SUM(conversions) AS conversions,
           SUM(clicks) AS clicks,
           SUM(impressions) AS impressions
         FROM ${table('adm_daily_metrics')}
         WHERE date >= DATE(@since)`,
        { since: sinceStr },
      ),
      query<{ n: number }>(
        `SELECT COUNT(*) AS n
         FROM ${table('adm_search_term_reports')}
         WHERE cost > 1000 AND conversions = 0 AND is_excluded = FALSE`,
      ),
    ]);

    const totalCampaigns = Number(campaignsCount[0]?.n ?? 0);
    if (totalCampaigns === 0) {
      return Response.json(mockInsights);
    }

    const totalCost = Number(metrics[0]?.cost ?? 0);
    const totalConversions = Number(metrics[0]?.conversions ?? 0);
    const totalClicks = Number(metrics[0]?.clicks ?? 0);
    const totalImpressions = Number(metrics[0]?.impressions ?? 0);
    const highCostZeroCv = Number(excludeCandidates[0]?.n ?? 0);

    const insights: Insight[] = [];

    if (highCostZeroCv > 0) {
      insights.push({
        id: 'insight-exclude',
        priority: 'high',
        category: 'キーワード最適化',
        title: `除外候補キーワードが${highCostZeroCv}件検出されました`,
        description: `費用 ¥1,000以上でコンバージョンが0件の検索語句が${highCostZeroCv}件あります。`,
        action: '検索語句分析ページで除外設定を行ってください。',
      });
    }

    const cpa = totalConversions > 0 ? totalCost / totalConversions : 0;
    if (cpa > 10000 && totalConversions > 0) {
      insights.push({
        id: 'insight-cpa',
        priority: 'high',
        category: 'コスト最適化',
        title: 'CPAが¥10,000を超えています',
        description: `直近7日間のCPAは ${new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(cpa)} です。入札戦略の見直しを検討してください。`,
        action: '目標CPA入札に切り替えるか、キーワードを絞り込んでください。',
      });
    }

    const ctr = totalClicks > 0 && totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    if (ctr < 2 && totalClicks > 100) {
      insights.push({
        id: 'insight-ctr',
        priority: 'medium',
        category: 'CVR改善',
        title: 'クリック率（CTR）が低下しています',
        description: `直近7日間のCTRは${ctr.toFixed(2)}%で、業界平均（2〜5%）を下回っています。`,
        action: '広告文を見直し、より訴求力の高いヘッドラインに変更してください。',
      });
    }

    if (insights.length < 3) {
      const needed = 3 - insights.length;
      insights.push(...mockInsights.slice(0, needed));
    }

    return Response.json(insights);
  } catch (error) {
    console.error('ai-advisor insights GET error:', error);
    return Response.json(mockInsights);
  }
}
