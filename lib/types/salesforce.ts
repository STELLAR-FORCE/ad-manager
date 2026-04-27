/**
 * Salesforce データの最小型定義
 * BQ 内 sf_* テーブルには 500+ カラムあるが、ダッシュボードで使うものだけを対象にする
 */

export type SfPlatform = 'google' | 'yahoo' | 'bing' | 'other';

export type SfForecastCategory =
  | 'パイプライン'
  | '最善達成予測'
  | '達成予測'
  | '完了'
  | '売上予測から除外';

export type SfOpportunityStageKind = 'open' | 'won' | 'lost';

/** ステージ分類（UI バケット） */
export type SfStageBucket = 'new' | 'qualified' | 'contract' | 'won' | 'lost';

export type SfOpportunitySummary = {
  total: number;
  won: number;
  lost: number;
  open: number;
  winRate: number | null;
  avgLeadTimeDays: number | null;
};

export type SfPipelineRow = {
  stageName: string;
  forecastCategory: string | null;
  sortOrder: number | null;
  count: number;
  kind: SfOpportunityStageKind;
};

export type SfTrendRow = {
  date: string;
  created: number;
  won: number;
  lost: number;
};

export type SfLeadSummary = {
  total: number;
  converted: number;
  conversionRate: number | null;
  byMedia: { media: string; count: number }[];
};
