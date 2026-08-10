'use client';

import { useState, useEffect, useRef, type RefObject } from 'react';
import { useUiStore } from '@/lib/stores/ui-store';
import { locate, moveFocus, moveTarget, type BoardColumns } from '@/lib/domain/board-nav';
import type { DateBucket } from '@/lib/utils/task-view';
import type { Task } from '@/types/entities';

interface UseBoardNavOptions {
  columns: BoardColumns;
  /** Enter — открыть focused-карточку */
  onSelect: (task: Task) => void;
  /** d — primary-действие (готово / вернуть в работу) */
  onAction?: (task: Task) => void;
  /** Shift+H / Shift+L — перенести карточку в соседний дроппабельный бакет */
  onMove?: (taskId: string, bucket: DateBucket) => void;
  /** Дополнительный gate: арбитраж с модалкой/другим видом */
  isActive?: () => boolean;
  /** Контейнер, в котором ищется [data-task-id] для scrollIntoView */
  containerRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
}

/**
 * S-TASKS-BOARD-2, з.4: клавиатура доски сроков.
 *
 * Свой хук, а не правка `use-keyboard-nav`: тот держит ПЛОСКУЮ очередь
 * (`activeIndex`, `Math.min(i+1, itemCount-1)`) и читается `TodayView`,
 * `TaskStream` и `DataTable` — три экрана blast radius ради одного нового вида.
 * Повторяем его КОНВЕНЦИИ (гарды, `e.code` для букв, G-префикс перед `d`),
 * а не сигнатуру: доска двумерна.
 *
 * Фокус хранится как `focusedId`, а не как координата, — см. `domain/board-nav`.
 */
export function useBoardNav({
  columns,
  onSelect,
  onAction,
  onMove,
  isActive,
  containerRef,
  enabled = true,
}: UseBoardNavOptions): { focusedId: string | null } {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Колбэки — через ref: обработчик регистрируется в useEffect один раз и иначе
  // замкнёт устаревшие ссылки (stale closure — грабля из learnings).
  const cbRef = useRef({ onSelect, onAction, onMove, isActive });
  cbRef.current = { onSelect, onAction, onMove, isActive };

  // `columns` — ТОЖЕ из ref: набор меняется на каждый оптимистичный апдейт, а
  // перевешивать слушатель на каждое изменение нельзя.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;

  // 'G' — префикс глобальной навигации (G-D → дашборд), глушим 'd' сразу после него.
  const gPressedAt = useRef(0);

  /**
   * Последний ВЫДАННЫЙ, но ещё не отрисованный перенос: `columns` приходят
   * через рендер, а нажатия при удержании клавиши идут чаще кадров. Без этого
   * второе нажатие внутри кадра считает шаг от той же колонки, что первое, —
   * четыре нажатия дают два перехода и три PATCH с одинаковым днём (поймано
   * смоуком). Доверяем намерению, только пока карточка всё ещё видна в колонке
   * `from`; как только доска показала ЛЮБУЮ другую — сбрасываем, и откат
   * неудавшейся мутации (он приходит много позже рендера) застаёт уже null.
   */
  const pendingRef = useRef<{ id: string; from: DateBucket; to: DateBucket } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function isInputFocused(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable
      );
    }

    /** Задача под фокусом на момент нажатия; null — фокуса нет. */
    function focusedTask(): Task | null {
      const cols = columnsRef.current;
      const at = locate(cols, focusedIdRef.current);
      return at ? cols[at.col].tasks[at.row] : null;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { activeModal, commandPaletteOpen } = useUiStore.getState();
      if (activeModal !== null || commandPaletteOpen) return;
      if (cbRef.current.isActive && !cbRef.current.isActive()) return;

      if (e.code === 'KeyG') {
        gPressedAt.current = Date.now();
        return;
      }

      // Shift+H/L проверяется ДО обычных h/l — иначе перенос отработал бы как
      // навигация, и карточка осталась бы на месте без единого признака отказа.
      if ((e.code === 'KeyH' || e.code === 'KeyL') && e.shiftKey) {
        if (!cbRef.current.onMove) return;
        e.preventDefault();
        const cols = columnsRef.current;
        const id = focusedIdRef.current;
        const pending = pendingRef.current;
        const at = locate(cols, id);
        // Намерению доверяем, только пока доска ещё показывает карточку там,
        // откуда мы её уже отправили.
        const from =
          pending && pending.id === id && at && cols[at.col].bucket === pending.from
            ? pending.to
            : undefined;
        // Часы читаем в момент НАЖАТИЯ, не пропом: причина ровно та же, что у
        // дропа мышью (S-TASKS-BOARD-2, з.1) — `now` из рендера протухает.
        const target = moveTarget(cols, id, e.code === 'KeyL' ? 'right' : 'left', new Date(), from);
        if (target && at) {
          pendingRef.current = { id: target.taskId, from: cols[at.col].bucket, to: target.bucket };
          cbRef.current.onMove(target.taskId, target.bucket);
        }
        return;
      }

      // e.code для букв — не зависит от раскладки (у владельца ru/en).
      const dir =
        e.code === 'KeyJ' || e.key === 'ArrowDown'
          ? 'down'
          : e.code === 'KeyK' || e.key === 'ArrowUp'
            ? 'up'
            : e.code === 'KeyH' || e.key === 'ArrowLeft'
              ? 'left'
              : e.code === 'KeyL' || e.key === 'ArrowRight'
                ? 'right'
                : null;

      if (dir) {
        e.preventDefault();
        setFocusedId((prev) => moveFocus(columnsRef.current, prev, dir) ?? prev);
        return;
      }

      if (e.key === 'Enter') {
        const t = focusedTask();
        if (t) {
          e.preventDefault();
          cbRef.current.onSelect(t);
        }
      } else if (e.code === 'KeyD') {
        const t = focusedTask();
        if (cbRef.current.onAction && t && Date.now() - gPressedAt.current > 600) {
          e.preventDefault();
          cbRef.current.onAction(t);
        }
      } else if (e.key === 'Escape') {
        setFocusedId(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);

  // Задачу удалили/отфильтровали — держать мёртвую ссылку нельзя: фокус есть,
  // а карточки под ним нет, и Enter открыл бы пустоту. Сбрасываем в null.
  // Переезд карточки между колонками сюда НЕ попадает: id при этом тот же.
  useEffect(() => {
    // Доска догнала намерение (или карточку увели куда-то ещё) — намерение
    // больше не источник истины.
    const p = pendingRef.current;
    if (p) {
      const at = locate(columns, p.id);
      if (!at || columns[at.col].bucket !== p.from) pendingRef.current = null;
    }
    if (focusedId && !locate(columns, focusedId)) setFocusedId(null);
  }, [columns, focusedId]);

  // Скролл к карточке. `inline` обязателен наравне с `block`: доска ещё и
  // горизонтальна, и без него `l` до крайней правой колонки не доскроллит.
  useEffect(() => {
    if (!focusedId) return;
    const root: ParentNode = containerRef?.current ?? document;
    const card = root.querySelector(`[data-task-id="${focusedId}"]`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [focusedId, containerRef]);

  return { focusedId };
}
