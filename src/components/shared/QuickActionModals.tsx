'use client';

import { useState, useEffect } from 'react';
import { useDrawerStore } from '@/lib/stores/drawer-store';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { TaskModal } from '@/components/tasks/TaskModal';

// W4a: вынесен из (dashboard)/layout.tsx, чтобы подключаться через next/dynamic —
// модалки быстрых действий открываются по хоткею и первому чанку shell не нужны.
export function QuickActionModals() {
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
