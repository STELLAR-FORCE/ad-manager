import type { NextRequest } from 'next/server';

export async function GET(_request: NextRequest) {
  return Response.json({ histories: [], total: 0, page: 1, pages: 0 });
}
