---
name: shadcn-dashboard
description: shadcn/ui（New Yorkスタイル）コンポーネントの実装ガイド。このプロジェクト（ad-manager）で使用する Card・Badge・Button・Select・Table・Dialog・Skeleton などの正確な API とパターンを提供する。shadcn/ui コンポーネントを使うとき、UI レイアウト・フォーム・テーブル・ダイアログを実装するとき、または「shadcn」「@/components/ui」と言及されたときは必ずこのスキルを参照すること。MCP なしで正確なコンポーネント API を使えるようにする。
---

# shadcn/ui 実装ガイド（ad-manager 専用）

このプロジェクトは **shadcn/ui New York スタイル** + **Base UI** ベース。標準 shadcn と挙動が一部異なる。

## 共通インポートパス

```tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
```

---

## Card

```tsx
<Card>
  <CardHeader className="pb-3">
    <CardTitle className="text-base">タイトル</CardTitle>
    <CardDescription>説明文</CardDescription>
  </CardHeader>
  <CardContent>
    コンテンツ
  </CardContent>
</Card>
```

**よく使うパターン：**
```tsx
// ヘッダー右寄せボタン
<CardHeader className="pb-3">
  <CardTitle className="text-base flex items-center justify-between">
    タイトル
    <Button variant="ghost" size="icon-sm" aria-label="更新">
      <RefreshCw className="h-4 w-4" aria-hidden="true" />
    </Button>
  </CardTitle>
</CardHeader>

// バッジ付きタイトル
<CardTitle className="text-base flex items-center gap-2">
  タイトル
  <Badge variant="secondary" className="text-xs font-normal">サンプル</Badge>
</CardTitle>
```

---

## Badge

**variants:** `default` | `secondary` | `destructive` | `outline` | `ghost` | `link` | `success` | `warning` | `info`

**size:** `default` | `sm`

```tsx
<Badge variant="secondary">サンプル</Badge>
<Badge variant="success">有効</Badge>
<Badge variant="warning">一時停止</Badge>
<Badge variant="destructive">エラー</Badge>
<Badge variant="info">情報</Badge>
<Badge variant="outline">アウトライン</Badge>
```

---

## Button

**variants:** `default` | `outline` | `secondary` | `ghost` | `destructive` | `link`

**size:** `default` | `xs` | `sm` | `lg` | `icon` | `icon-xs` | `icon-sm` | `icon-lg`

```tsx
// 通常ボタン
<Button variant="outline" size="sm">キャンセル</Button>
<Button>保存</Button>

// アイコンのみ（aria-label 必須）
<Button variant="ghost" size="icon-sm" aria-label="更新">
  <RefreshCw className="h-4 w-4" aria-hidden="true" />
</Button>

// アイコン + テキスト
<Button variant="outline" size="sm">
  <Plus className="h-4 w-4" aria-hidden="true" />
  追加
</Button>
```

---

## Select

```tsx
<Select value={value} onValueChange={(v) => setValue(v)}>
  <SelectTrigger className="w-36">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">すべて</SelectItem>
    <SelectItem value="google">Google</SelectItem>
    <SelectItem value="yahoo">Yahoo!</SelectItem>
  </SelectContent>
</Select>
```

---

## Input

```tsx
// 基本
<Input
  id="budget"
  type="number"
  placeholder="0"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  className="w-32 tabular-nums"
/>

// label と紐付け（htmlFor 必須）
<label htmlFor="search" className="text-sm font-medium">検索</label>
<Input id="search" type="text" placeholder="キーワード…" />
```

---

## Table

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>キャンペーン名</TableHead>
      <TableHead className="text-right tabular-nums">費用</TableHead>
      <TableHead className="text-right tabular-nums">CV数</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {rows.map((row) => (
      <TableRow key={row.id}>
        <TableCell className="font-medium">{row.name}</TableCell>
        <TableCell className="text-right tabular-nums">
          {jpyFormat.format(row.cost)}
        </TableCell>
        <TableCell className="text-right tabular-nums">{row.conversions}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**注意：** 数値セルには必ず `tabular-nums` を付ける。

---

## Dialog

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>タイトル</DialogTitle>
      <DialogDescription>説明文</DialogDescription>
    </DialogHeader>

    {/* コンテンツ */}
    <div className="py-4">...</div>

    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">キャンセル</Button>
      </DialogClose>
      <Button onClick={handleSave}>保存</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// トリガーボタンで開く場合
<Dialog>
  <DialogTrigger asChild>
    <Button>開く</Button>
  </DialogTrigger>
  <DialogContent>...</DialogContent>
</Dialog>
```

---

## Skeleton（ローディング）

```tsx
// テキスト行
<Skeleton className="h-4 w-32" />

// カード全体のスケルトン
<Card>
  <CardHeader>
    <Skeleton className="h-5 w-24" />
  </CardHeader>
  <CardContent>
    <Skeleton className="h-32 w-full" />
  </CardContent>
</Card>

// テーブル行
{Array.from({ length: 5 }).map((_, i) => (
  <TableRow key={i}>
    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
  </TableRow>
))}
```

---

## Separator

```tsx
// 水平（デフォルト）
<Separator className="my-4" />

// 垂直
<Separator orientation="vertical" className="h-6" />
```

---

## Tooltip

```tsx
// TooltipProvider は layout.tsx で1回だけ設定済み
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon-sm" aria-label="詳細">
      <Info className="h-4 w-4" aria-hidden="true" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>補足説明</p>
  </TooltipContent>
</Tooltip>
```

---

## このプロジェクトの UI ルール

- アイコンのみのボタン → `aria-label` 必須
- 装飾アイコン → `aria-hidden="true"` 必須
- `<label>` は `htmlFor` で Input と紐付ける
- 数値・通貨は `Intl.NumberFormat('ja-JP', ...)` を使う（`toLocaleString()` 未指定NG）
- 数値テーブルセル・統計値 → `tabular-nums`
- 省略記号は `…`（U+2026）、`...` は使わない
