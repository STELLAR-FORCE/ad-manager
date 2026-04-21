@AGENTS.md

# デザイン・UIガイドライン

UIコードを書く・修正するたびに以下を必ず守ること。

- **コンポーネントライブラリ（構造UI）**: shadcn/ui（New Yorkスタイル）を使う。レイアウト・カード・テーブル・ダイアログ・フォームなど構造的なUIはすべて shadcn/ui で実装する
- **コンポーネントライブラリ（グラフ・指標UI）**: HeroUI v3（`@heroui/react`）を使う。ProgressBar・ProgressCircle・Meter・Chip など指標の可視化コンポーネントはすべて HeroUI で実装する。実装前に必ず MCP サーバー（`mcp__heroui-react__get_component_docs`）で最新 API を確認すること
- **アニメーション・インタラクション**: [Animate UI](https://animate-ui.com) を使う。実装前に必ず MCP サーバー（shadcn MCP の `@animate-ui` レジストリ）でコンポーネントを確認すること。インストールは `npx shadcn@latest add @animate-ui/<name>`
- アイコンのみのボタンには `aria-label` を付ける。装飾アイコンには `aria-hidden="true"` を付ける。`<label>` は `htmlFor` でInputと紐付ける
- 数値・通貨・パーセントのフォーマットは必ず `Intl.NumberFormat('ja-JP', ...)` を使う（`toLocaleString()` をロケール未指定で使わない）
- 数値を表示するテーブルセル・統計値には `tabular-nums` を付ける
- UIテキストの省略は `...` ではなく `…`（U+2026）を使う
