'use client';

/**
 * Issue #63 — 日次CV詳細ビュー
 * gid=335163595 / gid=554788506 グラフ相当。日次の検索エンジン × CV/室数/コスト + 累積。
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
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker';
import { RefreshCw } from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { jpyCompact, jpyFormat, numFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

type Platform = 'all' | 'google' | 'yahoo' | 'bing';
type DailyMode = 'cumulative' | 'daily';

type Row = {
  date: string;
  platform: 'google' | 'yahoo' | 'bing' | 'other';
  cv: number;
  rooms: number;
  cost: number;
  cumulativeCv: number;
  cumulativeRooms: number;
  cumulativeCost: number;
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
const dateShort = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });

/** Recharts Tooltip formatter は ValueType (string|number|...) を取るので number 用にラップする */
function fmtNum(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? numFormat.format(n) : '—';
}
function fmtRoom(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? `${numFormat.format(n)} 室` : '—';
}
function fmtJpy(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? jpyFormat.format(n) : '—';
}

function defaultRange(): DateRangeValue {
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  return { main: { start, end: TODAY }, compareEnabled: false, preset: 'thismonth' };
}

export default function CvDailyPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultRange);
  const [platform, setPlatform] = useState<Platform>('all');
  const [mode, setMode] = useState<DailyMode>('cumulative');
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
      const res = await fetch(`/api/dashboard/cv-daily?${params}`);
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

  // 日付 × 媒体 のクロス集計をチャート向けに整形
  const chartData = useMemo(() => {
    const filtered = platform === 'all' ? rows : rows.filter((r) => r.platform === platform);
    const dates = Array.from(new Set(filtered.map((r) => r.date))).sort();
    return dates.map((date) => {
      const point: Record<string, number | string> = { date, label: dateShort.format(new Date(date)) };
      for (const r of filtered) {
        if (r.date !== date) continue;
        const prefix = mode === 'cumulative' ? 'cum_' : '';
        point[`${prefix}cv_${r.platform}`] =
          mode === 'cumulative' ? r.cumulativeCv : r.cv;
        point[`${prefix}rooms_${r.platform}`] =
          mode === 'cumulative' ? r.cumulativeRooms : r.rooms;
        point[`${prefix}cost_${r.platform}`] =
          mode === 'cumulative' ? r.cumulativeCost : r.cost;
      }
      return point;
    });
  }, [rows, platform, mode]);

  const platformsToShow = (
    platform === 'all' ? (['google', 'yahoo', 'bing'] as const) : [platform]
  ) as readonly ('google' | 'yahoo' | 'bing')[];

  const prefix = mode === 'cumulative' ? 'cum_' : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">日次CV詳細</h1>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            CV発生日ベースの日次推移。媒体別の累積 / 日次を切り替えて表示。
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
        <Select value={mode} onValueChange={(v) => setMode(v as DailyMode)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cumulative">累積</SelectItem>
            <SelectItem value="daily">日次</SelectItem>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{mode === 'cumulative' ? '累積' : '日次'} CV 推移</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              {mode === 'cumulative' ? (
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => numFormat.format(v)} />
                  <Tooltip formatter={fmtNum} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {platformsToShow.map((p) => (
                    <Area
                      key={p}
                      type="monotone"
                      dataKey={`${prefix}cv_${p}`}
                      name={PLATFORM_LABELS[p]}
                      stackId="cv"
                      stroke={PLATFORM_COLORS[p]}
                      fill={PLATFORM_COLORS[p]}
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => numFormat.format(v)} />
                  <Tooltip formatter={fmtNum} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {platformsToShow.map((p) => (
                    <Line
                      key={p}
                      type="monotone"
                      dataKey={`${prefix}cv_${p}`}
                      name={PLATFORM_LABELS[p]}
                      stroke={PLATFORM_COLORS[p]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{mode === 'cumulative' ? '累積' : '日次'} 室数 推移</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              {mode === 'cumulative' ? (
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => numFormat.format(v)} />
                  <Tooltip formatter={fmtRoom} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {platformsToShow.map((p) => (
                    <Area
                      key={p}
                      type="monotone"
                      dataKey={`${prefix}rooms_${p}`}
                      name={PLATFORM_LABELS[p]}
                      stackId="rooms"
                      stroke={PLATFORM_COLORS[p]}
                      fill={PLATFORM_COLORS[p]}
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => numFormat.format(v)} />
                  <Tooltip formatter={fmtRoom} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {platformsToShow.map((p) => (
                    <Line
                      key={p}
                      type="monotone"
                      dataKey={`${prefix}rooms_${p}`}
                      name={PLATFORM_LABELS[p]}
                      stroke={PLATFORM_COLORS[p]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{mode === 'cumulative' ? '累積' : '日次'} コスト 推移</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            {mode === 'cumulative' ? (
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => jpyCompact.format(v)} />
                <Tooltip formatter={fmtJpy} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {platformsToShow.map((p) => (
                  <Area
                    key={p}
                    type="monotone"
                    dataKey={`${prefix}cost_${p}`}
                    name={PLATFORM_LABELS[p]}
                    stackId="cost"
                    stroke={PLATFORM_COLORS[p]}
                    fill={PLATFORM_COLORS[p]}
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => jpyCompact.format(v)} />
                <Tooltip formatter={fmtJpy} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {platformsToShow.map((p) => (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={`${prefix}cost_${p}`}
                    name={PLATFORM_LABELS[p]}
                    stroke={PLATFORM_COLORS[p]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {loading && rows.length === 0 && (
        <p className="text-center text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}
