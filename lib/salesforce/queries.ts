import { sfTable } from '@/lib/bigquery';
import type { SfPlatform } from '@/lib/types/salesforce';

/**
 * sf_Lead.TrafficSourceMedia__c → ad_manager の Platform
 * 大文字小文字の揺れがあるので lower-case で比較する
 */
export const SF_MEDIA_TO_PLATFORM: Record<string, SfPlatform> = {
  google: 'google',
  adwords: 'google',
  yahoo: 'yahoo',
  yss: 'yahoo',
  bing: 'bing',
  pmax: 'google',
};

export function mapMediaToPlatform(media: string | null | undefined): SfPlatform {
  if (!media) return 'other';
  return SF_MEDIA_TO_PLATFORM[media.toLowerCase()] ?? 'other';
}

/** ステージ名（sf_OpportunityStage.MasterLabel） — 実データから決定値 */
export const SF_STAGE_WON = '案件成立';

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

/** エイリアス（SQL で使い回し） */
export const SF_OPPORTUNITY = sfTable('sf_Opportunity');
export const SF_OPPORTUNITY_STAGE = sfTable('sf_OpportunityStage');
export const SF_LEAD = sfTable('sf_Lead');
export const SF_CONTRACT = sfTable('sf_contract_management__c');
export const SF_ACCOUNT = sfTable('sf_Account');

/**
 * Field*__c など名前から用途が読めない項目の意味付き定数。
 * 詳細は docs/salesforce-mapping.md を参照。
 */
export const SF_LEAD_FIELDS = {
  receivedAt: 'Field9__c',
  approachedAt: 'Field15__c',
  approachTimeMinutes: 'Field16__c',
  leadTime: 'Field11__c',
  desiredAccommodation: 'Field17__c',
  usePeriodStart: 'Field5__c',
  usePeriodEnd: 'Field6__c',
  usePeriodDays: 'Field8__c',
} as const;

export const SF_OPPORTUNITY_FIELDS = {
  receptionDate: 'Reception_date__c',
  contactPerson: 'Field38__c',
} as const;

/**
 * 契約管理（sf_contract_management__c）の業務上の主要項目。
 * 詳細は docs/salesforce-mapping.md を参照。
 */
export const SF_CONTRACT_FIELDS = {
  /** 案件 ID（sf_Opportunity への JOIN キー）*/
  opportunityId: 'opportunity__c',
  /** 成約室数 */
  contractedRooms: 'contracted_number_of_room__c',
  /** 粗利（自社物件は 0 で計上される。Phase 3 で自社ポータル連携予定）*/
  grossProfit: 'total_sales_gross_profit__c',
  /** 売上（借主への請求額）*/
  revenue: 'billed_amount_to_tenant__c',
  /** 自社物件で決まった場合チェック（true の行は粗利が 0）*/
  isInhouse: 'is_contracted_monthly_inhouse__c',
  /** 契約開始日（実入居日）*/
  contractStart: 'contract_start_date__c',
  /** 決定日（粗利益計上日）*/
  decisionDate: 'decision_date__c',
} as const;

/**
 * 契約管理 Name の文字列パターンで契約区分を判定する SQL CASE 式を生成する。
 * 中冨さん確認: 「契約管理名に更新／延長／キャンセルが含まれる。
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
 * sf_Lead.TrafficSourceMedia__c → ad_manager Platform への BQ 側マッピング。
 * フロント側の mapMediaToPlatform と同等のロジックを SQL でも持つ。
 */
export const PLATFORM_FROM_MEDIA_CASE = `
  CASE LOWER(IFNULL(l.TrafficSourceMedia__c, ''))
    WHEN 'google' THEN 'google'
    WHEN 'adwords' THEN 'google'
    WHEN 'pmax' THEN 'google'
    WHEN 'yahoo' THEN 'yahoo'
    WHEN 'yss' THEN 'yahoo'
    WHEN 'bing' THEN 'bing'
    ELSE 'other'
  END
`.trim();
