import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const PLATFORMS = ['google', 'yahoo', 'bing'] as const;

export async function GET() {
  try {
    const logs = await prisma.syncLog.findMany({
      where: { platform: { in: [...PLATFORMS] }, status: { not: 'running' } },
      orderBy: { finishedAt: 'desc' },
      take: 20,
    });

    const result = PLATFORMS.map((platform) => {
      const latest = logs.find((l) => l.platform === platform || l.platform === 'all');
      if (!latest) {
        return { platform, lastSync: null, status: 'never' as const };
      }
      return {
        platform,
        lastSync: latest.finishedAt?.toISOString() ?? null,
        status: latest.status === 'success' ? ('success' as const) : ('failed' as const),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('同期ステータス取得エラー:', error);
    return NextResponse.json(
      PLATFORMS.map((platform) => ({ platform, lastSync: null, status: 'never' as const }))
    );
  }
}
