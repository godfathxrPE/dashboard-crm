'use client';

import { usePathname } from 'next/navigation';
import { TextNavSidebar } from '@/components/layout/TextNavSidebar';
import { ContentHeader } from '@/components/layout/ContentHeader';
import { ActivityDrawer } from '@/components/layout/ActivityDrawer';
import { EventReminder } from '@/components/layout/EventReminder';
import { AuraOrbs } from '@/components/layout/AuraOrbs';
import { useState, useEffect } from 'react';
import { useUiStore } from '@/lib/stores/ui-store';
import { useDrawerStore } from '@/lib/stores/drawer-store';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import { cn } from '@/lib/utils/cn';
import PageTransition from '@/components/layout/PageTransition';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { GlobalModals } from '@/components/shared/GlobalModals';
import { Hotkeys } from '@/components/shared/Hotkeys';
import { getSectionFromPath } from '@/lib/section-colors';

function QuickActionModals() {
  const pendingAction = useDrawerStore((s) => s.pendingAction);
  const setPendingAction = useDrawerStore((s) => s.setPendingAction);
  const [callOpen, setCallOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction.type === 'call') setCallOpen(true);
    if (pendingAction.type === 'meeting') setMeetingOpen(true);
    if (pendingAction.type === 'task') setTaskOpen(true);
    setPendingAction(null);
  }, [pendingAction, setPendingAction]);

  return (
    <>
      <CallModal isOpen={callOpen} onClose={() => setCallOpen(false)} editCall={null} />
      <MeetingModal isOpen={meetingOpen} onClose={() => setMeetingOpen(false)} editMeeting={null} />
      <TaskModal isOpen={taskOpen} onClose={() => setTaskOpen(false)} editTask={null} />
    </>
  );
}

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
