import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)

  try {
    const logs = await prisma.syncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    })

    return Response.json(logs)
  } catch (error) {
    console.error('sync logs GET error:', error)
    return Response.json([])
  }
}
