# Ad Manager 進捗メモ

## 現在の状態（2026-04-15）

### 完了済み
- [x] Next.js 16 + TypeScript + Tailwind プロジェクト作成
- [x] Prisma 7 + SQLite（ローカル）セットアップ
- [x] shadcn/ui コンポーネント追加（card, table, badge, input, select, dialog, sheet, tabs, sidebar）
- [x] DBスキーマ定義・マイグレーション済み（`prisma/dev.db` が存在する）
- [x] サイドバー付きレイアウト（`components/layout/`）
- [x] ダッシュボード画面（`app/dashboard/page.tsx`）
  - 期間・媒体切り替えプルダウン
  - ファネルフロー（表示→クリック→CV）
  - KPIカード（前週比・目標値・CVR）
  - 予算消化率バー・データ鮮度タイムスタンプ・異常値バナー
  - CPAトレンドチャート（Recharts）
- [x] ダッシュボードAPI（summary / trend / budget-usage）
- [x] サイドバーリデザイン（セクション分け・媒体接続ステータス）
- [x] キャンペーン一覧・登録画面（`app/campaigns/page.tsx`）
- [x] キャンペーンAPI（`app/api/campaigns/route.ts` / `[id]/route.ts`）
- [x] 予算管理画面（`app/budget/page.tsx`）・API
- [x] クリエイティブ管理画面（`app/creatives/page.tsx`）・API
- [x] 変更履歴画面（`app/history/page.tsx`）・API
- [x] 検索語句分析画面（`app/search-terms/page.tsx`）・API
- [x] データ同期画面（`app/sync/page.tsx`）・API
- [x] AIアドバイザー画面（`app/ai-advisor/page.tsx`）・API
- [x] Badge カスタムバリアント追加（success / warning / info / size="sm"）
- [x] キャンペーン画面にモックデータ fallback 追加（青バナー・Skeleton・fmtNum 統一）
- [x] キャンペーン階層ドリルダウンUI（Issue #8）
  - キャンペーン → 広告グループ一覧（`app/campaigns/[id]/page.tsx`）
  - 広告グループ詳細（`app/campaigns/[id]/[adGroupId]/page.tsx`）
    - 検索: 広告テーブル（RSA見出し・説明文）+ キーワードテーブル（マッチタイプ・品質スコア・IS）
    - ディスプレイ: 広告テーブル + クリエイティブギャラリー（カード形式）
  - パンくずナビゲーション（shadcn/ui breadcrumb）
  - Google / Yahoo! / Bing × 検索 / ディスプレイの実CSVデータからモックデータ構築（`lib/campaign-mock-data.ts`）
- [x] クロスキャンペーンのフラット一覧ページ
  - 広告グループ一覧（`app/ad-groups/page.tsx`）— 媒体・種別・キャンペーンフィルター
  - 広告一覧（`app/ads/page.tsx`）— 媒体・種別フィルター、親キャンペーン・広告グループ表示
  - キーワード一覧（`app/keywords/page.tsx`）— 媒体フィルター、品質スコア・マッチタイプ表示
  - サイドバーに3メニュー追加（広告グループ・広告・キーワード）
- [x] ファネルフロー刷新（Issue #5）
  - SVG台形 → ベジェ曲線グラデーションのエリアチャート風デザイン
  - ホバーでセクションハイライト＋詳細ツールチップ
  - CTR/CVR を指標の間に配置、数字サイズ統一
- [x] ダッシュボード キャンペーン種別フィルタ（Issue #9）
  - 「検索 / ディスプレイ / すべて」の種別セレクター追加
  - 固定モックデータ → `campaign-mock-data.ts` の実データから動的集計に変更
  - API（`/api/dashboard/summary`）も adType パラメータ対応
- [x] サイドバー折りたたみ機能
  - アイコンのみモードへのトグル（`PanelLeftClose` / `PanelLeftOpen`）
  - localStorage で状態永続化、ページ遷移時のフラッシュ防止
  - `overflow-hidden` + `opacity` トランジションで滑らかなアニメーション
- [x] shadcn/UI 品質改善（HIGH）
  - `cn()` を `@/lib/utils` に統一（dashboard）
  - Sidebar のハードコードカラーを CSS 変数（sidebar-*）に置き換え
  - Badge に `size` variant 追加・Sidebar の BETA バッジを対応

### ページ構成
| パス | 内容 |
|------|------|
| `/dashboard` | KPIサマリー・媒体別実績 |
| `/campaigns` | キャンペーン一覧（媒体・種別・ステータスフィルター） |
| `/campaigns/[id]` | 広告グループ一覧（ドリルダウン） |
| `/campaigns/[id]/[adGroupId]` | 広告グループ詳細（広告・キーワード・クリエイティブタブ） |
| `/ad-groups` | 全キャンペーン横断 広告グループ一覧 |
| `/ads` | 全キャンペーン横断 広告一覧 |
| `/keywords` | 全検索キャンペーン横断 キーワード一覧 |
| `/creatives` | クリエイティブ管理 |
| `/budget` | 予算管理 |
| `/search-terms` | 検索語句分析 |
| `/history` | 変更履歴 |
| `/sync` | データ同期 |
| `/ai-advisor` | AIアドバイザー |

### DBスキーマの内容（`prisma/schema.prisma`）
- `Campaign` - キャンペーン（媒体・広告種別・予算）
- `AdGroup` - 広告グループ
- `Creative` - クリエイティブ（広告テキスト・画像）
- `CreativeHistory` - クリエイティブ変更履歴（誰がいつ何を変えたか）
- `DailyMetric` - 日次パフォーマンス（impressions, clicks, cost, CV, CPA, CTR）
- `BudgetLog` - 予算変更履歴
- `SearchTermReport` - 検索語句レポート（除外キーワード分析用）
- `SyncLog` - データ同期ログ

---

## ETLパイプライン 進捗（Issue #11）

### 概要
Google Ads / Yahoo!広告 / Bing Ads → BigQuery へデータを同期する Python ETL パイプライン。
コードは `etl/` ディレクトリ。Python 3.12、pydantic-settings、httpx、google-ads SDK、bingads SDK を使用。

### フェーズ進捗
- [x] フェーズ1: 骨格 + Google Ads クライアント
- [x] フェーズ2: Yahoo!広告クライアント
- [x] フェーズ3: Bing Ads クライアント
- [ ] フェーズ4: 本番デプロイ ← **作業中**

### フェーズ4 タスク進捗（2026-04-15 時点）
- [x] gcloud CLI インストール＆GCP環境準備
- [x] BigQuery テーブル作成スクリプト（`etl/scripts/setup_bigquery.py`）
- [x] 広告API クレデンシャル取得・`.env` 設定
- [x] **Bing Ads ドライラン成功** — 全6レポート取得OK
- [x] **Yahoo! 検索広告ドライラン成功** — 全6レポート取得OK
- [ ] Yahoo! ディスプレイ広告 — v19 API 400 エラー（後述）
- [ ] Google Ads — 開発者トークン未承認（後述）
- [ ] Cloud Run ジョブへデプロイ（Issue #12 の API 有効化待ち）
- [ ] 監視・アラート設定

### ドライラン実行コマンド
```bash
cd /Users/stf59/Documents/GitHub/ad-manager/etl
source .venv/bin/activate
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
DRY_RUN=true SYNC_PLATFORM=yahoo python -m src.main  # Yahoo
DRY_RUN=true SYNC_PLATFORM=bing python -m src.main   # Bing
DRY_RUN=true SYNC_PLATFORM=google python -m src.main # Google（現状ブロック）
```

### ドライラン結果（2026-04-15）
| プラットフォーム | 状態 | キャンペーン | 広告グループ | 広告 | KW | 日次 | 検索語句 |
|---|---|---|---|---|---|---|---|
| Bing Ads | **成功** | 4 | 7 | 11 | 158 | 22 | 646 |
| Yahoo! 検索広告 | **成功** | 3 | 5 | 235 | 5,046 | 14 | 3,017 |
| Yahoo! ディスプレイ | 400エラー | - | - | - | - | - | - |
| Google Ads | ブロック | - | - | - | - | - | - |

### 残課題の詳細

#### 1. Yahoo! ディスプレイ広告 v19 API 400 エラー
- `https://ads-display.yahooapis.jp/api/v19/ReportDefinitionService/add` が 400 を返す
- 検索広告（v18）とはフィールド名が異なる可能性あり
- エラーレスポンスボディを確認して正しいフィールド名を特定する必要がある
- `_post()` メソッド（`etl/src/platforms/yahoo_ads.py`）で `response.raise_for_status()` する前にボディをログ出力するとデバッグ可能

#### 2. Google Ads 開発者トークン未承認
- エラー: `DEVELOPER_TOKEN_NOT_APPROVED`
- 現在の開発者トークン（`yO5EZdRX5WteuIfnQXgV7Q`）はテストアカウント専用
- Google Ads API の Basic/Standard access を申請する必要がある
- 申請は Google Ads の管理画面 → API Center から行う（手動作業）

#### 3. Cloud Run デプロイ（Issue #12）
- GCP API の有効化が必要（プロジェクト管理者権限）:
  - Cloud Run API
  - Secret Manager API
  - Cloud Scheduler API
  - Artifact Registry API
- サービスアカウント: `ad-manager-etl@stellarforce-bi.iam.gserviceaccount.com`（作成済み、BQロール付与済み）
- ユーザー（k.nakatomi@stellarforce.com）は `serviceusage.serviceUsageAdmin` 権限がないため、管理者に依頼が必要

### GCP / クレデンシャル情報
- GCPプロジェクト: `stellarforce-bi`
- BQデータセット: `ad_manager`（`asia-northeast1`）
- クレデンシャルはすべて `etl/.env` に記載済み（gitignore済み）
- gcloud ログイン済み: `k.nakatomi@stellarforce.com`
- ADC（Application Default Credentials）は未設定 → `etl/src/bigquery/client.py` の `_get_credentials()` で gcloud SDK 認証にフォールバック

---

## 次にやること（優先順）

### ETL パイプライン継続
1. Yahoo! ディスプレイ広告 v19 API のデバッグ・修正
2. Google Ads 開発者トークン申請状況確認
3. BQ テーブル作成スクリプト実行（`python -m scripts.setup_bigquery`）
4. DRY_RUN=false で実データ投入テスト
5. Cloud Run デプロイ（Issue #12 解決後）
6. 監視・アラート設定

### UI品質改善（MEDIUM）
- [ ] `Dialog` / `Sheet` のアニメーション duration を `100ms` → `200〜300ms` に延長
- [ ] `Skeleton` に stagger delay を追加（複数行ローダーをより自然に）
- [ ] リスト項目の cascade アニメーション（Animate UIパターン）
- [ ] ページ遷移時の motion 検討

### UI品質改善（LOW）
- [ ] `…`（U+2026）の省略記号を全ページで統一確認
- [ ] `data-*` attribute の命名規則を CLAUDE.md に追記

### 機能追加（今後）
- [ ] Claude API 連携（AIアドバイザーのチャット機能）
- [ ] 本番データソース移行（SQLite → BigQuery）— Issue #7

---

## 開発サーバーの起動方法

```bash
cd /Users/stf59/Documents/GitHub/ad-manager
npm run dev
# → http://localhost:3000 で確認
```

---

## 技術的な注意点

- **Prisma 7** を使用 → `@prisma/adapter-better-sqlite3` が必要（`lib/prisma.ts` 参照）
- **prisma.config.ts** にDB接続設定あり（`schema.prisma` には `url` を書かない）
- shadcn/ui は **New York スタイル**
- トースト通知は `sonner` を使う（`MainLayout` に `<Toaster />` 組み込み済み）
- Next.js 16 の Route Handler では `params` が Promise → `await params` が必要
- 本番データソースは BigQuery を予定（ETL/ELTツール or 自作パイプラインで広告APIからデータ取り込み）

## デザインガイドライン
- コンポーネント: shadcn/ui（New Yorkスタイル）
- アニメーション: Animate UI（https://animate-ui.com）参照
- 数値フォーマット: `Intl.NumberFormat('ja-JP', ...)`
- アクセシビリティ: aria属性・tabular-nums・`…` を適切に使う
