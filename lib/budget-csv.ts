/**
 * 予算 CSV のヘルパー (Issue #117)
 *
 * シンプル設計: 1 行 = 1 月分。ユーザーは「月次予算」と「週重み有効フラグ」を入力するだけ。
 * リタゲ等の固定費・0.9 補正・3 媒体均等割・営業日按分はロジック側で自動展開する。
 *
 * フォーマット:
 *   対象月,月次予算,週重み有効
 *   2026-06,5500000,true
 *   2026-07,5500000,false
 */

export type BudgetCsvRow = {
  month: string; // 'YYYY-MM-01'
  monthlyTotal: number;
  applyWeekWeight: boolean;
};

export const BUDGET_CSV_HEADER = ['対象月', '月次予算', '週重み有効'] as const;

function escapeCsvValue(v: string | number | boolean | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToCsvLine(r: BudgetCsvRow): string {
  return [r.month.slice(0, 7), r.monthlyTotal, r.applyWeekWeight ? 'true' : 'false']
    .map(escapeCsvValue)
    .join(',');
}

export function rowsToBudgetCsv(rows: BudgetCsvRow[]): string {
  const lines = [BUDGET_CSV_HEADER.join(','), ...rows.map(rowToCsvLine)];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        out.push(cur);
        cur = '';
      } else if (c === '"' && cur === '') {
        inQuote = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

function parseMonth(s: string): string | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(s.trim());
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseBool(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes' || t === 'はい' || t === 'on';
}

export type ParsedBudgetCsv =
  | { ok: true; rows: BudgetCsvRow[] }
  | { ok: false; errors: { line: number; message: string }[] };

export function parseBudgetCsv(text: string): ParsedBudgetCsv {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) {
    return { ok: false, errors: [{ line: 0, message: '空のファイルです' }] };
  }
  const header = parseCsvLine(lines[0]).map((s) => s.trim());
  const expected = [...BUDGET_CSV_HEADER];
  if (header.length < expected.length || header.some((h, i) => h !== expected[i])) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          message: `ヘッダーが想定と異なります。期待: ${expected.join(',')} / 実際: ${header.join(',')}`,
        },
      ],
    };
  }
  const rows: BudgetCsvRow[] = [];
  const errors: { line: number; message: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 3) {
      errors.push({ line: i + 1, message: `列数不足 (${cols.length})` });
      continue;
    }
    const month = parseMonth(cols[0]);
    if (!month) {
      errors.push({ line: i + 1, message: `対象月 が不正: '${cols[0]}'` });
      continue;
    }
    const monthlyTotal = parseNum(cols[1]);
    if (monthlyTotal == null || monthlyTotal <= 0) {
      errors.push({ line: i + 1, message: `月次予算 が不正: '${cols[1]}'` });
      continue;
    }
    rows.push({ month, monthlyTotal, applyWeekWeight: parseBool(cols[2]) });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}

/** テンプレ: 指定年の 12 ヶ月分 (月次予算は空) */
export function buildBudgetTemplateRows(year: number): BudgetCsvRow[] {
  const rows: BudgetCsvRow[] = [];
  for (let m = 1; m <= 12; m++) {
    rows.push({
      month: `${year}-${String(m).padStart(2, '0')}-01`,
      monthlyTotal: 0,
      applyWeekWeight: true,
    });
  }
  return rows;
}
