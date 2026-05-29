/**
 * 月次予算 → 媒体別×日次×種別 の日次配分ロジック (Issue #117)
 *
 * 業務ルール (ユーザー共有):
 *   リタゲ等固定費(月) = 月日数 × (Bing 3,000 + Yahoo 3,000 + Google デマンドジェン 5,000)
 *   月次検索広告予算    = (月次予算 - リタゲ等固定費) × 0.9
 *                        (組んだ予算から 10% 超過する傾向の補正)
 *   日次検索広告総予算  = 月次検索広告予算 / 実営業日数 (平日)
 *   1媒体当たり日次予算 = 日次検索広告総予算 / 3 (Bing/Google/Yahoo の検索)
 *
 *   週次重み (任意適用):
 *     第1週 (1〜7日)               × 0.8 (依頼が少ない)
 *     最終週 (月末から逆算 7 日)   × 1.2 (依頼が多い)
 *     中間週                       × 1.0
 *
 *   非営業日の検索広告 = 0
 *   リタゲ・デマンドジェン = 毎日固定値で配信
 */

export const RETARGETING_PER_DAY_BING = 3000;
export const RETARGETING_PER_DAY_YAHOO = 3000;
export const DEMAND_GEN_PER_DAY_GOOGLE = 5000;
export const FIXED_DAILY_TOTAL =
  RETARGETING_PER_DAY_BING + RETARGETING_PER_DAY_YAHOO + DEMAND_GEN_PER_DAY_GOOGLE; // 11,000

export const SEARCH_BUDGET_ADJUST_RATIO = 0.9;
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
  monthlyTotal: number;
  /** 第1週0.8 / 最終週1.2 を適用するか (false なら全週 1.0) */
  applyWeekWeight: boolean;
};

export type DistributeSummary = {
  year: number;
  month: number;
  daysInMonth: number;
  businessDays: number;
  fixedMonthly: number;
  searchMonthly: number;
  dailySearchTotal: number;
  dailyPerPlatform: number;
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

/**
 * 月次予算を日次×媒体×種別に展開する。戻り値の planned_cost は四捨五入で整数化。
 */
export function distributeMonthlyBudget(
  input: DistributeInput,
): { rows: DailyPlanRow[]; summary: DistributeSummary } {
  const { year, month, monthlyTotal, applyWeekWeight } = input;
  const daysInMonth = new Date(year, month, 0).getDate();

  // 営業日 (月〜金) の日付配列
  const businessDays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow >= 1 && dow <= 5) businessDays.push(d);
  }

  const fixedMonthly = FIXED_DAILY_TOTAL * daysInMonth;
  const searchMonthly = Math.max(0, (monthlyTotal - fixedMonthly) * SEARCH_BUDGET_ADJUST_RATIO);
  const dailySearchTotal = businessDays.length > 0 ? searchMonthly / businessDays.length : 0;
  const dailyPerPlatform = dailySearchTotal / 3;

  const weights: { first: number; middle: number; last: number } = applyWeekWeight
    ? { first: WEEK_WEIGHT_FIRST, middle: WEEK_WEIGHT_MIDDLE, last: WEEK_WEIGHT_LAST }
    : { first: 1, middle: 1, last: 1 };

  const rows: DailyPlanRow[] = [];
  const businessDaySet = new Set(businessDays);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
    const isBusinessDay = businessDaySet.has(d);
    const w = weights[weekKind(d, daysInMonth)];

    // 検索広告 (営業日のみ)
    if (isBusinessDay) {
      const amount = Math.round(dailyPerPlatform * w);
      rows.push({ date: dateStr, platform: 'google', adType: 'search', plannedCost: amount });
      rows.push({ date: dateStr, platform: 'yahoo', adType: 'search', plannedCost: amount });
      rows.push({ date: dateStr, platform: 'bing', adType: 'search', plannedCost: amount });
    }

    // リタゲ・デマンドジェン (毎日固定)
    rows.push({
      date: dateStr,
      platform: 'bing',
      adType: 'display',
      plannedCost: RETARGETING_PER_DAY_BING,
    });
    rows.push({
      date: dateStr,
      platform: 'yahoo',
      adType: 'display',
      plannedCost: RETARGETING_PER_DAY_YAHOO,
    });
    rows.push({
      date: dateStr,
      platform: 'google',
      adType: 'display',
      plannedCost: DEMAND_GEN_PER_DAY_GOOGLE,
    });
  }

  return {
    rows,
    summary: {
      year,
      month,
      daysInMonth,
      businessDays: businessDays.length,
      fixedMonthly,
      searchMonthly,
      dailySearchTotal,
      dailyPerPlatform,
      weights,
    },
  };
}
