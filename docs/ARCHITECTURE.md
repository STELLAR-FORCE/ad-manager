# ダッシュボードへのデータ反映の仕組み

ad-manager のダッシュボード（`/dashboard`）に表示される数値は、すべて BigQuery に蓄積された広告実績データを元にしています。このドキュメントでは、広告プラットフォームから UI に数値が届くまでの全体像と、各レイヤーの役割を順番に説明します。

## 全体像

```
┌────────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌──────────────────┐    ┌──────────────┐
│ Google Ads API     │    │ ETL            │    │ BigQuery       │    │ Next.js API      │    │ Dashboard UI │
│ Yahoo!広告 API     │───▶│ (Python, Cloud │───▶│ stellarforce-bi│───▶│ /api/dashboard/* │───▶│ /dashboard   │
│ Microsoft Ads API  │    │  Run Jobs)     │    │ .ad_manager    │    │ (Route Handlers) │    │              │
└────────────────────┘    └────────────────┘    └────────────────┘    └──────────────────┘    └──────────────┘
                          毎日 06:00 JST                              Vercel OIDC → WIF       React + shadcn/ui
                                                                      で BQ を読み取り
```

大きく分けて 4 層です。

1. **取得層（ETL）**: 3 社の広告 API から実績データを取得して BigQuery に書き込みます
2. **保管層（BigQuery）**: 日次で増える実績を、パーティション分割済みのテーブルに蓄積します
3. **配信層（Next.js API）**: UI からのリクエストに応じて BigQuery を SQL で集計し、JSON を返します
4. **表示層（Dashboard UI）**: 3 本の API を並列で叩き、カード／ファネル／トレンドグラフに描画します

---

## 1. 取得層（ETL）

### 場所

`etl/` ディレクトリ。Python 実装です。

- エントリポイント: `etl/src/main.py`
- プラットフォームクライアント: `etl/src/platforms/{google_ads,yahoo_ads,bing_ads}.py`
- BigQuery クライアント: `etl/src/bigquery/client.py`
- テーブルスキーマ定義: `etl/src/bigquery/table_schemas.py`

### 何をしているか

`main.py` は各プラットフォームに対して、以下を順番に実行します。

1. OAuth トークンで認証
2. キャンペーン → 広告グループ → 広告 → キーワード の順にメタデータを取得
3. 日次指標（`fetch_daily_metrics`）を取得
4. 検索語句レポートを取得
5. キャンペーン月予算と当月コストから `adm_budget_logs` を生成

取得したレコードは `BigQueryClient.upsert()` を通じて BigQuery に書き込まれます。1 社が失敗しても他社は続行し、全社失敗時のみ exit code 1 で終了します。

### upsert の仕組み

追記ではなく **MERGE 方式** を使っています。

1. 一時ステージングテーブルに `load_table_from_json` でロード
2. 本番テーブルに対して `MERGE` を実行（キー一致なら UPDATE、なければ INSERT）
3. ステージングテーブルを削除

マージキーはテーブルごとに定義されています（例: `adm_daily_metrics` は `(date, campaign_id, platform)`）。これにより、同じ日を何度再同期しても重複が生まれません。

### デプロイ・スケジュール

- Docker イメージ: `etl/Dockerfile`
- デプロイ: `etl/scripts/deploy.sh`（Cloud Run Jobs + Artifact Registry）
- スケジュール: Cloud Scheduler（`0 6 * * *` Asia/Tokyo、毎日 AM 6:00 JST）
- サービスアカウント: `ad-manager-etl@stellarforce-bi.iam.gserviceaccount.com`
- シークレット: Secret Manager 経由（OAuth クライアント ID/Secret、Developer Token など）

`sync_days_back` 環境変数で、何日分遡って取得するかを制御できます。デフォルトは 30 日。直近のデータは後日確定値に更新されることがあるため、毎日少し広めに取り直して MERGE で上書きする設計です。

---

## 2. 保管層（BigQuery）

### プロジェクト / データセット

- GCP プロジェクト: `stellarforce-bi`
- データセット: `ad_manager`
- ロケーション: `asia-northeast1`

### テーブル一覧

| テーブル名 | 用途 | マージキー | パーティション | クラスタリング |
|---|---|---|---|---|
| `adm_campaigns` | キャンペーンのメタ情報（名前・予算・ステータスなど） | `(id, platform)` | なし | なし |
| `adm_ad_groups` | 広告グループのメタ情報と指標 | `(id, campaign_id)` | なし | なし |
| `adm_ads` | 広告のメタ情報と指標 | `(id, ad_group_id)` | なし | なし |
| `adm_keywords` | キーワードのメタ情報と指標 | `(id, ad_group_id)` | なし | なし |
| `adm_daily_metrics` | 日次のインプレッション・クリック・費用・CV | `(date, campaign_id, platform)` | `date`（DAY） | `platform, campaign_id` |
| `adm_search_term_reports` | 検索語句レポート | `(date, campaign_id, search_term, platform)` | `date`（DAY） | `platform, campaign_id` |
| `adm_budget_logs` | 月予算と当月消化額 | `(campaign_id, month)` | なし | なし |
| `adm_sync_logs` | 同期ジョブの実行履歴（MERGE ではなく INSERT 追記） | ― | なし | なし |

### ダッシュボードが主に読むのは 2 つ

- **`adm_daily_metrics`**: 指標（KPI・ファネル・トレンドグラフ）の元データ
- **`adm_campaigns`**: 予算・広告種別（`ad_type`）でのフィルタ／集計

日次で行数が増えるのは `adm_daily_metrics` と `adm_search_term_reports` で、どちらも `date` で DAY パーティションを切っているため、期間絞り込みが高速です。

---

## 3. 配信層（Next.js API）

### BigQuery 接続

`lib/bigquery.ts` が唯一の BigQuery クライアント生成地点です。Vercel 上では以下のフローで認証します。

1. Vercel Functions のリクエストヘッダー `x-vercel-oidc-token` から OIDC JWT を取得
2. Google STS にトークン交換（Workload Identity Federation）
3. サービスアカウント `ad-manager-web@stellarforce-bi.iam.gserviceaccount.com` に impersonation
4. 短命アクセストークンで BigQuery に対してクエリを実行

サービスアカウントに付与されているロール:

- `roles/bigquery.dataViewer`
- `roles/bigquery.jobUser`

ローカル開発時は `vercel env pull` で `VERCEL_OIDC_TOKEN` を環境変数に入れておけば同じ経路で接続できます。詳細は `memory/project_vercel_deploy_status.md` も参照してください。

### Route Handlers

ダッシュボードが叩く API は 3 本です。

#### `GET /api/dashboard/summary`

- ファイル: `app/api/dashboard/summary/route.ts`
- クエリパラメータ: `start`, `end`, `platform`, `adType`, `compareStart?`, `compareEnd?`
- 返り値: `{ platform, current, previous, byPlatform[] }`

やっていること:

1. `adm_daily_metrics` を期間で絞り込み、プラットフォームごとに `SUM` で集計
2. `adType` 指定があれば `adm_campaigns` を JOIN してキャンペーン種別で絞り込み
3. 現在期間と前期間（比較期間が指定されていなければ `start-end` の日数だけ前にずらす）を並列クエリ
4. CTR / CPC / CPA / CVR は SQL では計算せず、TypeScript 側で `aggregateMetrics` が総和から算出

SQL の骨格:

```sql
SELECT m.platform, SUM(m.impressions), SUM(m.clicks), SUM(m.cost), SUM(m.conversions)
FROM `stellarforce-bi.ad_manager.adm_daily_metrics` m
[JOIN adm_campaigns c ON c.id = m.campaign_id AND c.platform = m.platform]
WHERE m.date BETWEEN DATE(@start) AND DATE(@end)
  [AND m.platform = @platform]
  [AND c.ad_type = @adType]
GROUP BY m.platform
```

#### `GET /api/dashboard/trend`

- ファイル: `app/api/dashboard/trend/route.ts`
- クエリパラメータ: `start`, `end`, `platform`
- 返り値: 日付ごとに `{ date, google, yahoo, bing, cost, conversions, cpa, <platform>_cv, <platform>_cpa }` の配列

やっていること:

1. `adm_daily_metrics` を日付 × プラットフォームで `GROUP BY` して費用と CV を集計
2. TypeScript 側で `Map<date, {…}>` に詰め替え、媒体別の費用・CV・CPA を同じ日付の 1 行にまとめる

#### `GET /api/dashboard/budget-usage`

- ファイル: `app/api/dashboard/budget-usage/route.ts`
- 返り値: `{ totalBudget, totalSpent, utilization?, byPlatform[] }`

やっていること:

1. `adm_campaigns` から `status != 'ended'` なキャンペーンの `monthly_budget` をプラットフォーム別に合計
2. `adm_daily_metrics` から当月（`DATE_TRUNC(date, MONTH)` 以降）のコストをプラットフォーム別に合計
3. 予算と消化額から `utilization = spent / budget` を算出

### 認証ゲート

`proxy.ts`（Next.js 16 では middleware が proxy に改名）が NextAuth の `withAuth` を使い、`@stellarforce.com` ドメイン以外のユーザーを `/login` にリダイレクトします。API ルート（`/api/auth` 以外）も同じ matcher で保護されます。

---

## 4. 表示層（Dashboard UI）

### ファイル

- `app/dashboard/page.tsx`: ダッシュボードのメインコンポーネント
- `components/dashboard/funnel-flow.tsx`: 表示 → クリック → CV のファネル
- `components/animate-ui/counting-number.tsx`: カウントアップアニメーション

### 動き

1. 期間・プラットフォーム・広告種別が変わるたびに `fetchData()` が走る
2. `/api/dashboard/summary`, `/api/dashboard/trend`, `/api/dashboard/budget-usage` を並列で fetch（比較期間が有効なら trend をもう 1 本追加）
3. `Promise.all` で全レスポンスが揃ってから state を更新
4. 取得失敗時は state を `null` にし、空配列にフォールバック

### モックフォールバック

`app/dashboard/page.tsx:594` で以下の判定をしています。

```ts
const isMock = !summary?.current.impressions;
```

インプレッションが 0 のとき、`components/campaign-mock-data.ts` のモックを表示し、ファネルやカードには「サンプル」バッジが出ます。BQ に当期間のデータが入っていない場合や認証失敗時の UX 保険です。トレンドグラフだけは別ルートで `getMockTrendData(dateRange.main)` にフォールバックするため、BQ 接続が切れていてもグラフが日付に合わせて動くように見えることがあります（ここは将来的に統一したいポイント）。

### 数値のフォーマット

プロジェクト方針に従い、数値表示はすべて `Intl.NumberFormat('ja-JP', …)` を使います（通貨は `JPY`、パーセントは `percent`）。テーブルセルや統計値には `tabular-nums` を付けて桁ぞろえをしています。

---

## 環境変数まとめ

Vercel Production で必要な環境変数です。

| 変数 | 用途 |
|---|---|
| `NEXTAUTH_SECRET` | NextAuth セッション署名 |
| `NEXTAUTH_URL` | `https://ad-manager-lvtl.vercel.app` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth（ユーザーログイン） |
| `ALLOWED_EMAIL_DOMAIN` | `stellarforce.com` |
| `GCP_PROJECT_ID` | `stellarforce-bi` |
| `BQ_DATASET` | `ad_manager` |
| `BQ_LOCATION` | `asia-northeast1` |
| `GCP_WORKLOAD_IDENTITY_AUDIENCE` | WIF Provider のフル ID |
| `GCP_SERVICE_ACCOUNT` | `ad-manager-web@stellarforce-bi.iam.gserviceaccount.com` |

ETL 側（Cloud Run Jobs）は Secret Manager 経由で OAuth 資格情報と Developer Token を受け取ります（`etl/scripts/setup_secrets.sh` 参照）。

---

## トラブルシュート早見表

| 症状 | 最初に見るところ |
|---|---|
| ダッシュボードに「サンプル」バッジが出る | `/api/dashboard/summary` のレスポンスで `current.impressions` が 0 か。Vercel ログで BQ クエリが失敗していないか |
| `VERCEL_OIDC_TOKEN is not available` | `lib/bigquery.ts` がリクエストヘッダーからトークンを取れているか。ビルド時のみ env、ランタイムは `x-vercel-oidc-token` ヘッダー |
| `IAM Service Account Credentials API has not been used` | GCP Console で `iamcredentials.googleapis.com` を Enable する |
| 数値が前日で止まっている | Cloud Run Jobs `ad-manager-etl` の実行ログ（Cloud Logging）と `adm_sync_logs` を確認 |
| 期間を変えても数字が変わらない | `/api/dashboard/summary?start=…&end=…` を直接叩いてレスポンスを確認。500 なら BQ 認証、空なら期間にデータがない |
