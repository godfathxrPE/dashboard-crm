'use client';

import { useState } from 'react';
import { Settings, Palette, Upload, ExternalLink, Pencil } from 'lucide-react';
import { useThemeStore } from '@/lib/stores/theme-store';
import { VerificationPanel } from '@/components/migration/VerificationPanel';
import { TeamSection } from '@/components/settings/TeamSection';
import { GatesSection } from '@/components/settings/GatesSection';
import { AutomationsSection } from '@/components/settings/AutomationsSection';
import { ProfileForm } from '@/components/settings/ProfileForm';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useMyProfile } from '@/lib/hooks/use-profile';
import type { OrgRole } from '@/types/database';

const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  manager: 'Менеджер',
  viewer: 'Наблюдатель',
};

const THEMES = [
  { id: 't-aura', label: 'Аура', color: '#E0A03A' },
  { id: 't-washi', label: '和紙 Washi', color: '#C23B3B' },
  { id: 't-fuji', label: '富士 Fuji', color: '#2B5078' },
  { id: 't-frost', label: 'Frost', color: '#6ba3be' },
  { id: 't-aurora', label: 'Aurora', color: '#7c6bc4' },
  { id: 't-tidal', label: 'Tidal', color: '#4a9e8e' },
] as const;

interface SettingsContentProps {
  userEmail: string;
}

export function SettingsContent({ userEmail }: SettingsContentProps) {
  const { theme, setTheme } = useThemeStore();
  const { data: role } = useOrgRole();
  const { data: profile } = useMyProfile();
  const [editingProfile, setEditingProfile] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-2">
        <Settings size={18} className="text-accent" />
        <h1 className="aura-page-title text-text-main">Настройки</h1>
      </div>

      <div className="space-y-4">
        {/* Profile — self-service (S-ONBOARD-1): свой профиль правит каждый сам */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-text-dim">Профиль</h2>
            {!editingProfile && (
              <button
                onClick={() => setEditingProfile(true)}
                className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <Pencil size={11} /> Редактировать
              </button>
            )}
          </div>

          {editingProfile ? (
            <ProfileForm mode="settings" onDone={() => setEditingProfile(false)} />
          ) : (
            <div className="flex items-center gap-3">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt="Аватар"
                  className="h-10 w-10 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                  {(profile?.full_name || userEmail).slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-main">
                  {profile?.full_name || userEmail}
                </p>
                <p className="truncate text-[10px] text-text-mute">
                  {[profile?.job_title, profile?.phone, userEmail]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {role && (
                <span className="ml-auto shrink-0 rounded-full border border-border bg-surface2 px-2.5 py-1 text-[11px] font-medium text-text-dim">
                  {ORG_ROLE_LABEL[role]}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Team (owner/admin only) */}
        <TeamSection />

        {/* Stage gates (owner/admin only) */}
        <GatesSection />

        {/* Automations (owner/admin only) */}
        <AutomationsSection />

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
              ['g → l', 'Сделки'],
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
