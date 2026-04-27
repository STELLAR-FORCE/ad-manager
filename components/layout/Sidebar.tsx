'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Layers,
  FileText,
  KeyRound,
  Image,
  Search,
  Wallet,
  History,
  RefreshCw,
  Bot,
  Briefcase,
  Circle,
  CheckCircle2,
  XCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useSidebarCollapsed } from './MainLayout';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
};

type NavSection = {
  label: string | null;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: null,
    items: [{ href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard }],
  },
  {
    label: '運用管理',
    items: [
      { href: '/campaigns', label: 'キャンペーン', icon: TrendingUp },
      { href: '/ad-groups', label: '広告グループ', icon: Layers },
      { href: '/ads', label: '広告', icon: FileText },
      { href: '/keywords', label: 'キーワード', icon: KeyRound },
      { href: '/creatives', label: 'クリエイティブ', icon: Image },
      { href: '/budget', label: '予算管理', icon: Wallet },
    ],
  },
  {
    label: '分析',
    items: [
      { href: '/search-terms', label: '検索語句分析', icon: Search },
      { href: '/salesforce', label: '営業パイプライン', icon: Briefcase, badge: 'BETA' },
      { href: '/history', label: '変更履歴', icon: History },
    ],
  },
  {
    label: 'ツール',
    items: [
      { href: '/sync', label: 'データ同期', icon: RefreshCw },
      { href: '/ai-advisor', label: 'AIアドバイザー', icon: Bot, badge: 'BETA' },
    ],
  },
];

type SyncStatus = {
  platform: string;
  lastSync: string | null;
  status: 'success' | 'failed' | 'never';
};

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google',
  yahoo: 'Yahoo!',
  bing: 'Bing',
};

function PlatformStatusIcon({ status }: { status: SyncStatus['status'] }) {
  if (status === 'success') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" aria-hidden="true" />;
  }
  if (status === 'failed') {
    return <XCircle className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />;
  }
  return <Circle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />;
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return '未接続';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffM = Math.floor(diffMs / 60_000);
  if (diffM < 1) return 'たった今';
  if (diffM < 60) return `${diffM}分前`;
  if (diffH < 24) return `${diffH}時間前`;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(d);
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, ready } = useSidebarCollapsed();
  const reducedMotion = usePrefersReducedMotion();
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([
    { platform: 'google', lastSync: null, status: 'never' },
    { platform: 'yahoo', lastSync: null, status: 'never' },
    { platform: 'bing', lastSync: null, status: 'never' },
  ]);

  useEffect(() => {
    fetch('/api/sync/status')
      .then((r) => r.json())
      .then((data: SyncStatus[]) => {
        if (Array.isArray(data)) setSyncStatuses(data);
      })
      .catch(() => {});
  }, []);

  // ready がtrueになるまでアニメーションなし（初期フラッシュ防止）
  // prefers-reduced-motion の場合も無効化
  const animate = ready && !reducedMotion;

  return (
    <aside
      className={cn(
        'sticky top-0 h-screen shrink-0 bg-sidebar text-sidebar-foreground flex flex-col overflow-hidden',
        collapsed ? 'w-16' : 'w-60',
        animate && 'transition-[width] duration-300 ease-in-out',
      )}
    >
      {/* ロゴ + 折りたたみボタン */}
      <div className={cn('border-b border-sidebar-border', collapsed ? 'px-2 py-3' : 'p-4')}>
        {collapsed ? (
          /* 折りたたみ時: ロゴとボタンを縦に中央寄せ */
          <div className="flex flex-col items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sidebar-primary">
              <TrendingUp className="h-4 w-4 text-sidebar-primary-foreground" aria-hidden="true" />
            </div>
            <button
              onClick={() => setCollapsed(false)}
              className="p-1 rounded-md hover:bg-sidebar-accent transition-colors duration-150"
              aria-label="サイドバーを展開"
            >
              <PanelLeftOpen className="h-4 w-4 text-sidebar-foreground/50" />
            </button>
          </div>
        ) : (
          /* 展開時: 横並び */
          <>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-sidebar-primary shrink-0">
                <TrendingUp className="h-4 w-4 text-sidebar-primary-foreground" aria-hidden="true" />
              </div>
              <span className="font-bold text-base tracking-tight whitespace-nowrap">
                Ad Manager
              </span>
              <button
                onClick={() => setCollapsed(true)}
                className="p-1 rounded-md hover:bg-sidebar-accent transition-colors duration-150 ml-auto shrink-0"
                aria-label="サイドバーを折りたたむ"
              >
                <PanelLeftClose className="h-4 w-4 text-sidebar-foreground/50" />
              </button>
            </div>
            <p className="text-xs text-sidebar-foreground/50 mt-1 pl-0.5">
              広告管理ツール
            </p>
          </>
        )}
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-4 space-y-5 overflow-y-auto overflow-x-hidden" aria-label="メインナビゲーション">
        {navSections.map((section, si) => (
          <div key={si}>
            {section.label && (
              <div
                className={cn(
                  'overflow-hidden whitespace-nowrap',
                  animate && 'transition-[opacity,max-height] duration-300 ease-in-out',
                  collapsed ? 'opacity-0 max-h-0' : 'opacity-100 max-h-6',
                )}
              >
                <p className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider px-3 mb-1.5">
                  {section.label}
                </p>
              </div>
            )}
            {section.label && collapsed && (
              <div className="h-px bg-sidebar-border mx-2 mb-2" />
            )}
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon, badge }) => {
                const isActive =
                  pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    className={cn(
                      'flex items-center rounded-lg text-sm',
                      animate && 'transition-colors duration-150',
                      collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span
                      className={cn(
                        'flex-1 whitespace-nowrap overflow-hidden',
                        animate && 'transition-[opacity,max-width,transform] duration-300 ease-in-out',
                        collapsed ? 'opacity-0 max-w-0 -translate-x-1' : 'opacity-100 max-w-48 translate-x-0',
                      )}
                    >
                      {label}
                    </span>
                    {!collapsed && badge && (
                      <Badge
                        variant="secondary"
                        size="sm"
                        className="bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-border"
                      >
                        {badge}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 媒体接続ステータス */}
      <div className={cn('border-t border-sidebar-border', collapsed ? 'px-2 py-4' : 'p-4')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            {syncStatuses.map(({ platform, status }) => (
              <div key={platform} title={`${PLATFORM_LABELS[platform]}: ${status === 'success' ? '接続済み' : status === 'failed' ? 'エラー' : '未接続'}`}>
                <PlatformStatusIcon status={status} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2.5">
              媒体接続状態
            </p>
            <div className="space-y-2">
              {syncStatuses.map(({ platform, lastSync, status }) => (
                <div key={platform} className="flex items-center gap-2">
                  <PlatformStatusIcon status={status} />
                  <span className="text-xs text-sidebar-foreground/60 flex-1">
                    {PLATFORM_LABELS[platform]}
                  </span>
                  <span className="text-xs text-sidebar-foreground/30">
                    {formatSyncTime(lastSync)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
