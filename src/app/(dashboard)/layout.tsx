'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useUiStore } from '@/lib/stores/ui-store';
import { cn } from '@/lib/utils/cn';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { Hotkeys } from '@/components/shared/Hotkeys';
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar />
      <div
        className={cn(
          'transition-all duration-200',
          sidebarOpen ? 'ml-56' : 'ml-16',
        )}
      >
        <Header />
        <main className="p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette />
<Hotkeys />
    </div>
  );
}
