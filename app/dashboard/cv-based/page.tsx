'use client';

/**
 * Issue #63 — CV発生日ベース統合ビュー
 * gid=939183441 相当。広告 KPI と SFDC の CV/室数/成約/粗利/売上 を媒体×月で並べる。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
import { RefreshCw, Target, Wallet, TrendingUp, Home, Coins } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { jpyFormat, jpyCompact, numFormat, formatMonthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

type Platform = 'all' | 'google' | 'yahoo' | 'bing';

type Row = {
  month: string;
  platform: 'google' | 'yahoo' | 'bing' | 'other';
  impressions: number;
  clicks: number;
  cost: number;
  cv: number;
  cvRooms: number;
  roomDays: number;
  wonCv: number;
  contractedRooms: number;
  grossProfit: number;
  revenue: number;
  inhouseWonCount: number;
  byContractKind: { new: number; renewal: number; extension: number; cancel: number };
};

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google',
  yahoo: 'Yahoo!',
  bing: 'Bing',
  other: 'その他',
};

const PLATFORM_COLORS: Record<string, string> = {
  google: '#4285F4',
  yahoo: '#FF0033',
  bing: '#00897B',
  other: '#9CA3AF',
};

const TODAY = new Date();

function defaultRange(): DateRangeValue {
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth() - 5, 1);
  const end = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0);
  return { main: { start, end }, compareEnabled: false, preset: 'last6months' };
}

export default function CvBasedPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultRange);
  const [platform, setPlatform] = useState<Platform>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      const params = new URLSearchParams({
        start: fmt(dateRange.main.start),
        end: fmt(dateRange.main.end),
      });
      const res = await fetch(`/api/dashboard/cv-based?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(
    () => (platform === 'all' ? rows : rows.filter((r) => r.platform === platform)),
    [rows, platform],
  );

  // 期間サマリ
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        impressions: acc.impressions + r.impressions,
        clicks: acc.clicks + r.clicks,
        cost: acc.cost + r.cost,
        cv: acc.cv + r.cv,
        cvRooms: acc.cvRooms + r.cvRooms,
        roomDays: acc.roomDays + r.roomDays,
        wonCv: acc.wonCv + r.wonCv,
        contractedRooms: acc.contractedRooms + r.contractedRooms,
        grossProfit: acc.grossProfit + r.grossProfit,
        revenue: acc.revenue + r.revenue,
      }),
      {
        impressions: 0,
        clicks: 0,
        cost: 0,
        cv: 0,
        cvRooms: 0,
        roomDays: 0,
        wonCv: 0,
        contractedRooms: 0,
        grossProfit: 0,
        revenue: 0,
      },
    );
  }, [filtered]);

  // 月別集約（媒体合算してチャート向け）
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; cv: number; wonCv: number; grossProfit: number; revenue: number }>();
    for (const r of filtered) {
      const m = map.get(r.month) ?? { month: r.month, cv: 0, wonCv: 0, grossProfit: 0, revenue: 0 };
      m.cv += r.cv;
      m.wonCv += r.wonCv;
      m.grossProfit += r.grossProfit;
      m.revenue += r.revenue;
      map.set(r.month, m);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">CV発生日ベース</h1>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            sf_Lead.Field9__c（受付日）軸。広告成果と直接紐づく KPI ビュー。
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} today={TODAY} />
        <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全媒体</SelectItem>
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
          {refreshing ? '読み込み中…' : '再読み込み'}
        </Button>
      </div>

      {/* KPI ストリップ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile
          icon={Target}
          title="CV"
          value={numFormat.format(totals.cv)}
          sub={`成約 ${numFormat.format(totals.wonCv)}`}
        />
        <KpiTile
          icon={Home}
          title="CV室数"
          value={numFormat.format(totals.cvRooms)}
          sub={`成約 ${numFormat.format(totals.contractedRooms)}室`}
        />
        <KpiTile
          icon={Wallet}
          title="広告費用"
          value={jpyFormat.format(Math.round(totals.cost))}
          sub={`Imp ${numFormat.format(totals.impressions)}`}
        />
        <KpiTile
          icon={Coins}
          title="粗利"
          value={jpyFormat.format(Math.round(totals.grossProfit))}
          sub="自社物件はゼロ計上"
        />
        <KpiTile
          icon={TrendingUp}
          title="売上"
          value={jpyFormat.format(Math.round(totals.revenue))}
          sub="借主への請求額"
        />
      </div>

      {/* 月次トレンド */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">月別 CV / 成約 / 粗利 / 売上</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthLabel}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => jpyCompact.format(v)}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value, name) => {
                  const v = typeof value === 'number' ? value : Number(value);
                  if (!Number.isFinite(v)) return '—';
                  if (name === '粗利' || name === '売上') return jpyFormat.format(v);
                  return numFormat.format(v);
                }}
                labelFormatter={(label) =>
                  typeof label === 'string' ? formatMonthLabel(label) : ''
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="cv" name="CV" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="wonCv" name="成約CV" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="grossProfit" name="粗利" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="revenue" name="売上" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 媒体×月 詳細テーブル */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">媒体 × 月 詳細</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">読み込み中…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月</TableHead>
                  <TableHead>媒体</TableHead>
                  <TableHead className="text-right">Imp</TableHead>
                  <TableHead className="text-right">Click</TableHead>
                  <TableHead className="text-right">費用</TableHead>
                  <TableHead className="text-right">CV</TableHead>
                  <TableHead className="text-right">CV室数</TableHead>
                  <TableHead className="text-right">RD</TableHead>
                  <TableHead className="text-right">成約CV</TableHead>
                  <TableHead className="text-right">成約室数</TableHead>
                  <TableHead className="text-right">粗利</TableHead>
                  <TableHead className="text-right">売上</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={`${r.month}-${r.platform}-${i}`}>
                    <TableCell className="tabular-nums">{formatMonthLabel(r.month)}</TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1.5 text-xs"
                        style={{ color: PLATFORM_COLORS[r.platform] }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: PLATFORM_COLORS[r.platform] }}
                        />
                        {PLATFORM_LABELS[r.platform] ?? r.platform}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{numFormat.format(r.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numFormat.format(r.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{jpyFormat.format(Math.round(r.cost))}</TableCell>
                    <TableCell className="text-right tabular-nums">{numFormat.format(r.cv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numFormat.format(r.cvRooms)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numFormat.format(r.roomDays)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numFormat.format(r.wonCv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numFormat.format(r.contractedRooms)}</TableCell>
                    <TableCell className="text-right tabular-nums">{jpyFormat.format(Math.round(r.grossProfit))}</TableCell>
                    <TableCell className="text-right tabular-nums">{jpyFormat.format(Math.round(r.revenue))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums tracking-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-primary/8 shrink-0">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
