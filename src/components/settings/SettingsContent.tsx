'use client';

import { Settings, Palette, Database, Upload, ExternalLink } from 'lucide-react';
import { useThemeStore } from '@/lib/stores/theme-store';
import { VerificationPanel } from '@/components/migration/VerificationPanel';

const THEMES = [
  { id: 't-scandi', label: 'Scandinavian', color: '#000000' },
  { id: 't-claude', label: 'Claude', color: '#c27a3a' },
  { id: 't-frost', label: 'Frost', color: '#6ba3be' },
  { id: 't-paper', label: 'Paper', color: '#8b7355' },
  { id: 't-sand', label: 'Sand', color: '#b8956a' },
  { id: 't-aurora', label: 'Aurora', color: '#7c6bc4' },
  { id: 't-tidal', label: 'Tidal', color: '#4a9e8e' },
  { id: 't-quartz', label: 'Quartz', color: '#0D9488' },
  { id: 't-keyswitch', label: 'Keyswitch', color: '#6366f1' },
  { id: 't-nvg8', label: 'NVG8', color: '#FF6633' },
  { id: 't-washi', label: '和紙 Washi', color: '#C23B3B' },
  { id: 't-fuji', label: '富士 Fuji', color: '#2B5078' },
  { id: 't-cupertino', label: 'Cupertino', color: '#e88d3f' },
] as const;

interface SettingsContentProps {
  userEmail: string;
}

export function SettingsContent({ userEmail }: SettingsContentProps) {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-2">
        <Settings size={18} className="text-accent" />
        <h1 className="text-lg font-semibold text-text-main">Настройки</h1>
      </div>

      <div className="space-y-4">
        {/* Profile */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold text-text-dim">Профиль</h2>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              {userEmail.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-text-main">{userEmail}</p>
              <p className="text-[10px] text-text-mute">Supabase Auth · Magic Link</p>
            </div>
          </div>
        </div>

        {/* Theme */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Palette size={14} className="text-text-dim" />
            <h2 className="text-xs font-semibold text-text-dim">Тема оформления</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {THEMES.map((t) => (
              <button key={t.id} onClick={() => setTheme(t.id)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 transition-all
                  ${theme === t.id
                    ? 'border-accent bg-accent-l shadow-sm'
                    : 'border-border hover:border-accent/50'
                  }`}>
                <div className="h-5 w-5 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-[10px] font-medium text-text-dim">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Data verification */}
        <VerificationPanel />

        {/* Migration tool link */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Upload size={14} className="text-text-dim" />
            <h2 className="text-xs font-semibold text-text-dim">Миграция данных</h2>
          </div>
          <p className="mb-3 text-xs text-text-mute">
            Импортируй данные из старого Dashboard (localStorage) в Supabase.
          </p>
          <a href="/settings/migration"
            className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            Открыть инструмент миграции <ExternalLink size={10} />
          </a>
        </div>

        {/* Hotkeys reference */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold text-text-dim">Горячие клавиши</h2>
          <div className="space-y-1 text-xs">
            {[
              ['⌘K', 'Поиск (Command Palette)'],
              ['g → d', 'Дашборд'],
              ['g → t', 'Задачи'],
              ['g → p', 'Проекты'],
              ['g → c', 'Звонки'],
              ['g → m', 'Встречи'],
              ['g → o', 'Компании'],
              ['g → n', 'Контакты'],
              ['g → a', 'Аналитика'],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center gap-3">
                <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] font-mono text-text-mute">
                  {key}
                </kbd>
                <span className="text-text-dim">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
