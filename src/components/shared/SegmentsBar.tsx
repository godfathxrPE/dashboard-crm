'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Lock, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { canEditSegment, useSegments } from '@/lib/hooks/use-segments';
import { SegmentEditorModal } from './SegmentEditorModal';
import type { Segment, SegmentEntity } from '@/types/database';

/**
 * Полоса сегментов (Smart Views, R2-P0-B).
 *
 * Активный сегмент живёт в URL (`?segment=<uuid>`) — ссылка на отфильтрованный список
 * шарится как есть. Сам предикат в URL НЕ кладём: он может быть длинным и он версионируется
 * в БД, а ссылка должна пережить правку сегмента.
 *
 * С `SavedViewChips` (localStorage-виды) не конфликтует и не заменяет их: там снимок
 * `{route, query}`, здесь — предикат. Обе полосы живут рядом, фильтры комбинируются по «И».
 */

interface SegmentsBarProps {
  entity: SegmentEntity;
}

/** Активный сегмент из URL — общий резолвер для полосы и для страницы-потребителя. */
export function useActiveSegment(entity: SegmentEntity): Segment | null {
  const searchParams = useSearchParams();
  const { data: segments } = useSegments(entity);
  const id = searchParams.get('segment');
  if (!id) return null;
  return segments?.find((s) => s.id === id) ?? null;
}

export function SegmentsBar({ entity }: SegmentsBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: segments, isLoading } = useSegments(entity);
  const { data: role } = useOrgRole();
  const { user } = useAuth();

  const [editing, setEditing] = useState<Segment | null>(null);
  const [creating, setCreating] = useState(false);

  const activeId = searchParams.get('segment');

  const select = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('segment', id);
      else params.delete('segment');
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ''}`);
    },
    [router, pathname, searchParams],
  );

  const canCreate = !!role; // любой член org заводит личный сегмент; общий гасит модалка
  const list = segments ?? [];

  // Пока грузится — не мигаем пустой полосой поверх уже отрисованных фильтров
  if (isLoading && list.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {list.map((s) => {
          const active = s.id === activeId;
          const editable = canEditSegment(s, role, user?.id);
          return (
            <span
              key={s.id}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full border py-1 pl-3 text-sm font-medium',
                editable ? 'pr-1' : 'pr-3',
                active
                  ? 'border-accent bg-accent-l text-accent'
                  : 'border-input bg-surface text-text-dim hover:border-accent/50',
              )}
            >
              <button type="button" onClick={() => select(active ? null : s.id)} className="inline-flex items-center gap-1">
                {!s.is_shared && <Lock size={10} className="opacity-70" />}
                {s.name}
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => setEditing(s)}
                  aria-label={`Изменить сегмент «${s.name}»`}
                  className="rounded-full p-1 text-text-mute transition-colors hover:bg-surface2 hover:text-text-dim"
                >
                  <Pencil size={11} />
                </button>
              )}
            </span>
          );
        })}

        {canCreate && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-input
              px-3 py-1 text-sm font-medium text-text-mute transition-colors hover:border-accent/50 hover:text-text-dim"
          >
            <Plus size={12} /> Сегмент
          </button>
        )}
      </div>

      {(creating || editing) && (
        <SegmentEditorModal
          entity={entity}
          segment={editing}
          onDeleted={(id) => { if (id === activeId) select(null); }}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </>
  );
}
