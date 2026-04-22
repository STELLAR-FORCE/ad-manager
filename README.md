# Ad Manager

Google / Yahoo! / Bing の広告パフォーマンスを一元管理するツールです。

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router) + TypeScript
- **スタイリング**: Tailwind CSS + shadcn/ui（New Yorkスタイル）+ HeroUI v3 + Animate UI
- **データソース**: BigQuery（`stellarforce-bi.ad_manager`、`asia-northeast1`）
- **ETL**: Python（`etl/`）。Cloud Run Jobs で毎日 06:00 JST に自動実行
- **認証**: NextAuth (Google OAuth) + Vercel OIDC → GCP Workload Identity Federation
- **ホスティング**: Vercel（`ad-manager-lvtl.vercel.app`）
- **トースト通知**: Sonner

## データフロー

ダッシュボードに数値が表示されるまでの仕組み（広告 API → ETL → BigQuery → Next.js API → UI）は [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) に詳しく書いています。

## 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開いてください。

## 主な機能

| 画面 | 説明 | 状態 |
|------|------|------|
| ダッシュボード | KPIサマリー・ファネルフロー・種別フィルター・媒体別実績 | ✅ UI完了 |
| キャンペーン | 一覧（媒体・種別・ステータスフィルター） | ✅ UI完了 |
| 広告グループ（ドリルダウン） | キャンペーン配下の広告グループ一覧 | ✅ UI完了 |
| 広告グループ詳細 | 広告・キーワード・クリエイティブのタブ表示 | ✅ UI完了 |
| 広告グループ（横断） | 全キャンペーン横断の広告グループ一覧 | ✅ UI完了 |
| 広告（横断） | 全キャンペーン横断の広告一覧 | ✅ UI完了 |
| キーワード（横断） | 全検索キャンペーン横断のキーワード一覧 | ✅ UI完了 |
| 予算管理 | 媒体・キャンペーン別の予算 vs 実績 | 🔧 UI のみ |
| クリエイティブ | 広告クリエイティブの管理・変更履歴 | 🔧 UI のみ |
| 検索語句分析 | 除外キーワード候補の分析 | 🔧 UI のみ |
| 変更履歴 | キャンペーン・クリエイティブの変更ログ | 🔧 UI のみ |
| データ同期 | 広告APIからの自動・手動データ取得 | 🔜 API未連携 |
| AIアドバイザー | Claude APIを使った改善提案 | 🔜 API未連携 |

## 詳細な進捗

[PROGRESS.md](./PROGRESS.md) を参照してください。
