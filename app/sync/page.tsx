'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCwIcon, CheckCircleIcon, XCircleIcon, ClockIcon, LoaderIcon } from 'lucide-react'

interface SyncLog {
  id: string
  platform: string
  syncType: string
  status: string
  message?: string | null
  startedAt: string
  finishedAt?: string | null
}

const PLATFORM_LABELS: Record<string, string> = { google: 'Google', yahoo: 'Yahoo!', bing: 'Bing' }
const PLATFORM_ICONS: Record<string, string> = { google: '🔵', yahoo: '🔴', bing: '🟢' }

const STATUS_CONFIG: Record<string, {
  label: string
  variant: 'success' | 'warning' | 'destructive' | 'outline' | 'secondary'
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}> = {
  running: { label: '同期中', variant: 'secondary', icon: LoaderIcon },
  success: { label: '成功', variant: 'success', icon: CheckCircleIcon },
  failed: { label: '失敗', variant: 'destructive', icon: XCircleIcon },
}

const SYNC_TYPE_LABELS: Record<string, string> = { auto: '自動', manual: '手動' }

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}

const MOCK_LOGS: SyncLog[] = [
  { id: 'sl1', platform: 'google', syncType: 'manual', status: 'success', message: 'Google の同期が完了しました', startedAt: new Date(Date.now() - 2 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 2 * 3600000 + 45000).toISOString() },
  { id: 'sl2', platform: 'yahoo', syncType: 'auto', status: 'success', message: 'Yahoo! の同期が完了しました', startedAt: new Date(Date.now() - 6 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 6 * 3600000 + 38000).toISOString() },
  { id: 'sl3', platform: 'bing', syncType: 'auto', status: 'failed', message: 'Bing の同期中にエラーが発生しました（認証トークン期限切れ）', startedAt: new Date(Date.now() - 72 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 72 * 3600000 + 5000).toISOString() },
  { id: 'sl4', platform: 'google', syncType: 'auto', status: 'success', message: 'Google の同期が完了しました', startedAt: new Date(Date.now() - 26 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 26 * 3600000 + 52000).toISOString() },
  { id: 'sl5', platform: 'yahoo', syncType: 'manual', status: 'success', message: 'Yahoo! の同期が完了しました', startedAt: new Date(Date.now() - 30 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 30 * 3600000 + 41000).toISOString() },
]

interface PlatformStatus {
  platform: string
  status: string
  lastSync: string | null
}

export default function SyncPage() {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sync/logs?limit=50')
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setLogs(data)
        setIsMock(false)
      } else {
        setLogs(MOCK_LOGS)
        setIsMock(true)
      }
    } catch {
      toast.error('ログの取得に失敗しました')
      setLogs(MOCK_LOGS)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const triggerSync = async (platform: string) => {
    setSyncing((s) => ({ ...s, [platform]: true }))
    try {
      const res = await fetch('/api/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${PLATFORM_LABELS[platform]} の同期を開始しました`)
      // Refresh after 4 seconds to show updated status
      setTimeout(() => {
        fetchLogs()
        setSyncing((s) => ({ ...s, [platform]: false }))
      }, 4000)
    } catch {
      toast.error('同期の開始に失敗しました')
      setSyncing((s) => ({ ...s, [platform]: false }))
    }
  }

  const triggerAll = async () => {
    for (const p of ['google', 'yahoo', 'bing']) {
      await triggerSync(p)
    }
  }

  // Derive per-platform last status from logs
  const platformStatuses: PlatformStatus[] = ['google', 'yahoo', 'bing'].map((p) => {
    const platformLogs = logs.filter((l) => l.platform === p)
    const latest = platformLogs[0]
    return {
      platform: p,
      status: latest?.status ?? 'none',
      lastSync: latest?.finishedAt ?? latest?.startedAt ?? null,
    }
  })

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">データ同期</h1>
            <p className="mt-1 text-sm text-muted-foreground">広告媒体のデータ同期状況を管理します</p>
          </div>
          <Button onClick={triggerAll} disabled={Object.values(syncing).some(Boolean)}>
            <RefreshCwIcon aria-hidden="true" />
            全媒体を同期
          </Button>
        </div>

        {/* Platform cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {platformStatuses.map(({ platform, status, lastSync }) => {
            const cfg = STATUS_CONFIG[status] ?? { label: '未実行', variant: 'outline' as const, icon: ClockIcon }
            const Icon = cfg.icon
            const isCurrentlySyncing = syncing[platform]

            return (
              <Card key={platform}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span aria-hidden="true">{PLATFORM_ICONS[platform]}</span>
                      {PLATFORM_LABELS[platform]}
                    </CardTitle>
                    <Badge variant={cfg.variant} className="text-xs">
                      {isCurrentlySyncing ? '同期中' : cfg.label}
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <ClockIcon className="size-3" aria-hidden="true" />
                    最終同期:{' '}
                    {lastSync ? formatDateTime(lastSync) : '未実施'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => triggerSync(platform)}
                    disabled={isCurrentlySyncing}
                    aria-label={`${PLATFORM_LABELS[platform]} を今すぐ同期する`}
                  >
                    <RefreshCwIcon
                      className={isCurrentlySyncing ? 'animate-spin' : ''}
                      aria-hidden="true"
                    />
                    {isCurrentlySyncing ? '同期中…' : '今すぐ同期'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Logs table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">同期ログ</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>媒体</TableHead>
                    <TableHead>種別</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>開始日時</TableHead>
                    <TableHead>完了日時</TableHead>
                    <TableHead>メッセージ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const cfg = STATUS_CONFIG[log.status] ?? { label: log.status, variant: 'outline' as const, icon: ClockIcon }
                    const Icon = cfg.icon
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium text-sm">{PLATFORM_LABELS[log.platform] ?? log.platform}</TableCell>
                        <TableCell className="text-sm">{SYNC_TYPE_LABELS[log.syncType] ?? log.syncType}</TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant} className="flex w-fit items-center gap-1 text-xs">
                            <Icon className={`size-3 ${log.status === 'running' ? 'animate-spin' : ''}`} aria-hidden="true" />
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-sm text-muted-foreground">
                          {formatDateTime(log.startedAt)}
                        </TableCell>
                        <TableCell className="tabular-nums text-sm text-muted-foreground">
                          {log.finishedAt ? formatDateTime(log.finishedAt) : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[240px]">
                          <span className="block truncate" title={log.message ?? ''}>
                            {log.message ? (log.message.length > 40 ? `${log.message.slice(0, 40)}…` : log.message) : '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        同期ログがありません
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
