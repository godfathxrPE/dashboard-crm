'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateTask } from '@/lib/hooks/use-tasks';
import { useInvalidateTasksByMessage } from '@/lib/hooks/use-tasks-by-message';
import { AssigneeSelect } from '@/components/shared/AssigneeSelect';
import { entityKey, type EntityPart } from '@/lib/utils/entity-links';
import type { EntityTitles } from '@/lib/hooks/use-entity-titles';
import { parseTaskIntent } from '@/lib/utils/task-intent';
import { datetimeLocalToIso, isoToDatetimeLocal } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-CHAT-TASK-1: карточка подтверждения «задача из сообщения».
//
// ⚠️ ЗАДАЧА НИКОГДА НЕ СОЗДАЁТСЯ МОЛЧА (решение 2 спринта). Любой вход — и клик по
//    сообщению, и слэш-команда — заканчивается ЗДЕСЬ: разобранные поля на экране,
//    кнопки «Создать» / «Отмена». Ложная задача из болтовни дискредитирует фичу
//    быстрее, чем её отсутствие.
//
// ⚠️ ПАНЕЛЬ, А НЕ МОДАЛКА. Сообщение-источник обязано остаться на экране: человек
//    сверяет разобранное с тем, что написано. Карточка живёт между лентой и композером —
//    одно место для обоих входов (у слэш-команды сообщения ещё нет и якорить не к чему).
//
// ⚠️ СУЩНОСТЬ БЕРЁТСЯ ТОЛЬКО ИЗ ЧИПА (решение 1). «Ориент» в тексте может значить
//    «Ориент Продактс», «Пресейл Ориент» или ничего — гадать по имени мы не будем.
//    Чип из 1e — уже провалидированная ссылка с id. Чипов нет → «без привязки», и это
//    видно явно.
// ═══════════════════════════════════════════════════════

/** Читаемый момент по МСК — таймзона браузера может быть любой (решение спринта). */
const MSK_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

const ENTITY_LABELS: Record<EntityPart['entityType'], string> = {
  deal: 'Сделка',
  project: 'Внедрение',
  company: 'Компания',
  contact: 'Контакт',
};

/** Код ошибки PostgREST без `any`: payload внешний, разбираем через guard. */
function pgErrorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const code = (err as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

export interface TaskFromMessageCardProps {
  /** Тело для разбора: сообщение целиком либо остаток строки после `/задача`. */
  body: string;
  /**
   * Сообщение-источник. `null` у слэш-команды: сообщения ещё нет, значит нет и ключа
   * идемпотентности — такую задачу от дубля защищает только человек перед экраном.
   */
  sourceMessageId: string | null;
  /** Чипы, найденные в теле (`entityRefsOf(parseEntityLinks(...))`). */
  entityRefs: EntityPart[];
  /** Названия чипов. Чип без названия невидим по RLS — в привязку не предлагаем. */
  entityTitles: EntityTitles;
  /** Дефолтный исполнитель — АВТОР сообщения, а не нажавший (решение 6). */
  defaultAssigneeId: string | null;
  onClose: () => void;
}

export function TaskFromMessageCard({
  body,
  sourceMessageId,
  entityRefs,
  entityTitles,
  defaultAssigneeId,
  onClose,
}: TaskFromMessageCardProps) {
  const router = useRouter();
  const createTask = useCreateTask();
  const invalidateByMessage = useInvalidateTasksByMessage();

  // Разбор считается ОДИН раз на открытие карточки: пересчёт на каждый рендер затирал
  // бы правки человека (и «сегодня» переползало бы через полночь прямо под курсором).
  const intent = useMemo(() => parseTaskIntent(body), [body]);

  const [text, setText] = useState(intent.text);
  const [deadlineLocal, setDeadlineLocal] = useState(isoToDatetimeLocal(intent.deadline) ?? '');
  const [assigneeId, setAssigneeId] = useState<string | null>(defaultAssigneeId);

  // Привязку предлагаем только по тем чипам, чьи названия RLS реально отдала: вести
  // задачу на сущность, которой человек не видит, — обещание, которого мы не сдержим.
  const links = useMemo(() => {
    const seen = new Set<string>();
    return entityRefs.filter((r) => {
      const key = entityKey(r.entityType, r.id);
      if (seen.has(key) || !entityTitles.get(key)) return false;
      seen.add(key);
      return true;
    });
  }, [entityRefs, entityTitles]);

  // `null` — человек выбор не трогал, берём первый доступный чип. Именно производной,
  // а не начальным состоянием: названия чипов приезжают отдельным запросом и на момент
  // открытия карточки могут ещё грузиться — зафиксированный при монтировании дефолт
  // остался бы «без привязки» навсегда.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const linkKey = pickedKey ?? (links[0] ? entityKey(links[0].entityType, links[0].id) : '');
  const link = links.find((r) => entityKey(r.entityType, r.id) === linkKey) ?? null;

  const deadlineIso = datetimeLocalToIso(deadlineLocal || null);
  const canCreate = text.trim().length > 0 && !createTask.isPending;

  function handleCreate() {
    if (!canCreate) return;
    createTask.mutate(
      {
        text: text.trim(),
        deadline: deadlineIso,
        assigned_to: assigneeId,
        source_message_id: sourceMessageId,
        // Ровно ОДНА связь по типу чипа. `column_id` не передаём — резолвит
        // trg_aa_resolve_board; `lane`/`priority` берут дефолты БД.
        project_id: link && (link.entityType === 'deal' || link.entityType === 'project') ? link.id : null,
        company_id: link?.entityType === 'company' ? link.id : null,
        contact_id: link?.entityType === 'contact' ? link.id : null,
      },
      {
        onSuccess: () => {
          invalidateByMessage();
          toast.success('Задача создана', {
            // `?who=all` не для красоты: на /tasks по умолчанию стоит фильтр «мои», а
            // исполнитель здесь — автор сообщения, то есть чаще всего НЕ открывающий.
            action: { label: 'Открыть', onClick: () => router.push('/tasks?who=all') },
          });
          onClose();
        },
        onError: (err) => {
          // 23505 — uq_tasks_source_message: задача по этому сообщению уже есть, просто
          // читателю она не видна по RLS (создал и назначил её кто-то другой).
          if (pgErrorCode(err) === '23505') {
            invalidateByMessage();
            toast.error('По этому сообщению задача уже создана');
            onClose();
            return;
          }
          toast.error('Не удалось создать задачу');
        },
      },
    );
  }

  return (
    <div className="mb-2 shrink-0 rounded-[var(--radius-m)] border border-accent/40 bg-surface p-3 shadow-[var(--shadow-sm)]">
      <div className="mb-2 flex items-center gap-2">
        <ListPlus size={14} className="text-accent" aria-hidden="true" />
        <span className="text-xs font-semibold text-text-main">Задача из сообщения</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="ml-auto rounded p-0.5 text-text-mute transition-colors hover:text-text-main"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-meta text-text-mute">Задача</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            maxLength={500}
            placeholder="Что надо сделать"
            className="rounded-lg border border-input bg-bg px-2 py-1.5 text-sm text-text-main
                       focus:border-accent focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-meta text-text-mute">Срок</span>
          <input
            type="datetime-local"
            value={deadlineLocal}
            onChange={(e) => setDeadlineLocal(e.target.value)}
            className="rounded-lg border border-input bg-bg px-2 py-1.5 text-sm text-text-main
                       focus:border-accent focus:outline-none"
          />
          {/*
            Поле datetime-local показывает ЛОКАЛЬНОЕ время браузера (конвенция проекта —
            та же пара isoToDatetimeLocal/datetimeLocalToIso, что в TaskModal), а разбор
            считался в МСК. Для человека вне МСК это разные числа, поэтому итог дублируем
            явно с пометкой «МСК» — иначе он увидит 13:00 там, где договаривались на 15:00.
          */}
          {deadlineIso ? (
            <span className="text-meta text-text-mute">
              {MSK_FMT.format(new Date(deadlineIso))} МСК
              {intent.matchedDatePhrase && ` · распознано: «${intent.matchedDatePhrase}»`}
            </span>
          ) : (
            <span className="text-meta text-text-mute">Без срока</span>
          )}
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-meta text-text-mute">Привязка</span>
          {links.length === 0 ? (
            <span className="rounded-lg border border-dashed border-border px-2 py-1.5 text-sm text-text-mute">
              Без привязки — в сообщении нет ссылки на карточку
            </span>
          ) : (
            <select
              value={linkKey}
              onChange={(e) => setPickedKey(e.target.value)}
              aria-label="К чему привязать задачу"
              className="rounded-lg border border-input bg-bg px-2 py-1.5 text-sm text-text-main
                         focus:border-accent focus:outline-none"
            >
              {links.map((r) => {
                const key = entityKey(r.entityType, r.id);
                return (
                  <option key={key} value={key}>
                    {ENTITY_LABELS[r.entityType]}: {entityTitles.get(key)}
                  </option>
                );
              })}
              <option value="">Без привязки</option>
            </select>
          )}
        </div>

        <AssigneeSelect
          value={assigneeId}
          onChange={setAssigneeId}
          label="Исполнитель"
          disabled={createTask.isPending}
        />

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity
                       hover:opacity-90 disabled:opacity-40"
          >
            {createTask.isPending ? 'Создаём…' : 'Создать'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-text-mute transition-colors hover:text-text-main"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Ссылка «задача создана» — заменяет иконку «в задачу» у сообщения, из которого задача
 * уже родилась (решение 5: одно сообщение → одна задача, повторный клик ведёт К НЕЙ,
 * а не открывает вторую форму).
 *
 * Ведёт на `/tasks?who=all` — точечного deep-link на задачу в проекте нет, а фильтр
 * «мои» по умолчанию скрыл бы задачу, назначенную автору сообщения.
 */
export function TaskCreatedLink({ taskText }: { taskText: string }) {
  return (
    <Link
      href="/tasks?who=all"
      title={`Задача создана: ${taskText}`}
      aria-label={`Задача создана: ${taskText}`}
      className="rounded p-0.5 text-accent transition-colors hover:text-text-main"
    >
      <ListPlus size={12} />
    </Link>
  );
}
