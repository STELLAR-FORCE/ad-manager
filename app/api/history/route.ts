import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type') ?? ''
  const days = parseInt(searchParams.get('days') ?? '30', 10)
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = 20

  const since = new Date()
  since.setDate(since.getDate() - days)

  try {
    const where = {
      changedAt: { gte: since },
      ...(type ? { changeType: type } : {}),
    }

    const [total, histories] = await Promise.all([
      prisma.creativeHistory.count({ where }),
      prisma.creativeHistory.findMany({
        where,
        include: {
          creative: { select: { name: true } },
        },
        orderBy: { changedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return Response.json({
      histories,
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('history GET error:', error)
    return Response.json({ histories: [], total: 0, page: 1, pages: 0 })
  }
}
