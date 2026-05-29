/**
 * 月次予算 → 媒体別×日次×種別 の日次配分ロジック (Issue #117)
 *
 * ユーザー方針: CSV に「リスティング予算」「ディスプレイ予算」を別々に入力する。
 *
 * リスティング (検索広告):
 *   日次総予算 = リスティング予算 / 実営業日数 (平日)
 *   1媒体日次  = 日次総予算 / 3 (Bing/Yahoo/Google search)
 *   週次重み (任意): 第1週 ×0.8 / 最終週 ×1.2 / 中間 ×1.0
 *   非営業日は 0
 *
 * ディスプレイ (リタゲ・デマンドジェン):
 *   日次総予算 = ディスプレイ予算 / 月日数 (毎日配信)
 *   媒体配分比率 = Bing:Yahoo:Google = 3:3:5 (=11)
 *     既存の固定費感覚 (Bing 3,000 + Yahoo 3,000 + Google デマンドジェン 5,000) を比率化
 *   1日 1媒体 = 日次総予算 × 比率
 */

export const DISPLAY_RATIO_BING = 3;
export const DISPLAY_RATIO_YAHOO = 3;
export const DISPLAY_RATIO_GOOGLE = 5;
export const DISPLAY_RATIO_SUM =
  DISPLAY_RATIO_BING + DISPLAY_RATIO_YAHOO + DISPLAY_RATIO_GOOGLE; // 11

export const WEEK_WEIGHT_FIRST = 0.8;
export const WEEK_WEIGHT_LAST = 1.2;
export const WEEK_WEIGHT_MIDDLE = 1.0;

export type Platform = 'google' | 'yahoo' | 'bing';
export type AdType = 'search' | 'display';

export type DailyPlanRow = {
  date: string; // 'YYYY-MM-DD'
  platform: Platform;
  adType: AdType;
  plannedCost: number;
};

export type DistributeInput = {
  year: number;
  month: number; // 1-12
  /** リスティング (検索広告) の月次予算 */
  searchMonthly: number;
  /** ディスプレイ (リタゲ/デマンドジェン) の月次予算 */
  displayMonthly: number;
  /** 第1週0.8 / 最終週1.2 を検索広告に適用するか (false なら全週 1.0) */
  applyWeekWeight: boolean;
};

export type DistributeSummary = {
  year: number;
  month: number;
  daysInMonth: number;
  businessDays: number;
  searchMonthly: number;
  displayMonthly: number;
  dailySearchTotal: number;
  dailySearchPerPlatform: number;
  dailyDisplayTotal: number;
  dailyDisplayByPlatform: { bing: number; yahoo: number; google: number };
  weights: { first: number; middle: number; last: number };
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function weekKind(day: number, daysInMonth: number): 'first' | 'last' | 'middle' {
  if (day <= 7) return 'first';
  if (day > daysInMonth - 7) return 'last';
  return 'middle';
}

/** 月次予算を日次×媒体×種別に展開する。planned_cost は整数化。 */
export function distributeMonthlyBudget(
  input: DistributeInput,
): { rows: DailyPlanRow[]; summary: DistributeSummary } {
  const { year, month, searchMonthly, displayMonthly, applyWeekWeight } = input;
  const daysInMonth = new Date(year, month, 0).getDate();

  // 営業日 (月〜金)
  const businessDays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow >= 1 && dow <= 5) businessDays.push(d);
  }
  const businessDaySet = new Set(businessDays);

  // ── 検索広告 (リスティング) ──
  const dailySearchTotal = businessDays.length > 0 ? searchMonthly / businessDays.length : 0;
  const dailySearchPerPlatform = dailySearchTotal / 3;
  const weights: { first: number; middle: number; last: number } = applyWeekWeight
    ? { first: WEEK_WEIGHT_FIRST, middle: WEEK_WEIGHT_MIDDLE, last: WEEK_WEIGHT_LAST }
    : { first: 1, middle: 1, last: 1 };

  // ── ディスプレイ (リタゲ・デマンドジェン) ──
  const dailyDisplayTotal = daysInMonth > 0 ? displayMonthly / daysInMonth : 0;
  const dailyDisplayByPlatform = {
    bing: dailyDisplayTotal * (DISPLAY_RATIO_BING / DISPLAY_RATIO_SUM),
    yahoo: dailyDisplayTotal * (DISPLAY_RATIO_YAHOO / DISPLAY_RATIO_SUM),
    google: dailyDisplayTotal * (DISPLAY_RATIO_GOOGLE / DISPLAY_RATIO_SUM),
  };

  const rows: DailyPlanRow[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
    const w = weights[weekKind(d, daysInMonth)];

    // 検索広告 (営業日のみ)
    if (businessDaySet.has(d)) {
      const amount = Math.round(dailySearchPerPlatform * w);
      rows.push({ date: dateStr, platform: 'google', adType: 'search', plannedCost: amount });
      rows.push({ date: dateStr, platform: 'yahoo', adType: 'search', plannedCost: amount });
      rows.push({ date: dateStr, platform: 'bing', adType: 'search', plannedCost: amount });
    }

    // ディスプレイ (毎日)
    rows.push({
      date: dateStr,
      platform: 'bing',
      adType: 'display',
      plannedCost: Math.round(dailyDisplayByPlatform.bing),
    });
    rows.push({
      date: dateStr,
      platform: 'yahoo',
      adType: 'display',
      plannedCost: Math.round(dailyDisplayByPlatform.yahoo),
    });
    rows.push({
      date: dateStr,
      platform: 'google',
      adType: 'display',
      plannedCost: Math.round(dailyDisplayByPlatform.google),
    });
  }

  return {
    rows,
    summary: {
      year,
      month,
      daysInMonth,
      businessDays: businessDays.length,
      searchMonthly,
      displayMonthly,
      dailySearchTotal,
      dailySearchPerPlatform,
      dailyDisplayTotal,
      dailyDisplayByPlatform,
      weights,
    },
  };
}
