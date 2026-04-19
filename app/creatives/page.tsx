'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { PlusIcon, PauseIcon, PlayIcon, Trash2Icon, InfoIcon, SearchXIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

interface Creative {
  id: string
  name: string
  type: string
  status: string
  headline1?: string | null
  headline2?: string | null
  headline3?: string | null
  description1?: string | null
  description2?: string | null
  adGroup?: {
    id: string
    name: string
    campaign?: {
      platform: string
      name: string
    }
  }
}

const TYPE_LABELS: Record<string, string> = { text: 'テキスト', image: '画像', responsive: 'レスポンシブ' }
const TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'info'> = { text: 'secondary', image: 'info', responsive: 'default' }
const PLATFORM_COLORS: Record<string, string> = {
  google: 'bg-blue-500',
  yahoo: 'bg-red-500',
  bing: 'bg-green-600',
}
const PLATFORM_LABELS: Record<string, string> = { google: 'Google', yahoo: 'Yahoo!', bing: 'Bing' }
const STATUS_LABELS: Record<string, string> = { active: '配信中', paused: '停止中', removed: '削除済' }
const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  paused: 'warning',
  removed: 'secondary',
}

const MOCK_CREATIVES: Creative[] = [
  { id: 'mc1', name: '春季キャンペーン メインバナー', type: 'responsive', status: 'active', headline1: '春の特大セール開催中', headline2: '最大50%OFF！今すぐチェック', headline3: '期間限定・数量限定', description1: '春の新生活を応援。人気商品が大幅値引き。', description2: '送料無料キャンペーン実施中！', adGroup: { id: 'ag1', name: '春季グループ', campaign: { platform: 'google', name: 'ブランド訴求' } } },
  { id: 'mc2', name: 'ブランド訴求テキスト広告', type: 'text', status: 'active', headline1: '業界No.1の信頼性', headline2: '無料トライアル実施中', headline3: '今すぐ始めよう', description1: '10,000社以上が導入。安心のサポート体制。', description2: '導入から30日間無料でお試しいただけます。', adGroup: { id: 'ag2', name: 'ブランドグループ', campaign: { platform: 'google', name: 'ブランド訴求' } } },
  { id: 'mc3', name: 'Yahoo リターゲティング', type: 'image', status: 'paused', headline1: 'あなたが見た商品', headline2: null, headline3: null, description1: '再入荷しました。お早めにどうぞ。', description2: null, adGroup: { id: 'ag3', name: 'リターゲティング', campaign: { platform: 'yahoo', name: 'リターゲティング' } } },
  { id: 'mc4', name: 'Bing 検索レスポンシブ', type: 'responsive', status: 'active', headline1: '法人向けサービス', headline2: '月額プランあり', headline3: '無料相談受付中', description1: '導入実績豊富。専任コンサルタントがサポート。', description2: null, adGroup: { id: 'ag4', name: 'Bing 検索', campaign: { platform: 'bing', name: 'Bing 検索広告' } } },
]

function CreativeSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  )
}

export default function CreativesPage() {
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: 'text',
    adGroupId: '',
    headline1: '',
    headline2: '',
    headline3: '',
    description1: '',
    description2: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterPlatform) params.set('platform', filterPlatform)
      if (filterStatus) params.set('status', filterStatus)
      const res = await fetch(`/api/creatives?${params}`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setCreatives(data)
        setIsMock(false)
      } else {
        const filtered = MOCK_CREATIVES.filter((c) => {
          if (filterPlatform && c.adGroup?.campaign?.platform !== filterPlatform) return false
          if (filterStatus && c.status !== filterStatus) return false
          return true
        })
        setCreatives(filtered)
        setIsMock(true)
      }
    } catch {
      toast.error('データの取得に失敗しました')
      setCreatives(MOCK_CREATIVES)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [filterPlatform, filterStatus])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleStatus = async (c: Creative) => {
    const newStatus = c.status === 'active' ? 'paused' : 'active'
    try {
      const res = await fetch(`/api/creatives/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success(newStatus === 'active' ? '配信を再開しました' : '配信を停止しました')
      fetchData()
    } catch {
      toast.error('ステータスの変更に失敗しました')
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/creatives/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('クリエイティブを削除しました')
      setDeleteId(null)
      fetchData()
    } catch {
      toast.error('削除に失敗しました')
    }
  }

  const handleCreate = async () => {
    if (!form.name || !form.adGroupId) {
      toast.error('名前と広告グループIDは必須です')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('クリエイティブを作成しました')
      setNewDialogOpen(false)
      setForm({ name: '', type: 'text', adGroupId: '', headline1: '', headline2: '', headline3: '', description1: '', description2: '' })
      fetchData()
    } catch {
      toast.error('作成に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">クリエイティブ</h1>
            <p className="mt-1 text-sm text-muted-foreground">広告クリエイティブの管理と配信状況の確認</p>
          </div>
          <Button onClick={() => setNewDialogOpen(true)}>
            <PlusIcon aria-hidden="true" />
            新規クリエイティブ
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterPlatform} onValueChange={(v) => setFilterPlatform(v === 'all' ? '' : (v ?? ''))}>
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
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === 'all' ? '' : (v ?? ''))}>
            <SelectTrigger className="w-36" aria-label="ステータスでフィルタ">
              <SelectValue placeholder="すべて" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="active">配信中</SelectItem>
              <SelectItem value="paused">停止中</SelectItem>
              <SelectItem value="removed">削除済</SelectItem>
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

        {/* Grid */}
        <div className="grid gap-4 lg:grid-cols-3 md:grid-cols-2">
          {loading
            ? [0, 1, 2, 3, 4, 5].map((i) => <CreativeSkeleton key={i} />)
            : creatives.map((c) => {
                const platform = c.adGroup?.campaign?.platform ?? ''
                const sv = STATUS_VARIANTS[c.status] ?? 'outline'
                return (
                  <Card key={c.id} className="flex flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {platform && (
                            <span
                              className={`inline-block size-2.5 shrink-0 rounded-full ${PLATFORM_COLORS[platform] ?? 'bg-muted'}`}
                              title={PLATFORM_LABELS[platform] ?? platform}
                              aria-label={PLATFORM_LABELS[platform] ?? platform}
                            />
                          )}
                          <CardTitle className="text-sm truncate" title={c.name}>
                            {c.name.length > 30 ? `${c.name.slice(0, 30)}…` : c.name}
                          </CardTitle>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Badge variant={TYPE_VARIANTS[c.type] ?? 'secondary'} className="text-xs">
                            {TYPE_LABELS[c.type] ?? c.type}
                          </Badge>
                          <Badge variant={sv} className="text-xs">
                            {STATUS_LABELS[c.status] ?? c.status}
                          </Badge>
                        </div>
                      </div>
                      {c.adGroup && (
                        <CardDescription className="text-xs truncate">
                          {c.adGroup.campaign?.name} › {c.adGroup.name}
                        </CardDescription>
                      )}
                    </CardHeader>

                    {c.type === 'text' || c.type === 'responsive' ? (
                      <CardContent className="flex-1 space-y-1 pb-3 text-xs text-muted-foreground">
                        {[c.headline1, c.headline2, c.headline3].filter(Boolean).map((h, i) => (
                          <p key={i} className="truncate font-medium text-foreground" title={h!}>
                            {h}
                          </p>
                        ))}
                        {[c.description1, c.description2].filter(Boolean).map((d, i) => (
                          <p key={i} className="truncate" title={d!}>
                            {d}
                          </p>
                        ))}
                      </CardContent>
                    ) : (
                      <CardContent className="flex-1 pb-3">
                        <p className="text-xs text-muted-foreground">画像クリエイティブ</p>
                      </CardContent>
                    )}

                    <Separator />
                    <div className="flex items-center justify-end gap-1 p-2">
                      {c.status !== 'removed' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleStatus(c)}
                          aria-label={c.status === 'active' ? '配信を停止する' : '配信を再開する'}
                        >
                          {c.status === 'active'
                            ? <PauseIcon className="size-4" aria-hidden="true" />
                            : <PlayIcon className="size-4" aria-hidden="true" />
                          }
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(c.id)}
                        className="text-destructive hover:text-destructive"
                        aria-label="削除する"
                      >
                        <Trash2Icon className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </Card>
                )
              })}

          {!loading && creatives.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon={SearchXIcon}
                title="該当するクリエイティブがありません"
                description="フィルター条件を変更してお試しください"
              />
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>クリエイティブを削除しますか？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            このクリエイティブのステータスを「削除済」に変更します。この操作は取り消せません。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>キャンセル</Button>
            <Button variant="destructive" onClick={confirmDelete}>削除する</Button>
          </DialogFooter>
          <DialogClose onClick={() => setDeleteId(null)} />
        </DialogContent>
      </Dialog>

      {/* New creative dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新規クリエイティブ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="cr-name" className="text-sm font-medium">クリエイティブ名 <span className="text-destructive">*</span></label>
              <Input
                id="cr-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例: 春季キャンペーン"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cr-type" className="text-sm font-medium">種別</label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? 'text' }))}>
                <SelectTrigger id="cr-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">テキスト</SelectItem>
                  <SelectItem value="image">画像</SelectItem>
                  <SelectItem value="responsive">レスポンシブ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="cr-adgroup" className="text-sm font-medium">広告グループID <span className="text-destructive">*</span></label>
              <Input
                id="cr-adgroup"
                value={form.adGroupId}
                onChange={(e) => setForm((f) => ({ ...f, adGroupId: e.target.value }))}
                placeholder="広告グループのID"
              />
            </div>
            <Separator />
            {['headline1', 'headline2', 'headline3'].map((k, i) => (
              <div key={k} className="space-y-1">
                <label htmlFor={`cr-${k}`} className="text-sm font-medium">見出し{i + 1}</label>
                <Input
                  id={`cr-${k}`}
                  value={form[k as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  placeholder={`見出し${i + 1}`}
                />
              </div>
            ))}
            {['description1', 'description2'].map((k, i) => (
              <div key={k} className="space-y-1">
                <label htmlFor={`cr-${k}`} className="text-sm font-medium">説明文{i + 1}</label>
                <Input
                  id={`cr-${k}`}
                  value={form[k as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  placeholder={`説明文${i + 1}`}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)} disabled={submitting}>キャンセル</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? '作成中…' : '作成する'}
            </Button>
          </DialogFooter>
          <DialogClose onClick={() => setNewDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
