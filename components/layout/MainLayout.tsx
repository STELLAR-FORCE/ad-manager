'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Toaster } from 'sonner';
import { PageTransition } from '@/components/animate-ui/page-transition';
import { TooltipProvider } from '@/components/ui/tooltip';

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /** 初回読み込み完了後にtrue — アニメーションはこれがtrueの時だけ有効にする */
  ready: boolean;
};

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  ready: false,
});

export function useSidebarCollapsed() {
  return useContext(SidebarContext);
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  // 初回は localStorage から同期的に読む（SSR時は false）
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const stored = localStorage.getItem('sidebar_collapsed');
      if (stored === 'true') setCollapsed(true);
      // 次フレームでアニメーション有効化（初期状態の適用後）
      requestAnimationFrame(() => setReady(true));
    }
  }, []);

  useEffect(() => {
    if (initialized.current) {
      localStorage.setItem('sidebar_collapsed', String(collapsed));
    }
  }, [collapsed]);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, ready }}>
      <TooltipProvider delay={200}>
        <div className="flex min-h-screen items-start bg-slate-50">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <div className="p-6">
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
          <Toaster
            richColors
            closeButton
            position="top-right"
            duration={4000}
            toastOptions={{ classNames: { toast: 'rounded-lg' } }}
          />
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}
