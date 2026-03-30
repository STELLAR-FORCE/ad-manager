import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const platform = searchParams.get('platform') ?? ''
  const status = searchParams.get('status') ?? ''

  try {
    const creatives = await prisma.creative.findMany({
      where: {
        ...(status ? { status } : {}),
        adGroup: {
          campaign: {
            ...(platform ? { platform } : {}),
          },
        },
      },
      include: {
        adGroup: {
          include: {
            campaign: {
              select: { platform: true, name: true },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
    })

    return Response.json(creatives)
  } catch (error) {
    console.error('creatives GET error:', error)
    return Response.json([])
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      type,
      adGroupId,
      headline1,
      headline2,
      headline3,
      description1,
      description2,
      changedBy = 'システム',
    } = body

    if (!name || !type || !adGroupId) {
      return Response.json({ error: '必須項目が不足しています' }, { status: 400 })
    }

    const creative = await prisma.creative.create({
      data: {
        name,
        type,
        adGroupId,
        headline1,
        headline2,
        headline3,
        description1,
        description2,
        status: 'active',
      },
      include: {
        adGroup: {
          include: {
            campaign: { select: { platform: true, name: true } },
          },
        },
      },
    })

    await prisma.creativeHistory.create({
      data: {
        creativeId: creative.id,
        changedBy,
        changeType: 'created',
        afterData: JSON.stringify({
          name,
          type,
          headline1,
          headline2,
          headline3,
          description1,
          description2,
        }),
        note: '新規作成',
      },
    })

    return Response.json(creative, { status: 201 })
  } catch (error) {
    console.error('creatives POST error:', error)
    return Response.json({ error: '作成に失敗しました' }, { status: 500 })
  }
}
