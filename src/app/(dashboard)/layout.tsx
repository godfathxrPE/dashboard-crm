'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useUiStore } from '@/lib/stores/ui-store';
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
      <Sidebar />
      <div
        className={cn(
          'transition-all duration-200',
          sidebarOpen ? 'ml-56' : 'ml-16',
        )}
      >
        <Header />
        <main id="main-content" className="p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette />
      <Hotkeys />
    </div>
  );
}
