import { prisma } from '@/lib/prisma';
import type { NextRequest } from 'next/server';

export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return Response.json(campaigns);
  } catch (error) {
    console.error('キャンペーン一覧取得エラー:', error);
    return Response.json({ error: 'データの取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, platform, adType, monthlyBudget } = body;

    if (!name || !platform || !adType) {
      return Response.json({ error: 'name, platform, adType は必須です' }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        platform,
        adType,
        monthlyBudget: monthlyBudget ? Number(monthlyBudget) : null,
        status: 'active',
      },
    });

    return Response.json(campaign, { status: 201 });
  } catch (error) {
    console.error('キャンペーン作成エラー:', error);
    return Response.json({ error: 'キャンペーンの作成に失敗しました' }, { status: 500 });
  }
}
