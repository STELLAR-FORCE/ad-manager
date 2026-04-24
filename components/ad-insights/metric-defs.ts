const jpy = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('ja-JP');
const num2 = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type MetricKey =
  | 'impressions'
  | 'cost'
  | 'conversionValue'
  | 'conversions'
  | 'clicks'
  | 'cpc'
  | 'ctr'
  | 'cvr'
  | 'cpa'
  | 'qualityScore';

export type MetricDef = {
  key: MetricKey;
  label: string;
  color: string;
  format: (v: number | null | undefined) => string;
  /** 日次データからこの指標を計算（合計指標の場合は加算、比率系は計算式） */
  compute: (totals: {
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
  }) => number | null;
  /** チャートのY軸目盛フォーマット */
  axisFormat?: (v: number) => string;
  /** 加算合計できる指標か（true なら daily 値の単純合計がサマリー値） */
  additive: boolean;
};

const fmtOrDash = (formatter: (v: number) => string) => (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : formatter(v);

export const METRICS: Record<MetricKey, MetricDef> = {
  impressions: {
    key: 'impressions',
    label: '表示回数',
    color: '#ef4444',
    format: fmtOrDash((v) => num.format(v)),
    compute: (t) => t.impressions,
    additive: true,
  },
  cost: {
    key: 'cost',
    label: '費用',
    color: '#f59e0b',
    format: fmtOrDash((v) => jpy.format(v)),
    axisFormat: (v) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', notation: 'compact', maximumFractionDigits: 0 }).format(v),
    compute: (t) => t.cost,
    additive: true,
  },
  conversionValue: {
    key: 'conversionValue',
    label: 'CV値',
    color: '#22c55e',
    format: fmtOrDash((v) => num2.format(v)),
    compute: (t) => t.conversionValue,
    additive: true,
  },
  conversions: {
    key: 'conversions',
    label: 'CV',
    color: '#3b82f6',
    format: fmtOrDash((v) => num2.format(v)),
    compute: (t) => t.conversions,
    additive: true,
  },
  clicks: {
    key: 'clicks',
    label: 'クリック数',
    color: '#6366f1',
    format: fmtOrDash((v) => num.format(v)),
    compute: (t) => t.clicks,
    additive: true,
  },
  cpc: {
    key: 'cpc',
    label: '平均CPC',
    color: '#14b8a6',
    format: fmtOrDash((v) => jpy.format(v)),
    axisFormat: (v) => jpy.format(v),
    compute: (t) => (t.clicks > 0 ? Math.round(t.cost / t.clicks) : null),
    additive: false,
  },
  ctr: {
    key: 'ctr',
    label: 'CTR',
    color: '#a855f7',
    format: fmtOrDash((v) => pct.format(v)),
    axisFormat: (v) => pct.format(v),
    compute: (t) => (t.impressions > 0 ? t.clicks / t.impressions : null),
    additive: false,
  },
  cvr: {
    key: 'cvr',
    label: 'CVR',
    color: '#ec4899',
    format: fmtOrDash((v) => pct.format(v)),
    axisFormat: (v) => pct.format(v),
    compute: (t) => (t.clicks > 0 ? t.conversions / t.clicks : null),
    additive: false,
  },
  cpa: {
    key: 'cpa',
    label: 'CPA',
    color: '#0ea5e9',
    format: fmtOrDash((v) => jpy.format(v)),
    axisFormat: (v) => jpy.format(v),
    compute: (t) => (t.conversions > 0 ? Math.round(t.cost / t.conversions) : null),
    additive: false,
  },
  qualityScore: {
    key: 'qualityScore',
    label: '品質スコア',
    color: '#84cc16',
    format: fmtOrDash((v) => num2.format(v)),
    compute: () => null,
    additive: false,
  },
};

export const DEFAULT_KPI_KEYS: MetricKey[] = [
  'impressions',
  'cost',
  'conversions',
  'clicks',
  'cpc',
  'cpa',
];

export const LINE_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
  '#ec4899',
  '#f97316',
  '#0ea5e9',
  '#84cc16',
];

/** 媒体系統カラーパレット — 各媒体内のアイテムはこの順で色を循環
 *  500 を基準に 400/600/300/700/200 で段階をつけ、ライン描画で視認しやすい彩度帯にそろえる */
export const PLATFORM_PALETTES = {
  google: ['#3b82f6', '#60a5fa', '#2563eb', '#93c5fd', '#1d4ed8', '#bfdbfe'],
  yahoo:  ['#ef4444', '#f87171', '#dc2626', '#fca5a5', '#b91c1c', '#fecaca'],
  bing:   ['#14b8a6', '#2dd4bf', '#0d9488', '#5eead4', '#0f766e', '#99f6e4'],
} as const;
