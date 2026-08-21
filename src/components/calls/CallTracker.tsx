'use client';

import { useMemo } from 'react';
import { Phone, TrendingUp } from 'lucide-react';
import { useCalls } from '@/lib/hooks/use-calls';
import { useAuth } from '@/lib/hooks/use-auth';
import { CTAButton } from '@/components/ui/CTAButton';
import { localDateKey } from '@/lib/utils/date-helpers';

interface CallTrackerProps {
  dailyGoal?: number;
  onQuickLog: () => void;
}

export function CallTracker({ dailyGoal = 10, onQuickLog }: CallTrackerProps) {
  const { data: calls } = useCalls();
  const { user } = useAuth();
  const myId = user?.id ?? null;

  // S-VIS-A: трекер меряет ЛИЧНУЮ норму («Звонки сегодня» против dailyGoal), поэтому
  // после расширения RLS 098 он обязан считать только свои. Иначе дневной план
  // закрывался бы чужими звонками — виджет показывал бы 12/10 человеку, который не
  // позвонил никому.
  const myCalls = useMemo(
    () => (myId ? (calls ?? []).filter((c) => c.created_by === myId) : []),
    [calls, myId],
  );

  const todayCalls = useMemo(() => {
    const today = localDateKey();
    return myCalls.filter(
      (c) => c.status === 'done' && c.date.slice(0, 10) === today
    ).length;
  }, [myCalls]);

  const weekCalls = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);
    return myCalls.filter(
      (c) => c.status === 'done' && new Date(c.date) >= weekStart
    ).length;
  }, [myCalls]);

  const pct = Math.min(100, Math.round((todayCalls / dailyGoal) * 100));
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="sheet p-4">
      <div className="mb-3 flex items-center gap-2">
        <Phone size={14} className="text-accent" />
        <span className="text-xs font-semibold text-text-main">Звонки сегодня</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Progress ring */}
        <div className="relative">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle cx="44" cy="44" r={radius} fill="none"
              stroke="var(--border)" strokeWidth="6" />
            <circle cx="44" cy="44" r={radius} fill="none"
              stroke="var(--accent)" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 44 44)"
              className="transition-all duration-500" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-text-main">{todayCalls}</span>
            <span className="text-xs text-text-mute">из {dailyGoal}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-2">
          <div>
            <span className="text-xs text-text-dim">За неделю</span>
            <div className="flex items-center gap-1">
              <TrendingUp size={12} className="text-green" />
              <span className="text-sm font-semibold text-text-main">{weekCalls}</span>
            </div>
          </div>

          <CTAButton size="sm" onClick={onQuickLog} className="w-full justify-center">
            <Phone size={12} /> Записать звонок
          </CTAButton>
        </div>
      </div>
    </div>
  );
}
