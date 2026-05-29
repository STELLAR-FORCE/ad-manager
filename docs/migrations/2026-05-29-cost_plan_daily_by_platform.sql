-- Issue #117 / 予算管理刷新: 媒体別×日次×種別 の予算管理テーブル
--
-- 既存の `dashboard.cost_plan_daily` は全媒体合算で、媒体ごとの日次予定を持てない。
-- 月次予算からロジックで配分した結果 (Bing/Google/Yahoo × search/display 単位) を保存し、
-- ad-detail の媒体カード下グラフで「日次消化予定 vs 実績」を可視化する。
--
-- 配分ロジック (lib/budget-plan-distribute.ts で実装):
--   - リタゲ/デマンドジェン: 日次固定 (Bing 3,000 / Yahoo 3,000 / Google 5,000)
--   - 検索広告予算: (月次予算 - リタゲ固定費) × 0.9 / 営業日数 / 3 媒体 × 週次重み
--
-- 適用先: Dashboard SQL Editor で実行 (or bq query)

CREATE TABLE IF NOT EXISTS `stellarforce-bi.dashboard.cost_plan_daily_by_platform` (
  date          DATE       NOT NULL,
  platform      STRING     NOT NULL,  -- 'google' | 'yahoo' | 'bing'
  ad_type       STRING     NOT NULL,  -- 'search' | 'display'
  planned_cost  NUMERIC    NOT NULL,
  updated_at    TIMESTAMP,
  updated_by    STRING
)
PARTITION BY date
CLUSTER BY platform, ad_type
OPTIONS (
  description = '媒体別×日次×種別の予算配分。月次予算からロジック展開後に保存、UI で個別修正可'
);

-- 主キー相当の一意性は MERGE 文側で (date, platform, ad_type) を ON 条件にして担保する
-- (BQ は PRIMARY KEY を強制しないため、API 側で重複を防ぐ)
