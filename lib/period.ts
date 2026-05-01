/**
 * 期間の粒度（月 / Q / 上下半期 / 年）と、それに対応する開始日・終了日・月リスト。
 * Issue #63 の入居日ベースビューで使う。
 */

export type PeriodType = 'month' | 'quarter' | 'half' | 'year';

export type Period = {
  type: PeriodType;
  year: number;
  /** month: 1–12, quarter: 1–4, half: 1–2, year: 1（無視）*/
  index: number;
};

export type PeriodRange = {
  start: Date;
  end: Date;
  /** 'YYYY-MM' の月キーを期間内分だけ並べた配列 */
  months: string[];
  label: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

function lastDayOfMonth(year: number, monthOneBased: number): Date {
  return new Date(year, monthOneBased, 0);
}

/** 1 期間の開始月・終了月（1-12 表現） */
function periodMonthSpan(p: Period): { startMonth: number; endMonth: number } {
  switch (p.type) {
    case 'month':
      return { startMonth: p.index, endMonth: p.index };
    case 'quarter': {
      const startMonth = (p.index - 1) * 3 + 1;
      return { startMonth, endMonth: startMonth + 2 };
    }
    case 'half':
      return p.index === 1 ? { startMonth: 1, endMonth: 6 } : { startMonth: 7, endMonth: 12 };
    case 'year':
      return { startMonth: 1, endMonth: 12 };
  }
}

export function periodRange(p: Period): PeriodRange {
  const { startMonth, endMonth } = periodMonthSpan(p);
  const start = new Date(p.year, startMonth - 1, 1);
  const end = lastDayOfMonth(p.year, endMonth);
  const months: string[] = [];
  for (let m = startMonth; m <= endMonth; m++) {
    months.push(monthKey(p.year, m));
  }
  return { start, end, months, label: periodLabel(p) };
}

export function periodLabel(p: Period): string {
  switch (p.type) {
    case 'month':
      return `${p.year}年${p.index}月`;
    case 'quarter':
      return `${p.year}年 Q${p.index}`;
    case 'half':
      return p.index === 1 ? `${p.year}年 上半期` : `${p.year}年 下半期`;
    case 'year':
      return `${p.year}年`;
  }
}

/** 1 つ前の期間 */
export function previousPeriod(p: Period): Period {
  switch (p.type) {
    case 'month': {
      if (p.index === 1) return { type: 'month', year: p.year - 1, index: 12 };
      return { ...p, index: p.index - 1 };
    }
    case 'quarter': {
      if (p.index === 1) return { type: 'quarter', year: p.year - 1, index: 4 };
      return { ...p, index: p.index - 1 };
    }
    case 'half': {
      if (p.index === 1) return { type: 'half', year: p.year - 1, index: 2 };
      return { type: 'half', year: p.year, index: 1 };
    }
    case 'year':
      return { type: 'year', year: p.year - 1, index: 1 };
  }
}

export function nextPeriod(p: Period): Period {
  switch (p.type) {
    case 'month': {
      if (p.index === 12) return { type: 'month', year: p.year + 1, index: 1 };
      return { ...p, index: p.index + 1 };
    }
    case 'quarter': {
      if (p.index === 4) return { type: 'quarter', year: p.year + 1, index: 1 };
      return { ...p, index: p.index + 1 };
    }
    case 'half': {
      if (p.index === 2) return { type: 'half', year: p.year + 1, index: 1 };
      return { type: 'half', year: p.year, index: 2 };
    }
    case 'year':
      return { type: 'year', year: p.year + 1, index: 1 };
  }
}

/** 現在の日付を含む期間を返す（type 指定）*/
export function currentPeriod(today: Date, type: PeriodType): Period {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  switch (type) {
    case 'month':
      return { type, year, index: month };
    case 'quarter':
      return { type, year, index: Math.ceil(month / 3) };
    case 'half':
      return { type, year, index: month <= 6 ? 1 : 2 };
    case 'year':
      return { type, year, index: 1 };
  }
}

/** Period をクエリ文字列に直列化／復元（URL 永続化用）*/
export function periodToParams(p: Period): URLSearchParams {
  const params = new URLSearchParams();
  params.set('periodType', p.type);
  params.set('year', String(p.year));
  if (p.type !== 'year') params.set('index', String(p.index));
  return params;
}

export function periodFromSearchParams(sp: URLSearchParams, fallback: Period): Period {
  const type = sp.get('periodType') as PeriodType | null;
  const year = Number(sp.get('year'));
  const index = Number(sp.get('index'));
  if (!type || !Number.isFinite(year) || year < 2000) return fallback;
  if (!['month', 'quarter', 'half', 'year'].includes(type)) return fallback;
  if (type === 'year') return { type, year, index: 1 };
  if (!Number.isFinite(index) || index < 1) return fallback;
  return { type, year, index };
}

/** ISO 'YYYY-MM-DD' に整形 */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
