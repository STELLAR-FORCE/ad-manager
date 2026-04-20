'use client'

import { useEffect, useState, useRef } from 'react'
import { notify } from '@/lib/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InfoIcon, CheckIcon, XIcon } from 'lucide-react'
import { Meter } from '@heroui/react'
import { StatusChip } from '@/components/ui/status-chip'

const fmt = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n)

const fmtPct = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 1 }).format(n / 100)

interface CampaignBudget {
  id: string
  name: string
  platform: string
  adType: string
  status: string
  monthlyBudget: number
  spent: number
  remaining: number
  utilization: number
}

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google',
  yahoo: 'Yahoo!',
  bing: 'Bing',
}

const AD_TYPE_LABELS: Record<string, string> = {
  search: '検索',
  display: 'ディスプレイ',
}

const STATUS_LABELS: Record<string, string> = {
  active: '配信中',
  paused: '停止中',
  ended: '終了',
}

const MOCK_CAMPAIGNS: CampaignBudget[] = [
  { id: 'mock-1', name: 'ブランド訴求（検索）', platform: 'google', adType: 'search', status: 'active', monthlyBudget: 500000, spent: 420000, remaining: 80000, utilization: 84 },
  { id: 'mock-2', name: '新規顧客獲得', platform: 'google', adType: 'display', status: 'active', monthlyBudget: 300000, spent: 180000, remaining: 120000, utilization: 60 },
  { id: 'mock-3', name: '季節限定プロモーション', platform: 'yahoo', adType: 'search', status: 'active', monthlyBudget: 200000, spent: 185000, remaining: 15000, utilization: 92.5 },
  { id: 'mock-4', name: 'リターゲティング', platform: 'yahoo', adType: 'display', status: 'paused', monthlyBudget: 150000, spent: 45000, remaining: 105000, utilization: 30 },
  { id: 'mock-5', name: 'Bing 検索広告', platform: 'bing', adType: 'search', status: 'active', monthlyBudget: 100000, spent: 78000, remaining: 22000, utilization: 78 },
]

function generateMonthOptions() {
  const options: { value: string; label: string }[] = []
  const start = new Date('2026-01-01')
  const now = new Date('2026-03-27')
  const cur = new Date(start)
  while (cur <= now) {
    const value = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    const label = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(cur)
    options.push({ value, label })
    cur.setMonth(cur.getMonth() + 1)
  }
  return options.reverse()
}

export default function BudgetPage() {
  const [month, setMonth] = useState('2026-03')
  const [campaigns, setCampaigns] = useState<CampaignBudget[]>([])
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const monthOptions = generateMonthOptions()

  const fetchData = async (m: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/budget?month=${m}`)
      const data = await res.json()
      if (data.campaigns && data.campaigns.length > 0) {
        setCampaigns(data.campaigns)
        setIsMock(false)
      } else {
        setCampaigns(MOCK_CAMPAIGNS)
        setIsMock(true)
      }
    } catch {
      notify.error('データの取得に失敗しました')
      setCampaigns(MOCK_CAMPAIGNS)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(month)
  }, [month])

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editingId])

  const totalBudget = campaigns.reduce((s, c) => s + c.monthlyBudget, 0)
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0)
  const totalUtilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  const platformSummary = ['google', 'yahoo', 'bing'].map((p) => {
    const cs = campaigns.filter((c) => c.platform === p)
    const budget = cs.reduce((s, c) => s + c.monthlyBudget, 0)
    const spent = cs.reduce((s, c) => s + c.spent, 0)
    return { platform: p, budget, spent, utilization: budget > 0 ? (spent / budget) * 100 : 0 }
  })

  const startEdit = (c: CampaignBudget) => {
    setEditingId(c.id)
    setEditValue(String(c.monthlyBudget))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  const saveEdit = async (id: string) => {
    const val = parseFloat(editValue)
    if (isNaN(val) || val < 0) {
      notify.error('有効な金額を入力してください')
      return
    }
    try {
      const res = await fetch(`/api/budget/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyBudget: val }),
      })
      if (!res.ok) throw new Error()
      notify.success('予算を更新しました')
      cancelEdit()
      fetchData(month)
    } catch {
      notify.error('予算の更新に失敗しました')
    }
  }

  const utilizationMeterColor = (u: number): 'success' | 'warning' | 'danger' =>
    u > 100 ? 'danger' : u > 80 ? 'warning' : 'success'

  const utilizationBadge = (u: number): 'destructive' | 'warning' | 'success' =>
    u > 100 ? 'destructive' : u > 80 ? 'warning' : 'success'

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">予算管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">キャンペーン別の予算消化状況を管理します</p>
          </div>
          <Select value={month} onValueChange={(v) => setMonth(v ?? '')}>
            <SelectTrigger className="w-40" aria-label="表示月を選択">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mock banner */}
        {isMock && !loading && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
            <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>サンプルデータを表示しています。実データを追加するとここに反映されます。</span>
          </div>
        )}

        {/* Summary cards */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">当月総予算</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmt(totalBudget)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">当月総消化額</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmt(totalSpent)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">消化率</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmtPct(totalUtilization)}</p>
                <Meter
                  aria-label="総消化率"
                  value={Math.min(100, totalUtilization)}
                  maxValue={100}
                  color={utilizationMeterColor(totalUtilization)}
                  className="mt-2 w-full"
                >
                  <Meter.Track>
                    <Meter.Fill />
                  </Meter.Track>
                </Meter>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Platform bars */}
        {!loading && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">媒体別消化率</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {platformSummary.map(({ platform, budget, spent, utilization }) => (
                <div key={platform} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{PLATFORM_LABELS[platform]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmt(spent)} / {fmt(budget)}
                      <span className="ml-2 font-medium">{fmtPct(utilization)}</span>
                    </span>
                  </div>
                  <Meter
                    aria-label={`${PLATFORM_LABELS[platform]} 消化率`}
                    value={Math.min(100, utilization)}
                    maxValue={100}
                    color={utilizationMeterColor(utilization)}
                    className="w-full"
                  >
                    <Meter.Track>
                      <Meter.Fill />
                    </Meter.Track>
                  </Meter>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Campaign table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">キャンペーン別予算</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>キャンペーン名</TableHead>
                    <TableHead>媒体</TableHead>
                    <TableHead>広告種別</TableHead>
                    <TableHead className="text-right">月次予算</TableHead>
                    <TableHead className="text-right">消化額</TableHead>
                    <TableHead className="text-right">残予算</TableHead>
                    <TableHead className="w-40">消化率</TableHead>
                    <TableHead>ステータス</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const statusLabel = STATUS_LABELS[c.status] ?? c.status
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium max-w-[200px] truncate" title={c.name}>
                          {c.name.length > 24 ? `${c.name.slice(0, 24)}…` : c.name}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{PLATFORM_LABELS[c.platform] ?? c.platform}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{AD_TYPE_LABELS[c.adType] ?? c.adType}</span>
                        </TableCell>
                        {/* Inline editable budget */}
                        <TableCell className="text-right tabular-nums">
                          {editingId === c.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                ref={inputRef}
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit(c.id)
                                  if (e.key === 'Escape') cancelEdit()
                                }}
                                className="h-7 w-28 text-right text-xs"
                                aria-label="月次予算を編集"
                              />
                              <Button
                                size="sm" className="h-6 w-6 p-0"
                                variant="ghost"
                                onClick={() => saveEdit(c.id)}
                                aria-label="保存"
                              >
                                <CheckIcon className="size-3" aria-hidden="true" />
                              </Button>
                              <Button
                                size="sm" className="h-6 w-6 p-0"
                                variant="ghost"
                                onClick={cancelEdit}
                                aria-label="キャンセル"
                              >
                                <XIcon className="size-3" aria-hidden="true" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              className="cursor-pointer rounded px-1 text-sm hover:bg-muted"
                              onClick={() => startEdit(c)}
                              title="クリックして編集"
                              aria-label={`${c.name} の月次予算を編集`}
                            >
                              {fmt(c.monthlyBudget)}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmt(c.spent)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmt(c.remaining)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Meter
                              aria-label={`${c.name} 消化率`}
                              value={Math.min(100, c.utilization)}
                              maxValue={100}
                              size="sm"
                              color={utilizationMeterColor(c.utilization)}
                              className="flex-1"
                            >
                              <Meter.Track>
                                <Meter.Fill />
                              </Meter.Track>
                            </Meter>
                            <Badge variant={utilizationBadge(c.utilization)} className="tabular-nums text-xs">
                              {fmtPct(c.utilization)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusChip status={c.status} label={statusLabel} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
  )
}
