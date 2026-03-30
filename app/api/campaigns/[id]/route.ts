import { prisma } from '@/lib/prisma';
import type { NextRequest } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, platform, adType, monthlyBudget, status } = body;

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(platform !== undefined && { platform }),
        ...(adType !== undefined && { adType }),
        ...(monthlyBudget !== undefined && { monthlyBudget: monthlyBudget ? Number(monthlyBudget) : null }),
        ...(status !== undefined && { status }),
      },
    });

    return Response.json(campaign);
  } catch (error) {
    console.error('キャンペーン更新エラー:', error);
    return Response.json({ error: 'キャンペーンの更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.campaign.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('キャンペーン削除エラー:', error);
    return Response.json({ error: 'キャンペーンの削除に失敗しました' }, { status: 500 });
  }
}
