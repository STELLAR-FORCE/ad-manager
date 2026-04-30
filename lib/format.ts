/**
 * 共通フォーマッタ。すべて ja-JP ロケール固定（UI ガイドライン準拠）。
 */

export const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

export const jpyCompact = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  notation: 'compact',
  maximumFractionDigits: 0,
});

export const numFormat = new Intl.NumberFormat('ja-JP');

export const pctFormat = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 'YYYY-MM' → '2026年4月' のような表示。 */
export function formatMonthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  return `${m[1]}年${Number(m[2])}月`;
}
