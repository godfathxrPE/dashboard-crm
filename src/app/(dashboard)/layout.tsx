'use client';

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TextNavSidebar } from '@/components/layout/TextNavSidebar';
import { ContentHeader } from '@/components/layout/ContentHeader';
import { ActivityDrawer } from '@/components/layout/ActivityDrawer';
import { EventReminder } from '@/components/layout/EventReminder';
import { AuraOrbs } from '@/components/layout/AuraOrbs';
import { useUiStore } from '@/lib/stores/ui-store';
import { useDrawerStore } from '@/lib/stores/drawer-store';
import { cn } from '@/lib/utils/cn';
import PageTransition from '@/components/layout/PageTransition';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { Hotkeys } from '@/components/shared/Hotkeys';
import { getSectionFromPath } from '@/lib/section-colors';

// W4a: модалки открываются по хоткею/действию — первому чанку shell не нужны.
// CommandPalette остаётся статикой: ⌘K должен открываться мгновенно.
const QuickActionModals = dynamic(
  () => import('@/components/shared/QuickActionModals').then((m) => m.QuickActionModals),
  { ssr: false },
);
const GlobalModals = dynamic(
  () => import('@/components/shared/GlobalModals').then((m) => m.GlobalModals),
  { ssr: false },
);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  // AUDIT C6: единый shell для всех тем — вертикальное текстовое меню
  // (TextNavSidebar) + ContentHeader. Тёмные темы отличаются токенами, не скелетом.
  const drawerOpen = useDrawerStore((s) => s.isOpen);
  const pathname = usePathname();
  const section = getSectionFromPath(pathname);

  return (
    <div className="min-h-screen bg-bg" data-section={section}>
      <AuraOrbs />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Перейти к содержимому
      </a>

      <TextNavSidebar />

      <div
        className={cn('transition-all duration-200', sidebarOpen ? 'ml-[232px]' : 'ml-14')}
        style={drawerOpen ? { marginRight: 280 } : undefined}
      >
        <main id="main-content" className="p-4 md:p-6">
          <ContentHeader />
          <PageTransition>
            {children}
          </PageTransition>
        </main>
      </div>
      <ActivityDrawer />
      <EventReminder />
      <QuickActionModals />
      <CommandPalette />
      <GlobalModals />
      <Hotkeys />
    </div>
  );
}
