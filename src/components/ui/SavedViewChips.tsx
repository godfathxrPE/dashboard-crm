'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bookmark, BookmarkPlus, X } from 'lucide-react';
import { useSavedViews } from '@/lib/hooks/use-saved-views';
import { cn } from '@/lib/utils/cn';

const MAX_VISIBLE = 8;

/**
 * Чипы сохранённых видов текущего route + кнопка «Сохранить вид».
 * Рендерится в строке чипов после ChipFilter.
 */
export function SavedViewChips() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { views, saveCurrent, remove, apply } = useSavedViews(pathname);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  const qs = searchParams.toString();
  const currentQuery = qs ? `?${qs}` : '';
  const hasFilters = qs.length > 0;
  const visible = views.slice(0, MAX_VISIBLE);

  if (visible.length === 0 && !hasFilters) return null;

  function submit() {
    saveCurrent(name);
    setName('');
    setNaming(false);
  }

  return (
    <div className="flex shrink-0 items-center gap-2 pb-1">
      <span className="text-text-mute select-none" aria-hidden>·</span>

      {visible.map((view) => {
        const active = view.query === currentQuery;
        return (
          <span
            key={view.id}
            className={cn(
              'group inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
              'border transition-colors duration-150',
              active
                ? 'bg-accent-l border-accent text-accent'
                : 'bg-surface border-border text-text-dim hover:border-accent/50',
            )}
          >
            <button
              onClick={() => apply(view)}
              className="inline-flex items-center gap-1.5"
              title={view.query}
            >
              <Bookmark size={12} className={active ? 'text-accent' : 'text-text-mute'} />
              {view.label}
            </button>
            <button
              onClick={() => remove(view.id)}
              aria-label={`Удалить вид «${view.label}»`}
              className="hidden text-text-mute transition-colors hover:text-red group-hover:inline-flex"
            >
              <X size={11} />
            </button>
          </span>
        );
      })}

      {hasFilters && (naming ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { setName(''); setNaming(false); }
          }}
          onBlur={() => { setName(''); setNaming(false); }}
          placeholder="Имя вида…"
          aria-label="Имя сохранённого вида"
          className="w-32 shrink-0 rounded-full border border-accent bg-surface px-3 py-1 text-sm text-text-main placeholder:text-text-mute focus:outline-none"
        />
      ) : (
        <button
          onClick={() => setNaming(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 text-sm font-medium text-text-dim transition-colors hover:border-accent/50 hover:text-accent"
        >
          <BookmarkPlus size={12} />
          Сохранить вид
        </button>
      ))}
    </div>
  );
}
