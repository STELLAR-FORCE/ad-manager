'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarRange, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

type Axis = 'movein' | 'received';
const AXIS_TABS: { key: Axis; label: string; hint: string }[] = [
  { key: 'movein', label: '入居日ベース', hint: '利用期間_始期 が期間内の集計に紐付く目標' },
  { key: 'received', label: '発生日ベース', hint: '受付日時 が期間内の集計に紐付く目標' },
];

const jpyFormat = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const numFormat = new Intl.NumberFormat('ja-JP');

type FieldKey =
  | 'grossProfitTarget'
  | 'roomDaysTarget'
  | 'cvTarget'
  | 'roomTarget'
  | 'wonTarget'
  | 'revenueTarget'
  | 'useDaysTarget';

const FIELDS: { key: FieldKey; label: string; placeholder: string; unit: string; format: (v: number) => string }[] = [
  {
    key: 'grossProfitTarget',
    label: '粗利',
    placeholder: '例: 100000000',
    unit: '円',
    format: (v) => jpyFormat.format(v),
  },
  {
    key: 'roomDaysTarget',
    label: 'ルームデイズ',
    placeholder: '例: 20000',
    unit: 'RD',
    format: (v) => numFormat.format(v) + ' RD',
  },
  {
    key: 'cvTarget',
    label: 'CV 数',
    placeholder: '例: 5000',
    unit: '件',
    format: (v) => numFormat.format(v) + ' 件',
  },
  {
    key: 'roomTarget',
    label: 'CV 室数',
    placeholder: '例: 1800',
    unit: '室',
    format: (v) => numFormat.format(v) + ' 室',
  },
  {
    key: 'wonTarget',
    label: '成約数',
    placeholder: '例: 200',
    unit: '件',
    format: (v) => numFormat.format(v) + ' 件',
  },
  {
    key: 'revenueTarget',
    label: '売上',
    placeholder: '例: 500000000',
    unit: '円',
    format: (v) => jpyFormat.format(v),
  },
  {
    key: 'useDaysTarget',
    label: '利用日数',
    placeholder: '例: 18000',
    unit: '日',
    format: (v) => numFormat.format(v) + ' 日',
  },
];

export function YearlyTargetForm({ onSaved }: { onSaved?: () => void }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [axis, setAxis] = useState<Axis>('movein');
  // axis ごとに入力値を分けて保持。タブ切替時の入力消失を防ぐ
  const [valuesByAxis, setValuesByAxis] = useState<Record<Axis, Partial<Record<FieldKey, string>>>>({
    movein: {},
    received: {},
  });
  const values = valuesByAxis[axis];
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function update(key: FieldKey, value: string) {
    setValuesByAxis((prev) => ({
      ...prev,
      [axis]: { ...prev[axis], [key]: value },
    }));
    setMessage(null);
  }

  function clear() {
    setValuesByAxis((prev) => ({ ...prev, [axis]: {} }));
    setMessage(null);
  }

  async function save() {
    // 入力されたフィールドのみ送信
    const payload: Record<string, number | string | null> = { year, platform: null, axis };
    let hasInput = false;
    for (const { key } of FIELDS) {
      const v = values[key];
      if (v != null && v !== '') {
        const n = Number(v.replace(/[^0-9.-]/g, ''));
        if (Number.isFinite(n)) {
          payload[key] = n;
          hasInput = true;
        }
      }
    }
    if (!hasInput) {
      setMessage({ type: 'error', text: '少なくとも 1 つの目標値を入力してください' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/targets/yearly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const axisLabel = axis === 'movein' ? '入居日ベース' : '発生日ベース';
      setMessage({
        type: 'success',
        text: `${year}年 / ${axisLabel} の目標を 12 ヶ月に均等に分けて保存しました`,
      });
      setValuesByAxis((prev) => ({ ...prev, [axis]: {} }));
      onSaved?.();
    } catch (err) {
      setMessage({
        type: 'error',
        text: `保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />
          年次目標を一括入力
        </CardTitle>
        <p className="text-xs text-muted-foreground/70 mt-1">
          入力した年次目標を 12 ヶ月に均等に分けて保存します。集計軸（入居日 / 発生日）ごとに別々に保存されます。月別の個別調整は下の月別テーブルで可能です。
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label htmlFor="yearly-target-year" className="text-sm shrink-0">
              対象年
            </label>
            <Input
              id="yearly-target-year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              min={2020}
              max={2100}
              className="w-24 h-8 text-sm"
            />
          </div>
          <div className="flex gap-1" role="tablist" aria-label="集計軸">
            {AXIS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={axis === tab.key}
                title={tab.hint}
                onClick={() => {
                  setAxis(tab.key);
                  setMessage(null);
                }}
                className={cn(
                  'text-xs px-3 py-1 rounded-md transition-colors',
                  axis === tab.key
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FIELDS.map(({ key, label, placeholder, unit, format }) => {
            const v = values[key];
            const num = v != null && v !== '' ? Number(v.replace(/[^0-9.-]/g, '')) : null;
            const monthly = num != null && Number.isFinite(num) ? Math.floor(num / 12) : null;
            return (
              <div key={key} className="space-y-1">
                <label htmlFor={`yearly-${key}`} className="text-xs text-muted-foreground">
                  {label}（年次）
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id={`yearly-${key}`}
                    type="text"
                    inputMode="numeric"
                    value={v ?? ''}
                    placeholder={placeholder}
                    onChange={(e) => update(key, e.target.value)}
                    className="h-8 text-sm tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground/70 shrink-0">{unit}</span>
                </div>
                {monthly != null && (
                  <p className="text-[10px] text-muted-foreground/60 tabular-nums flex items-center gap-1">
                    <Calculator className="h-2.5 w-2.5" aria-hidden="true" />
                    月平均 {format(monthly)}（12月で端数調整）
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? '保存中…' : '12 ヶ月に均等に分けて保存'}
          </Button>
          <Button onClick={clear} variant="outline" size="sm" disabled={saving}>
            クリア
          </Button>
          {message && (
            <span
              className={
                message.type === 'success'
                  ? 'text-xs text-green-600'
                  : 'text-xs text-red-600'
              }
            >
              {message.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
