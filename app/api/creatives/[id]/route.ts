import type { NextRequest } from 'next/server';

export async function PATCH(_request: NextRequest) {
  return Response.json(
    { error: 'BigQuery は読み取り専用です。広告の更新は広告プラットフォーム側で行ってください。' },
    { status: 501 },
  );
}

export async function DELETE(_request: NextRequest) {
  return Response.json(
    { error: 'BigQuery は読み取り専用です。広告の削除は広告プラットフォーム側で行ってください。' },
    { status: 501 },
  );
}
