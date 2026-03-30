import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { isExcluded } = body

    if (typeof isExcluded !== 'boolean') {
      return Response.json({ error: '無効なパラメータです' }, { status: 400 })
    }

    const updated = await prisma.searchTermReport.update({
      where: { id },
      data: { isExcluded },
    })

    return Response.json(updated)
  } catch (error) {
    console.error('search-terms PATCH error:', error)
    return Response.json({ error: '更新に失敗しました' }, { status: 500 })
  }
}
