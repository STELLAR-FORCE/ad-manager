import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const platform = searchParams.get('platform') ?? ''
  const excluded = searchParams.get('excluded') ?? ''
  const sort = searchParams.get('sort') ?? 'cost'
  const order = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc'

  const allowedSorts = ['impressions', 'clicks', 'cost', 'conversions', 'ctr', 'cpa']
  const sortField = allowedSorts.includes(sort) ? sort : 'cost'

  try {
    const where: Record<string, unknown> = {}
    if (platform) where.platform = platform
    if (excluded === 'true') where.isExcluded = true
    if (excluded === 'false') where.isExcluded = false

    const terms = await prisma.searchTermReport.findMany({
      where,
      orderBy: { [sortField]: order },
      take: 500,
    })

    return Response.json(terms)
  } catch (error) {
    console.error('search-terms GET error:', error)
    return Response.json([])
  }
}
