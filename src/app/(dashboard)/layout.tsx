'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { ScandiSidebar } from '@/components/layout/ScandiSidebar';
import { ScandiContentHeader } from '@/components/layout/ScandiContentHeader';
import { Header } from '@/components/layout/Header';
import { useUiStore } from '@/lib/stores/ui-store';
import { useThemeStore } from '@/lib/stores/theme-store';
import { cn } from '@/lib/utils/cn';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { Hotkeys } from '@/components/shared/Hotkeys';
import { getSectionFromPath } from '@/lib/section-colors';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const theme = useThemeStore((s) => s.theme);
  const isScandi = theme === 't-scandi';
  const pathname = usePathname();
  const section = getSectionFromPath(pathname);

  return (
    <div className="min-h-screen bg-bg" data-section={section}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Перейти к содержимому
      </a>

      {isScandi ? <ScandiSidebar /> : <Sidebar />}

      <div
        className={cn(
          'transition-all duration-200',
          isScandi ? (sidebarOpen ? 'ml-[232px]' : 'ml-14') : sidebarOpen ? 'ml-56' : 'ml-16',
        )}
      >
        {!isScandi && <Header />}
        <main id="main-content" className="p-4 md:p-6">
          {isScandi && <ScandiContentHeader />}
          {children}
        </main>
      </div>
      <CommandPalette />
      <Hotkeys />
    </div>
  );
}
