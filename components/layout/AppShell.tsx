'use client';

import { usePathname } from 'next/navigation';
import { MainLayout } from './MainLayout';

const UNSHELLED_PATHS = ['/login'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isUnshelled = UNSHELLED_PATHS.some((p) => pathname?.startsWith(p));
  if (isUnshelled) return <>{children}</>;
  return <MainLayout>{children}</MainLayout>;
}
