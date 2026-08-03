'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// S-DEBT-CONFIRM-1 — единственный примитив подтверждения опасного действия.
//
// ЗАЧЕМ. До него в проекте жили ДВЕ взаимоисключающие «конвенции»: `GanttTimeline`
// объявлял `window.confirm` конвенцией, пять других файлов объявляли его запрещённым.
// Побеждает запрет, и довод технический, а не вкусовой:
//
//  1. `confirm()` УМЕЕТ ВЕРНУТЬ `false`, НЕ ПОКАЗАВ НИ ПИКСЕЛЯ. Chrome предлагает
//     «Prevent this page from creating additional dialogs» уже на втором диалоге подряд,
//     а в этой CRM удаляют пачками (`LeadsView`, `ContactsTable`, `CompaniesTable`,
//     `ProjectsTable` — массовое удаление). После галочки каждый следующий вызов
//     возвращает `false` мгновенно: кнопки «Удалить» по всей CRM молча перестают
//     работать до перезагрузки вкладки. Ни ошибки, ни лога — «нажимаю, ничего не
//     происходит». Единственный довод ЗА `confirm` («гарантированная модальность»)
//     разбивается именно об это.
//  2. `confirm()` БЛОКИРУЕТ ПОТОК ЦЕЛИКОМ. Пока диалог открыт, не идут ни
//     realtime-колбэки (`use-realtime.ts`), ни таймеры, ни рендеры; после закрытия
//     прилетает залп отложенных инвалидаций.
//  3. `confirm()` НЕВОЗМОЖНО ПРОВЕРИТЬ. Playwright встаёт на диалоге намертво — грабля
//     записана в память проекта (два `confirm` в `GanttTimeline` блокировали смоки).
//
// ⚠️ ЗАПРЕТ ШИРЕ, ЧЕМ `confirm`. `alert()` и `prompt()` в проекте тоже не используются
//    (ноль вызовов): сообщение об ошибке — `toast`, ввод — форма или модалка. Правило
//    держит eslint (`no-restricted-globals` + `no-restricted-properties` в
//    `eslint.config.mjs`), потому что «договорённость» уже один раз разъехалась на две.
//
// ⚠️ ПРИМИТИВ НЕ ЗНАЕТ ПРО МУТАЦИИ. Наружу — только `onConfirm`/`onCancel`. Кто и что
//    удаляет, решает вызывающий; сюда логика удаления не переезжает никогда.
// ═══════════════════════════════════════════════════════

/**
 * Сколько живёт inline-подтверждение, прежде чем откатиться в обычную кнопку.
 *
 * Единственная копия константы в проекте: до S-DEBT-CONFIRM-1 она была продублирована
 * в `chat/GroupModal.tsx` и `chat/ChatView.tsx` — оба импортируют её отсюда.
 */
export const CONFIRM_TTL_MS = 5000;

/**
 * Состояние «у чего именно спрашиваем». Нужен там, где кнопка удаления живёт в строке
 * списка: подтверждение показывает ОДНА строка, а не все сразу.
 *
 * ⚠️ Сравнение цели — по `===`. Годится для id (строки) и для `true` в компонентах с
 *    единственным опасным действием. Объект-цель каждый рендер новый, и `isAsking`
 *    на нём будет врать — передавать id, а не объект.
 */
export function useConfirm<T = string>() {
  const [target, setTarget] = useState<T | null>(null);
  const ask = useCallback((t: T) => setTarget(t), []);
  const cancel = useCallback(() => setTarget(null), []);
  const isAsking = useCallback((t: T) => target !== null && target === t, [target]);
  return { target, ask, cancel, isAsking };
}

interface InlineConfirmProps {
  /**
   * `inline` — две кнопки на месте кнопки-триггера (строки списков, карточки).
   * `overlay` — карточка по центру экрана с текстом последствий (детальные страницы,
   * массовые удаления). Разделение по форме места, а не по важности действия.
   */
  mode?: 'inline' | 'overlay';
  /** Вопрос. inline — короткий («Удалить?»), overlay — заголовок карточки. */
  question: string;
  /**
   * Только overlay: что случится и что уцелеет («Связанные задачи сохранятся»).
   * `confirm()` такой текст вмещал плохо — здесь он полноценная строка.
   */
  consequence?: string;
  /** Подпись опасной кнопки. По умолчанию «Удалить». */
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Мутация в полёте — обе кнопки блокируются, чтобы не отправить дважды. */
  pending?: boolean;
  /** Доп. классы обёртки inline-режима (выравнивание в конкретной строке). */
  className?: string;
}

/**
 * Подтверждение опасного действия. Замена `window.confirm` (см. шапку файла).
 *
 * Рендерится по условию — своего `open` у него нет: `{asking && <InlineConfirm …/>}`.
 *
 * a11y, которого у `confirm()` не было в принципе: `role="alertdialog"`, `aria-label`,
 * автофокус на БЕЗОПАСНОЙ кнопке (Отмена — значит Enter отменяет, а не удаляет),
 * Esc — отмена.
 */
export function InlineConfirm({
  mode = 'inline',
  question,
  consequence,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  pending = false,
  className,
}: InlineConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ttlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Самооткат — только у inline: «Точно удалить?» на месте иконки это мусор в строке,
  // если человек передумал и ушёл. Оверлей сам не закрывается намеренно — карточка,
  // исчезающая, пока её читают, хуже той, что ждёт Esc.
  useEffect(() => {
    if (mode !== 'inline') return;
    ttlTimer.current = setTimeout(onCancel, CONFIRM_TTL_MS);
    return () => clearTimeout(ttlTimer.current);
    // onCancel у вызывающих — стабильный `cancel` из useConfirm; пересоздание таймера
    // на каждый рендер родителя продлевало бы TTL бесконечно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Фокус на «Отмена». autoFocus атрибутом не годится: в overlay-режиме карточка
  // монтируется поверх уже сфокусированной кнопки-триггера, и React вернул бы фокус
  // ей же после ре-рендера.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Esc — отмена. В overlay слушаем документ (фокус может уйти на фон), в inline
  // хватает обработчика на обёртке. stopPropagation в обоих: Esc, закрывающий
  // подтверждение, не должен заодно закрыть модалку под ним.
  useEffect(() => {
    if (mode !== 'overlay') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, onCancel]);

  if (mode === 'inline') {
    return (
      <span
        role="alertdialog"
        aria-label={question}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          onCancel();
        }}
        className={cn('inline-flex items-center gap-1', className)}
      >
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="rounded border border-border px-2 py-0.5 text-meta text-red transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {question}
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded border border-border px-2 py-0.5 text-meta text-text-dim transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {cancelLabel}
        </button>
      </span>
    );
  }

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        // Клик по фону = отмена. Безопасное направление, поэтому без второго вопроса.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        data-modal
        role="alertdialog"
        aria-modal="true"
        aria-label={question}
        className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-center elevation-3"
      >
        <p className="text-sm font-medium text-text-main">{question}</p>
        {consequence && <p className="mt-1 text-xs text-text-dim">{consequence}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2 text-sm text-red transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
