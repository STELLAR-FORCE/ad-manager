/**
 * ダッシュボードのサマリー（進捗ビュー）用の期間定義と計算。
 *
 * 今この瞬間（today）を基準に、以下 5 期間の「現在 / 前期間」のレンジを返す:
 *   - week:     月曜始まりの今週（月曜 〜 今日）。比較は先週同曜日まで
 *   - month:    今月 1 日 〜 今日。比較は先月 1 日〜先月同日
 *   - quarter:  今 Q（1月始まりの Q1=1-3, Q2=4-6 …）開始日 〜 今日。比較は前 Q 開始日〜前 Q の経過同日
 *   - halfYear: 上期（1-6月） / 下期（7-12月）開始日 〜 今日。比較は前半期の経過同日
 *   - year:     今年 1/1 〜 今日。比較は昨年 1/1 〜 昨年同日
 *
 * いずれも「today までの累計」を見るので、開始日は固定、終了日 = today。
 * 比較期間は同じ経過日数を取る（公平な比較になるよう）。
 */

export type ProgressPeriodKey = 'week' | 'month' | 'quarter' | 'halfYear' | 'year';

export type ProgressRange = {
  /** 'YYYY-MM-DD' */
  start: string;
  end: string;
  label: string;
  /** 比較期間（前期間の同じ経過日数まで） */
  prevStart: string;
  prevEnd: string;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(d, offset);
}

/** 1月始まりの quarter index (0..3) */
function quarterIndex(d: Date): number {
  return Math.floor(d.getMonth() / 3);
}

/** 上期/下期 index (0 = 1-6月, 1 = 7-12月) */
function halfIndex(d: Date): number {
  return d.getMonth() < 6 ? 0 : 1;
}

export function calcProgressRanges(today: Date): Record<ProgressPeriodKey, ProgressRange> {
  const todayStr = fmt(today);

  // ── 週 ──
  const weekStart = startOfWeekMonday(today);
  const weekEnd = today;
  const weekElapsed = daysBetween(weekStart, weekEnd);
  const prevWeekStart = addDays(weekStart, -7);
  const prevWeekEnd = addDays(prevWeekStart, weekElapsed);

  // ── 月 ──
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = today;
  const monthElapsed = daysBetween(monthStart, monthEnd);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthEnd = addDays(prevMonthStart, monthElapsed);

  // ── Q ──
  const qIdx = quarterIndex(today);
  const qStart = new Date(today.getFullYear(), qIdx * 3, 1);
  const qEnd = today;
  const qElapsed = daysBetween(qStart, qEnd);
  // 前 Q
  const prevQYear = qIdx === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const prevQIdx = qIdx === 0 ? 3 : qIdx - 1;
  const prevQStart = new Date(prevQYear, prevQIdx * 3, 1);
  const prevQEnd = addDays(prevQStart, qElapsed);

  // ── 半期 ──
  const hIdx = halfIndex(today);
  const hStart = new Date(today.getFullYear(), hIdx * 6, 1);
  const hEnd = today;
  const hElapsed = daysBetween(hStart, hEnd);
  const prevHYear = hIdx === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const prevHIdx = hIdx === 0 ? 1 : 0;
  const prevHStart = new Date(prevHYear, prevHIdx * 6, 1);
  const prevHEnd = addDays(prevHStart, hElapsed);

  // ── 年 ──
  const yStart = new Date(today.getFullYear(), 0, 1);
  const yEnd = today;
  const yElapsed = daysBetween(yStart, yEnd);
  const prevYStart = new Date(today.getFullYear() - 1, 0, 1);
  const prevYEnd = addDays(prevYStart, yElapsed);

  return {
    week: {
      start: fmt(weekStart),
      end: todayStr,
      label: '今週',
      prevStart: fmt(prevWeekStart),
      prevEnd: fmt(prevWeekEnd),
    },
    month: {
      start: fmt(monthStart),
      end: todayStr,
      label: `${today.getMonth() + 1}月`,
      prevStart: fmt(prevMonthStart),
      prevEnd: fmt(prevMonthEnd),
    },
    quarter: {
      start: fmt(qStart),
      end: todayStr,
      label: `Q${qIdx + 1}`,
      prevStart: fmt(prevQStart),
      prevEnd: fmt(prevQEnd),
    },
    halfYear: {
      start: fmt(hStart),
      end: todayStr,
      label: hIdx === 0 ? '上期' : '下期',
      prevStart: fmt(prevHStart),
      prevEnd: fmt(prevHEnd),
    },
    year: {
      start: fmt(yStart),
      end: todayStr,
      label: `${today.getFullYear()}年`,
      prevStart: fmt(prevYStart),
      prevEnd: fmt(prevYEnd),
    },
  };
}
