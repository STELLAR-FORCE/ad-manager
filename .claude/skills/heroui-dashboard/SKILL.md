---
name: heroui-dashboard
description: HeroUI v3 (@heroui/react) のコンポーネント実装ガイド。このプロジェクト（ad-manager）で使用する Meter・ProgressCircle・Chip の正確な API とパターンを提供する。HeroUI コンポーネントを使うとき、指標の可視化（予算バー・進捗円・ステータスチップ）を実装するとき、または「HeroUI」「@heroui/react」と言及されたときは必ずこのスキルを参照すること。MCP なしで正確な v3 API を使えるようにする。
---

# HeroUI v3 実装ガイド（ad-manager 専用）

## 重要：v3 の破壊的変更

HeroUI v3 はコンパウンドコンポーネントパターンを採用。v2 の単一コンポーネントとは別物。

```tsx
// ❌ v2 スタイル（使わない）
<Progress value={60} color="success" />

// ✅ v3 スタイル
<Meter value={60} color="success">
  <Meter.Track><Meter.Fill /></Meter.Track>
</Meter>
```

## インポート

```tsx
import { Meter, Label, ProgressCircle, Chip } from '@heroui/react';
```

---

## Meter（予算バー・使用率など）

### 基本構造

```tsx
<Meter value={75} color="warning">
  <Label>Google 予算</Label>
  <Meter.Output />         {/* "75%" などの数値テキスト */}
  <Meter.Track>
    <Meter.Fill />
  </Meter.Track>
</Meter>
```

### Props

| Prop | 型 | デフォルト | 説明 |
|------|----|-----------|------|
| `value` | `number` | `0` | 現在値 |
| `minValue` | `number` | `0` | 最小値 |
| `maxValue` | `number` | `100` | 最大値 |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | バーの太さ |
| `color` | `"default" \| "accent" \| "success" \| "warning" \| "danger"` | `"accent"` | 色 |
| `formatOptions` | `Intl.NumberFormatOptions` | `{style:'percent'}` | 数値フォーマット |

### 使用パターン（このプロジェクト）

```tsx
// 予算使用率バー
<Meter
  value={utilization * 100}
  maxValue={100}
  color={utilization > 0.9 ? 'danger' : utilization > 0.7 ? 'warning' : 'success'}
  className="w-full"
>
  <Label>{label}</Label>
  <Meter.Output />
  <Meter.Track>
    <Meter.Fill />
  </Meter.Track>
</Meter>

// ラベルなし（aria-label 必須）
<Meter aria-label="使用率" value={60} className="w-full">
  <Meter.Track>
    <Meter.Fill />
  </Meter.Track>
</Meter>

// 金額フォーマット
<Meter
  value={750000}
  maxValue={1000000}
  formatOptions={{ style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }}
>
  <Label>費用</Label>
  <Meter.Output />
  <Meter.Track><Meter.Fill /></Meter.Track>
</Meter>
```

---

## ProgressCircle（円形進捗）

### 基本構造

```tsx
<ProgressCircle aria-label="読み込み中" value={60}>
  <ProgressCircle.Track>
    <ProgressCircle.TrackCircle />
    <ProgressCircle.FillCircle />
  </ProgressCircle.Track>
</ProgressCircle>
```

### Props

| Prop | 型 | デフォルト | 説明 |
|------|----|-----------|------|
| `value` | `number` | `0` | 現在値（0-100） |
| `isIndeterminate` | `boolean` | `false` | 不定進捗（スピナー） |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | サイズ |
| `color` | `"default" \| "accent" \| "success" \| "warning" \| "danger"` | `"accent"` | 色 |

### 使用パターン

```tsx
// 決定値（達成率など）
<ProgressCircle value={utilization * 100} color="success" size="lg">
  <ProgressCircle.Track>
    <ProgressCircle.TrackCircle />
    <ProgressCircle.FillCircle />
  </ProgressCircle.Track>
</ProgressCircle>

// ローディングスピナー
<ProgressCircle isIndeterminate aria-label="読み込み中" size="sm">
  <ProgressCircle.Track>
    <ProgressCircle.TrackCircle />
    <ProgressCircle.FillCircle />
  </ProgressCircle.Track>
</ProgressCircle>

// ストローク幅カスタム
<ProgressCircle value={60}>
  <ProgressCircle.Track strokeWidth={2} viewBox="0 0 36 36">
    <ProgressCircle.TrackCircle cx={18} cy={18} r={17} strokeWidth={2} />
    <ProgressCircle.FillCircle cx={18} cy={18} r={17} strokeWidth={2} />
  </ProgressCircle.Track>
</ProgressCircle>
```

---

## Chip（ステータス・ラベル）

### 基本構造

```tsx
// プレーンテキストは自動で Chip.Label にラップされる
<Chip>デフォルト</Chip>
<Chip color="success">有効</Chip>

// アイコンと組み合わせる場合は明示的に Chip.Label を使う
<Chip color="success" variant="soft">
  <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
  <Chip.Label>Google</Chip.Label>
</Chip>
```

### Props

| Prop | 型 | デフォルト | 説明 |
|------|----|-----------|------|
| `color` | `"default" \| "accent" \| "success" \| "warning" \| "danger"` | `"default"` | 色 |
| `variant` | `"primary" \| "secondary" \| "tertiary" \| "soft"` | `"secondary"` | スタイル |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | サイズ |

### variant の使い分け

- `primary` — 塗り潰し（目立たせたい）
- `secondary` — ボーダーあり（デフォルト）
- `soft` — 薄い背景（控えめ）
- `tertiary` — 透明背景（最も控えめ）

### 使用パターン（このプロジェクト）

```tsx
// 媒体名チップ（カラードット付き）
<Chip size="sm" variant="soft" className="gap-1.5 font-semibold">
  <span
    className="w-2 h-2 rounded-full shrink-0"
    style={{ backgroundColor: PLATFORM_COLORS[platform] }}
    aria-hidden="true"
  />
  <Chip.Label>{PLATFORM_LABELS[platform]}</Chip.Label>
</Chip>

// ステータスチップ
<Chip color="success" variant="soft" size="sm">有効</Chip>
<Chip color="warning" variant="soft" size="sm">一時停止</Chip>
<Chip color="danger" variant="soft" size="sm">終了</Chip>
```

---

## Label

テキストラベル。Meter・ProgressCircle と組み合わせて使う。

```tsx
import { Label } from '@heroui/react';

<Label>ストレージ</Label>
<Label className="text-sm font-medium text-muted-foreground">予算</Label>
```
