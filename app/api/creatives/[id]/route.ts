import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { changedBy = 'システム', ...updates } = body

    const before = await prisma.creative.findUnique({ where: { id } })
    if (!before) {
      return Response.json({ error: 'クリエイティブが見つかりません' }, { status: 404 })
    }

    const updated = await prisma.creative.update({
      where: { id },
      data: updates,
      include: {
        adGroup: {
          include: {
            campaign: { select: { platform: true, name: true } },
          },
        },
      },
    })

    const changeType =
      updates.status === 'paused'
        ? 'paused'
        : updates.status === 'active'
        ? 'resumed'
        : 'updated'

    await prisma.creativeHistory.create({
      data: {
        creativeId: id,
        changedBy,
        changeType,
        beforeData: JSON.stringify(before),
        afterData: JSON.stringify(updated),
      },
    })

    return Response.json(updated)
  } catch (error) {
    console.error('creatives PATCH error:', error)
    return Response.json({ error: '更新に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const before = await prisma.creative.findUnique({ where: { id } })
    if (!before) {
      return Response.json({ error: 'クリエイティブが見つかりません' }, { status: 404 })
    }

    const updated = await prisma.creative.update({
      where: { id },
      data: { status: 'removed' },
    })

    await prisma.creativeHistory.create({
      data: {
        creativeId: id,
        changedBy: 'システム',
        changeType: 'removed',
        beforeData: JSON.stringify(before),
        afterData: JSON.stringify(updated),
        note: '削除（ステータス変更）',
      },
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error('creatives DELETE error:', error)
    return Response.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
