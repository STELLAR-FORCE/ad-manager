import { tableIn } from '@/lib/bigquery';
import type { SfPlatform } from '@/lib/types/salesforce';

/**
 * Salesforce データのソースは mart.salesforce_all_obj に統一。
 * Lead + Opportunity + 契約管理を JOIN 済みのワイドビュー（1リード1行）。
 * 旧 staging.sf_Lead / sf_Opportunity / sf_contract_management__c は廃止。
 */
export const SF_MART = tableIn('mart', 'salesforce_all_obj');

/**
 * 流入元_媒体別 → ad_manager の Platform マッピング。
 * 大文字小文字の揺れがあるので lower-case で比較する（PMAX 大文字も含む）。
 */
export const SF_MEDIA_TO_PLATFORM: Record<string, SfPlatform> = {
  google: 'google',
  adwords: 'google',
  pmax: 'google',
  yahoo: 'yahoo',
  yss: 'yahoo',
  bing: 'bing',
};

export function mapMediaToPlatform(media: string | null | undefined): SfPlatform {
  if (!media) return 'other';
  return SF_MEDIA_TO_PLATFORM[media.toLowerCase()] ?? 'other';
}

/** ステージ名（mart.salesforce_all_obj.案件フェーズ） — 実データから決定値 */
export const SF_STAGE_WON = '案件成立';

/**
 * LP 流入元フィルタ（mart.salesforce_all_obj.流入元_LP反響）— Issue #64。
 *
 *   monthly-order / express / standard … 検索依頼用 LP（https://www.monthly-bank.jp/lp/...）
 *   site                                 … 資料 DL 用 LP（https://monthly-bank.jp/）
 *
 * これ以外の値（gm / net-tel / form / SNS / mail-form）は別経路のため除外。
 * NULL も除外。
 */
export const SF_LP_RYUUNYUUMOTO_VALUES = [
  'monthly-order',
  'express',
  'standard',
  'site',
] as const;

/** BQ SQL の IN 句用: 全て安全な固定文字列 */
export function lpRyuunyuumotoSqlList(): string {
  return SF_LP_RYUUNYUUMOTO_VALUES.map((s) => `'${s}'`).join(', ');
}

/** mart.salesforce_all_obj に LP フィルタを当てる WHERE 句（先頭 AND 無し） */
export const LP_LEAD_FILTER_SQL = `\`流入元_LP反響\` IN (${SF_LP_RYUUNYUUMOTO_VALUES.map((s) => `'${s}'`).join(', ')})`;

/**
 * フェーズ確度マスタ（dashboard.stage_probability）— Issue #64。
 * 物件成立 (won) は契約管理側で確定粗利を使うため、確度は名目上 100%。
 * 実際の予想粗利計算では進行中（introduced / early）にだけ確度を当てる。
 */
export type StageGroup = 'won' | 'introduced' | 'early' | 'lost';

export const SF_STAGES_LOST = [
  '失注',
  '失注（キャンセル）',
  '失注（連絡が取れなかった）',
  '失注（案内できなかった）',
  '失注（案内したが負けた）',
  '失注（他決）',
  '失注（他決 / ウィークリー）',
  '失注（理由不明）',
  '失注（対応不備・トラブル）',
  'キャンセル',
  '依頼キャンセル',
] as const;

export const SF_STAGES_LOST_SET = new Set<string>(SF_STAGES_LOST);

/** BQ SQL の IN 句用: ステージ名は全て安全な固定文字列 */
export function lostStagesSqlList(): string {
  return SF_STAGES_LOST.map((s) => `'${s}'`).join(', ');
}

/**
 * mart.salesforce_all_obj のカラム名定数。
 * 1 ビューに全フィールドがフラットに展開されている前提で参照する。
 * SQL では `\`カラム名\`` のようにバッククオートで囲む必要があるが、
 * テンプレート文字列内では二重エスケープになるので各 SQL 側で書く。
 */
export const SF_COLS = {
  // ── 識別子 ──
  leadId: '`リードID`',
  oppId: '`案件ID`',
  contractId: '`契約管理ID`',
  convertedFlag: '`コンバートフラグ`',

  // ── リード関連 ──
  receivedAt: '`受付日時`',
  media: '`流入元_媒体別`',
  lpSource: '`流入元_LP反響`',
  needRooms: '`必要戸数_数値`',
  usePeriodStart: '`利用期間_始期`',
  usePeriodEnd: '`利用期間_終期`',
  usePeriodDays: '`利用期間_日数`',
  approachedAt: '`アプローチ日時`',
  approachTimeMinutes: '`アプローチタイム分`',
  leadTime: '`リードタイム`',

  // ── 案件関連 ──
  oppName: '`案件名`',
  oppStage: '`案件フェーズ`',
  oppReceptionDate: '`受付日`',
  oppMoveInDate: '`入居予定日`',
  elapsedLeadTime: '`経過リードタイム`',

  // ── 契約管理関連 ──
  contractName: '`契約管理名`',
  contractedRooms: '`成約室数`',
  grossProfit: '`総売上_粗利`',
  revenue: '`借主への請求額`',
  isInhouse: '`自社物件で決まった場合チェック`',
  contractStart: '`契約開始日`',
  decisionDate: '`決定日_粗利益計上日`',
  useDaysContracted: '`利用日数_成約`',
} as const;

/**
 * 契約管理名の文字列パターンで契約区分を判定する SQL CASE 式を生成する。
 * 「契約管理名に更新／延長／キャンセルが含まれる。
 *   既存案件が延長やキャンセルになると新たな契約管理レコードが作られる」
 */
export function contractKindCase(nameExpr: string): string {
  return `
    CASE
      WHEN ${nameExpr} LIKE '%キャンセル%' THEN 'cancel'
      WHEN ${nameExpr} LIKE '%延長%' THEN 'extension'
      WHEN ${nameExpr} LIKE '%更新%' THEN 'renewal'
      ELSE 'new'
    END
  `.trim();
}

/**
 * 流入元_媒体別 → ad_manager Platform への BQ 側マッピング。
 * フロント側の mapMediaToPlatform と同等のロジックを SQL でも持つ。
 * NULL は 'other' になる。
 */
export const PLATFORM_FROM_MEDIA_CASE = `
  CASE LOWER(IFNULL(${SF_COLS.media}, ''))
    WHEN 'google' THEN 'google'
    WHEN 'adwords' THEN 'google'
    WHEN 'pmax' THEN 'google'
    WHEN 'yahoo' THEN 'yahoo'
    WHEN 'yss' THEN 'yahoo'
    WHEN 'bing' THEN 'bing'
    ELSE 'other'
  END
`.trim();
