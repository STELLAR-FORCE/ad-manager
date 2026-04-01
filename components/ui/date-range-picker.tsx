'use client';

import { useState } from 'react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isWithinInterval,
  isBefore,
  subDays,
  differenceInDays,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  getDay,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ─── 型 ─────────────────────────────────────────────────────

export type DateRange = { start: Date; end: Date };

export interface DateRangeValue {
  main: DateRange;
  compare?: DateRange;
  compareEnabled: boolean;
  preset?: string;
}

interface Props {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  today?: Date;
}

// ─── プリセット ─────────────────────────────────────────────

type PresetDef = { key: string; label: string; compute: (today: Date) => DateRange };

function mondayOf(d: Date): Date {
  const day = getDay(d);
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

const PRESETS: PresetDef[] = [
  { key: 'custom',          label: '任意',                       compute: (t) => ({ start: t, end: t }) },
  { key: 'today',           label: '今日',                       compute: (t) => ({ start: t, end: t }) },
  { key: 'yesterday',       label: '昨日',                       compute: (t) => { const d = subDays(t, 1); return { start: d, end: d }; } },
  { key: 'lastweek_all',    label: '先週（月〜日）',              compute: (t) => { const mon = mondayOf(subDays(t, 7)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { start: mon, end: sun }; } },
  { key: 'lastweek_biz',    label: '先週（月〜金）',              compute: (t) => { const mon = mondayOf(subDays(t, 7)); const fri = new Date(mon); fri.setDate(mon.getDate() + 4); return { start: mon, end: fri }; } },
  { key: 'last7d',          label: '過去7日間（今日を含まない）',  compute: (t) => ({ start: subDays(t, 7),  end: subDays(t, 1) }) },
  { key: 'last14d',         label: '過去14日間（今日を含まない）', compute: (t) => ({ start: subDays(t, 14), end: subDays(t, 1) }) },
  { key: 'last30d',         label: '過去30日間（今日を含まない）', compute: (t) => ({ start: subDays(t, 30), end: subDays(t, 1) }) },
  { key: 'thismonth_incl',  label: '今月（今日を含む）',          compute: (t) => ({ start: startOfMonth(t), end: t }) },
  { key: 'thismonth_excl',  label: '今月（今日を含まない）',      compute: (t) => ({ start: startOfMonth(t), end: subDays(t, 1) }) },
  { key: 'lastmonth',       label: '先月',                       compute: (t) => { const p = subMonths(t, 1); return { start: startOfMonth(p), end: endOfMonth(p) }; } },
  { key: 'alltime',         label: '全期間（アカウント開設から）', compute: (t) => ({ start: new Date('2024-01-01'), end: t }) },
];

// ─── ユーティリティ ─────────────────────────────────────────

function prevSamePeriod(main: DateRange): DateRange {
  const days = differenceInDays(main.end, main.start);
  const end = subDays(main.start, 1);
  const start = subDays(end, days);
  return { start, end };
}

function fmtDate(d: Date) {
  return format(d, 'yyyy/MM/dd');
}

function parseInput(s: string): Date | null {
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function triggerLabel(v: DateRangeValue): string {
  const preset = v.preset ? PRESETS.find((p) => p.key === v.preset)?.label : undefined;
  const range = `${fmtDate(v.main.start)}〜${fmtDate(v.main.end)}`;
  if (preset && preset !== '任意') return `${preset}　${range}`;
  return range;
}

// ─── カレンダーグリッド ─────────────────────────────────────

function buildWeeks(month: Date): Date[][] {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const days = eachDayOfInterval({
    start: startOfWeek(first, { weekStartsOn: 0 }),
    end: endOfWeek(last, { weekStartsOn: 0 }),
  });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

type Highlight = 'start' | 'end' | 'startend' | 'mid' | null;

function getHL(d: Date, sel: { start: Date; end?: Date } | null, hover: Date | null): Highlight {
  if (!sel) return null;
  const { start, end: rawEnd } = sel;
  const end = rawEnd ?? hover;
  if (!end) return isSameDay(d, start) ? 'start' : null;
  const [lo, hi] = isBefore(start, end) ? [start, end] : [end, start];
  if (isSameDay(d, lo) && isSameDay(d, hi)) return 'startend';
  if (isSameDay(d, lo)) return 'start';
  if (isSameDay(d, hi)) return 'end';
  if (isWithinInterval(d, { start: lo, end: hi })) return 'mid';
  return null;
}

interface MonthCalProps {
  month: Date;
  selecting: { start: Date; end?: Date } | null;
  hover: Date | null;
  today: Date;
  onClickDay: (d: Date) => void;
  onHoverDay: (d: Date | null) => void;
}

function MonthCal({ month, selecting, hover, today, onClickDay, onHoverDay }: MonthCalProps) {
  const weeks = buildWeeks(month);
  return (
    <div className="select-none w-[210px]">
      <p className="text-center text-sm font-medium mb-3">
        {format(month, 'yyyy年M月', { locale: ja })}
      </p>
      <div className="grid grid-cols-7">
        {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1">{d}</div>
        ))}
        {weeks.map((week, wi) =>
          week.map((day, di) => {
            const inMonth = isSameMonth(day, month);
            const hl = getHL(day, selecting, hover);
            const isToday = isSameDay(day, today);
            return (
              <div
                key={`${wi}-${di}`}
                className={cn(
                  'h-8 flex items-center justify-center cursor-pointer',
                  !inMonth && 'pointer-events-none',
                  hl === 'mid' && 'bg-blue-100',
                  hl === 'start' && 'bg-gradient-to-r from-transparent to-blue-100',
                  hl === 'end' && 'bg-gradient-to-l from-transparent to-blue-100',
                )}
                onMouseEnter={() => inMonth && onHoverDay(day)}
                onMouseLeave={() => onHoverDay(null)}
                onClick={() => inMonth && onClickDay(day)}
              >
                <span
                  className={cn(
                    'w-7 h-7 flex items-center justify-center rounded-full text-sm',
                    !inMonth && 'text-muted-foreground/25',
                    inMonth && !hl && 'hover:bg-muted',
                    (hl === 'start' || hl === 'end' || hl === 'startend') && 'bg-blue-600 text-white font-semibold',
                    isToday && !hl && 'ring-1 ring-blue-400',
                  )}
                >
                  {format(day, 'd')}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────

export function DateRangePicker({ value, onChange, today = new Date() }: Props) {
  const todayD = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [open, setOpen] = useState(false);
  const [draftMain, setDraftMain] = useState<{ start: Date; end?: Date }>({ ...value.main });
  const [draftCompare, setDraftCompare] = useState<DateRange>(value.compare ?? prevSamePeriod(value.main));
  const [compareEnabled, setCompareEnabled] = useState(value.compareEnabled);
  const [compareType, setCompareType] = useState<'prev' | 'custom'>('prev');
  const [preset, setPreset] = useState(value.preset ?? 'lastmonth');
  const [hover, setHover] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState(startOfMonth(value.main.start));

  const [msText, setMsText] = useState(fmtDate(value.main.start));
  const [meText, setMeText] = useState(fmtDate(value.main.end));
  const [csText, setCsText] = useState(fmtDate(draftCompare.start));
  const [ceText, setCeText] = useState(fmtDate(draftCompare.end));

  function syncCompare(main: { start: Date; end: Date }) {
    if (compareType === 'prev') {
      const c = prevSamePeriod(main);
      setDraftCompare(c);
      setCsText(fmtDate(c.start));
      setCeText(fmtDate(c.end));
    }
  }

  function handleOpen(o: boolean) {
    if (o) {
      const main = value.main;
      const comp = value.compare ?? prevSamePeriod(main);
      setDraftMain({ ...main });
      setDraftCompare(comp);
      setCompareEnabled(value.compareEnabled);
      setPreset(value.preset ?? 'lastmonth');
      setViewMonth(startOfMonth(main.start));
      setMsText(fmtDate(main.start)); setMeText(fmtDate(main.end));
      setCsText(fmtDate(comp.start)); setCeText(fmtDate(comp.end));
      setHover(null);
    }
    setOpen(o);
  }

  function handleDayClick(d: Date) {
    if (draftMain.end) {
      // 新規選択開始
      setDraftMain({ start: d });
      setMsText(fmtDate(d));
      setMeText('');
      setPreset('custom');
    } else {
      // 2回目クリック：end 確定
      const [s, e] = isBefore(draftMain.start, d) ? [draftMain.start, d] : [d, draftMain.start];
      const newMain = { start: s, end: e };
      setDraftMain(newMain);
      setMsText(fmtDate(s)); setMeText(fmtDate(e));
      syncCompare(newMain);
      setPreset('custom');
    }
  }

  function handlePreset(p: PresetDef) {
    const range = p.compute(todayD);
    setDraftMain(range);
    setMsText(fmtDate(range.start)); setMeText(fmtDate(range.end));
    setViewMonth(startOfMonth(range.start));
    setPreset(p.key);
    syncCompare(range);
  }

  function commitMainStart() {
    const d = parseInput(msText);
    if (d) { setDraftMain((prev) => ({ ...prev, start: d })); setViewMonth(startOfMonth(d)); }
    else setMsText(fmtDate(draftMain.start));
  }

  function commitMainEnd() {
    const d = parseInput(meText);
    if (d && draftMain.start) {
      const [s, e] = isBefore(draftMain.start, d) ? [draftMain.start, d] : [d, draftMain.start];
      const newMain = { start: s, end: e };
      setDraftMain(newMain);
      setMsText(fmtDate(s)); setMeText(fmtDate(e));
      syncCompare(newMain);
    } else {
      setMeText(draftMain.end ? fmtDate(draftMain.end) : '');
    }
  }

  function handleApply() {
    if (!draftMain.end) return;
    onChange({
      main: { start: draftMain.start, end: draftMain.end },
      compare: compareEnabled ? draftCompare : undefined,
      compareEnabled,
      preset,
    });
    setOpen(false);
  }

  const isIncomplete = !draftMain.end;
  const rightMonth = addMonths(viewMonth, 1);

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors tabular-nums whitespace-nowrap">
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="max-w-[260px] truncate">{triggerLabel(value)}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverContent align="end" className="p-0 w-auto" sideOffset={6}>
        <div className="flex" style={{ minWidth: 680 }}>

          {/* ─── 左：カレンダーパネル ─── */}
          <div className="flex-1 min-w-0">

            {/* 期間入力 */}
            <div className="px-4 pt-4 pb-3 border-b border-border space-y-2.5">
              {/* 表示期間 */}
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden="true" />
                <span className="text-xs font-medium w-14 shrink-0">表示期間</span>
                <input
                  className="h-7 w-[100px] rounded border border-input text-xs px-2 tabular-nums bg-background text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  value={msText}
                  onChange={(e) => setMsText(e.target.value)}
                  onBlur={commitMainStart}
                  placeholder="yyyy/mm/dd"
                />
                <span className="text-muted-foreground text-xs">〜</span>
                <input
                  className="h-7 w-[100px] rounded border border-input text-xs px-2 tabular-nums bg-background text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  value={meText}
                  onChange={(e) => setMeText(e.target.value)}
                  onBlur={commitMainEnd}
                  placeholder="yyyy/mm/dd"
                />
                {isIncomplete && (
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
                )}
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  <span className="text-xs text-muted-foreground">比較</span>
                  <button
                    role="switch"
                    aria-checked={compareEnabled}
                    onClick={() => setCompareEnabled((v) => !v)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                      compareEnabled ? 'bg-blue-500' : 'bg-input'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                        compareEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* 比較期間 */}
              {compareEnabled && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" aria-hidden="true" />
                  <select
                    className="h-7 rounded border border-input text-xs px-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    value={compareType}
                    onChange={(e) => {
                      const t = e.target.value as 'prev' | 'custom';
                      setCompareType(t);
                      if (t === 'prev' && draftMain.end) {
                        const c = prevSamePeriod({ start: draftMain.start, end: draftMain.end });
                        setDraftCompare(c);
                        setCsText(fmtDate(c.start));
                        setCeText(fmtDate(c.end));
                      }
                    }}
                  >
                    <option value="prev">直前の同期間</option>
                    <option value="custom">カスタム</option>
                  </select>
                  <input
                    className="h-7 w-[100px] rounded border border-input text-xs px-2 tabular-nums bg-background text-center focus:outline-none focus:ring-1 focus:ring-ring disabled:text-muted-foreground"
                    value={csText}
                    readOnly={compareType === 'prev'}
                    onChange={(e) => { setCsText(e.target.value); setCompareType('custom'); }}
                    onBlur={() => {
                      const d = parseInput(csText);
                      if (d) setDraftCompare((c) => ({ ...c, start: d }));
                      else setCsText(fmtDate(draftCompare.start));
                    }}
                    placeholder="yyyy/mm/dd"
                  />
                  <span className="text-muted-foreground text-xs">〜</span>
                  <input
                    className="h-7 w-[100px] rounded border border-input text-xs px-2 tabular-nums bg-background text-center focus:outline-none focus:ring-1 focus:ring-ring disabled:text-muted-foreground"
                    value={ceText}
                    readOnly={compareType === 'prev'}
                    onChange={(e) => { setCeText(e.target.value); setCompareType('custom'); }}
                    onBlur={() => {
                      const d = parseInput(ceText);
                      if (d) setDraftCompare((c) => ({ ...c, end: d }));
                      else setCeText(fmtDate(draftCompare.end));
                    }}
                    placeholder="yyyy/mm/dd"
                  />
                </div>
              )}
            </div>

            {/* カレンダー */}
            <div className="flex items-start gap-2 px-3 py-4">
              <button
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="mt-1 p-1 rounded hover:bg-muted transition-colors shrink-0"
                aria-label="前の月"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex gap-6 flex-1 justify-center">
                <MonthCal
                  month={viewMonth}
                  selecting={draftMain}
                  hover={hover}
                  today={todayD}
                  onClickDay={handleDayClick}
                  onHoverDay={setHover}
                />
                <MonthCal
                  month={rightMonth}
                  selecting={draftMain}
                  hover={hover}
                  today={todayD}
                  onClickDay={handleDayClick}
                  onHoverDay={setHover}
                />
              </div>
              <button
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="mt-1 p-1 rounded hover:bg-muted transition-colors shrink-0"
                aria-label="次の月"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* フッター */}
            <div className="flex items-center gap-3 px-4 py-3 border-t border-border">
              <Button
                size="sm"
                onClick={handleApply}
                disabled={isIncomplete}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                適用
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                キャンセル
              </Button>
            </div>
          </div>

          {/* ─── 右：プリセット ─── */}
          <div className="w-[200px] border-l border-border overflow-y-auto" style={{ maxHeight: 480 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className={cn(
                  'w-full text-left text-sm px-4 py-2.5 hover:bg-muted transition-colors',
                  preset === p.key && 'bg-blue-50 text-blue-700 font-medium'
                )}
                onClick={() => handlePreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
