import type { NextRequest } from 'next/server';

export async function PUT(_request: NextRequest) {
  return Response.json(
    { error: 'BigQuery は読み取り専用です。キャンペーン更新は広告プラットフォーム側で行ってください。' },
    { status: 501 },
  );
}

export async function DELETE(_request: NextRequest) {
  return Response.json(
    { error: 'BigQuery は読み取り専用です。キャンペーン削除は広告プラットフォーム側で行ってください。' },
    { status: 501 },
  );
}
