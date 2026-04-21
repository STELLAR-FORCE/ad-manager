import type { NextRequest } from 'next/server';

export async function PATCH(_request: NextRequest) {
  return Response.json(
    { error: 'BigQuery は読み取り専用です。予算の更新は広告プラットフォーム側で行ってください。' },
    { status: 501 },
  );
}
