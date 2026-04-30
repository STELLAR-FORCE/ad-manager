'use client';

/**
 * Issue #63 — 月別目標値マスタ編集ページ
 * dashboard.targets_monthly を直接編集する。Sheets 脱却の本丸。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, RefreshCw, Plus } from 'lucide-react';
import { jpyCompact, formatMonthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

type Platform = 'all' | 'google' | 'yahoo' | 'bing';

type TargetRow = {
  month: string;
  platform: string | null;
  cvTarget: number | null;
  roomTarget: number | null;
  roomDaysTarget: number | null;
  grossProfitTarget: number | null;
  revenueTarget: number | null;
  useDaysTarget: number | null;
  inhouseUnitPrice: number | null;
};

type EditableRow = TargetRow & { dirty: boolean; saving: boolean; error?: string };

const TODAY = new Date();
const VISIBLE_MONTHS = 12;

/** 当月から前後 6 ヶ月の month キー（'YYYY-MM'）を生成 */
function defaultMonths(): string[] {
  const months: string[] = [];
  const base = new Date(TODAY.getFullYear(), TODAY.getMonth() - 3, 1);
  for (let i = 0; i < VISIBLE_MONTHS; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function key(row: { month: string; platform: string | null }): string {
  return `${row.month}|${row.platform ?? ''}`;
}

export default function TargetsPage() {
  const [platform, setPlatform] = useState<Platform>('all');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const months = useMemo(() => defaultMonths(), []);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const from = months[0];
      const to = months[months.length - 1];
      const res = await fetch(`/api/targets?from=${from}&to=${to}`);
      const data = await res.json();
      setWarning(data.warning ?? null);

      // サーバー上に存在する目標値マップ
      const serverMap = new Map<string, TargetRow>();
      const serverRows: TargetRow[] = Array.isArray(data.rows) ? data.rows : [];
      for (const r of serverRows) {
        const monthKey = r.month.slice(0, 7);
        serverMap.set(key({ month: monthKey, platform: r.platform }), { ...r, month: monthKey });
      }

      // 表示行: 月 × (全体 + 各媒体 if filter='all')
      const platformsForRow: (string | null)[] =
        platform === 'all' ? [null] : [platform];

      const composed: EditableRow[] = [];
      for (const m of months) {
        for (const p of platformsForRow) {
          const existing = serverMap.get(key({ month: m, platform: p }));
          composed.push({
            month: m,
            platform: p,
            cvTarget: existing?.cvTarget ?? null,
            roomTarget: existing?.roomTarget ?? null,
            roomDaysTarget: existing?.roomDaysTarget ?? null,
            grossProfitTarget: existing?.grossProfitTarget ?? null,
            revenueTarget: existing?.revenueTarget ?? null,
            useDaysTarget: existing?.useDaysTarget ?? null,
            inhouseUnitPrice: existing?.inhouseUnitPrice ?? null,
            dirty: false,
            saving: false,
          });
        }
      }
      setRows(composed);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [months, platform]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function updateField(idx: number, field: keyof TargetRow, value: string) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const num = value === '' ? null : Number(value);
        return { ...r, [field]: Number.isFinite(num) ? num : null, dirty: true };
      }),
    );
  }

  async function saveRow(idx: number) {
    const r = rows[idx];
    setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, saving: true, error: undefined } : x)));
    try {
      const res = await fetch('/api/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: r.month,
          platform: r.platform,
          cvTarget: r.cvTarget,
          roomTarget: r.roomTarget,
          roomDaysTarget: r.roomDaysTarget,
          grossProfitTarget: r.grossProfitTarget,
          revenueTarget: r.revenueTarget,
          useDaysTarget: r.useDaysTarget,
          inhouseUnitPrice: r.inhouseUnitPrice,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status}`);
      }
      setRows((prev) =>
        prev.map((x, i) => (i === idx ? { ...x, saving: false, dirty: false } : x)),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRows((prev) =>
        prev.map((x, i) => (i === idx ? { ...x, saving: false, error: message } : x)),
      );
    }
  }

  async function saveAllDirty() {
    const dirtyIdx = rows.map((r, i) => (r.dirty ? i : -1)).filter((i) => i >= 0);
    for (const i of dirtyIdx) {
      await saveRow(i);
    }
  }

  const dirtyCount = rows.filter((r) => r.dirty).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">目標値管理</h1>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            dashboard.targets_monthly を編集します。Sheets 脱却の本丸。
          </p>
        </div>
        <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全体</SelectItem>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="yahoo">Yahoo!</SelectItem>
            <SelectItem value="bing">Bing</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={fetchData}
          disabled={refreshing}
          aria-label="再読み込み"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" />
          再読み込み
        </Button>
        <Button size="sm" className="gap-2" onClick={saveAllDirty} disabled={dirtyCount === 0}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {dirtyCount > 0 ? `${dirtyCount} 件保存` : '保存'}
        </Button>
      </div>

      {warning && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 text-sm text-amber-900">
            {warning}（先に <code>docs/migrations/2026-04-30-targets_monthly.sql</code> を BQ に流してください）
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">月別目標値（{platform === 'all' ? '全体' : platform}）</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">読み込み中…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月</TableHead>
                  <TableHead>媒体</TableHead>
                  <TableHead className="text-right">CV目標</TableHead>
                  <TableHead className="text-right">室数目標</TableHead>
                  <TableHead className="text-right">RD目標</TableHead>
                  <TableHead className="text-right">粗利目標(円)</TableHead>
                  <TableHead className="text-right">売上目標(円)</TableHead>
                  <TableHead className="text-right">利用日数目標</TableHead>
                  <TableHead className="text-right">自社単価(円/日)</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={key(r)} className={r.dirty ? 'bg-amber-50/50' : ''}>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {formatMonthLabel(r.month)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.platform ?? '全体'}
                    </TableCell>
                    <NumCell value={r.cvTarget} onChange={(v) => updateField(i, 'cvTarget', v)} />
                    <NumCell value={r.roomTarget} onChange={(v) => updateField(i, 'roomTarget', v)} />
                    <NumCell
                      value={r.roomDaysTarget}
                      onChange={(v) => updateField(i, 'roomDaysTarget', v)}
                    />
                    <NumCell
                      value={r.grossProfitTarget}
                      onChange={(v) => updateField(i, 'grossProfitTarget', v)}
                      hint={r.grossProfitTarget != null ? jpyCompact.format(r.grossProfitTarget) : undefined}
                    />
                    <NumCell
                      value={r.revenueTarget}
                      onChange={(v) => updateField(i, 'revenueTarget', v)}
                      hint={r.revenueTarget != null ? jpyCompact.format(r.revenueTarget) : undefined}
                    />
                    <NumCell
                      value={r.useDaysTarget}
                      onChange={(v) => updateField(i, 'useDaysTarget', v)}
                    />
                    <NumCell
                      value={r.inhouseUnitPrice}
                      onChange={(v) => updateField(i, 'inhouseUnitPrice', v)}
                    />
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={r.dirty ? 'default' : 'ghost'}
                        onClick={() => saveRow(i)}
                        disabled={r.saving || !r.dirty}
                        className="gap-1"
                        aria-label="行を保存"
                      >
                        {r.saving ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        保存
                      </Button>
                      {r.error && <p className="text-xs text-red-500 mt-1">{r.error}</p>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground/60">
        ヒント: 数値を変更すると行がハイライトされます。行ごとに保存するか、ヘッダーの「{dirtyCount} 件保存」で一括保存できます。
      </p>
    </div>
  );
}

function NumCell({
  value,
  onChange,
  hint,
}: {
  value: number | null;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <TableCell className="text-right">
      <div className="flex flex-col items-end gap-0.5">
        <Input
          type="number"
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-28 text-right tabular-nums"
        />
        {hint && <span className="text-[10px] text-muted-foreground/50 tabular-nums">{hint}</span>}
      </div>
    </TableCell>
  );
}
