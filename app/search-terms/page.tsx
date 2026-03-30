'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { InfoIcon, ArrowUpIcon, ArrowDownIcon, MinusIcon } from 'lucide-react'

interface SearchTerm {
  id: string
  searchTerm: string
  platform: string
  campaignName: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  ctr: number
  cpa: number
  isExcluded: boolean
}

const fmt = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n)
const fmtNum = (n: number) =>
  new Intl.NumberFormat('ja-JP').format(n)
const fmtPct = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'percent', maximumFractionDigits: 2 }).format(n / 100)

const PLATFORM_LABELS: Record<string, string> = { google: 'Google', yahoo: 'Yahoo!', bing: 'Bing' }

const MOCK_TERMS: SearchTerm[] = [
  { id: 'st1', searchTerm: '法人向け 賃貸 マンション', platform: 'google', campaignName: 'ブランド訴求', impressions: 4820, clicks: 312, cost: 45600, conversions: 18, ctr: 6.47, cpa: 2533, isExcluded: false },
  { id: 'st2', searchTerm: '一棟借り上げ 企業', platform: 'google', campaignName: 'ブランド訴求', impressions: 2340, clicks: 198, cost: 38200, conversions: 12, ctr: 8.46, cpa: 3183, isExcluded: false },
  { id: 'st3', searchTerm: '社宅 代行 費用', platform: 'yahoo', campaignName: '季節限定プロモーション', impressions: 1890, clicks: 87, cost: 21300, conversions: 0, ctr: 4.60, cpa: 0, isExcluded: false },
  { id: 'st4', searchTerm: 'マンション 一括管理', platform: 'google', campaignName: 'ブランド訴求', impressions: 3120, clicks: 145, cost: 18700, conversions: 5, ctr: 4.65, cpa: 3740, isExcluded: false },
  { id: 'st5', searchTerm: '賃貸 管理 会社 比較', platform: 'bing', campaignName: 'Bing 検索広告', impressions: 980, clicks: 42, cost: 15400, conversions: 0, ctr: 4.29, cpa: 0, isExcluded: false },
  { id: 'st6', searchTerm: '企業 社宅 契約', platform: 'google', campaignName: 'ブランド訴求', impressions: 2100, clicks: 134, cost: 14800, conversions: 8, ctr: 6.38, cpa: 1850, isExcluded: false },
  { id: 'st7', searchTerm: 'アパート 法人 格安', platform: 'yahoo', campaignName: '季節限定プロモーション', impressions: 1450, clicks: 63, cost: 12900, conversions: 0, ctr: 4.34, cpa: 0, isExcluded: true },
  { id: 'st8', searchTerm: '社員寮 賃貸 東京', platform: 'google', campaignName: 'ブランド訴求', impressions: 1680, clicks: 89, cost: 11200, conversions: 6, ctr: 5.30, cpa: 1867, isExcluded: false },
  { id: 'st9', searchTerm: 'マンション 借り上げ 無料相談', platform: 'google', campaignName: 'ブランド訴求', impressions: 940, clicks: 71, cost: 10500, conversions: 4, ctr: 7.55, cpa: 2625, isExcluded: false },
  { id: 'st10', searchTerm: '賃貸 一括管理 メリット', platform: 'bing', campaignName: 'Bing 検索広告', impressions: 720, clicks: 38, cost: 9800, conversions: 0, ctr: 5.28, cpa: 0, isExcluded: false },
  { id: 'st11', searchTerm: '不動産 法人契約', platform: 'yahoo', campaignName: '季節限定プロモーション', impressions: 1200, clicks: 56, cost: 8700, conversions: 3, ctr: 4.67, cpa: 2900, isExcluded: false },
  { id: 'st12', searchTerm: '社宅 管理 アウトソーシング', platform: 'google', campaignName: 'ブランド訴求', impressions: 830, clicks: 44, cost: 7600, conversions: 2, ctr: 5.30, cpa: 3800, isExcluded: false },
  { id: 'st13', searchTerm: '家賃 補助 制度 会社', platform: 'yahoo', campaignName: '季節限定プロモーション', impressions: 2400, clicks: 38, cost: 6200, conversions: 0, ctr: 1.58, cpa: 0, isExcluded: false },
  { id: 'st14', searchTerm: '賃貸 管理 手数料 比較', platform: 'bing', campaignName: 'Bing 検索広告', impressions: 560, clicks: 22, cost: 4300, conversions: 1, ctr: 3.93, cpa: 4300, isExcluded: false },
  { id: 'st15', searchTerm: '法人向け住宅 サービス', platform: 'google', campaignName: 'ブランド訴求', impressions: 430, clicks: 19, cost: 3100, conversions: 1, ctr: 4.42, cpa: 3100, isExcluded: false },
]

type SortKey = 'impressions' | 'clicks' | 'cost' | 'conversions' | 'ctr' | 'cpa'

export default function SearchTermsPage() {
  const [terms, setTerms] = useState<SearchTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterExcluded, setFilterExcluded] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('cost')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sort: sortKey, order: sortOrder })
      if (filterPlatform) params.set('platform', filterPlatform)
      if (filterExcluded) params.set('excluded', filterExcluded)
      const res = await fetch(`/api/search-terms?${params}`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setTerms(data)
        setIsMock(false)
      } else {
        let filtered = [...MOCK_TERMS]
        if (filterPlatform) filtered = filtered.filter((t) => t.platform === filterPlatform)
        if (filterExcluded === 'true') filtered = filtered.filter((t) => t.isExcluded)
        if (filterExcluded === 'false') filtered = filtered.filter((t) => !t.isExcluded)
        filtered.sort((a, b) => {
          const av = a[sortKey] as number
          const bv = b[sortKey] as number
          return sortOrder === 'asc' ? av - bv : bv - av
        })
        setTerms(filtered)
        setIsMock(true)
      }
    } catch {
      toast.error('データの取得に失敗しました')
      setTerms(MOCK_TERMS)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [filterPlatform, filterExcluded, sortKey, sortOrder])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder('desc')
    }
  }

  const toggleExclude = async (term: SearchTerm) => {
    const newVal = !term.isExcluded
    try {
      const res = await fetch(`/api/search-terms/${term.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isExcluded: newVal }),
      })
      if (!res.ok) throw new Error()
      toast.success(newVal ? '除外候補に設定しました' : '除外を解除しました')
      fetchData()
    } catch {
      toast.error('更新に失敗しました')
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <MinusIcon className="size-3 text-muted-foreground/50" aria-hidden="true" />
    return sortOrder === 'asc'
      ? <ArrowUpIcon className="size-3 text-foreground" aria-hidden="true" />
      : <ArrowDownIcon className="size-3 text-foreground" aria-hidden="true" />
  }

  const sortableHeader = (key: SortKey, label: string) => (
    <button
      className="flex items-center gap-1 text-left hover:text-foreground"
      onClick={() => toggleSort(key)}
      aria-label={`${label}で並び替え`}
    >
      {label}
      <SortIcon k={key} />
    </button>
  )

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">検索語句分析</h1>
          <p className="mt-1 text-sm text-muted-foreground">検索語句ごとのパフォーマンスと除外候補を管理します</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterPlatform || 'all'} onValueChange={(v) => setFilterPlatform(v === 'all' ? '' : (v ?? ''))}>
            <SelectTrigger className="w-36" aria-label="媒体でフィルタ">
              <SelectValue placeholder="すべての媒体" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての媒体</SelectItem>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="yahoo">Yahoo!</SelectItem>
              <SelectItem value="bing">Bing</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterExcluded || 'all'} onValueChange={(v) => setFilterExcluded(v === 'all' ? '' : (v ?? ''))}>
            <SelectTrigger className="w-40" aria-label="除外フラグでフィルタ">
              <SelectValue placeholder="すべて" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="false">未除外</SelectItem>
              <SelectItem value="true">除外済</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mock banner */}
        {isMock && !loading && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
            <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>サンプルデータを表示しています。</span>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              検索語句一覧
              {!loading && (
                <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                  （{fmtNum(terms.length)}件）
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>検索語句</TableHead>
                    <TableHead>媒体</TableHead>
                    <TableHead className="text-right">{sortableHeader('impressions', 'IMP')}</TableHead>
                    <TableHead className="text-right">{sortableHeader('clicks', 'クリック')}</TableHead>
                    <TableHead className="text-right">{sortableHeader('cost', '費用')}</TableHead>
                    <TableHead className="text-right">{sortableHeader('conversions', 'CV')}</TableHead>
                    <TableHead className="text-right">{sortableHeader('cpa', 'CPA')}</TableHead>
                    <TableHead>除外</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {terms.map((t) => {
                    const isHighlight = t.cost > 1000 && t.conversions === 0
                    return (
                      <TableRow
                        key={t.id}
                        className={isHighlight ? 'bg-red-50/60 dark:bg-red-900/10' : undefined}
                      >
                        <TableCell className="max-w-[200px]">
                          <span
                            className="block truncate font-medium"
                            title={t.searchTerm}
                          >
                            {t.searchTerm.length > 30 ? `${t.searchTerm.slice(0, 30)}…` : t.searchTerm}
                          </span>
                          <span className="text-xs text-muted-foreground truncate block">
                            {t.campaignName.length > 20 ? `${t.campaignName.slice(0, 20)}…` : t.campaignName}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{PLATFORM_LABELS[t.platform] ?? t.platform}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtNum(t.impressions)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtNum(t.clicks)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmt(t.cost)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtNum(t.conversions)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {t.conversions > 0 ? fmt(t.cpa) : '—'}
                        </TableCell>
                        <TableCell>
                          {t.isExcluded ? (
                            <Badge variant="warning" className="text-xs tabular-nums">除外済</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => toggleExclude(t)}
                            className="text-xs whitespace-nowrap"
                          >
                            {t.isExcluded ? '除外解除' : '除外候補'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}

                  {terms.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                        データがありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
