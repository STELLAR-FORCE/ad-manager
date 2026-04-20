/**
 * 広告プラットフォームにおけるステータス表示の色・ラベル定義を一元管理する。
 * キャンペーン / 広告グループ / 広告 / キーワード / クリエイティブ / 予算 で共通利用する。
 */

export type CommonStatus =
  | 'active'
  | 'active_limited'
  | 'limited'
  | 'paused'
  | 'ended'
  | 'removed';

export type StatusChipColor = 'success' | 'warning' | 'default';

export type StatusTone = {
  color: StatusChipColor;
  /** Chip 左端のインジケータードット（HeroUI の色とは別に明度を揃えた Tailwind クラス） */
  dotClass: string;
  /** ラベル省略時のデフォルト文言 */
  defaultLabel: string;
};

const STATUS_TONE: Record<CommonStatus, StatusTone> = {
  active:         { color: 'success', dotClass: 'bg-green-500',  defaultLabel: '有効' },
  active_limited: { color: 'warning', dotClass: 'bg-yellow-400', defaultLabel: '有効（制限付き）' },
  limited:        { color: 'warning', dotClass: 'bg-yellow-400', defaultLabel: '制限付き' },
  paused:         { color: 'warning', dotClass: 'bg-amber-400',  defaultLabel: '一時停止' },
  ended:          { color: 'default', dotClass: 'bg-gray-300',   defaultLabel: '終了' },
  removed:        { color: 'default', dotClass: 'bg-gray-400',   defaultLabel: '削除済' },
};

export function getStatusTone(status: string): StatusTone {
  return STATUS_TONE[status as CommonStatus] ?? STATUS_TONE.paused;
}
