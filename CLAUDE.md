@AGENTS.md

# デザイン・UIガイドライン

UIコードを書く・修正するたびに以下を必ず守ること。

- **コンポーネントライブラリ**: shadcn/ui（New Yorkスタイル）のベストプラクティスに従う
- **アニメーション・インタラクション**: [Animate UI](https://animate-ui.com) のパターンを参考にする
- アイコンのみのボタンには `aria-label` を付ける。装飾アイコンには `aria-hidden="true"` を付ける。`<label>` は `htmlFor` でInputと紐付ける
- 数値・通貨・パーセントのフォーマットは必ず `Intl.NumberFormat('ja-JP', ...)` を使う（`toLocaleString()` をロケール未指定で使わない）
- 数値を表示するテーブルセル・統計値には `tabular-nums` を付ける
- UIテキストの省略は `...` ではなく `…`（U+2026）を使う
