'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
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
        <main id="main-content" className="relative p-4 md:p-6">
          {/* Fuji: wave background behind content */}
          {theme === 't-fuji' && (
            <div className="fuji-waves" aria-hidden="true">
              <svg className="fuji-wave fuji-wave-1" viewBox="0 0 1440 160" preserveAspectRatio="none">
                <path fill="#1A2744" d="M0,96L48,90.7C96,85,192,75,288,80C384,85,480,107,576,112C672,117,768,107,864,96C960,85,1056,75,1152,80C1248,85,1344,107,1392,117.3L1440,128L1440,160L0,160Z"/>
              </svg>
              <svg className="fuji-wave fuji-wave-2" viewBox="0 0 1440 160" preserveAspectRatio="none">
                <path fill="#2B5078" d="M0,112L48,106.7C96,101,192,91,288,96C384,101,480,123,576,128C672,133,768,123,864,112C960,101,1056,91,1152,96C1248,101,1344,123,1392,133.3L1440,144L1440,160L0,160Z"/>
              </svg>
              <svg className="fuji-wave fuji-wave-3" viewBox="0 0 1440 160" preserveAspectRatio="none">
                <path fill="#4A7A9E" d="M0,128L48,122.7C96,117,192,107,288,112C384,117,480,139,576,144C672,149,768,139,864,128C960,117,1056,107,1152,112C1248,117,1344,139,1392,149.3L1440,160L1440,160L0,160Z"/>
              </svg>
            </div>
          )}
          {children}
        </main>
      </div>
      <CommandPalette />
      <Hotkeys />
    </div>
  );
}
