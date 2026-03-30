import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'asc' },
    })

    const startDate = new Date(`${month}-01T00:00:00.000Z`)
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + 1)

    const metrics = await prisma.dailyMetric.groupBy({
      by: ['campaignId'],
      where: {
        date: {
          gte: startDate,
          lt: endDate,
        },
      },
      _sum: {
        cost: true,
      },
    })

    const spentByCampaign = new Map<string, number>(
      metrics.map((m) => [m.campaignId ?? '', Number(m._sum.cost ?? 0)])
    )

    const result = campaigns.map((c) => {
      const spent: number = spentByCampaign.get(c.id) ?? 0
      const budget: number = Number(c.monthlyBudget ?? 0)
      const remaining = Math.max(0, budget - spent)
      const utilization = budget > 0 ? (spent / budget) * 100 : 0

      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        adType: c.adType,
        status: c.status,
        monthlyBudget: budget,
        spent,
        remaining,
        utilization,
      }
    })

    return Response.json({ month, campaigns: result })
  } catch (error) {
    console.error('budget GET error:', error)
    return Response.json({ month, campaigns: [] })
  }
}
