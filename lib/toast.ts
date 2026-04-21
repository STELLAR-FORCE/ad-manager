import { toast, type ExternalToast } from 'sonner';

/**
 * プロジェクト全体で統一された通知API。
 * severity は success / error / warning / info の4種類。
 *
 * sonner の `richColors` と組み合わせることで、severity ごとに
 * 左端のアイコン＋色付き背景が自動で付与される。
 */
export const notify = {
  success: (message: string, options?: ExternalToast) => toast.success(message, options),
  error: (message: string, options?: ExternalToast) => toast.error(message, options),
  warning: (message: string, options?: ExternalToast) => toast.warning(message, options),
  info: (message: string, options?: ExternalToast) => toast.info(message, options),
  /** 確認ダイアログ風（アクション付き）。戻す系オペレーションに使う */
  action: (message: string, action: { label: string; onClick: () => void }, options?: ExternalToast) =>
    toast(message, { ...options, action }),
};
