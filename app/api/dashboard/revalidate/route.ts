import { NextResponse } from 'next/server';
import { clearDashboardCache } from '@/lib/dashboard-cache';

export async function POST() {
  clearDashboardCache();
  return NextResponse.json({ ok: true });
}
