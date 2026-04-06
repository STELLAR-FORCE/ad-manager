import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const dbPath = path.resolve(process.cwd(), 'prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

// 媒体種別 → platform / adType のマッピング
const PLATFORM_MAP: Record<string, { platform: string; adType: string; name: string }> = {
  'Google':          { platform: 'google', adType: 'search',  name: 'Google リスティング' },
  'Google(dgn)':     { platform: 'google', adType: 'display', name: 'Google ディスプレイ(DGN)' },
  'Google(display)': { platform: 'google', adType: 'display', name: 'Google ディスプレイ' },
  'Yahoo!':          { platform: 'yahoo',  adType: 'search',  name: 'Yahoo! リスティング' },
  'Yahoo!(display)': { platform: 'yahoo',  adType: 'display', name: 'Yahoo! ディスプレイ' },
  'Bing':            { platform: 'bing',   adType: 'search',  name: 'Bing リスティング' },
  'Bing(display)':   { platform: 'bing',   adType: 'display', name: 'Bing ディスプレイ' },
};

function parseNum(s: string): number {
  if (!s) return 0;
  // ¥ と , を除去
  return Number(s.replace(/[¥,]/g, '').trim()) || 0;
}

function parseDate(s: string): Date {
  // "2024/01/01", "2024/1/1", "2025-08-15" 形式
  const parts = s.includes('/') ? s.split('/') : s.split('-');
  const [y, m, d] = parts.map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function main() {
  const csvPath = path.resolve('/Users/stf59/Downloads/広告運用管理 - raw (2).csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  // ヘッダー行をスキップ
  const dataLines = lines.slice(1);

  // CSVをパース（コンマ区切りだが数値にカンマが含まれるので引用符考慮）
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  // 媒体種別ごとにキャンペーンを作成（既存があればスキップ）
  const campaignMap = new Map<string, string>(); // 媒体種別 → campaignId

  console.log('キャンペーン作成中…');
  for (const [mediaType, info] of Object.entries(PLATFORM_MAP)) {
    const existing = await prisma.campaign.findFirst({
      where: { name: info.name, platform: info.platform, adType: info.adType },
    });
    if (existing) {
      campaignMap.set(mediaType, existing.id);
      console.log(`  既存: ${info.name} (${existing.id})`);
    } else {
      const campaign = await prisma.campaign.create({
        data: {
          name: info.name,
          platform: info.platform,
          adType: info.adType,
          status: 'active',
        },
      });
      campaignMap.set(mediaType, campaign.id);
      console.log(`  作成: ${info.name} (${campaign.id})`);
    }
  }

  // 既存データをクリア
  await prisma.dailyMetric.deleteMany({});
  console.log('既存 DailyMetric をクリアしました');

  // DailyMetric を一括挿入
  console.log('DailyMetric インポート中…');
  const records = [];

  for (const line of dataLines) {
    const cols = parseLine(line);
    if (cols.length < 6) continue;

    const mediaType = cols[0];
    const info = PLATFORM_MAP[mediaType];
    if (!info) continue;

    const campaignId = campaignMap.get(mediaType);
    if (!campaignId) continue;

    const date = parseDate(cols[1]);
    const impressions = parseNum(cols[2]);
    const clicks = parseNum(cols[3]);
    const cost = parseNum(cols[4]);
    const conversions = parseNum(cols[5]);

    const ctr = impressions > 0 ? clicks / impressions : 0;
    const cpc = clicks > 0 ? cost / clicks : 0;
    const cpa = conversions > 0 ? cost / conversions : 0;

    records.push({ date, campaignId, platform: info.platform, impressions, clicks, cost, conversions, ctr, cpc, cpa });
  }

  // バッチサイズ200件ずつトランザクション挿入
  const BATCH = 200;
  let total = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    await prisma.$transaction(batch.map(r => prisma.dailyMetric.create({ data: r })));
    total += batch.length;
    process.stdout.write(`\r  ${total} / ${records.length}`);
  }
  console.log(`\n\n完了: ${total} 件挿入`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
