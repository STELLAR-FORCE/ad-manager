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

/** ¥2.05億 のように小数点 2 桁まで精度を出す compact 表記。大きい数値カード用 */
export const jpyCompact2 = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  notation: 'compact',
  maximumFractionDigits: 2,
});

export const numFormat = new Intl.NumberFormat('ja-JP');

export const pctFormat = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Date オブジェクトをローカル日付 (JST 等) の 'YYYY-MM-DD' 文字列にする。
 * d.toISOString() は UTC 変換なので、JST 月初を作って文字列化すると前日になるバグを回避。
 */
export function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM' → '2026年4月' のような表示。 */
export function formatMonthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  return `${m[1]}年${Number(m[2])}月`;
}
