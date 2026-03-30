'use client';

import { useState, useEffect } from 'react';

function getGreeting(hour: number): string {
  if (hour < 6) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function ClockWidget() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const date = now.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const greeting = getGreeting(now.getHours());

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-text-mute">{greeting}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums text-text-main">{time}</span>
        <span className="text-sm tabular-nums text-text-mute">{seconds}</span>
      </div>
      <p className="mt-1 text-xs capitalize text-text-dim">{date}</p>
    </div>
  );
}
