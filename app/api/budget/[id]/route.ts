import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { monthlyBudget } = body

    if (typeof monthlyBudget !== 'number' || monthlyBudget < 0) {
      return Response.json({ error: '無効な予算値です' }, { status: 400 })
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: { monthlyBudget },
    })

    return Response.json(updated)
  } catch (error) {
    console.error('budget PATCH error:', error)
    return Response.json({ error: '更新に失敗しました' }, { status: 500 })
  }
}
