/**
 * 目標値 CSV のヘルパー
 *
 * 業務側で扱いやすいよう 日本語ヘッダ + UTF-8 BOM で生成する。
 * Excel で開いても文字化けしない想定。
 *
 * フォーマット:
 *   対象月,媒体,軸,CV目標,CV室数目標,RD目標,粗利目標,売上目標,利用日数目標,成約数目標
 *   2026-01,,入居日,500,200,5000,10000000,15000000,5000,150
 *
 * - 対象月: 'YYYY-MM' or 'YYYY-MM-DD' (日は無視され月初に正規化)
 * - 媒体: 空 = 全体 / 'google' / 'yahoo' / 'bing'
 * - 軸: '入居日' or '発生日' (それぞれ movein/received にマップ)
 * - 数値カラム: 空 = 未入力 (既存値を維持)
 */

export type CsvAxis = 'movein' | 'received';

export type TargetCsvRow = {
  month: string;
  platform: string | null;
  axis: CsvAxis;
  cvTarget: number | null;
  roomTarget: number | null;
  roomDaysTarget: number | null;
  grossProfitTarget: number | null;
  revenueTarget: number | null;
  wonTarget: number | null;
};

// Issue #112: 利用日数目標 (use_days_target) は RD目標 (room_days_target) に統合済みのため列削除
export const CSV_HEADER = [
  '対象月',
  '媒体',
  '軸',
  'CV目標',
  'CV室数目標',
  'RD目標',
  '粗利目標',
  '売上目標',
  '成約数目標',
] as const;

const AXIS_JA_TO_KEY: Record<string, CsvAxis> = {
  入居日: 'movein',
  発生日: 'received',
  movein: 'movein',
  received: 'received',
};

const AXIS_KEY_TO_JA: Record<CsvAxis, string> = {
  movein: '入居日',
  received: '発生日',
};

const VALID_PLATFORMS = new Set(['google', 'yahoo', 'bing']);

function escapeCsvValue(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  // ダブルクオート / カンマ / 改行が含まれていればクオートで囲む
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 行をシリアライズ */
function rowToCsvLine(r: TargetCsvRow): string {
  return [
    r.month.slice(0, 7), // YYYY-MM
    r.platform ?? '',
    AXIS_KEY_TO_JA[r.axis],
    r.cvTarget,
    r.roomTarget,
    r.roomDaysTarget,
    r.grossProfitTarget,
    r.revenueTarget,
    r.wonTarget,
  ]
    .map(escapeCsvValue)
    .join(',');
}

/** TargetCsvRow[] を CSV テキスト (UTF-8 BOM 付き) に変換 */
export function rowsToCsv(rows: TargetCsvRow[]): string {
  const lines = [CSV_HEADER.join(','), ...rows.map(rowToCsvLine)];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** 簡易 CSV 行パーサ (ダブルクオート対応) */
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
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

function parsePlatform(s: string): { ok: true; value: string | null } | { ok: false } {
  const t = s.trim();
  if (t === '' || t === '全体') return { ok: true, value: null };
  if (VALID_PLATFORMS.has(t.toLowerCase())) return { ok: true, value: t.toLowerCase() };
  return { ok: false };
}

function parseAxis(s: string): CsvAxis | null {
  const t = s.trim();
  return AXIS_JA_TO_KEY[t] ?? null;
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(/,/g, ''); // 1,000 表記を許容
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ParsedCsvResult =
  | { ok: true; rows: TargetCsvRow[] }
  | { ok: false; errors: { line: number; message: string }[] };

/** CSV テキスト → TargetCsvRow[] (バリデーション付き) */
export function parseTargetCsv(text: string): ParsedCsvResult {
  // BOM 除去 + 改行統一
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) {
    return { ok: false, errors: [{ line: 0, message: '空のファイルです' }] };
  }
  // ヘッダー確認 (順序チェック)
  const header = parseCsvLine(lines[0]).map((s) => s.trim());
  const expected = [...CSV_HEADER];
  if (header.length !== expected.length || header.some((h, i) => h !== expected[i])) {
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

  const rows: TargetCsvRow[] = [];
  const errors: { line: number; message: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 9) {
      errors.push({ line: i + 1, message: `列数が不足しています (${cols.length} 列)` });
      continue;
    }
    const month = parseMonth(cols[0]);
    if (!month) {
      errors.push({ line: i + 1, message: `対象月 が不正: '${cols[0]}'` });
      continue;
    }
    const platformResult = parsePlatform(cols[1]);
    if (!platformResult.ok) {
      errors.push({ line: i + 1, message: `媒体 が不正: '${cols[1]}'` });
      continue;
    }
    const axis = parseAxis(cols[2]);
    if (!axis) {
      errors.push({ line: i + 1, message: `軸 が不正: '${cols[2]}' (入居日 / 発生日 のいずれか)` });
      continue;
    }
    const row: TargetCsvRow = {
      month,
      platform: platformResult.value,
      axis,
      cvTarget: parseNum(cols[3]),
      roomTarget: parseNum(cols[4]),
      roomDaysTarget: parseNum(cols[5]),
      grossProfitTarget: parseNum(cols[6]),
      revenueTarget: parseNum(cols[7]),
      wonTarget: parseNum(cols[8]),
    };
    // 全数値カラムが空 = 「入力しなかった行」とみなしてスキップ。
    // (媒体別行で何も入れてない / 媒体別管理しない月のためのテンプレ行)
    const allEmpty =
      row.cvTarget == null &&
      row.roomTarget == null &&
      row.roomDaysTarget == null &&
      row.grossProfitTarget == null &&
      row.revenueTarget == null &&
      row.wonTarget == null;
    if (allEmpty) continue;
    rows.push(row);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}

/**
 * テンプレート用: 指定年の 12 ヶ月 × (入居日/発生日) を全体目標で空欄生成 (24 行)。
 *
 * 業務的に媒体別の目標値は使わないので全体 (platform=null) のみ。
 * 必要になれば手動で行を追加して platform 列に google/yahoo/bing を入力する。
 */
export function buildTemplateRows(year: number): TargetCsvRow[] {
  const rows: TargetCsvRow[] = [];
  const axes: CsvAxis[] = ['movein', 'received'];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}-01`;
    for (const axis of axes) {
      rows.push({
        month,
        platform: null,
        axis,
        cvTarget: null,
        roomTarget: null,
        roomDaysTarget: null,
        grossProfitTarget: null,
        revenueTarget: null,
        wonTarget: null,
      });
    }
  }
  return rows;
}
