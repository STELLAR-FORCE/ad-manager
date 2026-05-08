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
  /** 広告経由リード件数（TrafficSourceMedia__c が Google/Yahoo/Bing 系） */
  adTotal: number;
  byMedia: { media: string; count: number }[];
};

/** 契約管理レコードの区分（Name パターンで判定） */
export type ContractKind = 'new' | 'renewal' | 'extension' | 'cancel';

/**
 * 1 行 = (媒体 × 月) または (媒体 × 入居月) の集計。
 * 入居日ベース・CV発生日ベースの両ビューで共通の指標セット。
 */
export type IntegratedKpiRow = {
  /** ISO 月文字列 'YYYY-MM' */
  month: string;
  platform: SfPlatform;
  impressions: number;
  clicks: number;
  cost: number;
  /** CV 件数（リード件数）*/
  cv: number;
  /** CV室数（必要戸数の合計）*/
  cvRooms: number;
  /** ルームデイズ（必要戸数 × 利用日数の合計）*/
  roomDays: number;
  /** 成約 CV 件数（案件成立 or 契約管理レコード存在）*/
  wonCv: number;
  /** 成約室数の合計 */
  contractedRooms: number;
  /** 粗利合計（自社物件の SF 上ゼロ計上を含む）*/
  grossProfit: number;
  /** 売上合計（借主への請求額）*/
  revenue: number;
  /** 自社物件分の成約数（粗利を別管理する対象）*/
  inhouseWonCount: number;
  /** 契約区分別の成約 CV 内訳 */
  byContractKind: Record<ContractKind, number>;
};

/** 月別目標値マスタ（dashboard.targets_monthly）*/
export type TargetsMonthlyRow = {
  month: string;
  platform: SfPlatform | null;
  cvTarget: number | null;
  roomTarget: number | null;
  roomDaysTarget: number | null;
  grossProfitTarget: number | null;
  revenueTarget: number | null;
  /** 自社物件分の日額単価（自社ポータル連携が入るまでの暫定値）*/
  inhouseUnitPrice: number | null;
};

/** 日次累積トレンド（gid=335163595 / gid=554788506 相当）*/
export type CvDailyRow = {
  date: string;
  platform: SfPlatform;
  cv: number;
  rooms: number;
  cost: number;
  /** 累積（期間先頭からの SUM）*/
  cumulativeCv: number;
  cumulativeRooms: number;
  cumulativeCost: number;
};
