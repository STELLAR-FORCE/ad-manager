'use client';

import { Sidebar } from './Sidebar';
import { Toaster } from 'sonner';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
