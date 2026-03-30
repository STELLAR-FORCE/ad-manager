# Ad Manager 進捗メモ

## 現在の状態（2026-03-27）

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
- [x] shadcn/UI 品質改善（HIGH）
  - `cn()` を `@/lib/utils` に統一（dashboard）
  - Sidebar のハードコードカラーを CSS 変数（sidebar-*）に置き換え
  - Badge に `size` variant 追加・Sidebar の BETA バッジを対応

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

## 次にやること

### UI品質改善（MEDIUM）
- [ ] `Dialog` / `Sheet` のアニメーション duration を `100ms` → `200〜300ms` に延長
- [ ] `Skeleton` に stagger delay を追加（複数行ローダーをより自然に）
- [ ] リスト項目の cascade アニメーション（Animate UIパターン）
- [ ] ページ遷移時の motion 検討

### UI品質改善（LOW）
- [ ] `…`（U+2026）の省略記号を全ページで統一確認
- [ ] `data-*` attribute の命名規則を CLAUDE.md に追記

### 機能追加（今後）
- [ ] Google Ads API / Yahoo! 広告 API / Bing Ads API 実連携
- [ ] Claude API 連携（AIアドバイザーのチャット機能）
- [ ] 本番DB移行（SQLite → Supabase）

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
- 本番移行時は SQLite → Supabase（Prisma の datasource を変えるだけ）

## デザインガイドライン
- コンポーネント: shadcn/ui（New Yorkスタイル）
- アニメーション: Animate UI（https://animate-ui.com）参照
- 数値フォーマット: `Intl.NumberFormat('ja-JP', ...)`
- アクセシビリティ: aria属性・tabular-nums・`…` を適切に使う
