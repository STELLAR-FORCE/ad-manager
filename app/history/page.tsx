'use client'

import { useCallback, useEffect, useState } from 'react'
import { notify } from '@/lib/toast'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  PlusCircleIcon,
  PencilIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  Trash2Icon,
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'

interface HistoryEntry {
  id: string
  changeType: string
  changedBy: string
  changedAt: string
  note?: string | null
  beforeData?: string | null
  afterData?: string | null
  creative?: { name: string } | null
}

const CHANGE_TYPE_CONFIG: Record<string, {
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  variant: 'success' | 'info' | 'warning' | 'destructive' | 'outline'
}> = {
  created: { label: '作成', icon: PlusCircleIcon, variant: 'success' },
  updated: { label: '更新', icon: PencilIcon, variant: 'info' },
  paused: { label: '停止', icon: PauseCircleIcon, variant: 'warning' },
  resumed: { label: '再開', icon: PlayCircleIcon, variant: 'success' },
  removed: { label: '削除', icon: Trash2Icon, variant: 'destructive' },
}

const MOCK_HISTORIES: HistoryEntry[] = [
  { id: 'mh1', changeType: 'updated', changedBy: '山田 太郎', changedAt: new Date(Date.now() - 3 * 3600000).toISOString(), note: '夏季キャンペーン向けに文言修正', beforeData: JSON.stringify({ headline1: '旧見出し1', description1: '旧説明文' }), afterData: JSON.stringify({ headline1: '夏の特大セール！', description1: '最大50%OFFの夏季セール。今すぐチェック！' }), creative: { name: '春季キャンペーン メインバナー' } },
  { id: 'mh2', changeType: 'paused', changedBy: '佐藤 花子', changedAt: new Date(Date.now() - 6 * 3600000).toISOString(), note: '予算調整のため一時停止', beforeData: JSON.stringify({ status: 'active' }), afterData: JSON.stringify({ status: 'paused' }), creative: { name: 'Yahoo リターゲティング' } },
  { id: 'mh3', changeType: 'created', changedBy: 'システム', changedAt: new Date(Date.now() - 24 * 3600000).toISOString(), note: '新規作成', beforeData: null, afterData: JSON.stringify({ name: 'Bing 検索レスポンシブ', type: 'responsive' }), creative: { name: 'Bing 検索レスポンシブ' } },
  { id: 'mh4', changeType: 'resumed', changedBy: '田中 一郎', changedAt: new Date(Date.now() - 48 * 3600000).toISOString(), note: null, beforeData: JSON.stringify({ status: 'paused' }), afterData: JSON.stringify({ status: 'active' }), creative: { name: 'ブランド訴求テキスト広告' } },
  { id: 'mh5', changeType: 'removed', changedBy: '山田 太郎', changedAt: new Date(Date.now() - 72 * 3600000).toISOString(), note: '旧バナーのため削除', beforeData: JSON.stringify({ status: 'paused', name: '旧バナー2024年版' }), afterData: JSON.stringify({ status: 'removed' }), creative: { name: '旧バナー2024年版' } },
  { id: 'mh6', changeType: 'updated', changedBy: '佐藤 花子', changedAt: new Date(Date.now() - 5 * 24 * 3600000).toISOString(), note: 'CTR改善のため見出し変更', beforeData: JSON.stringify({ headline1: '法人向けサービス', headline2: '月額プランあり' }), afterData: JSON.stringify({ headline1: '業界シェアNo.1', headline2: '30日間無料体験' }), creative: { name: 'Bing 検索レスポンシブ' } },
]

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}日前`
  if (hours > 0) return `${hours}時間前`
  if (minutes > 0) return `${minutes}分前`
  return 'たった今'
}

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}

interface DiffEntry {
  key: string
  before: string
  after: string
}

function parseDiff(before: string | null | undefined, after: string | null | undefined): DiffEntry[] {
  if (!before && !after) return []
  try {
    const b = before ? JSON.parse(before) : {}
    const a = after ? JSON.parse(after) : {}
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]))
    return keys
      .filter((k) => String(b[k] ?? '') !== String(a[k] ?? ''))
      .map((k) => ({ key: k, before: String(b[k] ?? '—'), after: String(a[k] ?? '—') }))
  } catch {
    return []
  }
}

const FIELD_LABELS: Record<string, string> = {
  headline1: '見出し1', headline2: '見出し2', headline3: '見出し3',
  description1: '説明文1', description2: '説明文2',
  status: 'ステータス', name: '名前', type: '種別',
}

export default function HistoryPage() {
  const [histories, setHistories] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterDays, setFilterDays] = useState('30')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ days: filterDays, page: String(page) })
      if (filterType) params.set('type', filterType)
      const res = await fetch(`/api/history?${params}`)
      const data = await res.json()
      if (data.histories && data.histories.length > 0) {
        setHistories(data.histories)
        setTotal(data.total)
        setPages(data.pages)
        setIsMock(false)
      } else {
        setHistories(MOCK_HISTORIES)
        setTotal(MOCK_HISTORIES.length)
        setPages(1)
        setIsMock(true)
      }
    } catch {
      notify.error('データの取得に失敗しました')
      setHistories(MOCK_HISTORIES)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [filterType, filterDays, page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">変更履歴</h1>
          <p className="mt-1 text-sm text-muted-foreground">クリエイティブの変更履歴をタイムライン形式で確認します</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterType || 'all'} onValueChange={(v) => { setFilterType(v === 'all' ? '' : (v ?? '')); setPage(1) }}>
            <SelectTrigger className="w-36" aria-label="変更種別でフィルタ">
              <SelectValue placeholder="すべての種別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての種別</SelectItem>
              <SelectItem value="created">作成</SelectItem>
              <SelectItem value="updated">更新</SelectItem>
              <SelectItem value="paused">停止</SelectItem>
              <SelectItem value="resumed">再開</SelectItem>
              <SelectItem value="removed">削除</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterDays} onValueChange={(v) => { setFilterDays(v ?? '30'); setPage(1) }}>
            <SelectTrigger className="w-36" aria-label="期間でフィルタ">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">直近7日</SelectItem>
              <SelectItem value="30">直近30日</SelectItem>
              <SelectItem value="90">直近90日</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mock banner */}
        {isMock && !loading && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
            <ClockIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>サンプルデータを表示しています。</span>
          </div>
        )}

        {/* Timeline */}
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : histories.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <ClockIcon className="size-10 opacity-30" aria-hidden="true" />
            <p className="text-sm">該当する変更履歴がありません</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" aria-hidden="true" />

            <ol className="space-y-6">
              {histories.map((h) => {
                const cfg = CHANGE_TYPE_CONFIG[h.changeType] ?? CHANGE_TYPE_CONFIG.updated
                const Icon = cfg.icon
                const diff = parseDiff(h.beforeData, h.afterData)
                const isExpanded = expandedId === h.id

                return (
                  <li key={h.id} className="flex gap-4">
                    {/* Icon */}
                    <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-1.5 pb-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
                        <span className="text-sm font-medium truncate">
                          {h.creative?.name ?? '不明なクリエイティブ'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{h.changedBy}</span>
                        <span>·</span>
                        <time dateTime={h.changedAt} title={formatDateTime(h.changedAt)}>
                          {formatRelative(h.changedAt)}
                        </time>
                        {h.note && (
                          <>
                            <span>·</span>
                            <span className="italic">{h.note}</span>
                          </>
                        )}
                      </div>

                      {diff.length > 0 && (
                        <button
                          className="text-xs text-primary underline-offset-2 hover:underline"
                          onClick={() => setExpandedId(isExpanded ? null : h.id)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? '差分を隠す' : `差分を表示（${diff.length}件）`}
                        </button>
                      )}

                      {isExpanded && diff.length > 0 && (
                        <div className="mt-2 overflow-hidden rounded-lg border text-xs">
                          <table className="w-full">
                            <thead className="bg-muted">
                              <tr>
                                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">項目</th>
                                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">変更前</th>
                                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">変更後</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diff.map((d) => (
                                <tr key={d.key} className="border-t">
                                  <td className="px-3 py-1.5 font-medium">{FIELD_LABELS[d.key] ?? d.key}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground line-through">{d.before}</td>
                                  <td className="px-3 py-1.5">{d.after}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {/* Pagination */}
        {!loading && pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="前のページ"
            >
              <ChevronLeftIcon className="size-4" aria-hidden="true" />
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              aria-label="次のページ"
            >
              <ChevronRightIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
  )
}
