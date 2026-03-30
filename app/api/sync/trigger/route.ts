import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { platform } = body

    if (!platform) {
      return Response.json({ error: 'プラットフォームが指定されていません' }, { status: 400 })
    }

    const log = await prisma.syncLog.create({
      data: {
        platform,
        syncType: 'manual',
        status: 'running',
        message: '同期を開始しています…',
        startedAt: new Date(),
      },
    })

    // Simulate async completion after 3 seconds (fire-and-forget)
    const logId = log.id
    setTimeout(async () => {
      try {
        const success = Math.random() > 0.1 // 90% success rate simulation
        await prisma.syncLog.update({
          where: { id: logId },
          data: {
            status: success ? 'success' : 'failed',
            message: success
              ? `${platform} の同期が完了しました`
              : `${platform} の同期中にエラーが発生しました`,
            finishedAt: new Date(),
          },
        })
      } catch (err) {
        console.error('sync simulation error:', err)
      }
    }, 3000)

    return Response.json(log, { status: 201 })
  } catch (error) {
    console.error('sync trigger POST error:', error)
    return Response.json({ error: '同期の開始に失敗しました' }, { status: 500 })
  }
}
