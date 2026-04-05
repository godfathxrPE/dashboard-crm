'use client';

import { Suspense } from 'react';
import { CalendarView } from '@/components/calendar/CalendarView';

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-text-mute">Загрузка...</div>}>
      <CalendarView />
    </Suspense>
  );
}
