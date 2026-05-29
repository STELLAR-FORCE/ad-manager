'use client'

import { useEffect, useState } from 'react'
import { notify } from '@/lib/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InfoIcon, Upload, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Meter } from '@heroui/react'
import { StatusChip } from '@/components/ui/status-chip'
import { BudgetDailyEditButton } from '@/components/dashboard/budget-daily-edit-button'

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
  /** キャンペーンマスタ側の参考値。UI 表示は廃止 */
  monthlyBudget: number
  spent: number
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
  { id: 'mock-1', name: 'ブランド訴求（検索）', platform: 'google', adType: 'search', status: 'active', monthlyBudget: 500000, spent: 420000 },
  { id: 'mock-2', name: '新規顧客獲得', platform: 'google', adType: 'display', status: 'active', monthlyBudget: 300000, spent: 180000 },
  { id: 'mock-3', name: '季節限定プロモーション', platform: 'yahoo', adType: 'search', status: 'active', monthlyBudget: 200000, spent: 185000 },
  { id: 'mock-4', name: 'リターゲティング', platform: 'yahoo', adType: 'display', status: 'paused', monthlyBudget: 150000, spent: 45000 },
  { id: 'mock-5', name: 'Bing 検索広告', platform: 'bing', adType: 'search', status: 'active', monthlyBudget: 100000, spent: 78000 },
]

/** 月セレクタの選択肢。今月を起点に過去 12 ヶ月 + 翌月 (予算入力用) を生成。 */
function generateMonthOptions() {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' })
  // 翌月から過去 12 ヶ月まで (新しい順)
  for (let i = 1; i >= -12; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({ value, label: fmt.format(d) })
  }
  return options
}

/** 今月の 'YYYY-MM' */
function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function BudgetPage() {
  const [month, setMonth] = useState(thisMonth())
  const [campaigns, setCampaigns] = useState<CampaignBudget[]>([])
  const [totalPlannedBudget, setTotalPlannedBudget] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  type SortKey = 'name' | 'platform' | 'adType' | 'spent'
  const [sortKey, setSortKey] = useState<SortKey>('spent')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'spent' ? 'desc' : 'asc')
    }
  }
  const currentYear = new Date().getFullYear()

  function downloadBudgetCsv() {
    window.location.href = `/api/budget-plan/csv?mode=template&year=${currentYear}`
  }

  async function importBudgetCsv(file: File) {
    setImporting(true)
    setImportMessage(null)
    try {
      const text = await file.text()
      const res = await fetch('/api/budget-plan/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: text,
      })
      const json = await res.json()
      if (!res.ok || json.ok === false) {
        const errs = (json.errors ?? []) as { line: number; message: string }[]
        const msg = errs.slice(0, 3).map((e) => `行 ${e.line}: ${e.message}`).join(' / ')
        throw new Error(msg || json.error || `HTTP ${res.status}`)
      }
      setImportMessage({
        type: 'success',
        text: `${json.imported} ヶ月分 (${json.totalRows} 行) を展開しました`,
      })
    } catch (err) {
      setImportMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setImporting(false)
    }
  }

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
      setTotalPlannedBudget(Number(data.totalPlannedBudget ?? 0))
    } catch {
      notify.error('データの取得に失敗しました')
      setCampaigns(MOCK_CAMPAIGNS)
      setIsMock(true)
      setTotalPlannedBudget(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(month)
  }, [month])

  const totalBudget = totalPlannedBudget
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0)
  const totalUtilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  // 媒体別: 当月総予算 (cost_plan_daily) には媒体別の値が無いので消化額のみ表示
  const platformSummary = ['google', 'yahoo', 'bing'].map((p) => {
    const cs = campaigns.filter((c) => c.platform === p)
    const spent = cs.reduce((s, c) => s + c.spent, 0)
    return { platform: p, spent }
  })

  const utilizationMeterColor = (u: number): 'success' | 'warning' | 'danger' =>
    u > 100 ? 'danger' : u > 80 ? 'warning' : 'success'

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">予算管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              キャンペーン別の消化状況とステータス。月次予算は上の「予算CSV」をインポート、または「日次予算 編集」で個別設定できます。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={downloadBudgetCsv}
              aria-label="予算 CSV テンプレートをダウンロード"
              title="月次の リスティング予算 / ディスプレイ予算 をまとめて入力する CSV テンプレ"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              予算CSV
            </Button>
            <BudgetDailyEditButton month={month} />
            <label
              className={cn(
                'inline-flex items-center gap-2 text-sm h-8 px-3 rounded-md border bg-background hover:bg-muted cursor-pointer transition-colors',
                importing && 'opacity-50 cursor-not-allowed',
              )}
              title="月次予算 CSV をインポート (日次×媒体に自動展開)"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {importing ? '展開中…' : 'CSV インポート'}
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={importing}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) importBudgetCsv(f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>

        {/* Import banner */}
        {importMessage && (
          <div
            className={cn(
              'flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm',
              importMessage.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300',
            )}
          >
            <span>{importMessage.text}</span>
            <button type="button" onClick={() => setImportMessage(null)} className="text-xs underline hover:opacity-70">
              閉じる
            </button>
          </div>
        )}

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
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">媒体別消化額</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {platformSummary.map(({ platform, spent }) => (
                  <div key={platform} className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      {PLATFORM_LABELS[platform]}
                    </span>
                    <span className="text-lg font-semibold tabular-nums">{fmt(spent)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campaign table */}
        {(() => {
          // 0 円消化は常に非表示。配信中フィルタとソートを適用
          const filtered = campaigns
            .filter((c) => c.spent > 0)
            .filter((c) => (showInactive ? true : c.status === 'active'))
          const visibleCampaigns = [...filtered].sort((a, b) => {
            const av =
              sortKey === 'name'
                ? a.name
                : sortKey === 'platform'
                  ? PLATFORM_LABELS[a.platform] ?? a.platform
                  : sortKey === 'adType'
                    ? AD_TYPE_LABELS[a.adType] ?? a.adType
                    : a.spent
            const bv =
              sortKey === 'name'
                ? b.name
                : sortKey === 'platform'
                  ? PLATFORM_LABELS[b.platform] ?? b.platform
                  : sortKey === 'adType'
                    ? AD_TYPE_LABELS[b.adType] ?? b.adType
                    : b.spent
            if (typeof av === 'number' && typeof bv === 'number') {
              return sortDir === 'asc' ? av - bv : bv - av
            }
            return sortDir === 'asc'
              ? String(av).localeCompare(String(bv), 'ja')
              : String(bv).localeCompare(String(av), 'ja')
          })
          const hiddenCount = campaigns.filter((c) => c.spent > 0).length - visibleCampaigns.length
          const sortIcon = (key: SortKey) =>
            sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
          return (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-sm font-medium">
                  キャンペーン別予算
                  <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                    {visibleCampaigns.length} 件
                  </span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowInactive((s) => !s)}
                  aria-pressed={showInactive}
                  title={showInactive ? '配信中のみに戻す' : '停止中・終了も含めて表示'}
                >
                  {showInactive
                    ? '配信中のみ表示'
                    : hiddenCount > 0
                      ? `停止中・終了も表示 (+${hiddenCount})`
                      : '停止中・終了も表示'}
                </Button>
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
                        <TableHead
                          className="cursor-pointer select-none hover:text-foreground"
                          onClick={() => toggleSort('name')}
                          aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          キャンペーン名{sortIcon('name')}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none hover:text-foreground"
                          onClick={() => toggleSort('platform')}
                          aria-sort={sortKey === 'platform' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          媒体{sortIcon('platform')}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none hover:text-foreground"
                          onClick={() => toggleSort('adType')}
                          aria-sort={sortKey === 'adType' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          広告種別{sortIcon('adType')}
                        </TableHead>
                        <TableHead
                          className="text-right cursor-pointer select-none hover:text-foreground"
                          onClick={() => toggleSort('spent')}
                          aria-sort={sortKey === 'spent' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          消化額{sortIcon('spent')}
                        </TableHead>
                        <TableHead>ステータス</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCampaigns.map((c) => {
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
                            <TableCell className="text-right tabular-nums text-sm">{fmt(c.spent)}</TableCell>
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
          )
        })()}
      </div>
  )
}
