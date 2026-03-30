'use client';

import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, InfoIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

type Campaign = {
  id: string;
  name: string;
  platform: string;
  adType: string;
  status: string;
  monthlyBudget: number | null;
  createdAt: string;
};

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google',
  yahoo: 'Yahoo!',
  bing: 'Bing',
};

const AD_TYPE_LABELS: Record<string, string> = {
  search: 'リスティング',
  display: 'ディスプレイ',
};

const STATUS_LABELS: Record<string, string> = {
  active: '配信中',
  paused: '停止中',
  ended: '終了',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  paused: 'secondary',
  ended: 'destructive',
};

const PLATFORM_COLORS: Record<string, string> = {
  google: 'bg-blue-100 text-blue-700',
  yahoo: 'bg-red-100 text-red-700',
  bing: 'bg-teal-100 text-teal-700',
};

const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const fmtNum = (n: number) => new Intl.NumberFormat('ja-JP').format(n);

const MOCK_CAMPAIGNS: Campaign[] = [
  { id: 'mock-1', name: 'ブランド訴求（検索）', platform: 'google', adType: 'search', status: 'active', monthlyBudget: 500000, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'mock-2', name: '新規顧客獲得', platform: 'google', adType: 'display', status: 'active', monthlyBudget: 300000, createdAt: '2026-01-05T00:00:00.000Z' },
  { id: 'mock-3', name: '季節限定プロモーション', platform: 'yahoo', adType: 'search', status: 'active', monthlyBudget: 200000, createdAt: '2026-01-10T00:00:00.000Z' },
  { id: 'mock-4', name: 'リターゲティング', platform: 'yahoo', adType: 'display', status: 'paused', monthlyBudget: 150000, createdAt: '2026-01-15T00:00:00.000Z' },
  { id: 'mock-5', name: 'Bing 検索広告', platform: 'bing', adType: 'search', status: 'active', monthlyBudget: 100000, createdAt: '2026-02-01T00:00:00.000Z' },
];

type FormData = {
  name: string;
  platform: string;
  adType: string;
  monthlyBudget: string;
};

const emptyForm: FormData = { name: '', platform: '', adType: '', monthlyBudget: '' };

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Campaign | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      if (list.length > 0) {
        setCampaigns(list);
        setIsMock(false);
      } else {
        setCampaigns(MOCK_CAMPAIGNS);
        setIsMock(true);
      }
    } catch {
      toast.error('データの取得に失敗しました');
      setCampaigns(MOCK_CAMPAIGNS);
      setIsMock(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (campaign: Campaign) => {
    setEditTarget(campaign);
    setForm({
      name: campaign.name,
      platform: campaign.platform,
      adType: campaign.adType,
      monthlyBudget: campaign.monthlyBudget != null ? String(campaign.monthlyBudget) : '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.platform || !form.adType) {
      toast.error('キャンペーン名・媒体・広告種別は必須です');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        platform: form.platform,
        adType: form.adType,
        monthlyBudget: form.monthlyBudget ? Number(form.monthlyBudget) : null,
      };

      const res = editTarget
        ? await fetch(`/api/campaigns/${editTarget.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (!res.ok) throw new Error();

      toast.success(editTarget ? 'キャンペーンを更新しました' : 'キャンペーンを登録しました');
      setDialogOpen(false);
      fetchCampaigns();
    } catch {
      toast.error('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('キャンペーンを削除しました');
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error('削除に失敗しました');
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusToggle = async (campaign: Campaign) => {
    const nextStatus = campaign.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error();
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaign.id ? { ...c, status: nextStatus } : c))
      );
      toast.success(nextStatus === 'active' ? '配信を再開しました' : 'キャンペーンを停止しました');
    } catch {
      toast.error('ステータスの変更に失敗しました');
    }
  };

  return (
    <MainLayout>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        メインコンテンツへスキップ
      </a>
      <div id="main-content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">キャンペーン</h1>
            <p className="text-sm text-muted-foreground mt-1">
            {!loading && `登録済み: ${fmtNum(campaigns.length)} 件`}
          </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            新規登録
          </Button>
        </div>

        {/* Mock banner */}
        {isMock && !loading && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
            <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>サンプルデータを表示しています。実データを追加するとここに反映されます。</span>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">キャンペーン一覧</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                キャンペーンがまだ登録されていません
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>キャンペーン名</TableHead>
                    <TableHead>媒体</TableHead>
                    <TableHead>広告種別</TableHead>
                    <TableHead>月次予算</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLATFORM_COLORS[campaign.platform] ?? ''}`}
                        >
                          {PLATFORM_LABELS[campaign.platform] ?? campaign.platform}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {AD_TYPE_LABELS[campaign.adType] ?? campaign.adType}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {campaign.monthlyBudget != null
                          ? jpyFormat.format(campaign.monthlyBudget)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleStatusToggle(campaign)}
                          aria-label={`ステータス切替: 現在${STATUS_LABELS[campaign.status] ?? campaign.status}`}
                        >
                          <Badge variant={STATUS_VARIANTS[campaign.status] ?? 'secondary'}>
                            {STATUS_LABELS[campaign.status] ?? campaign.status}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(campaign)}
                            aria-label={`「${campaign.name}」を編集`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600"
                            onClick={() => setDeleteTarget(campaign)}
                            aria-label={`「${campaign.name}」を削除`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 登録・編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'キャンペーンを編集' : '新規キャンペーン登録'}</DialogTitle>
            <DialogDescription>
              {editTarget ? 'キャンペーン情報を変更して保存してください。' : '媒体・広告種別・予算を入力してキャンペーンを登録します。'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label htmlFor="campaign-name" className="text-sm font-medium">
                キャンペーン名 *
              </label>
              <Input
                id="campaign-name"
                name="campaignName"
                autoComplete="off"
                placeholder="例: Google_検索_ブランド…"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="campaign-platform" className="text-sm font-medium">
                媒体 *
              </label>
              <Select
                value={form.platform}
                onValueChange={(v) => setForm((f) => ({ ...f, platform: v ?? '' }))}
              >
                <SelectTrigger id="campaign-platform">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="yahoo">Yahoo!</SelectItem>
                  <SelectItem value="bing">Bing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="campaign-adtype" className="text-sm font-medium">
                広告種別 *
              </label>
              <Select
                value={form.adType}
                onValueChange={(v) => setForm((f) => ({ ...f, adType: v ?? '' }))}
              >
                <SelectTrigger id="campaign-adtype">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="search">リスティング</SelectItem>
                  <SelectItem value="display">ディスプレイ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="campaign-budget" className="text-sm font-medium">
                月次予算（円）
              </label>
              <Input
                id="campaign-budget"
                name="monthlyBudget"
                type="number"
                autoComplete="off"
                placeholder="例: 500000…"
                value={form.monthlyBudget}
                onChange={(e) => setForm((f) => ({ ...f, monthlyBudget: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>キャンペーンの削除</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.name}」を削除します。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? '削除中…' : '削除する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
