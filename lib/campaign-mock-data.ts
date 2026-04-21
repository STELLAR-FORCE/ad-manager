// ─── 型定義 ─────────────────────────────────────────────────────

export type Platform = 'google' | 'yahoo' | 'bing';
export type AdType = 'search' | 'display';
export type CampaignStatus = 'active' | 'active_limited' | 'paused' | 'ended';

export type CampaignData = {
  id: string;
  name: string;
  platform: Platform;
  type: string;
  adType: AdType;
  status: CampaignStatus;
  dailyBudget: number | null;
  bidStrategy: string;
  optimizationScore: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  cpc: number;
  conversions: number;
  cpa: number | null;
};

export type AdGroupData = {
  id: string;
  campaignId: string;
  name: string;
  status: 'active' | 'paused';
  type: string;
  bidStrategy: string;
  targetCpa: number | null;
  qualityScore: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  cpc: number;
  conversions: number;
  cvr: number;
  cpa: number | null;
  // ディスプレイ用
  viewableImpressions?: number;
  cpm?: number;
  // 検索用
  topImprRate?: string | null;
  absTopImprRate?: string | null;
};

export type AdData = {
  id: string;
  adGroupId: string;
  name: string;
  status: 'active' | 'paused';
  adFormat: string;
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  // ディスプレイ用
  imageFileName?: string;
  imageSize?: string;
  // 指標
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  cpc: number;
  conversions: number;
  cpa: number | null;
};

export type KeywordData = {
  id: string;
  adGroupId: string;
  keyword: string;
  matchType: string;
  status: 'active' | 'paused' | 'limited';
  qualityScore: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  cpc: number;
  conversions: number;
  cvr: number;
  cpa: number | null;
  topImprRate: string | null;
  absTopImprRate: string | null;
};

// ─── キャンペーン ────────────────────────────────────────────────
// ※ 3月実績。Bingは3/1〜3/31（全月）

export const CAMPAIGNS: CampaignData[] = [
  // ── Google 検索 ──
  { id: 'g1',  name: 'K:コア LP【monthly-order】',          platform: 'google', type: '検索',     adType: 'search',  status: 'active_limited', dailyBudget: 40000,  bidStrategy: '目標CPA',      optimizationScore: 64.74, impressions: 22552,   clicks: 2048,  ctr: 0.0908, cost: 1405608, cpc: 686,  conversions: 148, cpa: 9497 },
  { id: 'g3',  name: 'K：指名',                              platform: 'google', type: '検索',     adType: 'search',  status: 'active_limited', dailyBudget: 2000,   bidStrategy: '拡張CPC',      optimizationScore: 59.26, impressions: 456,     clicks: 38,    ctr: 0.0833, cost: 13257,   cpc: 349,  conversions: 5,   cpa: 2651 },
  { id: 'g4',  name: '新規業種トライアル（新卒研修切り口）',  platform: 'google', type: '検索',     adType: 'search',  status: 'active_limited', dailyBudget: 5000,   bidStrategy: '目標CPA',      optimizationScore: 58.89, impressions: 1169,    clicks: 115,   ctr: 0.0984, cost: 87212,   cpc: 758,  conversions: 9,   cpa: 9690 },
  { id: 'g5',  name: 'K：コア LP2 RE #2',                   platform: 'google', type: '検索',     adType: 'search',  status: 'paused',         dailyBudget: 75000,  bidStrategy: '目標CPA',      optimizationScore: null,  impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'g6',  name: '手動入札',                             platform: 'google', type: '検索',     adType: 'search',  status: 'paused',         dailyBudget: 60000,  bidStrategy: '手動CPC',      optimizationScore: null,  impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'g9',  name: 'K：コア LP2 RE_クリック最大化',         platform: 'google', type: '検索',     adType: 'search',  status: 'paused',         dailyBudget: 20000,  bidStrategy: 'クリック最大化', optimizationScore: null,  impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'g10', name: 'Leads-Display-1',                     platform: 'google', type: 'ディスプレイ', adType: 'display', status: 'paused',      dailyBudget: 5000,   bidStrategy: '手動CPC',      optimizationScore: null,  impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'g11', name: 'K：指名 LPテスト_202409',               platform: 'google', type: '検索',     adType: 'search',  status: 'ended',          dailyBudget: 2000,   bidStrategy: '拡張CPC',      optimizationScore: null,  impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'g12', name: 'K：コア (LP2) LPテスト_202409',         platform: 'google', type: '検索',     adType: 'search',  status: 'ended',          dailyBudget: 10000,  bidStrategy: '目標CPA',      optimizationScore: null,  impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  // ── Google ディスプレイ ──
  { id: 'g2',  name: 'デマンドジェン',                       platform: 'google', type: 'デマンドジェネレーション', adType: 'display', status: 'active', dailyBudget: 5000, bidStrategy: '目標CPC', optimizationScore: 96.83, impressions: 2534586, clicks: 23027, ctr: 0.0091, cost: 152104, cpc: 7, conversions: 0, cpa: null },
  { id: 'g7',  name: 'P-MAX',                               platform: 'google', type: 'P-MAX',    adType: 'display', status: 'paused',         dailyBudget: 30000,  bidStrategy: '目標CPA',      optimizationScore: null,  impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'g8',  name: 'K：P-MAX',                            platform: 'google', type: 'P-MAX',    adType: 'display', status: 'paused',         dailyBudget: 15000,  bidStrategy: '目標CPA',      optimizationScore: null,  impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },

  // ── Yahoo! 検索 ──
  { id: 'y1',  name: 'K：コア 【monthly-order】',             platform: 'yahoo', type: '検索', adType: 'search',  status: 'active_limited', dailyBudget: 20000, bidStrategy: '目標CPA',      optimizationScore: null, impressions: 96546, clicks: 3417, ctr: 0.0354, cost: 1363586, cpc: 399, conversions: 135, cpa: 10101 },
  { id: 'y2',  name: '新規業種トライアル',                    platform: 'yahoo', type: '検索', adType: 'search',  status: 'active',         dailyBudget: 5000,  bidStrategy: '目標CPA',      optimizationScore: null, impressions: 1014,  clicks: 43,   ctr: 0.0424, cost: 11618,   cpc: 270, conversions: 1,   cpa: 11618 },
  { id: 'y3',  name: 'K：指名',                              platform: 'yahoo', type: '検索', adType: 'search',  status: 'active',         dailyBudget: 2000,  bidStrategy: '手動CPC',      optimizationScore: null, impressions: 79,    clicks: 6,    ctr: 0.0759, cost: 850,     cpc: 142, conversions: 0,   cpa: null },
  { id: 'y4',  name: 'K：コア 【standard/express】',          platform: 'yahoo', type: '検索', adType: 'search',  status: 'paused',         dailyBudget: 20000, bidStrategy: 'CV最大化',     optimizationScore: null, impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'y5',  name: '手動入札',                             platform: 'yahoo', type: '検索', adType: 'search',  status: 'paused',         dailyBudget: 85000, bidStrategy: '手動CPC',      optimizationScore: null, impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'y6',  name: 'K：コア LP2 RE_クリック最大化',          platform: 'yahoo', type: '検索', adType: 'search',  status: 'paused',         dailyBudget: 50000, bidStrategy: 'クリック最大化', optimizationScore: null, impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'y7',  name: 'K：コア LP2 RE',                       platform: 'yahoo', type: '検索', adType: 'search',  status: 'paused',         dailyBudget: 40000, bidStrategy: '目標CPA',      optimizationScore: null, impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  { id: 'y8',  name: '検証KW',                              platform: 'yahoo', type: '検索', adType: 'search',  status: 'paused',         dailyBudget: 10000, bidStrategy: '手動CPC',      optimizationScore: null, impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },
  // ── Yahoo! ディスプレイ ──
  { id: 'yd1', name: 'リターゲティング',                      platform: 'yahoo', type: 'ディスプレイ', adType: 'display', status: 'active', dailyBudget: 3000, bidStrategy: '拡張CPC', optimizationScore: null, impressions: 7518172, clicks: 9341, ctr: 0.0012, cost: 92987, cpc: 10, conversions: 0, cpa: null },
  { id: 'yd2', name: '競合流出',                              platform: 'yahoo', type: 'ディスプレイ', adType: 'display', status: 'paused', dailyBudget: 3000, bidStrategy: '拡張CPC', optimizationScore: null, impressions: 0, clicks: 0, ctr: 0, cost: 0, cpc: 0, conversions: 0, cpa: null },

  // ── Bing 検索 ──
  { id: 'b1',  name: 'K：コア【monthly-order】',              platform: 'bing', type: '検索', adType: 'search',  status: 'active_limited', dailyBudget: 40000, bidStrategy: 'CV最大化',     optimizationScore: 41.8,  impressions: 36874,   clicks: 3918,  ctr: 0.1063, cost: 1735433, cpc: 443, conversions: 210, cpa: 8264 },
  { id: 'b3',  name: 'K：指名',                              platform: 'bing', type: '検索', adType: 'search',  status: 'active',         dailyBudget: 2000,  bidStrategy: '拡張CPC',      optimizationScore: 88.3,  impressions: 200,     clicks: 20,    ctr: 0.1000, cost: 6525,    cpc: 326, conversions: 4,   cpa: 1631 },
  { id: 'b4',  name: '新規業種トライアル',                    platform: 'bing', type: '検索', adType: 'search',  status: 'active_limited', dailyBudget: 5000,  bidStrategy: 'CV最大化',     optimizationScore: 100,   impressions: 5991,    clicks: 77,    ctr: 0.0129, cost: 41968,   cpc: 545, conversions: 3,   cpa: 13989 },
  // ── Bing ディスプレイ ──
  { id: 'b2',  name: 'リタゲ 20250722',                      platform: 'bing', type: 'オーディエンス', adType: 'display', status: 'active_limited', dailyBudget: 3000, bidStrategy: '拡張CPC', optimizationScore: 100, impressions: 1587752, clicks: 10060, ctr: 0.0063, cost: 112968, cpc: 11, conversions: 2, cpa: 56484 },
];

// ─── 広告グループ ────────────────────────────────────────────────

export const AD_GROUPS: AdGroupData[] = [
  // ── Google 検索 ──
  { id: 'ag-g1-1', campaignId: 'g1', name: 'マンスリーマンション', status: 'active', type: '標準', bidStrategy: '目標CPA', targetCpa: 17000, qualityScore: null, impressions: 21417, clicks: 1913, ctr: 0.0893, cost: 1325657, cpc: 693, conversions: 141, cvr: 0.0737, cpa: 9402, topImprRate: '92.73%', absTopImprRate: '37.62%' },
  { id: 'ag-g1-2', campaignId: 'g1', name: '契約期間明示型',     status: 'active', type: '標準', bidStrategy: '目標CPA', targetCpa: 14000, qualityScore: null, impressions: 1135,  clicks: 135,  ctr: 0.1189, cost: 79951,   cpc: 592, conversions: 7,   cvr: 0.0519, cpa: 11422, topImprRate: null, absTopImprRate: null },
  { id: 'ag-g3-1', campaignId: 'g3', name: 'マンスリーバンク',   status: 'active', type: '標準', bidStrategy: '拡張CPC', targetCpa: null,  qualityScore: null, impressions: 456,   clicks: 38,   ctr: 0.0833, cost: 13257,   cpc: 349, conversions: 5,   cvr: 0.1316, cpa: 2651,  topImprRate: null, absTopImprRate: null },
  { id: 'ag-g4-1', campaignId: 'g4', name: '製造業向け',         status: 'active', type: '標準', bidStrategy: '目標CPA', targetCpa: 12000, qualityScore: null, impressions: 636,   clicks: 61,   ctr: 0.0959, cost: 60393,   cpc: 990, conversions: 9,   cvr: 0.1475, cpa: 6710,  topImprRate: null, absTopImprRate: null },
  { id: 'ag-g4-2', campaignId: 'g4', name: '外国籍向け',         status: 'active', type: '標準', bidStrategy: '目標CPA', targetCpa: 12000, qualityScore: null, impressions: 533,   clicks: 54,   ctr: 0.1013, cost: 26819,   cpc: 497, conversions: 0,   cvr: 0,      cpa: null,  topImprRate: null, absTopImprRate: null },
  // ── Google ディスプレイ ──
  { id: 'ag-g2-1', campaignId: 'g2', name: 'デマンドジェン',     status: 'active', type: 'ディスプレイ', bidStrategy: '目標CPC', targetCpa: null, qualityScore: null, impressions: 2534586, clicks: 23027, ctr: 0.0091, cost: 152104, cpc: 7, conversions: 0, cvr: 0, cpa: null, viewableImpressions: undefined, cpm: 60 },

  // ── Yahoo! 検索 ──
  { id: 'ag-y1-1', campaignId: 'y1', name: 'マンスリーマンション', status: 'active', type: '標準', bidStrategy: '目標CPA', targetCpa: 13000, qualityScore: null, impressions: 96546, clicks: 3417, ctr: 0.0354, cost: 1363586, cpc: 399, conversions: 135, cvr: 0.0395, cpa: 10101, topImprRate: '96.55%', absTopImprRate: '33.11%' },
  { id: 'ag-y2-1', campaignId: 'y2', name: '建設業向け',         status: 'active', type: '標準', bidStrategy: '目標CPA', targetCpa: 12000, qualityScore: null, impressions: 72,    clicks: 2,    ctr: 0.0278, cost: 322,     cpc: 161, conversions: 0,   cvr: 0,      cpa: null,  topImprRate: null, absTopImprRate: null },
  { id: 'ag-y2-2', campaignId: 'y2', name: '製造業向け',         status: 'active', type: '標準', bidStrategy: '目標CPA', targetCpa: 12000, qualityScore: null, impressions: 60,    clicks: 1,    ctr: 0.0167, cost: 124,     cpc: 124, conversions: 0,   cvr: 0,      cpa: null,  topImprRate: null, absTopImprRate: null },
  { id: 'ag-y2-3', campaignId: 'y2', name: '外国籍向け',         status: 'active', type: '標準', bidStrategy: '目標CPA', targetCpa: 12000, qualityScore: null, impressions: 882,   clicks: 40,   ctr: 0.0454, cost: 11172,   cpc: 279, conversions: 1,   cvr: 0.0250, cpa: 11172, topImprRate: '92.34%', absTopImprRate: '44.35%' },
  { id: 'ag-y3-1', campaignId: 'y3', name: 'マンスリーバンク',   status: 'active', type: '標準', bidStrategy: '手動CPC', targetCpa: null,  qualityScore: null, impressions: 79,    clicks: 6,    ctr: 0.0759, cost: 850,     cpc: 142, conversions: 0,   cvr: 0,      cpa: null,  topImprRate: '97.37%', absTopImprRate: '80.26%' },
  // ── Yahoo! ディスプレイ ──
  { id: 'ag-yd1-1', campaignId: 'yd1', name: 'リターゲティング', status: 'active', type: 'ディスプレイ', bidStrategy: '拡張CPC', targetCpa: null, qualityScore: null, impressions: 7518172, clicks: 9341, ctr: 0.0012, cost: 92987, cpc: 10, conversions: 0, cvr: 0, cpa: null, viewableImpressions: 765590, cpm: 12 },

  // ── Bing 検索 ──
  { id: 'ag-b1-1', campaignId: 'b1', name: 'マンスリーマンション', status: 'active', type: '標準', bidStrategy: 'CV最大化', targetCpa: null, qualityScore: 7, impressions: 36874, clicks: 3918, ctr: 0.1063, cost: 1735433, cpc: 443, conversions: 210, cvr: 0.0536, cpa: 8264, topImprRate: '91.84%', absTopImprRate: '37.62%' },
  { id: 'ag-b3-1', campaignId: 'b3', name: 'マンスリーバンク',   status: 'active', type: '標準', bidStrategy: '拡張CPC', targetCpa: null, qualityScore: null, impressions: 200, clicks: 20, ctr: 0.1000, cost: 6525, cpc: 326, conversions: 4, cvr: 0.2000, cpa: 1631, topImprRate: null, absTopImprRate: null },
  { id: 'ag-b4-1', campaignId: 'b4', name: 'マンスリーマンション', status: 'active', type: '標準', bidStrategy: 'CV最大化', targetCpa: 12000, qualityScore: null, impressions: 5991, clicks: 77, ctr: 0.0129, cost: 41968, cpc: 545, conversions: 3, cvr: 0.0390, cpa: 13989, topImprRate: null, absTopImprRate: null },
  // ── Bing ディスプレイ ──
  { id: 'ag-b2-1', campaignId: 'b2', name: 'monthly-order1', status: 'active', type: 'オーディエンス', bidStrategy: '拡張CPC', targetCpa: null, qualityScore: null, impressions: 488309, clicks: 3414, ctr: 0.0070, cost: 30029, cpc: 9, conversions: 1, cvr: 0.0003, cpa: 30029, viewableImpressions: undefined, cpm: 61 },
  { id: 'ag-b2-2', campaignId: 'b2', name: 'site',           status: 'active', type: 'オーディエンス', bidStrategy: '拡張CPC', targetCpa: null, qualityScore: null, impressions: 1099443, clicks: 6646, ctr: 0.0060, cost: 82939, cpc: 12, conversions: 1, cvr: 0.0002, cpa: 82939, viewableImpressions: undefined, cpm: 75 },
];

// ─── 広告 ────────────────────────────────────────────────────────

export const ADS: AdData[] = [
  // ── Google 検索: K:コア LP monthly-order → マンスリーマンション ──
  { id: 'ad-g1-1', adGroupId: 'ag-g1-1', name: 'RSA: 法人限定 全国70万室一括見積', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['法人限定 全国70万室一括見積', '社宅・出張先を丸ごと手配代行', '無料見積＆請求書払いOK'],
    descriptions: ['条件を伝えるだけで全国70万室以上から検索し一括提示。請求書払い対応、最短即日提案可能', 'お部屋選定から契約、入居中トラブル窓口、退去手続きまでワンストップ。手間を大幅に削減。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 15028, clicks: 1458, ctr: 0.0970, cost: 997708, cpc: 684, conversions: 113, cpa: 8829 },
  { id: 'ad-g1-2', adGroupId: 'ag-g1-1', name: 'RSA: 探す時間ゼロ 条件伝えるだけ', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['探す時間ゼロ 条件伝えるだけ', '全国対応マンスリー代行サービス', '【法人向け】一括提案で比較楽々'],
    descriptions: ['条件を伝えるだけで、日本全国70万室以上の中から最適な物件をご紹介。もう物件探しに悩まない。', 'お部屋探しから契約・入居中のトラブル対応・退去手続きまで一括でご対応。すべての手間を削減。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 6389, clicks: 455, ctr: 0.0712, cost: 327949, cpc: 721, conversions: 28, cpa: 11712 },

  // ── Google ディスプレイ: デマンドジェン ──
  { id: 'ad-g2-1', adGroupId: 'ag-g2-1', name: 'シングルイメージ広告', status: 'active', adFormat: 'デマンドジェネレーション イメージ広告',
    headlines: ['法人マンスリーならマンスリーバンク'], descriptions: ['社宅・長期出張・研修など法人の住まい課題を丸投げOK。工数削減とコスト最適化を同時に実現'],
    finalUrl: 'https://www.monthly-bank.jp/',
    imageFileName: 'デマンドジェン画像（複数）', imageSize: '1200×1200 他',
    impressions: 2469587, clicks: 21185, ctr: 0.0086, cost: 136899, cpc: 6, conversions: 0, cpa: null },
  { id: 'ad-g2-2', adGroupId: 'ag-g2-1', name: '動画広告', status: 'active', adFormat: 'デマンドジェネレーション動画広告',
    headlines: ['出張手配のワンストップサービス'], descriptions: ['社宅・長期出張・研修など法人の住まい課題を丸投げOK。工数削減とコスト最適化を同時に実現'],
    finalUrl: 'https://www.monthly-bank.jp/',
    impressions: 64999, clicks: 1842, ctr: 0.0283, cost: 15205, cpc: 8, conversions: 0, cpa: null },

  // ── Yahoo! 検索: K：コア monthly-order → マンスリーマンション ──
  { id: 'ad-y1-1', adGroupId: 'ag-y1-1', name: '202508_LP改修後1', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['法人マンスリーマンション一括手配', '全国70万室以上から最適提案', '請求書払い対応 最短即日OK'],
    descriptions: ['条件を伝えるだけで、日本全国70万室以上の中から最適な物件をご紹介。もう物件探しに悩まない。', 'お部屋探しから契約・入居中のトラブル対応・退去手続きまで一括でご対応。すべての手間を削減。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 46816, clicks: 2019, ctr: 0.0431, cost: 764641, cpc: 379, conversions: 58, cpa: 13183 },
  { id: 'ad-y1-2', adGroupId: 'ag-y1-1', name: '202508_LP改修後2', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['社宅・出張先の手配をまるごと代行', 'マンスリーマンション契約代行', '探す時間ゼロ 条件入力だけ'],
    descriptions: ['マンスリーマンション手配がシンプルかつスピーディーに。ワンストップの出張手配サービス', '社宅・長期出張・研修など法人の住まい課題を丸投げOK。工数削減とコスト最適化を同時に実現'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 49730, clicks: 1398, ctr: 0.0281, cost: 598945, cpc: 428, conversions: 77, cpa: 7779 },
  // ── Yahoo! 検索: 新規業種トライアル → 外国籍向け ──
  { id: 'ad-y2-1', adGroupId: 'ag-y2-3', name: '20260312_外国籍向け', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['Foreign Nationals Welcome', '全国対応マンスリー代行', '請求書払いOK'],
    descriptions: ['条件を伝えるだけで、日本全国70万室以上の中から最適な物件をご紹介。', 'お部屋探しから退去手続きまで一括対応。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 882, clicks: 40, ctr: 0.0454, cost: 11172, cpc: 279, conversions: 1, cpa: 11172 },
  // ── Yahoo! 検索: 新規業種トライアル → 製造業向け ──
  { id: 'ad-y2-2', adGroupId: 'ag-y2-2', name: '20260312_製造業向け', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['製造業の出張手配に', '全国70万室から一括提案', '請求書払いOK'],
    descriptions: ['製造業の出張・研修向けマンスリーマンション手配サービス。', 'お部屋探しから退去手続きまで一括対応。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 60, clicks: 1, ctr: 0.0167, cost: 124, cpc: 124, conversions: 0, cpa: null },
  // ── Yahoo! 検索: 新規業種トライアル → 建設業向け ──
  { id: 'ad-y2-3', adGroupId: 'ag-y2-1', name: '20260312_建設業向け', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['建設現場の宿泊先手配に', '全国70万室から一括提案', '請求書払いOK'],
    descriptions: ['建設業の出張・現場向けマンスリーマンション手配サービス。', 'お部屋探しから退去手続きまで一括対応。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 72, clicks: 2, ctr: 0.0278, cost: 322, cpc: 161, conversions: 0, cpa: null },

  // ── Yahoo! ディスプレイ: リターゲティング（代表6本） ──
  { id: 'ad-yd1-1', adGroupId: 'ag-yd1-1', name: 'YDA (3).png', status: 'active', adFormat: 'バナー',
    headlines: [], descriptions: [],
    finalUrl: 'https://www.monthly-bank.jp/lp/monthly-order',
    imageFileName: 'compressed_1080×1080 1.jpg', imageSize: '1080×1080',
    impressions: 454491, clicks: 551, ctr: 0.0012, cost: 5452, cpc: 10, conversions: 0, cpa: null },
  { id: 'ad-yd1-2', adGroupId: 'ag-yd1-1', name: 'YDA (4).png', status: 'active', adFormat: 'バナー',
    headlines: [], descriptions: [],
    finalUrl: 'https://www.monthly-bank.jp/lp/monthly-order',
    imageFileName: 'compressed_1080×1080 2.jpg', imageSize: '1080×1080',
    impressions: 419997, clicks: 541, ctr: 0.0013, cost: 5412, cpc: 10, conversions: 0, cpa: null },
  { id: 'ad-yd1-3', adGroupId: 'ag-yd1-1', name: 'YDA (2).png', status: 'active', adFormat: 'バナー',
    headlines: [], descriptions: [],
    finalUrl: 'https://www.monthly-bank.jp/lp/monthly-order',
    imageFileName: 'compressed_600×600 2.jpg', imageSize: '600×600',
    impressions: 431700, clicks: 490, ctr: 0.0011, cost: 4951, cpc: 10, conversions: 0, cpa: null },
  { id: 'ad-yd1-4', adGroupId: 'ag-yd1-1', name: '0609_2', status: 'active', adFormat: 'バナー',
    headlines: [], descriptions: [],
    finalUrl: 'https://www.monthly-bank.jp/lp/monthly-order',
    imageFileName: 'compressed_1200×1200 2.jpg', imageSize: '1200×1200',
    impressions: 408055, clicks: 509, ctr: 0.0012, cost: 4998, cpc: 10, conversions: 0, cpa: null },
  { id: 'ad-yd1-5', adGroupId: 'ag-yd1-1', name: 'YDA (1).png', status: 'active', adFormat: 'バナー',
    headlines: [], descriptions: [],
    finalUrl: 'https://www.monthly-bank.jp/lp/monthly-order',
    imageFileName: 'compressed_1200×1200 1.jpg', imageSize: '1200×1200',
    impressions: 391978, clicks: 469, ctr: 0.0012, cost: 4664, cpc: 10, conversions: 0, cpa: null },
  { id: 'ad-yd1-6', adGroupId: 'ag-yd1-1', name: '1 A(1200).png', status: 'active', adFormat: 'バナー',
    headlines: [], descriptions: [],
    finalUrl: 'https://www.monthly-bank.jp/lp/monthly-order',
    imageFileName: '1 A(1200).png', imageSize: '600×600',
    impressions: 326655, clicks: 489, ctr: 0.0015, cost: 4843, cpc: 10, conversions: 0, cpa: null },

  // ── Bing 検索: K：コア monthly-order → マンスリーマンション ──
  { id: 'ad-b1-1', adGroupId: 'ag-b1-1', name: 'RSA: 法人限定 全国70万室一括見積', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['法人限定 全国70万室一括見積', '社宅・出張先を丸ごと手配代行', '無料見積＆請求書払いOK'],
    descriptions: ['条件を伝えるだけで全国70万室以上を横断検索し一括提示。請求書払い対応、最短即日入居可能', 'お部屋選定から契約、入居中トラブル窓口、退去手続きまでワンストップ。手間を大幅に削減。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 27067, clicks: 3197, ctr: 0.1181, cost: 1405533, cpc: 440, conversions: 165, cpa: 8518 },
  { id: 'ad-b1-2', adGroupId: 'ag-b1-1', name: 'RSA: 202508_LP改修後', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['出張研修の宿泊先手配はお任せ', '法人向け/滞在先手配ならお任せ', '最適な宿泊先を最短でお届け'],
    descriptions: ['条件を伝えるだけで、日本全国70万室以上の中から最適な物件をご紹介。もう物件探しに悩まない。', 'お部屋探しから契約・入居中のトラブル対応・退去手続きまで一括でご対応。すべての手間を削減。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 9197, clicks: 707, ctr: 0.0769, cost: 320746, cpc: 454, conversions: 44, cpa: 7290 },
  { id: 'ad-b1-3', adGroupId: 'ag-b1-1', name: 'RSA: 新入社員研修向け', status: 'active', adFormat: 'レスポンシブ検索広告',
    headlines: ['出張研修の宿泊先手配はお任せ', '法人向け/滞在先手配ならお任せ', '【法人向け】人事・総務の方必見'],
    descriptions: ['1週間から利用できる宿泊施設を最短当日でご提案。お部屋探しから退去手続きまで一括で代行。', '急な従業員の出張や研修でも迅速に予約が可能。全国から様々な用途に合わせた施設をご紹介。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order',
    impressions: 610, clicks: 14, ctr: 0.0230, cost: 9153, cpc: 654, conversions: 1, cpa: 9153 },

  // ── Bing ディスプレイ: リタゲ → monthly-order1 ──
  { id: 'ad-b2-1', adGroupId: 'ag-b2-1', name: 'レスポンシブ広告', status: 'active', adFormat: 'レスポンシブ',
    headlines: ['【法人向け】一括提案で比較楽々', 'マンスリーマンション契約代行', 'まずはお気軽にご相談ください'],
    descriptions: ['お部屋探しから契約・入居中のトラブル対応・退去手続きまで一括でご対応。すべての手間を削減。'],
    finalUrl: 'https://monthly-bank.jp/lp/monthly-order/',
    imageFileName: 'レスポンシブ広告画像（複数）', imageSize: '1200×1200 他',
    impressions: 488309, clicks: 3414, ctr: 0.0070, cost: 30029, cpc: 9, conversions: 1, cpa: 30029 },
];

// ─── キーワード ──────────────────────────────────────────────────

export const KEYWORDS: KeywordData[] = [
  // ── Google: K：コア → マンスリーマンション（上位KW） ──
  { id: 'kw-g1-1',  adGroupId: 'ag-g1-1', keyword: 'マンスリーマンション',           matchType: 'インテントマッチ', status: 'active',  qualityScore: 3,    impressions: 11885, clicks: 1094, ctr: 0.0920, cost: 795859, cpc: 727, conversions: 90, cvr: 0.0823, cpa: 8843,  topImprRate: '25.91%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-2',  adGroupId: 'ag-g1-1', keyword: 'ウィークリーマンション',          matchType: 'フレーズ一致',     status: 'limited', qualityScore: 1,    impressions: 3437,  clicks: 319,  ctr: 0.0928, cost: 183353, cpc: 575, conversions: 14, cvr: 0.0439, cpa: 13097, topImprRate: '24.70%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-3',  adGroupId: 'ag-g1-1', keyword: '長期滞在',                       matchType: 'インテントマッチ', status: 'limited', qualityScore: 1,    impressions: 1760,  clicks: 159,  ctr: 0.0903, cost: 97078,  cpc: 611, conversions: 10, cvr: 0.0629, cpa: 9708,  topImprRate: '23.15%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-4',  adGroupId: 'ag-g1-1', keyword: 'マンスリー マンション 東京',      matchType: 'フレーズ一致',     status: 'active',  qualityScore: 4,    impressions: 286,   clicks: 29,   ctr: 0.1014, cost: 25357,  cpc: 874, conversions: 5,  cvr: 0.1724, cpa: 5071,  topImprRate: '24.24%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-5',  adGroupId: 'ag-g1-1', keyword: 'マンスリー賃貸',                 matchType: 'フレーズ一致',     status: 'active',  qualityScore: 5,    impressions: 300,   clicks: 34,   ctr: 0.1133, cost: 20315,  cpc: 598, conversions: 3,  cvr: 0.0882, cpa: 6772,  topImprRate: '19.87%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-6',  adGroupId: 'ag-g1-1', keyword: 'ウィークリー マンション 東京',    matchType: 'フレーズ一致',     status: 'active',  qualityScore: 3,    impressions: 201,   clicks: 24,   ctr: 0.1194, cost: 16673,  cpc: 695, conversions: 0,  cvr: 0,      cpa: null,  topImprRate: '23.85%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-7',  adGroupId: 'ag-g1-1', keyword: 'リブ マックス マンスリー',        matchType: 'フレーズ一致',     status: 'limited', qualityScore: 1,    impressions: 166,   clicks: 25,   ctr: 0.1506, cost: 15640,  cpc: 626, conversions: 4,  cvr: 0.1600, cpa: 3910,  topImprRate: '30.12%', absTopImprRate: '14.31%' },
  { id: 'kw-g1-8',  adGroupId: 'ag-g1-1', keyword: 'マンスリー',                      matchType: 'フレーズ一致',     status: 'active',  qualityScore: 3,    impressions: 509,   clicks: 19,   ctr: 0.0373, cost: 15068,  cpc: 793, conversions: 2,  cvr: 0.1053, cpa: 7534,  topImprRate: '20.67%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-9',  adGroupId: 'ag-g1-1', keyword: 'ウィークリー賃貸',                matchType: 'フレーズ一致',     status: 'limited', qualityScore: 2,    impressions: 211,   clicks: 22,   ctr: 0.1043, cost: 12201,  cpc: 555, conversions: 1,  cvr: 0.0455, cpa: 12201, topImprRate: '16.81%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-10', adGroupId: 'ag-g1-1', keyword: 'ウィークリー マンション',          matchType: 'インテントマッチ', status: 'limited', qualityScore: 1,    impressions: 139,   clicks: 15,   ctr: 0.1079, cost: 11851,  cpc: 790, conversions: 1,  cvr: 0.0667, cpa: 11851, topImprRate: '18.12%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-11', adGroupId: 'ag-g1-1', keyword: 'アパート 探し 家具 家電 付き',    matchType: 'フレーズ一致',     status: 'active',  qualityScore: null, impressions: 151,   clicks: 20,   ctr: 0.1325, cost: 11028,  cpc: 551, conversions: 1,  cvr: 0.0500, cpa: 11028, topImprRate: '15.66%', absTopImprRate: '< 10%' },
  { id: 'kw-g1-12', adGroupId: 'ag-g1-1', keyword: 'アット イン',                     matchType: 'フレーズ一致',     status: 'limited', qualityScore: 1,    impressions: 366,   clicks: 10,   ctr: 0.0273, cost: 11428,  cpc: 1143, conversions: 1, cvr: 0.1000, cpa: 11428, topImprRate: '23.36%', absTopImprRate: '< 10%' },

  // ── Yahoo!: K：コア → マンスリーマンション（上位KW） ──
  { id: 'kw-y1-1',  adGroupId: 'ag-y1-1', keyword: 'マンスリーマンション',           matchType: 'インテントマッチ', status: 'active', qualityScore: 4, impressions: 38579, clicks: 1894, ctr: 0.0491, cost: 852907, cpc: 450, conversions: 85, cvr: 0.0449, cpa: 10034, topImprRate: null, absTopImprRate: null },
  { id: 'kw-y1-2',  adGroupId: 'ag-y1-1', keyword: 'ウイークリー マンション',         matchType: 'フレーズ一致',     status: 'active', qualityScore: 3, impressions: 7285,  clicks: 274,  ctr: 0.0376, cost: 91213,  cpc: 333, conversions: 11, cvr: 0.0401, cpa: 8292,  topImprRate: null, absTopImprRate: null },
  { id: 'kw-y1-3',  adGroupId: 'ag-y1-1', keyword: 'ウィークリーマンション',          matchType: 'フレーズ一致',     status: 'active', qualityScore: 3, impressions: 5987,  clicks: 231,  ctr: 0.0386, cost: 79576,  cpc: 344, conversions: 10, cvr: 0.0433, cpa: 7958,  topImprRate: null, absTopImprRate: null },
  { id: 'kw-y1-4',  adGroupId: 'ag-y1-1', keyword: 'ウィークリー マンション',         matchType: 'フレーズ一致',     status: 'active', qualityScore: 3, impressions: 4690,  clicks: 218,  ctr: 0.0465, cost: 76068,  cpc: 349, conversions: 7,  cvr: 0.0321, cpa: 10867, topImprRate: null, absTopImprRate: null },
  { id: 'kw-y1-5',  adGroupId: 'ag-y1-1', keyword: '宿泊手配',                       matchType: 'フレーズ一致',     status: 'active', qualityScore: 1, impressions: 23856, clicks: 206,  ctr: 0.0086, cost: 69168,  cpc: 336, conversions: 4,  cvr: 0.0194, cpa: 17292, topImprRate: null, absTopImprRate: null },
  { id: 'kw-y1-6',  adGroupId: 'ag-y1-1', keyword: '長期 宿泊',                      matchType: 'インテントマッチ', status: 'active', qualityScore: 3, impressions: 6016,  clicks: 256,  ctr: 0.0426, cost: 61597,  cpc: 241, conversions: 7,  cvr: 0.0273, cpa: 8800,  topImprRate: null, absTopImprRate: null },
  { id: 'kw-y1-7',  adGroupId: 'ag-y1-1', keyword: 'ウィークリーマンション',          matchType: 'インテントマッチ', status: 'active', qualityScore: 3, impressions: 4059,  clicks: 162,  ctr: 0.0399, cost: 54338,  cpc: 335, conversions: 5,  cvr: 0.0309, cpa: 10868, topImprRate: null, absTopImprRate: null },
  { id: 'kw-y1-8',  adGroupId: 'ag-y1-1', keyword: 'マンスリー',                      matchType: 'フレーズ一致',     status: 'active', qualityScore: 5, impressions: 2550,  clicks: 87,   ctr: 0.0341, cost: 29748,  cpc: 342, conversions: 2,  cvr: 0.0230, cpa: 14874, topImprRate: null, absTopImprRate: null },
  { id: 'kw-y1-9',  adGroupId: 'ag-y1-1', keyword: '東京 マンスリーマンション',       matchType: 'フレーズ一致',     status: 'active', qualityScore: 3, impressions: 281,   clicks: 23,   ctr: 0.0819, cost: 16336,  cpc: 710, conversions: 2,  cvr: 0.0870, cpa: 8168,  topImprRate: null, absTopImprRate: null },
  { id: 'kw-y1-10', adGroupId: 'ag-y1-1', keyword: '大阪 マンスリー マンション',      matchType: 'フレーズ一致',     status: 'active', qualityScore: 4, impressions: 122,   clicks: 9,    ctr: 0.0738, cost: 6906,   cpc: 767, conversions: 1,  cvr: 0.1111, cpa: 6906,  topImprRate: null, absTopImprRate: null },

  // ── Bing: K：コア → マンスリーマンション（上位KW） ──
  { id: 'kw-b1-1',  adGroupId: 'ag-b1-1', keyword: 'マンスリーマンション',            matchType: 'フレーズ一致',     status: 'active', qualityScore: 6, impressions: 11716, clicks: 1238, ctr: 0.1057, cost: 606084, cpc: 490, conversions: 0,  cvr: 0,      cpa: null,  topImprRate: '90.87%', absTopImprRate: '41.56%' },
  { id: 'kw-b1-2',  adGroupId: 'ag-b1-1', keyword: 'ウィークリーマンション',          matchType: 'フレーズ一致',     status: 'active', qualityScore: 7, impressions: 12388, clicks: 1240, ctr: 0.1001, cost: 482301, cpc: 389, conversions: 0,  cvr: 0,      cpa: null,  topImprRate: '92.42%', absTopImprRate: '32.36%' },
  { id: 'kw-b1-3',  adGroupId: 'ag-b1-1', keyword: 'マンスリーマンション 家具家電付き', matchType: 'フレーズ一致',   status: 'active', qualityScore: 10, impressions: 81,   clicks: 9,    ctr: 0.1111, cost: 2975,   cpc: 331, conversions: 0,  cvr: 0,      cpa: null,  topImprRate: '89.04%', absTopImprRate: '26.03%' },
];

// ─── ルックアップ関数 ────────────────────────────────────────────

export function getCampaign(id: string): CampaignData | undefined {
  return CAMPAIGNS.find((c) => c.id === id);
}

export function getAdGroupsByCampaign(campaignId: string): AdGroupData[] {
  return AD_GROUPS.filter((ag) => ag.campaignId === campaignId);
}

export function getAdGroup(id: string): AdGroupData | undefined {
  return AD_GROUPS.find((ag) => ag.id === id);
}

export function getAdsByAdGroup(adGroupId: string): AdData[] {
  return ADS.filter((ad) => ad.adGroupId === adGroupId);
}

export function getKeywordsByAdGroup(adGroupId: string): KeywordData[] {
  return KEYWORDS.filter((kw) => kw.adGroupId === adGroupId);
}

/** キャンペーンIDマップ（高速ルックアップ用） */
export function getCampaignMap(): Map<string, CampaignData> {
  return new Map(CAMPAIGNS.map((c) => [c.id, c]));
}

/** 広告グループIDマップ（高速ルックアップ用） */
export function getAdGroupMap(): Map<string, AdGroupData> {
  return new Map(AD_GROUPS.map((ag) => [ag.id, ag]));
}

/** ダッシュボード用: フィルター条件に合致するキャンペーンを集計 */
export function aggregateCampaigns(
  filters: { platform?: Platform | 'all'; adType?: AdType | 'all' } = {},
): { impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cpc: number; cvr: number; cpa: number } {
  const { platform = 'all', adType = 'all' } = filters;
  const filtered = CAMPAIGNS.filter((c) => {
    if (platform !== 'all' && c.platform !== platform) return false;
    if (adType !== 'all' && c.adType !== adType) return false;
    return true;
  });
  const t = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
  for (const c of filtered) {
    t.impressions += c.impressions;
    t.clicks += c.clicks;
    t.cost += c.cost;
    t.conversions += c.conversions;
  }
  return {
    ...t,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    cpc: t.clicks > 0 ? t.cost / t.clicks : 0,
    cvr: t.clicks > 0 ? t.conversions / t.clicks : 0,
    cpa: t.conversions > 0 ? t.cost / t.conversions : 0,
  };
}

/** ダッシュボード用: 媒体別の集計 */
export function aggregateCampaignsByPlatform(
  filters: { adType?: AdType | 'all' } = {},
): { platform: string; impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cpc: number; cvr: number; cpa: number }[] {
  const platforms: Platform[] = ['google', 'yahoo', 'bing'];
  return platforms.map((p) => ({
    platform: p,
    ...aggregateCampaigns({ platform: p, adType: filters.adType }),
  }));
}
