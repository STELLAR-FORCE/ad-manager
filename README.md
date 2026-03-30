# Ad Manager

Google / Yahoo! / Bing の広告パフォーマンスを一元管理するツールです。

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router) + TypeScript
- **スタイリング**: Tailwind CSS + shadcn/ui（New Yorkスタイル）
- **DB**: Prisma 7 + SQLite（開発）→ Supabase（本番予定）
- **トースト通知**: Sonner

## 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開いてください。

## 主な機能（実装予定含む）

| 画面 | 説明 | 状態 |
|------|------|------|
| ダッシュボード | 直近7日間のKPIサマリー・媒体別実績 | ✅ 完了 |
| キャンペーン | 一覧・登録・編集・削除 | ✅ 完了 |
| 予算管理 | 媒体・キャンペーン別の予算 vs 実績 | 🔜 未実装 |
| クリエイティブ | 広告クリエイティブの管理・変更履歴 | 🔜 未実装 |
| 検索語句分析 | 除外キーワード候補の分析 | 🔜 未実装 |
| データ同期 | 広告APIからの自動・手動データ取得 | 🔜 未実装 |
| AIアドバイザー | Claude APIを使った改善提案 | 🔜 未実装 |

## 詳細な進捗

[PROGRESS.md](./PROGRESS.md) を参照してください。
