'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { useThemeStore } from '@/lib/stores/theme-store';
import { useOrgTimeline } from '@/lib/hooks/use-entity-timeline';
import { KIND_META, parentHref } from '@/lib/timeline/kind-meta';
import { relativeTime } from '@/lib/utils/activity-events';
import { FujiWatermark } from './FujiWatermark';
import type { TimelineKindFilter } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// Recent Activity (global)
// ═══════════════════════════════════════════════════════

// ⚠️ S-TL-4: локальных карт `EVENT_ICON`/`EVENT_COLOR` по `event_type` здесь больше
// нет. Виджет читает org-ленту, у неё на входе те же шесть `kind`, что у ленты
// сущности, и карта одна на приложение — `lib/timeline/kind-meta.ts`.

/**
 * Табы виджета. `kinds` уходит в `p_kinds` — фильтрация СЕРВЕРНАЯ: клиентский
 * `Array#filter` по 20 загруженным записям показывал бы «Звонки» из тех двадцати,
 * что успели приехать, а не из ленты (тот же дефект, что чинил S-TL-3).
 *
 * ⚠️ «Звонки» и «Задачи» сменили смысл, и это и есть починка: раньше они отбирали
 * ЗАПИСИ ЖУРНАЛА `call_logged` (2 штуки в базе) и `task_created|task_completed`,
 * теперь — настоящие звонки (14) и задачи (654).
 *
 * ⚠️ `stage` и `deleted` — производные виды `entity_timeline`: срезы `activity_log`
 * по `event_type`. Их списки живут в SQL (CTE `kind_types` миграции 115) и здесь
 * НЕ дублируются — потому в табах и стоит вид, а не перечень типов событий.
 */
const ACTIVITY_TABS: { key: string; label: string; kinds?: TimelineKindFilter[] }[] = [
  { key: 'all', label: 'Все' },
  { key: 'stage', label: 'Стадии', kinds: ['stage'] },
  { key: 'call', label: 'Звонки', kinds: ['call'] },
  { key: 'task', label: 'Задачи', kinds: ['task'] },
  { key: 'delete', label: 'Удаления', kinds: ['deleted'] },
];

export function RecentActivityList() {
  const themeVal4 = useThemeStore((s) => s.theme);
  const isFuji = themeVal4 === 't-fuji';
  const [activeTab, setActiveTab] = useState('all');

  const kinds = ACTIVITY_TABS.find((t) => t.key === activeTab)?.kinds;
  const { events, isLoading, error } = useOrgTimeline(kinds, 20);

  return (
    <div className="relative overflow-hidden p-4 rounded-xl bg-surface elevation-hover">
      {isFuji ? <FujiWatermark text="АКТИВНОСТЬ" /> : (
        <div className="mb-3 flex items-center gap-2">
          <Clock size={14} className="text-text-dim" />
          <span className="text-xs font-semibold text-text-dim">Последние действия</span>
        </div>
      )}

      {/*
        ⚠️ Табы стоят ВЫШЕ ветвления загрузки. Раньше `isLoading` возвращал скелет
        вместо всего виджета — это было безобидно, пока фильтрация шла на клиенте и
        загрузка случалась один раз. С серверными `p_kinds` каждый клик по табу
        заводит новый запрос, и ранний `return` убирал бы с экрана сам переключатель:
        табы мигали бы на каждом клике, а промахнуться по исчезающей кнопке легко.
      */}
      {/* `data-activity-tabs` — якорь для фикса темы Fuji: она прячет таб «Удаления»,
          и раньше делала это позиционно (`button:nth-child(5)` у ЛЮБОЙ полосы
          `.flex.gap-1.border-b`). Полоса вкладок карточки сделки попадала под тот же
          селектор, и добавленная пятой вкладка исчезала в Fuji без единого признака
          (S-STAGE-STORY-1). Атрибут привязывает правило к этой конкретной полосе. */}
      <div data-activity-tabs className="mb-3 flex gap-1 border-b border-border">
        {ACTIVITY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-2.5 py-1.5 text-meta transition-colors -mb-px ${
              activeTab === tab.key
                ? 'text-accent border-b-2 border-accent font-medium'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Сбой обязан отличаться от «событий нет»: React Query ловит бросок из
          queryFn молча, и без этой ветки экран показал бы пустой виджет с призывом
          создать сделку — при исправных данных (дефект S-TL-1). */}
      {isLoading ? (
        <div className="animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="mb-2 h-8 rounded bg-border/30" />
          ))}
        </div>
      ) : error ? (
        <p className="py-6 text-center text-xs text-red">
          Не удалось загрузить активность. Обновите страницу.
        </p>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <Clock size={20} className="mb-2 text-text-mute" />
          <p className="text-xs text-text-dim">Нет активности</p>
          <Link href="/deals" className="mt-2 text-xs text-accent hover:underline">Создать сделку →</Link>
        </div>
      ) : (
        <div data-timeline-scroll="compact" className="max-h-[480px] space-y-1 overflow-y-auto scroll-smooth thin-scrollbar">
          {events.map((event) => {
            const meta = KIND_META[event.kind];
            const Icon = meta.icon;
            // Ссылка ведёт на карточку родителя — и на компанию с контактом тоже,
            // чего в прежнем виджете быть не могло: он знал только `project_id`.
            const href = parentHref(event.parentType, event.parentId);
            const Tag = href ? 'a' : 'div';

            return (
              <Tag
                key={event.id}
                {...(href ? { href } : {})}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5
                           transition-colors hover:bg-surface-hover"
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg ${meta.fg}`}>
                  <Icon size={10} />
                </div>
                <div className="min-w-0 flex-1">
                  {/* Заголовок уже собран адаптерами ленты — `describeEvent` здесь
                      больше не зовётся: он умеет только записи журнала. */}
                  <span className="block truncate text-xs text-text-dim">
                    {event.title}
                  </span>
                  {event.parentName && (
                    <span className="text-xs text-text-main font-medium">{event.parentName}</span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-text-mute">
                  {relativeTime(event.date)}
                  {event.actorName && <span className="ml-1">• {event.actorName}</span>}
                </span>
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
}
