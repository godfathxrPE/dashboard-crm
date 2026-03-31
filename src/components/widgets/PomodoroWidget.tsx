'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw, Coffee, Brain } from 'lucide-react';

type Mode = 'work' | 'break';

const WORK_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

export function PomodoroWidget() {
  const [mode, setMode] = useState<Mode>('work');
  const [seconds, setSeconds] = useState(WORK_SECONDS);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!running) { clearTimer(); return; }

    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          // Timer ended
          clearTimer();
          setRunning(false);
          if (mode === 'work') {
            setSessions((s) => s + 1);
            setMode('break');
            return BREAK_SECONDS;
          } else {
            setMode('work');
            return WORK_SECONDS;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [running, mode, clearTimer]);

  function handleReset() {
    clearTimer();
    setRunning(false);
    setSeconds(mode === 'work' ? WORK_SECONDS : BREAK_SECONDS);
  }

  function handleToggle() {
    setRunning((r) => !r);
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const total = mode === 'work' ? WORK_SECONDS : BREAK_SECONDS;
  const pct = ((total - seconds) / total) * 100;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        {mode === 'work'
          ? <Brain size={14} className="text-accent" />
          : <Coffee size={14} className="text-green" />
        }
        <span className="text-xs font-semibold text-text-dim">
          {mode === 'work' ? 'Фокус' : 'Перерыв'}
        </span>
        <span className="ml-auto rounded-full bg-accent-l px-1.5 py-0.5 text-[10px] text-accent">
          {sessions} сессий
        </span>
      </div>

      <div className="flex flex-col items-center">
        {/* Timer ring */}
        <div className="relative mb-3">
          <svg width="108" height="108" viewBox="0 0 108 108">
            <circle cx="54" cy="54" r={radius} fill="none"
              stroke="var(--border)" strokeWidth="5" />
            <circle cx="54" cy="54" r={radius} fill="none"
              stroke={mode === 'work' ? 'var(--accent)' : 'var(--green)'}
              strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              transform="rotate(-90 54 54)"
              className="transition-all duration-1000" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-text-main">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button onClick={handleReset}
            className="rounded-lg border border-border p-2 text-text-mute transition-colors hover:bg-surface-hover">
            <RotateCcw size={14} />
          </button>
          <button onClick={handleToggle}
            className={`flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90
              ${running ? 'bg-yellow' : 'bg-accent'}`}>
            {running ? <><Pause size={12} /> Пауза</> : <><Play size={12} /> Старт</>}
          </button>
        </div>
      </div>
    </div>
  );
}
