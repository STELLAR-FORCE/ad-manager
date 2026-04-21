import type { NextRequest } from 'next/server';

export async function POST(_request: NextRequest) {
  return Response.json(
    {
      error:
        '手動同期は現在無効です。データ同期は Cloud Scheduler から自動実行されています。',
    },
    { status: 501 },
  );
}
