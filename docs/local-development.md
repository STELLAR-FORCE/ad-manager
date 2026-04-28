# ローカル開発セットアップ

このドキュメントは ad-manager をローカルで動かすときに最低限必要な設定をまとめています。本番（Vercel）の認証は OIDC + Workload Identity Federation ですが、ローカル開発ではサービスアカウント鍵を使います。

## 1. 必要なツール

- Node.js（プロジェクトの `package.json` engines を参照）
- gcloud CLI（鍵作成のため）
- Vercel への GCP プロジェクト `stellarforce-bi` への閲覧権限

## 2. BigQuery 認証

### 推奨: サービスアカウント鍵（再ログイン不要）

`ad-manager-web@stellarforce-bi` は本番でも使われている読み取り専用 SA（`bigquery.dataViewer` + `bigquery.jobUser`）。ここに JSON 鍵を発行してローカルから利用します。

**a. 鍵作成権限を一時的に自分に付与**

```bash
gcloud projects add-iam-policy-binding stellarforce-bi \
  --member=user:<your-account>@stellarforce.com \
  --role=roles/iam.serviceAccountKeyAdmin
```

> `roles/resourcemanager.projectIamAdmin` を持っているメンバーは自己付与可能。持っていない場合は `k.keii@stellarforce.com`（Owner）に依頼。

**b. 鍵を発行**

```bash
SA=ad-manager-web@stellarforce-bi.iam.gserviceaccount.com
gcloud iam service-accounts keys create ~/.config/gcloud/ad-manager-web.json \
  --iam-account=$SA
```

**c. `.env` に鍵パスを書く**

```dotenv
GOOGLE_APPLICATION_CREDENTIALS="/Users/<you>/.config/gcloud/ad-manager-web.json"
```

`.env` は `.gitignore` で除外済み。鍵ファイル本体もリポジトリ外（`~/.config/gcloud/`）に置くこと。

**d.（任意）鍵作成権限を剥奪**

```bash
gcloud projects remove-iam-policy-binding stellarforce-bi \
  --member=user:<your-account>@stellarforce.com \
  --role=roles/iam.serviceAccountKeyAdmin
```

剥奪しても発行済み鍵は有効なまま。鍵を失効させたい場合は `gcloud iam service-accounts keys delete` を使う。

### 代替: ADC（Application Default Credentials）

org の再認証ポリシーで定期的に切れるが、鍵を発行できない場合の選択肢。

```bash
gcloud auth application-default login
```

`.env` から `GOOGLE_APPLICATION_CREDENTIALS` を削除すれば ADC にフォールバックする。

## 3. 環境変数

`.env` に以下を設定（鍵パス以外は固定値で OK）。

| 変数 | 値 | 用途 |
|---|---|---|
| `GCP_PROJECT_ID` | `stellarforce-bi` | GCP プロジェクト |
| `BQ_DATASET` | `ad_manager` | 広告データセット |
| `BQ_SFDC_DATASET` | `staging` | Salesforce データセット |
| `BQ_LOCATION` | `asia-northeast1` | BQ リージョン |
| `GOOGLE_APPLICATION_CREDENTIALS` | 鍵ファイルの絶対パス | SA 鍵認証 |
| `NEXTAUTH_SECRET` | ランダム文字列 | NextAuth セッション |
| `NEXTAUTH_URL` | `http://localhost:3000` | OAuth コールバック |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth 資格情報 | Google ログイン |
| `ALLOWED_EMAIL_DOMAIN` | `stellarforce.com` | ログインドメイン制限 |
| `DATABASE_URL` | `file:./dev.db` | Prisma SQLite |

## 4. 起動

```bash
npm install
npm run dev
```

`http://localhost:3000/dashboard` で本番と同じ BigQuery を参照したダッシュボードが開く。

## 5. トラブルシュート

| 症状 | 原因 | 対処 |
|---|---|---|
| `OIDC token not available` | WIF env var が中途半端に設定されている | `GCP_WORKLOAD_IDENTITY_AUDIENCE` / `GCP_SERVICE_ACCOUNT` を `.env` から削除 |
| `Permission 'bigquery.jobs.create' denied` | SA に `bigquery.jobUser` が無い | GCP コンソールで SA に付与 |
| `Could not load the default credentials` | 鍵パスが間違い or 期限切れ ADC | `.env` の `GOOGLE_APPLICATION_CREDENTIALS` を確認、もしくは ADC 再ログイン |
| Salesforce タブだけ空 / エラー | SA が SFDC データセット (`staging`) にアクセス権なし | `BQ_SFDC_DATASET` のデータセットに `roles/bigquery.dataViewer` を SA に付与 |
